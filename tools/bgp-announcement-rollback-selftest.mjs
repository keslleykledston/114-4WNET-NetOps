#!/usr/bin/env node

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const schemaText = readFileSync(path.join(rootDir, "workspace/lib/db/src/schema/bgp_announcements.ts"), "utf8");
const controllerText = readFileSync(path.join(rootDir, "workspace/artifacts/api-server/src/modules/bgp-announcements/bgp-announcements.controller.ts"), "utf8");
const routesText = readFileSync(path.join(rootDir, "workspace/artifacts/api-server/src/modules/bgp-announcements/bgp-announcements.routes.ts"), "utf8");

assert.ok(schemaText.includes("bgpAnnouncementRollbacksTable"));
assert.ok(schemaText.includes("rollbackToSnapshotId"));
assert.ok(controllerText.includes("postAnnouncementRollbackRequestHandler"));
assert.ok(controllerText.includes("postAnnouncementRollbackDryRunHandler"));
assert.ok(controllerText.includes("postAnnouncementRollbackPostcheckHandler"));
assert.ok(routesText.includes("/bgp/announcements/change-plans/:id/rollback/request"));
assert.ok(routesText.includes("/bgp/announcements/rollbacks/:id/dry-run"));
assert.ok(routesText.includes("/bgp/announcements/rollbacks/:id/postcheck"));

const {
  buildAnnouncementRollbackExecutionLog,
  buildAnnouncementRollbackGateFindings,
} = await import(path.join(rootDir, "workspace/artifacts/api-server/src/modules/bgp-announcements/bgp-announcements.approval-execution.service.ts"));

const plan = {
  id: 77,
  deviceId: 44,
  baseSnapshotId: 101,
  collectionId: 909,
  previewId: "bgp-preview-v1.demo",
  targetPolicyName: "ORIGIN-DEMO",
  targetType: "origin_target",
  node: 10,
  upstreamCircuitId: "10",
  upstreamName: "C10",
  currentState: "On",
  desiredState: "P2",
  currentCommunity: "64777:51001",
  desiredCommunity: "64777:51003",
  diff: { removedCommunities: ["64777:51001"], addedCommunities: ["64777:51003"], preservedCommunities: [], oldState: "On", newState: "P2" },
  proposedCommands: [{ command: "apply community 64777:51003", confidence: "high" }],
  rollbackCommands: [
    { command: "system-view", confidence: "high" },
    { command: "route-policy ORIGIN-DEMO permit node 10", confidence: "high" },
    { command: "apply community 64777:51001", confidence: "high" },
    { command: "return", confidence: "high" },
  ],
  findings: [],
  riskLevel: "medium",
  status: "dry_run_succeeded",
  note: null,
  preview: { previewId: "bgp-preview-v1.demo" },
  createdBy: 1,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  postcheckRequired: true,
  postcheckStatus: "pending",
  latestPostcheck: null,
  approval: null,
  executions: [],
  latestExecution: null,
};

assert.equal(buildAnnouncementRollbackGateFindings(plan).length, 0);
assert.equal(buildAnnouncementRollbackGateFindings({ ...plan, rollbackCommands: [] }).some((finding) => finding.code === "ROLLBACK_COMMANDS_MISSING"), true);
assert.equal(buildAnnouncementRollbackGateFindings({ ...plan, riskLevel: "critical" }).some((finding) => finding.code === "ROLLBACK_HAS_CRITICAL_RISK"), true);

const log = buildAnnouncementRollbackExecutionLog(plan.rollbackCommands, "dry_run");
assert.equal(log.at(0)?.status, "would_execute");
assert.equal(log.at(-1)?.status, "postcheck_required");

console.log(JSON.stringify({
  ok: true,
  rollback: {
    gateFindings: buildAnnouncementRollbackGateFindings(plan),
    log,
  },
}, null, 2));
console.log("bgp-announcement-rollback-selftest: PASS");
