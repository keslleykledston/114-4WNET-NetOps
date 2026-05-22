#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");
const fixturePath = path.join(repoRoot, "workspace/artifacts/api-server/src/modules/netops/huawei-vrp/parsers/__fixtures__/community-filter-rejeita-prefix-cdns.txt");

const {
  parseRunningConfigCommunities,
  parseHuaweiCommunities,
} = await import(path.join(repoRoot, "workspace/artifacts/api-server/src/modules/netops/huawei-vrp/parsers/community-parser.ts"));

const {
  parseHuaweiPolicies,
} = await import(path.join(repoRoot, "workspace/artifacts/api-server/src/modules/netops/huawei-vrp/parsers/policy-parser.ts"));

const {
  runBgpChecks,
} = await import(path.join(repoRoot, "workspace/artifacts/api-server/src/modules/compliance/checks/bgp-checks.ts"));

const {
  normalizePolicyLookupKey,
} = await import(path.join(repoRoot, "workspace/artifacts/api-server/src/modules/netops/huawei-vrp/parsers/policy-utils.ts"));

const fixtureText = await fs.readFile(fixturePath, "utf8");

function buildSnapshot(text) {
  const communitiesRaw = parseRunningConfigCommunities(text);
  const communities = parseHuaweiCommunities(text);
  const policiesRaw = parseHuaweiPolicies(text);
  const policies = policiesRaw
    .filter((item) => item.type === "route-policy")
    .map((item) => ({
      name: item.name,
      nodes: item.entries.map((node) => ({
        sequence: node.sequence ?? null,
        action: node.action ?? null,
        matches: Array.isArray(node.matches) ? node.matches : [],
        matchDetails: Array.isArray(node.matchDetails) ? node.matchDetails : [],
        applies: Array.isArray(node.applies) ? node.applies : [],
        evidence: {
          source: "ssh_running_config",
          confidence: "high",
          evidence: `route-policy ${item.name}`,
        },
      })),
      source: "ssh_running_config",
      confidence: "high",
      evidence: `route-policy ${item.name}`,
    }));

  return {
    communities,
    communityLists: [],
    policies,
    prefixLists: [],
    bgpPeers: [],
    raw: { communitiesRaw, policiesRaw },
  };
}

function buildContext(snapshot) {
  return {
    device: { id: 1, hostname: "device-1" },
    contexts: ["bgp", "policies"],
    snapshotRow: null,
    snapshot,
    collectedConfig: null,
    rawConfig: fixtureText,
    source: "ssh_running_config",
    confidence: "high",
    profile: null,
  };
}

function findByMessage(findings, message) {
  return findings.find((finding) => finding.message === message);
}

const snapshot = buildSnapshot(fixtureText);
assert.equal(snapshot.raw.communitiesRaw.communityFilters[0].name, "REJEITA-PREFIX-CDNS");
assert.equal(snapshot.raw.communitiesRaw.communityFilters[0].matchType, "basic");
assert.equal(snapshot.raw.communitiesRaw.communityFilters[0].value, "64777:10064");
assert.equal(snapshot.raw.policiesRaw[0].name, "AS268707-4WNET-BRT-RX-Export-V6");
assert.equal(snapshot.raw.policiesRaw[0].entries[0].matchDetails[0].type, "community-filter");
assert.equal(snapshot.raw.policiesRaw[0].entries[0].matchDetails[0].name, "REJEITA-PREFIX-CDNS");

const findingsPresent = runBgpChecks(buildContext(snapshot));
assert.ok(!findByMessage(findingsPresent, "Route-policy AS268707-4WNET-BRT-RX-Export-V6 referencia community ausente: REJEITA-PREFIX-CDNS"), "community-filter should resolve when present");

const missingSnapshot = buildSnapshot(fixtureText.replace(/^ip community-filter basic REJEITA-PREFIX-CDNS permit 64777:10064\n/, ""));
const findingsMissing = runBgpChecks(buildContext(missingSnapshot));
assert.ok(findingsMissing.some((finding) => finding.status === "unknown" && /community-filters no snapshot/i.test(finding.message)), "community-filter removal should trigger low-confidence warning");

assert.equal(normalizePolicyLookupKey(" REJEITA-PREFIX-CDNS "), normalizePolicyLookupKey("REJEITA-PREFIX-CDNS"));

const evidenceBlob = JSON.stringify(findingsPresent);
for (const secret of ["Admin123!ChangeMe", "passwordHash", "snmpCommunity"]) {
  assert.ok(!evidenceBlob.includes(secret), `evidence leaked ${secret}`);
}

console.log("compliance community-filter reference selftest passed");
