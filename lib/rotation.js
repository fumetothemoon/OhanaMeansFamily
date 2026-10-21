const dayjs = require("dayjs");
const config = require("../config");
const {
  readDb,
  writeDb,
  readNotificationState,
  setNotificationDelivered,
  clearNotificationState,
} = require("./db");

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

async function switchWeekGroup(weekKey, groupIndex) {
  if (weekKey !== getWeekKey()) return { status: "stale" };
  if (
    !Number.isInteger(groupIndex) ||
    groupIndex < 0 ||
    groupIndex >= config.ROTATION_GROUPS.length
  ) {
    return { status: "invalid-group" };
  }

  const db = await readDb();
  const group = { index: groupIndex, ...config.ROTATION_GROUPS[groupIndex] };
  const week = db.weeks[weekKey] || createWeekState(group);
  week.groupIndex = group.index;
  week.groupName = group.name;
  week.members = group.members;
  db.weeks[weekKey] = week;
  db.rotationAnchor = { weekKey, groupIndex };
  await writeDb(db);
  return { status: "switched", week };
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
  markTaskDone,
  markNotificationDelivered,
  isWeekFullyDone,
  resetWeek,
};
