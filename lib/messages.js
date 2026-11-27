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

// {mentions} is replaced with the next group's slots, joined with 、.
// {mentions} 會換成下一組的位子，並以 、 連接。
const ALL_DONE_TEXT = "感謝本週值日生的服務🎀下週換{mentions}接手🙏";

function allDoneSentence(mentions) {
  return ALL_DONE_TEXT.replace("{mentions}", mentions);
}

// Config override wins. Otherwise the hash value wins. Both require an exact name.
// 設定覆寫優先，否則採用 hash 的值。兩者都必須名稱完全相符。
function lookupMemberUserId(name, storedIds) {
  const overrides = config.MEMBER_USER_IDS || {};
  if (Object.prototype.hasOwnProperty.call(overrides, name)) {
    const override = overrides[name];
    if (typeof override === "string" && override.length > 0) return override;
  }
  if (storedIds && Object.prototype.hasOwnProperty.call(storedIds, name)) {
    const stored = storedIds[name];
    if (typeof stored === "string" && stored.length > 0) return stored;
  }
  return null;
}

// Build the all-done push. Members with a userId become textV2 mention
// substitutions (next1, next2, …). A member without an id stays as their
// plain config name in that slot, with no typed @. If nobody has an id,
// the same sentence is a plain text message.
// 組全部完成的推播。有 userId 的成員做成 textV2 的 mention 替換（next1、next2…）。
// 沒有 id 的成員在原位放設定名稱，不加假的 @。若全部都沒有 id，同一句改為純文字。
function buildAllDoneMessage(memberNames, storedIds) {
  const parts = [];
  const substitution = {};
  let mentionCount = 0;
  for (const name of memberNames) {
    const userId = lookupMemberUserId(name, storedIds);
    if (!userId) {
      // Log the name and why, never a userId.
      // 只記錄名稱與原因，不記錄 userId。
      console.warn(
        `[all-done] mention fallback for ${name}: no userId for this exact name 找不到此精確名稱的 userId`,
      );
      parts.push(name);
      continue;
    }
    mentionCount += 1;
    const key = `next${mentionCount}`;
    parts.push(`{${key}}`);
    substitution[key] = {
      type: "mention",
      mentionee: { type: "user", userId },
    };
  }
  const text = allDoneSentence(parts.join("、"));
  if (mentionCount === 0) return { type: "text", text };
  return { type: "textV2", text, substitution };
}

// Same sentence with every name in plain text, used when a mention push is rejected.
// 同一句話，每個名字都是純文字，用於 mention 推播被拒絕時。
function buildAllDonePlainText(memberNames) {
  return { type: "text", text: allDoneSentence(memberNames.join("、")) };
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
  buildAllDonePlainText,
  buildTodoListMessage,
  buildDutyGroupSelector,
  buildDutySwitchMessages,
};
