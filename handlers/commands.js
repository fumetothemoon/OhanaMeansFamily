// Handles LINE text message events — i.e. slash commands typed in the group.
// 處理 LINE 的文字訊息事件，也就是群組裡打的斜線指令。

const config = require("../config");
const {
  getWeekKey,
  getGroupForWeek,
  getOrCreateWeekState,
  resetWeek,
  syncWeekGroup,
} = require("../lib/rotation");
const { upsertMemberId, readMemberIds } = require("../lib/db");
const {
  buildDutyFlex,
  buildTodoListMessage,
  buildDutyGroupSelector,
} = require("../lib/messages");
const { listTodos, addTodo, completeTodo } = require("../lib/todos");
const { client, getDisplayName } = require("../lib/lineClient");

// Same shape as the /switch-duty rejection: say where to type it, list nothing.
// 與 /switch-duty 的拒絕訊息相同：說明要在哪裡輸入，不列出任何內容。
const IDS_OUTSIDE_GROUP = "請在群組中輸入 /ids 查看已儲存的成員 ID。";
const IDS_NONE_STORED = "目前還沒有儲存任何成員 ID。";

function isHouseholdGroup(source) {
  return Boolean(
    source &&
      source.type === "group" &&
      config.GROUP_ID &&
      source.groupId === config.GROUP_ID,
  );
}

// Slash commands in the household group record the sender. Other chats do not.
// 家庭群組裡的斜線指令會記錄發送者。其他聊天不會。
async function rememberGroupCommandMember(event, displayName) {
  if (!isHouseholdGroup(event.source)) return;
  if (!displayName || !event.source.userId) return;
  await upsertMemberId(displayName, event.source.userId);
}

function formatMemberIdList(stored) {
  const lines = Object.keys(stored)
    .filter((memberName) => typeof stored[memberName] === "string" && stored[memberName].length > 0)
    .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))
    .map((memberName) => `${memberName}: ${stored[memberName]}`);
  return lines.length > 0 ? lines.join("\n") : IDS_NONE_STORED;
}

function formatGroup(group) {
  return `${group.groupName || group.name}（${group.members.join("、")}）`;
}

