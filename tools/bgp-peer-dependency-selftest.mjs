#!/usr/bin/env node

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const fixtureDir = path.join(rootDir, "workspace/artifacts/api-server/src/modules/netops/huawei-vrp/parsers/__fixtures__");

const { parseHuaweiBgpPeerDependencies } = await import(path.join(
  rootDir,
  "workspace/artifacts/api-server/src/modules/netops/huawei-vrp/parsers/bgp-peer-dependency-parser.ts",
));
const { parseHuaweiPolicyDependencyPipeline } = await import(path.join(
  rootDir,
  "workspace/artifacts/api-server/src/modules/netops/huawei-vrp/parsers/policy-dependency-pipeline.ts",
));
const { runBgpChecks } = await import(path.join(
  rootDir,
  "workspace/artifacts/api-server/src/modules/compliance/checks/bgp-checks.ts",
));

function buildContext(snapshot) {
  return {
    device: { id: 1, hostname: "device-1", vendor: "huawei" },
    contexts: ["bgp"],
    snapshotRow: null,
    snapshot,
    collectedConfig: null,
    rawConfig: "",
    source: "ssh_running_config",
    confidence: "high",
    profile: null,
  };
}

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
    policies: Object.values(parsed_config.consumers.route_policies).map((policy) => ({
      name: policy.name,
      nodes: policy.nodes.map((node) => ({
        sequence: node.sequence,
        action: node.action,
        matches: node.matches,
        matchDetails: [],
        applies: node.applies,
        evidence: { source: "ssh_running_config", confidence: "high", evidence: policy.name },
      })),
      source: "ssh_running_config",
      confidence: "high",
      evidence: policy.name,
    })),
    communities: [],
    communityLists: [],
    prefixLists: Object.values(parsed_config.catalogs.ip_prefixes).map((item) => ({
      name: item.name,
      entries: item.entries,
      source: "ssh_running_config",
      confidence: "high",
    })),
    ipv6PrefixLists: Object.values(parsed_config.catalogs.ipv6_prefixes).map((item) => ({
      name: item.name,
      entries: item.entries,
      source: "ssh_running_config",
      confidence: "high",
    })),
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

function hasFinding(findings, pattern, status) {
  return findings.some((f) => (!status || f.status === status) && pattern.test(f.message));
}

function familyOf(model, peer, afiSafi) {
  return model.families.find((f) => f.peerAddressOrName === peer && f.afiSafi === afiSafi);
}

function bindingFor(config, peer, afiSafi, direction, policy) {
  return config.dependency_graph.bgp_policy_bindings.find(
    (b) => b.consumerName === peer && b.afiSafi === afiSafi && b.direction === direction && b.routePolicy === policy,
  );
}

const bgpOnly = readFileSync(path.join(fixtureDir, "bgp-peer-dependencies.txt"), "utf8");

const policiesBlock = `
route-policy AS262663-WIFIZAO.BRT-Import-IPv4 permit node 10
 if-match ip-prefix AS262663-WIFIZAO
route-policy AS262663-WIFIZAO.BRT-Export-IPv4 permit node 10
 apply community 65000:1
route-policy AS266208-ALLFIBER-Import-ipv6 permit node 10
 if-match ipv6 address prefix-list AS266208-ALLFIBER-V6
route-policy AS266208-ALLFIBER-Export-ipv6 permit node 10
 apply community 65000:2
route-policy C07-IMPORT-IPV6 permit node 10
 if-match ipv6 address prefix-list C07-V6
route-policy C07-EXPORT permit node 10
 apply community 65000:3
ip ip-prefix AS262663-WIFIZAO index 10 permit 45.169.160.0 23
ip ipv6-prefix AS266208-ALLFIBER-V6 index 10 permit 2804:5984:: 32
ip ipv6-prefix C07-V6 index 10 permit 2001:db8:: 32
`;

const fullConfig = `${policiesBlock}\n${bgpOnly}`;
const model = parseHuaweiBgpPeerDependencies(bgpOnly, "ssh_running_config");
const pipeline = parseHuaweiPolicyDependencyPipeline(fullConfig, "ssh_running_config");

