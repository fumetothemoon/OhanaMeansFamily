// Handles LINE postback events for chore completion and duty group selection.
// 處理 LINE 的工作完成與值日組別選擇 postback 事件。

const {
  markTaskDone,
  markNotificationDelivered,
  switchWeekGroup,
} = require("../lib/rotation");
const {
  buildDutyFlex,
  buildAllDoneMessage,
  buildDutySwitchMessages,
} = require("../lib/messages");
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
  if (action === "switch-duty") {
    if (event.source.type !== "group") {
      return replyOrPush(event, {
        type: "text",
        text: "請在群組中輸入 /switch-duty 選擇值日組別。",
      });
    }
    const weekKey = data.get("week");
    const rawGroup = data.get("group");
    const groupIndex = /^\d+$/.test(rawGroup || "") ? Number(rawGroup) : NaN;
    const result = await switchWeekGroup(weekKey, groupIndex);
    if (result.status !== "switched") {
      return replyOrPush(event, {
        type: "text",
        text: result.status === "stale"
          ? "此選單已過期，請重新輸入 /switch-duty 選擇本週值日組別。"
          : "找不到此值日組別，請重新輸入 /switch-duty 選擇。",
      });
    }
    const name = (await getDisplayName(event.source)) || "室友";
    return replyOrPush(event, buildDutySwitchMessages(weekKey, result.week, name));
  }
  if (action !== "done") return;

  const weekKey = data.get("week");
  const taskId = data.get("task");
  const name = (await getDisplayName(event.source)) || "室友";

  const week = await markTaskDone(weekKey, taskId, name);
  if (!week) return;

  const task = week.tasks.find((t) => t.id === Number(taskId));
  if (task.checklistNotificationDelivered === false) {
    const flex = buildDutyFlex({
      title: `✅ ${task.doneBy} 完成了「${task.label}」`,
      weekKey,
      groupName: week.groupName,
      members: week.members,
      tasks: week.tasks,
    });
    await replyOrPush(event, flex);
    await markNotificationDelivered(weekKey, taskId, "checklist");
  }

  if (week.allDoneNotificationDelivered === false) {
    await pushToGroup(buildAllDoneMessage(week.groupName));
    await markNotificationDelivered(weekKey, taskId, "allDone");
  }
}

// Reply tokens expire shortly after the event. If the server was asleep (cold start) or the event
// was redelivered by LINE, the token may already be invalid — fall back to a push message so the
// group still sees the update. Push messages count toward the monthly message quota.
// Reply token 在事件發生後很快就會失效。若伺服器剛從休眠喚醒，或事件是 LINE 重送的，token 可能已失效，
// 此時改用推播訊息，讓群組仍能看到更新。推播訊息會計入每月訊息額度。
async function replyOrPush(event, message) {
  const messages = Array.isArray(message) ? message : [message];
  const isRedelivery = event.deliveryContext && event.deliveryContext.isRedelivery;
  if (!isRedelivery && event.replyToken) {
    try {
      await client.replyMessage({ replyToken: event.replyToken, messages });
      return;
    } catch (e) {
      console.warn("Reply failed, falling back to push 回覆失敗，改用推播:", e.message);
    }
  }
  await pushToGroup(messages);
}

module.exports = { handlePostback };
