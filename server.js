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
}

function dashboardFor(db, userId) {
  const projectIds = db.memberships.filter(item => item.userId === userId).map(item => item.projectId);
  const tasks = db.tasks.filter(task => projectIds.includes(task.projectId));
  const myTasks = tasks.filter(task => task.assigneeId === userId);
  const overdue = tasks.filter(task => decorateTask(db, task).overdue);
  const byStatus = TASK_STATUSES.reduce((acc, status) => {
    acc[status] = tasks.filter(task => task.status === status).length;
    return acc;
  }, {});
  return {
    totals: {
      projects: projectIds.length,
      tasks: tasks.length,
      myTasks: myTasks.length,
      overdue: overdue.length,
      completed: tasks.filter(task => task.status === "done").length
    },
    byStatus,
    myTasks: myTasks.map(task => decorateTask(db, task)),
    overdue: overdue.map(task => decorateTask(db, task))
  };
}

function canEditTask(db, task, userId) {
  const membership = membershipFor(db, task.projectId, userId);
  return Boolean(membership && (membership.role === "Admin" || task.assigneeId === userId || task.createdBy === userId));
}

function serveStatic(req, res, pathname) {
  const filePath = pathname === "/" ? path.join(PUBLIC_DIR, "index.html") : path.join(PUBLIC_DIR, pathname);
  const resolved = path.resolve(filePath);
  if (!resolved.startsWith(path.resolve(PUBLIC_DIR))) return text(res, 403, "Forbidden");
  fs.readFile(resolved, (error, data) => {
    if (error) {
      fs.readFile(path.join(PUBLIC_DIR, "index.html"), (fallbackError, fallback) => {
        if (fallbackError) return text(res, 404, "Not found");
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        res.end(fallback);
      });
      return;
    }
    const ext = path.extname(resolved);
    const types = {
      ".html": "text/html; charset=utf-8",
      ".css": "text/css; charset=utf-8",
      ".js": "application/javascript; charset=utf-8",
      ".svg": "image/svg+xml"
    };
    res.writeHead(200, { "Content-Type": types[ext] || "application/octet-stream" });
    res.end(data);
  });
}

