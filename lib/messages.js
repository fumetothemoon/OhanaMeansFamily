// 組出「值日任務清單」的 Flex Message，每項工作旁邊有一個「回報完成」按鈕
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

module.exports = { buildDutyFlex, buildAllDoneMessage, buildTodoListMessage };
