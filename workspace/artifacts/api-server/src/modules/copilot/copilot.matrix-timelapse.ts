import { devicesTable, db } from "@workspace/db";
import { inArray } from "drizzle-orm";
import {
  diffCompactMatrixRows,
  loadLatestMatrixSnapshot,
  loadMatrixSnapshotSince,
  type CompactMatrixRow,
} from "../bgp-announcements/announcement-matrix-snapshot.service.js";
import type { CopilotMatrixTimelapseDiff } from "./copilot.types.js";

function asCompactRows(value: unknown): CompactMatrixRow[] {
  return Array.isArray(value) ? value as CompactMatrixRow[] : [];
}

export async function compareAnnouncementMatrixTimelapse(input: {
  deviceIds: number[];
  sinceHours?: number;
  prefixFilter?: string | null;
}): Promise<CopilotMatrixTimelapseDiff[]> {
  const since = new Date(Date.now() - (input.sinceHours ?? 24) * 3_600_000);
  const devices = await db
    .select({ id: devicesTable.id, hostname: devicesTable.hostname })
    .from(devicesTable)
    .where(inArray(devicesTable.id, input.deviceIds));
  const hostnameById = new Map(devices.map((device) => [device.id, device.hostname]));

  const diffs: CopilotMatrixTimelapseDiff[] = [];

  for (const deviceId of input.deviceIds) {
    const snapshots = await loadMatrixSnapshotSince(deviceId, since);
    if (snapshots.length < 2) {
      const latest = await loadLatestMatrixSnapshot(deviceId);
      if (!latest) continue;
      diffs.push({
        deviceId,
        deviceHostname: hostnameById.get(deviceId) ?? `device-${deviceId}`,
        windowHours: input.sinceHours ?? 24,
        olderAt: null,
        newerAt: latest.createdAt ?? null,
        added: [],
        removed: [],
        changed: [],
        note: "Apenas um snapshot na janela — gere a matriz novamente para habilitar diff.",
      });
      continue;
    }

    const newer = snapshots[0]!;
    const older = snapshots[snapshots.length - 1]!;
    let { added, removed, changed } = diffCompactMatrixRows(
      asCompactRows(older.rowsJson),
      asCompactRows(newer.rowsJson),
    );

    if (input.prefixFilter) {
      const needle = input.prefixFilter.toLowerCase();
      const filterRow = (row: CompactMatrixRow) =>
        row.affectedPrefixes.some((prefix) => prefix.toLowerCase().includes(needle))
        || row.routePolicyName.toLowerCase().includes(needle);
      added = added.filter(filterRow);
      removed = removed.filter(filterRow);
      changed = changed.filter((row) => row.routePolicyName.toLowerCase().includes(needle));
    }

    diffs.push({
      deviceId,
      deviceHostname: hostnameById.get(deviceId) ?? `device-${deviceId}`,
      windowHours: input.sinceHours ?? 24,
      olderAt: older.createdAt ?? null,
      newerAt: newer.createdAt ?? null,
      added: added.slice(0, 12).map((row) => ({
        routePolicyName: row.routePolicyName,
        prefixes: row.affectedPrefixes.slice(0, 4),
        cells: row.cells.map((cell) => `${cell.upstreamName}:${cell.state}`).join(", "),
      })),
      removed: removed.slice(0, 12).map((row) => ({
        routePolicyName: row.routePolicyName,
        prefixes: row.affectedPrefixes.slice(0, 4),
        cells: row.cells.map((cell) => `${cell.upstreamName}:${cell.state}`).join(", "),
      })),
      changed: changed.slice(0, 12),
    });
  }

  return diffs;
}
