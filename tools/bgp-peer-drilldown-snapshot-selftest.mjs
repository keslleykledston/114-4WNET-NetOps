#!/usr/bin/env node

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const fixtureDir = path.join(rootDir, "workspace/artifacts/api-server/src/modules/netops/huawei-vrp/parsers/__fixtures__");

const { parseHuaweiPolicyDependencyPipeline } = await import(path.join(
  rootDir,
  "workspace/artifacts/api-server/src/modules/netops/huawei-vrp/parsers/policy-dependency-pipeline.ts",
));
const { buildBgpPeerDrilldownResult } = await import(path.join(
  rootDir,
  "workspace/artifacts/api-server/src/modules/bgp-drilldown/bgp-peer-drilldown.builder.ts",
));

function baseSnapshot(raw, overrides = {}) {
  const parsed_config = parseHuaweiPolicyDependencyPipeline(raw, "ssh_running_config");
  return {
    deviceId: 1,
    discoveryRunId: "selftest",
    status: "full",
    contexts: ["bgp", "policies"],
    startedAt: new Date(0).toISOString(),
    finishedAt: new Date(0).toISOString(),
    sourceStatus: { ssh: "success", snmp: "skipped", cachedConfig: "skipped" },
    sourcesUsed: ["ssh_running_config"],
    interfaces: [],
    bgpPeers: [],
    policies: [],
    communities: [],
    communityLists: [],
    prefixLists: [],
    ipv6PrefixLists: [],
    asPathFilters: [],
    extcommunityFilters: [],
    aclFilters: [],
    parsed_config,
    vrfs: [],
    l2vpn: { l2vcs: [], vsis: [], source: "ssh_running_config", confidence: "high" },
    warnings: [],
    audit: [],
    ...overrides,
  };
}

function drill(peer, raw, query = {}) {
  return buildBgpPeerDrilldownResult({
    deviceId: 1,
    peer,
    snapshot: baseSnapshot(raw),
    rawConfig: raw,
    collectedAt: new Date("2026-05-25T12:00:00.000Z"),
    snapshotId: 99,
    query,
  });
}

const fullConfig = readFileSync(path.join(fixtureDir, "bgp-peer-drilldown-snapshot.txt"), "utf8");

// A — IPv4 peer 172.28.1.138
const a = drill("172.28.1.138", fullConfig);
assert.equal(a.configBuildSource, "raw_config");
assert.equal(a.root.asNumber, 262663);
assert.equal(a.root.description, "WIFIZAO.BRT");
assert.equal(a.root.status, "FOUND");
const famA = a.families.find((f) => f.afiSafi === "ipv4_unicast");
assert.ok(famA?.enabled);
assert.equal(famA.importPolicy, "AS262663-WIFIZAO.BRT-Import-IPv4");
assert.equal(famA.exportPolicy, "AS262663-WIFIZAO.BRT-Export-IPv4");
assert.equal(famA.defaultRouteAdvertise, true);
assert.ok(a.dependencies.some((d) => d.dependencyType === "ip-prefix" && d.status === "FOUND"));
assert.equal(
  a.effectivePolicies.find((p) => p.direction === "import" && p.afiSafi === "ipv4_unicast")?.status,
  "FOUND",
);

// B — IPv6 peer
const b = drill("2804:5984:B000:1::D6", fullConfig);
const famB = b.families.find((f) => f.afiSafi === "ipv6_unicast");
assert.ok(famB?.enabled);
assert.equal(famB.importPolicy, "AS266208-ALLFIBER-Import-ipv6");
assert.equal(famB.exportPolicy, "AS266208-ALLFIBER-Export-ipv6");
assert.equal(famB.defaultRouteAdvertise, true);

// C — peer-group inheritance on member
const c = drill("2001:12F8:0:21::253", fullConfig);
const famC = c.families.find((f) => f.afiSafi === "ipv6_unicast");
assert.equal(famC?.effectiveImportPolicy, "C07-IMPORT-IPV6");
assert.equal(famC?.inheritedFromGroup, true);
assert.equal(famC?.inheritedGroup, "IX-AM");
assert.equal(famC?.effectiveNextHopLocal, true);
const effC = c.effectivePolicies.find((p) => p.direction === "import");
assert.equal(effC?.source, "peer_group");
assert.equal(effC?.status, "FOUND");

// C2 — peer-group IX-AM direct
const c2 = drill("IX-AM", fullConfig);
assert.ok(c2.families.some((f) => f.importPolicy === "C07-IMPORT-IPV6"));

// D — missing policy when catalog loaded
const missingRaw = `
bgp 65000
 peer 10.0.0.1 as-number 65001
 ipv4-family unicast
  peer 10.0.0.1 enable
  peer 10.0.0.1 route-policy MISSING-POLICY import
route-policy OTHER permit node 10
`;
const d = drill("10.0.0.1", missingRaw);
assert.equal(
  d.effectivePolicies.find((p) => p.direction === "import")?.status,
  "MISSING",
);

// E — catalog unavailable (no route-policy objects in config)
const unknownRaw = `
bgp 65000
 ipv4-family unicast
  peer 10.0.0.2 enable
  peer 10.0.0.2 route-policy ANY-POLICY import
`;
const e = drill("10.0.0.2", unknownRaw);
assert.equal(
  e.effectivePolicies.find((p) => p.direction === "import")?.status,
  "UNKNOWN",
);

// include_policies=false
const noPol = drill("172.28.1.138", fullConfig, { includePolicies: false });
assert.equal(noPol.policies.length, 0);

console.log(JSON.stringify({ ok: true, cases: ["A", "B", "C", "C2", "D", "E"] }, null, 2));
console.log("bgp-peer-drilldown-snapshot-selftest: PASS");
