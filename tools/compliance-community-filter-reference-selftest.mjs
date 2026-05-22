#!/usr/bin/env node

import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");

const {
  parseHuaweiCommunityFilterDisplay,
} = await import(path.join(repoRoot, "workspace/artifacts/api-server/src/modules/netops/huawei-vrp/parsers/community-parser.ts"));

const {
  runBgpChecks,
} = await import(path.join(repoRoot, "workspace/artifacts/api-server/src/modules/compliance/checks/bgp-checks.ts"));

const {
  verifyCommunityFilterByName,
} = await import(path.join(repoRoot, "workspace/artifacts/api-server/src/modules/netops/device-discovery/services/community-discovery.service.ts"));

function buildSnapshot({ communities = [], policies = [] } = {}) {
  return {
    bgpPeers: [],
    communities,
    communityLists: [],
    policies,
    prefixLists: [],
  };
}

function buildPolicySnapshot(policyName, communityName) {
  return buildSnapshot({
    policies: [
      {
        name: policyName,
        nodes: [
          {
            sequence: 10,
            action: "permit",
            matches: [`if-match community-filter ${communityName}`],
            matchDetails: [
              {
                type: "community-filter",
                name: communityName,
                raw: `if-match community-filter ${communityName}`,
              },
            ],
            applies: [],
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

const positiveSnapshot = buildPolicySnapshot("MALHA-RX-Import-V6-CDN", "C16-EXPORT-P1");
const positiveFindings = await runBgpChecks(buildContext(positiveSnapshot), {
  allowLiveProof: true,
  verifyCommunityFilterByName: async () => ({
    name: "C16-EXPORT-P1",
    exists: true,
    source: "ssh_display",
    confidence: "high",
    entries: [{ action: "permit", value: "64777:51601", index: null }],
    listId: 283,
    rawEvidence: displayText.trim(),
  }),
});
assert.ok(!hasFinding(positiveFindings, (finding) => finding.status === "fail" && /community-filter/i.test(finding.message)), "verified community-filter should not produce a fail");
assert.ok(!hasFinding(positiveFindings, (finding) => /Não foi possível comprovar community-filters no snapshot/i.test(finding.message)), "verified community-filter should not produce snapshot-missing warning");
assert.ok(!hasFinding(positiveFindings, (finding) => /referencia community ausente: C16-EXPORT-P1/i.test(finding.message)), "verified community-filter should not produce absent reference finding");

const negativeFindings = await runBgpChecks(buildContext(positiveSnapshot), {
  allowLiveProof: true,
  verifyCommunityFilterByName: async () => ({
    name: "C16-EXPORT-P1",
    exists: false,
    source: "ssh_display",
    confidence: "high",
    entries: [],
    rawEvidence: "Named Community basic filter: C16-EXPORT-P1 (ListID = 283)",
    error: "The specified community-filter does not exist.",
  }),
});
assert.ok(hasFinding(negativeFindings, (finding) => finding.status === "fail" && /community-filter inexistente: C16-EXPORT-P1/i.test(finding.message)), "negative proof should fail");

const errorFindings = await runBgpChecks(buildContext(positiveSnapshot), {
  allowLiveProof: true,
  verifyCommunityFilterByName: async () => ({
    name: "C16-EXPORT-P1",
    exists: null,
    source: "unknown",
    confidence: "unknown",
    entries: [],
    error: "SSH timeout",
  }),
});
assert.ok(hasFinding(errorFindings, (finding) => finding.status === "unknown" && /prova SSH falhou ou retornou resposta ambígua/i.test(finding.message)), "verifier error should produce low-confidence unknown");
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

console.log("compliance community-filter reference selftest passed");
