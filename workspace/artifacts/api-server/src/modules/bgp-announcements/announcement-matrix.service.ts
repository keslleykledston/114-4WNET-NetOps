import { eq } from "drizzle-orm";
import {
  bgpAnnouncementMatrixSnapshotsTable,
  bgpAnnouncementTargetsTable,
  bgpCommunitySetsTable,
  db,
  devicesTable,
} from "@workspace/db";
import type {
  MatrixResponse,
  PreviewChangeRequest,
  PreviewChangeResponse,
  SnapshotRefreshResult,
  SnapshotSummary,
} from "./bgp-announcement.types.js";
import { getBgpAnnouncementMaxCollectionAgeMinutes } from "./bgp-announcement.gate.js";
import { buildAnnouncementMatrix } from "./resolvers/announcement-matrix.resolver.js";
import type { BgpPolicyGraph } from "./graph/bgp-policy-graph.builder.js";
import { hashCommunitySet } from "./resolvers/community-set-matcher.js";
import { normalizePolicyLookupKey } from "../netops/huawei-vrp/parsers/policy-utils.js";
import { compileAnnouncementPreview } from "./services/announcement-preview.service.js";
import { loadAnnouncementDeviceContext, type AnnouncementDeviceContext } from "./services/announcement-context.service.js";
import { ensureUpstreamCircuitsInDb } from "./services/upstream-circuit-discovery.service.js";
import {
  buildTargetEvidence,
  getExpandedPrefixesForPolicyNode,
} from "./services/announcement-evidence.service.js";
import {
  listRecentMatrixSnapshots,
  loadLatestMatrixSnapshot,
  loadMatrixSnapshotById,
  matrixSnapshotRowToResponse,
  persistAnnouncementMatrixSnapshot,
} from "./announcement-matrix-snapshot.service.js";
import {
  buildSnapshotRefreshResult,
  computeSnapshotCounters,
  computeSnapshotWarnings,
  determineSnapshotStatus,
  snapshotSummaryFromMeta,
} from "./services/announcement-snapshot-refresh.service.js";
import { parseCircuitPolicyName } from "./parsers/circuit-policy.parser.js";

const MATRIX_UPSTREAM_ROLES = new Set(["provider", "cdn", "ix", "pni", "transit"]);

async function loadCommunitySetCatalog(deviceId: number) {
  const rows = await db
    .select()
    .from(bgpCommunitySetsTable)
    .where(eq(bgpCommunitySetsTable.deviceId, deviceId));

  return rows.map((row) => ({
    name: row.name,
    communities: Array.isArray(row.communitiesJson) ? row.communitiesJson.map(String) : [],
    normalizedHash: row.normalizedHash,
    isShared: row.isShared,
  }));
}

async function ensureCommunitySetsFromGraph(deviceId: number, graph: BgpPolicyGraph) {
  for (const [name, communities] of graph.communityLists) {
    const hash = hashCommunitySet(communities);
    await db
      .insert(bgpCommunitySetsTable)
      .values({
        deviceId,
        name,
        communitiesJson: communities,
        normalizedHash: hash,
        source: "discovered",
        isShared: false,
      })
      .onConflictDoUpdate({
        target: [bgpCommunitySetsTable.deviceId, bgpCommunitySetsTable.name],
        set: {
          communitiesJson: communities,
          normalizedHash: hash,
          updatedAt: new Date(),
        },
      });
  }
}

function targetTypeToPersistedTargetType(targetType: string): string {
  if (targetType === "origin") return "origin_target";
  if (targetType === "customer") return "customer_import_target";
  return targetType;
}

async function persistAnnouncementTargets(deviceId: number, rows: MatrixResponse["rows"], source: string) {
  await db.delete(bgpAnnouncementTargetsTable).where(eq(bgpAnnouncementTargetsTable.deviceId, deviceId));

  if (rows.length === 0) return;

  await db.insert(bgpAnnouncementTargetsTable).values(rows.map((row) => {
    const circuit = parseCircuitPolicyName(row.routePolicyName);
    const customerAsn = circuit?.asn ?? null;
    const confidence = row.cells.every((cell) => cell.confidence === "high") ? "high" : "medium";
    return {
      deviceId,
      targetType: targetTypeToPersistedTargetType(row.targetType),
      targetName: row.routePolicyName,
      family: row.family,
      prefix: row.affectedPrefixes[0] ?? null,
      customerAsn,
      routePolicyName: row.routePolicyName,
      node: row.node,
      matchType: row.prefixListName ? "prefix-list" : "network",
      prefixListName: row.prefixListName,
      expandedPrefixesJson: row.affectedPrefixes,
      modifiable: row.modifiable,
      requiresApproval: row.riskLevel !== "low",
      riskLevel: row.riskLevel,
      source,
      confidence,
      lastSeenAt: row.lastCollectedAt ? new Date(row.lastCollectedAt) : null,
    };
  }));
}

