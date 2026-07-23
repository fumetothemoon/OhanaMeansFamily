const dayjs = require("dayjs");
const config = require("../config");
const { readDb, writeDb } = require("./db");

// 取得「今天所屬那一週」的週一日期字串，當作 weekKey，例如 "2026-08-03"
function getWeekKey(date = dayjs()) {
  const d = dayjs(date);
  // dayjs day(): 0=週日 ... 需要找到本週週一
  const dow = d.day(); // 0~6
  const diffToMonday = dow === 0 ? -6 : 1 - dow;
  return d.add(diffToMonday, "day").format("YYYY-MM-DD");
}

// 依照 ROTATION_START_MONDAY 跟今天的週一相差幾週，決定輪值組別 index
function getGroupIndexForWeek(weekKey) {
  const start = dayjs(config.ROTATION_START_MONDAY);
  const current = dayjs(weekKey);
  const diffWeeks = current.diff(start, "week");
  const n = config.ROTATION_GROUPS.length;
  const idx = ((diffWeeks % n) + n) % n; // 確保負數也能算出正確 index
  return idx;
}

function getGroupForWeek(weekKey) {
  const idx = getGroupIndexForWeek(weekKey);
  return { index: idx, ...config.ROTATION_GROUPS[idx] };
}

// 取得（或建立）某一週的任務狀態紀錄
function getOrCreateWeekState(weekKey) {
  const db = readDb();
  if (!db.weeks[weekKey]) {
    const group = getGroupForWeek(weekKey);
    db.weeks[weekKey] = {
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
    writeDb(db);
  }
  return db.weeks[weekKey];
}

function markTaskDone(weekKey, taskId, byName) {
  const db = readDb();
  const week = db.weeks[weekKey];
  if (!week) return null;
  const task = week.tasks.find((t) => t.id === Number(taskId));
  if (!task) return null;
  task.done = true;
  task.doneBy = byName || "室友";
  task.doneAt = dayjs().format("YYYY-MM-DD HH:mm");
  writeDb(db);
  return week;
}

function isWeekFullyDone(week) {
  return week.tasks.every((t) => t.done);
}

module.exports = {
  getWeekKey,
  getGroupForWeek,
  getOrCreateWeekState,
  markTaskDone,
  isWeekFullyDone,
};
