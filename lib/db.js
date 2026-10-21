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
const snapshots = new WeakMap();
const UPDATE_DB_SCRIPT = `
  local function isObject(value)
    return type(value) == "table" and value ~= cjson.null and #value == 0
  end
  local function equal(a, b)
    if a == cjson.null or b == cjson.null then return a == b end
    if type(a) ~= type(b) then return false end
    if type(a) ~= "table" then return a == b end
    for key, value in pairs(a) do
      if not equal(value, b[key]) then return false end
    end
    for key, value in pairs(b) do
      if not equal(value, a[key]) then return false end
    end
    return true
  end
  local function isRecordArray(value, other)
    if type(value) ~= "table" then return false end
    if #value > 0 then
      return type(value[1]) == "table" and value[1].id ~= nil
    end
    if next(value) ~= nil or type(other) ~= "table" or #other == 0 then return false end
    return type(other[1]) == "table" and other[1].id ~= nil
  end
  local function applyChanges(current, original, updated, rotationChanged)
    local keys = {}
    for key in pairs(original) do keys[key] = true end
    for key in pairs(updated) do keys[key] = true end
    for key in pairs(keys) do
      local before = original[key]
      local after = updated[key]
      local rotationField = key == "rotationAnchor" or key == "rotationVersion"
        or key == "groupIndex" or key == "groupName" or key == "members"
      if not (rotationChanged and rotationField) and not equal(before, after) then
        if after == nil then
          current[key] = nil
        elseif isRecordArray(before, after) or isRecordArray(after, before) then
          local currentRecords = current[key]
          if type(currentRecords) ~= "table" then currentRecords = {} end
          local currentById = {}
          local originalById = {}
          local updatedById = {}
          for _, record in ipairs(currentRecords) do
            currentById[record.id] = record
          end
          for _, record in ipairs(before or {}) do
            originalById[record.id] = record
          end
          for _, record in ipairs(after or {}) do
            updatedById[record.id] = record
          end
          local merged = {}
          local included = {}
          for _, record in ipairs(after or {}) do
            local latest = currentById[record.id]
            local originalRecord = originalById[record.id]
            if latest and originalRecord then
              applyChanges(latest, originalRecord, record, rotationChanged)
              merged[#merged + 1] = latest
            else
              merged[#merged + 1] = latest or record
            end
            included[record.id] = true
          end
          for _, record in ipairs(currentRecords) do
            if not originalById[record.id] and not included[record.id] then
              merged[#merged + 1] = record
              included[record.id] = true
            elseif originalById[record.id]
              and not updatedById[record.id]
              and not equal(record, originalById[record.id]) then
              merged[#merged + 1] = record
            end
          end
          current[key] = merged
        elseif isObject(before) and isObject(after) then
          if not isObject(current[key]) then current[key] = {} end
          applyChanges(current[key], before, after, rotationChanged)
        else
          current[key] = after
        end
      end
    end
  end
  local raw = redis.call("GET", KEYS[1])
  local original = cjson.decode(ARGV[1])
  local updated = cjson.decode(ARGV[2])
  -- Absent keys start from the caller's snapshot so unchanged defaults are kept.
  -- 鍵不存在時以呼叫端快照為底，保留沒有改動的預設欄位。
  local current = raw and cjson.decode(raw) or original
  local rotationChanged = not equal(current.rotationVersion, original.rotationVersion)
  applyChanges(current, original, updated, rotationChanged)
  redis.call("SET", KEYS[1], cjson.encode(current))
  return "OK"
`;
const CREATE_WEEK_IF_MISSING_SCRIPT = `
  local raw = redis.call("GET", KEYS[1])
  local db = raw and cjson.decode(raw) or { weeks = {}, todos = {}, nextTodoId = 1 }
  db.weeks = db.weeks or {}
  if db.weeks[ARGV[1]] then
    return cjson.encode(db.weeks[ARGV[1]])
  end
  db.weeks[ARGV[1]] = cjson.decode(ARGV[2])
  redis.call("SET", KEYS[1], cjson.encode(db))
  return cjson.encode(db.weeks[ARGV[1]])
`;
const SYNC_WEEK_GROUP_IF_ANCHOR_MATCHES_SCRIPT = `
  local raw = redis.call("GET", KEYS[1])
  if not raw then return nil end
  local db = cjson.decode(raw)
  local week = db.weeks and db.weeks[ARGV[1]]
  if not week then return nil end
  local expectedAnchor = cjson.decode(ARGV[2])
  local currentAnchor = db.rotationAnchor
  if expectedAnchor == cjson.null then
    if currentAnchor ~= nil then return cjson.encode(week) end
  elseif not currentAnchor
    or currentAnchor.weekKey ~= expectedAnchor.weekKey
    or currentAnchor.groupIndex ~= expectedAnchor.groupIndex then
    return cjson.encode(week)
  end
  local group = cjson.decode(ARGV[3])
  week.groupIndex = tonumber(group.index)
  week.groupName = group.name
  week.members = group.members
  redis.call("SET", KEYS[1], cjson.encode(db))
  return cjson.encode(week)
`;
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
  const state = data || structuredClone(DEFAULT_STATE);
  if (!Array.isArray(state.todos)) state.todos = [];
  snapshots.set(state, structuredClone(state));
  return state;
}

async function writeDb(data) {
  const original = snapshots.get(data);
  if (!original) throw new Error("writeDb requires state returned by readDb()");
  await redis.eval(UPDATE_DB_SCRIPT, [STATE_KEY], [
    JSON.stringify(original),
    JSON.stringify(data),
  ]);
  snapshots.set(data, structuredClone(data));
}

async function createWeekIfMissing(weekKey, week) {
  const result = await redis.eval(CREATE_WEEK_IF_MISSING_SCRIPT, [STATE_KEY], [
    weekKey,
    JSON.stringify(week),
  ]);
  return typeof result === "string" ? JSON.parse(result) : result;
}

async function syncWeekGroupIfAnchorMatches(weekKey, expectedAnchor, group) {
  const result = await redis.eval(SYNC_WEEK_GROUP_IF_ANCHOR_MATCHES_SCRIPT, [STATE_KEY], [
    weekKey,
    JSON.stringify(expectedAnchor || null),
    JSON.stringify(group),
  ]);
  return typeof result === "string" ? JSON.parse(result) : result;
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
  createWeekIfMissing,
  syncWeekGroupIfAnchorMatches,
  readNotificationState,
  setNotificationDelivered,
  clearNotificationState,
  runAtomic,
};
