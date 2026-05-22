import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

const baseUrl = process.env.COMPLIANCE_TEST_BASE_URL ?? "http://127.0.0.1:8085/api";
const adminEmail = process.env.COMPLIANCE_TEST_ADMIN_EMAIL ?? process.env.ADMIN_EMAIL ?? "admin@netops.local";
const adminPassword = process.env.COMPLIANCE_TEST_ADMIN_PASSWORD ?? process.env.ADMIN_PASSWORD ?? "Admin123!ChangeMe";

async function request(path, { method = "GET", body, cookie, expected = [200] } = {}) {
  const headers = { Accept: "application/json" };
  if (cookie) headers.Cookie = cookie;
  if (body !== undefined) headers["Content-Type"] = "application/json";
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await response.text();
  const json = text ? JSON.parse(text) : null;
  if (!expected.includes(response.status)) {
    throw new Error(`${method} ${path} -> ${response.status}: ${text}`);
  }
  return { response, json };
}

function cookieFromResponse(response, json) {
  const setCookie = response.headers.get("set-cookie");
  return setCookie ? setCookie.split(";", 1)[0] : `netops_session=${json.token}`;
}

async function login(email, password) {
  const { response, json } = await request("/auth/login", {
    method: "POST",
    body: { email, password },
    expected: [200],
  });
  return { user: json.user, cookie: cookieFromResponse(response, json) };
}

async function pollJob(jobId, cookie) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const { json } = await request(`/compliance-jobs/${jobId}`, { cookie });
    if (!["pending", "running"].includes(json.status)) return json;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`compliance job ${jobId} did not finish`);
}

function assertNoSecrets(payload) {
  const raw = JSON.stringify(payload);
  for (const forbidden of ["passwordHash", "tokenHash", "Admin123!ChangeMe", "dummy-password", "snmpCommunity", "community public"]) {
    assert.ok(!raw.includes(forbidden), `payload leaked ${forbidden}`);
  }
}

async function main() {
  const admin = await login(adminEmail, adminPassword);
  assert.equal(admin.user.role, "admin");

  const suffix = randomUUID();
  const viewerEmail = `compliance-viewer-${suffix}@netops.local`;
  const operatorEmail = `compliance-operator-${suffix}@netops.local`;
  const createdUsers = [];
  let deviceId = null;

  try {
    const viewerCreate = await request("/users", {
      method: "POST",
      cookie: admin.cookie,
      body: { name: "Compliance Viewer", email: viewerEmail, password: "Viewer123!ChangeMe", role: "viewer", enabled: true },
      expected: [201],
    });
    const operatorCreate = await request("/users", {
      method: "POST",
      cookie: admin.cookie,
      body: { name: "Compliance Operator", email: operatorEmail, password: "Operator123!ChangeMe", role: "operator", enabled: true },
      expected: [201],
    });
    createdUsers.push(viewerCreate.json.id, operatorCreate.json.id);

    const viewer = await login(viewerEmail, "Viewer123!ChangeMe");
    const operator = await login(operatorEmail, "Operator123!ChangeMe");

    const deviceCreate = await request("/devices", {
      method: "POST",
      cookie: admin.cookie,
      body: {
        hostname: `compliance-deep-${Date.now()}`,
        ipAddress: "192.0.2.241",
        vendor: "huawei",
        platform: "vrp",
        username: "netops",
        password: "dummy-password",
        site: "lab",
        role: "test",
        sshPort: 65000,
      },
      expected: [201],
    });
    deviceId = deviceCreate.json.id;

    await request("/compliance-jobs", {
      method: "POST",
      cookie: viewer.cookie,
      body: { deviceId, contexts: ["bgp"] },
      expected: [403],
    });

    const jobCreate = await request("/compliance-jobs", {
      method: "POST",
      cookie: operator.cookie,
      body: { deviceId, contexts: ["security", "bgp", "interface", "l3vpn", "l2vpn", "ntp"] },
      expected: [201],
    });

    const job = await pollJob(jobCreate.json.id, operator.cookie);
    assert.ok(["passed", "failed"].includes(job.status), `unexpected job status ${job.status}`);
    assert.ok(Array.isArray(job.findings), "job detail missing findings");
    assert.ok(job.findings.length > 0, "expected findings for no snapshot");
    assert.ok(job.findings.some((finding) => ["unknown", "warning"].includes(finding.status ?? finding.result)), "no snapshot should create unknown/warning finding");
    assert.ok(job.findings.every((finding) => finding.source && finding.confidence), "findings must include source/confidence");
    assertNoSecrets(job);

    const findings = await request(`/compliance-findings?deviceId=${deviceId}`, { cookie: operator.cookie });
    assert.ok(findings.response.ok, "list compliance findings failed");
    assert.ok(findings.json.length > 0, "filtered findings missing");
    assertNoSecrets(findings.json);

    const audit = await request("/audit-logs?action=compliance_create&limit=20", { cookie: admin.cookie });
    assert.ok(audit.response.ok, "audit query failed");
    assert.ok((audit.json ?? []).some((row) => row.action === "compliance_create"), "missing compliance_create audit log");

    console.log("compliance deep selftest passed");
  } finally {
    if (deviceId) await request(`/devices/${deviceId}`, { method: "DELETE", cookie: admin.cookie, expected: [200, 204, 404] });
    for (const userId of createdUsers) {
      await request(`/users/${userId}`, { method: "DELETE", cookie: admin.cookie, expected: [200, 204, 404] });
    }
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : String(error));
  process.exit(1);
});
