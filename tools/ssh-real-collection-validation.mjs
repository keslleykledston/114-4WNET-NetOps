#!/usr/bin/env node

const baseUrl = process.env.BASE_URL || process.env.API_BASE_URL || "http://127.0.0.1:8085";
const deviceId = Number(process.env.DEVICE_ID || 0);
const email = process.env.ADMIN_EMAIL || "admin@netops.local";
const password = process.env.ADMIN_PASSWORD || "Admin123!ChangeMe";

function pickJson(value) {
  try {
    return typeof value === "string" ? JSON.parse(value) : value;
  } catch {
    return value;
  }
}

async function api(path, options = {}, token) {
  const headers = { ...(options.headers || {}) };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (options.body && !headers["content-type"]) headers["content-type"] = "application/json";
  const res = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers,
  });
  const text = await res.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { json = text; }
  if (!res.ok) {
    const err = new Error(`HTTP ${res.status} ${path}`);
    err.response = json;
    throw err;
  }
  return json;
}

async function waitFor(check, timeoutMs = 30_000, stepMs = 1500) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const value = await check();
    if (value) return value;
    await new Promise(r => setTimeout(r, stepMs));
  }
  return null;
}

async function main() {
  if (!deviceId) {
    console.log(JSON.stringify({ skipped: true, reason: "DEVICE_ID missing" }, null, 2));
    return;
  }

  const login = await api("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
  const token = login.token;

  const testConnectivity = await api(`/api/devices/${deviceId}/test-connectivity`, { method: "POST" }, token);
  const collected = await api("/api/collected-configs", {
    method: "POST",
    body: JSON.stringify({ deviceId }),
  }, token);
  const discovery = await api(`/api/devices/${deviceId}/discover`, {
    method: "POST",
    body: JSON.stringify({
      contexts: ["interfaces", "bgp", "l2vpn", "policies", "vrfs", "security"],
      preferLiveSsh: true,
      allowSnmpFallback: true,
      useCachedConfig: true,
    }),
  }, token);
  const snapshot = await api(`/api/devices/${deviceId}/discovery-snapshot`, {}, token);
  const peers = await api(`/api/devices/${deviceId}/bgp/peers`, {}, token);

  const customerPeer = peers.find(p => p.category === "customer");
  const providerPeer = peers.find(p => ["provider", "cdn", "ix"].includes(p.category));
  const routeResults = [];

  if (customerPeer?.peerIp || customerPeer?.peerIP || customerPeer?.neighbor) {
    const peerIp = customerPeer.peerIp || customerPeer.peerIP || customerPeer.neighbor;
    const received = await api(`/api/devices/${deviceId}/bgp/peers/${encodeURIComponent(peerIp)}/routes/query`, {
      method: "POST",
      body: JSON.stringify({ direction: "received", limit: 200, page: 1 }),
    }, token);
    routeResults.push({ peerIp, direction: "received", total: received.total, returned: received.items?.length || 0 });
  }

  if (providerPeer?.peerIp || providerPeer?.peerIP || providerPeer?.neighbor) {
    const peerIp = providerPeer.peerIp || providerPeer.peerIP || providerPeer.neighbor;
    const advertised = await api(`/api/devices/${deviceId}/bgp/peers/${encodeURIComponent(peerIp)}/routes/query`, {
      method: "POST",
      body: JSON.stringify({ direction: "advertised", limit: 200, page: 1 }),
    }, token);
    routeResults.push({ peerIp, direction: "advertised", total: advertised.total, returned: advertised.items?.length || 0 });
  }

  let policies = await api("/api/compliance-policies", {}, token);
  let policy = policies.find(p => p.name === "ssh-real-sysname-present");
  if (!policy) {
    policy = await api("/api/compliance-policies", {
      method: "POST",
      body: JSON.stringify({
        name: "ssh-real-sysname-present",
        description: "Read-only sanity check",
        context: "security",
        severity: "low",
        ruleType: "presence",
        rulePattern: "sysname",
        enabled: true,
      }),
    }, token);
  }

  const job = await api("/api/compliance-jobs", {
    method: "POST",
    body: JSON.stringify({ deviceId, contexts: ["security"] }),
  }, token);
  const jobId = job.id;

  const finalJob = await waitFor(async () => {
    const state = await api(`/api/compliance-jobs/${jobId}`, {}, token);
    return ["passed", "failed", "error"].includes(state.status) ? state : null;
  }, 45_000);

  const audit = await api("/api/audit-logs?limit=100", {}, token);

  const summary = {
    deviceId,
    ssh: testConnectivity.ssh,
    snmp: testConnectivity.snmp,
    collectedConfig: {
      id: collected.id,
      hostname: collected.deviceHostname,
      at: collected.collectedAt,
      parserCounts: {
        vlans: (pickJson(collected.parsedVlans) || []).length,
        interfaces: (pickJson(collected.parsedInterfaces) || []).length,
        bgp: (pickJson(collected.parsedBgp) || []).length,
        l2vpn: (pickJson(collected.parsedL2vpn) || []).length,
        l3vpn: (pickJson(collected.parsedL3vpn) || []).length,
      },
    },
    discovery: {
      status: discovery.status,
      runId: discovery.discoveryRunId || discovery.runId || null,
      snapshotId: snapshot.persistedSnapshotId || snapshot.id || null,
      sourceSummary: snapshot.sourcesUsed || snapshot.sourceSummary || [],
      warnings: (snapshot.warnings || []).length,
      peers: peers.length,
    },
    routeResults,
    compliance: finalJob ? {
      jobId,
      status: finalJob.status,
      passCount: finalJob.passCount,
      failCount: finalJob.failCount,
      findings: (finalJob.findings || []).length,
    } : { jobId, status: "timeout" },
    auditActions: [...new Set((audit.items || audit.logs || audit || []).map(x => x.action))],
  };

  console.log(JSON.stringify(summary, null, 2));
}

main().catch(err => {
  console.error(JSON.stringify({
    ok: false,
    error: err.message,
    response: err.response ?? null,
  }, null, 2));
  process.exit(1);
});
