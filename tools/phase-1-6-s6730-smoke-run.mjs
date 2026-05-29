#!/usr/bin/env node
/**
 * FASE 1.6 — S6730 L2 smoke (single device).
 * Does not print passwords/tokens in stdout.
 */
const base = process.env.API_BASE ?? "http://127.0.0.1:8085";
const email = process.env.ADMIN_EMAIL ?? "";
const password = process.env.ADMIN_PASSWORD ?? "";
const deviceId = Number(process.env.SMOKE_DEVICE_ID ?? "0");

const out = {
  phase: "1.6",
  device_id: deviceId,
  api_base: base,
  started_at: new Date().toISOString(),
  steps: [],
  errors: [],
};

function log(step, data) {
  out.steps.push({ step, at: new Date().toISOString(), ...data });
  console.log(JSON.stringify({ step, ...data }));
}

async function main() {
  if (!deviceId) {
    out.errors.push("SMOKE_DEVICE_ID required");
    console.log(JSON.stringify(out));
    process.exit(1);
  }
  if (!email || !password) {
    out.errors.push("ADMIN_EMAIL/ADMIN_PASSWORD missing");
    console.log(JSON.stringify(out));
    process.exit(1);
  }

  const t0 = Date.now();

  const loginRes = await fetch(`${base}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const loginBody = await loginRes.json().catch(() => ({}));
  const cookie = loginRes.headers.get("set-cookie")?.split(";")[0];
  const token = loginBody.token;
  log("login", { status: loginRes.status, hasToken: Boolean(token) });
  if (!loginRes.ok) {
    out.errors.push("login_failed");
    console.log(JSON.stringify(out));
    process.exit(1);
  }

  const headers = {
    "Content-Type": "application/json",
    ...(cookie ? { Cookie: cookie } : {}),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };

  const health = await fetch(`${base}/api/healthz`);
  log("health", { status: health.status, body: (await health.text()).slice(0, 80) });

  const devRes = await fetch(`${base}/api/devices/${deviceId}`, { headers });
  const device = await devRes.json().catch(() => ({}));
  log("device", {
    status: devRes.status,
    hostname: device.hostname,
    vendor: device.vendor,
    platform: device.platform,
    hasIp: Boolean(device.ipAddress ?? device.ip_address),
  });

  const testConn = await fetch(`${base}/api/devices/${deviceId}/test-connection`, {
    method: "POST",
    headers,
  });
  const testConnBody = await testConn.json().catch(() => ({}));
  log("test_connection", { status: testConn.status, success: testConnBody.success, message: testConnBody.message });

  const discoverStarted = Date.now();
  const discover = await fetch(`${base}/api/l2-circuits/discover`, {
    method: "POST",
    headers,
    body: JSON.stringify({ device_id: deviceId }),
  });
  const discoverText = await discover.text();
  let runId = null;
  try {
    runId = JSON.parse(discoverText).run_id;
  } catch {
    /* ignore */
  }
  log("discover", { status: discover.status, runId, body: discoverText.slice(0, 400) });

  if (!runId || discover.status !== 202) {
    out.errors.push("discover_failed");
    out.final = { go: false };
    console.log(JSON.stringify(out));
    process.exit(1);
  }

  out.run_id = runId;
  let job = null;
  const maxPolls = 120;
  for (let i = 0; i < maxPolls; i++) {
    await new Promise((r) => setTimeout(r, 5000));
    const jobRes = await fetch(`${base}/api/l2-circuits/discovery-jobs/${runId}`, { headers });
    job = await jobRes.json().catch(async () => ({ raw: await jobRes.text() }));
    log("poll", {
      attempt: i + 1,
      jobStatus: job.status,
      circuit_count: job.circuit_count,
      error_message: job.error_message,
    });
    if (job.status === "completed" || job.status === "failed") break;
  }

  out.job = job;
  out.job_duration_ms = Date.now() - discoverStarted;

  const listAfter = await fetch(`${base}/api/l2-circuits?device_id=${deviceId}&limit=500`, { headers });
  const listBody = await listAfter.json().catch(() => ({}));
  out.circuits = listBody.circuits ?? [];
  out.circuit_count = listBody.total ?? out.circuits.length;

  const byType = {};
  for (const c of out.circuits) {
    byType[c.circuitType] = (byType[c.circuitType] ?? 0) + 1;
  }
  out.by_type = byType;

  const l2 = out.circuits.filter((c) => c.circuitType === "l2vc" || c.circuitType === "vpws");
  const normalized = { UP: 0, DOWN: 0, PARTIAL: 0, OTHER: 0 };
  for (const c of l2) {
    const s = c.operStatus;
    if (s === "UP") normalized.UP++;
    else if (s === "DOWN") normalized.DOWN++;
    else if (s === "PARTIAL") normalized.PARTIAL++;
    else normalized.OTHER++;
  }
  out.l2vc_oper_status = normalized;

  out.vc15 = l2.find((c) => c.vcId === "15" || c.vcId === 15) ?? null;
  out.vsi_servicos = out.circuits.find((c) => c.vsiName === "SERVICOS_CDS") ?? null;

  const allFindings = out.circuits.flatMap((c) => c.findings ?? []);
  out.findings_summary = {
    total: allFindings.length,
    codes: [...new Set(allFindings.map((f) => f.code))],
  };

  out.total_duration_ms = Date.now() - t0;
  out.final = {
    go: job?.status === "completed" && l2.length > 0,
    job_status: job?.status,
    l2vc_count: l2.length,
    fixture_expected_l2vc: 82,
  };

  console.log(JSON.stringify(out, null, 2));
  process.exit(job?.status === "completed" && l2.length > 0 ? 0 : 2);
}

main().catch((e) => {
  out.errors.push(e.message);
  console.log(JSON.stringify(out));
  process.exit(1);
});
