#!/usr/bin/env node
/**
 * L2-OPS.1C — real operational refresh device_id=1 + rollback verify.
 * Never prints secrets.
 */
const base = process.env.API_BASE ?? "http://127.0.0.1:8085";
const deviceId = Number(process.env.SMOKE_DEVICE_ID ?? "1");

const PROBLEM_OPER = new Set(["DOWN", "PARTIAL", "CONFIG_ONLY"]);
const PROBLEM_FINDINGS = new Set([
  "CIRCUIT_DOWN",
  "L2VC_DOWN",
  "VSI_DOWN",
  "REMOTE_NOT_FORWARDING",
  "VLAN_ORPHAN",
  "DESCRIPTION_MISSING",
  "INCOMPLETE_L2_CONFIG",
  "DUPLICATED_VC_ID",
  "VLAN_CONFLICT",
  "ROUTER_L2_VLAN_ANOMALY",
  "VLANIF_ORPHAN",
  "VLAN_NOT_IN_SWITCH_BATCH",
  "CLASSIFICATION_CONFLICT",
]);

function countProblems(circuits) {
  let problems = 0;
  for (const c of circuits) {
    if (PROBLEM_OPER.has(c.operStatus)) {
      problems += 1;
      continue;
    }
    if (c.findings?.some((f) => PROBLEM_FINDINGS.has(f.code))) problems += 1;
  }
  return problems;
}

const out = {
  phase: "L2-OPS.1C",
  at: new Date().toISOString(),
  device_id: deviceId,
  api_base: base,
  steps: [],
  errors: [],
  before: null,
  after: null,
  refresh: null,
  go: false,
};

function log(step, data) {
  out.steps.push({ step, ...data });
  console.log(JSON.stringify({ step, ...data }));
}

async function login() {
  const email = process.env.ADMIN_EMAIL ?? "";
  const password = process.env.ADMIN_PASSWORD ?? "";
  if (!email || !password) throw new Error("ADMIN_EMAIL/ADMIN_PASSWORD missing");

  const r = await fetch(`${base}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const body = await r.json().catch(() => ({}));
  const cookie = r.headers.get("set-cookie")?.split(";")[0];
  const token = body.token;
  log("login", { status: r.status, hasToken: Boolean(token) });
  if (!r.ok) throw new Error("login_failed");

  return {
    headers: {
      "Content-Type": "application/json",
      ...(cookie ? { Cookie: cookie } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  };
}

async function getList(headers, label) {
  const r = await fetch(`${base}/api/l2-circuits?device_id=${deviceId}`, { headers });
  const text = await r.text();
  let body = {};
  try {
    body = JSON.parse(text);
  } catch {
    /* ignore */
  }
  const circuits = body.circuits ?? [];
  const snapshot = {
    status: r.status,
    total: body.total ?? circuits.length,
    problems: countProblems(circuits),
    operational: body.operational ?? null,
    sample_findings: circuits
      .filter((c) => c.findings?.length)
      .slice(0, 3)
      .map((c) => ({ id: c.id, operStatus: c.operStatus, findings: c.findings?.map((f) => f.code) })),
  };
  log(label, snapshot);
  if (r.status !== 200) out.errors.push(`${label}_not_200`);
  return { body, snapshot };
}

async function main() {
  const { headers } = await login();

  const health = await fetch(`${base}/api/healthz`);
  log("healthz", { status: health.status });
  if (health.status !== 200) out.errors.push("health_not_200");

  const dev = await fetch(`${base}/api/devices/${deviceId}`, { headers });
  const devBody = await dev.json().catch(() => ({}));
  log("device_get", {
    status: dev.status,
    hostname: devBody.hostname,
    hasIp: Boolean(devBody.ipAddress),
    hasSnmpCommunity: Boolean(devBody.snmpCommunity),
    hasSshUser: Boolean(devBody.username),
    hasSshPasswordEnc: Boolean(devBody.passwordEncrypted),
  });
  if (dev.status !== 200) out.errors.push("device_not_found");

  const { snapshot: beforeSnap, body: beforeBody } = await getList(headers, "list_before");
  out.before = beforeSnap;

  const t0 = Date.now();
  const refreshRes = await fetch(`${base}/api/l2-circuits/refresh`, {
    method: "POST",
    headers,
    body: JSON.stringify({ device_id: deviceId }),
  });
  const refreshText = await refreshRes.text();
  let refreshBody = {};
  try {
    refreshBody = JSON.parse(refreshText);
  } catch {
    /* ignore */
  }
  const elapsedMs = Date.now() - t0;
  out.refresh = {
    status: refreshRes.status,
    elapsed_ms: elapsedMs,
    body: refreshBody,
  };
  log("post_refresh", {
    status: refreshRes.status,
    elapsed_ms: elapsedMs,
    freshness: refreshBody.freshness,
    circuits_updated: refreshBody.circuits_updated,
    findings_count: refreshBody.findings_count,
    warnings: refreshBody.warnings,
    operational_state: refreshBody.operational_state,
  });

  if (refreshRes.status !== 200) {
    out.errors.push(`refresh_status_${refreshRes.status}`);
    if (refreshBody.code) out.errors.push(`refresh_code_${refreshBody.code}`);
  } else {
    if (refreshBody.freshness !== "fresh") out.errors.push(`freshness_${refreshBody.freshness ?? "missing"}`);
    if (!refreshBody.last_refresh_at) out.errors.push("missing_last_refresh_at");
    const ops = refreshBody.operational_state ?? {};
    if (ops.ssh_config === true) out.errors.push("ssh_config_should_be_false");
  }

  const { snapshot: afterSnap } = await getList(headers, "list_after");
  out.after = afterSnap;

  if (afterSnap.operational?.freshness && afterSnap.operational.freshness !== "fresh") {
    out.errors.push(`after_operational_freshness_${afterSnap.operational.freshness}`);
  }
  if (!afterSnap.operational?.last_refresh_at) {
    out.errors.push("after_missing_last_refresh_at");
  }

  out.go =
    out.errors.length === 0 &&
    refreshRes.status === 200 &&
    beforeSnap.status === 200 &&
    afterSnap.status === 200;

  console.log(JSON.stringify(out, null, 2));
  process.exit(out.go ? 0 : 1);
}

main().catch((err) => {
  out.errors.push(err instanceof Error ? err.message : String(err));
  console.log(JSON.stringify(out, null, 2));
  process.exit(1);
});
