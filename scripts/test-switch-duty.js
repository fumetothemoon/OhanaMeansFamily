const assert = require("node:assert/strict");
const { isDeepStrictEqual } = require("node:util");
const { test, beforeEach, after, mock } = require("node:test");
const dayjs = require("dayjs");
const config = require("../config");

const storage = new Map();
const replies = [];
const pushes = [];
const stateKey = "OhanaMeansFamily:state";
let readError;
let writeError;
let replyError;
let pushError;
let failNextPush;
let pushAttempts;
let displayNameOverride;
let writes;
let rotation;
let handleTextMessage;
let handlePostback;

const householdGroupId = "Cfixturehousehold";
const memberIdsKey = "OhanaMeansFamily:memberIds";

class FakeRedis {
  async get(key) {
    if (readError) throw readError;
    const value = storage.get(key);
    return value === undefined ? null : JSON.parse(value);
  }

  async set(key, value) {
    if (writeError) throw writeError;
    writes++;
    storage.set(key, JSON.stringify(value));
  }

  async hget(key, field) {
    return JSON.parse(storage.get(`${key}:${field}`) || "null");
  }

  async hset(key, kv) {
    if (writeError) throw writeError;
    writes++;
    const current = JSON.parse(storage.get(key) || "{}");
    if (!kv || typeof kv !== "object" || Array.isArray(kv)) {
      throw new Error("hset requires a field map");
    }
    Object.assign(current, kv);
    storage.set(key, JSON.stringify(current));
    return 1;
  }

  async hgetall(key) {
    if (readError) throw readError;
    const raw = storage.get(key);
    if (raw === undefined) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    return parsed;
  }

  async eval(script, keys, args) {
    if (script.includes("local expectedAnchor = cjson.decode(ARGV[2])")) {
      if (writeError) throw writeError;
      writes++;
      const state = JSON.parse(storage.get(keys[0]) || "{}");
      const week = state.weeks?.[args[0]];
      if (!week) return null;
      const expectedAnchor = JSON.parse(args[1]);
      const currentAnchor = state.rotationAnchor;
      if (
        (expectedAnchor === null && currentAnchor !== undefined) ||
        (expectedAnchor !== null &&
          (!currentAnchor ||
            currentAnchor.weekKey !== expectedAnchor.weekKey ||
            currentAnchor.groupIndex !== expectedAnchor.groupIndex))
      ) {
        return JSON.stringify(week);
      }
      const group = JSON.parse(args[2]);
      week.groupIndex = Number(group.index);
      week.groupName = group.name;
      week.members = group.members;
      storage.set(keys[0], luaJsonStringify(state));
      return JSON.stringify(week);
    }
    if (script.includes("db.weeks[ARGV[1]] = cjson.decode(ARGV[2])")) {
      if (writeError) throw writeError;
      writes++;
      const state = JSON.parse(storage.get(keys[0]) || '{"weeks":{},"todos":[],"nextTodoId":1}');
      state.weeks = state.weeks || {};
      if (!state.weeks[args[0]]) {
        state.weeks[args[0]] = JSON.parse(args[1]);
        storage.set(keys[0], luaJsonStringify(state));
      }
      return JSON.stringify(state.weeks[args[0]]);
    }
    if (script.includes('event.deliveryStatus = "delivered"')) {
      if (writeError) throw writeError;
      writes++;
      const raw = storage.get(keys[1]);
      if (!raw || raw === "1") return 0;
      const event = JSON.parse(raw);
      event.deliveryStatus = "delivered";
      storage.set(keys[1], JSON.stringify(event));
      return 1;
    }
    if (script.includes("db.rotationAnchor = { weekKey = ARGV[1], groupIndex = tonumber(ARGV[2]) }")) {
      const eventId = args[2];
      const previousEvent = eventId && storage.get(keys[1]);
      if (previousEvent) {
        if (previousEvent === "1") return JSON.stringify({ status: "delivered" });
        const previous = JSON.parse(previousEvent);
        return JSON.stringify({
          status: previous.deliveryStatus === "delivered" ? "delivered" : "pending",
          ...(previous.deliveryStatus === "delivered" ? {} : { week: previous.week }),
        });
      }
      if (writeError) throw writeError;
      writes++;
      const db = JSON.parse(storage.get(keys[0]) || '{"weeks":{},"todos":[],"nextTodoId":1}');
      const weekWasMissing = db.weeks[args[0]] === undefined;
      const week = db.weeks[args[0]] || JSON.parse(args[3]);
      const group = JSON.parse(args[4]);
      const anchor = db.rotationAnchor;
      const rotationChanged = weekWasMissing ||
        week.groupIndex !== Number(args[1]) ||
        week.groupName !== group.name ||
        !anchor ||
        anchor.weekKey !== args[0] ||
        Number(anchor.groupIndex) !== Number(args[1]);
      week.groupIndex = Number(args[1]);
      week.groupName = group.name;
      week.members = group.members;
      db.weeks[args[0]] = week;
      db.rotationAnchor = { weekKey: args[0], groupIndex: Number(args[1]) };
      if (rotationChanged) db.rotationVersion = (Number(db.rotationVersion) || 0) + 1;
      storage.set(keys[0], luaJsonStringify(db));
      if (eventId) {
        storage.set(keys[1], JSON.stringify({ deliveryStatus: "pending", week }));
      }
      return JSON.stringify({ status: "switched", week });
    }
    if (script.includes("applyChanges")) {
      if (writeError) throw writeError;
      writes++;
      const original = JSON.parse(args[0]);
      const updated = JSON.parse(args[1]);
      // Match UPDATE_DB_SCRIPT: a missing key starts from the read snapshot.
      // 與 UPDATE_DB_SCRIPT 一致：鍵不存在時從讀取時的快照開始合併。
      const raw = storage.get(keys[0]);
      const state = raw === undefined ? structuredClone(original) : JSON.parse(raw);
      const rotationChanged = state.rotationVersion !== original.rotationVersion;
      const applyChanges = (current, before, after) => {
        for (const key of new Set([...Object.keys(before), ...Object.keys(after)])) {
          if (
            rotationChanged &&
            ["rotationAnchor", "rotationVersion", "groupIndex", "groupName", "members"].includes(key)
          ) continue;
          if (isDeepStrictEqual(before[key], after[key])) continue;
          if (!Object.prototype.hasOwnProperty.call(after, key)) {
            delete current[key];
          } else if (
            (Array.isArray(before[key]) &&
              (before[key].length
                ? before[key][0]?.id !== undefined
                : Array.isArray(after[key]) && after[key][0]?.id !== undefined)) ||
            (Array.isArray(after[key]) &&
              (after[key].length
                ? after[key][0]?.id !== undefined
                : Array.isArray(before[key]) && before[key][0]?.id !== undefined))
          ) {
            const latest = Array.isArray(current[key]) ? current[key] : [];
            const latestById = new Map(latest.map((item) => [item.id, item]));
            const beforeById = new Map(before[key].map((item) => [item.id, item]));
            const afterById = new Map(after[key].map((item) => [item.id, item]));
            const merged = [];
            const included = new Set();
            for (const item of after[key]) {
              const currentItem = latestById.get(item.id);
              const originalItem = beforeById.get(item.id);
              if (currentItem && originalItem) {
                applyChanges(currentItem, originalItem, item);
                merged.push(currentItem);
              } else {
                merged.push(currentItem || structuredClone(item));
              }
              included.add(item.id);
            }
            for (const item of latest) {
              if (!beforeById.has(item.id) && !included.has(item.id)) {
                merged.push(item);
                included.add(item.id);
              } else if (
                beforeById.has(item.id) &&
                !afterById.has(item.id) &&
                !isDeepStrictEqual(item, beforeById.get(item.id))
              ) {
                merged.push(item);
              }
            }
            current[key] = merged;
          } else if (
            before[key] &&
            after[key] &&
            typeof before[key] === "object" &&
            typeof after[key] === "object" &&
            !Array.isArray(before[key]) &&
            !Array.isArray(after[key])
          ) {
            if (!current[key] || typeof current[key] !== "object" || Array.isArray(current[key])) {
              current[key] = {};
            }
            applyChanges(current[key], before[key], after[key]);
          } else {
            current[key] = structuredClone(after[key]);
          }
        }
      };
      applyChanges(state, original, updated);
      storage.set(keys[0], luaJsonStringify(state));
      return "OK";
    }
    const key = `${keys[1]}:${args[0]}`;
    if (script.includes("HDEL")) {
      storage.delete(key);
      return;
    }
    const state = JSON.parse(storage.get(key) || '{"checklist":{}}');
    if (args[2] === "checklist") state.checklist[args[1]] = true;
    if (args[2] === "allDone") state.allDoneDelivered = true;
    storage.set(key, JSON.stringify(state));
  }
}

