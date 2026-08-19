# OhanaMeansFamily Review Instructions

OhanaMeansFamily is a LINE group chatbot that sends household chore rotation reminders. Review changes in the context of a small Node.js service that handles LINE webhook events, chore rotation state, reminders, and Redis-backed data.

## Code Style

- Comments must be bilingual: English first, followed by Traditional Chinese.
- Use CommonJS (`require`/`module.exports`), not ES modules.
- Use `async`/`await`; do not introduce raw `.then()` chains.

## Architecture

- `index.js` is application bootstrap only.
- `routes/` contains Express route handlers.
- `handlers/` processes LINE events, including postbacks and text commands.
- `lib/` contains shared logic such as rotation, database access, messages, reminders, and the LINE client.

## Review Priorities

- Flag route handlers that can leave errors unhandled. Every route should use `try`/`catch` so an error cannot crash the server.
- Flag secrets or tokens that could be logged or committed.
- Flag comments that do not follow the English-then-Traditional-Chinese convention when comments are added or changed.
- Do not repeatedly flag the known double-tap race condition when completing a task. Concurrent Upstash writes for that specific behavior are deliberately deferred and tracked separately.
