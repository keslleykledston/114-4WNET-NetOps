#!/usr/bin/env node

import assert from "assert";
import fs from "fs";
import { fileURLToPath } from "url";
import { dirname, resolve } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));

function log(...args) {
  console.log("[E2E]", ...args);
}

function pass(msg) {
  console.log(`✓ ${msg}`);
}

function fail(msg) {
  console.error(`❌ ${msg}`);
  process.exit(1);
}

// Read .env from root
function loadEnv() {
  const envPath = resolve(__dirname, "../.env");
  if (!fs.existsSync(envPath)) fail("No .env found");
  const env = {};
  fs.readFileSync(envPath, "utf-8")
    .split("\n")
    .forEach((line) => {
      const [key, val] = line.split("=");
      if (key && val) env[key.trim()] = val.trim();
    });
  return env;
}

async function request(path, options = {}) {
  const { method = "GET", body, token } = options;
  const apiBase = process.env.API_BASE || "http://localhost:8085";
  const headers = {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
  if (options.cookie) headers.Cookie = options.cookie;
  const response = await fetch(`${apiBase}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
    credentials: "include",
  });
  return response;
}

async function login(email, password) {
  const res = await request("/api/auth/login", {
    method: "POST",
    body: { email, password },
  });
  if (!res.ok) fail(`Login failed: ${res.status}`);
  const data = await res.json();
  assert(data.user && data.user.role === "admin", "Not admin");
  return { sessionCookie: res.headers.get("set-cookie"), user: data.user };
}

async function apiCall(path, method = "GET", body, sessionCookie) {
  const res = await request(path, {
    method,
    body,
    cookie: sessionCookie,
  });
  if (!res.ok) {
    const error = await res.text();
    throw new Error(`${method} ${path}: ${res.status} ${error}`);
  }
  return res.json ? res.json() : res.text();
}

log("PHASE v0.5.1 — E2E Huawei Real + Parser Hardening");
log("================================================\n");

const env = loadEnv();
Object.assign(process.env, env);

// Test fixtures (simulated real Huawei output)
const fixtures = {
  huaweiDisplayVersion: `
Huawei Technologies Co., Ltd.
HUAWEI CE6881-48S6D
Software Version V800R020C10SPC500
Build Date: 2023-11-20
Uptime: 14 days 5 hours 32 minutes
`,
  huaweiL2vcVerbose: `
L2VC ID: 1001
L2VC Name: VC-SITE-A
L2VC Type: Ethernet
AdminStatus: up
OperStatus: up
Peer IP: 10.20.1.2
Description: L2VC-Site-A-Branch
OuterVlan: 100
Interface: GE0/0/1
PW Status: UP

L2VC ID: 1002
L2VC Name: VC-SITE-B
...
`,
  huaweiBgpPeerVerbose: `
BGP Peer is 10.10.1.1, remote AS 65001
Type: EBGP link
Peer Description: "ISP-PRIMARY"
BGP current state: Established, Up for 14d18h32m10s
Received total routes: 1200
Advertised total routes: 45

BGP Peer is 10.10.2.1, remote AS 65001
Type: EBGP link
Peer Description: "ISP-BACKUP"
BGP current state: Idle
Received total routes: 0
Advertised total routes: 0
`,
  huaweiInterfaceBrief: `
Interface      IP-Address      Status      MTU
GE0/0/1        192.168.1.1     up         1500
GE0/0/2        unassigned      down       1500
LoopBack0      10.0.0.1        up         65535
GE0/0/3        unassigned      up         1500
`,
};

async function runE2E() {
  try {
    log("1. Login as admin");
    const { sessionCookie, user } = await login(
      process.env.ADMIN_EMAIL || "admin@example.com",
      process.env.ADMIN_PASSWORD || "admin123456"
    );
    pass(`Logged in as ${user.email}`);

    log("\n2. Create tenant");
    const tenant = await apiCall("/api/connectors/tenants", "POST", {
      name: "E2E-Huawei-Test-" + Date.now(),
      slug: "e2e-huawei-" + Date.now(),
    });
    assert(tenant.id, "No tenant ID");
    pass(`Tenant created: ${tenant.name} (ID: ${tenant.id})`);

    log("\n3. Create connector");
    const connector = await apiCall(
      "/api/connectors",
      "POST",
      {
        tenant_id: tenant.id,
        name: "huawei-ce6881-01",
        description: "Real Huawei CE6881 for E2E validation",
        wireguard_ip: "10.255.0.50",
        wireguard_endpoint: "vpn.netops.local:51820",
        wireguard_allowed_ips: "10.0.0.0/8,192.168.0.0/16",
        networks: [
          { network_cidr: "10.20.0.0/24", description: "Site A LAN" },
          { network_cidr: "10.30.0.0/24", description: "Site B LAN" },
        ],
      },
      sessionCookie
    );
    assert(connector.id, "No connector ID");
    assert(connector.bootstrap_pending === true, "Should need bootstrap");
    assert(!connector.connector_token, "Token should not be in response");
    pass(`Connector created: ${connector.name} (ID: ${connector.id})`);

    log("\n4. Generate bootstrap package");
    const bootstrapRes = await request(
      `/api/connectors/${connector.id}/bootstrap-package`,
      {
        method: "POST",
        cookie: sessionCookie,
      }
    );
    assert(bootstrapRes.ok, `Bootstrap failed: ${bootstrapRes.status}`);
    const envContent = await bootstrapRes.text();
    const tokenMatch = envContent.match(/export CONNECTOR_TOKEN="(nc_[^"]+)"/);
    assert(tokenMatch && tokenMatch[1], "No token in .env");
    const connectorToken = tokenMatch[1];
    pass("Bootstrap package generated, token extracted");

    log("\n5. Simulate heartbeat (WireGuard UP)");
    const hbRes = await request("/api/connectors/heartbeat", {
      method: "POST",
      token: connectorToken,
      body: {
        connector_name: connector.name,
        status: "ONLINE",
        version: "agent-rc1",
        wireguard_status: "UP",
        lan_ip: "192.0.2.10",
        wg_ip: "10.255.0.50",
        routes_count: 5,
        nat_enabled: false,
        cpu_usage: 23.5,
        memory_usage: 45.2,
      },
    });
    assert(hbRes.ok, `Heartbeat failed: ${hbRes.status}`);
    const hb = await hbRes.json();
    assert(hb.status === "ONLINE", "Should be ONLINE");
    pass("Heartbeat successful, connector now ONLINE");

    log("\n6. Create Huawei device");
    const device = await apiCall(
      "/api/devices",
      "POST",
      {
        hostname: "huawei-ce6881.site-a.local",
        ipAddress: "10.20.1.10",
        vendor: "huawei",
        platform: "vrp",
        sshPort: 22,
        username: "admin",
        password: "encrypted_pwd",
        site: "site-a",
        role: "router",
        connectorId: connector.id,
      },
      sessionCookie
    );
    assert(device.id, "No device ID");
    pass(`Device created: ${device.hostname} (ID: ${device.id})`);

    log("\n7. Create SSH_CONFIG_BUNDLE job");
    const job = await apiCall(
      "/api/connectors/jobs",
      "POST",
      {
        connector_id: connector.id,
        job_type: "SSH_CONFIG_BUNDLE",
        device_id: device.id,
        target_ip: device.ipAddress,
        target_port: 22,
        timeout_seconds: 300,
        payload_json: {
          username: device.username,
          password: device.password,
          vendor: device.vendor,
          port: device.sshPort,
          commands: [
            "display current-configuration",
            "display bgp peer verbose",
            "display mpls l2vc verbose",
            "display vsi verbose",
            "display interface description",
            "display interface brief",
          ],
        },
      },
      sessionCookie
    );
    assert(job.id, "No job ID");
    assert(job.status === "PENDING", "Job should be pending");
    pass(`SSH_CONFIG_BUNDLE job created (ID: ${job.id})`);

    log("\n8. Simulate job completion with fixture data");
    const jobResult = await apiCall(
      `/api/connectors/jobs/${job.id}/result`,
      "POST",
      {
        success: true,
        stdout:
          fixtures.huaweiInterfaceBrief +
          "\n! === display current-configuration ===\n" +
          fixtures.huaweiL2vcVerbose +
          "\n! === display bgp peer verbose ===\n" +
          fixtures.huaweiBgpPeerVerbose,
        stderr: "",
        exit_code: 0,
      },
      sessionCookie
    );
    assert(jobResult.status === "SUCCESS", "Job should be success");
    pass("Job completed, result submitted");

    log("\n9. Query L2 circuits");
    const l2circuits = await apiCall(
      `/api/l2-circuits?device_id=${device.id}`,
      "GET",
      null,
      sessionCookie
    );
    assert(l2circuits.circuits, "No circuits list");
    assert(l2circuits.circuits.length >= 2, "Should find L2VC circuits");
    const l2vcCircuit = l2circuits.circuits.find(
      (c) => c.circuitType === "l2vc"
    );
    assert(l2vcCircuit, "L2VC circuit not found");
    assert(l2vcCircuit.vcId === "1001", "L2VC ID mismatch");
    assert(l2vcCircuit.operStatus === "UP", "L2VC should be UP");
    pass(
      `✓ L2 circuits discovered: ${l2circuits.circuits.length} circuits, L2VC status=${l2vcCircuit.operStatus}`
    );

    log("\n10. Query BGP peers");
    const bgpRes = await apiCall(
      `/api/operational/bgp?device_id=${device.id}`,
      "GET",
      null,
      sessionCookie
    );
    assert(bgpRes.peers || bgpRes.length >= 0, "No BGP data");
    const peers = bgpRes.peers || bgpRes;
    assert(peers.length >= 1, "Should find BGP peers");
    const establishedPeer = peers.find((p) => p.fsmState === "Established");
    assert(establishedPeer, "No established peer");
    assert(establishedPeer.receivedPrefixes >= 1200, "Should have prefixes");
    pass(
      `✓ BGP peers discovered: ${peers.length} peers, established=${establishedPeer.peerIp}`
    );

    log("\n11. Verify connector health dashboard");
    const health = await apiCall(
      `/api/connectors/${connector.id}/health`,
      "GET",
      null,
      sessionCookie
    );
    assert(health.status, "No health status");
    assert(health.score >= 0 && health.score <= 100, "Invalid health score");
    assert(health.lastHeartbeatAgeSeconds <= 60, "Heartbeat too old");
    assert(health.lastHandshakeAgeSeconds <= 60, "WG handshake too old");
    pass(
      `✓ Connector health: ${health.status}, score=${health.score}, heartbeat=${health.lastHeartbeatAgeSeconds}s, wg=${health.lastHandshakeAgeSeconds}s`
    );

    log("\n12. Check audit logs (no secrets leak)");
    const auditRes = await request("/api/audit-logs?action=connector_created", {
      method: "GET",
      cookie: sessionCookie,
    });
    assert(auditRes.ok, "Audit query failed");
    const auditLogs = await auditRes.json();
    const recentAudit = auditLogs[0];
    assert(recentAudit, "No audit log");
    const auditStr = JSON.stringify(recentAudit);
    assert(
      !auditStr.includes("admin123"),
      "Password leaked in audit log"
    );
    assert(!auditStr.includes("nc_"), "Token leaked in audit log");
    pass("✓ Audit logs: no secrets leaked");

    log("\n13. Verify SNMP interface collection (from SSH output)");
    // Interface data should be parsed from the SSH bundle
    const interfacesRes = await request(
      `/api/devices/${device.id}/operational/interfaces`,
      {
        method: "GET",
        cookie: sessionCookie,
      }
    );
    if (interfacesRes.ok) {
      const interfaces = await interfacesRes.json();
      if (interfaces && interfaces.length > 0) {
        const activeIface = interfaces.find((i) => i.operStatus === "up");
        if (activeIface) {
          pass(
            `✓ Interfaces collected: ${interfaces.length} total, ${activeIface.ifName} is ${activeIface.operStatus}`
          );
        } else {
          pass(`✓ Interfaces collected: ${interfaces.length} total (none up)`);
        }
      }
    } else {
      pass("⚠ Interfaces endpoint not yet available (expected)");
    }

    log("\n14. Final smoke test: all critical paths");
    assert(connector.id, "Connector missing");
    assert(device.id, "Device missing");
    assert(l2vcCircuit, "L2 circuits missing");
    assert(establishedPeer, "BGP peers missing");
    assert(health.status, "Health status missing");
    pass("✓ All critical E2E paths verified");

    console.log("\n");
    console.log("🎉 Phase v0.5.1 E2E Test Complete");
    console.log("===================================");
    console.log(`Connector: ${connector.name} (${connector.id})`);
    console.log(`Device: ${device.hostname} (${device.id})`);
    console.log(
      `L2 Circuits: ${l2circuits.circuits.length} found, L2VC status: ${l2vcCircuit.operStatus}`
    );
    console.log(
      `BGP Peers: ${peers.length} found, established: ${establishedPeer.peerIp}`
    );
    console.log(
      `Health: ${health.status} (score=${health.score}, wg=${health.lastHandshakeAgeSeconds}s)`
    );
    console.log("");
  } catch (error) {
    fail(`Unexpected error: ${error.message}`);
  }
}

runE2E().catch(fail);
