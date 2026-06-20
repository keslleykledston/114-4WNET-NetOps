#!/usr/bin/env node

import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const servicePath = path.join(rootDir, "workspace/artifacts/api-server/src/modules/bgp-announcements/bgp-announcements.approval-execution.service.ts");
const serviceText = readFileSync(servicePath, "utf8");
const { buildAnnouncementPostcheckComparison } = await import(path.join(rootDir, "workspace/artifacts/api-server/src/modules/bgp-announcements/bgp-announcements.approval-execution.service.ts"));

assert.ok(serviceText.includes("POSTCHECK_STARTED"));
assert.ok(serviceText.includes("POSTCHECK_SUCCEEDED"));
assert.ok(serviceText.includes("POSTCHECK_INCONCLUSIVE"));

const preview = {
  previewId: "bgp-preview-v1.test",
  baseSnapshotId: 100,
  deviceId: 7,
  collectionId: 1,
  targetPolicyName: "ORIGIN-TEST",
  targetType: "origin_target",
  node: 10,
  upstreamCircuitId: "10",
  upstreamName: "C10",
  prefixScope: { type: "network", name: "10.0.0.0/24", expandedPrefixes: [], affectedPrefixCount: 0, shared: null },
  currentState: "On",
  desiredState: "P2",
  currentCommunity: "64777:51001",
  desiredCommunity: "64777:51003",
  currentCommunitySourceType: "direct",
  currentCommunitySourceName: null,
  currentCommunities: ["64777:51001"],
  desiredCommunities: ["64777:51003"],
  communitySetMatch: { matched: false, matchType: "none", communities: [], desiredCommunities: ["64777:51003"], nearestMatches: [] },
  diff: { removedCommunities: ["64777:51001"], addedCommunities: ["64777:51003"], preservedCommunities: [], oldState: "On", newState: "P2" },
  proposedCommands: [],
  rollbackCommands: [],
  rollbackDiff: { removedCommunities: ["64777:51003"], addedCommunities: ["64777:51001"], preservedCommunities: [], oldState: "P2", newState: "On" },
  rollbackSource: 100,
  riskLevel: "low",
  findings: [],
  status: "preview_only",
  commandConfidence: "high",
  note: null,
};

const observedSuccess = buildAnnouncementPostcheckComparison({
  changePlan: {
    targetPolicyName: "ORIGIN-TEST",
    targetType: "origin_target",
    node: 10,
    upstreamCircuitId: "10",
    upstreamName: "C10",
    currentState: "On",
    desiredState: "P2",
    currentCommunity: "64777:51001",
    desiredCommunity: "64777:51003",
    baseSnapshotId: 100,
    preview,
    postcheckStatus: "pending",
  },
  observedSnapshotId: 101,
  observedMatrix: {
    rows: [{
      targetPolicyName: "ORIGIN-TEST",
      targetType: "origin_target",
      node: 10,
      family: "ipv4",
      prefixScope: { name: "10.0.0.0/24", type: "network", expandedPrefixes: [{ prefix: "10.0.0.0/24" }] },
      cells: {
        "10": { state: "P2", label: "P2", labelState: "P2", community: "64777:51003", findings: [] },
      },
      findings: [],
    }],
    upstreamAudit: { findings: [] },
  },
});
assert.equal(observedSuccess.status, "succeeded");
assert.equal(observedSuccess.observedState, "P2");
assert.equal(observedSuccess.observedCommunity, "64777:51003");

const observedMismatch = buildAnnouncementPostcheckComparison({
  changePlan: {
    targetPolicyName: "ORIGIN-TEST",
    targetType: "origin_target",
    node: 10,
    upstreamCircuitId: "10",
    upstreamName: "C10",
    currentState: "On",
    desiredState: "P2",
    currentCommunity: "64777:51001",
    desiredCommunity: "64777:51003",
    baseSnapshotId: 100,
    preview,
    postcheckStatus: "pending",
  },
  observedSnapshotId: 102,
  observedMatrix: {
    rows: [{
      targetPolicyName: "ORIGIN-TEST",
      targetType: "origin_target",
      node: 10,
      family: "ipv4",
      prefixScope: { name: "10.0.0.0/24", type: "network", expandedPrefixes: [{ prefix: "10.0.0.0/24" }] },
      cells: {
        "10": { state: "On", label: "On", labelState: "On", community: "64777:51001", findings: [] },
      },
      findings: [],
    }],
    upstreamAudit: { findings: [] },
  },
});
assert.equal(observedMismatch.status, "failed");
assert.ok(observedMismatch.findings.some((finding) => finding.code === "POSTCHECK_STATE_MISMATCH"));

const observedInconclusive = buildAnnouncementPostcheckComparison({
  changePlan: {
    targetPolicyName: "ORIGIN-TEST",
    targetType: "origin_target",
    node: 10,
    upstreamCircuitId: "10",
    upstreamName: "C10",
    currentState: "On",
    desiredState: "P2",
    currentCommunity: "64777:51001",
    desiredCommunity: "64777:51003",
    baseSnapshotId: 100,
    preview,
    postcheckStatus: "pending",
  },
  observedSnapshotId: null,
  observedMatrix: null,
});
assert.equal(observedInconclusive.status, "inconclusive");
assert.ok(observedInconclusive.findings.some((finding) => finding.code === "POSTCHECK_INCONCLUSIVE"));

console.log(JSON.stringify({
  ok: true,
  observedSuccess,
  observedMismatch,
  observedInconclusive,
}, null, 2));
console.log("bgp-announcement-postcheck-selftest: PASS");
