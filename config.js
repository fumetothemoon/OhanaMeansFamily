// ============================================================
// 設定檔：把這裡的內容改成你們家真實的資料就好，其他程式碼不用動
// ============================================================

module.exports = {
  // LINE 憑證，實際數值請用環境變數設定（部署平台的 Environment Variables）
  // 不要把 token 寫死在這裡並上傳到公開的 GitHub repo
  LINE_CHANNEL_ACCESS_TOKEN: process.env.LINE_CHANNEL_ACCESS_TOKEN,
  LINE_CHANNEL_SECRET: process.env.LINE_CHANNEL_SECRET,

  // 你們的群組 ID。一開始不知道沒關係，部署後在群組裡發一句話，
  // 到後台 log 裡面就會印出 groupId，複製貼過來即可。
  GROUP_ID: process.env.LINE_GROUP_ID || "",

  TIMEZONE: "Asia/Taipei",

  // 用來保護 /cron/* 觸發端點的密鑰，避免別人隨便打你的網址就能發訊息。
  // 這組字串你自己隨便設一個(英數字亂打一串即可)，
  // 要跟 GitHub Actions 那邊設定的 secret 一模一樣。
  CRON_SECRET: process.env.CRON_SECRET,

  // Upstash Redis（免費的雲端 key-value 資料庫），用來存值日狀態跟待辦清單。
  // 不管主機睡幾次、重新部署幾次都不會遺失資料。
  // 到 https://console.upstash.com/ 建立一個免費 Redis database 後，
  // 在該 database 的 "REST API" 分頁可以看到這兩組值。
  UPSTASH_REDIS_REST_URL: process.env.UPSTASH_REDIS_REST_URL,
  UPSTASH_REDIS_REST_TOKEN: process.env.UPSTASH_REDIS_REST_TOKEN,

  // ------------------------------------------------------------
  // 輪值分組：每週輪一組，照順序輪替，輪完自動回到第一組
  // ------------------------------------------------------------
  ROTATION_GROUPS: [
    { name: "第一組", members: ["我"] },
    { name: "第二組", members: ["Jane", "范老師"] },
    { name: "第三組", members: ["詠晴", "阿升"] },
  ],

  // 輪值的起算基準週。這一週(週一)算「第一組」值日，
  // 之後每過一週往下一組輪。只要改這個日期就能對齊實際輪值進度。
  // 格式 YYYY-MM-DD，一定要填「星期一」的日期。
  ROTATION_START_MONDAY: "2026-07-27",

  // ------------------------------------------------------------
  // 值日生工作項目（六項，各自獨立回報）
  // ------------------------------------------------------------
  DUTY_TASKS: [
    "前陽台菸灰缸清乾淨、加水",
    "吸塵所有公共區域",
    "廚房水槽清潔、更換濾網",
    "倒垃圾",
    "清倒廚餘機垃圾",
    "清潔保養吸塵器",
  ],

  // ------------------------------------------------------------
  // 提醒時間僅供參考說明用，實際排程已改由 GitHub Actions 觸發
  // （見 .github/workflows/reminders.yml），這裡不用改也不會生效。
  // ------------------------------------------------------------
  SCHEDULE: {
    WEEKLY_KICKOFF: "週一 17:00 台灣時間 — 發本週任務清單",
    MIDWEEK_REMINDER: "週三 17:00 台灣時間 — 提醒未完成項目",
    WEEKEND_REMINDER: "週日 17:00 台灣時間 — 提醒未完成項目（週末結束前）",
    MONTHLY_TODO_REMINDER: "每月 1 號 09:00 台灣時間 — 提醒當月待辦清單",
  },
};
