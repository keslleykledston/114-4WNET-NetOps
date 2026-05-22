import assert from "node:assert/strict";

const baseUrl = process.env.SCHEDULER_BASE_URL ?? "http://127.0.0.1:8085/api";
const adminEmail = process.env.SCHEDULER_TEST_ADMIN_EMAIL ?? process.env.ADMIN_EMAIL ?? "admin@netops.local";
const adminPassword = process.env.SCHEDULER_TEST_ADMIN_PASSWORD ?? process.env.ADMIN_PASSWORD ?? "Admin123!ChangeMe";
const adminName = process.env.SCHEDULER_TEST_ADMIN_NAME ?? "Scheduler Admin";

function unique(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
}

async function request(path, { method = "GET", body, cookie, expected = [200] } = {}) {
  const headers = { Accept: "application/json" };
  if (cookie) headers.Cookie = cookie;
  if (body !== undefined) headers["Content-Type"] = "application/json";
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (!expected.includes(response.status)) {
    const text = await response.text();
    throw new Error(`${method} ${path} -> ${response.status}: ${text}`);
  }
  const text = await response.text();
  const json = text ? JSON.parse(text) : null;
  return { response, json };
}

function cookieFromResponse(response) {
  const setCookie = response.headers.get("set-cookie");
  if (!setCookie) return null;
  return setCookie.split(";")[0];
}

function assertNoSecrets(payload) {
  const raw = JSON.stringify(payload);
  for (const secret of ["passwordHash", "tokenHash", "snmpCommunity", "password", "community"]) {
    assert.ok(!raw.includes(secret), `payload leaked ${secret}`);
  }
}

async function login(email, password) {
  const { response, json } = await request("/auth/login", {
    method: "POST",
    body: { email, password },
    expected: [200],
  });
  const cookie = cookieFromResponse(response) ?? `netops_session=${json.token}`;
  return { cookie, user: json.user };
}

