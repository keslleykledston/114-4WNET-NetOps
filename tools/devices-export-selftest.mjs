#!/usr/bin/env node

const API = "http://127.0.0.1:8085/api";
const ADMIN_EMAIL = "admin@example.com";
const ADMIN_PASSWORD = "admin123456";

let adminToken = null;

async function api(method, path, body = null) {
  const opts = {
    method,
    headers: { "Content-Type": "application/json" },
  };
  if (adminToken) opts.headers.Authorization = `Bearer ${adminToken}`;
  if (body) opts.body = JSON.stringify(body);

  const res = await fetch(`${API}${path}`, opts);
  const text = await res.text();

  if (!res.ok) {
    console.error(`[${method} ${path}] ${res.status}:`, text.substring(0, 100));
    return { ok: false, status: res.status, data: text };
  }

  try {
    const data = text ? JSON.parse(text) : null;
    return { ok: true, status: res.status, data };
  } catch {
    return { ok: true, status: res.status, data: text };
  }
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

async function run() {
  console.log("🧪 Device Export Selftest\n");

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

  // 2. Get devices list
  let deviceIds = [];
  await test("Get devices list", async () => {
    const res = await api("GET", "/devices");
    if (!res.ok || !Array.isArray(res.data)) return false;
    deviceIds = res.data.slice(0, 3).map((d) => d.id);
    return deviceIds.length > 0;
  });

  // 3. Export to CSV
  await test("Export devices to CSV", async () => {
    if (deviceIds.length === 0) return false;
    const res = await api("POST", "/devices/export", {
      ids: deviceIds,
      format: "csv",
    });
    return res.ok && typeof res.data === "string" && res.data.includes("hostname");
  });

  // 4. Export to JSON
  await test("Export devices to JSON", async () => {
    if (deviceIds.length === 0) return false;
    const res = await api("POST", "/devices/export", {
      ids: deviceIds,
      format: "json",
    });
    return res.ok && res.data.devices && Array.isArray(res.data.devices);
  });

  // 5. Permission check - operator can export
  await test("Operator can export devices", async () => {
    // Create operator user first
    const createRes = await api("POST", "/users", {
      name: "Test Operator",
      email: `op-${Date.now()}@example.com`,
      password: "TestOp123456",
      role: "operator",
    });
    if (!createRes.ok) return false;

    // Login as operator
    const loginRes = await api("POST", "/auth/login", {
      email: `op-${Date.now()}@example.com`,
      password: "TestOp123456",
    });
    if (!loginRes.ok) return false;

    const opToken = loginRes.data.token;
    const oldToken = adminToken;
    adminToken = opToken;

    // Try export
    const exportRes = await api("POST", "/devices/export", {
      ids: deviceIds.slice(0, 1),
      format: "csv",
    });

    adminToken = oldToken;
    return exportRes.ok;
  });

  // 6. Permission check - viewer cannot export
  await test("Viewer cannot export devices", async () => {
    // Create viewer user
    const createRes = await api("POST", "/users", {
      name: "Test Viewer",
      email: `viewer-${Date.now()}@example.com`,
      password: "TestView123456",
      role: "viewer",
    });
    if (!createRes.ok) return false;

    // Login as viewer
    const loginRes = await api("POST", "/auth/login", {
      email: `viewer-${Date.now()}@example.com`,
      password: "TestView123456",
    });
    if (!loginRes.ok) return false;

    const viewerToken = loginRes.data.token;
    const oldToken = adminToken;
    adminToken = viewerToken;

    // Try export - should fail
    const exportRes = await api("POST", "/devices/export", {
      ids: deviceIds.slice(0, 1),
      format: "csv",
    });

    adminToken = oldToken;
    return exportRes.status === 403;
  });

  console.log("\n✅ Device Export Tests Complete");
}

run().catch((e) => {
  console.error("Fatal error:", e.message);
  process.exit(1);
});
