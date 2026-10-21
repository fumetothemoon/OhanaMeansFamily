const config = require("../config");

// Build a Flex Message for the duty checklist, with a "Mark complete" button beside each task.
// 組出「值日任務清單」的 Flex Message，每項工作旁邊有一個「回報完成」按鈕。
function buildDutyFlex({ title, weekKey, groupName, members, tasks, footerNote }) {
  const undone = tasks.filter((t) => !t.done);
  const taskRows = tasks.map((t) => ({
    type: "box",
    layout: "horizontal",
    alignItems: "center",
    margin: "md",
    contents: [
      {
        type: "text",
        text: t.done ? `✅ ${t.label}` : `⬜ ${t.label}`,
        wrap: true,
        size: "sm",
        color: t.done ? "#8a8a8a" : "#111111",
        flex: 5,
        decoration: t.done ? "line-through" : "none",
      },
      t.done
        ? {
            type: "text",
            text: t.doneBy || "",
            size: "xxs",
            color: "#8a8a8a",
            align: "end",
            flex: 2,
          }
        : {
            type: "button",
            style: "primary",
            color: "#2E7D32",
            height: "sm",
            flex: 2,
            action: {
              type: "postback",
              label: "完成",
              data: `action=done&week=${weekKey}&task=${t.id}`,
              displayText: `回報完成：${t.label}`,
            },
          },
    ],
  }));

  return {
    type: "flex",
    altText: `${title}（本週值日：${groupName}）`,
    contents: {
      type: "bubble",
      header: {
        type: "box",
        layout: "vertical",
        contents: [
          { type: "text", text: title, weight: "bold", size: "lg", color: "#ffffff" },
          {
            type: "text",
            text: `值日：${groupName}（${members.join("、")}）`,
            size: "sm",
            color: "#e0f2e9",
            margin: "sm",
          },
        ],
        backgroundColor: "#2E7D32",
        paddingAll: "16px",
      },
      body: {
        type: "box",
        layout: "vertical",
        contents: [
          ...taskRows,
          ...(footerNote
            ? [
                { type: "separator", margin: "lg" },
                {
                  type: "text",
                  text: footerNote,
                  size: "xs",
                  color: "#8a8a8a",
                  margin: "lg",
                  wrap: true,
                },
              ]
            : []),
        ],
      },
    },
  };
}

function buildAllDoneMessage(groupName) {
  return {
    type: "text",
    text: `🎉 本週值日（${groupName}）六項工作都完成囉，辛苦了！下週換下一組接手。`,
  };
}

function buildTodoListMessage(todos) {
  if (!todos || todos.length === 0) {
    return {
      type: "text",
      text: "📋 目前本月待辦清單是空的。\n輸入「/todo 新增 內容」可以新增一項，例如：\n/todo 新增 跟房東反應廚房水管漏水",
    };
  }
  const lines = todos.map((t) => {
    const mark = t.done ? "✅" : "⬜";
    return `${mark} #${t.id} ${t.text}${t.done ? `（${t.doneBy || ""}完成）` : ` — by ${t.addedBy || "?"}`}`;
  });
  return {
    type: "text",
    text:
      "📋 當月待辦清單\n" +
      lines.join("\n") +
      "\n\n新增：/todo 新增 內容\n標記完成：/todo 完成 編號",
  };
}

function buildDutyGroupSelector(weekKey, currentGroupIndex) {
  return {
    type: "flex",
    altText: "選擇本週值日組別 / switch duty group",
    contents: {
      type: "bubble",
      body: {
        type: "box",
        layout: "vertical",
        contents: [
          { type: "text", text: "🔄 選擇本週值日組別", weight: "bold", size: "lg" },
          ...config.ROTATION_GROUPS.map((group, index) => ({
            type: "box",
            layout: "vertical",
            margin: "lg",
            contents: [
              {
                type: "text",
                text: `${group.name}（${group.members.join("、")}）${index === currentGroupIndex ? " — 目前" : ""}`,
                wrap: true,
              },
              {
                type: "button",
                style: index === currentGroupIndex ? "primary" : "secondary",
                height: "sm",
                margin: "sm",
                action: {
                  type: "postback",
                  label: `選擇${group.name}`,
                  data: `action=switch-duty&week=${weekKey}&group=${index}`,
                  displayText: `選擇本週值日：${group.name}`,
                },
              },
            ],
          })),
          {
            type: "text",
            text: "可選擇目前組別；完成紀錄會保留，之後每週從所選組別依序接續。",
            wrap: true,
            size: "xs",
            margin: "lg",
          },
        ],
      },
    },
  };
}

function buildDutySwitchMessages(weekKey, week, changedBy, currentWeek) {
  // Pending retries confirm the original selection without calling it the current group.
  // 待確認的重送以歷史口吻確認當初的選擇，不把舊組別說成本週值日。
  const checklistWeek = currentWeek || week;
  const text = currentWeek
    ? `✅ 已確認先前的切換 prior switch confirmed：當時選擇 ${week.groupName}（${week.members.join("、")}），由 ${changedBy} 操作。目前值日請見下方清單。`
    : `✅ 輪值已切換 turn has changed：本週值日 ${week.groupName}（${week.members.join("、")}）\n由 ${changedBy} 切換；既有完成紀錄已保留，之後每週從此組接續輪值。`;
  return [
    { type: "text", text },
    buildDutyFlex({
      title: "🧹 本週值日狀態",
      weekKey,
      groupName: checklistWeek.groupName,
      members: checklistWeek.members,
      tasks: checklistWeek.tasks,
    }),
  ];
}

module.exports = {
  buildDutyFlex,
  buildAllDoneMessage,
  buildTodoListMessage,
  buildDutyGroupSelector,
  buildDutySwitchMessages,
};
