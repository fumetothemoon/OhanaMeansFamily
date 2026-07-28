// LINE Messaging API client setup and shared helpers.
// LINE Messaging API client 的設定與共用輔助函式。

const line = require("@line/bot-sdk");
const config = require("../config");

// Config required by line.middleware() to verify webhook signatures.
// line.middleware() 驗證 webhook 簽章時所需的設定物件。
const lineConfig = {
  channelAccessToken: config.LINE_CHANNEL_ACCESS_TOKEN,
  channelSecret: config.LINE_CHANNEL_SECRET,
};

const client = new line.messagingApi.MessagingApiClient({
  channelAccessToken: config.LINE_CHANNEL_ACCESS_TOKEN,
});

// Get a user's display name, preferring their group profile when available.
// 取得使用者顯示名稱，若在群組內則優先使用群組個人資料。
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
    console.error("Failed to get display name 取得使用者名稱失敗:", e.message);
  }
  return null;
}

// Push one or more messages to the configured household group.
// 推播一則或多則訊息到設定好的家庭群組。
async function pushToGroup(messages) {
  if (!config.GROUP_ID) {
    console.warn(
      "GROUP_ID not set, cannot push message — see README for how to get the groupId. 尚未設定 GROUP_ID，訊息無法推播，請參考 README 說明如何取得 groupId。",
    );
    return;
  }
  await client.pushMessage({
    to: config.GROUP_ID,
    messages: Array.isArray(messages) ? messages : [messages],
  });
}

module.exports = { client, lineConfig, getDisplayName, pushToGroup };