// A — IPv4 direct peer
const rootA = model.roots["172.28.1.138"];
assert.ok(rootA, "root peer 172.28.1.138");
assert.equal(rootA.asNumber, 262663);
assert.equal(rootA.description, "WIFIZAO.BRT");
const famA = familyOf(model, "172.28.1.138", "ipv4_unicast");
assert.ok(famA?.enabled);
assert.equal(famA.importRoutePolicy, "AS262663-WIFIZAO.BRT-Import-IPv4");
assert.equal(famA.exportRoutePolicy, "AS262663-WIFIZAO.BRT-Export-IPv4");
assert.equal(famA.defaultRouteAdvertise, true);

// B — IPv6 direct
const famB = familyOf(model, "2804:5984:B000:1::D6", "ipv6_unicast");
assert.ok(famB?.enabled);
assert.equal(famB.importRoutePolicy, "AS266208-ALLFIBER-Import-ipv6");
assert.equal(famB.exportRoutePolicy, "AS266208-ALLFIBER-Export-ipv6");
assert.equal(famB.defaultRouteAdvertise, true);

// C — peer-group inheritance
const groupIx = familyOf(model, "IX-AM", "ipv6_unicast");
assert.equal(groupIx?.importRoutePolicy, "C07-IMPORT-IPV6");
const member253 = familyOf(model, "2001:12F8:0:21::253", "ipv6_unicast");
assert.equal(member253?.groupName, "IX-AM");
assert.equal(member253?.effectiveImportRoutePolicy, "C07-IMPORT-IPV6");
assert.equal(member253?.inheritedFromGroup, true);
assert.equal(member253?.inheritedGroup, "IX-AM");
assert.equal(member253?.effectiveNextHopLocal, true);

// D — vpnv4 MALHA
const malha = familyOf(model, "MALHA", "vpnv4");
assert.ok(malha?.enabled);
assert.equal(malha.advertiseCommunity, true);

// E — missing policy
const missingRaw = `
bgp 65000
 ipv4-family unicast
  peer 10.0.0.1 enable
  peer 10.0.0.1 route-policy MISSING-POLICY import
route-policy OTHER permit node 10
`;
const missingPipeline = parseHuaweiPolicyDependencyPipeline(missingRaw, "ssh_running_config");
const missingBinding = bindingFor(missingPipeline, "10.0.0.1", "ipv4_unicast", "import", "MISSING-POLICY");
assert.equal(missingBinding?.status, "MISSING");

// F — catalog unavailable
const unknownRaw = `
bgp 65000
 ipv4-family unicast
  peer 10.0.0.2 enable
  peer 10.0.0.2 route-policy ANY-POLICY import
`;
const unknownModel = parseHuaweiBgpPeerDependencies(unknownRaw, "ssh_running_config");
const unknownPipeline = parseHuaweiPolicyDependencyPipeline(unknownRaw, "ssh_running_config");
const unknownBinding = bindingFor(unknownPipeline, "10.0.0.2", "ipv4_unicast", "import", "ANY-POLICY");
assert.equal(unknownBinding?.status, "UNKNOWN");

// G — peer → policy → ip-prefix graph
const bindImport = bindingFor(pipeline, "172.28.1.138", "ipv4_unicast", "import", "AS262663-WIFIZAO.BRT-Import-IPv4");
assert.equal(bindImport?.status, "FOUND");
const rpDep = pipeline.dependency_graph.route_policy_dependencies.find(
  (d) => d.routePolicy === "AS262663-WIFIZAO.BRT-Import-IPv4" && d.dependencyName === "AS262663-WIFIZAO",
);
assert.equal(rpDep?.dependencyType, "ip-prefix");
assert.equal(rpDep?.status, "FOUND");

const findings = await runBgpChecks(buildContext(baseSnapshot(fullConfig)));
assert.ok(!hasFinding(findings, /172\.28\.1\.138.*route-policy.*não foi encontrado/, "fail"));
assert.ok(!hasFinding(findings, /2001:12F8:0:21::253.*C07-IMPORT-IPV6.*não foi encontrado/, "fail"));

console.log(JSON.stringify({ ok: true, cases: ["A", "B", "C", "D", "E", "F", "G"] }, null, 2));
console.log("bgp-peer-dependency-selftest: PASS");
