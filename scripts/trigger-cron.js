// Cross-platform helper (works on macOS/Linux/Windows) to POST to a /cron/* endpoint.
// 跨平台輔助工具（適用於 macOS/Linux/Windows），用來向 /cron/* 端點發送 POST 請求。
// By default targets your local server (http://localhost:PORT).
// 預設會呼叫本機伺服器（http://localhost:PORT）。
// If APP_URL is set (e.g. via .env.production), it targets that instead — used by the npm run *:prod scripts to hit Render directly.
// 若設定 APP_URL（例如透過 .env.production），則會改為呼叫該網址，供 npm run *:prod 指令直接呼叫 Render。
// Called via the npm scripts: npm run cron:weekly-kickoff / cron:midweek / cron:weekend / cron:monthly-todo (and their :prod variants)
// 透過 npm 指令執行：npm run cron:weekly-kickoff / cron:midweek / cron:weekend / cron:monthly-todo（以及各自的 :prod 版本）。

const endpoint = process.argv[2];
if (!endpoint) {
  console.error("Usage: node scripts/trigger-cron.js <endpoint-name>");
  process.exit(1);
}

const secret = process.env.CRON_SECRET;
if (!secret) {
  console.error(
    "Missing CRON_SECRET env var. Set the same value you passed to `npm run dev` (or in .env.production for :prod scripts).",
  );
  process.exit(1);
}

const port = process.env.PORT || 3000;
const baseUrl = process.env.APP_URL || `http://localhost:${port}`;
const url = `${baseUrl}/cron/${endpoint}`;

console.log(`Targeting: ${url}`);

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
    if (baseUrl.includes("localhost")) {
      console.error(
        "Is your local server running? Try `npm run dev` in another terminal first.",
      );
    }
    process.exit(1);
  });
