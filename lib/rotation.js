const dayjs = require("dayjs");
const config = require("../config");
const {
  readDb,
  writeDb,
  readNotificationState,
  setNotificationDelivered,
  clearNotificationState,
  runAtomic,
} = require("./db");

const SWITCH_WEEK_GROUP_SCRIPT = `
  local webhookEventId = ARGV[3]
  if webhookEventId ~= "" then
    local prior = redis.call("GET", KEYS[2])
    if prior then
      if redis.call("GET", KEYS[3]) then
        return cjson.encode({ status = "delivered" })
      end
      local stored = cjson.decode(prior)
      if type(stored) == "table" and stored.week then
        return cjson.encode({ status = "pending", week = stored.week })
      end
      return cjson.encode({ status = "delivered" })
    end
  end

  local raw = redis.call("GET", KEYS[1])
  local db = raw and cjson.decode(raw) or { weeks = {}, todos = {}, nextTodoId = 1 }
  db.weeks = db.weeks or {}
  local weekWasMissing = db.weeks[ARGV[1]] == nil
  local week = db.weeks[ARGV[1]] or cjson.decode(ARGV[4])
  local group = cjson.decode(ARGV[5])
  local anchor = db.rotationAnchor
  local rotationChanged = weekWasMissing
    or week.groupIndex ~= tonumber(ARGV[2])
    or week.groupName ~= group.name
    or not anchor
    or anchor.weekKey ~= ARGV[1]
    or tonumber(anchor.groupIndex) ~= tonumber(ARGV[2])
  week.groupIndex = tonumber(ARGV[2])
  week.groupName = group.name
  week.members = group.members
  db.weeks[ARGV[1]] = week
  db.rotationAnchor = { weekKey = ARGV[1], groupIndex = tonumber(ARGV[2]) }
  if rotationChanged then
    db.rotationVersion = (tonumber(db.rotationVersion) or 0) + 1
  end

  redis.call("SET", KEYS[1], cjson.encode(db))
  local result = cjson.encode({ week = week })
  if webhookEventId ~= "" then
    redis.call("SET", KEYS[2], result, "EX", ARGV[6])
  end
  return cjson.encode({ status = "switched", week = week })
`;
const MARK_SWITCH_EVENT_DELIVERED_SCRIPT = `
  redis.call("SET", KEYS[2], "1", "EX", ARGV[1])
  return "OK"
`;

// Get the Monday date string for the week containing today as the weekKey, for example "2026-08-03".
// 取得「今天所屬那一週」的週一日期字串，當作 weekKey，例如 "2026-08-03"
function getWeekKey(date = dayjs()) {
  const d = dayjs(date);
  // dayjs day(): 0 is Sunday, so find this week's Monday.
  // dayjs day(): 0=週日 ... 需要找到本週週一
  // dayjs returns a day-of-week value from 0 to 6.
  // dayjs 會回傳介於 0 到 6 的星期值。
  const dow = d.day();
  const diffToMonday = dow === 0 ? -6 : 1 - dow;
  return d.add(diffToMonday, "day").format("YYYY-MM-DD");
}

// Prefer the saved anchor from its week onward; earlier weeks retain the configured rotation.
// 從已儲存的基準週開始採用新輪值，更早的週別仍依原始設定計算。
function getGroupIndexForWeek(weekKey, rotationAnchor) {
  const anchor = rotationAnchor && weekKey >= rotationAnchor.weekKey
    ? rotationAnchor
    : { weekKey: config.ROTATION_START_MONDAY, groupIndex: 0 };
  const start = dayjs(anchor.weekKey);
  const current = dayjs(weekKey);
  const diffWeeks = current.diff(start, "week") + anchor.groupIndex;
  const n = config.ROTATION_GROUPS.length;
  // Normalize negative values so the index is always valid.
  // 標準化負數，確保也能算出正確的 index。
  const idx = ((diffWeeks % n) + n) % n;
  return idx;
}

async function getGroupForWeek(weekKey, db = null) {
  const state = db || await readDb();
  const idx = getGroupIndexForWeek(weekKey, state.rotationAnchor);
  return { index: idx, ...config.ROTATION_GROUPS[idx] };
}

function createWeekState(group) {
  return {
    groupIndex: group.index,
    groupName: group.name,
    members: group.members,
    tasks: config.DUTY_TASKS.map((label, i) => ({
      id: i,
      label,
      done: false,
      doneBy: null,
      doneAt: null,
    })),
  };
}

// Get or create the task-state record for a given week.
// 取得（或建立）某一週的任務狀態紀錄。
async function getOrCreateWeekState(weekKey) {
  const db = await readDb();
  if (!db.weeks[weekKey]) {
    const group = await getGroupForWeek(weekKey, db);
    db.weeks[weekKey] = createWeekState(group);
    await writeDb(db);
  }
  return db.weeks[weekKey];
}

