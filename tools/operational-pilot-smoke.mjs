#!/usr/bin/env node

const API = "http://127.0.0.1:8085/api";
const PILOT_DEVICE_ID = process.env.PILOT_DEVICE_ID || "1";
const ADMIN_EMAIL = process.env.PILOT_ADMIN_EMAIL || "admin@example.com";
const ADMIN_PASSWORD = process.env.PILOT_ADMIN_PASSWORD || "admin123456";

const colors = {
  reset: "\x1b[0m",
  green: "\x1b[32m",
  red: "\x1b[31m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
};

let passed = 0;
let failed = 0;
let cookie = "";
let adminToken = null;

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

async function api(method, path, body = null) {
  const opts = {
    method,
    headers: { "Content-Type": "application/json" },
  };
  if (cookie) opts.headers.Cookie = cookie;
  if (adminToken) opts.headers.Authorization = `Bearer ${adminToken}`;
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

async function login() {
  log(colors.yellow, "\n=== Authentication ===\n");

  const res = await api("POST", "/auth/login", {
    email: ADMIN_EMAIL,
    password: ADMIN_PASSWORD,
  });

  test("Admin login successful", res.ok, res.data?.error || "login failed");

  if (res.ok) {
    const setCookie = res.headers?.["set-cookie"];
    if (res.data?.token) adminToken = res.data.token;
    log(colors.green, `✓ Logged in as ${ADMIN_EMAIL}`);
  }

  return res.ok;
}

async function runTests() {
  log(colors.yellow, "\n=== Operational Pilot Smoke Test ===\n");

  const authenticated = await login();
  if (!authenticated) {
    log(colors.red, "✗ Authentication failed, cannot continue");
    process.exit(1);
  }

  // Test 1: List devices
  log(colors.yellow, "\n=== Device Operations ===\n");

  const devicesRes = await api("GET", "/devices");
  test("List devices", devicesRes.ok, devicesRes.data?.error);

  const devices = Array.isArray(devicesRes.data) ? devicesRes.data : [];
  log(colors.blue, `  Found ${devices.length} devices`);

  // Test 2: Get specific device
  const deviceRes = await api("GET", `/devices/${PILOT_DEVICE_ID}`);
  test(
    `Get device ${PILOT_DEVICE_ID}`,
    deviceRes.ok,
    deviceRes.data?.error || "device not found"
  );

  if (deviceRes.ok) {
    const device = deviceRes.data;
    log(colors.blue, `  Device: ${device.hostname || "N/A"}`);
    log(colors.blue, `  Status: ${device.status || "unknown"}`);
  }

  // Test 3: Test connectivity
  log(colors.yellow, "\n=== Connectivity Test ===\n");

  const connectRes = await api("POST", `/devices/${PILOT_DEVICE_ID}/test-connectivity`);
  test(
    "Test connectivity SSH/SNMP",
    connectRes.status === 200 || connectRes.status === 202,
    connectRes.data?.error
  );

  if (connectRes.ok && connectRes.data?.results) {
    log(colors.blue, `  SSH: ${connectRes.data.results.ssh ? "OK" : "FAIL"}`);
    log(colors.blue, `  SNMP: ${connectRes.data.results.snmp ? "OK" : "FAIL"}`);
  }

  // Test 4: Device discovery
  log(colors.yellow, "\n=== Device Discovery ===\n");

  const discoveryRes = await api("POST", `/devices/${PILOT_DEVICE_ID}/discovery`, {
    mode: "full",
  });

  test(
    "Start device discovery",
    discoveryRes.ok,
    discoveryRes.data?.error || discoveryRes.error
  );

  if (discoveryRes.ok && discoveryRes.data?.jobId) {
    log(colors.blue, `  Discovery job: ${discoveryRes.data.jobId}`);

    // Brief wait for initial progress
    await new Promise((r) => setTimeout(r, 2000));

    // Check discovery status
    const statusRes = await api(
      "GET",
      `/devices/${PILOT_DEVICE_ID}/discovery?job=${discoveryRes.data.jobId}`
    );
    if (statusRes.ok && statusRes.data?.status) {
      log(colors.blue, `  Status: ${statusRes.data.status}`);
      if (statusRes.data.summary) {
        log(colors.blue, `  Interfaces: ${statusRes.data.summary.interfaceCount || 0}`);
        log(colors.blue, `  BGP peers: ${statusRes.data.summary.bgpPeerCount || 0}`);
      }
    }
  }

  // Test 5: BGP peers
  log(colors.yellow, "\n=== BGP Operations ===\n");

  const bgpRes = await api("GET", `/devices/${PILOT_DEVICE_ID}/bgp/peers`);
  test("List BGP peers", bgpRes.ok, bgpRes.data?.error);

  const peers = Array.isArray(bgpRes.data) ? bgpRes.data : [];
  log(colors.blue, `  Found ${peers.length} BGP peers`);

  if (peers.length > 0) {
    const peer = peers[0];
    log(colors.blue, `  Sample peer: ${peer.neighborIp || peer.ip || "N/A"}`);

    // Try route query
    if (peer.neighborIp || peer.ip) {
      const peerIp = peer.neighborIp || peer.ip;
      const routeRes = await api("POST", `/devices/${PILOT_DEVICE_ID}/bgp/peers/${peerIp}/routes/query`, {
        direction: "received",
        limit: 10,
      });

      test(
        "Query BGP routes",
        routeRes.ok || routeRes.status === 202,
        routeRes.data?.error
      );

      if (routeRes.ok && routeRes.data?.total !== undefined) {
        log(colors.blue, `  Routes: ${routeRes.data.total}`);
      }
    }
  }

  // Test 6: Compliance
  log(colors.yellow, "\n=== Compliance Operations ===\n");

  const complianceRes = await api("POST", `/compliance/jobs`, {
    deviceId: parseInt(PILOT_DEVICE_ID),
    profileName: "balanced",
  });

  test("Start compliance job", complianceRes.ok, complianceRes.data?.error);

  if (complianceRes.ok && complianceRes.data?.jobId) {
    const jobId = complianceRes.data.jobId;
    log(colors.blue, `  Compliance job: ${jobId}`);

    // Brief wait for initial progress
    await new Promise((r) => setTimeout(r, 3000));

    // Check compliance status
    const statusRes = await api("GET", `/compliance/jobs/${jobId}`);
    if (statusRes.ok && statusRes.data?.status) {
      log(colors.blue, `  Status: ${statusRes.data.status}`);

      // Try to get report
      if (statusRes.data.status === "completed" || statusRes.data.status === "succeeded") {
        const reportRes = await api(
          "GET",
          `/compliance/jobs/${jobId}/report/download?format=json`
        );
        test("Download compliance report", reportRes.ok, reportRes.data?.error);

        if (reportRes.ok && reportRes.data?.summary) {
          log(colors.blue, `  Total findings: ${reportRes.data.summary.totalFindings || 0}`);
        }
      }
    }
  }

  // Test 7: Audit logs
  log(colors.yellow, "\n=== Audit Logging ===\n");

  const auditRes = await api("GET", "/audit-logs?limit=10");
  test("Fetch audit logs", auditRes.ok, auditRes.data?.error);

  const logs = Array.isArray(auditRes.data) ? auditRes.data : [];
  log(colors.blue, `  Recent audit events: ${logs.length}`);

  if (logs.length > 0) {
    const recentEvent = logs[0];
    log(
      colors.blue,
      `  Latest: ${recentEvent.event} (${recentEvent.result || "ok"})`
    );
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
