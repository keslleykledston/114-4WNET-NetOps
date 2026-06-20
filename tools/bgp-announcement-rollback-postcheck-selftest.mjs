#!/usr/bin/env node

import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const { buildRollbackPostcheckFindings } = await import(path.join(rootDir, "workspace/artifacts/api-server/src/modules/bgp-announcements/bgp-announcements.approval-execution.service.ts"));

const rollback = {
  id: 21,
  rollbackToSnapshotId: 500,
};

const plan = {
  targetPolicyName: "ORIGIN-DEMO",
  targetType: "origin_target",
  node: 10,
  upstreamCircuitId: "10",
  upstreamName: "C10",
};

const expected = {
  snapshot: { id: 500 },
  row: { cells: { "10": { state: "On", community: "64777:51001", findings: [] } } },
  cell: { state: "On", community: "64777:51001", findings: [] },
};

const observedOk = {
  snapshot: { id: 501 },
  row: { cells: { "10": { state: "On", community: "64777:51001", findings: [] } } },
  cell: { state: "On", community: "64777:51001", findings: [] },
};

const observedBad = {
  snapshot: { id: 502 },
  row: { cells: { "10": { state: "P2", community: "64777:51003", findings: [] } } },
  cell: { state: "P2", community: "64777:51003", findings: [] },
};

const observedMissing = {
  snapshot: { id: 503 },
  row: null,
  cell: null,
};

const ok = buildRollbackPostcheckFindings({ rollback, plan, expected, observed: observedOk });
const bad = buildRollbackPostcheckFindings({ rollback, plan, expected, observed: observedBad });
const missing = buildRollbackPostcheckFindings({ rollback, plan, expected, observed: observedMissing });

assert.equal(ok.status, "succeeded");
assert.equal(bad.status, "failed");
assert.equal(missing.status, "inconclusive");
assert.equal(bad.findings.some((finding) => finding.code === "POSTCHECK_STATE_MISMATCH"), true);
assert.equal(missing.findings.some((finding) => finding.code === "POSTCHECK_INCONCLUSIVE"), true);

console.log(JSON.stringify({
  ok: true,
  rollbackPostcheck: {
    succeeded: ok,
    failed: bad,
    inconclusive: missing,
  },
}, null, 2));
console.log("bgp-announcement-rollback-postcheck-selftest: PASS");