function luaJsonStringify(value) {
  const encode = (item) => {
    if (Array.isArray(item)) {
      return item.length ? item.map(encode) : {};
    }
    if (item && typeof item === "object") {
      return Object.fromEntries(Object.entries(item).map(([key, nested]) => [key, encode(nested)]));
    }
    return item;
  };
  return JSON.stringify(encode(value));
}

const redisPath = require.resolve("@upstash/redis");
const redisModule = require(redisPath);
require.cache[redisPath].exports = { ...redisModule, Redis: FakeRedis };
const lineClientPath = require.resolve("../lib/lineClient");
const originalLineClient = require.cache[lineClientPath];
require.cache[lineClientPath] = {
  id: lineClientPath,
  filename: lineClientPath,
  loaded: true,
  exports: {
    client: {
      async replyMessage(payload) {
        if (replyError) throw replyError;
        replies.push(structuredClone(payload));
      },
    },
    async getDisplayName() {
      return displayNameOverride;
    },
    async pushToGroup(messages) {
      pushAttempts += 1;
      if (pushError) throw pushError;
      if (failNextPush) {
        failNextPush = false;
        throw new Error("mentionee is not in the group");
      }
      pushes.push(structuredClone(Array.isArray(messages) ? messages : [messages]));
    },
  },
};

function loadApplication() {
  for (const path of [
    "../lib/db",
    "../lib/rotation",
    "../handlers/commands",
    "../handlers/postback",
    "../lib/reminders",
  ]) {
    delete require.cache[require.resolve(path)];
  }
  rotation = require("../lib/rotation");
  ({ handleTextMessage } = require("../handlers/commands"));
  ({ handlePostback } = require("../handlers/postback"));
}

function savedState() {
  return JSON.parse(storage.get(stateKey));
}

function event(data = {}) {
  return {
    source: { type: "group", groupId: "test-group", userId: "test-user" },
    replyToken: "test-reply-token",
    ...data,
  };
}

function pick(groupIndex, weekKey = rotation.getWeekKey(), webhookEventId) {
  return event({
    ...(webhookEventId ? { webhookEventId } : {}),
    postback: { data: `action=switch-duty&week=${weekKey}&group=${groupIndex}` },
  });
}

async function command(text) {
  await handleTextMessage(event({ message: { type: "text", text } }));
  return replies.at(-1).messages;
}

const savedGroupId = config.GROUP_ID;
const savedMemberUserIds = config.MEMBER_USER_IDS;

beforeEach(() => {
  mock.restoreAll();
  storage.clear();
  storage.set(stateKey, JSON.stringify({
    weeks: {},
    todos: [{ id: 1, text: "keep this todo", done: false }],
    nextTodoId: 2,
  }));
  replies.length = 0;
  pushes.length = 0;
  readError = null;
  writeError = null;
  replyError = null;
  pushError = null;
  failNextPush = false;
  pushAttempts = 0;
  displayNameOverride = "測試室友";
  writes = 0;
  config.GROUP_ID = householdGroupId;
  config.MEMBER_USER_IDS = {};
  loadApplication();
});

after(() => {
  mock.restoreAll();
  config.GROUP_ID = savedGroupId;
  config.MEMBER_USER_IDS = savedMemberUserIds;
  require.cache[redisPath].exports = redisModule;
  if (originalLineClient) require.cache[lineClientPath] = originalLineClient;
  else delete require.cache[lineClientPath];
});

