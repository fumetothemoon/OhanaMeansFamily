// Handles LINE postback events — i.e. someone tapping a "完成" button.
// 處理 LINE 的 postback 事件，也就是有人按下「完成」按鈕。

const { markTaskDone, isWeekFullyDone } = require("../lib/rotation");
const { buildDutyFlex, buildAllDoneMessage } = require("../lib/messages");
const { client, getDisplayName, pushToGroup } = require("../lib/lineClient");

async function handlePostback(event) {
  // TEMPORARY DEBUG: set DEBUG_SIMULATE_DELAY_MS in .env to simulate slow processing
  // (e.g. to test what happens if the server is slow to wake up / respond).
  // 暫時性除錯用：在 .env 設定 DEBUG_SIMULATE_DELAY_MS 可模擬處理緩慢的情況
  // （例如測試伺服器喚醒/回應緩慢時的行為）。
  const debugDelay = Number(process.env.DEBUG_SIMULATE_DELAY_MS || 0);
  if (debugDelay > 0) {
    console.log(
      `[DEBUG] Simulating a ${debugDelay}ms delay before processing... 模擬延遲 ${debugDelay} 毫秒後才處理...`,
    );
    await new Promise((resolve) => setTimeout(resolve, debugDelay));
  }

  const data = new URLSearchParams(event.postback.data);
  const action = data.get("action");
  if (action !== "done") return;

  const weekKey = data.get("week");
  const taskId = data.get("task");
  const name = (await getDisplayName(event.source)) || "室友";

  const week = await markTaskDone(weekKey, taskId, name);
  if (!week) return;

  // Reply with the full checklist so everyone sees the live state, not just this one task.
  // 回覆完整的勾選清單，讓大家看到最新狀態，而不只是這一項工作。
  const task = week.tasks.find((t) => t.id === Number(taskId));
  const flex = buildDutyFlex({
    title: `✅ ${name} 完成了「${task.label}」`,
    weekKey,
    groupName: week.groupName,
    members: week.members,
    tasks: week.tasks,
  });
  await client.replyMessage({
    replyToken: event.replyToken,
    messages: [flex],
  });

  if (isWeekFullyDone(week)) {
    await pushToGroup(buildAllDoneMessage(week.groupName));
  }
}

module.exports = { handlePostback };
