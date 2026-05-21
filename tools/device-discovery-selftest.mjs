#!/usr/bin/env node
import assert from "node:assert/strict";

function status({ ssh, snmp, cache }) {
  if (ssh && snmp) return "full";
  if (!ssh && snmp && cache) return "fallback";
  if (ssh || snmp) return "partial";
  if (cache) return "cached";
  return "failed";
}

function primaryDirection(role) {
  if (role === "customer") return "import";
  if (role === "ibgp") return "internal";
  return "export";
}

function routeProtection({ receivedRoutes, advertisedRoutes }) {
  const largeReceivedRoutes = receivedRoutes > 5000;
  const largeAdvertisedRoutes = advertisedRoutes > 5000;
  return {
    largeReceivedRoutes,
    largeAdvertisedRoutes,
    autoLoadRoutes: false,
    requiresExplicitRouteSearch: largeReceivedRoutes || largeAdvertisedRoutes,
  };
}

function sanitize(value) {
  return String(value ?? "")
    .replace(/(password|community|token|secret)\s*[:=]\s*\S+/gi, "$1=<redacted>")
    .replace(/snmp-server\s+community\s+\S+/gi, "snmp-server community <redacted>")
    .replace(/(cipher|simple)\s+\S+/gi, "$1 <redacted>")
    .slice(0, 12_000);
}

function parseRoutePolicyNodes(text) {
  const nodes = [];
  let current = null;
  for (const line of text.split(/\r?\n/)) {
    const header = line.match(/^route-policy\s+(\S+)\s+(permit|deny)\s+node\s+(\d+)/i);
    if (header) {
      current = { name: header[1], action: header[2], sequence: Number(header[3]), matches: [], applies: [] };
      nodes.push(current);
      continue;
    }
    if (!current) continue;
    if (/^\s*if-match\s+/i.test(line)) current.matches.push(line.trim());
    if (/^\s*apply\s+/i.test(line)) current.applies.push(line.trim());
  }
  return nodes;
}

function parseCommunityFilters(text) {
  return text.split(/\r?\n/)
    .map((line) => line.match(/^ip\s+community-filter\s+(\S+)\s+index\s+(\d+)\s+(permit|deny)\s+(.+)$/i))
    .filter(Boolean)
    .map((match) => ({ name: match[1], index: Number(match[2]), action: match[3], value: match[4] }));
}

function parseL2vpn(text) {
  const l2vcs = [];
  const vsis = [];
  let currentInterface = null;
  for (const line of text.split(/\r?\n/)) {
    const iface = line.match(/^interface\s+(\S+)/i);
    if (iface) currentInterface = iface[1];
    const l2vc = line.match(/\bmpls\s+l2vc\s+(\S+)\s+(\d+)/i);
    if (l2vc) l2vcs.push({ interface: currentInterface, remotePeer: l2vc[1], serviceId: l2vc[2] });
    const vsi = line.match(/^vsi\s+(\S+)/i);
    if (vsi) vsis.push({ name: vsi[1] });
  }
  return { l2vcs, vsis };
}

assert.equal(status({ ssh: true, snmp: true, cache: false }), "full");
assert.equal(status({ ssh: false, snmp: true, cache: true }), "fallback");
assert.equal(status({ ssh: true, snmp: false, cache: false }), "partial");
assert.equal(status({ ssh: false, snmp: false, cache: true }), "cached");
assert.equal(status({ ssh: false, snmp: false, cache: false }), "failed");

assert.equal(primaryDirection("customer"), "import");
assert.equal(primaryDirection("provider"), "export");
assert.equal(primaryDirection("cdn"), "export");
assert.equal(primaryDirection("ix"), "export");
assert.equal(primaryDirection("ibgp"), "internal");

assert.deepEqual(routeProtection({ receivedRoutes: 5001, advertisedRoutes: 10 }), {
  largeReceivedRoutes: true,
  largeAdvertisedRoutes: false,
  autoLoadRoutes: false,
  requiresExplicitRouteSearch: true,
});

const serialized = JSON.stringify({
  source: "ssh_live",
  confidence: "high",
  evidence: "display bgp peer 192.0.2.1",
});
assert.equal(serialized.includes("display current-configuration"), false);

const persisted = {
  run: { id: 1, status: "full", summaryJson: { bgpPeers: 1 } },
  snapshot: { id: 1, snapshotJson: { bgpPeers: [{ peerIp: "192.0.2.1", role: "customer", primaryDirection: "import" }] } },
  evidence: { sanitizedOutput: sanitize("snmp-server community public123\npassword: abc123") },
};
assert.equal(persisted.run.summaryJson.bgpPeers, 1);
assert.equal(persisted.snapshot.snapshotJson.bgpPeers[0].primaryDirection, "import");
assert.equal(persisted.evidence.sanitizedOutput.includes("public123"), false);
assert.equal(persisted.evidence.sanitizedOutput.includes("abc123"), false);

const routePolicyNodes = parseRoutePolicyNodes(`
route-policy CUSTOMER-IN permit node 10
 if-match ip-prefix CUSTOMER-PFX
 if-match community-filter CUST-COMM
 apply local-preference 200
`);
assert.equal(routePolicyNodes[0].name, "CUSTOMER-IN");
assert.equal(routePolicyNodes[0].sequence, 10);
assert.equal(routePolicyNodes[0].matches.includes("if-match ip-prefix CUSTOMER-PFX"), true);

const communityFilters = parseCommunityFilters("ip community-filter CUST-COMM index 10 permit 65000:123");
assert.deepEqual(communityFilters[0], { name: "CUST-COMM", index: 10, action: "permit", value: "65000:123" });

const l2vpn = parseL2vpn(`
interface Eth-Trunk10.300
 mpls l2vc 198.51.100.1 300
vsi CORP-VSI
`);
assert.equal(l2vpn.l2vcs[0].interface, "Eth-Trunk10.300");
assert.equal(l2vpn.l2vcs[0].serviceId, "300");
assert.equal(l2vpn.vsis[0].name, "CORP-VSI");

console.log("device-discovery selftest passed");
