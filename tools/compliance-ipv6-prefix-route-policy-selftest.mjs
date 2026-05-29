#!/usr/bin/env node

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const fixturePath = path.join(
  rootDir,
  "workspace/artifacts/api-server/src/modules/netops/huawei-vrp/parsers/__fixtures__/route-policy-ipv6-prefix-dependencies.txt",
);

const {
  parseHuaweiPolicyDependencyPipeline,
} = await import(path.join(rootDir, "workspace/artifacts/api-server/src/modules/netops/huawei-vrp/parsers/policy-dependency-pipeline.ts"));
const { runBgpChecks } = await import(path.join(rootDir, "workspace/artifacts/api-server/src/modules/compliance/checks/bgp-checks.ts"));

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
  const policies = Object.values(parsed_config.consumers.route_policies).map((policy) => ({
    name: policy.name,
    nodes: policy.nodes.map((node) => ({
      sequence: node.sequence,
      action: node.action,
      matches: node.matches,
      matchDetails: parsed_config.dependency_graph.route_policy_dependencies
        .filter((dep) => dep.routePolicy === policy.name && dep.node === node.sequence)
        .map((dep) => ({ type: dep.dependencyType, name: dep.dependencyName, raw: dep.raw })),
      applies: node.applies,
      evidence: { source: "ssh_running_config", confidence: "high", evidence: `route-policy ${policy.name}` },
    })),
    source: "ssh_running_config",
    confidence: "high",
    evidence: `route-policy ${policy.name}`,
  }));
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
    policies,
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
  return findings.some((finding) => (!status || finding.status === status) && pattern.test(finding.message));
}

function dep(pipeline, policy, node, name) {
  return pipeline.dependency_graph.route_policy_dependencies.find(
    (item) => item.routePolicy === policy && item.node === node && item.dependencyName === name,
  );
}

const fixtureRaw = readFileSync(fixturePath, "utf8");
const pipeline = parseHuaweiPolicyDependencyPipeline(fixtureRaw, "ssh_running_config");

assert.equal(pipeline.catalog_status.ipv6_prefixes, "loaded", "ipv6_prefixes catalog must be loaded");
assert.ok(pipeline.catalogs.ipv6_prefixes["GATEWAY-IPV6"], "GATEWAY-IPV6 catalog entry");
assert.ok(pipeline.catalogs.ipv6_prefixes["AS266208-4WNET-V6-332"], "AS266208-4WNET-V6-332 catalog entry");

// Caso A — MALHA-MNS-Export-IPv6 node 10 / AS266208-4WNET-V6-332
const depA = dep(pipeline, "MALHA-MNS-Export-IPv6", 10, "AS266208-4WNET-V6-332");
assert.equal(depA?.dependencyType, "ipv6-prefix");
assert.equal(depA?.status, "FOUND");

// Caso B — C17-IMPORT-IPV6 node 3011 / GATEWAY-IPV6
const depB = dep(pipeline, "C17-IMPORT-IPV6", 3011, "GATEWAY-IPV6");
assert.equal(depB?.dependencyType, "ipv6-prefix");
assert.equal(depB?.status, "FOUND");
assert.match(depB?.evidence ?? "", /ipv6-prefix GATEWAY-IPV6 encontrado/);

// Caso C — IPv4 ip-prefix intact
const depC = dep(pipeline, "MALHA-MNS-Export-IPv6", 10, "AS268707-4WNET");
assert.equal(depC?.dependencyType, "ip-prefix");
assert.equal(depC?.status, "FOUND");

const findingsFixture = await runBgpChecks(buildContext(baseSnapshot(fixtureRaw)));
assert.ok(!hasFinding(findingsFixture, /referencia ip-prefix GATEWAY-IPV6.*não foi encontrado/, "fail"));
assert.ok(!hasFinding(findingsFixture, /referencia ip-prefix AS266208-4WNET-V6-332.*não foi encontrado/, "fail"));
assert.ok(!hasFinding(findingsFixture, /node 3011 referencia ip-prefix GATEWAY-IPV6/, "fail"));
assert.ok(!hasFinding(findingsFixture, /node 10 referencia ip-prefix AS266208-4WNET-V6-332/, "fail"));

// Caso D — ipv6-prefix missing when catalog loaded
const missingRaw = `
ip ipv6-prefix OTHER-V6 index 10 permit 2001:db8:: 64
route-policy RP-MISSING-V6 permit node 10
 if-match ipv6 address prefix-list V6-NOT-THERE
`;
const missingPipeline = parseHuaweiPolicyDependencyPipeline(missingRaw, "ssh_running_config");
const missingDep = dep(missingPipeline, "RP-MISSING-V6", 10, "V6-NOT-THERE");
assert.equal(missingDep?.dependencyType, "ipv6-prefix");
assert.equal(missingDep?.status, "MISSING");
assert.match(missingDep?.evidence ?? "", /referencia ipv6-prefix V6-NOT-THERE/);
const missingFindings = await runBgpChecks(buildContext(baseSnapshot(missingRaw)));
assert.ok(hasFinding(missingFindings, /referencia ipv6-prefix V6-NOT-THERE.*não foi encontrado/, "fail"));

// Caso E — catalog unavailable (empty) => UNKNOWN not fail
const unknownRaw = `
route-policy RP-UNKNOWN-V6 permit node 10
 if-match ipv6 address prefix-list GATEWAY-IPV6
`;
const unknownPipeline = parseHuaweiPolicyDependencyPipeline(unknownRaw, "ssh_running_config");
const unknownDep = dep(unknownPipeline, "RP-UNKNOWN-V6", 10, "GATEWAY-IPV6");
assert.equal(unknownDep?.dependencyType, "ipv6-prefix");
assert.equal(unknownDep?.status, "UNKNOWN");
assert.match(unknownDep?.evidence ?? "", /Catálogo ipv6-prefix indisponível/);
const unknownFindings = await runBgpChecks(buildContext(baseSnapshot(unknownRaw)));
assert.ok(hasFinding(unknownFindings, /Catálogo ipv6-prefix indisponível/, "unknown"));
assert.ok(!hasFinding(unknownFindings, /GATEWAY-IPV6.*não foi encontrado/, "fail"));

console.log(JSON.stringify({ ok: true, cases: ["A", "B", "C", "D", "E"] }, null, 2));
console.log("compliance-ipv6-prefix-route-policy-selftest: PASS");
