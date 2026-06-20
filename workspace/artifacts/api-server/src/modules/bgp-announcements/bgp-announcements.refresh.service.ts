import { eq } from "drizzle-orm";
import {
  bgpAnnouncementHistoryEventsTable,
  bgpAnnouncementMatrixDiffsTable,
  bgpAnnouncementMatrixRunsTable,
  bgpAnnouncementMatrixSnapshotsTable,
  db,
  devicesTable,
} from "@workspace/db";
import { getLatestDiscoverySnapshot } from "../netops/device-discovery/discovery.service.js";
import { loadAnnouncementDeviceContext } from "./services/announcement-context.service.js";
import {
  announcementDiffSummary,
  buildFoundationAnnouncementMatrixPayload,
  buildFoundationAnnouncementSummary,
  computeAnnouncementSnapshotHash,
  compactRowsFromPayload,
  diffCompactMatrixRows,
  loadLatestMatrixSnapshot,
} from "./bgp-announcements.snapshot.service.js";
import { buildAnnouncementGraph } from "./bgp-announcements.graph.service.js";
import type {
  AnnouncementMatrixRefreshResponse,
  AnnouncementMatrixPayload,
  AnnouncementMatrixSummaryPayload,
} from "./bgp-announcements.types.js";

function emptyMatrixResponse(source: "foundation" | "discovery_snapshot" | "policy_graph" | "policy_graph_community_resolver"): {
  matrix: AnnouncementMatrixPayload;
  summary: AnnouncementMatrixSummaryPayload;
} {
  const matrix = buildFoundationAnnouncementMatrixPayload({ source, rows: [] });
  return {
    matrix,
    summary: buildFoundationAnnouncementSummary(matrix),
  };
}

