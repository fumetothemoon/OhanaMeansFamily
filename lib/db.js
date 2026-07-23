const fs = require("fs");
const path = require("path");

// 資料存在這個 JSON 檔裡（記得部署平台要有「持久化磁碟」，
// 不然每次重啟服務資料會消失，詳見 README 的部署說明）
const DB_PATH = path.join(__dirname, "..", "data", "db.json");

function ensureDbFile() {
  const dir = path.dirname(DB_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  if (!fs.existsSync(DB_PATH)) {
    fs.writeFileSync(
      DB_PATH,
      JSON.stringify({ weeks: {}, todos: [], nextTodoId: 1 }, null, 2)
    );
  }
}

function readDb() {
  ensureDbFile();
  const raw = fs.readFileSync(DB_PATH, "utf-8");
  return JSON.parse(raw);
}

function writeDb(data) {
  ensureDbFile();
  fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2));
}

module.exports = { readDb, writeDb };