function applyMatrixFilters(rows: MatrixResponse["rows"], filters?: {
  family?: string;
  targetType?: string;
  search?: string;
}) {
  let filteredRows = rows;
  if (filters?.family) {
    filteredRows = filteredRows.filter((r) => r.family === filters.family);
  }
  if (filters?.targetType) {
    filteredRows = filteredRows.filter((r) => r.targetType === filters.targetType);
  }
  if (filters?.search) {
    const q = filters.search.toLowerCase();
    filteredRows = filteredRows.filter((r) =>
      r.routePolicyName.toLowerCase().includes(q)
      || r.affectedPrefixes.some((p) => p.toLowerCase().includes(q))
      || r.cells.some((c) => (c.community ?? "").toLowerCase().includes(q)),
    );
  }
  return filteredRows;
}

export async function buildMatrixFromPersistedData(deviceId: number): Promise<
  { matrix: MatrixResponse; ctx: AnnouncementDeviceContext } | "device_not_found" | "no_data"
> {
  const [device] = await db.select().from(devicesTable).where(eq(devicesTable.id, deviceId)).limit(1);
  if (!device) return "device_not_found";

  const ctx = await loadAnnouncementDeviceContext(deviceId);
  if (ctx === "no_data") return "no_data";

  await ensureCommunitySetsFromGraph(deviceId, ctx.graph);
  const upstreams = await ensureUpstreamCircuitsInDb(deviceId, ctx.parsedConfig);

  const { rows, findings } = buildAnnouncementMatrix({
    deviceId,
    parsedConfig: ctx.parsedConfig,
    graph: ctx.graph,
    upstreams,
    collectionAgeMinutes: ctx.collectionAgeMinutes,
    lastCollectedAt: ctx.lastCollectedAt,
  });

  await persistAnnouncementTargets(deviceId, rows, ctx.source);

  const matrix: MatrixResponse = {
    deviceId,
    upstreams,
    rows,
    findings,
    generatedAt: new Date().toISOString(),
    meta: {
      source: "persisted_database",
      dataSource: ctx.source,
      collectionAgeMinutes: ctx.collectionAgeMinutes,
      lastCollectedAt: ctx.lastCollectedAt,
      readOnly: true,
      refreshMode: "database_only",
    },
  };

  return { matrix, ctx };
}

export async function refreshAnnouncementMatrixSnapshot(deviceId: number): Promise<
  SnapshotRefreshResult | "device_not_found" | "no_data"
> {
  const built = await buildMatrixFromPersistedData(deviceId);
  if (built === "device_not_found" || built === "no_data") return built;

  const { matrix, ctx } = built;
  const communitySets = await listCommunitySets(deviceId);
  const counters = computeSnapshotCounters(matrix, communitySets.length);
  const warnings = computeSnapshotWarnings(ctx, matrix);
  const status = determineSnapshotStatus(matrix);

  matrix.meta = {
    ...matrix.meta!,
    counters,
    warnings,
    status,
  };

  const snapshotId = await persistAnnouncementMatrixSnapshot(matrix);
  if (!snapshotId) {
    throw new Error("Failed to persist matrix snapshot");
  }

  const [snapshotRow] = await db
    .select({ createdAt: bgpAnnouncementMatrixSnapshotsTable.createdAt })
    .from(bgpAnnouncementMatrixSnapshotsTable)
    .where(eq(bgpAnnouncementMatrixSnapshotsTable.id, snapshotId))
    .limit(1);

  return buildSnapshotRefreshResult(
    snapshotId,
    matrix,
    counters,
    warnings,
    status,
    snapshotRow?.createdAt ?? new Date(),
  );
}

export async function getLatestMatrixSnapshotSummary(deviceId: number): Promise<SnapshotSummary | null> {
  const snapshot = await loadLatestMatrixSnapshot(deviceId);
  if (!snapshot) return null;
  return snapshotSummaryFromMeta(snapshot);
}

export async function listMatrixSnapshotSummaries(deviceId: number, limit = 20): Promise<SnapshotSummary[]> {
  return listRecentMatrixSnapshots(deviceId, limit);
}

export async function getMatrixSnapshotById(snapshotId: number, deviceId?: number) {
  const snapshot = await loadMatrixSnapshotById(snapshotId);
  if (!snapshot) return "snapshot_not_found" as const;
  if (deviceId != null && snapshot.deviceId !== deviceId) return "snapshot_not_found" as const;
  const matrix = matrixSnapshotRowToResponse(snapshot);
  if (!matrix) return "snapshot_incompatible" as const;
  return matrix;
}

