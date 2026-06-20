import { createHash } from "node:crypto";
import type { AnnouncementHistoryEvent, AnnouncementMatrixPayload, AnnouncementMatrixDiffDetail } from "./bgp-announcements.types.js";

export function compareAnnouncementMatrixPayloads(previous: AnnouncementMatrixPayload, current: AnnouncementMatrixPayload): AnnouncementMatrixDiffDetail {
  const previousMap = new Map(previous.rows.map((row) => [`${row.targetPolicyName}|${row.family}`, row]));
  const currentMap = new Map(current.rows.map((row) => [`${row.targetPolicyName}|${row.family}`, row]));
  const added: unknown[] = [];
  const removed: unknown[] = [];
  const changed: unknown[] = [];

  for (const [key, currentRow] of currentMap) {
    const previousRow = previousMap.get(key);
    if (!previousRow) {
      added.push({
        targetPolicyName: currentRow.targetPolicyName,
        targetType: currentRow.targetType,
        family: currentRow.family,
        node: currentRow.node ?? null,
        prefixScope: currentRow.prefixScope,
        cells: currentRow.cells,
        findings: currentRow.findings ?? [],
        riskLevel: currentRow.riskLevel ?? currentRow.risk,
      });
      continue;
    }

    const previousCells = previousRow.cells ?? {};
    const currentCells = currentRow.cells ?? {};
    const cellChanges: Array<Record<string, unknown>> = [];
    for (const circuitId of new Set([...Object.keys(previousCells), ...Object.keys(currentCells)])) {
      const before = previousCells[circuitId] ?? null;
      const after = currentCells[circuitId] ?? null;
      if (JSON.stringify(before) !== JSON.stringify(after)) {
        cellChanges.push({
          circuitId,
          before,
          after,
        });
      }
    }

    const prevFindings = new Set((previousRow.findings ?? []).map((finding) => finding.code));
    const currFindings = new Set((currentRow.findings ?? []).map((finding) => finding.code));
    const findingsAdded = [...currFindings].filter((code) => !prevFindings.has(code));
    const findingsResolved = [...prevFindings].filter((code) => !currFindings.has(code));

    if (
      JSON.stringify(previousRow.prefixScope) !== JSON.stringify(currentRow.prefixScope)
      || JSON.stringify(previousRow.affectedPrefixes) !== JSON.stringify(currentRow.affectedPrefixes)
      || JSON.stringify(previousRow.findings ?? []) !== JSON.stringify(currentRow.findings ?? [])
      || JSON.stringify(previousRow.riskLevel ?? previousRow.risk) !== JSON.stringify(currentRow.riskLevel ?? currentRow.risk)
      || cellChanges.length > 0
    ) {
      changed.push({
        targetPolicyName: currentRow.targetPolicyName,
        routePolicyName: currentRow.routePolicyName,
        family: currentRow.family,
        targetType: currentRow.targetType,
        node: currentRow.node ?? null,
        prefixScopeChanged: JSON.stringify(previousRow.prefixScope) !== JSON.stringify(currentRow.prefixScope),
        affectedPrefixesChanged: JSON.stringify(previousRow.affectedPrefixes) !== JSON.stringify(currentRow.affectedPrefixes),
        cellChanges,
        findingsAdded,
        findingsResolved,
        riskBefore: previousRow.riskLevel ?? previousRow.risk,
        riskAfter: currentRow.riskLevel ?? currentRow.risk,
      });
    }
  }

  for (const [key, previousRow] of previousMap) {
    if (!currentMap.has(key)) {
      removed.push({
        targetPolicyName: previousRow.targetPolicyName,
        targetType: previousRow.targetType,
        family: previousRow.family,
        node: previousRow.node ?? null,
        prefixScope: previousRow.prefixScope,
        cells: previousRow.cells,
        findings: previousRow.findings ?? [],
        riskLevel: previousRow.riskLevel ?? previousRow.risk,
      });
    }
  }

  return {
    previousSnapshotId: 0,
    currentSnapshotId: 0,
    deviceId: 0,
    diffHash: createHash("sha256").update(JSON.stringify({ previous, current }), "utf8").digest("hex"),
    added,
    removed,
    changed,
    summary: {
      added: added.length,
      removed: removed.length,
      changed: changed.length,
    },
  } as AnnouncementMatrixDiffDetail;
}

export function buildAnnouncementTimelapse(events: AnnouncementHistoryEvent[]): AnnouncementHistoryEvent[] {
  return [...events].sort((left, right) => new Date(left.detectedAt).getTime() - new Date(right.detectedAt).getTime());
}