function seedMemberIds(memberIds) {
  storage.set(memberIdsKey, JSON.stringify(memberIds));
}

function storedMemberIds() {
  const raw = storage.get(memberIdsKey);
  return raw ? JSON.parse(raw) : {};
}

// Complete the last open chore of an anchored week and return the all-done push.
// groupIndex is the anchor for weekKey, so the next group is the following week.
// 完成某個已定錨週別的最後一項工作，並回傳全部完成的推播。
// groupIndex 是該 weekKey 的輪值錨點，下一組就是再下一週。
async function finishAnchoredWeek(groupIndex, memberIds = {}, weeksBack = 2) {
  const weekKey = dayjs(rotation.getWeekKey()).subtract(weeksBack, "week").format("YYYY-MM-DD");
  const state = savedState();
  state.rotationAnchor = { weekKey, groupIndex };
  storage.set(stateKey, JSON.stringify(state));
  await rotation.getOrCreateWeekState(weekKey);
  for (let taskId = 0; taskId < config.DUTY_TASKS.length - 1; taskId += 1) {
    await rotation.markTaskDone(weekKey, taskId, "測試室友");
  }
  seedMemberIds(memberIds);
  pushes.length = 0;
  pushAttempts = 0;
  const lastId = config.DUTY_TASKS.length - 1;
  await handlePostback(event({
    postback: { data: `action=done&week=${weekKey}&task=${lastId}` },
  }));
  return {
    weekKey,
    nextWeekKey: dayjs(weekKey).add(7, "day").format("YYYY-MM-DD"),
    message: pushes.at(-1) ? pushes.at(-1)[0] : null,
  };
}

test("legacy state uses the configured rotation without writing an anchor", async () => {
  for (let index = 0; index < 6; index++) {
    const weekKey = dayjs(config.ROTATION_START_MONDAY)
      .add(index, "week").format("YYYY-MM-DD");
    assert.equal((await rotation.getGroupForWeek(weekKey)).index, index % 3);
  }
  assert.equal(savedState().rotationAnchor, undefined);
  assert.equal(writes, 0);
});

test("a switch initializes an empty database without requiring a prior status command", async () => {
  storage.delete(stateKey);
  await handlePostback(pick(1));
  const state = savedState();
  const week = state.weeks[rotation.getWeekKey()];
  assert.equal(week.groupIndex, 1);
  assert.equal(week.tasks.length, config.DUTY_TASKS.length);
  assert.ok(week.tasks.every((task) => !task.done));
  assert.deepEqual(state.todos, {});
  assert.equal(state.nextTodoId, 1);
  const { readDb } = require("../lib/db");
  assert.deepEqual((await readDb()).todos, []);
  assert.match((await command("/todo"))[0].text, /待辦清單是空的/);
});

test("a new week selector uses the previous persisted anchor, not just config", async () => {
  const weekKey = rotation.getWeekKey();
  const state = savedState();
  const configuredGroup = await rotation.getGroupForWeek(weekKey);
  state.rotationAnchor = {
    weekKey: dayjs(weekKey).subtract(1, "week").format("YYYY-MM-DD"),
    groupIndex: configuredGroup.index,
  };
  storage.set(stateKey, JSON.stringify(state));
  const expectedIndex = (configuredGroup.index + 1) % config.ROTATION_GROUPS.length;
  const messages = await command("/switch-duty");
  const rows = messages[0].contents.body.contents.slice(1, -1);
  assert.ok(rows[expectedIndex].contents[0].text.includes("目前"));
  assert.equal(savedState().weeks[weekKey].groupIndex, expectedIndex);
  await handlePostback(pick(expectedIndex));
  assert.match(replies.at(-1).messages[0].text, /輪值已切換/);
  assert.deepEqual(savedState().rotationAnchor, { weekKey, groupIndex: expectedIndex });
});

test("both commands list all groups and members and mark only the saved current group", async () => {
  const weekKey = rotation.getWeekKey();
  await rotation.switchWeekGroup(weekKey, 0);
  for (const text of ["/switch-duty", "/換班"]) {
    const messages = await command(text);
    assert.equal(messages.length, 1);
    assert.equal(messages[0].type, "flex");
    const rows = messages[0].contents.body.contents.slice(1, -1);
    assert.equal(rows.length, config.ROTATION_GROUPS.length);
    rows.forEach((row, index) => {
      const label = row.contents[0].text;
      assert.ok(label.includes(config.ROTATION_GROUPS[index].name));
      for (const member of config.ROTATION_GROUPS[index].members) {
        assert.ok(label.includes(member));
      }
      assert.equal(label.includes("目前"), index === 0);
      assert.equal(
        row.contents[1].action.data,
        `action=switch-duty&week=${weekKey}&group=${index}`,
      );
    });
  }
});

test("switching confirms the actor and group and includes the live duty checklist", async () => {
  await handlePostback(pick(1));
  const messages = replies[0].messages;
  assert.equal(messages.length, 2);
  assert.match(messages[0].text, /輪值已切換 turn has changed/);
  assert.ok(messages[0].text.includes("測試室友"));
  assert.ok(messages[0].text.includes(config.ROTATION_GROUPS[1].name));
  assert.ok(messages[0].text.includes(config.ROTATION_GROUPS[1].members.join("、")));
  const status = await command("/狀態");
  assert.deepEqual(messages[1], status[0]);
  assert.equal(savedState().weeks[rotation.getWeekKey()].groupIndex, 1);
});

