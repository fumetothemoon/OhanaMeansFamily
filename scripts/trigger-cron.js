// Cross-platform helper (works on macOS/Linux/Windows) to POST to a running
// local server's /cron/* endpoint, so you don't need curl or shell-specific syntax.
// Called via the npm scripts: npm run cron:weekly-kickoff / cron:midweek / cron:weekend / cron:monthly-todo

const endpoint = process.argv[2];
if (!endpoint) {
  console.error("Usage: node scripts/trigger-cron.js <endpoint-name>");
  process.exit(1);
}

const port = process.env.PORT || 3000;
const secret = process.env.CRON_SECRET;
if (!secret) {
  console.error("Missing CRON_SECRET env var. Set the same value you passed to `npm run dev`.");
  process.exit(1);
}

const url = `http://localhost:${port}/cron/${endpoint}`;

fetch(url, {
  method: "POST",
  headers: { "x-cron-secret": secret },
})
  .then(async (res) => {
    const body = await res.text();
    console.log(`${res.status} ${res.statusText} — ${url}`);
    if (body) console.log(body);
    if (!res.ok) process.exit(1);
  })
  .catch((err) => {
    console.error(`Request to ${url} failed: ${err.message}`);
    console.error("Is your local server running? Try `npm run dev` in another terminal first.");
    process.exit(1);
  });
