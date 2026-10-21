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
let writes;
let rotation;
let handleTextMessage;
let handlePostback;

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

  async eval(script, keys, args) {
    if (script.includes("rotationAnchor")) {
      const eventId = args[2];
      if (eventId && storage.has(keys[1])) {
        return JSON.stringify({ status: "duplicate" });
      }
      if (writeError) throw writeError;
      writes++;
      const db = JSON.parse(storage.get(keys[0]) || '{"weeks":{},"todos":[],"nextTodoId":1}');
      const week = db.weeks[args[0]] || JSON.parse(args[3]);
      const group = JSON.parse(args[4]);
      week.groupIndex = Number(args[1]);
      week.groupName = group.name;
      week.members = group.members;
      db.weeks[args[0]] = week;
      db.rotationAnchor = { weekKey: args[0], groupIndex: Number(args[1]) };
      storage.set(keys[0], JSON.stringify(db));
      if (eventId) storage.set(keys[1], "1");
      return JSON.stringify({ status: "switched", week });
    }
    if (script.includes("applyChanges")) {
      if (writeError) throw writeError;
      writes++;
      const state = JSON.parse(storage.get(keys[0]) || "{}");
      const original = JSON.parse(args[0]);
      const updated = JSON.parse(args[1]);
      const applyChanges = (current, before, after) => {
        for (const key of new Set([...Object.keys(before), ...Object.keys(after)])) {
          if (isDeepStrictEqual(before[key], after[key])) continue;
          if (!Object.prototype.hasOwnProperty.call(after, key)) {
            delete current[key];
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
      storage.set(keys[0], JSON.stringify(state));
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
      return "測試室友";
    },
    async pushToGroup(messages) {
      if (pushError) throw pushError;
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
  writes = 0;
  loadApplication();
});

after(() => {
  mock.restoreAll();
  require.cache[redisPath].exports = redisModule;
  if (originalLineClient) require.cache[lineClientPath] = originalLineClient;
  else delete require.cache[lineClientPath];
});

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
  assert.deepEqual(state.todos, []);
  assert.equal(state.nextTodoId, 1);
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