async function handleTextMessage(event) {
  const text = event.message.text.trim();
  const displayName = await getDisplayName(event.source);
  const name = displayName || "室友";
  if (text.startsWith("/")) {
    await rememberGroupCommandMember(event, displayName);
  }

  if (text === "/switch-duty" || text === "/換班") {
    if (event.source.type !== "group") {
      return client.replyMessage({
        replyToken: event.replyToken,
        messages: [{ type: "text", text: "請在群組中輸入 /switch-duty 選擇值日組別。" }],
      });
    }
    const weekKey = getWeekKey();
    const week = await getOrCreateWeekState(weekKey);
    return client.replyMessage({
      replyToken: event.replyToken,
      messages: [buildDutyGroupSelector(weekKey, week.groupIndex)],
    });
  }

  // Check this week's duty status. 查詢本週值日狀態。
  if (text === "/狀態" || text === "/status" || text === "/值日") {
    const weekKey = getWeekKey();
    const week = await getOrCreateWeekState(weekKey);
    const flex = buildDutyFlex({
      title: "🧹 本週值日狀態",
      weekKey,
      groupName: week.groupName,
      members: week.members,
      tasks: week.tasks,
    });
    return client.replyMessage({
      replyToken: event.replyToken,
      messages: [flex],
    });
  }

  // Compare the effective rotation with the saved group for this week.
  // 比對目前生效的輪值與本週已儲存的值日組別。
  if (text === "/turn-check" || text === "/輪值檢查") {
    const weekKey = getWeekKey();
    const expectedGroup = await getGroupForWeek(weekKey);
    const savedWeek = await getOrCreateWeekState(weekKey);
    const matches =
      savedWeek.groupIndex === expectedGroup.index &&
      savedWeek.groupName === expectedGroup.name &&
      JSON.stringify(savedWeek.members) ===
        JSON.stringify(expectedGroup.members);
    const result = matches
      ? "✅ 目前儲存的值日組別與目前輪值一致。"
      : "⚠️ 不一致：提醒訊息仍會使用已儲存的組別。確認後輸入 /turn-sync 即可同步，且不會清除完成紀錄。";
    return client.replyMessage({
      replyToken: event.replyToken,
      messages: [
        {
          type: "text",
          text: `🔎 輪值檢查\n週別：${weekKey}\n輪值預期：${formatGroup(expectedGroup)}\n目前儲存：${formatGroup(savedWeek)}\n${result}`,
        },
      ],
    });
  }

  // Update this week's saved group to match the effective rotation.
  // 將本週已儲存的組別更新為目前生效的輪值。
  if (text === "/turn-sync" || text === "/輪值同步") {
    const weekKey = getWeekKey();
    const week = await syncWeekGroup(weekKey);
    return client.replyMessage({
      replyToken: event.replyToken,
      messages: [
        {
          type: "text",
          text: `✅ 已同步 ${weekKey} 的值日組別：${formatGroup(week)}\n既有完成紀錄已保留。`,
        },
      ],
    });
  }

  // Reset this week's checklist — clears completion state only, keeps the same on-duty group.
  // 重設本週值日勾選（只清空完成狀態，不改變輪值分組）。
  if (text === "/reset" || text === "/重設") {
    const weekKey = getWeekKey();
    const week = await resetWeek(weekKey);
    if (!week) {
      return client.replyMessage({
        replyToken: event.replyToken,
        messages: [{ type: "text", text: "目前沒有本週的值日紀錄可以重設。" }],
      });
    }
    const flex = buildDutyFlex({
      title: `🔄 ${name} 重設了本週值日`,
      weekKey,
      groupName: week.groupName,
      members: week.members,
      tasks: week.tasks,
      footerNote: "所有工作已重新標記為未完成，可以重新開始勾選。",
    });
    return client.replyMessage({
      replyToken: event.replyToken,
      messages: [flex],
    });
  }

  // View the shared monthly to-do list. 查看當月待辦清單。
  if (
    text === "/todo" ||
    text === "/待辦" ||
    text === "/todo list" ||
    text === "/todo 查詢"
  ) {
    const todos = await listTodos();
    return client.replyMessage({
      replyToken: event.replyToken,
      messages: [buildTodoListMessage(todos)],
    });
  }

  // Add a to-do item: /todo 新增 <content>. 新增待辦：/todo 新增 內容。
  const addMatch = text.match(/^\/todo\s+新增\s+(.+)$/);
  if (addMatch) {
    const todo = await addTodo(
      addMatch[1].trim(),
      name,
      event.webhookEventId,
    );
    return client.replyMessage({
      replyToken: event.replyToken,
      messages: [
        { type: "text", text: `已新增待辦 #${todo.id}：${todo.text}` },
      ],
    });
  }

  // Mark a to-do item done: /todo 完成 <id>. 標記待辦完成：/todo 完成 3。
  const doneMatch = text.match(/^\/todo\s+完成\s+(\d+)$/);
  if (doneMatch) {
    const todo = await completeTodo(doneMatch[1], name);
    if (!todo) {
      return client.replyMessage({
        replyToken: event.replyToken,
        messages: [{ type: "text", text: `找不到待辦 #${doneMatch[1]}` }],
      });
    }
    return client.replyMessage({
      replyToken: event.replyToken,
      messages: [
        { type: "text", text: `🎉 待辦 #${todo.id}「${todo.text}」已標記完成` },
      ],
    });
  }

  // List stored display name → userId pairs. Household group only.
  // 列出已儲存的顯示名稱對 userId。僅限家庭群組。
  if (text === "/ids") {
    if (!isHouseholdGroup(event.source)) {
      return client.replyMessage({
        replyToken: event.replyToken,
        messages: [{ type: "text", text: IDS_OUTSIDE_GROUP }],
      });
    }
    const stored = await readMemberIds();
    return client.replyMessage({
      replyToken: event.replyToken,
      messages: [{ type: "text", text: formatMemberIdList(stored) }],
    });
  }

  // Look up the current groupId — useful during setup. 查目前 groupId，方便設定。
  if (text === "/groupid") {
    return client.replyMessage({
      replyToken: event.replyToken,
      messages: [
        {
          type: "text",
          text: `groupId = ${event.source.groupId || "(不在群組中)"}`,
        },
      ],
    });
  }
}

module.exports = { handleTextMessage };
