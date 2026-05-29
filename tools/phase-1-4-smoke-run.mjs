#!/usr/bin/env node
/**
 * FASE 1.4 — controlled re-smoke device 1 (L2 dot1q live).
 * Does not print passwords/tokens in stdout.
 */
const base = process.env.API_BASE ?? "http://127.0.0.1:8085";
const email = process.env.ADMIN_EMAIL ?? "";
const password = process.env.ADMIN_PASSWORD ?? "";
const deviceId = Number(process.env.SMOKE_DEVICE_ID ?? "1");

const out = {
  phase: "1.4",
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
  log("health", { status: health.status, body: (await health.text()).slice(0, 120) });

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
  const maxPolls = 120; // 10 min @ 5s
  for (let i = 0; i < maxPolls; i++) {
    await new Promise((r) => setTimeout(r, 5000));
    const jobRes = await fetch(`${base}/api/l2-circuits/discovery-jobs/${runId}`, { headers });
    job = await jobRes.json().catch(async () => ({ raw: await jobRes.text() }));
    log("poll", {
      attempt: i + 1,
      status: jobRes.status,
      jobStatus: job.status,
      circuit_count: job.circuit_count,
    });
    if (job.status === "completed" || job.status === "failed") break;
  }

  out.job = job;
  out.job_duration_ms = Date.now() - discoverStarted;

  const listAfter = await fetch(`${base}/api/l2-circuits?device_id=${deviceId}&limit=200`, { headers });
  const listBody = await listAfter.json().catch(() => ({}));
  out.circuits = listBody.circuits ?? [];
  out.circuit_count = listBody.total ?? out.circuits.length;
  log("list_after", { status: listAfter.status, total: out.circuit_count });

  const vlanLocal = out.circuits.filter((c) => c.circuitType === "vlan_local");
  out.vlan_local_count = vlanLocal.length;

  const pickNames = ["Eth-Trunk0.77", "Virtual-Ethernet0/2/21.100", "Eth-Trunk0.894"];
  out.samples = [];
  for (const iface of pickNames) {
    const c = vlanLocal.find((x) => x.localInterface === iface) ?? vlanLocal.find((x) => x.name?.includes(iface));
    if (c) {
      const detailRes = await fetch(`${base}/api/l2-circuits/${c.id}`, { headers });
      const detail = await detailRes.json().catch(() => c);
      out.samples.push({
        id: detail.id,
        circuitType: detail.circuitType,
        serviceId: detail.serviceId,
        localInterface: detail.localInterface,
        parentInterface: detail.parentInterface,
        outerVlan: detail.outerVlan,
        description: detail.description,
        adminStatus: detail.adminStatus,
        operStatus: detail.operStatus,
        findings: detail.findings,
        rawEvidenceLen: String(detail.rawEvidence ?? "").length,
      });
    }
  }
  if (out.samples.length < 3 && vlanLocal.length > 0) {
    for (const c of vlanLocal.slice(0, 3 - out.samples.length)) {
      if (out.samples.some((s) => s.id === c.id)) continue;
      out.samples.push({
        id: c.id,
        circuitType: c.circuitType,
        serviceId: c.serviceId,
        localInterface: c.localInterface,
        outerVlan: c.outerVlan,
        description: c.description,
        adminStatus: c.adminStatus,
        operStatus: c.operStatus,
        findings: c.findings,
      });
    }
  }

  const evidenceBlob = out.circuits.map((c) => String(c.rawEvidence ?? "")).join("\n");
  out.redact_check = {
    has_password_plain: /\bpassword\s*[:=]\s*\S+/i.test(evidenceBlob) && !evidenceBlob.includes("<redacted>"),
    has_token_plain: /\b(token|community)\s*[:=]\s*\S+/i.test(evidenceBlob) && !evidenceBlob.includes("<redacted>"),
    has_cipher: /\bcipher\b/i.test(evidenceBlob) && !evidenceBlob.includes("<redacted>"),
    has_simple: /\bsimple\b/i.test(evidenceBlob) && !evidenceBlob.includes("<redacted>"),
  };

  const allFindings = out.circuits.flatMap((c) => c.findings ?? []);
  out.findings_summary = {
    total: allFindings.length,
    codes: [...new Set(allFindings.map((f) => f.code))],
    circuit_down: allFindings.filter((f) => f.code === "CIRCUIT_DOWN").length,
    description_missing: allFindings.filter((f) => f.code === "DESCRIPTION_MISSING").length,
  };

  out.total_duration_ms = Date.now() - t0;
  out.final = {
    go: job?.status === "completed" && out.circuit_count > 0,
    job_status: job?.status,
    error_message: job?.error_message ?? null,
    offline_expected: 131,
    live_vlan_local: out.vlan_local_count,
  };

  console.log(JSON.stringify(out, null, 2));
  process.exit(job?.status === "completed" && out.circuit_count > 0 ? 0 : 2);
}

main().catch((e) => {
  out.errors.push(e.message);
  console.log(JSON.stringify(out));
  process.exit(1);
});
