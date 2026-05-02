# PROJECT-TASK-MANAGER
this is a project task manager where you can create projecta in team or individually and track the record of the progress of the same. It is created using rest API, JAVASCRIPT and CSS
{
  "name": "project-role-task-tracker",
  "version": "1.0.0",
  "description": "Project, team, and task tracking app with REST APIs, validation, relationships, and role-based access control.",
  "main": "server.js",
  "scripts": {
    "start": "node server.js",
    "dev": "node server.js"
  },
  "keywords": [
    "project-management",
    "tasks",
    "rbac",
    "rest-api"
  ],
  "author": "",
  "license": "MIT"
}
function taskCore(task) {
  const canChange = isAdmin() || task.assigneeId === state.user.id || task.createdBy === state.user.id;
  return `
    <h4>${escapeHtml(task.title)}</h4>
    ${task.description ? `<p>${escapeHtml(task.description)}</p>` : ""}
    <div class="task-meta">
      <span class="status-pill ${task.status}">${statusLabel(task.status)}</span>
      <span>${escapeHtml(task.assignee?.name || "Unassigned")}</span>
      <span class="${task.overdue ? "overdue" : ""}">${escapeHtml(task.dueDate)}</span>
    </div>
    <div class="task-meta">
      ${canChange ? `
        <select data-task-status="${task.id}">
          ${statuses.map(([value, label]) => `<option value="${value}" ${value === task.status ? "selected" : ""}>${label}</option>`).join("")}
        </select>
      ` : ""}
      ${isAdmin() ? `<button class="danger-btn" data-delete-task="${task.id}">${icon("trash")} Delete</button>` : ""}
    </div>
  `;
}

function modalView(type) {
  const title = {
    project: "New project",
    task: "New task",
    member: "Add team member"
  }[type];
  return `
    <div class="modal-backdrop">
      <section class="modal" role="dialog" aria-modal="true">
        <header>
          <h2>${title}</h2>
          <button class="icon-btn" title="Close" data-close-modal>${icon("x")}</button>
        </header>
        ${type === "project" ? projectForm() : ""}
        ${type === "task" ? taskForm() : ""}
        ${type === "member" ? memberForm() : ""}
      </section>
    </div>
  `;
}

function projectForm() {
  return `
    <form class="form" data-form="project">
      <div class="field"><label>Name</label><input class="input" name="name" required /></div>
      <div class="field"><label>Description</label><textarea name="description"></textarea></div>
      <button class="primary-btn" type="submit">${icon("folder")} Create project</button>
      <div class="message">${escapeHtml(state.message)}</div>
    </form>
  `;
}

function taskForm() {
  const project = selectedProject();
  const today = new Date().toISOString().slice(0, 10);
  return `
    <form class="form" data-form="task">
      <div class="field"><label>Title</label><input class="input" name="title" required /></div>
      <div class="field"><label>Description</label><textarea name="description"></textarea></div>
      <div class="field"><label>Assignee</label><select name="assigneeId" required>
        ${project.members.map(member => `<option value="${member.user.id}">${escapeHtml(member.user.name)} (${member.role})</option>`).join("")}
      </select></div>
      <div class="field"><label>Status</label><select name="status">${statuses.map(([value, label]) => `<option value="${value}">${label}</option>`).join("")}</select></div>
      <div class="field"><label>Due date</label><input class="input" name="dueDate" type="date" min="${today}" required /></div>
      <button class="primary-btn" type="submit">${icon("plus")} Create task</button>
      <div class="message">${escapeHtml(state.message)}</div>
    </form>
  `;
}

function memberForm() {
  return `
    <form class="form" data-form="member">
      <div class="field"><label>User email</label><input class="input" name="email" type="email" list="users" required /></div>
      <datalist id="users">${state.users.map(user => `<option value="${escapeHtml(user.email)}">${escapeHtml(user.name)}</option>`).join("")}</datalist>
      <div class="field"><label>Role</label><select name="role"><option>Member</option><option>Admin</option></select></div>
      <button class="primary-btn" type="submit">${icon("user")} Save member</button>
      <div class="message">${escapeHtml(state.message)}</div>
    </form>
  `;
}

