#!/usr/bin/env node

import assert from "node:assert/strict";
import { createHash } from "node:crypto";

function buildFoundationAnnouncementMatrixPayload(input = {}) {
  const rows = (input.rows ?? []).map((row) => ({
    routePolicyName: row.routePolicyName,
    targetType: row.targetType,
    family: row.family,
    prefixScope: [],
    affectedPrefixes: [...row.affectedPrefixes],
    cells: row.cells.map((cell) => ({
      circuitId: cell.circuitId,
      upstreamName: cell.upstreamName,
      state: cell.state,
      community: null,
      actionCode: null,
      note: null,
    })),
    risk: "foundation",
  }));
  return {
    columns: input.columns ?? [],
    rows,
    generatedFrom: input.source ?? "foundation",
    featureStatus: "foundation",
  };
}

function buildFoundationAnnouncementSummary(matrix) {
  const totalCells = matrix.rows.reduce((count, row) => count + row.cells.length, 0);
  const totalUpstreams = new Set(matrix.rows.flatMap((row) => row.cells.map((cell) => `${cell.upstreamName}|${cell.circuitId}`))).size;
  return {
    totalTargets: matrix.rows.length,
    totalUpstreams,
    totalCells,
    totalFindings: 0,
    totalCriticalFindings: 0,
    note: "Foundation snapshot; resolver completo ainda pendente",
  };
}

function computeAnnouncementSnapshotHash(matrix, summary) {
  return createHash("sha256").update(JSON.stringify({ matrix, summary }), "utf8").digest("hex");
}

function compactRowsFromPayload(matrix) {
  return matrix.rows.map((row) => ({
    routePolicyName: row.routePolicyName,
    targetType: row.targetType,
    family: row.family,
    affectedPrefixes: [...row.affectedPrefixes],
    cells: row.cells.map((cell) => ({
      circuitId: cell.circuitId,
      upstreamName: cell.upstreamName,
      state: cell.state,
    })),
  }));
}

function diffCompactMatrixRows(previousRows, currentRows) {
  const previousMap = new Map(previousRows.map((row) => [`${row.routePolicyName}|${row.family}`, row]));
  const currentMap = new Map(currentRows.map((row) => [`${row.routePolicyName}|${row.family}`, row]));
  const added = [];
  const removed = [];
  const changed = [];
  for (const [key, row] of currentMap) {
    const old = previousMap.get(key);
    if (!old) {
      added.push(row);
      continue;
    }
    if (JSON.stringify(old) !== JSON.stringify(row)) {
      changed.push({ key, routePolicyName: row.routePolicyName, before: JSON.stringify(old), after: JSON.stringify(row) });
    }
  }
  for (const [key, row] of previousMap) {
    if (!currentMap.has(key)) removed.push(row);
  }
  return { added, removed, changed };
}

let nextSnapshotId = 1;
let nextRunId = 1;
const snapshots = [];
const runs = [];
const diffs = [];

function seedSnapshot(label) {
  const matrix = buildFoundationAnnouncementMatrixPayload({
    rows: [
      {
        routePolicyName: label,
        targetType: "origin_target",
        family: "ipv4",
        affectedPrefixes: ["10.0.0.0/8"],
        cells: [{ circuitId: "C01", upstreamName: "EBT", state: "on" }],
      },
    ],
  });
  const summary = buildFoundationAnnouncementSummary(matrix);
  const snapshot = {
    id: nextSnapshotId++,
    deviceId: 1,
    snapshotVersion: 1,
    snapshotHash: computeAnnouncementSnapshotHash(matrix, summary),
    isLatest: true,
    status: "completed",
    generatedAt: "2026-06-20T00:00:00.000Z",
    matrixJson: matrix,
    summaryJson: summary,
    rowsJson: compactRowsFromPayload(matrix),
  };
  snapshots.push(snapshot);
  return snapshot;
}

