const dayjs = require("dayjs");
const { readDb, writeDb } = require("./db");

function listTodos({ onlyOpen = false } = {}) {
  const db = readDb();
  const todos = db.todos || [];
  return onlyOpen ? todos.filter((t) => !t.done) : todos;
}

function addTodo(text, addedBy) {
  const db = readDb();
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
  writeDb(db);
  return todo;
}

function completeTodo(id, byName) {
  const db = readDb();
  const todo = (db.todos || []).find((t) => t.id === Number(id));
  if (!todo) return null;
  todo.done = true;
  todo.doneBy = byName || "室友";
  writeDb(db);
  return todo;
}

module.exports = { listTodos, addTodo, completeTodo };
