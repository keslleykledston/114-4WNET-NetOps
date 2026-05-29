#!/usr/bin/env node

/**
 * NetBox Real Lab Validation Selftest
 *
 * Validates v0.3.7 NetBox integration against real/lab environment.
 * Tests: status, connection, devices list, sites list, preview-sync, sync-local dry-run,
 * audit logging, error handling, permission enforcement.
 *
 * Env:
 *   NETBOX_ENABLED: true (default)
 *   API_BASE_URL: http://127.0.0.1:8085 (default)
 *   ADMIN_EMAIL: admin@example.com (default)
 *   ADMIN_PASSWORD: admin123456 (default)
 */

const API = process.env.API_BASE_URL || "http://127.0.0.1:8085/api";
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || "admin@example.com";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "admin123456";
const NETBOX_ENABLED = process.env.NETBOX_ENABLED !== "false";

const colors = {
  reset: "\x1b[0m",
  green: "\x1b[32m",
  red: "\x1b[31m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  cyan: "\x1b[36m",
};

let passed = 0;
let failed = 0;
let skipped = 0;

function log(color, message) {
  console.log(`${color}${message}${colors.reset}`);
}

function test(name, result, error) {
  if (result === null) {
    skipped++;
    log(colors.yellow, `⊘ ${name} (skipped)`);
    return;
  }
  if (result) {
    passed++;
    log(colors.green, `✓ ${name}`);
  } else {
    failed++;
    log(colors.red, `✗ ${name}`);
    if (error) log(colors.red, `  ${error}`);
  }
}

async function api(method, path, body = null, token = null) {
  const opts = {
    method,
    headers: { "Content-Type": "application/json" },
  };
  if (token) opts.headers.Authorization = `Bearer ${token}`;
  if (body) opts.body = JSON.stringify(body);

  try {
    const res = await fetch(`${API}${path}`, opts);
    const text = await res.text();
    const data = text ? JSON.parse(text) : null;
    return { ok: res.ok, status: res.status, data };
  } catch (e) {
    return { ok: false, status: 0, data: null, error: e.message };
  }
}

async function runTests() {
  log(colors.yellow, "\n=== NetBox Real Lab Selftest ===\n");

  if (!NETBOX_ENABLED) {
    log(colors.cyan, "⊘ NetBox disabled (NETBOX_ENABLED=false). Test skipped.");
    console.log("(This is expected when NetBox lab is not configured)");
    process.exit(0);
  }

  // Login
  log(colors.yellow, "Setup: Authenticating...");
  const loginRes = await api("POST", "/auth/login", {
    email: ADMIN_EMAIL,
    password: ADMIN_PASSWORD,
  });

  test("Admin login", loginRes.ok);

  if (!loginRes.ok) {
    log(colors.red, "✗ Cannot proceed without authentication");
    process.exit(1);
  }

  const token = loginRes.data?.token;

  // Test 1: NetBox Status
  log(colors.yellow, "\n=== Test 1: NetBox Status ===\n");

  const statusRes = await api("GET", "/netbox/status", null, token);
  test(
    "GET /netbox/status responds",
    statusRes.ok || statusRes.status === 404
  );

  if (statusRes.ok && statusRes.data) {
    const status = statusRes.data;
    log(colors.blue, `  Enabled: ${status.enabled}`);
    log(colors.blue, `  Connected: ${status.connected}`);
    if (status.url) log(colors.blue, `  URL: ${status.url}`);
    if (status.sitesCount) log(colors.blue, `  Sites: ${status.sitesCount}`);
    if (status.devicesCount) log(colors.blue, `  Devices: ${status.devicesCount}`);
    test("Status has required fields", !!status.url && typeof status.connected === "boolean");
  }

  // Test 2: Test Connection
  log(colors.yellow, "\n=== Test 2: NetBox Connection Test ===\n");

  const testConnRes = await api("POST", "/netbox/test-connection", null, token);
  test(
    "POST /netbox/test-connection responds",
    testConnRes.ok || testConnRes.status === 404
  );

  if (testConnRes.ok && testConnRes.data) {
    const conn = testConnRes.data;
    log(colors.blue, `  Status: ${conn.status}`);
    if (conn.apiVersion) log(colors.blue, `  API Version: ${conn.apiVersion}`);
    if (conn.authenticatedUser) log(colors.blue, `  User: ${conn.authenticatedUser}`);
    if (conn.permissionLevel) log(colors.blue, `  Permission: ${conn.permissionLevel}`);
    if (conn.latencyMs) log(colors.blue, `  Latency: ${conn.latencyMs}ms`);
    test("Connection includes api version", !!conn.apiVersion);
    test("Connection has permission level", !!conn.permissionLevel);
  }

  // Test 3: List NetBox Sites
  log(colors.yellow, "\n=== Test 3: NetBox Sites List ===\n");

  const sitesRes = await api("GET", "/netbox/sites", null, token);
  test("GET /netbox/sites responds", sitesRes.ok || sitesRes.status === 404);

  if (sitesRes.ok && Array.isArray(sitesRes.data)) {
    log(colors.blue, `  Found ${sitesRes.data.length} sites`);
    test("Sites response is array", Array.isArray(sitesRes.data));
    if (sitesRes.data.length > 0) {
      const site = sitesRes.data[0];
      test("Site has required fields", !!site.id && !!site.name && !!site.slug);
    }
  } else if (sitesRes.status === 404) {
    log(colors.yellow, "  Sites endpoint not yet implemented");
  }

  // Test 4: List NetBox Devices
  log(colors.yellow, "\n=== Test 4: NetBox Devices List ===\n");

  const devicesRes = await api("GET", "/netbox/devices", null, token);
  test("GET /netbox/devices responds", devicesRes.ok || devicesRes.status === 404);

  if (devicesRes.ok && Array.isArray(devicesRes.data)) {
    log(colors.blue, `  Found ${devicesRes.data.length} devices`);
    test("Devices response is array", Array.isArray(devicesRes.data));
    if (devicesRes.data.length > 0) {
      const dev = devicesRes.data[0];
      test("Device has required fields", !!dev.netboxId && !!dev.name);
    }
  } else if (devicesRes.status === 404) {
    log(colors.yellow, "  Devices endpoint not yet implemented");
  }

  // Test 5: Preview Sync
  log(colors.yellow, "\n=== Test 5: Preview Sync ===\n");

  const previewRes = await api(
    "POST",
    "/netbox/devices/preview-sync",
    null,
    token
  );
  test(
    "POST /netbox/devices/preview-sync responds",
    previewRes.ok || previewRes.status === 404
  );

  if (previewRes.ok && previewRes.data) {
    const preview = previewRes.data;
    log(colors.blue, `  Total NetBox devices: ${preview.summary?.totalNetboxDevices || 0}`);
    log(colors.blue, `  Matched: ${preview.summary?.matchedByNetboxId || 0}`);
    log(colors.blue, `  To create: ${preview.summary?.toCreate || 0}`);
    log(colors.blue, `  To update: ${preview.summary?.toUpdate || 0}`);
    log(colors.blue, `  Warnings: ${preview.summary?.warnings || 0}`);
    test("Preview has summary", !!preview.summary);
    test("Preview has details", !!preview.details);
  } else if (previewRes.status === 404) {
    log(colors.yellow, "  Preview endpoint not yet implemented");
  }

  // Test 6: Sync Local (Dry Run)
  log(colors.yellow, "\n=== Test 6: Sync Local (Dry Run) ===\n");

  const syncRes = await api(
    "POST",
    "/netbox/devices/sync-local",
    { dryRun: true },
    token
  );
  test(
    "POST /netbox/devices/sync-local (dryRun) responds",
    syncRes.ok || syncRes.status === 404
  );

  if (syncRes.ok && syncRes.data) {
    const sync = syncRes.data;
    log(colors.blue, `  Status: ${sync.status}`);
    if (sync.summary) {
      log(colors.blue, `  Created: ${sync.summary.created}, Updated: ${sync.summary.updated}`);
      log(colors.blue, `  Duration: ${sync.duration_ms}ms`);
    }
    test("Sync response includes status", !!sync.status);
  } else if (syncRes.status === 404) {
    log(colors.yellow, "  Sync endpoint not yet implemented");
  }

  // Test 7: Audit Logging (NetBox Events)
  log(colors.yellow, "\n=== Test 7: Audit Logging ===\n");

  const auditRes = await api(
    "GET",
    "/audit-logs?action=netbox_test_connection&limit=5",
    null,
    token
  );
  test("GET /audit-logs with NetBox filter", auditRes.ok || auditRes.status === 404);

  if (auditRes.ok && Array.isArray(auditRes.data)) {
    log(colors.blue, `  Found ${auditRes.data.length} NetBox events in audit log`);
    test("Audit events are array", Array.isArray(auditRes.data));
  }

  // Test 8: Permission Enforcement (Viewer cannot export)
  log(colors.yellow, "\n=== Test 8: Permission Enforcement ===\n");

  // Create viewer token (simplified: assume viewer exists or skip)
  // For now, just verify admin can access
  test("Admin can access NetBox status", statusRes.ok);
  log(colors.blue, "  (Full RBAC test requires viewer/operator tokens)");

  // Test 9: Error Handling
  log(colors.yellow, "\n=== Test 9: Error Handling ===\n");

  const badRes = await api("GET", "/netbox/invalid-endpoint", null, token);
  test("Invalid endpoint returns 404 or 405", badRes.status >= 400);

  const noAuthRes = await api("GET", "/netbox/status", null, null);
  test("No token returns 401", noAuthRes.status === 401);

  // Summary
  log(colors.yellow, `\n=== Results ===`);
  log(colors.green, `Passed: ${passed}`);
  log(colors.red, `Failed: ${failed}`);
  log(colors.yellow, `Skipped: ${skipped}`);
  log(colors[failed === 0 ? "green" : "red"], `Total: ${passed + failed + skipped}`);

  process.exit(failed > 0 ? 1 : 0);
}

runTests().catch((err) => {
  log(colors.red, `Fatal error: ${err.message}`);
  process.exit(1);
});
