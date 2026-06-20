#!/usr/bin/env node
/**
 * NOC manual homologation smoke — safe mode (no SSH, no real execute).
 * Requires API up + ADMIN_EMAIL/ADMIN_PASSWORD + device with announcement context.
 */
import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const baseUrl = process.env.API_BASE_URL ?? `http://127.0.0.1:${process.env.API_PORT ?? "8085"}`;
const adminEmail = process.env.ADMIN_EMAIL ?? process.env.RBAC_TEST_ADMIN_EMAIL;
const adminPassword = process.env.ADMIN_PASSWORD ?? process.env.RBAC_TEST_ADMIN_PASSWORD;
const preferredDeviceId = Number(process.env.BGP_HOMOLOG_DEVICE_ID ?? "2");

const evidence = {
  startedAt: new Date().toISOString(),
  baseUrl,
  deviceId: null,
  hostname: null,
  checks: [],
  artifacts: {},
};

function record(name, ok, detail = {}) {
  evidence.checks.push({ name, ok, ...detail });
  const label = ok ? "PASS" : "FAIL";
  console.log(`[${label}] ${name}${detail.message ? `: ${detail.message}` : ""}`);
  if (!ok && detail.required !== false) {
    throw new Error(`${name} failed: ${detail.message ?? "unknown"}`);
  }
}

