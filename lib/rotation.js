const dayjs = require("dayjs");
const config = require("../config");
const { readDb, writeDb } = require("./db");

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

// Calculate the rotation group index from the weeks between ROTATION_START_MONDAY and the current Monday.
// 依照 ROTATION_START_MONDAY 跟今天的週一相差幾週，決定輪值組別 index
function getGroupIndexForWeek(weekKey) {
  const start = dayjs(config.ROTATION_START_MONDAY);
  const current = dayjs(weekKey);
  const diffWeeks = current.diff(start, "week");
  const n = config.ROTATION_GROUPS.length;
  // Normalize negative values so the index is always valid.
  // 標準化負數，確保也能算出正確的 index。
  const idx = ((diffWeeks % n) + n) % n;
  return idx;
}

function getGroupForWeek(weekKey) {
  const idx = getGroupIndexForWeek(weekKey);
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
    const group = getGroupForWeek(weekKey);
    db.weeks[weekKey] = createWeekState(group);
    await writeDb(db);
  }
  return db.weeks[weekKey];
}

// Align a saved week with the configured rotation without clearing completed tasks.
// 將已儲存的週別同步為目前輪值設定，不清除既有的完成紀錄。
async function syncWeekGroup(weekKey) {
  const db = await readDb();
  const group = getGroupForWeek(weekKey);
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

async function markTaskDone(weekKey, taskId, byName) {
  const db = await readDb();
  const week = db.weeks[weekKey];
  if (!week) return null;
  const task = week.tasks.find((t) => t.id === Number(taskId));
  if (!task) return null;
  task.done = true;
  task.doneBy = byName || "室友";
  task.doneAt = dayjs().format("YYYY-MM-DD HH:mm");
  await writeDb(db);
  return week;
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
  week.tasks = week.tasks.map((t) => ({
    ...t,
    done: false,
    doneBy: null,
    doneAt: null,
  }));
  await writeDb(db);
  return week;
}

module.exports = {
  getWeekKey,
  getGroupForWeek,
  getOrCreateWeekState,
  syncWeekGroup,
  markTaskDone,
  isWeekFullyDone,
  resetWeek,
};