function bindAuth() {
  document.querySelectorAll("[data-auth-mode]").forEach(button => {
    button.addEventListener("click", () => {
      state.authMode = button.dataset.authMode;
      state.message = "";
      render();
    });
  });
  document.querySelector("#auth-form").addEventListener("submit", async event => {
    event.preventDefault();
    state.message = "";
    const form = Object.fromEntries(new FormData(event.currentTarget).entries());
    try {
      const data = await api(`/api/auth/${state.authMode}`, {
        method: "POST",
        body: JSON.stringify(form)
      });
      setSession(data.token, data.user);
      await refreshAll();
    } catch (error) {
      state.message = error.message;
    }
    render();
  });
}

function bindApp() {
  document.querySelectorAll("[data-project-id]").forEach(button => {
    button.addEventListener("click", async () => {
      state.selectedProjectId = button.dataset.projectId;
      await refreshAll();
      render();
    });
  });
  document.querySelectorAll("[data-open-modal]").forEach(button => {
    button.addEventListener("click", () => {
      state.modal = button.dataset.openModal;
      state.message = "";
      render();
    });
  });
  document.querySelectorAll("[data-close-modal]").forEach(button => {
    button.addEventListener("click", () => {
      state.modal = null;
      state.message = "";
      render();
    });
  });
  document.querySelectorAll("[data-mode]").forEach(button => {
    button.addEventListener("click", () => {
      state.mode = button.dataset.mode;
      render();
    });
  });
  document.querySelectorAll("[data-task-status]").forEach(select => {
    select.addEventListener("change", async () => {
      await api(`/api/tasks/${select.dataset.taskStatus}`, {
        method: "PATCH",
        body: JSON.stringify({ status: select.value })
      });
      await refreshAll();
      render();
    });
  });
  document.querySelectorAll("[data-delete-task]").forEach(button => {
    button.addEventListener("click", async () => {
      await api(`/api/tasks/${button.dataset.deleteTask}`, { method: "DELETE" });
      await refreshAll();
      render();
    });
  });
  document.querySelectorAll("[data-form]").forEach(form => {
    form.addEventListener("submit", handleForm);
  });
  document.querySelector("[data-action='logout']")?.addEventListener("click", async () => {
    try {
      await api("/api/auth/logout", { method: "POST" });
    } finally {
      clearSession();
      render();
    }
  });
}

async function handleForm(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const type = form.dataset.form;
  const values = Object.fromEntries(new FormData(form).entries());
  state.message = "";
  try {
    if (type === "project") {
      const data = await api("/api/projects", { method: "POST", body: JSON.stringify(values) });
      state.selectedProjectId = data.project.id;
    }
    if (type === "task") {
      await api(`/api/projects/${state.selectedProjectId}/tasks`, { method: "POST", body: JSON.stringify(values) });
    }
    if (type === "member") {
      await api(`/api/projects/${state.selectedProjectId}/members`, { method: "POST", body: JSON.stringify(values) });
    }
    state.modal = null;
    await refreshAll();
  } catch (error) {
    state.message = error.message;
  }
  render();
}

bootstrap();

<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>ProjectFlow</title>
    <link rel="stylesheet" href="/styles.css" />
  </head>
  <body>
    <main id="app"></main>
    <script src="/app.js"></script>
  </body>
</html>

:root {
  color-scheme: light;
  --ink: #1f2933;
  --muted: #65758b;
  --line: #d9e2ec;
  --panel: #ffffff;
  --page: #f5f7fa;
  --primary: #0f766e;
  --primary-dark: #115e59;
  --accent: #b45309;
  --danger: #b91c1c;
  --ok: #15803d;
  --todo: #64748b;
  --progress: #2563eb;
  --review: #9333ea;
  --done: #15803d;
  font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
}

* {
  box-sizing: border-box;
}

body {
  margin: 0;
  min-height: 100vh;
  background: var(--page);
  color: var(--ink);
}

button,
input,
select,
textarea {
  font: inherit;
}

button {
  border: 0;
  cursor: pointer;
}

button:disabled {
  cursor: not-allowed;
  opacity: 0.55;
}

.auth-shell {
  min-height: 100vh;
  display: grid;
  grid-template-columns: 1fr 440px;
}

