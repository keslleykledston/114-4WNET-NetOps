import { randomUUID } from "node:crypto";

const baseUrl = process.env.API_BASE_URL ?? "http://127.0.0.1:8085";
const adminEmail = process.env.RBAC_TEST_ADMIN_EMAIL ?? process.env.ADMIN_EMAIL;
const adminPassword = process.env.RBAC_TEST_ADMIN_PASSWORD ?? process.env.ADMIN_PASSWORD;
const adminName = process.env.RBAC_TEST_ADMIN_NAME ?? process.env.ADMIN_NAME ?? "Admin";

if (!adminEmail || !adminPassword) {
  console.error("RBAC selftest needs ADMIN_EMAIL and ADMIN_PASSWORD.");
  process.exit(1);
}

async function request(path, { method = "GET", body, cookie } = {}) {
  const headers = { Accept: "application/json" };
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (cookie) headers.Cookie = cookie;

  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  const text = await response.text();
  let data = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
  }

  return { response, data };
}

function cookieFromResponse(response) {
  const setCookie = response.headers.get("set-cookie");
  return setCookie ? setCookie.split(";", 1)[0] : "";
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function login(email, password) {
  const { response, data } = await request("/api/auth/login", {
    method: "POST",
    body: { email, password },
  });
  assert(response.ok, `login failed for ${email}: ${response.status} ${JSON.stringify(data)}`);
  assert(data?.user, "login response missing user");
  assert(!("passwordHash" in (data.user ?? {})), "login response leaked passwordHash");
  return { user: data.user, cookie: cookieFromResponse(response), token: data.token };
}

async function main() {
  const health = await request("/api/healthz");
  assert(health.response.ok, "/api/healthz should be public");

  const unauthDevices = await request("/api/devices");
  assert(unauthDevices.response.status === 401, "unauthenticated GET /api/devices must 401");

  const admin = await login(adminEmail, adminPassword);
  assert(admin.user.role === "admin", "bootstrap admin must be admin");

  const me = await request("/api/auth/me", { cookie: admin.cookie });
  assert(me.response.ok, "GET /api/auth/me failed");
  assert(me.data?.user?.email === adminEmail.toLowerCase(), "GET /api/auth/me returned wrong user");

  const viewerEmail = `viewer-${randomUUID()}@netops.local`;
  const operatorEmail = `operator-${randomUUID()}@netops.local`;

  const viewerCreate = await request("/api/users", {
    method: "POST",
    cookie: admin.cookie,
    body: { name: "Viewer", email: viewerEmail, password: "viewer-pass-123", role: "viewer", enabled: true },
  });
  assert(viewerCreate.response.status === 201, `viewer create failed: ${viewerCreate.response.status}`);

  const operatorCreate = await request("/api/users", {
    method: "POST",
    cookie: admin.cookie,
    body: { name: "Operator", email: operatorEmail, password: "operator-pass-123", role: "operator", enabled: true },
  });
  assert(operatorCreate.response.status === 201, `operator create failed: ${operatorCreate.response.status}`);

  const viewer = await login(viewerEmail, "viewer-pass-123");
  const viewerPatchIntegration = await request("/api/integrations/netbox", {
    method: "PATCH",
    cookie: viewer.cookie,
    body: { enabled: false, configJson: { baseUrl: "http://example.invalid", notes: "viewer test" } },
  });
  assert(viewerPatchIntegration.response.status === 403, "viewer must not patch integrations");

  const operator = await login(operatorEmail, "operator-pass-123");
  const tempIp = `192.0.2.${Math.floor(Math.random() * 200) + 10}`;
  const deviceCreate = await request("/api/devices", {
    method: "POST",
    cookie: operator.cookie,
    body: {
      hostname: `rbac-test-${Date.now()}`,
      ipAddress: tempIp,
      vendor: "huawei",
      platform: "vrp",
      sshPort: 22,
      username: "netops",
      password: "netops-pass",
      site: "lab",
      role: "test",
    },
  });
  assert(deviceCreate.response.status === 201, `operator device create failed: ${deviceCreate.response.status}`);
  const tempDeviceId = deviceCreate.data?.id;
  assert(Number.isInteger(tempDeviceId), "device create missing id");

  const discoverResponse = await request(`/api/devices/${tempDeviceId}/discover`, {
    method: "POST",
    cookie: operator.cookie,
    body: {},
  });
  assert(discoverResponse.response.status !== 401 && discoverResponse.response.status !== 403, "operator must reach discovery route");

  const adminPatchIntegration = await request("/api/integrations/netbox", {
    method: "PATCH",
    cookie: admin.cookie,
    body: { enabled: false, configJson: { baseUrl: null, notes: "RBAC selftest" } },
  });
  assert(adminPatchIntegration.response.ok, `admin integration patch failed: ${adminPatchIntegration.response.status}`);

  const jobsList = await request("/api/provisioning-jobs", { cookie: admin.cookie });
  assert(jobsList.response.ok, "list provisioning jobs failed");
  let jobId = jobsList.data?.[0]?.id ?? null;
  if (!jobId) {
    const jobCreate = await request("/api/provisioning-jobs", {
      method: "POST",
      cookie: admin.cookie,
      body: {
        name: `RBAC Job ${Date.now()}`,
        type: "service",
        deviceIds: [tempDeviceId],
        templateId: null,
        parameters: null,
      },
    });
    assert(jobCreate.response.status === 201, "fallback provisioning job create failed");
    jobId = jobCreate.data?.id ?? null;
  }
  assert(Number.isInteger(jobId), "provisioning job id missing");

  const executeBlocked = await request(`/api/provisioning-jobs/${jobId}/execute`, {
    method: "POST",
    cookie: admin.cookie,
  });
  assert(executeBlocked.response.ok, "blocked execute should return 200 payload");
  assert(executeBlocked.data?.status === "blocked", "execute must stay blocked by default");

  const audit = await request("/api/audit-logs?action=provisioning_execute_blocked&limit=20", {
    cookie: admin.cookie,
  });
  assert(audit.response.ok, "audit log query failed");
  const relevant = (audit.data ?? []).find((row) => row.action === "provisioning_execute_blocked");
  assert(relevant, "missing provisioning_execute_blocked audit log");
  assert(relevant.actorId === admin.user.id, "audit log actor must be real admin");
  assert(typeof relevant.actorName === "string" && relevant.actorName.length > 0, "audit log must include actor name");

  await request(`/api/devices/${tempDeviceId}`, { method: "DELETE", cookie: admin.cookie });
  await request(`/api/users/${viewer.user.id}`, { method: "DELETE", cookie: admin.cookie });
  await request(`/api/users/${operator.user.id}`, { method: "DELETE", cookie: admin.cookie });

  console.log("rbac selftest passed");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : String(error));
  process.exit(1);
});
