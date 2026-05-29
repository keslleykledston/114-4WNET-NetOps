#!/usr/bin/env node

import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");
const fixturesDir = path.join(repoRoot, "workspace/artifacts/api-server/src/modules/netops/huawei-vrp/parsers/__fixtures__");

const {
  parseHuaweiCommunityFilterDisplay,
  parseRunningConfigCommunities,
} = await import(path.join(repoRoot, "workspace/artifacts/api-server/src/modules/netops/huawei-vrp/parsers/community-parser.ts"));
const {
  parseHuaweiPolicyDependencyPipeline,
} = await import(path.join(repoRoot, "workspace/artifacts/api-server/src/modules/netops/huawei-vrp/parsers/policy-dependency-pipeline.ts"));

const {
  runBgpChecks,
} = await import(path.join(repoRoot, "workspace/artifacts/api-server/src/modules/compliance/checks/bgp-checks.ts"));

const {
  verifyCommunityFilterByName,
} = await import(path.join(repoRoot, "workspace/artifacts/api-server/src/modules/netops/device-discovery/services/community-discovery.service.ts"));

function buildSnapshot({ communities = [], policies = [], prefixLists = [], bgpPeers = [], parsed_config = undefined } = {}) {
  return {
    bgpPeers,
    communities,
    communityLists: [],
    policies,
    prefixLists,
    sourcesUsed: ["ssh_running_config"],
    parsed_config,
  };
}

function buildPolicySnapshot(policyName, communityName, extras = {}) {
  return buildSnapshot({
    ...extras,
    policies: [
      {
        name: policyName,
        nodes: [
          {
            sequence: 2013,
            action: "permit",
            matches: [
              ...(extras.includeIpPrefix ? ["if-match ip-prefix CDN-NETFLIX"] : []),
              `if-match community-filter ${communityName}`,
            ],
            matchDetails: [
              ...(extras.includeIpPrefix ? [{
                type: "ip-prefix",
                name: "CDN-NETFLIX",
                raw: "if-match ip-prefix CDN-NETFLIX",
              }] : []),
              {
                type: "community-filter",
                name: communityName,
                raw: `if-match community-filter ${communityName}`,
              },
            ],
            applies: ["apply as-path 268707 268707 additive"],
            evidence: {
              source: "ssh_running_config",
              confidence: "high",
              evidence: `route-policy ${policyName}`,
            },
          },
        ],
        source: "ssh_running_config",
        confidence: "high",
        evidence: `route-policy ${policyName}`,
      },
    ],
  });
}

