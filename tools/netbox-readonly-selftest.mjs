#!/usr/bin/env node

const baseUrl = process.env.BASE_URL || process.env.API_BASE_URL || "http://127.0.0.1:8085";
const adminEmail = process.env.NETBOX_TEST_ADMIN_EMAIL || process.env.ADMIN_EMAIL || "admin@netops.local";
const adminPassword = process.env.NETBOX_TEST_ADMIN_PASSWORD || process.env.ADMIN_PASSWORD || "Admin123!ChangeMe";
const netboxToken = process.env.NETBOX_TOKEN || "";

async function request(path, { method = "GET", body, token } = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await response.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { json = text; }
  return { response, text, json };
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function login(email, password) {
  const { response, json } = await request("/api/auth/login", {
    method: "POST",
    body: { email, password },
  });
  assert(response.ok, `login failed: ${json?.error ?? response.status}`);
  assert(json?.token, "missing token");
  return json.token;
}

async function createUser(token, { name, email, password, role }) {
  const { response, json } = await request("/api/users", {
    method: "POST",
    token,
    body: { name, email, password, role, enabled: true },
  });
  assert(response.ok, `create user failed: ${json?.error ?? response.status}`);
  return json;
}

async function main() {
  const adminToken = await login(adminEmail, adminPassword);
  const marker = Date.now();
  const viewerEmail = `netbox-viewer-${marker}@netops.local`;
  const operatorEmail = `netbox-operator-${marker}@netops.local`;

  const viewer = await createUser(adminToken, {
    name: "NetBox Viewer",
    email: viewerEmail,
    password: "Viewer123!ChangeMe",
    role: "viewer",
  });
  const operator = await createUser(adminToken, {
    name: "NetBox Operator",
    email: operatorEmail,
    password: "Operator123!ChangeMe",
    role: "operator",
  });

  const viewerToken = await login(viewerEmail, "Viewer123!ChangeMe");
  const operatorToken = await login(operatorEmail, "Operator123!ChangeMe");

  const statusRes = await request("/api/netbox/status", { token: viewerToken });
  assert(statusRes.response.ok, "viewer cannot read status");
  assert(statusRes.json?.tokenConfigured === false || typeof statusRes.json?.tokenConfigured === "boolean", "status shape bad");
  assert(JSON.stringify(statusRes.json).includes("tokenConfigured"), "status missing tokenConfigured");
  assert(!(JSON.stringify(statusRes.json).includes(netboxToken) && netboxToken), "token leaked in status");

  const operatorDevices = await request("/api/netbox/devices", { token: operatorToken });
  if (operatorDevices.response.ok) {
    assert(Array.isArray(operatorDevices.json?.items), "devices shape bad");
  } else {
    assert(operatorDevices.response.status === 503 || operatorDevices.response.status === 400, "devices should be disabled or bad config");
  }

  const viewerSync = await request("/api/netbox/devices/sync-local", { method: "POST", token: viewerToken });
  assert(viewerSync.response.status === 403, "viewer should not sync local");

  const operatorSync = await request("/api/netbox/devices/sync-local", { method: "POST", token: operatorToken });
  assert(operatorSync.response.status === 403, "operator should not sync local");

  const preview = await request("/api/netbox/devices/preview-sync", { method: "POST", token: adminToken });
  if (preview.response.ok) {
    assert(preview.json?.summary && Array.isArray(preview.json?.items), "preview shape bad");
  } else {
    assert(preview.response.status === 503 || preview.response.status === 400, "preview should be disabled or bad config");
  }

  const beforeDevices = await request("/api/devices", { token: adminToken });
  assert(beforeDevices.response.ok, "devices list failed");
  const beforeCount = Array.isArray(beforeDevices.json) ? beforeDevices.json.length : 0;

  const testConn = await request("/api/netbox/test-connection", { method: "POST", token: operatorToken });
  assert(testConn.response.ok || testConn.response.status === 503 || testConn.response.status === 400, "test connection unexpected");
  if (testConn.response.ok) {
    assert(testConn.json?.message, "test connection missing message");
    assert(!netboxToken || !JSON.stringify(testConn.json).includes(netboxToken), "token leaked in test response");
  }

  const audit = await request("/api/audit-logs?limit=50", { token: adminToken });
  assert(audit.response.ok, "audit fetch failed");
  const auditItems = audit.json?.items || audit.json || [];
  const hit = auditItems.find?.((item) => item.action === "netbox_test_connection");
  assert(Boolean(hit), "netbox_test_connection audit missing");

  const afterDevices = await request("/api/devices", { token: adminToken });
  assert(afterDevices.response.ok, "devices list failed after");
  const afterCount = Array.isArray(afterDevices.json) ? afterDevices.json.length : 0;
  assert(beforeCount === afterCount, "preview should not change devices");

  const summary = {
    enabled: statusRes.json?.enabled ?? false,
    readiness: statusRes.json?.readiness ?? "disabled",
    viewerRole: viewer.role,
    operatorRole: operator.role,
    devicesCount: afterCount,
    previewStatus: preview.response.status,
    testConnectionStatus: testConn.response.status,
  };

  console.log(JSON.stringify(summary, null, 2));

  await request(`/api/users/${viewer.id}`, { method: "DELETE", token: adminToken });
  await request(`/api/users/${operator.id}`, { method: "DELETE", token: adminToken });
}

main().catch(async (error) => {
  console.error(JSON.stringify({
    ok: false,
    error: error.message,
  }, null, 2));
  process.exit(1);
});