async function request(pathname, { method = "GET", body, cookie } = {}) {
  const headers = { Accept: "application/json" };
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (cookie) headers.Cookie = cookie;
  const response = await fetch(`${baseUrl}${pathname}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await response.text();
  let data = null;
  if (text) {
    try { data = JSON.parse(text); } catch { data = text; }
  }
  return { response, data, status: response.status };
}

function cookieFromResponse(response) {
  const setCookie = response.headers.getSetCookie?.() ?? [];
  const raw = setCookie.length > 0 ? setCookie.join(";") : response.headers.get("set-cookie") ?? "";
  const match = raw.match(/(?:netops_session|connect\.sid)=[^;]+/);
  return match ? match[0] : "";
}

async function login() {
  const { response, data } = await request("/api/auth/login", {
    method: "POST",
    body: { email: adminEmail, password: adminPassword },
  });
  assert.equal(response.status, 200, `login HTTP ${response.status}`);
  const cookie = cookieFromResponse(response) || (typeof data?.token === "string" ? `netops_session=${data.token}` : "");
  assert.ok(cookie, "missing session cookie");
  return cookie;
}

async function pickDevice(cookie) {
  const { data } = await request("/api/devices?limit=30", { cookie });
  const list = Array.isArray(data) ? data : data?.items ?? [];
  const preferred = list.find((item) => item.id === preferredDeviceId);
  if (preferred) return preferred;
  for (const device of list) {
    const probe = await request(`/api/bgp/announcements/matrix/latest?deviceId=${device.id}`, { cookie });
    if (probe.status === 200 && !probe.data?.empty) return device;
  }
  return preferred ?? list[0] ?? null;
}

function rowTypes(matrix) {
  const rows = matrix?.rows ?? [];
  return {
    total: rows.length,
    origin: rows.filter((r) => r.targetType === "origin_target").length,
    customerImport: rows.filter((r) => r.targetType === "customer_import_target").length,
    customerExport: rows.filter((r) => r.targetType === "customer_export").length,
    upstreamAudit: rows.filter((r) => ["upstream_export_audit", "upstream_import_audit"].includes(r.targetType)).length,
    internal: rows.filter((r) => r.targetType === "internal_mesh").length,
    unknown: rows.filter((r) => r.targetType === "unknown").length,
    labels: [...new Set(rows.flatMap((r) => Object.values(r.cells ?? {}).map((c) => c.label ?? c.state)))],
  };
}

async function main() {
  if (!adminEmail || !adminPassword) {
    console.error("ADMIN_EMAIL and ADMIN_PASSWORD required");
    process.exit(1);
  }

  const health = await request("/api/healthz");
  record("healthz", health.status === 200, { message: `HTTP ${health.status}` });

  const cookie = await login();
  record("auth.login", true);

  const device = await pickDevice(cookie);
  assert.ok(device, "no device available");
  evidence.deviceId = device.id;
  evidence.hostname = device.hostname;
  record("device.selected", true, { message: `#${device.id} ${device.hostname}` });

  let latest = await request(`/api/bgp/announcements/matrix/latest?deviceId=${device.id}`, { cookie });
  record("matrix.latest.initial", latest.status === 200, { message: latest.data?.empty ? "empty" : `snapshot ${latest.data?.snapshot_id ?? "n/a"}` });
  evidence.artifacts.initialLatest = latest.data;

  if (latest.data?.empty) {
    record("matrix.empty_state", Boolean(latest.data?.empty), { message: latest.data?.message ?? "empty" });
  }

  const refresh1 = await request("/api/bgp/announcements/matrix/refresh", {
    method: "POST",
    cookie,
    body: { deviceId: device.id },
  });
  record("matrix.refresh.1", refresh1.status === 200, { message: `snapshot ${refresh1.data?.snapshot_id ?? refresh1.data?.newSnapshotId ?? "n/a"}` });
  evidence.artifacts.refresh1 = refresh1.data;
  const snap1 = refresh1.data?.snapshot_id ?? refresh1.data?.newSnapshotId;

  const refresh2 = await request("/api/bgp/announcements/matrix/refresh", {
    method: "POST",
    cookie,
    body: { deviceId: device.id },
  });
  record("matrix.refresh.2", refresh2.status === 200, { message: `snapshot ${refresh2.data?.snapshot_id ?? refresh2.data?.newSnapshotId ?? "n/a"}` });
  const snap2 = refresh2.data?.snapshot_id ?? refresh2.data?.newSnapshotId;
  record("matrix.snapshot_rotation", snap1 !== snap2, { message: `${snap1} -> ${snap2}`, required: false });

  latest = await request(`/api/bgp/announcements/matrix/latest?deviceId=${device.id}`, { cookie });
  const types = rowTypes(latest.data?.matrix);
  evidence.artifacts.classification = types;
  record("classification.origin_present", types.origin > 0, { message: `origin=${types.origin}`, required: false });
  record("classification.customer_import_present", types.customerImport > 0, { message: `import=${types.customerImport}`, required: false });
  record("classification.customer_export_absent", types.customerExport === 0, { message: `export=${types.customerExport}` });
  record("classification.cxx_not_in_matrix", types.upstreamAudit === 0, { message: `cxx=${types.upstreamAudit}` });
  record("classification.internal_absent", types.internal === 0, { message: `internal=${types.internal}` });
  record("classification.unknown_absent", types.unknown === 0, { message: `unknown=${types.unknown}` });

  if (snap1 && snap2) {
    const diff = await request(`/api/bgp/announcements/matrix/diff?previousSnapshotId=${snap1}&currentSnapshotId=${snap2}`, { cookie });
    record("matrix.diff", diff.status === 200, { message: `changed=${diff.data?.summary?.changed ?? diff.data?.changed?.length ?? "n/a"}`, required: false });
    evidence.artifacts.diff = diff.data;
  }

  const history = await request(`/api/bgp/announcements/history?deviceId=${device.id}&limit=20`, { cookie });
  record("history.endpoint", history.status === 200, { message: `events=${Array.isArray(history.data) ? history.data.length : history.data?.events?.length ?? 0}`, required: false });
  evidence.artifacts.history = Array.isArray(history.data) ? history.data.slice(0, 5) : history.data;

  const upstreamAudit = await request(`/api/bgp/upstreams/audit?deviceId=${device.id}`, { cookie });
  record("upstream.audit", upstreamAudit.status === 200, { message: `findings=${upstreamAudit.data?.findings?.length ?? upstreamAudit.data?.upstreams?.length ?? 0}`, required: false });

  const communitySets = await request(`/api/bgp/community-sets?deviceId=${device.id}`, { cookie });
  record("community_sets.list", communitySets.status === 200, { message: `sets=${Array.isArray(communitySets.data) ? communitySets.data.length : 0}`, required: false });

  const rows = latest.data?.matrix?.rows ?? [];
  const activePlans = await request(`/api/bgp/announcements/change-plans?deviceId=${device.id}`, { cookie });
  const activeKeys = new Set(
    (Array.isArray(activePlans.data) ? activePlans.data : [])
      .filter((plan) => ["pending_approval", "approved", "dry_run_ready", "dry_run_running"].includes(plan.status))
      .map((plan) => `${plan.targetPolicyName}|${plan.upstreamCircuitId}`),
  );

  const modifiable = rows.find((row) =>
    ["origin_target", "customer_import_target"].includes(row.targetType)
    && row.node != null
    && Object.entries(row.cells ?? {}).some(([circuitId, cell]) => {
      const label = cell?.label ?? cell?.state ?? "—";
      const key = `${row.targetPolicyName ?? row.routePolicyName}|${circuitId}`;
      return ["On", "P1", "P2", "P3", "P4", "Off"].includes(label) && !activeKeys.has(key);
    }),
  ) ?? rows.find((row) =>
    ["origin_target", "customer_import_target"].includes(row.targetType)
    && row.node != null
    && Object.entries(row.cells ?? {}).some(([circuitId, cell]) => {
      const key = `${row.targetPolicyName ?? row.routePolicyName}|${circuitId}`;
      return Object.keys(row.cells ?? {}).length > 0 && !activeKeys.has(key);
    }),
  );
  assert.ok(modifiable, "no modifiable row for preview flow");
  const circuitId = Object.entries(modifiable.cells).find(([cid, cell]) => {
    const label = cell?.label ?? cell?.state ?? "—";
    const key = `${modifiable.targetPolicyName ?? modifiable.routePolicyName}|${cid}`;
    return ["On", "P1", "P2", "P3", "P4", "Off"].includes(label) && !activeKeys.has(key);
  })?.[0] ?? Object.keys(modifiable.cells).find((cid) => !activeKeys.has(`${modifiable.targetPolicyName ?? modifiable.routePolicyName}|${cid}`));
  const cell = modifiable.cells[circuitId];
  const currentLabel = cell.label ?? cell.state ?? "—";
  const desiredState = currentLabel === "On" ? "P2" : currentLabel === "P2" ? "On" : "On";

  const preview = await request("/api/bgp/announcements/preview-change", {
    method: "POST",
    cookie,
    body: {
      deviceId: device.id,
      baseSnapshotId: latest.data.snapshot_id,
      targetPolicyName: modifiable.targetPolicyName ?? modifiable.routePolicyName,
      node: modifiable.node,
      upstreamCircuitId: circuitId,
      desiredState,
      note: "noc homologation",
    },
  });
  record("preview.change", preview.status === 200 && preview.data?.previewId, {
    message: `${currentLabel} -> ${desiredState}`,
  });
  evidence.artifacts.preview = {
    previewId: preview.data?.previewId,
    riskLevel: preview.data?.riskLevel,
    proposedCommands: preview.data?.proposedCommands?.length,
    rollbackCommands: preview.data?.rollbackCommands?.length,
  };

  const draft = await request("/api/bgp/announcements/change-plans", {
    method: "POST",
    cookie,
    body: { previewId: preview.data.previewId, note: "noc homologation draft" },
  });
  record("change_plan.draft", draft.status === 200 || draft.status === 201, { message: `id=${draft.data?.id}` });
  const planId = draft.data.id;

  const plans = await request(`/api/bgp/announcements/change-plans?deviceId=${device.id}`, { cookie });
  record("change_plan.list", plans.status === 200 && Array.isArray(plans.data) && plans.data.some((p) => p.id === planId));

  const planDetail = await request(`/api/bgp/announcements/change-plans/${planId}`, { cookie });
  record("change_plan.detail", planDetail.status === 200, { message: planDetail.data?.status });

  const approvalReq = await request(`/api/bgp/announcements/change-plans/${planId}/request-approval`, {
    method: "POST",
    cookie,
    body: { note: "noc homologation approval" },
  });
  record("approval.request", approvalReq.status === 200 || approvalReq.status === 201, {
    message: approvalReq.data?.status ?? approvalReq.data?.approvalId,
  });

  const approvalId = approvalReq.data?.approvalId ?? approvalReq.data?.id;
  const approve = await request(`/api/bgp/announcements/approvals/${approvalId}/approve`, {
    method: "POST",
    cookie,
    body: { reason: "noc homologation approve" },
  });
  record("approval.approve", approve.status === 200, { message: approve.data?.status });

  const dryRun = await request(`/api/bgp/announcements/change-plans/${planId}/dry-run`, {
    method: "POST",
    cookie,
  });
  record("dry_run.execute", dryRun.status === 200, { message: dryRun.data?.mode ?? dryRun.data?.status });
  const wouldExecute = (dryRun.data?.executionLog ?? []).every((item) => item.type !== "command" || item.status === "would_execute");
  record("dry_run.would_execute_only", wouldExecute, { message: `steps=${(dryRun.data?.executionLog ?? []).length}` });

  const realExec = await request(`/api/bgp/announcements/change-plans/${planId}/execute`, {
    method: "POST",
    cookie,
  });
  const realBlocked = realExec.data?.blocked === true || realExec.data?.mode === "real_blocked" || realExec.data?.status === "blocked";
  record("execution.real_blocked", realBlocked, { message: JSON.stringify(realExec.data).slice(0, 160), required: true });

  const postcheck = await request(`/api/bgp/announcements/change-plans/${planId}/postcheck`, {
    method: "POST",
    cookie,
  });
  record("postcheck.run", postcheck.status === 200, {
    message: postcheck.data?.status ?? postcheck.data?.postcheckStatus ?? "ok",
    required: false,
  });

  const rollbackReq = await request(`/api/bgp/announcements/change-plans/${planId}/rollback/request`, {
    method: "POST",
    cookie,
    body: { note: "noc homologation rollback" },
  });
  record("rollback.request", rollbackReq.status === 200 || rollbackReq.status === 201, { message: rollbackReq.data?.status, required: false });
  const rollbackId = rollbackReq.data?.id ?? rollbackReq.data?.rollbackId;

  if (rollbackId) {
    const rbApprove = await request(`/api/bgp/announcements/rollbacks/${rollbackId}/approve`, {
      method: "POST",
      cookie,
      body: { reason: "noc homologation" },
    });
    record("rollback.approve", rbApprove.status === 200, { required: false });

    const rbDry = await request(`/api/bgp/announcements/rollbacks/${rollbackId}/dry-run`, {
      method: "POST",
      cookie,
    });
    record("rollback.dry_run", rbDry.status === 200, { message: rbDry.data?.mode, required: false });

    const rbExec = await request(`/api/bgp/announcements/rollbacks/${rollbackId}/execute`, {
      method: "POST",
      cookie,
    });
    const rbBlocked = rbExec.data?.blocked === true || rbExec.data?.status === "real_blocked" || rbExec.data?.mode === "real_blocked";
    record("rollback.real_blocked", rbBlocked, { message: JSON.stringify(rbExec.data).slice(0, 160) });

    const rbPost = await request(`/api/bgp/announcements/rollbacks/${rollbackId}/postcheck`, {
      method: "POST",
      cookie,
    });
    record("rollback.postcheck", rbPost.status === 200, { message: rbPost.data?.status, required: false });
  }

  evidence.finishedAt = new Date().toISOString();
  evidence.summary = {
    passed: evidence.checks.filter((c) => c.ok).length,
    total: evidence.checks.length,
  };

  const outPath = path.join(rootDir, "reports/bgp-announcements/noc-homologation-evidence.json");
  writeFileSync(outPath, JSON.stringify(evidence, null, 2));
  console.log(`\nEvidence written: ${outPath}`);
  console.log(`noc-homologation-smoke: PASS (${evidence.summary.passed}/${evidence.summary.total})`);
}

main().catch((error) => {
  evidence.error = error instanceof Error ? error.message : String(error);
  evidence.finishedAt = new Date().toISOString();
  try {
    writeFileSync(
      path.join(rootDir, "reports/bgp-announcements/noc-homologation-evidence.json"),
      JSON.stringify(evidence, null, 2),
    );
  } catch { /* ignore */ }
  console.error("noc-homologation-smoke: FAIL", error);
  process.exit(1);
});