test("switching preserves tasks, completion authors, timestamps, todos, and notification state", async () => {
  const weekKey = rotation.getWeekKey();
  await rotation.getOrCreateWeekState(weekKey);
  await rotation.markTaskDone(weekKey, 0, "原完成者");
  await rotation.markNotificationDelivered(weekKey, 0, "checklist");
  const before = savedState();
  const notifications = storage.get(`OhanaMeansFamily:notifications:${weekKey}`);
  await handlePostback(pick(1));
  const afterState = savedState();
  assert.deepEqual(afterState.weeks[weekKey].tasks, before.weeks[weekKey].tasks);
  assert.equal(afterState.weeks[weekKey].tasks[0].doneBy, "原完成者");
  assert.ok(afterState.weeks[weekKey].tasks[0].doneAt);
  assert.deepEqual(afterState.todos, before.todos);
  assert.equal(afterState.nextTodoId, before.nextTodoId);
  assert.equal(storage.get(`OhanaMeansFamily:notifications:${weekKey}`), notifications);
  assert.ok(JSON.stringify(replies[0].messages[1]).includes("原完成者"));
});

test("a week-only first write on an empty database keeps default fields", async () => {
  storage.delete(stateKey);
  const { readDb, writeDb } = require("../lib/db");
  const weekKey = rotation.getWeekKey();
  const db = await readDb();
  db.weeks[weekKey] = {
    groupIndex: 1,
    groupName: config.ROTATION_GROUPS[1].name,
    members: config.ROTATION_GROUPS[1].members,
    tasks: [{ id: 0, label: "倒垃圾", done: false, doneBy: null, doneAt: null }],
  };
  await writeDb(db);

  const saved = savedState();
  assert.equal(saved.weeks[weekKey].groupIndex, 1);
  assert.deepEqual(saved.todos, {});
  assert.equal(saved.nextTodoId, 1);
  const reread = await readDb();
  assert.deepEqual(reread.todos, []);
  assert.equal(reread.nextTodoId, 1);
  assert.equal(reread.weeks[weekKey].groupIndex, 1);
});

test("a todo-only first write on an empty database keeps default fields", async () => {
  storage.delete(stateKey);
  const { readDb, writeDb } = require("../lib/db");
  const db = await readDb();
  db.todos.push({ id: 1, text: "first todo", done: false });
  db.nextTodoId = 2;
  await writeDb(db);

  const saved = savedState();
  assert.deepEqual(saved.weeks, {});
  assert.equal(saved.todos.at(-1).text, "first todo");
  assert.equal(saved.nextTodoId, 2);
  const reread = await readDb();
  assert.deepEqual(reread.weeks, {});
  assert.equal(reread.nextTodoId, 2);
  assert.equal(reread.todos.at(-1).text, "first todo");
});

test("a todo committed before switching is preserved", async () => {
  const { readDb, writeDb } = require("../lib/db");
  const db = await readDb();
  db.todos.push({ id: db.nextTodoId, text: "new todo", done: false });
  db.nextTodoId++;
  await writeDb(db);

  const weekKey = rotation.getWeekKey();
  await rotation.switchWeekGroup(weekKey, 1);

  assert.equal(savedState().todos.at(-1).text, "new todo");
  assert.deepEqual(savedState().rotationAnchor, { weekKey, groupIndex: 1 });
});

test("a stale todo completion preserves a concurrently added todo", async () => {
  const { readDb, writeDb } = require("../lib/db");
  const staleDb = await readDb();
  staleDb.todos[0].done = true;
  staleDb.todos[0].doneBy = "測試室友";

  const current = savedState();
  current.todos.push({
    id: current.nextTodoId,
    text: "concurrent todo",
    done: false,
  });
  current.nextTodoId++;
  storage.set(stateKey, JSON.stringify(current));

  await writeDb(staleDb);

  assert.equal(savedState().todos[0].done, true);
  assert.equal(savedState().todos[1].text, "concurrent todo");
});

test("a stale task-completion write cannot erase a newer rotation anchor", async () => {
  const weekKey = rotation.getWeekKey();
  await rotation.getOrCreateWeekState(weekKey);
  const { readDb, writeDb } = require("../lib/db");
  const staleDb = await readDb();

  await rotation.switchWeekGroup(weekKey, 1);
  Object.assign(staleDb.weeks[weekKey].tasks[0], {
    done: true,
    doneBy: "測試室友",
    doneAt: "2026-10-21 06:00",
  });
  await writeDb(staleDb);

  const state = savedState();
  assert.equal(state.weeks[weekKey].groupIndex, 1);
  assert.equal(state.weeks[weekKey].tasks[0].doneBy, "測試室友");
  assert.deepEqual(state.rotationAnchor, { weekKey, groupIndex: 1 });
});

test("a stale whole-state group update cannot overwrite a newer switch", async () => {
  const weekKey = rotation.getWeekKey();
  await rotation.getOrCreateWeekState(weekKey);
  const { readDb, writeDb } = require("../lib/db");
  const staleDb = await readDb();
  const previousGroup = config.ROTATION_GROUPS[staleDb.weeks[weekKey].groupIndex];

  await rotation.switchWeekGroup(weekKey, 1);
  staleDb.weeks[weekKey].groupIndex = config.ROTATION_GROUPS.indexOf(previousGroup);
  staleDb.weeks[weekKey].groupName = previousGroup.name;
  staleDb.weeks[weekKey].members = previousGroup.members;
  await writeDb(staleDb);

  const state = savedState();
  assert.equal(state.weeks[weekKey].groupIndex, 1);
  assert.deepEqual(state.rotationAnchor, { weekKey, groupIndex: 1 });
});

test("pending week initialization returns the record created by a concurrent switch", async () => {
  const weekKey = rotation.getWeekKey();
  const configuredGroup = await rotation.getGroupForWeek(weekKey);
  await rotation.switchWeekGroup(weekKey, 1);

  const { createWeekIfMissing } = require("../lib/db");
  const week = await createWeekIfMissing(weekKey, {
    groupIndex: configuredGroup.index,
    groupName: configuredGroup.name,
    members: configuredGroup.members,
    tasks: [],
  });

  assert.equal(week.groupIndex, 1);
  assert.equal(savedState().weeks[weekKey].groupIndex, 1);
  assert.equal(savedState().weeks[weekKey].tasks.length, config.DUTY_TASKS.length);
});

