#!/usr/bin/env node
/**
 * Phase 1.1 Huawei L2 smoke — run inside netops-api or host with API reachability.
 * Does not print passwords or tokens in stdout.
 */
const base = process.env.API_BASE ?? "http://127.0.0.1:8080";
const email = process.env.ADMIN_EMAIL ?? "";
const password = process.env.ADMIN_PASSWORD ?? "";
const deviceId = Number(process.env.SMOKE_DEVICE_ID ?? "1");

const out = { steps: [], errors: [] };

function log(step, data) {
  out.steps.push({ step, at: new Date().toISOString(), ...data });
  console.log(JSON.stringify({ step, ...data }));
}

async function main() {
  if (!email || !password) {
    out.errors.push("ADMIN_EMAIL/ADMIN_PASSWORD missing");
    console.log(JSON.stringify(out));
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
    console.log(JSON.stringify(out));
    process.exit(1);
  }

  const headers = {
    "Content-Type": "application/json",
    ...(cookie ? { Cookie: cookie } : {}),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };

  const health = await fetch(`${base}/api/healthz`);
  log("health", { status: health.status, body: await health.text() });

  const listBefore = await fetch(`${base}/api/l2-circuits`, { headers });
  log("list_before", { status: listBefore.status, body: (await listBefore.text()).slice(0, 300) });

  const testConn = await fetch(`${base}/api/devices/${deviceId}/test-connection`, {
    method: "POST",
    headers,
  });
  const testConnBody = await testConn.json().catch(() => ({}));
  log("test_connection", { status: testConn.status, success: testConnBody.success, message: testConnBody.message });

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

  let job = null;
  const maxPolls = 90;
  for (let i = 0; i < maxPolls; i++) {
    await new Promise((r) => setTimeout(r, 5000));
    const jobRes = await fetch(`${base}/api/l2-circuits/discovery-jobs/${runId}`, { headers });
    const jobText = await jobRes.json().catch(async () => ({ raw: await jobRes.text() }));
    job = jobText;
    log("poll", { attempt: i + 1, status: jobRes.status, jobStatus: jobText.status });
    if (jobText.status === "completed" || jobText.status === "failed") break;
  }

  out.run_id = runId;
  out.job = job;

  const listAfter = await fetch(`${base}/api/l2-circuits?device_id=${deviceId}`, { headers });
  const listBody = await listAfter.json().catch(() => ({}));
  out.circuits = listBody.circuits ?? [];
  out.circuit_count = listBody.total ?? out.circuits.length;
  log("list_after", { status: listAfter.status, total: out.circuit_count });

  if (out.circuits.length > 0) {
    const first = out.circuits[0];
    const detailRes = await fetch(`${base}/api/l2-circuits/${first.id}`, { headers });
    const detail = await detailRes.json().catch(() => ({}));
    out.circuit_detail = {
      id: detail.id,
      circuitType: detail.circuitType,
      name: detail.name,
      vcId: detail.vcId,
      vsiName: detail.vsiName,
      peerIp: detail.peerIp,
      rawEvidence: detail.rawEvidence,
      findings: detail.findings,
    };
    const ev = String(detail.rawEvidence ?? "");
    out.redact_check = {
      has_password_plain: /\bpassword\s*[:=]\s*\S+/i.test(ev) && !ev.includes("<redacted>"),
      has_community_plain: /snmp-agent\s+community\s+\S+/i.test(ev) && !ev.includes("<redacted>"),
      length: ev.length,
    };
    log("circuit_detail", { id: first.id, redact_ok: !out.redact_check.has_password_plain });
  }

  const allFindings = out.circuits.flatMap((c) => c.findings ?? []);
  out.findings_summary = {
    total: allFindings.length,
    codes: [...new Set(allFindings.map((f) => f.code))],
  };

  out.final = {
    go: job?.status === "completed",
    job_status: job?.status,
    error_message: job?.error_message ?? null,
  };

  console.log(JSON.stringify(out, null, 2));
  process.exit(job?.status === "completed" ? 0 : 2);
}

main().catch((e) => {
  out.errors.push(e.message);
  console.log(JSON.stringify(out));
  process.exit(1);
});
