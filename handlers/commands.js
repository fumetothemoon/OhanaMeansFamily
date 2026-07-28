// Handles LINE text message events — i.e. slash commands typed in the group.
// 處理 LINE 的文字訊息事件，也就是群組裡打的斜線指令。

const {
  getWeekKey,
  getOrCreateWeekState,
  resetWeek,
} = require("../lib/rotation");
const { buildDutyFlex, buildTodoListMessage } = require("../lib/messages");
const { listTodos, addTodo, completeTodo } = require("../lib/todos");
const { client, getDisplayName } = require("../lib/lineClient");

async function handleTextMessage(event) {
  const text = event.message.text.trim();
  const name = (await getDisplayName(event.source)) || "室友";

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
    const todo = await addTodo(addMatch[1].trim(), name);
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
