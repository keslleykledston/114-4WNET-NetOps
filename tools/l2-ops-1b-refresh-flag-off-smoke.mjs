#!/usr/bin/env node
/**
 * L2-OPS.1B — refresh operacional flag OFF smoke (no SNMP/SSH/discovery).
 */
const base = process.env.API_BASE ?? "http://127.0.0.1:8085";

const out = {
  phase: "L2-OPS.1B",
  at: new Date().toISOString(),
  api_base: base,
  steps: [],
  errors: [],
  go: false,
};

function log(step, data) {
  out.steps.push({ step, ...data });
  console.log(JSON.stringify({ step, ...data }));
}

async function main() {
  const email = process.env.ADMIN_EMAIL ?? "";
  const password = process.env.ADMIN_PASSWORD ?? "";
  if (!email || !password) {
    out.errors.push("ADMIN_EMAIL/ADMIN_PASSWORD missing");
    console.log(JSON.stringify(out, null, 2));
    process.exit(1);
  }

  const loginRes = await fetch(`${base}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const loginBody = await loginRes.json().catch(() => ({}));
  const cookie = loginRes.headers.get("set-cookie")?.split(";")[0];
  const token = loginBody.token;
  log("login", { status: loginRes.status, hasToken: Boolean(token), hasCookie: Boolean(cookie) });
  if (!loginRes.ok) {
    out.errors.push("login_failed");
    console.log(JSON.stringify(out, null, 2));
    process.exit(1);
  }

  const headers = {
    "Content-Type": "application/json",
    ...(cookie ? { Cookie: cookie } : {}),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };

  const health = await fetch(`${base}/api/healthz`);
  const healthText = await health.text();
  log("healthz", { status: health.status, body: healthText.slice(0, 80) });
  if (health.status !== 200) out.errors.push("health_not_200");

  const listRes = await fetch(`${base}/api/l2-circuits`, { headers });
  const listText = await listRes.text();
  let listBody = {};
  try {
    listBody = JSON.parse(listText);
  } catch {
    /* ignore */
  }
  log("get_l2_circuits", {
    status: listRes.status,
    total: listBody.total,
    circuit_count: Array.isArray(listBody.circuits) ? listBody.circuits.length : null,
    has_operational: listBody.operational != null,
  });
  if (listRes.status !== 200) out.errors.push("list_not_200");

  const listDevRes = await fetch(`${base}/api/l2-circuits?device_id=1`, { headers });
  const listDevText = await listDevRes.text();
  let listDevBody = {};
  try {
    listDevBody = JSON.parse(listDevText);
  } catch {
    /* ignore */
  }
  log("get_l2_circuits_device_1", {
    status: listDevRes.status,
    total: listDevBody.total,
    operational: listDevBody.operational ?? null,
  });

  const refreshRes = await fetch(`${base}/api/l2-circuits/refresh`, {
    method: "POST",
    headers,
    body: JSON.stringify({ device_id: 1 }),
  });
  const refreshText = await refreshRes.text();
  let refreshBody = {};
  try {
    refreshBody = JSON.parse(refreshText);
  } catch {
    /* ignore */
  }
  log("post_refresh", {
    status: refreshRes.status,
    code: refreshBody.code,
    error: refreshBody.error?.slice?.(0, 120) ?? refreshText.slice(0, 120),
  });
  if (refreshRes.status !== 503) out.errors.push(`refresh_expected_503_got_${refreshRes.status}`);
  if (refreshBody.code !== "L2_OPERATIONAL_REFRESH_DISABLED") {
    out.errors.push(`refresh_code_${refreshBody.code ?? "missing"}`);
  }

  out.go =
    out.errors.length === 0 &&
    health.status === 200 &&
    listRes.status === 200 &&
    refreshRes.status === 503 &&
    refreshBody.code === "L2_OPERATIONAL_REFRESH_DISABLED";

  console.log(JSON.stringify(out, null, 2));
  process.exit(out.go ? 0 : 1);
}

main().catch((err) => {
  out.errors.push(err instanceof Error ? err.message : String(err));
  console.log(JSON.stringify(out, null, 2));
  process.exit(1);
});
