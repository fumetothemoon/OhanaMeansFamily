// Handles LINE postback events for chore completion and duty group selection.
// 處理 LINE 的工作完成與值日組別選擇 postback 事件。

const dayjs = require("dayjs");
const config = require("../config");
const {
  markTaskDone,
  markNotificationDelivered,
  switchWeekGroup,
  markSwitchDelivered,
  getOrCreateWeekState,
  getGroupForWeek,
} = require("../lib/rotation");
const { upsertMemberId, readMemberIds } = require("../lib/db");
const {
  buildDutyFlex,
  buildAllDoneMessage,
  buildAllDonePlainText,
  buildDutySwitchMessages,
} = require("../lib/messages");
const { client, getDisplayName, pushToGroup } = require("../lib/lineClient");

// Strip LINE user and group ids from a push error before it is logged.
// 寫 log 前先去掉推播錯誤裡的 LINE 使用者與群組 id。
function describePushError(error) {
  const raw = error instanceof Error && error.message ? error.message : "unknown error";
  return raw
    .replace(/U[0-9a-f]{32}/gi, "[userId]")
    .replace(/C[0-9a-f]{32}/gi, "[groupId]");
}

// Remember who tapped 完成. Skip, and say why, when the name or userId is missing.
// 記住按下完成的人。缺少名稱或 userId 時略過，並寫下原因。
async function rememberCompletionMember(event, displayName) {
  const source = event.source;
  const inHouseholdGroup = Boolean(
    source &&
      source.type === "group" &&
      config.GROUP_ID &&
      source.groupId === config.GROUP_ID,
  );
  if (!inHouseholdGroup) return;

  const userId = source.userId;
  if (displayName && userId) {
    await upsertMemberId(displayName, userId);
    return;
  }
  const reason = displayName
    ? "userId unavailable 沒有 userId"
    : "display name unavailable 沒有顯示名稱";
  console.warn(`[member-ids] skipped storing member id on completion 完成回報未儲存成員 id: ${reason}`);
}

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
    const result = await switchWeekGroup(weekKey, groupIndex, event.webhookEventId);
    if (result.status === "delivered") return;
    if (result.status !== "switched") {
      if (result.status !== "pending") {
        return replyOrPush(event, {
          type: "text",
          text: result.status === "stale"
            ? "此選單已過期，請重新輸入 /switch-duty 選擇本週值日組別。"
            : "找不到此值日組別，請重新輸入 /switch-duty 選擇。",
        });
      }
    }
    const name = (await getDisplayName(event.source)) || "室友";
    // A pending retry keeps the original pick as history and reloads the checklist.
    // 待確認的重送保留當初的選擇當作歷史確認，清單則重新讀取目前這一週。
    const currentWeek = result.status === "pending"
      ? await getOrCreateWeekState(weekKey)
      : null;
    await replyOrPush(
      event,
      buildDutySwitchMessages(weekKey, result.week, name, currentWeek),
    );
    await markSwitchDelivered(event.webhookEventId);
    return;
  }
  if (action !== "done") return;

  const weekKey = data.get("week");
  const taskId = data.get("task");
  const displayName = await getDisplayName(event.source);
  const name = displayName || "室友";
  await rememberCompletionMember(event, displayName);

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

  // The next group is the completed weekKey plus seven days, not "today".
  // Mark all-done delivered only after a send succeeds. One plain-text retry
  // covers a mention push that LINE rejects (for example a member who left).
  // 下一組以完成週的 weekKey 加七天計算，不是「今天」。
  // 只有送出成功才把全部完成標成已送達。mention 推播若被 LINE 拒絕
  // （例如成員已退群），改以純文字再送一次。
  if (week.allDoneNotificationDelivered === false) {
    const nextWeekKey = dayjs(weekKey).add(7, "day").format("YYYY-MM-DD");
    const nextGroup = await getGroupForWeek(nextWeekKey);
    if (!nextGroup || !Array.isArray(nextGroup.members) || nextGroup.members.length === 0) {
      throw new Error(`all-done next group has no members for week ${nextWeekKey}`);
    }
    const storedIds = await readMemberIds();
    const message = buildAllDoneMessage(nextGroup.members, storedIds);
    try {
      await pushToGroup(message);
    } catch (error) {
      console.warn(
        `[all-done] mention push failed (${describePushError(error)}); retrying as plain text 提及推播失敗，改以純文字再送一次`,
      );
      await pushToGroup(buildAllDonePlainText(nextGroup.members));
    }
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