async function main() {
  const adminLogin = await login(adminEmail, adminPassword);
  assert.equal(adminLogin.user.role, "admin");

  const adminCookie = adminLogin.cookie;

  const viewerEmail = `${unique("viewer")}@netops.local`;
  const operatorEmail = `${unique("operator")}@netops.local`;
  const viewerPassword = "Viewer123!ChangeMe";
  const operatorPassword = "Operator123!ChangeMe";

  const createdUsers = [];
  const createdDevices = [];
  let createdGroup = null;
  let scheduledJob = null;
  let discoveryJob = null;
  let complianceJob = null;
  let healthJob = null;

  try {
    const viewer = await request("/users", {
      method: "POST",
      cookie: adminCookie,
      body: { name: "Viewer", email: viewerEmail, password: viewerPassword, role: "viewer", enabled: true },
      expected: [201],
    });
    const operator = await request("/users", {
      method: "POST",
      cookie: adminCookie,
      body: { name: "Operator", email: operatorEmail, password: operatorPassword, role: "operator", enabled: true },
      expected: [201],
    });
    createdUsers.push(viewer.json.id, operator.json.id);

    const viewerLogin = await login(viewerEmail, viewerPassword);
    const operatorLogin = await login(operatorEmail, operatorPassword);

    const group = await request("/device-groups", {
      method: "POST",
      cookie: adminCookie,
      body: { name: unique("scheduler-group"), description: "Scheduler test group" },
      expected: [201],
    });
    createdGroup = group.json.id;

    const device1 = await request("/devices", {
      method: "POST",
      cookie: adminCookie,
      body: {
        hostname: unique("sched-dev-1"),
        ipAddress: "127.0.0.1",
        vendor: "huawei",
        platform: "vrp",
        username: "netops",
        password: "dummy-password",
        site: "lab",
        sshPort: 65000,
        groupId: createdGroup,
      },
      expected: [201],
    });
    const device2 = await request("/devices", {
      method: "POST",
      cookie: adminCookie,
      body: {
        hostname: unique("sched-dev-2"),
        ipAddress: "127.0.0.2",
        vendor: "huawei",
        platform: "vrp",
        username: "netops",
        password: "dummy-password",
        site: "lab",
        sshPort: 65000,
        groupId: createdGroup,
      },
      expected: [201],
    });
    createdDevices.push(device1.json.id, device2.json.id);

    const operatorCreate = await request("/scheduled-jobs", {
      method: "POST",
      cookie: operatorLogin.cookie,
      body: {
        name: "Should fail",
        jobType: "discovery",
        targetType: "device_group",
        targetId: createdGroup,
        contextsJson: ["bgp"],
        intervalMinutes: 30,
      },
      expected: [403],
    });
    assert.equal(operatorCreate.response.status, 403);

    const discovery = await request("/scheduled-jobs", {
      method: "POST",
      cookie: adminCookie,
      body: {
        name: unique("discovery"),
        description: "Scheduler discovery test",
        jobType: "discovery",
        targetType: "device_group",
        targetId: createdGroup,
        contextsJson: ["interfaces", "bgp"],
        intervalMinutes: 30,
        enabled: true,
        runOnStartup: false,
        maxRuntimeSeconds: 1800,
      },
      expected: [201],
    });
    discoveryJob = discovery.json;

    const runNowViewer = await request(`/scheduled-jobs/${discoveryJob.id}/run-now`, {
      method: "POST",
      cookie: viewerLogin.cookie,
      expected: [403],
    });
    assert.equal(runNowViewer.response.status, 403);

    const runNowDiscovery = await request(`/scheduled-jobs/${discoveryJob.id}/run-now`, {
      method: "POST",
      cookie: operatorLogin.cookie,
      expected: [200],
    });
    assert.ok(runNowDiscovery.json.id);
    assert.ok(Array.isArray(runNowDiscovery.json.items));
    assert.ok(runNowDiscovery.json.items.length >= 2);
    assertNoSecrets(runNowDiscovery.json);

    const disableDiscovery = await request(`/scheduled-jobs/${discoveryJob.id}/disable`, {
      method: "POST",
      cookie: adminCookie,
      expected: [200],
    });
    assert.equal(disableDiscovery.json.enabled, false);
    const enableDiscovery = await request(`/scheduled-jobs/${discoveryJob.id}/enable`, {
      method: "POST",
      cookie: adminCookie,
      expected: [200],
    });
    assert.equal(enableDiscovery.json.enabled, true);

    const runAudit = await request("/audit-logs", {
      method: "GET",
      cookie: adminCookie,
      expected: [200],
    });
    const manualRunLog = (runAudit.json.items ?? runAudit.json ?? []).find?.((row) => row.action === "scheduled_job_manual_run" && String(row.objectId) === String(discoveryJob.id));
    assert.ok(manualRunLog, "manual run audit missing");
    assert.ok(manualRunLog.actorId, "manual run actor missing");

    const compliance = await request("/scheduled-jobs", {
      method: "POST",
      cookie: adminCookie,
      body: {
        name: unique("compliance"),
        description: "Scheduler compliance test",
        jobType: "compliance",
        targetType: "device_group",
        targetId: createdGroup,
        contextsJson: ["compliance"],
        intervalMinutes: 30,
        enabled: true,
      },
      expected: [201],
    });
    complianceJob = compliance.json;

    const runNowCompliance = await request(`/scheduled-jobs/${complianceJob.id}/run-now`, {
      method: "POST",
      cookie: operatorLogin.cookie,
      expected: [200],
    });
    assert.ok(runNowCompliance.json.id);
    assert.ok(Array.isArray(runNowCompliance.json.items));
    assert.ok(runNowCompliance.json.items.length >= 2);
    assertNoSecrets(runNowCompliance.json);

    const health = await request("/scheduled-jobs", {
      method: "POST",
      cookie: adminCookie,
      body: {
        name: unique("health"),
        description: "Scheduler health test",
        jobType: "health_check",
        targetType: "device_group",
        targetId: createdGroup,
        contextsJson: ["health"],
        intervalMinutes: 30,
        enabled: true,
      },
      expected: [201],
    });
    healthJob = health.json;

    const runNowHealth = await request(`/scheduled-jobs/${healthJob.id}/run-now`, {
      method: "POST",
      cookie: operatorLogin.cookie,
      expected: [200],
    });
    assert.ok(runNowHealth.json.id);
    assert.ok(Array.isArray(runNowHealth.json.items));
    assert.ok(runNowHealth.json.items.length >= 2);
    assertNoSecrets(runNowHealth.json);

    const listJobs = await request("/scheduled-jobs", { cookie: adminCookie, expected: [200] });
    assertNoSecrets(listJobs.json);

    const listRuns = await request("/scheduled-job-runs", { cookie: adminCookie, expected: [200] });
    assertNoSecrets(listRuns.json);

    const blockedExecute = await request("/provisioning-jobs/1/execute", {
      method: "POST",
      cookie: adminCookie,
      expected: [200, 404, 400],
    }).catch(() => null);
    if (blockedExecute && blockedExecute.response.status === 200) {
      assert.ok(String(JSON.stringify(blockedExecute.json)).includes("Execução real bloqueada") || String(JSON.stringify(blockedExecute.json)).includes("CONFIG_APPLY_ENABLED=false"));
    }

    const blockedRollback = await request("/provisioning-jobs/1/rollback", {
      method: "POST",
      cookie: adminCookie,
      expected: [200, 404, 400],
    }).catch(() => null);
    if (blockedRollback && blockedRollback.response.status === 200) {
      assert.ok(String(JSON.stringify(blockedRollback.json)).includes("Execução real bloqueada") || String(JSON.stringify(blockedRollback.json)).includes("CONFIG_APPLY_ENABLED=false"));
    }

    const viewerList = await request("/scheduled-jobs", { cookie: viewerLogin.cookie, expected: [200] });
    assertNoSecrets(viewerList.json);

    const viewerMe = await request("/auth/me", { cookie: viewerLogin.cookie, expected: [200] });
    assert.equal(viewerMe.json.user.role, "viewer");
    const operatorMe = await request("/auth/me", { cookie: operatorLogin.cookie, expected: [200] });
    assert.equal(operatorMe.json.user.role, "operator");

    if (discoveryJob) {
      const deleteDiscovery = await request(`/scheduled-jobs/${discoveryJob.id}`, {
        method: "DELETE",
        cookie: adminCookie,
        expected: [204],
      });
      assert.equal(deleteDiscovery.response.status, 204);
    }
    if (complianceJob) {
      await request(`/scheduled-jobs/${complianceJob.id}`, {
        method: "DELETE",
        cookie: adminCookie,
        expected: [204],
      });
    }
    if (healthJob) {
      await request(`/scheduled-jobs/${healthJob.id}`, {
        method: "DELETE",
        cookie: adminCookie,
        expected: [204],
      });
    }

    console.log("scheduler selftest passed");
  } finally {
    for (const id of createdDevices.reverse()) {
      await request(`/devices/${id}`, { method: "DELETE", cookie: adminCookie, expected: [204, 404] }).catch(() => {});
    }
    if (createdGroup) {
      await request(`/device-groups/${createdGroup}`, { method: "DELETE", cookie: adminCookie, expected: [204, 404] }).catch(() => {});
    }
    for (const id of createdUsers.reverse()) {
      await request(`/users/${id}`, { method: "DELETE", cookie: adminCookie, expected: [204, 404] }).catch(() => {});
    }
    if (discoveryJob) {
      await request(`/scheduled-jobs/${discoveryJob.id}`, { method: "DELETE", cookie: adminCookie, expected: [204, 404] }).catch(() => {});
    }
    if (complianceJob) {
      await request(`/scheduled-jobs/${complianceJob.id}`, { method: "DELETE", cookie: adminCookie, expected: [204, 404] }).catch(() => {});
    }
    if (healthJob) {
      await request(`/scheduled-jobs/${healthJob.id}`, { method: "DELETE", cookie: adminCookie, expected: [204, 404] }).catch(() => {});
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
