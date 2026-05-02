const state = {
  token: localStorage.getItem("token") || "",
  user: JSON.parse(localStorage.getItem("user") || "null"),
  projects: [],
  selectedProjectId: localStorage.getItem("selectedProjectId") || "",
  tasks: [],
  dashboard: null,
  users: [],
  mode: "board",
  authMode: "login",
  modal: null,
  message: ""
};

const statuses = [
  ["todo", "To do"],
  ["in_progress", "In progress"],
  ["review", "Review"],
  ["done", "Done"]
];

const app = document.querySelector("#app");

function icon(name) {
  const paths = {
    plus: '<path d="M12 5v14M5 12h14"/>',
    logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="M16 17l5-5-5-5"/><path d="M21 12H9"/>',
    x: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
    user: '<path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
    folder: '<path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7l-2-2H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2Z"/>',
    check: '<path d="M20 6 9 17l-5-5"/>',
    trash: '<path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6l-1 14H6L5 6"/>'
  };
  return `<svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${paths[name] || paths.check}</svg>`;
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(state.token ? { Authorization: `Bearer ${state.token}` } : {}),
      ...(options.headers || {})
    }
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "Request failed.");
  return data;
}

function setSession(token, user) {
  state.token = token;
  state.user = user;
  localStorage.setItem("token", token);
  localStorage.setItem("user", JSON.stringify(user));
}

function clearSession() {
  state.token = "";
  state.user = null;
  localStorage.removeItem("token");
  localStorage.removeItem("user");
  localStorage.removeItem("selectedProjectId");
}

async function bootstrap() {
  if (!state.token) return render();
  try {
    await refreshAll();
  } catch {
    clearSession();
  }
  render();
}

async function refreshAll() {
  const [projects, dashboard, users] = await Promise.all([
    api("/api/projects"),
    api("/api/dashboard"),
    api("/api/users")
  ]);
  state.projects = projects.projects;
  state.dashboard = dashboard;
  state.users = users.users;
  if (!state.selectedProjectId || !state.projects.some(project => project.id === state.selectedProjectId)) {
    state.selectedProjectId = state.projects[0]?.id || "";
  }
  if (state.selectedProjectId) {
    localStorage.setItem("selectedProjectId", state.selectedProjectId);
    const tasks = await api(`/api/projects/${state.selectedProjectId}/tasks`);
    state.tasks = tasks.tasks;
  } else {
    state.tasks = [];
  }
}

function selectedProject() {
  return state.projects.find(project => project.id === state.selectedProjectId);
}

function isAdmin() {
  return selectedProject()?.myRole === "Admin";
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, char => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  })[char]);
}

function statusLabel(status) {
  return statuses.find(item => item[0] === status)?.[1] || status;
}

function render() {
  if (!state.token || !state.user) {
    app.innerHTML = authView();
    bindAuth();
    return;
  }
  app.innerHTML = shellView();
  bindApp();
}

function authView() {
  const signup = state.authMode === "signup";
  return `
    <section class="auth-shell">
      <div class="auth-visual">
        <div class="brand"><span class="brand-mark">${icon("check")}</span><span>ProjectFlow</span></div>
        <div class="auth-copy">
          <h1>Deliver work with clear ownership.</h1>
          <p>Create projects, invite teammates, assign tasks, and see progress without hunting through scattered updates.</p>
        </div>
      </div>
      <aside class="auth-panel">
        <div class="auth-tabs" role="tablist">
          <button class="${!signup ? "active" : ""}" data-auth-mode="login">Login</button>
          <button class="${signup ? "active" : ""}" data-auth-mode="signup">Signup</button>
        </div>
        <form class="form" id="auth-form">
          ${signup ? `<div class="field"><label for="name">Name</label><input class="input" id="name" name="name" autocomplete="name" required /></div>` : ""}
          <div class="field"><label for="email">Email</label><input class="input" id="email" name="email" type="email" autocomplete="email" value="${signup ? "" : "admin@example.com"}" required /></div>
          <div class="field"><label for="password">Password</label><input class="input" id="password" name="password" type="password" autocomplete="${signup ? "new-password" : "current-password"}" value="${signup ? "" : "Admin123!"}" required minlength="8" /></div>
          <button class="primary-btn" type="submit">${signup ? "Create account" : "Login"}</button>
          <div class="message">${escapeHtml(state.message)}</div>
        </form>
        <p class="demo-note">Seeded accounts: admin@example.com / Admin123! and member@example.com / Member123!</p>
      </aside>
    </section>
  `;
}

