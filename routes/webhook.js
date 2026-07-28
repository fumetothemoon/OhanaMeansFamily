// Express router for the LINE webhook endpoint.
// LINE webhook 端點的 Express router。

const express = require("express");
const line = require("@line/bot-sdk");
const { lineConfig } = require("../lib/lineClient");
const { handlePostback } = require("../handlers/postback");
const { handleTextMessage } = require("../handlers/commands");

const router = express.Router();

router.post("/webhook", line.middleware(lineConfig), async (req, res) => {
  // Acknowledge LINE immediately, then process events in the background.
  // 先立即回應 LINE 避免逾時重送，事件則在背景處理。
  res.status(200).end();
  try {
    await Promise.all((req.body.events || []).map(handleEvent));
  } catch (e) {
    console.error("Error handling event(s) 處理事件時發生錯誤:", e);
  }
});

async function handleEvent(event) {
  const source = event.source || {};
  if (source.type === "group" && source.groupId) {
    // Handy during first-time setup, to find your groupId. 方便第一次設定時取得 groupId。
    console.log("Current group groupId 目前群組 groupId =", source.groupId);
  }

  if (event.type === "postback") {
    return handlePostback(event);
  }

  if (event.type === "message" && event.message.type === "text") {
    return handleTextMessage(event);
  }
}

module.exports = router;
