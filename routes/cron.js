// Express router for the /cron/* endpoints, triggered by GitHub Actions on a schedule.
// This lets the server sleep when idle instead of running 24/7.
// /cron/* 端點的 Express router，由 GitHub Actions 定時觸發，
// 讓伺服器閒置時可以休眠，不需要 24 小時常駐。

const express = require("express");
const config = require("../config");
const {
  sendWeeklyKickoff,
  sendMidweekOrWeekendReminder,
  sendMonthlyTodoReminder,
} = require("../lib/reminders");

const router = express.Router();

// Every request must include the correct secret header, or it's rejected.
// 每個請求都必須帶正確的密鑰標頭，否則一律拒絕。
function checkCronSecret(req, res) {
  const secret = req.get("x-cron-secret");
  if (!config.CRON_SECRET || secret !== config.CRON_SECRET) {
    res.status(401).send("unauthorized");
    return false;
  }
  return true;
}

router.post("/cron/weekly-kickoff", express.json(), async (req, res) => {
  if (!checkCronSecret(req, res)) return;
  try {
    await sendWeeklyKickoff();
    res.send("ok");
  } catch (e) {
    console.error("weekly-kickoff failed:", e);
    res.status(500).send("error");
  }
});

router.post("/cron/midweek", express.json(), async (req, res) => {
  if (!checkCronSecret(req, res)) return;
  try {
    await sendMidweekOrWeekendReminder("週間");
    res.send("ok");
  } catch (e) {
    console.error("midweek reminder failed:", e);
    res.status(500).send("error");
  }
});

router.post("/cron/weekend", express.json(), async (req, res) => {
  if (!checkCronSecret(req, res)) return;
  try {
    await sendMidweekOrWeekendReminder("週末");
    res.send("ok");
  } catch (e) {
    console.error("weekend reminder failed:", e);
    res.status(500).send("error");
  }
});

router.post("/cron/monthly-todo", express.json(), async (req, res) => {
  if (!checkCronSecret(req, res)) return;
  try {
    await sendMonthlyTodoReminder();
    res.send("ok");
  } catch (e) {
    console.error("monthly todo reminder failed:", e);
    res.status(500).send("error");
  }
});

module.exports = router;