function shellView() {
  const project = selectedProject();
  return `
    <section class="app-shell">
      <aside class="sidebar">
        <div class="brand"><span class="brand-mark">${icon("check")}</span><span>ProjectFlow</span></div>
        <button class="secondary-btn" data-open-modal="project">${icon("plus")} New project</button>
        <nav class="project-list">
          ${state.projects.map(item => `
            <button class="project-button ${item.id === state.selectedProjectId ? "active" : ""}" data-project-id="${item.id}">
              <span>${escapeHtml(item.name)}</span>
              <small>${item.completedCount}/${item.taskCount}</small>
            </button>
          `).join("") || `<div class="empty">No projects yet.</div>`}
        </nav>
      </aside>
      <div class="main">
        <header class="topbar">
          <div>
            <h1>${project ? escapeHtml(project.name) : "Dashboard"}</h1>
            <p>${project ? escapeHtml(project.description || "No description") : "Create a project to start tracking work."}</p>
          </div>
          <div class="task-meta">
            <span>${escapeHtml(state.user.name)}</span>
            ${project ? `<span class="role-pill">${project.myRole}</span>` : ""}
            <button class="icon-btn" title="Logout" data-action="logout">${icon("logout")}</button>
          </div>
        </header>
        <section class="content">
          ${dashboardView()}
          ${project ? projectWorkspace(project) : emptyProjectView()}
        </section>
      </div>
    </section>
    ${state.modal ? modalView(state.modal) : ""}
  `;
}

function dashboardView() {
  const totals = state.dashboard?.totals || {};
  return `
    <div class="stats">
      ${stat("Projects", totals.projects || 0)}
      ${stat("Tasks", totals.tasks || 0)}
      ${stat("My tasks", totals.myTasks || 0)}
      ${stat("Overdue", totals.overdue || 0)}
      ${stat("Done", totals.completed || 0)}
    </div>
  `;
}

function stat(label, value) {
  return `<div class="stat"><span>${label}</span><strong>${value}</strong></div>`;
}

function emptyProjectView() {
  return `
    <div class="panel">
      <div class="panel-body">
        <div class="empty">Create your first project to add teammates and tasks.</div>
      </div>
    </div>
  `;
}

function projectWorkspace(project) {
  return `
    <div class="layout">
      <section class="panel">
        <div class="panel-head">
          <h2>Tasks</h2>
          <div class="task-meta">
            <div class="mode-tabs">
              <button class="${state.mode === "board" ? "active" : ""}" data-mode="board">Board</button>
              <button class="${state.mode === "list" ? "active" : ""}" data-mode="list">List</button>
            </div>
            ${isAdmin() ? `<button class="primary-btn" data-open-modal="task">${icon("plus")} Task</button>` : ""}
          </div>
        </div>
        <div class="panel-body">
          ${state.mode === "board" ? taskBoard() : taskList()}
        </div>
      </section>
      <aside class="side-stack">
        <section class="panel">
          <div class="panel-head">
            <h3>Team</h3>
            ${isAdmin() ? `<button class="icon-btn" title="Add member" data-open-modal="member">${icon("user")}</button>` : ""}
          </div>
          <div class="panel-body">
            ${project.members.map(member => `
              <div class="member-row">
                <div><strong>${escapeHtml(member.user.name)}</strong><span>${escapeHtml(member.user.email)}</span></div>
                <span class="role-pill">${member.role}</span>
              </div>
            `).join("")}
          </div>
        </section>
        <section class="panel">
          <div class="panel-head"><h3>Overdue</h3></div>
          <div class="panel-body">
            ${(state.dashboard?.overdue || []).slice(0, 5).map(task => `
              <div class="mini-row">
                <div><strong>${escapeHtml(task.title)}</strong><span>${escapeHtml(task.assignee?.name || "Unassigned")}</span></div>
                <span class="overdue">${escapeHtml(task.dueDate)}</span>
              </div>
            `).join("") || `<div class="empty">Nothing overdue.</div>`}
          </div>
        </section>
      </aside>
    </div>
  `;
}

function taskBoard() {
  return `
    <div class="task-board">
      ${statuses.map(([status, label]) => `
        <section class="column">
          <h3>${label}</h3>
          ${state.tasks.filter(task => task.status === status).map(taskCard).join("") || `<div class="empty">No tasks</div>`}
        </section>
      `).join("")}
    </div>
  `;
}

function taskList() {
  return `
    <div>
      ${state.tasks.map(task => `
        <div class="task-card">
          ${taskCore(task)}
        </div>
      `).join("") || `<div class="empty">No tasks yet.</div>`}
    </div>
  `;
}

function taskCard(task) {
  return `<article class="task-card">${taskCore(task)}</article>`;
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
