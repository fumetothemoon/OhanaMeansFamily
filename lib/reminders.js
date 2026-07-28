// Core reminder-sending functions, triggered by the /cron/* routes (see routes/cron.js).
// 核心提醒發送函式，由 /cron/* 路由觸發（見 routes/cron.js）。

const {
  getWeekKey,
  getOrCreateWeekState,
  isWeekFullyDone,
} = require("./rotation");
const { buildDutyFlex, buildTodoListMessage } = require("./messages");
const { listTodos } = require("./todos");
const { pushToGroup } = require("./lineClient");

// Send this week's full task list with checkboxes. Runs every Monday.
// 發送本週完整任務清單與勾選按鈕。每週一執行。
async function sendWeeklyKickoff() {
  const weekKey = getWeekKey();
  const week = await getOrCreateWeekState(weekKey);
  const flex = buildDutyFlex({
    title: "🧹 本週值日提醒",
    weekKey,
    groupName: week.groupName,
    members: week.members,
    tasks: week.tasks,
    footerNote:
      "完成一項就按一下對應的「完成」按鈕即可，做完全部六項就不會再收到提醒囉。",
  });
  await pushToGroup(flex);
}

// Send a reminder of tasks still not done. Skips sending if everything is already complete.
// 發送尚未完成工作的提醒。若全部已完成則不發送。
async function sendMidweekOrWeekendReminder(label) {
  const weekKey = getWeekKey();
  const week = await getOrCreateWeekState(weekKey);
  if (isWeekFullyDone(week)) return;
  const flex = buildDutyFlex({
    title: `⏰ ${label}提醒：還有工作沒完成`,
    weekKey,
    groupName: week.groupName,
    members: week.members,
    tasks: week.tasks,
  });
  await pushToGroup(flex);
}

// Send the monthly reminder of any still-open to-do items. Skips if the list is empty.
// 發送每月待辦清單提醒。若清單為空則不發送。
async function sendMonthlyTodoReminder() {
  const openTodos = await listTodos({ onlyOpen: true });
  if (openTodos.length === 0) return;
  await pushToGroup(buildTodoListMessage(openTodos));
}

module.exports = {
  sendWeeklyKickoff,
  sendMidweekOrWeekendReminder,
  sendMonthlyTodoReminder,
};
