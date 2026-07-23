// Verifies Upstash Redis read/write works before you rely on it elsewhere.
// Run with: UPSTASH_REDIS_REST_URL=xxx UPSTASH_REDIS_REST_TOKEN=xxx npm run test:db

const { readDb, writeDb } = require("../lib/db");

(async () => {
  if (!process.env.UPSTASH_REDIS_REST_URL || !process.env.UPSTASH_REDIS_REST_TOKEN) {
    console.error("Missing UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN env vars.");
    process.exit(1);
  }

  console.log("Reading current state from Upstash...");
  const before = await readDb();
  console.log(JSON.stringify(before, null, 2));

  console.log("\nWriting a temporary test value...");
  const marker = Date.now();
  await writeDb({ ...before, __test_ping: marker });

  const after = await readDb();
  const ok = after.__test_ping === marker;
  console.log(ok ? "✅ Round-trip write/read succeeded." : "❌ Round-trip failed, values did not match.");

  delete after.__test_ping;
  await writeDb(after);
  console.log("Cleaned up the test key. Your real data above is untouched.");

  process.exit(ok ? 0 : 1);
})();
