#!/usr/bin/env node

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const schemaPath = path.join(rootDir, "workspace/lib/db/src/schema/bgp_announcements.ts");
const controllerPath = path.join(rootDir, "workspace/artifacts/api-server/src/modules/bgp-announcements/bgp-announcements.controller.ts");
const routesPath = path.join(rootDir, "workspace/artifacts/api-server/src/modules/bgp-announcements/bgp-announcements.routes.ts");
const servicePath = path.join(rootDir, "workspace/artifacts/api-server/src/modules/bgp-announcements/bgp-announcements.preview.service.ts");

const schemaText = readFileSync(schemaPath, "utf8");
const controllerText = readFileSync(controllerPath, "utf8");
const routesText = readFileSync(routesPath, "utf8");
const serviceText = readFileSync(servicePath, "utf8");

assert.ok(schemaText.includes("bgpAnnouncementChangePlansTable"));
assert.ok(schemaText.includes("previewJson"));
assert.ok(controllerText.includes("postAnnouncementPreviewChangeHandler"));
assert.ok(controllerText.includes("postAnnouncementChangePlansHandler"));
assert.ok(controllerText.includes("getAnnouncementChangePlansHandler"));
assert.ok(controllerText.includes("postAnnouncementChangePlanCancelHandler"));
assert.ok(routesText.includes("/bgp/announcements/preview-change"));
assert.ok(routesText.includes("/bgp/announcements/change-plans"));
assert.ok(routesText.includes("/bgp/announcements/change-plans/:id/cancel"));
assert.ok(serviceText.includes("CHANGE_PLAN_DRAFT_CREATED"));

const { simulateAnnouncementPreview, encodeAnnouncementPreview, decodeAnnouncementPreview } = await import(path.join(
  rootDir,
  "workspace/artifacts/api-server/src/modules/bgp-announcements/bgp-announcements.preview.service.ts",
));

const preview = simulateAnnouncementPreview({
  baseSnapshotId: 321,
  deviceId: 44,
  collectionId: 909,
  targetPolicyName: "ORIGIN-RP",
  targetType: "origin_target",
  node: 10,
  upstreamCircuitId: "10",
  upstreamName: "C10",
  prefixScope: {
    type: "network",
    name: "ORIGIN-RP",
    expandedPrefixes: [{ index: null, action: "permit", prefix: "45.169.160.0/23", raw: "network 45.169.160.0 255.255.254.0 route-policy ORIGIN-RP" }],
    affectedPrefixCount: 1,
    shared: false,
  },
  currentState: "On",
  desiredState: "P2",
  currentCommunity: "64777:51001",
  currentCommunitySourceType: "direct",
  currentCommunitySourceName: null,
  currentCommunities: ["64777:50101", "64777:51001"],
  communitySets: [],
  note: "draft note",
});

const previewId = encodeAnnouncementPreview(preview);
const decoded = decodeAnnouncementPreview(previewId);
assert.equal(decoded?.baseSnapshotId, 321);
assert.equal(decoded?.collectionId, 909);
assert.equal(decoded?.targetPolicyName, "ORIGIN-RP");
assert.ok(previewId.startsWith("bgp-preview-v1."));
assert.equal(preview.status, "preview_only");
assert.equal(preview.rollbackSource, 321);

const draftPayload = {
  previewId,
  note: "draft note",
};
assert.equal(draftPayload.previewId.startsWith("bgp-preview-v1."), true);
assert.equal(draftPayload.note, "draft note");

console.log(JSON.stringify({
  ok: true,
  preview: {
    previewId,
    baseSnapshotId: preview.baseSnapshotId,
    collectionId: preview.collectionId,
    targetPolicyName: preview.targetPolicyName,
    riskLevel: preview.riskLevel,
    diff: preview.diff,
    rollbackDiff: preview.rollbackDiff,
    findings: preview.findings,
  },
  draftPayload,
}, null, 2));
console.log("bgp-announcement-change-plan-selftest: PASS");
