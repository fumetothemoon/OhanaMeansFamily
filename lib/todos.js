const dayjs = require("dayjs");
const { readDb, writeDb, runAtomic } = require("./db");

const ADD_TODO_ONCE_SCRIPT = `
  local existing = redis.call("GET", KEYS[2])
  if existing then return existing end

  local raw = redis.call("GET", KEYS[1])
  local db = raw and cjson.decode(raw) or {}
  db.weeks = db.weeks or {}
  db.todos = db.todos or {}
  local id = tonumber(db.nextTodoId) or 1
  local todo = {
    id = id,
    text = ARGV[1],
    addedBy = ARGV[2],
    done = false,
    doneBy = cjson.null,
    createdAt = ARGV[3]
  }
  table.insert(db.todos, todo)
  db.nextTodoId = id + 1

  local encoded = cjson.encode(todo)
  redis.call("SET", KEYS[1], cjson.encode(db))
  redis.call("SET", KEYS[2], encoded, "EX", ARGV[4])
  return encoded
`;

async function listTodos({ onlyOpen = false } = {}) {
  const db = await readDb();
  const todos = db.todos || [];
  return onlyOpen ? todos.filter((t) => !t.done) : todos;
}

async function addTodo(text, addedBy, webhookEventId) {
  if (webhookEventId) {
    const encoded = await runAtomic(
      ADD_TODO_ONCE_SCRIPT,
      [`OhanaMeansFamily:webhook-event:${webhookEventId}`],
      [text, addedBy || "室友", dayjs().format("YYYY-MM-DD HH:mm"), 2592000],
    );
    return typeof encoded === "string" ? JSON.parse(encoded) : encoded;
  }

  const db = await readDb();
  const id = db.nextTodoId || 1;
  const todo = {
    id,
    text,
    addedBy: addedBy || "室友",
    done: false,
    doneBy: null,
    createdAt: dayjs().format("YYYY-MM-DD HH:mm"),
  };
  db.todos = db.todos || [];
  db.todos.push(todo);
  db.nextTodoId = id + 1;
  await writeDb(db);
  return todo;
}

async function completeTodo(id, byName) {
  const db = await readDb();
  const todo = (db.todos || []).find((t) => t.id === Number(id));
  if (!todo) return null;
  todo.done = true;
  todo.doneBy = byName || "室友";
  await writeDb(db);
  return todo;
}

module.exports = { listTodos, addTodo, completeTodo };