.auth-visual {
  padding: 56px;
  color: white;
  background:
    linear-gradient(rgba(12, 74, 110, 0.8), rgba(15, 118, 110, 0.82)),
    url("https://images.unsplash.com/photo-1552664730-d307ca884978?auto=format&fit=crop&w=1600&q=80") center/cover;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
}

.brand {
  display: flex;
  align-items: center;
  gap: 10px;
  font-weight: 800;
  letter-spacing: 0;
}

.brand-mark {
  width: 34px;
  height: 34px;
  border-radius: 8px;
  display: grid;
  place-items: center;
  background: #f59e0b;
  color: #1f2933;
}

.auth-copy {
  max-width: 680px;
}

.auth-copy h1 {
  margin: 0 0 18px;
  font-size: clamp(40px, 7vw, 80px);
  line-height: 0.95;
  letter-spacing: 0;
}

.auth-copy p {
  max-width: 580px;
  margin: 0;
  color: rgba(255, 255, 255, 0.88);
  font-size: 18px;
  line-height: 1.6;
}

const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { URL } = require("url");

const PORT = Number(process.env.PORT || 3000);
const DATA_DIR = path.join(__dirname, "data");
const DB_FILE = path.join(DATA_DIR, "db.json");
const PUBLIC_DIR = path.join(__dirname, "public");

const TASK_STATUSES = ["todo", "in_progress", "review", "done"];
const PROJECT_ROLES = ["Admin", "Member"];

function seedDatabase() {
  const adminId = id();
  const memberId = id();
  const projectId = id();
  const now = new Date();
  const tomorrow = new Date(now);
  tomorrow.setDate(now.getDate() + 1);
  const overdue = new Date(now);
  overdue.setDate(now.getDate() - 2);

  return {
    users: [
      {
        id: adminId,
        name: "Avery Admin",
        email: "admin@example.com",
        passwordHash: hashPassword("Admin123!"),
        createdAt: now.toISOString()
      },
      {
        id: memberId,
        name: "Mira Member",
        email: "member@example.com",
        passwordHash: hashPassword("Member123!"),
        createdAt: now.toISOString()
      }
    ],
    projects: [
      {
        id: projectId,
        name: "Website Relaunch",
        description: "Coordinate design, copy, and engineering work for the new launch.",
        ownerId: adminId,
        createdAt: now.toISOString()
      }
    ],
    memberships: [
      { id: id(), projectId, userId: adminId, role: "Admin", createdAt: now.toISOString() },
      { id: id(), projectId, userId: memberId, role: "Member", createdAt: now.toISOString() }
    ],
    tasks: [
      {
        id: id(),
        projectId,
        title: "Finalize homepage content",
        description: "Lock the first-pass messaging for review.",
        assigneeId: memberId,
        status: "in_progress",
        dueDate: tomorrow.toISOString().slice(0, 10),
        createdBy: adminId,
        createdAt: now.toISOString(),
        updatedAt: now.toISOString()
      },
      {
        id: id(),
        projectId,
        title: "Audit current analytics events",
        description: "List missing conversion events before implementation begins.",
        assigneeId: adminId,
        status: "todo",
        dueDate: overdue.toISOString().slice(0, 10),
        createdBy: adminId,
        createdAt: now.toISOString(),
        updatedAt: now.toISOString()
      }
    ],
    sessions: []
  };
}

function ensureDatabase() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(DB_FILE)) writeDb(seedDatabase());
}

function readDb() {
  ensureDatabase();
  return JSON.parse(fs.readFileSync(DB_FILE, "utf8"));
}

function writeDb(db) {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
}

function id() {
    memberships: [
      { id: id(), projectId, userId: adminId, role: "Admin", createdAt: now.toISOString() },
      { id: id(), projectId, userId: memberId, role: "Member", createdAt: now.toISOString() }
    ],
    tasks: [
      {
        id: id(),
        projectId,
        title: "Finalize homepage content",
        description: "Lock the first-pass messaging for review.",
        assigneeId: memberId,
        status: "in_progress",
        dueDate: tomorrow.toISOString().slice(0, 10),
        createdBy: adminId,
        createdAt: now.toISOString(),
        updatedAt: now.toISOString()
      },
      {
        id: id(),
        projectId,
        title: "Audit current analytics events",
        description: "List missing conversion events before implementation begins.",
        assigneeId: adminId,
        status: "todo",
        dueDate: overdue.toISOString().slice(0, 10),
        createdBy: adminId,
        createdAt: now.toISOString(),
        updatedAt: now.toISOString()
      }
    ],
    sessions: []
  };
}

