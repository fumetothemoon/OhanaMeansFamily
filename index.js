// App bootstrap: create the Express app, mount routes, start listening.
// See routes/webhook.js and routes/cron.js for the actual request-handling logic,
// and handlers/postback.js + handlers/commands.js for how each event type is processed.
// 應用程式啟動進入點：建立 Express app、掛載路由、啟動監聽。
// 實際的請求處理邏輯請見 routes/webhook.js 與 routes/cron.js，
// 各類事件的實際處理方式則在 handlers/postback.js 與 handlers/commands.js。

const express = require("express");
const webhookRouter = require("./routes/webhook");
const cronRouter = require("./routes/cron");

const app = express();

app.use(webhookRouter);
app.use(cronRouter);

app.get("/", (req, res) => res.send("OhanaMeansFamily is running"));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () =>
  console.log(`OhanaMeansFamily listening on port ${PORT}`),
);
