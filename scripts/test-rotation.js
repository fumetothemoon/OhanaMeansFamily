// Quick sanity check for the rotation logic — no network calls, no LINE, no Upstash needed.
// Run with: npm run test:rotation

const dayjs = require("dayjs");
const { getWeekKey, getGroupForWeek } = require("../lib/rotation");

const todayKey = getWeekKey();
console.log(`Current week key: ${todayKey}`);
console.log(`Current on-duty group:`, getGroupForWeek(todayKey));

console.log("\n--- Rotation preview (this week + next 5 weeks) ---");
for (let i = 0; i < 6; i++) {
  const d = dayjs().add(i * 7, "day");
  const weekKey = getWeekKey(d);
  const group = getGroupForWeek(weekKey);
  console.log(`${weekKey} -> ${group.name} (${group.members.join(", ")})`);
}
