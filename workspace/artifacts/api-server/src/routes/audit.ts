import { Router } from "express";
import { and, desc, eq, gte, lte } from "drizzle-orm";
import { auditLogsTable, db } from "@workspace/db";

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
  const rows = await db.select().from(auditLogsTable).where(where).orderBy(desc(auditLogsTable.createdAt)).limit(limit).offset(offset);

  res.json(rows.map((row) => ({
    id: row.id,
    actorId: row.actorId,
    actor: row.actorId ? `user:${row.actorId}` : "local",
    action: row.action,
    objectType: row.objectType,
    objectId: row.objectId,
    metadataJson: row.metadataJson ?? null,
    sourceIp: row.sourceIp,
    createdAt: row.createdAt.toISOString(),
  })));
});

export default router;

