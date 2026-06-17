import { Router } from "express";
import { and, desc, eq, gte, lte } from "drizzle-orm";
import { auditLogsTable, bgpPeerCollectionHistoryTable, db } from "@workspace/db";
import { usersTable } from "@workspace/db";
import { devicesTable } from "@workspace/db";

const router = Router();

function parseLimit(value: unknown): number {
  const parsed = Number(value ?? 100);
  if (!Number.isFinite(parsed) || parsed <= 0) return 100;
  return Math.min(parsed, 500);
}

function parseOffset(value: unknown): number {
  const parsed = Number(value ?? 0);
  if (!Number.isFinite(parsed) || parsed < 0) return 0;
  return Math.floor(parsed);
}

function parseDeviceId(value: unknown): number | null {
  if (typeof value !== "string" && typeof value !== "number") return null;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

router.get("/audit-logs", async (req, res) => {
  const action = typeof req.query.action === "string" ? req.query.action.trim() : "";
  const objectType = typeof req.query.objectType === "string" ? req.query.objectType.trim() : "";
  const objectId = typeof req.query.objectId === "string" ? req.query.objectId.trim() : "";
  const dateFrom = typeof req.query.dateFrom === "string" ? new Date(req.query.dateFrom) : null;
  const dateTo = typeof req.query.dateTo === "string" ? new Date(req.query.dateTo) : null;
  const limit = parseLimit(req.query.limit);
  const offset = parseOffset(req.query.offset);

  const filters = [];
  if (action) filters.push(eq(auditLogsTable.action, action));
  if (objectType) filters.push(eq(auditLogsTable.objectType, objectType));
  if (objectId) filters.push(eq(auditLogsTable.objectId, objectId));
  if (dateFrom && !Number.isNaN(dateFrom.getTime())) filters.push(gte(auditLogsTable.createdAt, dateFrom));
  if (dateTo && !Number.isNaN(dateTo.getTime())) filters.push(lte(auditLogsTable.createdAt, dateTo));

  const where = filters.length ? and(...filters) : undefined;
  const rows = await db
    .select({
      id: auditLogsTable.id,
      actorId: auditLogsTable.actorId,
      action: auditLogsTable.action,
      objectType: auditLogsTable.objectType,
      objectId: auditLogsTable.objectId,
      metadataJson: auditLogsTable.metadataJson,
      sourceIp: auditLogsTable.sourceIp,
      createdAt: auditLogsTable.createdAt,
      actorName: usersTable.name,
      actorEmail: usersTable.email,
      actorRole: usersTable.role,
    })
    .from(auditLogsTable)
    .leftJoin(usersTable, eq(auditLogsTable.actorId, usersTable.id))
    .where(where)
    .orderBy(desc(auditLogsTable.createdAt))
    .limit(limit)
    .offset(offset);

  res.json(rows.map((row) => ({
    id: row.id,
    actorId: row.actorId,
    actor: row.actorId ? `${row.actorName ?? `user:${row.actorId}`} <${row.actorEmail ?? "unknown"}>` : "local",
    actorName: row.actorName ?? null,
    actorEmail: row.actorEmail ?? null,
    actorRole: row.actorRole ?? null,
    action: row.action,
    objectType: row.objectType,
    objectId: row.objectId,
    metadataJson: row.metadataJson ?? null,
    sourceIp: row.sourceIp,
    createdAt: row.createdAt.toISOString(),
  })));
});

router.get("/bgp-peer-removals", async (req, res) => {
  const deviceId = parseDeviceId(req.query.deviceId);
  const limit = parseLimit(req.query.limit);
  const offset = parseOffset(req.query.offset);

  const filters = [];
  if (deviceId !== null) filters.push(eq(bgpPeerCollectionHistoryTable.deviceId, deviceId));

  const where = filters.length ? and(...filters) : undefined;

  const rows = await db
    .select({
      id: bgpPeerCollectionHistoryTable.id,
      deviceId: bgpPeerCollectionHistoryTable.deviceId,
      previousSnapshotId: bgpPeerCollectionHistoryTable.previousSnapshotId,
      currentSnapshotId: bgpPeerCollectionHistoryTable.currentSnapshotId,
      collector: bgpPeerCollectionHistoryTable.collector,
      previousPeersJson: bgpPeerCollectionHistoryTable.previousPeersJson,
      currentPeersJson: bgpPeerCollectionHistoryTable.currentPeersJson,
      removedPeersJson: bgpPeerCollectionHistoryTable.removedPeersJson,
      removedCount: bgpPeerCollectionHistoryTable.removedCount,
      createdAt: bgpPeerCollectionHistoryTable.createdAt,
      deviceHostname: devicesTable.hostname,
      deviceIpAddress: devicesTable.ipAddress,
    })
    .from(bgpPeerCollectionHistoryTable)
    .leftJoin(devicesTable, eq(bgpPeerCollectionHistoryTable.deviceId, devicesTable.id))
    .where(where)
    .orderBy(desc(bgpPeerCollectionHistoryTable.createdAt))
    .limit(limit)
    .offset(offset);

  res.json(rows.map((row) => ({
    id: row.id,
    deviceId: row.deviceId,
    deviceHostname: row.deviceHostname ?? null,
    deviceIpAddress: row.deviceIpAddress ?? null,
    previousSnapshotId: row.previousSnapshotId,
    currentSnapshotId: row.currentSnapshotId,
    collector: row.collector,
    removedPeers: Array.isArray(row.removedPeersJson) ? row.removedPeersJson : [],
    removedCount: row.removedCount,
    createdAt: row.createdAt.toISOString(),
  })));
});

export default router;
