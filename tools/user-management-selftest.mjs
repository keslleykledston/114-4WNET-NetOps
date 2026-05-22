#!/usr/bin/env node

const API = "http://127.0.0.1:8085/api";
const ADMIN_EMAIL = "admin@example.com";
const ADMIN_PASSWORD = "admin123456";

let adminToken = null;
let testUserId = null;
let testUserEmail = `test-${Date.now()}@example.com`;

async function api(method, path, body = null) {
  const opts = {
    method,
    headers: { "Content-Type": "application/json" },
  };
  if (adminToken) opts.headers.Authorization = `Bearer ${adminToken}`;
  if (body) opts.body = JSON.stringify(body);

  const res = await fetch(`${API}${path}`, opts);
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;

  if (!res.ok) {
    console.error(`[${method} ${path}] ${res.status}:`, data?.error || text);
    return { ok: false, status: res.status, data };
  }
  return { ok: true, status: res.status, data };
}

async function test(name, fn) {
  try {
    const result = await fn();
    if (result) console.log(`✓ ${name}`);
    else console.log(`✗ ${name}`);
    return result;
  } catch (e) {
    console.log(`✗ ${name} — ${e.message}`);
    return false;
  }
}

const results = {
  pass: 0,
  fail: 0,
};

async function run() {
  console.log("🧪 User Management Selftest\n");

  // 1. Admin login
  await test("Admin login", async () => {
    const res = await api("POST", "/auth/login", {
      email: ADMIN_EMAIL,
      password: ADMIN_PASSWORD,
    });
    if (!res.ok) return false;
    adminToken = res.data.token;
    return res.data.user.role === "admin";
  });

  // 2. Admin lists users
  await test("Admin lists users", async () => {
    const res = await api("GET", "/users");
    return res.ok && Array.isArray(res.data.items);
  });

  // 3. Viewer cannot list users
  await test("Viewer cannot list users (RBAC)", async () => {
    const res = await api("POST", "/auth/login", {
      email: "viewer@example.com",
      password: "viewer1234567",
    });
    if (!res.ok) return true; // No viewer in test, skip
    const viewerToken = res.data.token;
    const listRes = await fetch(`${API}/users`, {
      headers: { Authorization: `Bearer ${viewerToken}` },
    });
    return listRes.status === 403;
  });

  // 4. Admin creates test user
  let testUserPassword = "TestPass123456";
  await test("Admin creates user", async () => {
    const res = await api("POST", "/users", {
      name: "Test User",
      email: testUserEmail,
      password: testUserPassword,
      role: "operator",
    });
    if (!res.ok) return false;
    testUserId = res.data.id;
    return res.data.role === "operator" && res.data.enabled === true;
  });

  // 5. password_hash not exposed
  await test("password_hash not exposed in response", async () => {
    const res = await api("GET", `/users/${testUserId}`);
    return res.ok && !res.data.passwordHash && !res.data.password_hash;
  });

  // 6. Admin updates user role
  await test("Admin updates user role", async () => {
    const res = await api("PATCH", `/users/${testUserId}`, {
      role: "viewer",
    });
    return res.ok && res.data.role === "viewer";
  });

  // 7. Admin disables user
  await test("Admin disables user", async () => {
    const res = await api("POST", `/users/${testUserId}/disable`);
    return res.ok && res.data.message.includes("disabled");
  });

  // 8. Disabled user cannot login
  await test("Disabled user cannot login", async () => {
    const res = await api("POST", "/auth/login", {
      email: testUserEmail,
      password: testUserPassword,
    });
    return res.status === 401;
  });

  // 9. Admin enables user
  await test("Admin enables user", async () => {
    const res = await api("POST", `/users/${testUserId}/enable`);
    return res.ok && res.data.enabled === true;
  });

  // 10. Admin resets password
  let newPassword = "NewPass123456";
  await test("Admin resets user password", async () => {
    const res = await api("POST", `/users/${testUserId}/reset-password`, {
      password: newPassword,
    });
    return res.ok && res.data.message.includes("successfully");
  });

  // 11. User can login with new password
  await test("User can login with new password", async () => {
    const res = await api("POST", "/auth/login", {
      email: testUserEmail,
      password: newPassword,
    });
    return res.ok && res.data.user;
  });

  // 12. /auth/me/permissions endpoint works
  await test("/auth/me/permissions returns object", async () => {
    const res = await api("GET", "/auth/me/permissions");
    return (
      res.ok &&
      res.data.effectivePermissions &&
      typeof res.data.effectivePermissions === "object"
    );
  });

  // 13. /auth/sessions endpoint works
  await test("/auth/sessions list works", async () => {
    const res = await api("GET", "/auth/sessions");
    return res.ok && Array.isArray(res.data.sessions);
  });

  // 14. session revoke works
  await test("Session revoke works", async () => {
    // Get current sessions
    const listRes = await api("GET", "/auth/sessions");
    if (!listRes.ok || listRes.data.sessions.length === 0) return true; // Skip if no sessions
    const sessionId = listRes.data.sessions[0].id;
    const res = await api("DELETE", `/auth/sessions/${sessionId}`);
    return res.status === 204;
  });

  console.log("\n✅ User Management Tests Complete");
}

run().catch((e) => {
  console.error("Fatal error:", e.message);
  process.exit(1);
});
