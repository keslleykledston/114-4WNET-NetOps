#!/usr/bin/env node

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const fixturePath = path.join(
  rootDir,
  "workspace/artifacts/api-server/src/modules/netops/huawei-vrp/parsers/__fixtures__/route-policy-ipv4-ipv6-prefix-dependencies.txt",
);

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

function assertCatalogSeparation(pipeline) {
  assert.ok(pipeline.catalogs.ip_prefixes["AS268707-4WNET"], "IPv4 catalog");
  assert.ok(pipeline.catalogs.ipv6_prefixes["AS266208-4WNET-V6-332"], "IPv6 catalog");
  assert.equal(pipeline.catalogs.ip_prefixes["AS266208-4WNET-V6-332"], undefined, "IPv6 name must not appear in ip_prefixes");
  assert.equal(pipeline.catalogs.ipv6_prefixes["AS268707-4WNET"], undefined, "IPv4 name must not appear in ipv6_prefixes");
}

const fixtureRaw = readFileSync(fixturePath, "utf8");
const pipeline = parseHuaweiPolicyDependencyPipeline(fixtureRaw, "ssh_running_config");
assertCatalogSeparation(pipeline);
assert.equal(pipeline.catalog_status.ip_prefixes, "loaded");
assert.equal(pipeline.catalog_status.ipv6_prefixes, "loaded");

// A — IPv4 FOUND
const depA = dep(pipeline, "TEST-EXPORT-V4", 10, "AS268707-4WNET");
assert.equal(depA?.dependencyType, "ip-prefix");
assert.equal(depA?.status, "FOUND");
assert.match(depA?.evidence ?? "", /ip-prefix AS268707-4WNET encontrado/);

// B — IPv4 DEFAULT FOUND
const depB = dep(pipeline, "TEST-DEFAULT-V4", 10, "DEFAULT");
assert.equal(depB?.dependencyType, "ip-prefix");
assert.equal(depB?.status, "FOUND");

// C — IPv4 GATEWAY FOUND
const depC = dep(pipeline, "TEST-GW-V4", 10, "GATEWAY-IPV4");
assert.equal(depC?.dependencyType, "ip-prefix");
assert.equal(depC?.status, "FOUND");

// D — IPv6 FOUND
const depD = dep(pipeline, "TEST-EXPORT-V6", 10, "AS266208-4WNET-V6-332");
assert.equal(depD?.dependencyType, "ipv6-prefix");
assert.equal(depD?.status, "FOUND");
assert.match(depD?.evidence ?? "", /ipv6-prefix AS266208-4WNET-V6-332 encontrado/);

// E — IPv6 GW FOUND (extra)
const depGwV6 = dep(pipeline, "TEST-GW-V6", 10, "GATEWAY-IPV6");
assert.equal(depGwV6?.dependencyType, "ipv6-prefix");
assert.equal(depGwV6?.status, "FOUND");

const fixtureFindings = await runBgpChecks(buildContext(baseSnapshot(fixtureRaw)));
assert.ok(!hasFinding(fixtureFindings, /referencia ip-prefix (AS268707-4WNET|DEFAULT|GATEWAY-IPV4).*não foi encontrado/, "fail"));
assert.ok(!hasFinding(fixtureFindings, /referencia ip-prefix (AS266208-4WNET-V6-332|GATEWAY-IPV6).*não foi encontrado/, "fail"));
assert.ok(!hasFinding(fixtureFindings, /referencia ipv6-prefix.*não foi encontrado/, "fail"));

// E — IPv4 MISSING
const missingV4Raw = `
ip ip-prefix OTHER-V4 index 10 permit 10.0.0.0 8
route-policy RP-MISSING-V4 permit node 10
 if-match ip-prefix MISSING-V4
`;
const missingV4Pipeline = parseHuaweiPolicyDependencyPipeline(missingV4Raw, "ssh_running_config");
const depMissingV4 = dep(missingV4Pipeline, "RP-MISSING-V4", 10, "MISSING-V4");
assert.equal(depMissingV4?.dependencyType, "ip-prefix");
assert.equal(depMissingV4?.status, "MISSING");
assert.match(depMissingV4?.evidence ?? "", /referencia ip-prefix MISSING-V4/);
const missingV4Findings = await runBgpChecks(buildContext(baseSnapshot(missingV4Raw)));
assert.ok(hasFinding(missingV4Findings, /referencia ip-prefix MISSING-V4.*não foi encontrado/, "fail"));

