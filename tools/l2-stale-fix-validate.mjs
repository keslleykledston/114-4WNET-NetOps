#!/usr/bin/env node
/**
 * Validates operational stale marking + persisted findings after API rebuild.
 */
const base = process.env.API_BASE ?? "http://127.0.0.1:8085";
const deviceId = Number(process.env.SMOKE_DEVICE_ID ?? "1");
const STALE_TAG = "OPERATIONAL_STALE";

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

function isStale(c) {
  return (c.anomalyTags ?? []).includes(STALE_TAG);
}

function isProblem(c) {
  if (isStale(c)) return false;
  if (PROBLEM_OPER.has(c.operStatus)) return true;
  return c.findings?.some((f) => PROBLEM_FINDINGS.has(f.code)) ?? false;
}

function summarize(circuits) {
  const stale = circuits.filter(isStale);
  const problems = circuits.filter(isProblem);
  const staleWithFindings = stale.filter((c) => (c.findings?.length ?? 0) > 0);
  return {
    total: circuits.length,
    stale: stale.length,
    problems: problems.length,
    stale_with_findings: staleWithFindings.length,
    sample_stale: stale.slice(0, 3).map((c) => ({
      id: c.id,
      operStatus: c.operStatus,
      localInterface: c.localInterface,
      findings: c.findings?.map((f) => f.code) ?? [],
    })),
  };
}

const out = { ok: false, steps: [], errors: [] };

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
  if (!r.ok) throw new Error(`login_${r.status}`);

  return {
    headers: {
      "Content-Type": "application/json",
      ...(cookie ? { Cookie: cookie } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  };
}

async function list(headers, label) {
  const r = await fetch(`${base}/api/l2-circuits?device_id=${deviceId}`, { headers });
  const body = await r.json().catch(() => ({}));
  const circuits = body.circuits ?? [];
  const summary = summarize(circuits);
  out.steps.push({ step: label, status: r.status, ...summary, operational: body.operational ?? null });
  if (r.status !== 200) out.errors.push(`${label}_http_${r.status}`);
  return { circuits, summary };
}

async function main() {
  const health = await fetch(`${base}/api/healthz`);
  out.steps.push({ step: "healthz", status: health.status });
  if (health.status !== 200) out.errors.push("health_not_200");

  const { headers } = await login();
  out.steps.push({ step: "login", ok: true });

  const before = await list(headers, "list_before");
  out.before = before.summary;

  const t0 = Date.now();
  const refreshRes = await fetch(`${base}/api/l2-circuits/refresh`, {
    method: "POST",
    headers,
    body: JSON.stringify({ device_id: deviceId }),
  });
  const refreshBody = await refreshRes.json().catch(() => ({}));
  const elapsedMs = Date.now() - t0;
  const staleMarked = refreshBody.operational_state?.stale_marked;

  out.steps.push({
    step: "refresh",
    status: refreshRes.status,
    elapsed_ms: elapsedMs,
    freshness: refreshBody.freshness,
    circuits_updated: refreshBody.circuits_updated,
    findings_count: refreshBody.findings_count,
    stale_marked: staleMarked,
    snmp_matches: refreshBody.operational_state?.snmp_interface_matches,
    warnings_count: (refreshBody.warnings ?? []).length,
  });

  if (refreshRes.status !== 200) {
    out.errors.push(`refresh_${refreshRes.status}`);
    if (refreshBody.code) out.errors.push(refreshBody.code);
  } else if (typeof staleMarked !== "number") {
    out.errors.push("missing_stale_marked_field");
  }

  const after = await list(headers, "list_after");
  out.after = after.summary;

  if (after.summary.stale_with_findings > 0) {
    out.errors.push("stale_rows_still_have_findings");
  }

  if (after.summary.stale > 0 && after.summary.stale !== staleMarked) {
    out.errors.push(`stale_count_mismatch_api_${staleMarked}_list_${after.summary.stale}`);
  }

  const problemDelta = before.summary.problems - after.summary.problems;
  out.problem_delta = problemDelta;

  out.ok =
    out.errors.length === 0 &&
    refreshRes.status === 200 &&
    after.summary.stale_with_findings === 0;

  console.log(JSON.stringify(out, null, 2));
  process.exit(out.ok ? 0 : 1);
}

main().catch((err) => {
  out.errors.push(err instanceof Error ? err.message : String(err));
  console.log(JSON.stringify(out, null, 2));
  process.exit(1);
});
