#!/usr/bin/env node
/**
 * E2E smoke: Copilot no device piloto (default id=2, 4WNET-BVA-BRT-RA).
 * Requer API up + ADMIN_EMAIL/ADMIN_PASSWORD.
 */
import assert from "node:assert/strict";

const baseUrl = process.env.API_BASE_URL ?? "http://127.0.0.1:8085";
const pilotDeviceId = Number(process.env.COPILOT_PILOT_DEVICE_ID ?? "2");
const adminEmail = process.env.ADMIN_EMAIL ?? process.env.RBAC_TEST_ADMIN_EMAIL;
const adminPassword = process.env.ADMIN_PASSWORD ?? process.env.RBAC_TEST_ADMIN_PASSWORD;

if (!adminEmail || !adminPassword) {
  console.error("copilot-e2e-smoke: ADMIN_EMAIL and ADMIN_PASSWORD required");
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
  assert.equal(response.status, 200, `login failed: ${JSON.stringify(data)}`);
  const cookie = cookieFromResponse(response)
    ?? (typeof data?.token === "string" ? `netops_session=${data.token}` : "");
  assert.ok(cookie, "missing session cookie");
  return cookie;
}

function assertOk(response, label, data) {
  assert.ok(response.ok, `${label}: HTTP ${response.status} ${JSON.stringify(data)}`);
}