// F — IPv6 MISSING
const missingV6Raw = `
ip ipv6-prefix OTHER-V6 index 10 permit 2001:db8:: 64
route-policy RP-MISSING-V6 permit node 10
 if-match ipv6 address prefix-list MISSING-V6
`;
const missingV6Pipeline = parseHuaweiPolicyDependencyPipeline(missingV6Raw, "ssh_running_config");
const depMissingV6 = dep(missingV6Pipeline, "RP-MISSING-V6", 10, "MISSING-V6");
assert.equal(depMissingV6?.dependencyType, "ipv6-prefix");
assert.equal(depMissingV6?.status, "MISSING");
assert.match(depMissingV6?.evidence ?? "", /referencia ipv6-prefix MISSING-V6/);
assert.ok(!/referencia ip-prefix MISSING-V6/.test(depMissingV6?.evidence ?? ""));
const missingV6Findings = await runBgpChecks(buildContext(baseSnapshot(missingV6Raw)));
assert.ok(hasFinding(missingV6Findings, /referencia ipv6-prefix MISSING-V6.*não foi encontrado/, "fail"));

// G — IPv4 catalog unavailable
const unknownV4Raw = `
route-policy RP-UNKNOWN-V4 permit node 10
 if-match ip-prefix AS268707-4WNET
`;
const unknownV4Pipeline = parseHuaweiPolicyDependencyPipeline(unknownV4Raw, "ssh_running_config");
const depUnknownV4 = dep(unknownV4Pipeline, "RP-UNKNOWN-V4", 10, "AS268707-4WNET");
assert.equal(depUnknownV4?.dependencyType, "ip-prefix");
assert.equal(depUnknownV4?.status, "UNKNOWN");
assert.match(depUnknownV4?.evidence ?? "", /Catálogo ip-prefix indisponível/);
const unknownV4Findings = await runBgpChecks(buildContext(baseSnapshot(unknownV4Raw)));
assert.ok(hasFinding(unknownV4Findings, /Catálogo ip-prefix indisponível/, "unknown"));
assert.ok(!hasFinding(unknownV4Findings, /AS268707-4WNET.*não foi encontrado/, "fail"));

// H — IPv6 catalog unavailable
const unknownV6Raw = `
route-policy RP-UNKNOWN-V6 permit node 10
 if-match ipv6 address prefix-list GATEWAY-IPV6
`;
const unknownV6Pipeline = parseHuaweiPolicyDependencyPipeline(unknownV6Raw, "ssh_running_config");
const depUnknownV6 = dep(unknownV6Pipeline, "RP-UNKNOWN-V6", 10, "GATEWAY-IPV6");
assert.equal(depUnknownV6?.dependencyType, "ipv6-prefix");
assert.equal(depUnknownV6?.status, "UNKNOWN");
assert.match(depUnknownV6?.evidence ?? "", /Catálogo ipv6-prefix indisponível/);
const unknownV6Findings = await runBgpChecks(buildContext(baseSnapshot(unknownV6Raw)));
assert.ok(hasFinding(unknownV6Findings, /Catálogo ipv6-prefix indisponível/, "unknown"));
assert.ok(!hasFinding(unknownV6Findings, /GATEWAY-IPV6.*não foi encontrado/, "fail"));

// Regression: ipv6 line must not become ip-prefix
const regressionLine = " if-match ipv6 address prefix-list GATEWAY-IPV6";
const { extractRoutePolicyIfMatchDependencies } = await import(path.join(
  rootDir,
  "workspace/artifacts/api-server/src/modules/netops/huawei-vrp/parsers/policy-utils.ts",
));
const extracted = extractRoutePolicyIfMatchDependencies(regressionLine);
assert.equal(extracted.length, 1);
assert.equal(extracted[0].type, "ipv6-prefix");
assert.equal(extracted[0].name, "GATEWAY-IPV6");

console.log(JSON.stringify({ ok: true, cases: ["A", "B", "C", "D", "E", "F", "G", "H", "regression"] }, null, 2));
console.log("compliance-prefix-route-policy-selftest: PASS");