async function api(req, res, pathname) {
  const db = readDb();
  const method = req.method;

  if (method === "POST" && pathname === "/api/auth/signup") {
    const body = await parseBody(req);
    const missing = requireFields(body, ["name", "email", "password"]);
    if (missing) return json(res, 400, { error: missing });
    if (!validateEmail(body.email)) return json(res, 400, { error: "Valid email required." });
    if (String(body.password).length < 8) return json(res, 400, { error: "Password must be at least 8 characters." });
    const email = body.email.toLowerCase().trim();
    if (db.users.some(user => user.email === email)) return json(res, 409, { error: "Email already registered." });
    const user = {
      id: id(),
      name: String(body.name).trim(),
      email,
      passwordHash: hashPassword(String(body.password)),
      createdAt: new Date().toISOString()
    };
    db.users.push(user);
    const token = id();
    db.sessions.push({ token, userId: user.id, createdAt: new Date().toISOString(), expiresAt: expiresAt() });
    writeDb(db);
    return json(res, 201, { token, user: publicUser(user) });
  }

  if (method === "POST" && pathname === "/api/auth/login") {
    const body = await parseBody(req);
    const missing = requireFields(body, ["email", "password"]);
    if (missing) return json(res, 400, { error: missing });
    const user = db.users.find(item => item.email === String(body.email).toLowerCase().trim());
    if (!user || !verifyPassword(String(body.password), user.passwordHash)) {
      return json(res, 401, { error: "Invalid email or password." });
    }
    const token = id();
    db.sessions.push({ token, userId: user.id, createdAt: new Date().toISOString(), expiresAt: expiresAt() });
    writeDb(db);
    return json(res, 200, { token, user: publicUser(user) });
  }

  if (method === "POST" && pathname === "/api/auth/logout") {
    const auth = requireAuth(req, res, db);
    if (!auth) return;
    db.sessions = db.sessions.filter(item => item.token !== auth.session.token);
    writeDb(db);
    return json(res, 200, { ok: true });
  }

  if (method === "GET" && pathname === "/api/me") {
    const auth = requireAuth(req, res, db);
    if (!auth) return;
    return json(res, 200, { user: publicUser(auth.user) });
  }

  if (method === "GET" && pathname === "/api/users") {
    const auth = requireAuth(req, res, db);
    if (!auth) return;
    return json(res, 200, { users: db.users.map(publicUser) });
  }

  if (method === "GET" && pathname === "/api/dashboard") {
    const auth = requireAuth(req, res, db);
    if (!auth) return;
    return json(res, 200, dashboardFor(db, auth.user.id));
  }

  if (method === "GET" && pathname === "/api/projects") {
    const auth = requireAuth(req, res, db);
    if (!auth) return;
    const projectIds = db.memberships.filter(item => item.userId === auth.user.id).map(item => item.projectId);
    const projects = db.projects
      .filter(project => projectIds.includes(project.id))
      .map(project => decorateProject(db, project, auth.user.id));
    return json(res, 200, { projects });
  }

  if (method === "POST" && pathname === "/api/projects") {
    const auth = requireAuth(req, res, db);
    if (!auth) return;
    const body = await parseBody(req);
    const missing = requireFields(body, ["name"]);
    if (missing) return json(res, 400, { error: missing });
    const project = {
      id: id(),
      name: String(body.name).trim(),
      description: String(body.description || "").trim(),
      ownerId: auth.user.id,
      createdAt: new Date().toISOString()
    };
    db.projects.push(project);
    db.memberships.push({ id: id(), projectId: project.id, userId: auth.user.id, role: "Admin", createdAt: new Date().toISOString() });
    writeDb(db);
    return json(res, 201, { project: decorateProject(db, project, auth.user.id) });
  }

  let params = routePattern("/api/projects/:projectId", pathname);
  if (params && method === "GET") {
    const auth = requireAuth(req, res, db);
    if (!auth) return;
    const access = requireProjectAccess(res, db, params.projectId, auth.user.id);
    if (!access) return;
    return json(res, 200, { project: decorateProject(db, access.project, auth.user.id) });
  }

  params = routePattern("/api/projects/:projectId/members", pathname);
  if (params && method === "POST") {
    const auth = requireAuth(req, res, db);
    if (!auth) return;
    const access = requireProjectAccess(res, db, params.projectId, auth.user.id, true);
    if (!access) return;
    const body = await parseBody(req);
    const missing = requireFields(body, ["email", "role"]);
    if (missing) return json(res, 400, { error: missing });
    if (!PROJECT_ROLES.includes(body.role)) return json(res, 400, { error: "Role must be Admin or Member." });
    const user = db.users.find(item => item.email === String(body.email).toLowerCase().trim());
    if (!user) return json(res, 404, { error: "User with that email does not exist." });
    const existing = membershipFor(db, params.projectId, user.id);
    if (existing) {
      existing.role = body.role;
    } else {
      db.memberships.push({ id: id(), projectId: params.projectId, userId: user.id, role: body.role, createdAt: new Date().toISOString() });
    }
    writeDb(db);
    return json(res, 200, { project: decorateProject(db, access.project, auth.user.id) });
  }

  params = routePattern("/api/projects/:projectId/tasks", pathname);
  if (params && method === "GET") {
    const auth = requireAuth(req, res, db);
    if (!auth) return;
    const access = requireProjectAccess(res, db, params.projectId, auth.user.id);
    if (!access) return;
    const tasks = db.tasks.filter(task => task.projectId === params.projectId).map(task => decorateTask(db, task));
    return json(res, 200, { tasks });
  }

  if (params && method === "POST") {
    const auth = requireAuth(req, res, db);
    if (!auth) return;
    const access = requireProjectAccess(res, db, params.projectId, auth.user.id, true);
    if (!access) return;
    const body = await parseBody(req);
    const missing = requireFields(body, ["title", "assigneeId", "dueDate"]);
    if (missing) return json(res, 400, { error: missing });
    if (body.status && !TASK_STATUSES.includes(body.status)) return json(res, 400, { error: "Invalid task status." });
    if (!membershipFor(db, params.projectId, body.assigneeId)) return json(res, 400, { error: "Assignee must be a project member." });
    if (Number.isNaN(Date.parse(`${body.dueDate}T00:00:00`))) return json(res, 400, { error: "Valid due date required." });
    const now = new Date().toISOString();
    const task = {
      id: id(),
      projectId: params.projectId,
      title: String(body.title).trim(),
      description: String(body.description || "").trim(),
      assigneeId: body.assigneeId,
      status: body.status || "todo",
      dueDate: body.dueDate,
      createdBy: auth.user.id,
      createdAt: now,
      updatedAt: now
    };
    db.tasks.push(task);
    writeDb(db);
    return json(res, 201, { task: decorateTask(db, task) });
  }

  params = routePattern("/api/tasks/:taskId", pathname);
  if (params && method === "PATCH") {
    const auth = requireAuth(req, res, db);
    if (!auth) return;
    const task = db.tasks.find(item => item.id === params.taskId);
    if (!task) return json(res, 404, { error: "Task not found." });
    if (!canEditTask(db, task, auth.user.id)) return json(res, 403, { error: "You cannot edit this task." });
    const body = await parseBody(req);
    const membership = membershipFor(db, task.projectId, auth.user.id);
    if (body.status !== undefined) {
      if (!TASK_STATUSES.includes(body.status)) return json(res, 400, { error: "Invalid task status." });
      task.status = body.status;
    }
    if (membership.role === "Admin") {
      if (body.title !== undefined) {
        if (!String(body.title).trim()) return json(res, 400, { error: "Title cannot be empty." });
        task.title = String(body.title).trim();
      }
      if (body.description !== undefined) task.description = String(body.description || "").trim();
      if (body.assigneeId !== undefined) {
        if (!membershipFor(db, task.projectId, body.assigneeId)) return json(res, 400, { error: "Assignee must be a project member." });
        task.assigneeId = body.assigneeId;
      }
      if (body.dueDate !== undefined) {
        if (Number.isNaN(Date.parse(`${body.dueDate}T00:00:00`))) return json(res, 400, { error: "Valid due date required." });
        task.dueDate = body.dueDate;
      }
    }
    task.updatedAt = new Date().toISOString();
    writeDb(db);
    return json(res, 200, { task: decorateTask(db, task) });
  }

  if (params && method === "DELETE") {
    const auth = requireAuth(req, res, db);
    if (!auth) return;
    const task = db.tasks.find(item => item.id === params.taskId);
    if (!task) return json(res, 404, { error: "Task not found." });
    const access = requireProjectAccess(res, db, task.projectId, auth.user.id, true);
    if (!access) return;
    db.tasks = db.tasks.filter(item => item.id !== params.taskId);
    writeDb(db);
    return json(res, 200, { ok: true });
  }

  return json(res, 404, { error: "API route not found." });
}

function expiresAt() {
  const date = new Date();
  date.setDate(date.getDate() + 7);
  return date.toISOString();
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const pathname = decodeURIComponent(url.pathname);
  if (pathname.startsWith("/api/")) {
    api(req, res, pathname).catch(error => {
      json(res, error.message.includes("JSON") ? 400 : 500, { error: error.message || "Server error." });
    });
    return;
  }
  serveStatic(req, res, pathname);
});

ensureDatabase();
server.listen(PORT, () => {
  console.log(`Project tracker running at http://localhost:${PORT}`);
});