export async function refreshAnnouncementMatrix(input: {
  deviceId: number;
  requestedBy: number | null;
  triggerType: "manual" | "copilot" | "scheduled";
}): Promise<AnnouncementMatrixRefreshResponse | { error: string; status: number }> {
  const [device] = await db
    .select({ id: devicesTable.id })
    .from(devicesTable)
    .where(eq(devicesTable.id, input.deviceId))
    .limit(1);
  if (!device) {
    return { error: "Device not found", status: 404 };
  }

  const discoverySnapshot = await getLatestDiscoverySnapshot(input.deviceId);
  const announcementContext = await loadAnnouncementDeviceContext(input.deviceId);
  const collectionId = discoverySnapshot?.persistedSnapshotId ?? discoverySnapshot?.persistedRunId ?? null;
  const previousLatest = await loadLatestMatrixSnapshot(input.deviceId);
  const currentTime = new Date();
  const previousRows = previousLatest ? compactRowsFromPayload(previousLatest.matrixJson) : [];
  const previousDetailedRows = previousLatest?.matrixJson.rows ?? [];
  const graphResult =
    announcementContext !== "no_data"
      ? buildAnnouncementGraph({
          rawConfig: announcementContext.rawConfig,
          localAs: discoverySnapshot?.parsed_config?.bgp_peer_model?.localAs ?? null,
          routePolicies: Object.values(announcementContext.parsedConfig.consumers.route_policies).map((policy) => ({
            name: policy.name,
            nodes: policy.nodes.map((node) => ({
              sequence: node.sequence,
              action: node.action,
              matches: node.matches,
              applies: node.applies,
            })),
          })),
          bgpPeers: discoverySnapshot?.bgpPeers
            ?? Object.values(announcementContext.parsedConfig.consumers.bgp_peers).map((peer) => ({
              peerIp: peer.peerIp ?? peer.name ?? "",
              name: peer.name ?? null,
              role: "unknown",
              importPolicy: peer.importPolicy,
              exportPolicy: peer.exportPolicy,
              addressFamily: "unknown",
          })),
        })
      : null;
  const source = graphResult ? graphResult.payload.generatedFrom : "foundation";
  const nextPayload = graphResult?.payload ?? emptyMatrixResponse(source).matrix;
  const nextSummary = graphResult?.summary ?? emptyMatrixResponse(source).summary;
  const nextHash = computeAnnouncementSnapshotHash(nextPayload, nextSummary);
  const diffSummary = announcementDiffSummary(previousRows, compactRowsFromPayload(nextPayload));
  const previousRowMap = new Map(previousDetailedRows.map((row) => [`${row.routePolicyName}|${row.family}`, row]));
  const timelineEvents = [] as Array<{
    deviceId: number;
    targetPolicyName: string;
    family: string;
    prefix: string | null;
    upstreamCircuitId: string | null;
    upstreamName: string | null;
    eventType: string;
    oldState: string | null;
    newState: string | null;
    oldCommunity: string | null;
    newCommunity: string | null;
    snapshotId: number;
    detectedAt: Date;
  }>;

  const runInsert = await db
    .insert(bgpAnnouncementMatrixRunsTable)
    .values({
      deviceId: input.deviceId,
      requestedBy: input.requestedBy,
      triggerType: input.triggerType,
      status: "pending",
      startedAt: currentTime,
      collectionId,
      previousSnapshotId: previousLatest?.id ?? null,
      logsJson: [],
    })
    .returning();
  const run = runInsert[0];
  if (!run) {
    return { error: "Failed to create announcement matrix run", status: 500 };
  }

  try {
    const persisted = await db.transaction(async (tx) => {
      if (previousLatest) {
        await tx
          .update(bgpAnnouncementMatrixSnapshotsTable)
          .set({ isLatest: false, status: "superseded" })
          .where(eq(bgpAnnouncementMatrixSnapshotsTable.id, previousLatest.id));
      }

      const nextVersion = (previousLatest?.snapshotVersion ?? 0) + 1;
      const [snapshotRow] = await tx
        .insert(bgpAnnouncementMatrixSnapshotsTable)
        .values({
          deviceId: input.deviceId,
          tenantId: null,
          collectionId,
          snapshotVersion: nextVersion,
          snapshotHash: nextHash,
          isLatest: true,
          status: "completed",
          source,
          familyScope: "all",
          totalTargets: nextSummary.totalTargets,
          totalUpstreams: nextSummary.totalUpstreams,
          totalCells: nextSummary.totalCells,
          totalFindings: nextSummary.totalFindings,
          totalCriticalFindings: nextSummary.totalCriticalFindings,
          matrixJson: nextPayload,
          summaryJson: nextSummary,
          filtersJson: {
            scope: graphResult ? graphResult.payload.generatedFrom : "foundation",
            deviceId: input.deviceId,
            graph: graphResult ? {
              classifications: graphResult.classifications.map((classification) => ({
                policyName: classification.policyName,
                policyType: classification.policyType,
                includeInAnnouncementMatrix: classification.includeInAnnouncementMatrix,
                confidence: classification.confidence,
                reason: classification.reason,
              })),
            } : null,
          },
          generatedAt: currentTime,
          createdBy: input.requestedBy,
        })
        .returning();

      if (!snapshotRow) {
        throw new Error("Failed to persist announcement matrix snapshot");
      }

      const nextRows = nextPayload.rows;
      for (const nextRow of nextRows) {
        const key = `${nextRow.targetPolicyName}|${nextRow.family}`;
        const previousRow = previousRowMap.get(key) ?? null;
        if (!previousRow) {
          timelineEvents.push({
            deviceId: input.deviceId,
            targetPolicyName: nextRow.targetPolicyName,
            family: nextRow.family,
            prefix: nextRow.prefixScope.expandedPrefixes[0]?.prefix ?? nextRow.affectedPrefixes[0] ?? null,
            upstreamCircuitId: null,
            upstreamName: null,
            eventType: "target_added",
            oldState: null,
            newState: nextRow.risk,
            oldCommunity: null,
            newCommunity: null,
            snapshotId: snapshotRow.id,
            detectedAt: currentTime,
          });
          continue;
        }

        const previousCells = Object.values(previousRow.cells ?? {});
        const currentCells = Object.values(nextRow.cells ?? {});
        const previousCellMap = new Map(previousCells.map((cell) => [cell.circuitId, cell]));
        const currentCellMap = new Map(currentCells.map((cell) => [cell.circuitId, cell]));
        for (const circuitId of new Set([...previousCellMap.keys(), ...currentCellMap.keys()])) {
          const before = previousCellMap.get(circuitId) ?? null;
          const after = currentCellMap.get(circuitId) ?? null;
          if (JSON.stringify(before) === JSON.stringify(after)) continue;
          timelineEvents.push({
            deviceId: input.deviceId,
            targetPolicyName: nextRow.targetPolicyName,
            family: nextRow.family,
            prefix: nextRow.prefixScope.expandedPrefixes[0]?.prefix ?? nextRow.affectedPrefixes[0] ?? null,
            upstreamCircuitId: circuitId,
            upstreamName: after?.upstreamName ?? before?.upstreamName ?? null,
            eventType: before && after ? "cell_state_changed" : after ? "cell_added" : "cell_removed",
            oldState: before?.state ?? null,
            newState: after?.state ?? null,
            oldCommunity: before?.community ?? null,
            newCommunity: after?.community ?? null,
            snapshotId: snapshotRow.id,
            detectedAt: currentTime,
          });
        }

        if (JSON.stringify(previousRow.prefixScope) !== JSON.stringify(nextRow.prefixScope)) {
          timelineEvents.push({
            deviceId: input.deviceId,
            targetPolicyName: nextRow.targetPolicyName,
            family: nextRow.family,
            prefix: nextRow.prefixScope.expandedPrefixes[0]?.prefix ?? nextRow.affectedPrefixes[0] ?? null,
            upstreamCircuitId: null,
            upstreamName: null,
            eventType: "prefix_scope_changed",
            oldState: previousRow.prefixScope?.name ?? null,
            newState: nextRow.prefixScope?.name ?? null,
            oldCommunity: null,
            newCommunity: null,
            snapshotId: snapshotRow.id,
            detectedAt: currentTime,
          });
        }
      }

      if (previousLatest) {
        const diff = diffCompactMatrixRows(previousRows, compactRowsFromPayload(nextPayload));
        await tx.insert(bgpAnnouncementMatrixDiffsTable).values({
          previousSnapshotId: previousLatest.id,
          currentSnapshotId: snapshotRow.id,
          deviceId: input.deviceId,
          diffHash: computeAnnouncementSnapshotHash(nextPayload, nextSummary),
          addedJson: diff.added,
          removedJson: diff.removed,
          changedJson: diff.changed,
          summaryJson: diffSummary,
        });
      }

      await tx.insert(bgpAnnouncementHistoryEventsTable).values({
        deviceId: input.deviceId,
        targetPolicyName: "foundation",
        family: "all",
        prefix: null,
        upstreamCircuitId: null,
        upstreamName: null,
        eventType: "snapshot_generated",
        oldState: previousLatest ? "superseded" : null,
        newState: "completed",
        oldCommunity: null,
        newCommunity: null,
        snapshotId: snapshotRow.id,
        detectedAt: currentTime,
      });

      if (timelineEvents.length > 0) {
        await tx.insert(bgpAnnouncementHistoryEventsTable).values(timelineEvents);
      }

      await tx
        .update(bgpAnnouncementMatrixRunsTable)
        .set({
          status: "completed",
          finishedAt: new Date(),
          newSnapshotId: snapshotRow.id,
        })
        .where(eq(bgpAnnouncementMatrixRunsTable.id, run.id));

      return snapshotRow;
    });

    return {
      run_id: run.id,
      snapshot_id: persisted.id,
      generated_at: persisted.generatedAt.toISOString(),
      collection_id: persisted.collectionId,
      matrix: persisted.matrixJson as AnnouncementMatrixPayload,
      summary: persisted.summaryJson as AnnouncementMatrixSummaryPayload,
      diff_summary: diffSummary,
    };
  } catch (error) {
    await db
      .update(bgpAnnouncementMatrixRunsTable)
      .set({
        status: "failed",
        finishedAt: new Date(),
        errorMessage: error instanceof Error ? error.message : String(error),
      })
      .where(eq(bgpAnnouncementMatrixRunsTable.id, run.id));

    return {
      error: error instanceof Error ? error.message : "Failed to refresh announcement matrix",
      status: 500,
    };
  }
}
