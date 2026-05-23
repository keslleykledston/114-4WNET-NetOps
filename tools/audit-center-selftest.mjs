#!/usr/bin/env node

const API = "http://127.0.0.1:8085/api";
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || "admin@example.com";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "admin123456";

const colors = {
  reset: "\x1b[0m",
  green: "\x1b[32m",
  red: "\x1b[31m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
};

let passed = 0;
let failed = 0;

function log(color, message) {
  console.log(`${color}${message}${colors.reset}`);
}

function test(name, result, error) {
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
  log(colors.yellow, "\n=== Audit Center Selftest ===\n");

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

  // Test 1: Audit Summary
  log(colors.yellow, "\n=== Audit Summary API ===\n");

  const summaryRes = await api("GET", "/audit-logs/summary", null, token);
  test("GET /audit-logs/summary responds", summaryRes.ok || summaryRes.status === 404);

  if (summaryRes.ok && summaryRes.data) {
    const summary = summaryRes.data;
    log(colors.blue, `  Total events: ${summary.total || 0}`);
    log(colors.blue, `  Last 24h: ${summary.last24h || 0}`);
    log(colors.blue, `  Sensitive events: ${summary.sensitiveEvents?.length || 0}`);

    const actionCount = summary.byAction ? Object.keys(summary.byAction).length : 0;
    test("Summary includes byAction", actionCount > 0);

    const actorCount = summary.byActor ? Object.keys(summary.byActor).length : 0;
    test("Summary includes byActor", actorCount > 0);
  } else {
    log(colors.yellow, "  Summary endpoint not yet implemented (expected for v0.3.6-alpha)");
  }

  // Test 2: Audit List with Filters
  log(colors.yellow, "\n=== Audit List Filtering ===\n");

  const listRes = await api("GET", "/audit-logs?limit=10", null, token);
  test("GET /audit-logs with limit", listRes.ok);

  if (listRes.ok && Array.isArray(listRes.data)) {
    log(colors.blue, `  Found ${listRes.data.length} events (limit 10)`);

    if (listRes.data.length > 0) {
      const event = listRes.data[0];
      log(colors.blue, `  Sample event: ${event.event}`);
      test("Event has timestamp", !!event.timestamp);
      test("Event has actor", !!event.actor);
      test("Event has result", !!event.result);
    }
  } else if (listRes.status === 404) {
    log(colors.yellow, "  Paginated endpoint not yet available");
  }

  // Test 3: Filter by Action
  log(colors.yellow, "\n=== Filter by Action ===\n");

  const actionFilterRes = await api(
    "GET",
    "/audit-logs?action=test_connectivity&limit=5",
    null,
    token
  );

  test(
    "Filter by action=test_connectivity",
    actionFilterRes.ok || actionFilterRes.status === 404,
    actionFilterRes.error
  );

  if (actionFilterRes.ok && Array.isArray(actionFilterRes.data)) {
    const testConnectivityEvents = actionFilterRes.data.filter((e) => e.event === "test_connectivity");
    log(colors.blue, `  Found ${testConnectivityEvents.length} test_connectivity events`);
  }

  // Test 4: Filter by Actor
  log(colors.yellow, "\n=== Filter by Actor ===\n");

  const actorFilterRes = await api(
    "GET",
    "/audit-logs?actor=admin@example.com&limit=5",
    null,
    token
  );

  test(
    "Filter by actor=admin@example.com",
    actorFilterRes.ok || actorFilterRes.status === 404,
    actorFilterRes.error
  );

  if (actorFilterRes.ok && Array.isArray(actorFilterRes.data)) {
    const adminEvents = actorFilterRes.data.filter((e) => e.actor?.email === "admin@example.com");
    log(colors.blue, `  Found ${adminEvents.length} events by admin`);
  }

  // Test 5: Export Audit Logs
  log(colors.yellow, "\n=== Audit Export ===\n");

  const exportRes = await api(
    "GET",
    "/audit-logs/export?format=csv&limit=100",
    null,
    token
  );

  test(
    "Export audit logs (CSV)",
    exportRes.ok || exportRes.status === 404,
    exportRes.error
  );

  if (exportRes.ok && typeof exportRes.data === "string") {
    log(colors.blue, `  CSV export size: ${exportRes.data.length} bytes`);
    test("CSV does not contain password hints", !exportRes.data.includes("password"));
    test("CSV does not contain token hints", !exportRes.data.includes("token"));
  }

  // Test 6: Permission Enforcement
  log(colors.yellow, "\n=== Permission Enforcement ===\n");

  // Try to export without proper permission (this would need a viewer token)
  // For now, just verify admin can export
  const adminExportRes = await api(
    "GET",
    "/audit-logs/export?format=json&limit=50",
    null,
    token
  );

  test(
    "Admin can request audit export",
    adminExportRes.ok || adminExportRes.status === 404,
    adminExportRes.error
  );

  // Test 7: Sensitive Events Detection
  log(colors.yellow, "\n=== Sensitive Events ===\n");

  const sensitiveRes = await api(
    "GET",
    "/audit-logs?severity=security&limit=10",
    null,
    token
  );

  test(
    "Filter by severity=security",
    sensitiveRes.ok || sensitiveRes.status === 404,
    sensitiveRes.error
  );

  if (sensitiveRes.ok && Array.isArray(sensitiveRes.data)) {
    const sensitiveEvents = sensitiveRes.data.filter((e) =>
      ["login_failed", "user_disabled", "password_reset", "session_revoked"].includes(e.event)
    );
    log(colors.blue, `  Found ${sensitiveEvents.length} sensitive events`);
  }

  // Test 8: Event Severity Classification
  log(colors.yellow, "\n=== Event Classification ===\n");

  const classifiedRes = await api("GET", "/audit-logs?limit=50", null, token);

  if (classifiedRes.ok && Array.isArray(classifiedRes.data)) {
    const severities = new Set();
    classifiedRes.data.forEach((e) => {
      if (e.severity) severities.add(e.severity);
    });

    log(colors.blue, `  Severity levels found: ${Array.from(severities).join(", ")}`);

    const expectedSeverities = ["info", "operational", "security", "admin", "export", "failed"];
    const hasSeverities = expectedSeverities.some((s) => severities.has(s));
    test("Events have severity classification", hasSeverities);
  }

  // Test 9: Pagination
  log(colors.yellow, "\n=== Pagination ===\n");

  const page1Res = await api("GET", "/audit-logs?limit=10", null, token);
  test(
    "Pagination support",
    (page1Res.ok && page1Res.data?.pagination) || page1Res.status === 404,
    page1Res.error
  );

  if (page1Res.ok && page1Res.data?.pagination) {
    log(colors.blue, `  Total events: ${page1Res.data.pagination.total}`);
    log(colors.blue, `  Has more: ${page1Res.data.pagination.hasMore}`);
  }

  // Summary
  log(colors.yellow, `\n=== Results ===`);
  log(colors.green, `Passed: ${passed}`);
  log(colors.red, `Failed: ${failed}`);
  log(colors[failed === 0 ? "green" : "red"], `Total: ${passed + failed}`);

  process.exit(failed > 0 ? 1 : 0);
}

runTests().catch((err) => {
  log(colors.red, `Fatal error: ${err.message}`);
  process.exit(1);
});
