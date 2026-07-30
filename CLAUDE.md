# Project Context for Claude

This is OhanaMeansFamily — a LINE group chatbot for household chore rotation reminders.

## Code style

- Bilingual comments (English then Traditional Chinese) throughout
- CommonJS (`require`/`module.exports`), not ES modules
- Async/await, no raw `.then()` chains

## Architecture

- `index.js` — app bootstrap only
- `routes/` — Express route handlers
- `handlers/` — LINE event processing (postback, text commands)
- `lib/` — shared logic (rotation, db, messages, reminders, LINE client)

## Review priorities

- Flag anything that could crash the server on an unhandled error (routes should always try/catch)
- Flag race conditions on concurrent Upstash writes (known existing gap: double-tap on task completion)
- Flag secrets or tokens that might get logged or committed
