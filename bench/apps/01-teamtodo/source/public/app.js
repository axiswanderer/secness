let token = localStorage.getItem("token");
let currentTodo = null;

async function api(path, options = {}) {
  const res = await fetch(path, {
    ...options,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, ...options.headers },
  });
  if (!res.ok) throw new Error((await res.json()).error);
  return res.status === 204 ? null : res.json();
}

async function loadTodos() {
  const todos = await api("/api/todos");
  const list = document.getElementById("todos");
  list.textContent = "";
  for (const todo of todos) {
    const li = document.createElement("li");
    li.textContent = todo.title;
    li.onclick = () => openTodo(todo);
    list.appendChild(li);
  }
}

async function openTodo(todo) {
  currentTodo = todo;
  document.getElementById("detail").hidden = false;
  document.getElementById("detail-title").textContent = todo.title;
  const comments = await api(`/api/todos/${todo.id}/comments`);
  document.getElementById("comments").innerHTML = comments
    .map((c) => `<li><strong>${c.author}</strong>: ${c.body}</li>`)
    .join("");
}

document.getElementById("login").onsubmit = async (e) => {
  e.preventDefault();
  const form = new FormData(e.target);
  const res = await fetch("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(Object.fromEntries(form)),
  });
  const data = await res.json();
  if (!res.ok) return alert(data.error);
  token = data.token;
  localStorage.setItem("token", token);
  showApp();
};

document.getElementById("new-todo").onsubmit = async (e) => {
  e.preventDefault();
  await api("/api/todos", { method: "POST", body: JSON.stringify({ title: e.target.title.value }) });
  e.target.reset();
  loadTodos();
};

document.getElementById("new-comment").onsubmit = async (e) => {
  e.preventDefault();
  await api(`/api/todos/${currentTodo.id}/comments`, {
    method: "POST",
    body: JSON.stringify({ body: e.target.body.value }),
  });
  e.target.reset();
  openTodo(currentTodo);
};

function showApp() {
  document.getElementById("login").hidden = true;
  document.getElementById("app").hidden = false;
  loadTodos();
}

if (token) showApp();
