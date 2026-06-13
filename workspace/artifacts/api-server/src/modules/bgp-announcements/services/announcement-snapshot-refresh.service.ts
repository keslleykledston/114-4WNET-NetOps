import type {
  MatrixResponse,
  SnapshotCounters,
  SnapshotRefreshResult,
  SnapshotRefreshStatus,
  SnapshotSummary,
} from "../bgp-announcement.types.js";
import type { AnnouncementDeviceContext } from "./announcement-context.service.js";
import { getBgpAnnouncementMaxCollectionAgeMinutes } from "../bgp-announcement.gate.js";

export function computeSnapshotCounters(matrix: MatrixResponse, communitySetCount: number): SnapshotCounters {
  const originTargets = matrix.rows.filter((row) => row.targetType === "origin").length;
  const customerTargets = matrix.rows.filter((row) => row.targetType === "customer").length;
  const policyCount = new Set(matrix.rows.map((row) => row.routePolicyName)).size;
  const conflictCount = matrix.rows.reduce((count, row) => {
    const rowConflicts = row.cells.filter((cell) => cell.state === "conflict").length;
    return count + rowConflicts;
  }, 0);

  return {
    originTargets,
    customerTargets,
    upstreamCount: matrix.upstreams.length,
    communitySetCount,
    policyCount,
    conflictCount,
    rowCount: matrix.rows.length,
  };
}

export function computeSnapshotWarnings(
  ctx: AnnouncementDeviceContext,
  matrix: MatrixResponse,
): string[] {
  const warnings: string[] = [];
  const maxAge = getBgpAnnouncementMaxCollectionAgeMinutes();

  if (ctx.source === "collected_config") {
    warnings.push("Fonte primária: collected_config (sem discovery snapshot recente).");
  }

  if (ctx.collectionAgeMinutes !== null && ctx.collectionAgeMinutes > maxAge) {
    warnings.push(`Dados persistidos com ${ctx.collectionAgeMinutes} min — acima do limite de ${maxAge} min.`);
  }

  if (matrix.rows.length === 0) {
    warnings.push("Nenhum target origin/cliente encontrado nos dados persistidos.");
  }

  for (const finding of matrix.findings) {
    if (finding.severity === "critical" || finding.severity === "high") {
      warnings.push(`[${finding.severity}] ${finding.message}`);
    }
  }

  return warnings;
}

export function determineSnapshotStatus(matrix: MatrixResponse): SnapshotRefreshStatus {
  if (matrix.rows.length === 0) return "empty";
  if (matrix.findings.some((finding) => finding.severity === "critical" || finding.severity === "high")) {
    return "partial";
  }
  if (matrix.rows.some((row) => row.cells.some((cell) => cell.state === "conflict"))) {
    return "partial";
  }
  return "ok";
}

export function buildSnapshotRefreshResult(
  snapshotId: number,
  matrix: MatrixResponse,
  counters: SnapshotCounters,
  warnings: string[],
  status: SnapshotRefreshStatus,
  createdAt: Date,
): SnapshotRefreshResult {
  return {
    snapshotId,
    deviceId: matrix.deviceId,
    createdAt: createdAt.toISOString(),
    counters,
    warnings,
    status,
  };
}

export function snapshotSummaryFromMeta(
  row: {
    id: number;
    deviceId: number;
    createdAt: Date;
    rowCount: number;
    metaJson: unknown;
  },
): SnapshotSummary {
  const meta = (row.metaJson ?? {}) as MatrixResponse["meta"] & { findings?: MatrixResponse["findings"] };
  const counters = meta?.counters ?? {
    originTargets: 0,
    customerTargets: 0,
    upstreamCount: 0,
    communitySetCount: 0,
    policyCount: 0,
    conflictCount: 0,
    rowCount: row.rowCount,
  };

  return {
    id: row.id,
    deviceId: row.deviceId,
    createdAt: row.createdAt.toISOString(),
    rowCount: row.rowCount,
    counters,
    conflictCount: counters.conflictCount,
    status: meta?.status ?? (row.rowCount === 0 ? "empty" : "ok"),
    warnings: meta?.warnings ?? [],
  };
}

/** Guard list: refresh path must never import runtime collection modules. */
export const SNAPSHOT_REFRESH_ALLOWED_SOURCES = [
  "discovery_snapshot",
  "collected_config",
] as const;
