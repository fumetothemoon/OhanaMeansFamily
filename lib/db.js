const { Redis } = require("@upstash/redis");
const config = require("../config");

// Use Upstash Redis (free, accessed through its REST API) instead of a local JSON file.
// 用 Upstash Redis（免費、REST API 存取）取代本地 JSON 檔案。
// This keeps data when the host sleeps or the app is redeployed.
// 這樣不管主機睡了幾次、重新部署幾次，資料都不會不見，
// The data lives in Upstash's cloud service, independently of this server.
// 因為資料是存在 Upstash 那邊的雲端服務，跟你的伺服器本身無關。
const redis = new Redis({
  url: config.UPSTASH_REDIS_REST_URL,
  token: config.UPSTASH_REDIS_REST_TOKEN,
});

const STATE_KEY = "OhanaMeansFamily:state";
const NOTIFICATIONS_KEY = "OhanaMeansFamily:notifications";
const DEFAULT_STATE = { weeks: {}, todos: [], nextTodoId: 1 };
const MARK_NOTIFICATION_DELIVERED_SCRIPT = `
  local raw = redis.call("HGET", KEYS[2], ARGV[1])
  local state = raw and cjson.decode(raw) or { checklist = {} }
  state.checklist = state.checklist or {}
  if ARGV[3] == "checklist" then
    state.checklist[ARGV[2]] = true
  elseif ARGV[3] == "allDone" then
    state.allDoneDelivered = true
  end
  local encoded = cjson.encode(state)
  redis.call("HSET", KEYS[2], ARGV[1], encoded)
  return encoded
`;
const CLEAR_NOTIFICATION_STATE_SCRIPT = `
  return redis.call("HDEL", KEYS[2], ARGV[1])
`;

async function readDb() {
  const data = await redis.get(STATE_KEY);
  if (!data) return { ...DEFAULT_STATE };
  return data;
}

async function writeDb(data) {
  await redis.set(STATE_KEY, data);
}

async function readNotificationState(weekKey) {
  const data = await redis.hget(NOTIFICATIONS_KEY, weekKey);
  if (!data) return {};
  return typeof data === "string" ? JSON.parse(data) : data;
}

async function runAtomic(script, keys, args) {
  return redis.eval(script, [STATE_KEY, ...keys], args);
}

async function setNotificationDelivered(weekKey, taskId, notification) {
  await runAtomic(
    MARK_NOTIFICATION_DELIVERED_SCRIPT,
    [NOTIFICATIONS_KEY],
    [weekKey, String(taskId), notification],
  );
}

async function clearNotificationState(weekKey) {
  await runAtomic(CLEAR_NOTIFICATION_STATE_SCRIPT, [NOTIFICATIONS_KEY], [weekKey]);
}

module.exports = {
  readDb,
  writeDb,
  readNotificationState,
  setNotificationDelivered,
  clearNotificationState,
  runAtomic,
};
