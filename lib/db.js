const { Redis } = require("@upstash/redis");
const config = require("../config");

// 用 Upstash Redis（免費、REST API 存取）取代本地 JSON 檔案。
// 這樣不管主機睡了幾次、重新部署幾次，資料都不會不見，
// 因為資料是存在 Upstash 那邊的雲端服務，跟你的伺服器本身無關。
const redis = new Redis({
  url: config.UPSTASH_REDIS_REST_URL,
  token: config.UPSTASH_REDIS_REST_TOKEN,
});

const STATE_KEY = "OhanaMeansFamily:state";
const DEFAULT_STATE = { weeks: {}, todos: [], nextTodoId: 1 };

async function readDb() {
  const data = await redis.get(STATE_KEY);
  if (!data) return { ...DEFAULT_STATE };
  return data;
}

async function writeDb(data) {
  await redis.set(STATE_KEY, data);
}

module.exports = { readDb, writeDb };