async function main() {
  console.log(`copilot-e2e-smoke: base=${baseUrl} pilotDeviceId=${pilotDeviceId}`);

  const health = await request("/api/healthz");
  assert.equal(health.response.status, 200, "healthz");

  const cookie = await login();

  const device = await request(`/api/devices/${pilotDeviceId}`, { cookie });
  assertOk(device.response, "device", device.data);
  console.log(`  device: ${device.data.hostname ?? device.data.name} tenant=${device.data.tenantId}`);

  const nluStatus = await request("/api/copilot/nlu/status", { cookie });
  assertOk(nluStatus.response, "nlu/status", nluStatus.data);
  console.log(`  nlu: enabled=${nluStatus.data.enabled} reachable=${nluStatus.data.reachable}`);

  const sshStatus = await request("/api/copilot/ssh/status", { cookie });
  assertOk(sshStatus.response, "ssh/status", sshStatus.data);
  console.log(`  ssh: enabled=${sshStatus.data.enabled}`);

  const inventoryStatus = await request("/api/copilot/inventory/status", { cookie });
  assertOk(inventoryStatus.response, "inventory/status", inventoryStatus.data);
  console.log(`  inventory: enabled=${inventoryStatus.data.enabled} snmp=${inventoryStatus.data.snmpRealEnabled}`);

  const netboxStatus = await request("/api/copilot/netbox/status", { cookie });
  assertOk(netboxStatus.response, "netbox/status", netboxStatus.data);
  console.log(`  netbox: enabled=${netboxStatus.data.enabled} netbox=${netboxStatus.data.netboxEnabled}`);

  const peering = await request("/api/copilot/ask", {
    method: "POST",
    cookie,
    body: {
      question: "Como esta o peering com Google na VRF CDN?",
      deviceId: pilotDeviceId,
      mode: "technical",
    },
  });
  assertOk(peering.response, "ask/peering", peering.data);
  assert.equal(peering.data.readOnly, true);
  assert.ok(peering.data.evidence?.scope?.deviceCount >= 1, "scope must include devices");
  assert.ok(peering.data.evidence.toolRuns.length >= 1, "toolRuns required");
  const inventoryTool = peering.data.evidence.toolRuns.find((run) => run.toolName === "netops_inventory_refresh");
  console.log(`  peering: intent=${peering.data.intent} peers=${peering.data.evidence.peers?.length ?? 0} tools=${peering.data.evidence.toolRuns.length} inventory=${inventoryTool?.status ?? "missing"}`);

  const prefixQ = await request("/api/copilot/ask", {
    method: "POST",
    cookie,
    body: {
      question: "Por que o prefixo 45.7.10.0/24 nao esta saindo para Google?",
      deviceId: pilotDeviceId,
      mode: "diagnostic",
    },
  });
  assertOk(prefixQ.response, "ask/prefix_trace", prefixQ.data);
  assert.equal(prefixQ.data.intent, "prefix_trace");
  const sshTool = prefixQ.data.evidence.toolRuns.find((run) => run.toolName === "bgp_route_ssh_live");
  console.log(`  prefix_trace: tools=${prefixQ.data.evidence.toolRuns.length} ssh_tool=${sshTool?.status ?? "missing"} traces=${prefixQ.data.evidence.prefixTraces?.length ?? 0}`);

  const chat = await request("/api/copilot/chat", {
    method: "POST",
    cookie,
    body: {
      question: "Status BGP peers CDN",
      deviceId: pilotDeviceId,
      mode: "quick",
    },
  });
  assertOk(chat.response, "chat", chat.data);
  assert.ok(chat.data.sessionId, "sessionId required for chat");
  assert.ok(chat.data.messageId, "messageId required for chat");
  console.log(`  chat: session=${chat.data.sessionId} message=${chat.data.messageId}`);

  const ambiguous = await request("/api/copilot/ask", {
    method: "POST",
    cookie,
    body: {
      question: "Me fala sobre peering Google e anuncio do prefixo 10.0.0.0/24",
      deviceId: pilotDeviceId,
    },
  });
  assertOk(ambiguous.response, "ask/ambiguous", ambiguous.data);
  console.log(`  ambiguous: intent=${ambiguous.data.intent} nlu.used=${ambiguous.data.evidence.nlu?.used} ambiguous=${ambiguous.data.evidence.nlu?.ambiguous}`);

  if (sshStatus.data.enabled) {
    assert.ok(sshTool, "bgp_route_ssh_live must run when SSH on-demand enabled");
    assert.notEqual(sshTool.status, "error", `ssh tool error: ${sshTool.error ?? ""}`);
  } else {
    assert.equal(sshTool?.status, "skipped", "ssh tool should be skipped when disabled");
  }

  assert.ok(inventoryTool, "netops_inventory_refresh must be in peering plan");
  if (inventoryStatus.data.enabled && inventoryStatus.data.snmpRealEnabled) {
    assert.notEqual(inventoryTool.status, "error", `inventory tool error: ${inventoryTool.error ?? ""}`);
  } else {
    assert.equal(inventoryTool.status, "skipped", "inventory tool should be skipped when disabled");
  }

  const netboxQ = await request("/api/copilot/ask", {
    method: "POST",
    cookie,
    body: {
      question: "Quais devices do escopo existem no NetBox?",
      deviceId: pilotDeviceId,
      mode: "technical",
    },
  });
  assertOk(netboxQ.response, "ask/netbox", netboxQ.data);
  assert.equal(netboxQ.data.intent, "netbox_inventory");
  const netboxTool = netboxQ.data.evidence.toolRuns.find((run) => run.toolName === "netbox_inventory_query");
  console.log(`  netbox: intent=${netboxQ.data.intent} tool=${netboxTool?.status ?? "missing"} matches=${netboxQ.data.evidence.netboxMatches?.length ?? 0}`);

  assert.ok(netboxTool, "netbox_inventory_query must be in netbox plan");
  if (netboxStatus.data.enabled && netboxStatus.data.netboxEnabled) {
    assert.notEqual(netboxTool.status, "error", `netbox tool error: ${netboxTool.error ?? ""}`);
  } else {
    assert.equal(netboxTool.status, "skipped", "netbox tool should be skipped when disabled");
  }

  const compliance = await request("/api/copilot/ask", {
    method: "POST",
    cookie,
    body: {
      question: "Quais achados de compliance fail no escopo?",
      deviceId: pilotDeviceId,
      mode: "technical",
    },
  });
  assertOk(compliance.response, "ask/compliance", compliance.data);
  assert.equal(compliance.data.intent, "compliance_status");
  console.log(`  compliance: tools=${compliance.data.evidence.toolRuns.length} findings=${compliance.data.evidence.complianceFindings?.length ?? 0}`);

  const aliasStats = await request(`/api/copilot/aliases/stats?tenantId=${device.data.tenantId ?? 1}`, { cookie });
  assertOk(aliasStats.response, "aliases/stats", aliasStats.data);
  console.log(`  aliases: pending=${aliasStats.data.stats?.pending ?? 0}`);

  const teach = await request("/api/copilot/aliases/propose", {
    method: "POST",
    cookie,
    body: {
      tenantId: device.data.tenantId ?? 1,
      alias: "speednet-smoke",
      canonicalName: "SpeedNet Smoke Test",
      entityType: "customer",
    },
  });
  assertOk(teach.response, "aliases/propose", teach.data);
  console.log(`  alias_propose: id=${teach.data.alias?.id} status=${teach.data.status}`);

  console.log("copilot-e2e-smoke: PASS");
}

main().catch((error) => {
  console.error(`copilot-e2e-smoke: FAIL — ${error.message}`);
  process.exit(1);
});