function ensureDatabase() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(DB_FILE)) writeDb(seedDatabase());
}

function readDb() {
  ensureDatabase();
  return JSON.parse(fs.readFileSync(DB_FILE, "utf8"));
}

function writeDb(db) {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
}

function id() {
  return crypto.randomUUID();
}

function hashPassword(password, salt = crypto.randomBytes(16).toString("hex")) {
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

function verifyPassword(password, passwordHash) {
  const [salt, storedHash] = passwordHash.split(":");
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return crypto.timingSafeEqual(Buffer.from(hash, "hex"), Buffer.from(storedHash, "hex"));
}

function json(res, status, body) {
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Cache-Control": "no-store"
  });
  res.end(JSON.stringify(body));
}

function text(res, status, body) {
  res.writeHead(status, { "Content-Type": "text/plain; charset=utf-8" });
  res.end(body);
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let raw = "";
    req.on("data", chunk => {
      raw += chunk;
      if (raw.length > 1_000_000) {
        reject(new Error("Request body is too large."));
        req.destroy();
      }
    });
    req.on("end", () => {
      if (!raw) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch {
        reject(new Error("Body must be valid JSON."));
      }
    });
  });
}

function publicUser(user) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    createdAt: user.createdAt
  };
}

function requireFields(body, fields) {
  const missing = fields.filter(field => !String(body[field] || "").trim());
  return missing.length ? `${missing.join(", ")} required.` : null;
}

function validateEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || "").toLowerCase());
}

function routePattern(pattern, pathname) {
  const a = pattern.split("/").filter(Boolean);
  const b = pathname.split("/").filter(Boolean);
  if (a.length !== b.length) return null;
  const params = {};
  for (let i = 0; i < a.length; i += 1) {
    if (a[i].startsWith(":")) {
      params[a[i].slice(1)] = b[i];
    } else if (a[i] !== b[i]) {
      return null;
    }
  }
  return params;
}

function getAuth(req, db) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!token) return null;
  const session = db.sessions.find(item => item.token === token);
  if (!session || new Date(session.expiresAt) < new Date()) return null;
  const user = db.users.find(item => item.id === session.userId);
  return user ? { session, user } : null;
}

function requireAuth(req, res, db) {
  const auth = getAuth(req, db);
  if (!auth) {
    json(res, 401, { error: "Authentication required." });
    return null;
  }
  return auth;
}

function membershipFor(db, projectId, userId) {
  return db.memberships.find(item => item.projectId === projectId && item.userId === userId);
}

function requireProjectAccess(res, db, projectId, userId, adminOnly = false) {
  const project = db.projects.find(item => item.id === projectId);
  if (!project) {
    json(res, 404, { error: "Project not found." });
    return null;
  }
  const membership = membershipFor(db, projectId, userId);
  if (!membership) {
    json(res, 403, { error: "You are not on this project." });
    return null;
  }
  if (adminOnly && membership.role !== "Admin") {
    json(res, 403, { error: "Admin role required for this action." });
    return null;
  }
  return { project, membership };
}

function decorateProject(db, project, userId) {
  const memberships = db.memberships
    .filter(item => item.projectId === project.id)
    .map(item => ({
      id: item.id,
      role: item.role,
      user: publicUser(db.users.find(user => user.id === item.userId))
    }));
  const tasks = db.tasks.filter(task => task.projectId === project.id);
  const mine = membershipFor(db, project.id, userId);
  return {
    ...project,
    myRole: mine ? mine.role : null,
    members: memberships,
    taskCount: tasks.length,
    completedCount: tasks.filter(task => task.status === "done").length
  };
}

function decorateTask(db, task) {
  const assignee = db.users.find(user => user.id === task.assigneeId);
  const creator = db.users.find(user => user.id === task.createdBy);
  return {
    ...task,
    assignee: assignee ? publicUser(assignee) : null,
    creator: creator ? publicUser(creator) : null,
    overdue: task.status !== "done" && task.dueDate && new Date(`${task.dueDate}T23:59:59`) < new Date()
  };