test("stale turn-sync cannot replace a concurrent switch", async () => {
  const weekKey = rotation.getWeekKey();
  const staleState = await require("../lib/db").readDb();
  const staleGroup = await rotation.getGroupForWeek(weekKey, staleState);
  await rotation.switchWeekGroup(weekKey, 1);

  const { syncWeekGroupIfAnchorMatches } = require("../lib/db");
  const week = await syncWeekGroupIfAnchorMatches(
    weekKey,
    staleState.rotationAnchor,
    staleGroup,
  );

  assert.equal(week.groupIndex, 1);
  assert.equal(savedState().weeks[weekKey].groupIndex, 1);
  assert.deepEqual(savedState().rotationAnchor, { weekKey, groupIndex: 1 });
});

test("untracked whole-state snapshots cannot overwrite a newer switch", async () => {
  const { readDb, writeDb } = require("../lib/db");
  const staleCopy = { ...(await readDb()) };
  await rotation.switchWeekGroup(rotation.getWeekKey(), 1);

  await assert.rejects(writeDb(staleCopy), /requires state returned by readDb/);
  assert.equal(savedState().weeks[rotation.getWeekKey()].groupIndex, 1);
});

test("current group, previous week's group, and repeated picks all re-anchor consistently", async () => {
  const weekKey = rotation.getWeekKey();
  const currentGroup = await rotation.getGroupForWeek(weekKey);
  for (const index of [currentGroup.index, (currentGroup.index + 2) % 3]) {
    const first = await rotation.switchWeekGroup(weekKey, index);
    const before = savedState();
    const repeated = await rotation.switchWeekGroup(weekKey, index);
    assert.equal(first.status, "switched");
    assert.deepEqual(repeated, first);
    assert.deepEqual(savedState(), before);
    assert.deepEqual(before.rotationAnchor, { weekKey, groupIndex: index });
  }
});

test("concurrent identical picks leave a consistent anchor and week", async () => {
  const weekKey = rotation.getWeekKey();
  const results = await Promise.all([
    rotation.switchWeekGroup(weekKey, 1),
    rotation.switchWeekGroup(weekKey, 1),
  ]);
  assert.deepEqual(results[0], results[1]);
  assert.deepEqual(savedState().rotationAnchor, { weekKey, groupIndex: 1 });
  assert.equal(savedState().weeks[weekKey].groupIndex, 1);
});

test("persisted anchor survives module reloads and drives subsequent weeks and Monday kickoff", async () => {
  const weekKey = rotation.getWeekKey();
  await rotation.switchWeekGroup(weekKey, 1);
  loadApplication();
  for (let offset = 0; offset < 7; offset++) {
    const futureWeek = dayjs(weekKey).add(offset, "week").format("YYYY-MM-DD");
    const expectedIndex = (1 + offset) % 3;
    assert.equal((await rotation.getGroupForWeek(futureWeek)).index, expectedIndex);
  }
  const nextWeek = dayjs(weekKey).add(1, "week").format("YYYY-MM-DD");
  assert.equal(savedState().weeks[nextWeek], undefined);
  mock.method(rotation, "getWeekKey", () => nextWeek);
  const { sendWeeklyKickoff } = require("../lib/reminders");
  await sendWeeklyKickoff();
  const { buildDutyFlex } = require("../lib/messages");
  const nextState = savedState().weeks[nextWeek];
  assert.equal(nextState.groupIndex, 2);
  assert.deepEqual(pushes[0][0], buildDutyFlex({
    title: "🧹 本週值日提醒",
    weekKey: nextWeek,
    groupName: nextState.groupName,
    members: nextState.members,
    tasks: nextState.tasks,
    footerNote: "完成一項就按一下對應的「完成」按鈕即可，做完全部六項就不會再收到提醒囉。",
  }));
});

test("turn-check and turn-sync honor the saved anchor without clearing completion records", async () => {
  const weekKey = rotation.getWeekKey();
  await rotation.switchWeekGroup(weekKey, 1);
  await rotation.markTaskDone(weekKey, 0, "原完成者");
  const tasks = savedState().weeks[weekKey].tasks;
  const messages = await command("/turn-check");
  assert.match(messages[0].text, /✅.*一致/);
  await command("/turn-sync");
  const week = savedState().weeks[weekKey];
  assert.equal(week.groupIndex, 1);
  assert.deepEqual(week.tasks, tasks);
});

test("earlier stored weeks are not changed by a switch", async () => {
  const weekKey = rotation.getWeekKey();
  const previousKey = dayjs(weekKey).subtract(1, "week").format("YYYY-MM-DD");
  const previous = await rotation.getOrCreateWeekState(previousKey);
  await rotation.switchWeekGroup(weekKey, (previous.groupIndex + 1) % 3);
  assert.deepEqual(savedState().weeks[previousKey], previous);
  assert.equal((await rotation.getGroupForWeek(previousKey)).index, previous.groupIndex);
});

test("stale, missing, malformed, and future weeks reply with instructions without writes", async () => {
  const before = savedState();
  for (const weekKey of [
    dayjs(rotation.getWeekKey()).subtract(1, "week").format("YYYY-MM-DD"),
    dayjs(rotation.getWeekKey()).add(1, "week").format("YYYY-MM-DD"),
    "",
    "not-a-week",
    "__proto__",
  ]) {
    await handlePostback(pick(1, weekKey));
    assert.match(replies.at(-1).messages[0].text, /過期.*\/switch-duty/);
  }
  await handlePostback(event({ postback: { data: "action=switch-duty&group=1" } }));
  assert.match(replies.at(-1).messages[0].text, /過期.*\/switch-duty/);
  assert.deepEqual(savedState(), before);
  assert.equal(writes, 0);
});

test("invalid group indices reply with instructions and never write", async () => {
  const before = savedState();
  for (const group of ["", "-1", "3", "999", "1.5", "1e0", "NaN", "Infinity", "abc"]) {
    await handlePostback(pick(group));
    assert.match(replies.at(-1).messages[0].text, /找不到.*\/switch-duty/);
  }
  await handlePostback(event({
    postback: { data: `action=switch-duty&week=${rotation.getWeekKey()}` },
  }));
  assert.match(replies.at(-1).messages[0].text, /找不到.*\/switch-duty/);
  assert.deepEqual(savedState(), before);
  assert.equal(writes, 0);
});