export async function getAnnouncementMatrix(deviceId: number, filters?: {
  family?: string;
  targetType?: string;
  search?: string;
}, options?: { snapshotId?: number }): Promise<MatrixResponse | "device_not_found" | "no_snapshot"> {
  const [device] = await db.select().from(devicesTable).where(eq(devicesTable.id, deviceId)).limit(1);
  if (!device) return "device_not_found";

  const snapshotRow = options?.snapshotId != null
    ? await loadMatrixSnapshotById(options.snapshotId)
    : await loadLatestMatrixSnapshot(deviceId);

  if (!snapshotRow || snapshotRow.deviceId !== deviceId) {
    return "no_snapshot";
  }

  const matrix = matrixSnapshotRowToResponse(snapshotRow);
  if (!matrix) {
    return "no_snapshot";
  }

  return {
    ...matrix,
    rows: applyMatrixFilters(matrix.rows, filters),
  };
}

export async function getTargetEvidence(
  deviceId: number,
  targetKey: string,
  upstreamCircuitId: string,
) {
  const ctx = await loadAnnouncementDeviceContext(deviceId);
  if (ctx === "no_data") return "no_snapshot" as const;
  const upstreams = await ensureUpstreamCircuitsInDb(deviceId, ctx.parsedConfig);
  return buildTargetEvidence(ctx, upstreams, targetKey, upstreamCircuitId.padStart(2, "0").slice(-2));
}

export async function getExpandedPrefixes(
  deviceId: number,
  routePolicyName: string,
  node: number,
  family: "ipv4" | "ipv6",
) {
  const ctx = await loadAnnouncementDeviceContext(deviceId);
  if (ctx === "no_data") return "no_snapshot" as const;
  return getExpandedPrefixesForPolicyNode(ctx, routePolicyName, node, family);
}

export async function previewAnnouncementChange(
  request: PreviewChangeRequest,
): Promise<PreviewChangeResponse | "no_snapshot" | "blocked"> {
  const maxAge = getBgpAnnouncementMaxCollectionAgeMinutes();
  const ctx = await loadAnnouncementDeviceContext(request.deviceId);
  if (ctx === "no_data") return "no_snapshot";

  if (ctx.collectionAgeMinutes !== null && ctx.collectionAgeMinutes > maxAge) {
    return "blocked";
  }

  await ensureCommunitySetsFromGraph(request.deviceId, ctx.graph);
  const upstreams = await ensureUpstreamCircuitsInDb(request.deviceId, ctx.parsedConfig);
  const communitySets = await loadCommunitySetCatalog(request.deviceId);

  return compileAnnouncementPreview({
    request,
    parsedConfig: ctx.parsedConfig,
    graph: ctx.graph,
    upstreams,
    communitySets,
    localAs: ctx.parsedConfig.bgp_peer_model?.localAs ?? null,
  });
}

export async function listCommunitySets(deviceId: number) {
  return db
    .select()
    .from(bgpCommunitySetsTable)
    .where(eq(bgpCommunitySetsTable.deviceId, deviceId))
    .orderBy(bgpCommunitySetsTable.name);
}

export async function syncCommunitySetsFromGraph(deviceId: number): Promise<number> {
  const ctx = await loadAnnouncementDeviceContext(deviceId);
  if (ctx === "no_data") return 0;
  await ensureCommunitySetsFromGraph(deviceId, ctx.graph);
  return ctx.graph.communityLists.size;
}

export async function findExactCommunitySetMatch(deviceId: number, communities: string[]) {
  const hash = hashCommunitySet(communities);
  const rows = await db
    .select()
    .from(bgpCommunitySetsTable)
    .where(eq(bgpCommunitySetsTable.deviceId, deviceId));

  const match = rows.find((row) => row.normalizedHash === hash);
  return match ?? null;
}

export async function resolveCommunitySetSemantics(deviceId: number, communities: string[]) {
  const { parseCircuitCommunity } = await import("./parsers/community-circuit.parser.js");
  const { ACTION_CODE_TO_STATE, CELL_STATE_TO_LABEL } = await import("./bgp-announcement.types.js");

  return communities.map((comm) => {
    const parsed = parseCircuitCommunity(comm);
    const state = parsed.valid ? ACTION_CODE_TO_STATE[parsed.actionCode] : "unknown";
    return {
      community: comm,
      valid: parsed.valid,
      circuitId: parsed.circuitId || null,
      actionCode: parsed.actionCode || null,
      label: parsed.valid ? CELL_STATE_TO_LABEL[state] : "?",
    };
  });
}

export { MATRIX_UPSTREAM_ROLES, loadAnnouncementDeviceContext };
