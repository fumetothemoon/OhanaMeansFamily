const express = require("express");
const line = require("@line/bot-sdk");
const dayjs = require("dayjs");

const config = require("./config");
const {
  getWeekKey,
  getGroupForWeek,
  getOrCreateWeekState,
  markTaskDone,
  isWeekFullyDone,
} = require("./lib/rotation");
const {
  buildDutyFlex,
  buildAllDoneMessage,
  buildTodoListMessage,
} = require("./lib/messages");
const { listTodos, addTodo, completeTodo } = require("./lib/todos");

const lineConfig = {
  channelAccessToken: config.LINE_CHANNEL_ACCESS_TOKEN,
  channelSecret: config.LINE_CHANNEL_SECRET,
};
const client = new line.messagingApi.MessagingApiClient({
  channelAccessToken: config.LINE_CHANNEL_ACCESS_TOKEN,
});

const app = express();

// ------------------------------------------------------------
// 共用函式：取得使用者顯示名稱（群組內優先用群組個人資料）
// ------------------------------------------------------------
async function getDisplayName(source) {
  try {
    if (source.type === "group" && source.userId) {
      const profile = await client.getGroupMemberProfile(
        source.groupId,
        source.userId,
      );
      return profile.displayName;
    }
    if (source.userId) {
      const profile = await client.getProfile(source.userId);
      return profile.displayName;
    }
  } catch (e) {
    console.error("取得使用者名稱失敗:", e.message);
  }
  return null;
}

async function pushToGroup(messages) {
  if (!config.GROUP_ID) {
    console.warn(
      "尚未設定 GROUP_ID，訊息無法推播。請看 README 說明如何取得 groupId。",
    );
    return;
  }
  await client.pushMessage({
    to: config.GROUP_ID,
    messages: Array.isArray(messages) ? messages : [messages],
  });
}

// ------------------------------------------------------------
// 排程要用到的三支核心推播函式
// ------------------------------------------------------------
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

async function sendMidweekOrWeekendReminder(label) {
  const weekKey = getWeekKey();
  const week = await getOrCreateWeekState(weekKey);
  if (isWeekFullyDone(week)) return; // 全部完成就不用再提醒
  const flex = buildDutyFlex({
    title: `⏰ ${label}提醒：還有工作沒完成`,
    weekKey,
    groupName: week.groupName,
    members: week.members,
    tasks: week.tasks,
  });
  await pushToGroup(flex);
}

async function sendMonthlyTodoReminder() {
  const openTodos = await listTodos({ onlyOpen: true });
  if (openTodos.length === 0) return;
  await pushToGroup(buildTodoListMessage(openTodos));
}

// ------------------------------------------------------------
// Webhook
// ------------------------------------------------------------
app.post("/webhook", line.middleware(lineConfig), async (req, res) => {
  res.status(200).end(); // 先回應 LINE，避免逾時重送
  try {
    await Promise.all((req.body.events || []).map(handleEvent));
  } catch (e) {
    console.error("處理事件時發生錯誤:", e);
  }
});

async function handleEvent(event) {
  const source = event.source || {};
  if (source.type === "group" && source.groupId) {
    // 方便第一次設定時取得 groupId
    console.log("目前群組 groupId =", source.groupId);
  }

  if (event.type === "postback") {
    return handlePostback(event);
  }

  if (event.type === "message" && event.message.type === "text") {
    return handleTextMessage(event);
  }
}

async function handlePostback(event) {
  const data = new URLSearchParams(event.postback.data);
  const action = data.get("action");
  if (action !== "done") return;

  const weekKey = data.get("week");
  const taskId = data.get("task");
  const name = (await getDisplayName(event.source)) || "室友";

  const week = await markTaskDone(weekKey, taskId, name);
  if (!week) return;

  const task = week.tasks.find((t) => t.id === Number(taskId));
  await client.replyMessage({
    replyToken: event.replyToken,
    messages: [
      { type: "text", text: `✅ 已回報完成：${task.label}（${name}）` },
    ],
  });

  if (isWeekFullyDone(week)) {
    await pushToGroup(buildAllDoneMessage(week.groupName));
  }
}

async function handleTextMessage(event) {
  const text = event.message.text.trim();
  const name = (await getDisplayName(event.source)) || "室友";

  // 查詢本週值日狀態
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

  // 查待辦清單
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

  // 新增待辦： /todo 新增 內容
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

  // 完成待辦： /todo 完成 3
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

  // 查目前 groupId，方便設定
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

// ------------------------------------------------------------
// 排程觸發端點：由外部排程服務（GitHub Actions）在固定時間呼叫，
// 這樣主機本身不需要 24 小時常駐，休眠中的免費方案被打到會自動醒來處理。
// 每個端點都要帶正確的 x-cron-secret header，不然一律拒絕。
// ------------------------------------------------------------
function checkCronSecret(req, res) {
  const secret = req.get("x-cron-secret");
  if (!config.CRON_SECRET || secret !== config.CRON_SECRET) {
    res.status(401).send("unauthorized");
    return false;
  }
  return true;
}

app.post("/cron/weekly-kickoff", express.json(), async (req, res) => {
  if (!checkCronSecret(req, res)) return;
  await sendWeeklyKickoff();
  res.send("ok");
});

app.post("/cron/midweek", express.json(), async (req, res) => {
  if (!checkCronSecret(req, res)) return;
  await sendMidweekOrWeekendReminder("週間");
  res.send("ok");
});

app.post("/cron/weekend", express.json(), async (req, res) => {
  if (!checkCronSecret(req, res)) return;
  await sendMidweekOrWeekendReminder("週末");
  res.send("ok");
});

app.post("/cron/monthly-todo", express.json(), async (req, res) => {
  if (!checkCronSecret(req, res)) return;
  await sendMonthlyTodoReminder();
  res.send("ok");
});

app.get("/", (req, res) => res.send("duty-bot is running"));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`duty-bot listening on port ${PORT}`));
