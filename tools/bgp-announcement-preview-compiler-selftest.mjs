#!/usr/bin/env node

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const servicePath = path.join(rootDir, "workspace/artifacts/api-server/src/modules/bgp-announcements/bgp-announcements.preview.service.ts");
const serviceText = await import("node:fs/promises").then((fs) => fs.readFile(servicePath, "utf8"));
const {
  simulateAnnouncementPreview,
  encodeAnnouncementPreview,
  decodeAnnouncementPreview,
} = await import(path.join(rootDir, "workspace/artifacts/api-server/src/modules/bgp-announcements/bgp-announcements.preview.service.ts"));

function hashCommunities(values) {
  const normalized = [...new Set(values.map((value) => value.trim()).filter(Boolean))].sort((left, right) => left.localeCompare(right));
  return createHash("sha256").update(JSON.stringify(normalized), "utf8").digest("hex");
}

assert.ok(serviceText.includes("SNAPSHOT_NOT_LATEST"));
assert.ok(serviceText.includes("TARGET_IS_EXPORT_POLICY"));
assert.ok(serviceText.includes("TARGET_IS_UPSTREAM_AUDIT_ONLY"));
assert.ok(serviceText.includes("PREVIEW_USES_DIRECT_COMMUNITIES"));

const exactMatchSets = [
  {
    name: "CLIENTES|2G",
    communities: ["64777:50101", "64777:51003", "64777:51601"],
    normalizedCommunities: ["64777:50101", "64777:51003", "64777:51601"],
    normalizedHash: hashCommunities(["64777:50101", "64777:51003", "64777:51601"]),
    semanticSummary: "exact",
    usageCount: 1,
    usedByPolicies: ["CUST-RP"],
    isShared: false,
    findings: [],
  },
];

const baseFixture = {
  baseSnapshotId: 99,
  deviceId: 7,
  collectionId: 123,
  targetPolicyName: "CUST-RP",
  targetType: "customer_import_target",
  node: 10,
  upstreamCircuitId: "10",
  upstreamName: "C10",
  prefixScope: {
    type: "ip_prefix",
    name: "CUST-PFX",
    expandedPrefixes: [{ index: 10, action: "permit", prefix: "45.187.201.0/24", raw: "ip ip-prefix CUST-PFX index 10 permit 45.187.201.0 24" }],
    affectedPrefixCount: 1,
    shared: false,
  },
  currentState: "On",
  currentCommunity: "64777:51001",
  currentCommunitySourceType: "direct",
  currentCommunitySourceName: null,
  currentCommunities: ["64777:50101", "64777:51001", "64777:51601"],
};

const onToP2 = simulateAnnouncementPreview({
  ...baseFixture,
  desiredState: "P2",
  communitySets: [],
});
assert.deepEqual(onToP2.diff.removedCommunities, ["64777:51001"]);
assert.deepEqual(onToP2.diff.addedCommunities, ["64777:51003"]);
assert.ok(onToP2.diff.preservedCommunities.includes("64777:50101"));
assert.ok(onToP2.diff.preservedCommunities.includes("64777:51601"));
assert.equal(onToP2.communitySetMatch.matched, false);
assert.ok(onToP2.proposedCommands.some((item) => item.command.includes("apply community 64777:50101 64777:51003 64777:51601")));

const p2ToClear = simulateAnnouncementPreview({
  ...baseFixture,
  currentState: "P2",
  currentCommunity: "64777:51003",
  currentCommunities: ["64777:50101", "64777:51003", "64777:51601"],
  desiredState: "Clear",
  communitySets: [],
});
assert.deepEqual(p2ToClear.diff.removedCommunities, ["64777:51003"]);
assert.deepEqual(p2ToClear.diff.addedCommunities, []);
assert.equal(p2ToClear.desiredCommunities.includes("64777:51003"), false);

const clearToOff = simulateAnnouncementPreview({
  ...baseFixture,
  currentState: "Clear",
  currentCommunity: null,
  currentCommunities: ["64777:50101"],
  desiredState: "Off",
  communitySets: [],
});
assert.deepEqual(clearToOff.diff.addedCommunities, ["64777:51067"]);
assert.ok(clearToOff.proposedCommands.some((item) => item.command.includes("64777:51067")));

const preserveUnknown = simulateAnnouncementPreview({
  ...baseFixture,
  currentCommunities: ["64777:50101", "64777:51001", "64777:51601", "99999:777"],
  desiredState: "P2",
  communitySets: [],
});
assert.ok(preserveUnknown.desiredCommunities.includes("99999:777"));

const exactMatch = simulateAnnouncementPreview({
  ...baseFixture,
  desiredState: "P2",
  communitySets: exactMatchSets,
});
assert.equal(exactMatch.communitySetMatch.matched, true);
assert.equal(exactMatch.communitySetMatch.communityListName, "CLIENTES|2G");
assert.ok(exactMatch.proposedCommands.some((item) => item.command.includes("apply community community-list CLIENTES|2G")));

const extraMismatch = simulateAnnouncementPreview({
  ...baseFixture,
  desiredState: "P2",
  communitySets: [{
    ...exactMatchSets[0],
    communities: [...exactMatchSets[0].communities, "64777:51667"],
    normalizedCommunities: [...exactMatchSets[0].communities, "64777:51667"],
    normalizedHash: hashCommunities([...exactMatchSets[0].communities, "64777:51667"]),
  }],
});
assert.equal(extraMismatch.communitySetMatch.matched, false);
assert.ok(extraMismatch.proposedCommands.some((item) => item.command.startsWith("apply community ")));

const conflict = simulateAnnouncementPreview({
  ...baseFixture,
  currentCommunities: ["64777:50101", "64777:51001", "64777:51003", "64777:51601"],
  desiredState: "P2",
  communitySets: [],
});
assert.ok(conflict.findings.some((finding) => finding.code === "MULTIPLE_ACTIONS_FOR_SAME_UPSTREAM"));
assert.equal(conflict.riskLevel, "high");

const rollback = simulateAnnouncementPreview({
  ...baseFixture,
  desiredState: "P2",
  communitySets: [],
});
assert.ok(rollback.rollbackCommands.some((item) => item.command.includes("64777:51001")));
assert.ok(rollback.rollbackDiff.addedCommunities.includes("64777:51001"));

const encoded = encodeAnnouncementPreview(onToP2);
assert.ok(encoded.startsWith("bgp-preview-v1."));
const decoded = decodeAnnouncementPreview(encoded);
assert.equal(decoded?.baseSnapshotId, onToP2.baseSnapshotId);
assert.equal(decoded?.collectionId, onToP2.collectionId);
assert.equal(decoded?.targetPolicyName, onToP2.targetPolicyName);

console.log(JSON.stringify({
  ok: true,
  preview: {
    onToP2,
    p2ToClear,
    clearToOff,
    preserveUnknown,
    exactMatch,
    extraMismatch,
    conflict,
  },
}, null, 2));
console.log("bgp-announcement-preview-compiler-selftest: PASS");