test("group commands and selectors cannot switch duty from a direct message", async () => {
  await handleTextMessage(event({
    source: { type: "user", userId: "test-user" },
    message: { type: "text", text: "/switch-duty" },
  }));
  await handlePostback({ ...pick(1), source: { type: "user", userId: "test-user" } });
  assert.equal(replies.length, 2);
  for (const reply of replies) assert.match(reply.messages[0].text, /請在群組中/);
  assert.equal(writes, 0);
});

test("redelivery of an earlier switch cannot overwrite a newer switch", async () => {
  const weekKey = rotation.getWeekKey();
  const selectionA = pick(0, weekKey, "event-a");
  await handlePostback(selectionA);
  const selectionB = pick(1, weekKey, "event-b");
  await handlePostback(selectionB);
  const stateAfterB = savedState();

  await handlePostback({ ...selectionA, deliveryContext: { isRedelivery: true } });

  assert.deepEqual(savedState(), stateAfterB);
  assert.equal(savedState().weeks[weekKey].groupIndex, 1);
  assert.deepEqual(savedState().rotationAnchor, { weekKey, groupIndex: 1 });
  assert.equal(replies.length, 2);
  assert.equal(pushes.length, 0);
});

test("redelivery retries a pending confirmation without reapplying its switch", async () => {
  const weekKey = rotation.getWeekKey();
  replyError = new Error("Invalid reply token");
  pushError = new Error("Push unavailable");
  mock.method(console, "warn", () => {});
  const firstSelection = pick(0, weekKey, "pending-event");
  await assert.rejects(handlePostback(firstSelection), /Push unavailable/);
  assert.equal(savedState().weeks[weekKey].groupIndex, 0);

  replyError = null;
  pushError = null;
  await rotation.markTaskDone(weekKey, 0, "原完成者");
  await handlePostback(pick(1, weekKey, "newer-event"));
  const stateAfterNewerSwitch = savedState();
  const savedEvent = JSON.parse(storage.get("OhanaMeansFamily:webhook-event:pending-event"));
  assert.equal(savedEvent.week.groupIndex, 0);
  assert.equal(savedEvent.week.tasks[0].done, false);

  await handlePostback({
    ...firstSelection,
    deliveryContext: { isRedelivery: true },
  });

  assert.deepEqual(savedState(), stateAfterNewerSwitch);
  assert.equal(savedState().weeks[weekKey].groupIndex, 1);
  assert.equal(JSON.parse(storage.get("OhanaMeansFamily:webhook-event:pending-event"))
    .deliveryStatus, "delivered");
  const confirmation = pushes.at(-1);
  assert.equal(confirmation.length, 2);
  assert.match(confirmation[0].text, new RegExp(`當時選擇 ${config.ROTATION_GROUPS[0].name}`));
  assert.ok(confirmation[0].text.includes("測試室友"));
  assert.doesNotMatch(confirmation[0].text, /本週值日/);
  assert.doesNotMatch(confirmation[0].text, /之後每週從此組/);
  const status = await command("/狀態");
  assert.deepEqual(confirmation[1], status[0]);
  assert.ok(confirmation[1].altText.includes(config.ROTATION_GROUPS[1].name));
  assert.ok(JSON.stringify(confirmation[1]).includes("原完成者"));
});

test("expired reply tokens use the existing push fallback for both messages", async () => {
  replyError = new Error("Invalid reply token");
  mock.method(console, "warn", () => {});
  await handlePostback(pick(1));
  assert.equal(pushes.length, 1);
  assert.equal(pushes[0].length, 2);
});

test("storage and delivery errors propagate instead of reporting false success", async () => {
  readError = new Error("read failed");
  await assert.rejects(command("/switch-duty"), /read failed/);
  await assert.rejects(rotation.getGroupForWeek(rotation.getWeekKey()), /read failed/);
  readError = null;
  writeError = new Error("write failed");
  await assert.rejects(handlePostback(pick(1)), /write failed/);
  assert.equal(replies.length, 0);
  assert.equal(savedState().rotationAnchor, undefined);
  writeError = null;
  pushError = new Error("push failed");
  await assert.rejects(
    handlePostback({ ...pick(1), deliveryContext: { isRedelivery: true } }),
    /push failed/,
  );
});

test("reset clears completed chores but retains the switched group and anchor", async () => {
  const weekKey = rotation.getWeekKey();
  await rotation.switchWeekGroup(weekKey, 1);
  await rotation.markTaskDone(weekKey, 0, "原完成者");
  await rotation.markNotificationDelivered(weekKey, 0, "checklist");
  const week = await rotation.resetWeek(weekKey);
  assert.equal(week.groupIndex, 1);
  assert.ok(week.tasks.every((task) => !task.done && task.doneBy === null && task.doneAt === null));
  assert.deepEqual(savedState().rotationAnchor, { weekKey, groupIndex: 1 });
  assert.equal(storage.has(`OhanaMeansFamily:notifications:${weekKey}`), false);
});

test("existing completion postbacks remain idempotent after switching", async () => {
  const weekKey = rotation.getWeekKey();
  await rotation.switchWeekGroup(weekKey, 1);
  const completion = event({ postback: { data: `action=done&week=${weekKey}&task=0` } });
  await handlePostback(completion);
  const before = savedState();
  assert.equal(before.weeks[weekKey].tasks[0].doneBy, "測試室友");
  assert.equal(replies.length, 1);
  assert.ok(replies[0].messages[0].altText.includes(config.ROTATION_GROUPS[1].name));
  await handlePostback(completion);
  assert.deepEqual(savedState(), before);
  assert.equal(replies.length, 1);
});

test("unrelated postbacks remain ignored and todo commands still work", async () => {
  await handlePostback(event({ postback: { data: "action=unknown" } }));
  assert.equal(replies.length, 0);
  assert.equal(writes, 0);
  const messages = await command("/todo");
  assert.ok(messages[0].text.includes("keep this todo"));
});