// Align a saved week with the effective rotation without clearing completed tasks.
// 將已儲存的週別同步為目前生效的輪值，不清除既有的完成紀錄。
async function syncWeekGroup(weekKey) {
  const db = await readDb();
  const group = await getGroupForWeek(weekKey, db);
  const week = db.weeks[weekKey];

  if (!week) {
    db.weeks[weekKey] = createWeekState(group);
  } else {
    week.groupIndex = group.index;
    week.groupName = group.name;
    week.members = group.members;
  }

  await writeDb(db);
  return db.weeks[weekKey];
}

async function switchWeekGroup(weekKey, groupIndex, webhookEventId) {
  if (weekKey !== getWeekKey()) return { status: "stale" };
  if (
    !Number.isInteger(groupIndex) ||
    groupIndex < 0 ||
    groupIndex >= config.ROTATION_GROUPS.length
  ) {
    return { status: "invalid-group" };
  }

  const group = { index: groupIndex, ...config.ROTATION_GROUPS[groupIndex] };
  const eventId = webhookEventId || "";
  const result = await runAtomic(
    SWITCH_WEEK_GROUP_SCRIPT,
    [
      `OhanaMeansFamily:webhook-event:${eventId}`,
      `OhanaMeansFamily:webhook-event-delivered:${eventId}`,
    ],
    [
      weekKey,
      String(groupIndex),
      eventId,
      JSON.stringify(createWeekState(group)),
      JSON.stringify(group),
      "2592000",
    ],
  );
  return typeof result === "string" ? JSON.parse(result) : result;
}

async function markSwitchEventDelivered(webhookEventId) {
  if (!webhookEventId) return;
  await runAtomic(
    MARK_SWITCH_EVENT_DELIVERED_SCRIPT,
    [`OhanaMeansFamily:webhook-event-delivered:${webhookEventId}`],
    ["2592000"],
  );
}

async function markTaskDone(weekKey, taskId, byName) {
  const db = await readDb();
  if (!Object.prototype.hasOwnProperty.call(db.weeks, weekKey)) return null;
  const week = db.weeks[weekKey];
  if (!week) return null;
  const task = week.tasks.find((t) => t.id === Number(taskId));
  if (!task) return null;
  // Already done (e.g. LINE redelivered the tap after the server woke up, or a double-tap):
  // keep the original doneBy/doneAt instead of overwriting them.
  // 已經完成（例如伺服器喚醒後 LINE 重送事件，或重複點擊）：保留原本的完成者與時間，不覆寫。
  if (task.done) {
    return { ...(await includeNotificationState(weekKey, week)), alreadyDone: true };
  }
  const wasFullyDone = isWeekFullyDone(week);
  task.done = true;
  task.doneBy = byName || "室友";
  task.doneAt = dayjs().format("YYYY-MM-DD HH:mm");
  let updatedWeek = week;
  if (!wasFullyDone && isWeekFullyDone(week)) {
    updatedWeek = { ...week };
    db.weeks = { ...db.weeks, [weekKey]: updatedWeek };
  }
  await writeDb(db);
  return includeNotificationState(weekKey, updatedWeek);
}

async function markNotificationDelivered(weekKey, taskId, notification) {
  await setNotificationDelivered(weekKey, taskId, notification);
}

async function includeNotificationState(weekKey, week) {
  const notifications = await readNotificationState(weekKey);
  const updatedWeek = {
    ...week,
    tasks: week.tasks.map((task) => {
      const {
        checklistNotificationDelivered: legacyDelivered,
        ...taskData
      } = task;
      if (!task.done) return taskData;
      return {
        ...taskData,
        checklistNotificationDelivered:
          notifications.checklist?.[task.id] ?? legacyDelivered ?? false,
      };
    }),
  };
  delete updatedWeek.allDoneNotificationDelivered;
  if (isWeekFullyDone(week)) {
    updatedWeek.allDoneNotificationDelivered =
      notifications.allDoneDelivered ?? week.allDoneNotificationDelivered ?? false;
  }
  return updatedWeek;
}

function isWeekFullyDone(week) {
  return week.tasks.every((t) => t.done);
}

// Reset all task completion states for a week without changing its assigned rotation group.
// 重設某一週的所有任務完成狀態（不改變輪值分組，只清空勾選）。
async function resetWeek(weekKey) {
  const db = await readDb();
  const week = db.weeks[weekKey];
  if (!week) return null;
  week.tasks = week.tasks.map((t) => {
    const { checklistNotificationDelivered, ...task } = t;
    return { ...task, done: false, doneBy: null, doneAt: null };
  });
  delete week.allDoneNotificationDelivered;
  await writeDb(db);
  await clearNotificationState(weekKey);
  return week;
}

module.exports = {
  getWeekKey,
  getGroupForWeek,
  getOrCreateWeekState,
  syncWeekGroup,
  switchWeekGroup,
  markSwitchEventDelivered,
  markTaskDone,
  markNotificationDelivered,
  isWeekFullyDone,
  resetWeek,
};
