#!/usr/bin/env node

import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const {
  parseHuaweiPolicyDependencyPipeline,
  buildPolicyDependencyConfigFromSnapshot,
} = await import(path.join(rootDir, "workspace/artifacts/api-server/src/modules/netops/huawei-vrp/parsers/policy-dependency-pipeline.ts"));
const {
  runBgpChecks,
} = await import(path.join(rootDir, "workspace/artifacts/api-server/src/modules/compliance/checks/bgp-checks.ts"));

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
  const prefixLists = Object.values(parsed_config.catalogs.ip_prefixes).map((item) => ({ name: item.name, entries: item.entries, source: "ssh_running_config", confidence: "high" }));
  const asPathFilters = Object.values(parsed_config.catalogs.as_path_filters).map((item) => ({ name: item.name, entries: item.entries, source: "ssh_running_config", confidence: "high" }));
  const extcommunityFilters = Object.values(parsed_config.catalogs.extcommunity_filters).map((item) => ({ name: item.name, entries: item.entries, source: "ssh_running_config", confidence: "high" }));
  const aclFilters = Object.values(parsed_config.catalogs.acls).map((item) => ({ name: item.name, entries: item.entries, source: "ssh_running_config", confidence: "high" }));
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
    communities: Object.values(parsed_config.catalogs.community_filters).map((item) => ({ name: item.name, entries: item.entries, source: "ssh_running_config", confidence: "high" })),
    communityLists: [],
    prefixLists,
    asPathFilters,
    extcommunityFilters,
    aclFilters,
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

function hasEvidence(findings, pattern, status) {
  return findings.some((finding) => (!status || finding.status === status) && pattern.test(JSON.stringify(finding.evidence ?? {})));
}

const raw = `
ip community-filter basic CF-FOUND permit 65000:1
ip ip-prefix PFX-FOUND index 10 permit 10.0.0.0 8
ip as-path-filter ASP-FOUND permit ^65000$
ip extcommunity-filter basic EXT-FOUND permit rt 65000:1
acl name ACL-FOUND
route-policy RP-FOUND permit node 10
 if-match community-filter CF-FOUND
 if-match ip-prefix PFX-FOUND
 if-match as-path-filter ASP-FOUND
 if-match extcommunity-filter EXT-FOUND
 if-match acl ACL-FOUND
`;

const pipeline = parseHuaweiPolicyDependencyPipeline(raw, "ssh_running_config");
assert.equal(Object.keys(pipeline.catalogs.community_filters)[0], "CF-FOUND", "community-filter catalog must load before dependencies resolve");
assert.equal(Object.keys(pipeline.catalogs.ip_prefixes)[0], "PFX-FOUND", "ip-prefix catalog must load before dependencies resolve");
assert.equal(Object.keys(pipeline.catalogs.as_path_filters)[0], "ASP-FOUND", "as-path-filter catalog must load before dependencies resolve");
assert.equal(pipeline.catalog_status.community_filters, "loaded");
assert.equal(pipeline.catalog_status.ip_prefixes, "loaded");
assert.equal(pipeline.catalog_status.as_path_filters, "loaded");
assert.equal(pipeline.dependency_graph.route_policy_dependencies.filter((dep) => dep.status === "FOUND").length, 5);

const foundFindings = await runBgpChecks(buildContext(baseSnapshot(raw)));
assert.ok(hasEvidence(foundFindings, /community-filter CF-FOUND encontrado no snapshot/, "pass"), "community-filter FOUND evidence missing");
assert.ok(hasEvidence(foundFindings, /ip-prefix PFX-FOUND encontrado no snapshot/, "pass"), "ip-prefix FOUND evidence missing");
assert.ok(!hasFinding(foundFindings, /não foi encontrado no snapshot/, "fail"), "FOUND dependency generated MISSING");

const missingCommunityRaw = `
ip community-filter basic OTHER-CF permit 65000:2
route-policy RP-MISSING-CF permit node 20
 if-match community-filter CF-MISSING
`;
const missingCommunityFindings = await runBgpChecks(buildContext(baseSnapshot(missingCommunityRaw)));
assert.ok(hasFinding(missingCommunityFindings, /Route-policy RP-MISSING-CF node 20 referencia community-filter CF-MISSING, mas ele não foi encontrado no snapshot/, "fail"));

const unknownCommunityRaw = `
route-policy RP-UNKNOWN-CF permit node 30
 if-match community-filter CF-UNKNOWN
`;
const unknownCommunityFindings = await runBgpChecks(buildContext(baseSnapshot(unknownCommunityRaw)));
assert.ok(hasFinding(unknownCommunityFindings, /Catálogo community-filter indisponível.*status=empty/, "unknown"));
assert.ok(!hasFinding(unknownCommunityFindings, /CF-UNKNOWN.*não foi encontrado/, "fail"));

const missingPrefixRaw = `
ip ip-prefix OTHER-PFX index 10 permit 192.0.2.0 24
route-policy RP-MISSING-PFX permit node 40
 if-match ip-prefix PFX-MISSING
`;
const missingPrefixFindings = await runBgpChecks(buildContext(baseSnapshot(missingPrefixRaw)));
assert.ok(hasFinding(missingPrefixFindings, /Route-policy RP-MISSING-PFX node 40 referencia ip-prefix PFX-MISSING, mas ele não foi encontrado no snapshot/, "fail"));

const peerFoundSnapshot = baseSnapshot(`
route-policy RP-EXPORT permit node 10
 apply community 65000:1
`, {
  bgpPeers: [{ peerIp: "192.0.2.1", remoteAs: 65000, description: "peer-a", name: "peer-a", state: "Established", category: "customer", role: "customer", source: "ssh_running_config", confidence: "high", importPolicy: null, exportPolicy: "RP-EXPORT" }],
});
const peerFoundConfig = buildPolicyDependencyConfigFromSnapshot(peerFoundSnapshot);
assert.equal(peerFoundConfig.dependency_graph.bgp_policy_bindings[0].status, "FOUND");
const peerFoundFindings = await runBgpChecks(buildContext(peerFoundSnapshot));
assert.ok(hasEvidence(peerFoundFindings, /BGP consumer peer-a export route-policy RP-EXPORT encontrado no snapshot/, "pass"));

const peerMissingSnapshot = baseSnapshot(`
route-policy RP-OTHER permit node 10
 apply community 65000:1
`, {
  bgpPeers: [{ peerIp: "192.0.2.2", remoteAs: 65000, description: "peer-b", name: "peer-b", state: "Established", category: "customer", role: "customer", source: "ssh_running_config", confidence: "high", importPolicy: "RP-MISSING", exportPolicy: null }],
});
const peerMissingFindings = await runBgpChecks(buildContext(peerMissingSnapshot));
assert.ok(hasFinding(peerMissingFindings, /BGP consumer peer-b referencia route-policy RP-MISSING import, mas ela não foi encontrada no snapshot/, "fail"));

console.log("policy dependency catalog pipeline selftest passed");
