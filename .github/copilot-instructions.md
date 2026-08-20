# OhanaMeansFamily Review Instructions 審查說明

OhanaMeansFamily is a LINE group chatbot that sends household chore rotation reminders. Review changes in the context of a small Node.js service that handles LINE webhook events, chore rotation state, reminders, and Redis-backed data.
OhanaMeansFamily 是傳送家務輪值提醒的 LINE 群組聊天機器人。請以小型 Node.js 服務的脈絡審查變更；它處理 LINE webhook 事件、家務輪值狀態、提醒和 Redis 支援的資料。

## Code Style 程式碼風格

- Comments must be bilingual: English first, followed by Traditional Chinese.
  註解必須使用雙語：英文在前，繁體中文在後。
- Use CommonJS (`require`/`module.exports`), not ES modules.
  使用 CommonJS（`require`/`module.exports`），不要使用 ES modules。
- Use `async`/`await`; do not introduce raw `.then()` chains.
  使用 `async`/`await`；不要引入原始 `.then()` 串接。

## Architecture 架構

- `index.js` is application bootstrap only.
  `index.js` 僅負責應用程式啟動。
- `routes/` contains Express route handlers.
  `routes/` 包含 Express 路由處理常式。
- `handlers/` processes LINE events, including postbacks and text commands.
  `handlers/` 處理 LINE 事件，包括 postback 和文字指令。
- `lib/` contains shared logic such as rotation, database access, messages, reminders, and the LINE client.
  `lib/` 包含共用邏輯，例如輪值、資料庫存取、訊息、提醒和 LINE client。

## Review Priorities 審查重點

- Flag route handlers that can leave errors unhandled. Every route should use `try`/`catch` so an error cannot crash the server.
  標示可能讓錯誤未被處理的路由處理常式。每個路由都應使用 `try`/`catch`，避免錯誤造成伺服器當機。
- Flag secrets or tokens that could be logged or committed.
  標示可能被記錄到 log 或提交進版本控制的機密與 token。
- Flag comments that do not follow the English-then-Traditional-Chinese convention when comments are added or changed.
  新增或修改註解時，標示未遵守英文在前、繁體中文在後慣例的註解。
- Do not repeatedly flag the known double-tap race condition when completing a task. Concurrent Upstash writes for that specific behavior are deliberately deferred and tracked separately.
  不要重複標示完成工作時已知的雙擊 race condition。該行為的並行 Upstash 寫入是刻意延後處理，並另行追蹤。