function buildContext(snapshot, overrides = {}) {
  return {
    device: {
      id: 1,
      hostname: "device-1",
      vendor: "Huawei",
      username: "readonly",
      passwordEncrypted: "encrypted",
      ...overrides.device,
    },
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

function hasFinding(findings, predicate) {
  return findings.some(predicate);
}

const displayText = `Named Community basic filter: C16-EXPORT-P1 (ListID = 283)
         permit 64777:51601
`;

const parsedDisplay = parseHuaweiCommunityFilterDisplay(displayText, "C16-EXPORT-P1");
assert.equal(parsedDisplay.exists, true, "display parse should detect an existing filter");
assert.equal(parsedDisplay.name, "C16-EXPORT-P1");
assert.equal(parsedDisplay.listId, 283);
assert.equal(parsedDisplay.entries[0].value, "64777:51601");
assert.equal(parsedDisplay.entries[0].action, "permit");
assert.equal(parsedDisplay.entries[0].value, "64777:51601", "technical BGP community must remain intact");

const positiveSnapshot = buildPolicySnapshot("MALHA-RX-Import-V6-CDN", "C16-EXPORT-P1", {
  communities: [{ name: "C16-EXPORT-P1", entries: [{ action: "permit", value: "64777:51601", index: null }], source: "ssh_running_config", confidence: "high" }],
});
const positiveFindings = await runBgpChecks(buildContext(positiveSnapshot), { allowLiveProof: false });
assert.ok(!hasFinding(positiveFindings, (finding) => finding.status === "fail" && /community-filter/i.test(finding.message)), "verified community-filter should not produce a fail");
assert.ok(!hasFinding(positiveFindings, (finding) => /Não foi possível comprovar community-filters no snapshot/i.test(finding.message)), "verified community-filter should not produce snapshot-missing warning");
assert.ok(!hasFinding(positiveFindings, (finding) => /referencia community ausente: C16-EXPORT-P1/i.test(finding.message)), "verified community-filter should not produce absent reference finding");
assert.ok(hasFinding(positiveFindings, (finding) => finding.policyKey === "huawei-policy-dependency-evidence" && /community-filter C16-EXPORT-P1 encontrado no snapshot/.test(JSON.stringify(finding.evidence))), "FOUND dependency should produce evidence");

const negativeSnapshot = buildPolicySnapshot("MALHA-RX-Import-V6-CDN", "C16-EXPORT-P1", {
  communities: [{ name: "OTHER-CF", entries: [], source: "ssh_running_config", confidence: "high" }],
});
const negativeFindings = await runBgpChecks(buildContext(negativeSnapshot), { allowLiveProof: false });
assert.ok(hasFinding(negativeFindings, (finding) => finding.status === "fail" && /community-filter C16-EXPORT-P1, mas ele não foi encontrado no snapshot/i.test(finding.message)), "loaded catalog absent dependency should fail");

const errorFindings = await runBgpChecks(buildContext(buildPolicySnapshot("MALHA-RX-Import-V6-CDN", "C16-EXPORT-P1")), { allowLiveProof: false });
assert.ok(hasFinding(errorFindings, (finding) => finding.status === "unknown" && /Catálogo community-filter indisponível/.test(finding.message)), "unknown catalog should produce UNKNOWN");
assert.ok(!hasFinding(errorFindings, (finding) => finding.status === "fail" && /C16-EXPORT-P1/i.test(finding.message)), "verifier error must not fail");

let commandInvoked = false;
const invalidNameResult = await verifyCommunityFilterByName(
  {
    id: 1,
    hostname: "device-1",
    vendor: "Huawei",
    ipAddress: "127.0.0.1",
    sshPort: 22,
    username: "readonly",
    passwordEncrypted: "encrypted",
  },
  "bad name; display current-configuration",
  {
    password: "unused",
    executor: async () => {
      commandInvoked = true;
      return [];
    },
  },
);
assert.equal(commandInvoked, false, "invalid community-filter name must not execute SSH");
assert.equal(invalidNameResult.exists, null);
assert.equal(invalidNameResult.source, "unknown");

const sanitized = JSON.stringify(parsedDisplay);
assert.ok(sanitized.includes("64777:51601"), "technical community should remain visible in evidence");
assert.ok(!sanitized.includes("Admin123!ChangeMe"), "selftest evidence leaked admin password");

const vrpFixture = await import("node:fs").then(({ readFileSync }) => readFileSync(path.join(fixturesDir, "route-policy-community-filter-dependencies.txt"), "utf8"));
const parsedFixture = parseRunningConfigCommunities(vrpFixture);
const fixtureFilter = parsedFixture.communityFilters.find((item) => item.name === "GLOBAL-EXPORT-UPSTREAM-P3");
assert.ok(fixtureFilter, "fixture community-filter should parse");
assert.equal(fixtureFilter.type, "basic");
assert.equal(fixtureFilter.index, null);
assert.equal(fixtureFilter.action, "permit");
assert.equal(fixtureFilter.value, "64777:99903");
assert.equal(parsedFixture.routePolicyIfMatch[0].routePolicy, "C15-EXPORT");
assert.equal(parsedFixture.routePolicyIfMatch[0].node, "2013");
assert.equal(parsedFixture.routePolicyIfMatch[0].filterName, "GLOBAL-EXPORT-UPSTREAM-P3");

const foundDependencySnapshot = buildPolicySnapshot("C15-EXPORT", "GLOBAL-EXPORT-UPSTREAM-P3", {
  includeIpPrefix: true,
  prefixLists: [{ name: "CDN-NETFLIX", entries: [], source: "ssh_running_config", confidence: "high" }],
  communities: [{ name: "GLOBAL-EXPORT-UPSTREAM-P3", entries: [{ index: null, action: "permit", value: "64777:99903" }], source: "ssh_running_config", confidence: "high" }],
});
const foundDependencyFindings = await runBgpChecks(buildContext(foundDependencySnapshot), { allowLiveProof: false });
assert.ok(!hasFinding(foundDependencyFindings, (finding) => /community-filter .*não foi encontrado|community.*ausente|community-filter inexistente/i.test(finding.message)), "FOUND dependency should not generate missing community-filter finding");
const structuredPass = foundDependencyFindings.find((finding) => finding.policyKey === "huawei-policy-dependency-evidence");
assert.ok(JSON.stringify(structuredPass?.evidence ?? {}).includes("community-filter GLOBAL-EXPORT-UPSTREAM-P3 encontrado no snapshot"), "FOUND dependency evidence should be recorded");

const missingDependencySnapshot = buildPolicySnapshot("C15-EXPORT", "GLOBAL-EXPORT-UPSTREAM-P3", {
  communities: [{ name: "OTHER-CF", entries: [], source: "ssh_running_config", confidence: "high" }],
});
const missingDependencyFindings = await runBgpChecks(buildContext(missingDependencySnapshot), { allowLiveProof: false });
const missingCommunityFindings = missingDependencyFindings.filter((finding) => /GLOBAL-EXPORT-UPSTREAM-P3/.test(finding.message) && /não foi encontrado no snapshot/.test(finding.message));
assert.equal(missingCommunityFindings.length, 1, "missing community-filter dependency should produce one specific finding");
assert.match(missingCommunityFindings[0].message, /Route-policy C15-EXPORT node 2013 referencia community-filter GLOBAL-EXPORT-UPSTREAM-P3/);

const noIndex = parseRunningConfigCommunities("ip community-filter basic FNA-EXPORT-P1 permit 64777:58301");
assert.equal(noIndex.communityFilters[0].name, "FNA-EXPORT-P1");
assert.equal(noIndex.communityFilters[0].index, null);
assert.equal(noIndex.communityFilters[0].action, "permit");
assert.equal(noIndex.communityFilters[0].value, "64777:58301");

const withIndex = parseRunningConfigCommunities("ip community-filter basic FNA-EXPORT-P1 index 10 permit 64777:58301");
assert.equal(withIndex.communityFilters[0].name, "FNA-EXPORT-P1");
assert.equal(withIndex.communityFilters[0].index, 10);
assert.equal(withIndex.communityFilters[0].action, "permit");
assert.equal(withIndex.communityFilters[0].value, "64777:58301");

const pipeline = parseHuaweiPolicyDependencyPipeline(`
ip community-filter basic CF-FOUND permit 65000:1
ip ip-prefix PFX-FOUND index 10 permit 10.0.0.0 8
ip as-path-filter ASP-FOUND permit ^65000$
ip extcommunity-filter basic EXT-FOUND permit rt 65000:1
acl name ACL-FOUND
route-policy PIPE permit node 10
 if-match community-filter CF-FOUND
 if-match ip-prefix PFX-FOUND
 if-match as-path-filter ASP-FOUND
 if-match extcommunity-filter EXT-FOUND
 if-match acl ACL-FOUND
`, "ssh_running_config");
assert.equal(pipeline.catalog_status.community_filters, "loaded");
assert.equal(pipeline.catalog_status.ip_prefixes, "loaded");
assert.equal(pipeline.catalog_status.as_path_filters, "loaded");
assert.equal(pipeline.catalog_status.extcommunity_filters, "loaded");
assert.equal(pipeline.catalog_status.acls, "loaded");
assert.equal(pipeline.catalog_status.route_policies, "loaded");
assert.equal(pipeline.dependency_graph.route_policy_dependencies.every((dep) => dep.status === "FOUND"), true);

console.log("compliance community-filter reference selftest passed");