test("all-done textV2 mentions both members of a two-member next group", async () => {
  const jane = "Ufixturejane";
  const fan = "Ufixturefan";
  const result = await finishAnchoredWeek(2, { Jane: jane, 范: fan });
  assert.deepEqual((await rotation.getGroupForWeek(result.nextWeekKey)).members, ["Jane", "范"]);
  assert.deepEqual(result.message, {
    type: "textV2",
    text: "感謝本週值日生的服務🎀下週換{next1}、{next2}接手🙏",
    substitution: {
      next1: { type: "mention", mentionee: { type: "user", userId: jane } },
      next2: { type: "mention", mentionee: { type: "user", userId: fan } },
    },
  });
});

test("all-done textV2 mentions the one member of a one-member next group", async () => {
  const fu = "Ufixturefu";
  const result = await finishAnchoredWeek(0, { 傅: fu });
  assert.deepEqual((await rotation.getGroupForWeek(result.nextWeekKey)).members, ["傅"]);
  assert.deepEqual(result.message, {
    type: "textV2",
    text: "感謝本週值日生的服務🎀下週換{next1}接手🙏",
    substitution: {
      next1: { type: "mention", mentionee: { type: "user", userId: fu } },
    },
  });
});

test("all-done uses a plain name when a next member has no userId", async () => {
  const warnings = [];
  mock.method(console, "warn", (...args) => {
    warnings.push(args.map(String).join(" "));
  });
  const jane = "Ufixturejane";
  const fan = "Ufixturefan";
  const firstOnly = await finishAnchoredWeek(2, { Jane: jane });
  assert.deepEqual(firstOnly.message, {
    type: "textV2",
    text: "感謝本週值日生的服務🎀下週換{next1}、范接手🙏",
    substitution: {
      next1: { type: "mention", mentionee: { type: "user", userId: jane } },
    },
  });

  const secondOnly = await finishAnchoredWeek(2, { 范: fan }, 5);
  assert.deepEqual(secondOnly.message, {
    type: "textV2",
    text: "感謝本週值日生的服務🎀下週換Jane、{next1}接手🙏",
    substitution: {
      next1: { type: "mention", mentionee: { type: "user", userId: fan } },
    },
  });

  const logged = warnings.join("\n");
  assert.match(logged, /mention fallback for 范: no userId for this exact name/);
  assert.match(logged, /mention fallback for Jane: no userId for this exact name/);
  assert.equal(logged.includes(jane), false);
  assert.equal(logged.includes(fan), false);
  assert.equal(logged.includes("test-user"), false);
});

test("all-done is plain text when nobody in the next group has a userId", async () => {
  const warnings = [];
  mock.method(console, "warn", (...args) => {
    warnings.push(args.map(String).join(" "));
  });
  const result = await finishAnchoredWeek(2, {});
  assert.deepEqual((await rotation.getGroupForWeek(result.nextWeekKey)).members, ["Jane", "范"]);
  assert.deepEqual(result.message, {
    type: "text",
    text: "感謝本週值日生的服務🎀下週換Jane、范接手🙏",
  });
  assert.equal(Object.prototype.hasOwnProperty.call(result.message, "substitution"), false);
  const logged = warnings.join("\n");
  assert.match(logged, /mention fallback for Jane: no userId for this exact name/);
  assert.match(logged, /mention fallback for 范: no userId for this exact name/);
  assert.equal(logged.includes("Ufixture"), false);
});

test("config MEMBER_USER_IDS overrides the memberIds hash", async () => {
  const hashId = "Ufixturehash";
  const overrideId = "Ufixtureconfig";
  config.MEMBER_USER_IDS = { 傅: overrideId };
  const result = await finishAnchoredWeek(0, { 傅: hashId });
  assert.deepEqual(result.message, {
    type: "textV2",
    text: "感謝本週值日生的服務🎀下週換{next1}接手🙏",
    substitution: {
      next1: { type: "mention", mentionee: { type: "user", userId: overrideId } },
    },
  });
  assert.equal(JSON.stringify(result.message).includes(hashId), false);
});

test("all-done mentions the group for the completed weekKey plus seven days", async () => {
  const todayKey = rotation.getWeekKey();
  const result = await finishAnchoredWeek(0, { 傅: "Ufixturefu" });
  const todayMembers = (await rotation.getGroupForWeek(todayKey)).members;
  const todayNextMembers = (await rotation.getGroupForWeek(
    dayjs(todayKey).add(7, "day").format("YYYY-MM-DD"),
  )).members;
  const completedNextMembers = (await rotation.getGroupForWeek(result.nextWeekKey)).members;
  assert.notEqual(result.weekKey, todayKey);
  assert.equal(result.nextWeekKey, dayjs(result.weekKey).add(7, "day").format("YYYY-MM-DD"));
  assert.deepEqual(completedNextMembers, ["傅"]);
  assert.notDeepEqual(completedNextMembers, todayMembers);
  assert.notDeepEqual(completedNextMembers, todayNextMembers);
  assert.deepEqual(result.message, {
    type: "textV2",
    text: "感謝本週值日生的服務🎀下週換{next1}接手🙏",
    substitution: {
      next1: { type: "mention", mentionee: { type: "user", userId: "Ufixturefu" } },
    },
  });
  assert.equal(result.message.text.includes("Jane"), false);
  assert.equal(result.message.text.includes("Jean"), false);
  assert.equal(result.message.text.includes("升"), false);
});

test("member id lookup is an exact name match", async () => {
  const warnings = [];
  mock.method(console, "warn", (...args) => {
    warnings.push(args.map(String).join(" "));
  });
  const result = await finishAnchoredWeek(0, { fu: "Ufixturefu", "傅 ": "Ufixturespace" });
  assert.deepEqual(result.message, {
    type: "text",
    text: "感謝本週值日生的服務🎀下週換傅接手🙏",
  });
  const logged = warnings.join("\n");
  assert.match(logged, /mention fallback for 傅: no userId for this exact name/);
  assert.equal(logged.includes("Ufixture"), false);
});

