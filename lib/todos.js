const dayjs = require("dayjs");
const { readDb, writeDb } = require("./db");

async function listTodos({ onlyOpen = false } = {}) {
  const db = await readDb();
  const todos = db.todos || [];
  return onlyOpen ? todos.filter((t) => !t.done) : todos;
}

async function addTodo(text, addedBy) {
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
