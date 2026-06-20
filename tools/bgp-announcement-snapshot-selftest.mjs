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

const payload = buildFoundationAnnouncementMatrixPayload({
  source: "foundation",
  rows: [
    {
      routePolicyName: "ORIGIN-RP",
      targetType: "origin_target",
      family: "ipv4",
      affectedPrefixes: ["10.0.0.0/8"],
      cells: [{ circuitId: "C01", upstreamName: "EBT", state: "on" }],
    },
  ],
});

assert.equal(payload.generatedFrom, "foundation");
assert.equal(payload.featureStatus, "foundation");
assert.equal(payload.rows.length, 1);
assert.equal(payload.rows[0].cells[0].community, null);
assert.equal(payload.rows[0].cells[0].actionCode, null);

const summary = buildFoundationAnnouncementSummary(payload);
assert.equal(summary.totalTargets, 1);
assert.equal(summary.totalUpstreams, 1);
assert.equal(summary.totalCells, 1);
assert.equal(summary.totalFindings, 0);
assert.match(summary.note, /Foundation snapshot/);

const hashA = computeAnnouncementSnapshotHash(payload, summary);
const hashB = computeAnnouncementSnapshotHash(payload, summary);
assert.equal(hashA, hashB);

const previous = compactRowsFromPayload(buildFoundationAnnouncementMatrixPayload({
  rows: [
    {
      routePolicyName: "ORIGIN-RP",
      targetType: "origin_target",
      family: "ipv4",
      affectedPrefixes: ["10.0.0.0/8"],
      cells: [{ circuitId: "C01", upstreamName: "EBT", state: "off" }],
    },
  ],
}));
const current = compactRowsFromPayload(payload);
const diff = diffCompactMatrixRows(previous, current);
assert.equal(diff.added.length, 0);
assert.equal(diff.removed.length, 0);
assert.equal(diff.changed.length, 1);

console.log(JSON.stringify({
  ok: true,
  rows: payload.rows.length,
  summary: {
    totalTargets: summary.totalTargets,
    totalUpstreams: summary.totalUpstreams,
    totalCells: summary.totalCells,
  },
}, null, 2));
console.log("bgp-announcement-snapshot-selftest: PASS");
