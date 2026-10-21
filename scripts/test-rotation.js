// Quick sanity check for the rotation logic — no network calls, no LINE, no Upstash needed.
// 快速檢查輪值邏輯，無需網路呼叫、LINE 或 Upstash。
// Run with: npm run test:rotation
// 執行方式：npm run test:rotation

const assert = require("node:assert/strict");
const dayjs = require("dayjs");
const config = require("../config");
const { getWeekKey, getGroupForWeek } = require("../lib/rotation");

async function main() {
  const todayKey = getWeekKey();
  console.log(`Current week key: ${todayKey}`);
  console.log(`Configured on-duty group:`, await getGroupForWeek(todayKey, {}));

  const expectedGroups = [
    ["Jane", "范"],
    ["傅"],
    ["Jean", "升"],
  ];

  for (const [index, members] of expectedGroups.entries()) {
    const weekKey = dayjs(config.ROTATION_START_MONDAY)
      .add(index, "week")
      .format("YYYY-MM-DD");
    assert.deepStrictEqual((await getGroupForWeek(weekKey, {})).members, members);
  }

  const previousWeek = dayjs(config.ROTATION_START_MONDAY)
    .subtract(1, "week")
    .format("YYYY-MM-DD");
  assert.equal((await getGroupForWeek(previousWeek, {})).index, 2);

  console.log("Rotation order assertions passed.");
  console.log("\n--- Configured rotation preview (this week + next 5 weeks) ---");
  for (let i = 0; i < 6; i++) {
    const d = dayjs().add(i * 7, "day");
    const weekKey = getWeekKey(d);
    const group = await getGroupForWeek(weekKey, {});
    console.log(`${weekKey} -> ${group.name} (${group.members.join(", ")})`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