function refreshFlow({ fail = false } = {}) {
  const previousLatest = snapshots.find((snapshot) => snapshot.isLatest) ?? null;
  const run = {
    id: nextRunId++,
    deviceId: 1,
    status: "pending",
    startedAt: "2026-06-20T00:05:00.000Z",
    finishedAt: null,
    previousSnapshotId: previousLatest?.id ?? null,
    newSnapshotId: null,
    errorMessage: null,
  };
  runs.push(run);

  const workingSnapshots = snapshots.map((snapshot) => ({ ...snapshot }));
  try {
    const matrix = buildFoundationAnnouncementMatrixPayload({
      rows: previousLatest
        ? [
            {
              routePolicyName: `${previousLatest.matrixJson.rows[0]?.routePolicyName ?? "ORIGIN-RP"}-v2`,
              targetType: "origin_target",
              family: "ipv4",
              affectedPrefixes: ["10.0.0.0/8"],
              cells: [{ circuitId: "C01", upstreamName: "EBT", state: "p2" }],
            },
          ]
        : [],
    });
    const summary = buildFoundationAnnouncementSummary(matrix);
    if (fail) {
      throw new Error("simulated refresh failure");
    }
    const nextSnapshot = {
      id: nextSnapshotId++,
      deviceId: 1,
      snapshotVersion: (previousLatest?.snapshotVersion ?? 0) + 1,
      snapshotHash: computeAnnouncementSnapshotHash(matrix, summary),
      isLatest: true,
      status: "completed",
      generatedAt: "2026-06-20T00:06:00.000Z",
      matrixJson: matrix,
      summaryJson: summary,
      rowsJson: compactRowsFromPayload(matrix),
    };
    if (previousLatest) {
      const old = workingSnapshots.find((snapshot) => snapshot.id === previousLatest.id);
      if (old) {
        old.isLatest = false;
        old.status = "superseded";
      }
    }
    workingSnapshots.push(nextSnapshot);
    const diff = diffCompactMatrixRows(previousLatest ? previousLatest.rowsJson : [], nextSnapshot.rowsJson);
    diffs.push({
      previousSnapshotId: previousLatest?.id ?? null,
      currentSnapshotId: nextSnapshot.id,
      added: diff.added.length,
      removed: diff.removed.length,
      changed: diff.changed.length,
    });

    snapshots.length = 0;
    snapshots.push(...workingSnapshots);
    run.status = "completed";
    run.finishedAt = "2026-06-20T00:06:30.000Z";
    run.newSnapshotId = nextSnapshot.id;
    return nextSnapshot;
  } catch (error) {
    run.status = "failed";
    run.finishedAt = "2026-06-20T00:06:30.000Z";
    run.errorMessage = error instanceof Error ? error.message : String(error);
    return null;
  }
}

const first = seedSnapshot("ORIGIN-RP");
assert.equal(first.isLatest, true);
assert.equal(snapshots.length, 1);

const latestBefore = snapshots.find((snapshot) => snapshot.isLatest);
assert.equal(latestBefore?.id, first.id);

const second = refreshFlow();
assert.ok(second);
assert.equal(snapshots.find((snapshot) => snapshot.id === first.id)?.isLatest, false);
assert.equal(snapshots.find((snapshot) => snapshot.id === first.id)?.status, "superseded");
assert.equal(snapshots.find((snapshot) => snapshot.id === second.id)?.isLatest, true);
assert.equal(runs.at(-1)?.status, "completed");

const beforeFailureLatestId = snapshots.find((snapshot) => snapshot.isLatest)?.id;
const failed = refreshFlow({ fail: true });
assert.equal(failed, null);
assert.equal(snapshots.find((snapshot) => snapshot.id === beforeFailureLatestId)?.isLatest, true);
assert.equal(runs.at(-1)?.status, "failed");

const lastSnapshot = snapshots.find((snapshot) => snapshot.isLatest);
assert.ok(lastSnapshot?.matrixJson);
assert.ok(lastSnapshot?.summaryJson);

console.log(JSON.stringify({
  ok: true,
  snapshots: snapshots.map((snapshot) => ({ id: snapshot.id, isLatest: snapshot.isLatest, status: snapshot.status })),
  runs: runs.map((run) => ({ id: run.id, status: run.status })),
  diffs,
}, null, 2));
console.log("bgp-announcement-refresh-flow-selftest: PASS");
