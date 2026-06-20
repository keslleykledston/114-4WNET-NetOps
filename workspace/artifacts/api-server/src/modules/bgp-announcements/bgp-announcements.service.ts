import { eq } from "drizzle-orm";
import { db, devicesTable } from "@workspace/db";
import { announcementDiffSummary, compareAnnouncementMatrixPayloads, loadAnnouncementMatrixSnapshotById, loadLatestMatrixSnapshot, latestAnnouncementMatrixDiff, listAnnouncementHistoryEvents, matrixRowsFromSnapshot } from "./bgp-announcements.snapshot.service.js";
import { refreshAnnouncementMatrix } from "./bgp-announcements.refresh.service.js";
import type { AnnouncementMatrixLatestResponse } from "./bgp-announcements.types.js";

function isStale(generatedAt: string | null | undefined): boolean {
  if (!generatedAt) return true;
  const ageMs = Date.now() - new Date(generatedAt).getTime();
  return ageMs > 24 * 60 * 60 * 1000;
}

export async function getLatestAnnouncementMatrix(deviceId: number): Promise<AnnouncementMatrixLatestResponse> {
  const [device] = await db
    .select({ id: devicesTable.id })
    .from(devicesTable)
    .where(eq(devicesTable.id, deviceId))
    .limit(1);
  if (!device) {
    return { empty: true, message: "Device not found", can_refresh: false };
  }

  const latest = await loadLatestMatrixSnapshot(deviceId);
  if (!latest) {
    return {
      empty: true,
      message: "Nenhum snapshot de matriz encontrado",
      can_refresh: true,
    };
  }

  const diff = await latestAnnouncementMatrixDiff(deviceId, latest.id);
  return {
    snapshot_id: latest.id,
    generated_at: latest.generatedAt,
    collection_id: latest.collectionId,
    is_stale: isStale(latest.generatedAt),
    matrix: latest.matrixJson,
    summary: latest.summaryJson,
    diff_summary: diff?.summary ?? announcementDiffSummary([], matrixRowsFromSnapshot(latest)),
    run_id: null,
    status: latest.status as AnnouncementMatrixLatestResponse["status"],
  };
}

export async function refreshAnnouncementMatrixForDevice(input: {
  deviceId: number;
  requestedBy: number | null;
  triggerType: "manual" | "copilot" | "scheduled";
}) {
  return refreshAnnouncementMatrix(input);
}

export async function getAnnouncementMatrixDiff(input: {
  previousSnapshotId: number;
  currentSnapshotId: number;
}) {
  const previous = await loadAnnouncementMatrixSnapshotById(input.previousSnapshotId);
  const current = await loadAnnouncementMatrixSnapshotById(input.currentSnapshotId);
  if (!previous || !current) {
    return null;
  }
  const diff = compareAnnouncementMatrixPayloads(previous.matrixJson, current.matrixJson);
  return {
    ...diff,
    previousSnapshotId: input.previousSnapshotId,
    currentSnapshotId: input.currentSnapshotId,
    deviceId: current.deviceId,
  };
}

export async function listAnnouncementMatrixHistory(input: {
  deviceId?: number;
  targetPolicyName?: string | null;
  prefix?: string | null;
  upstreamCircuitId?: string | null;
  upstreamName?: string | null;
  family?: string | null;
  dateFrom?: Date | null;
  dateTo?: Date | null;
  eventType?: string | null;
  limit?: number;
}) {
  return listAnnouncementHistoryEvents(input);
}

export async function getAnnouncementMatrix(deviceId: number, input?: { search?: string | null }) {
  const latest = await loadLatestMatrixSnapshot(deviceId);
  if (!latest) return "no_snapshot" as const;

  const search = input?.search?.trim().toLowerCase() ?? "";
  const rows = latest.rowsJson.filter((row) => {
    if (!search) return true;
    return [
      row.targetPolicyName,
      row.routePolicyName,
      row.targetType,
      row.family,
      row.source ?? "",
      row.confidence ?? "",
      ...row.affectedPrefixes,
      ...(row.prefixScope ?? []),
      ...row.cells.map((cell) => cell.upstreamName),
      ...row.cells.map((cell) => cell.circuitId),
    ].filter((value): value is string => typeof value === "string").some((value) => value.toLowerCase().includes(search));
  });

  return {
    deviceId,
    snapshotId: latest.id,
    generatedAt: latest.generatedAt,
    rows,
    summary: latest.summaryJson,
    matrix: latest.matrixJson,
  };
}