test("/ids in the household group lists stored name and userId lines", async () => {
  seedMemberIds({ Jane: "Ufixturejane", 傅: "Ufixturefu" });
  displayNameOverride = "升";
  await handleTextMessage(event({
    source: { type: "group", groupId: householdGroupId, userId: "Ufixturesheng" },
    message: { type: "text", text: "/ids" },
  }));
  assert.equal(replies.at(-1).messages[0].text, [
    "Jane: Ufixturejane",
    "傅: Ufixturefu",
    "升: Ufixturesheng",
  ].join("\n"));
  assert.equal(storedMemberIds()["升"], "Ufixturesheng");
});

test("/ids reports when no member ids are stored yet", async () => {
  displayNameOverride = null;
  await handleTextMessage(event({
    source: { type: "group", groupId: householdGroupId },
    message: { type: "text", text: "/ids" },
  }));
  assert.equal(replies.at(-1).messages[0].text, "目前還沒有儲存任何成員 ID。");
  assert.deepEqual(storedMemberIds(), {});
});

test("/ids in a 1:1 chat does not list ids", async () => {
  seedMemberIds({ Jane: "Ufixturejane" });
  await handleTextMessage(event({
    source: { type: "user", userId: "Ufixturesender" },
    message: { type: "text", text: "/ids" },
  }));
  const text = replies.at(-1).messages[0].text;
  assert.match(text, /請在群組中輸入 \/ids/);
  assert.equal(text.includes("Ufixturejane"), false);
  assert.equal(text.includes("Ufixturesender"), false);
  assert.deepEqual(storedMemberIds(), { Jane: "Ufixturejane" });
});

test("/ids in another group does not list ids", async () => {
  seedMemberIds({ Jane: "Ufixturejane" });
  displayNameOverride = "Other";
  await handleTextMessage(event({
    source: { type: "group", groupId: "Cfixtureother", userId: "Ufixtureother" },
    message: { type: "text", text: "/ids" },
  }));
  const text = replies.at(-1).messages[0].text;
  assert.match(text, /請在群組中輸入 \/ids/);
  assert.equal(text.includes("Ufixturejane"), false);
  assert.equal(text.includes("Ufixtureother"), false);
  assert.equal(text.includes("Other"), false);
  assert.deepEqual(storedMemberIds(), { Jane: "Ufixturejane" });
});

test("household group slash commands store the sender userId", async () => {
  displayNameOverride = "Jean";
  await handleTextMessage(event({
    source: { type: "group", groupId: householdGroupId, userId: "Ufixturejean" },
    message: { type: "text", text: "/狀態" },
  }));
  assert.equal(storedMemberIds().Jean, "Ufixturejean");
});

test("tapping 完成 stores the sender display name and userId", async () => {
  const weekKey = rotation.getWeekKey();
  await rotation.getOrCreateWeekState(weekKey);
  displayNameOverride = "傅";
  await handlePostback(event({
    source: { type: "group", groupId: "test-group", userId: "Ufixturefu" },
    postback: { data: `action=done&week=${weekKey}&task=0` },
  }));
  assert.deepEqual(storedMemberIds(), { 傅: "Ufixturefu" });
  assert.equal(pushes.length, 0);
});

test("a failed mention push is retried once as plain text", async () => {
  const warnings = [];
  mock.method(console, "warn", (...args) => {
    warnings.push(args.map(String).join(" "));
  });
  failNextPush = true;
  const jane = "Ufixturejane";
  const fan = "Ufixturefan";
  const result = await finishAnchoredWeek(2, { Jane: jane, 范: fan });
  assert.equal(pushAttempts, 2);
  assert.equal(pushes.length, 1);
  assert.deepEqual(result.message, {
    type: "text",
    text: "感謝本週值日生的服務🎀下週換Jane、范接手🙏",
  });
  const logged = warnings.join("\n");
  assert.match(logged, /mention push failed \(mentionee is not in the group\); retrying as plain text/);
  assert.equal(logged.includes(jane), false);
  assert.equal(logged.includes(fan), false);
  assert.equal(logged.includes("test-user"), false);
  const saved = JSON.parse(storage.get(`OhanaMeansFamily:notifications:${result.weekKey}`));
  assert.equal(saved.allDoneDelivered, true);

  await handlePostback(event({
    postback: { data: `action=done&week=${result.weekKey}&task=${config.DUTY_TASKS.length - 1}` },
  }));
  assert.equal(pushes.length, 1);
});

test("all-done stays undelivered when the push and the plain-text retry both fail", async () => {
  mock.method(console, "warn", () => {});
  pushError = new Error("push failed");
  const weekKey = dayjs(rotation.getWeekKey()).subtract(2, "week").format("YYYY-MM-DD");
  await assert.rejects(() => finishAnchoredWeek(0, { 傅: "Ufixturefu" }), /push failed/);
  assert.equal(pushAttempts, 2);
  assert.equal(pushes.length, 0);
  const saved = JSON.parse(storage.get(`OhanaMeansFamily:notifications:${weekKey}`) || "{}");
  assert.notEqual(saved.allDoneDelivered, true);

  pushError = null;
  pushes.length = 0;
  pushAttempts = 0;
  await handlePostback(event({
    postback: { data: `action=done&week=${weekKey}&task=${config.DUTY_TASKS.length - 1}` },
  }));
  assert.equal(pushes.length, 1);
  assert.equal(pushes[0][0].type, "textV2");
  const delivered = JSON.parse(storage.get(`OhanaMeansFamily:notifications:${weekKey}`));
  assert.equal(delivered.allDoneDelivered, true);
  await handlePostback(event({
    postback: { data: `action=done&week=${weekKey}&task=${config.DUTY_TASKS.length - 1}` },
  }));
  assert.equal(pushes.length, 1);
});

test("the all-done push is not sent again after it was delivered", async () => {
  const result = await finishAnchoredWeek(0, { 傅: "Ufixturefu" });
  assert.equal(pushes.length, 1);
  assert.equal(result.message.type, "textV2");
  await handlePostback(event({
    postback: { data: `action=done&week=${result.weekKey}&task=${config.DUTY_TASKS.length - 1}` },
  }));
  assert.equal(pushes.length, 1);
  assert.equal(pushAttempts, 1);
});
