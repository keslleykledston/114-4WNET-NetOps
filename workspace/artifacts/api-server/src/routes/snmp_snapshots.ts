import { Router } from "express";
import { db } from "@workspace/db";
import { devicesTable, snmpSnapshotsTable } from "@workspace/db";
import { and, desc, eq, type SQL } from "drizzle-orm";
import { ListSnmpSnapshotsQueryParams } from "@workspace/api-zod";

const router = Router();

function parseBooleanQuery(value: unknown): boolean | undefined {
  if (value === undefined) return undefined;
  if (value === true || value === "true") return true;
  if (value === false || value === "false") return false;
  return undefined;
}

router.get("/snmp-snapshots", async (req, res) => {
  const query = ListSnmpSnapshotsQueryParams.safeParse(req.query);
  if (!query.success) {
    res.status(400).json({ error: "Invalid query" });
    return;
  }

  const successFilter = parseBooleanQuery(req.query.success);
  if (req.query.success !== undefined && successFilter === undefined) {
    res.status(400).json({ error: "Invalid success filter" });
    return;
  }

  const limit = Math.min(Math.max(query.data.limit ?? 200, 1), 500);
  const conditions: SQL[] = [];

  if (query.data.deviceId !== undefined) {
    conditions.push(eq(snmpSnapshotsTable.deviceId, query.data.deviceId));
  }

  if (successFilter !== undefined) {
    conditions.push(eq(snmpSnapshotsTable.success, successFilter));
  }

  const snapshotsQuery = db
    .select({
      id: snmpSnapshotsTable.id,
      deviceId: snmpSnapshotsTable.deviceId,
      deviceHostname: devicesTable.hostname,
      success: snmpSnapshotsTable.success,
      errorMessage: snmpSnapshotsTable.errorMessage,
      interfacesJson: snmpSnapshotsTable.interfacesJson,
      bgpPeersJson: snmpSnapshotsTable.bgpPeersJson,
      vrfsJson: snmpSnapshotsTable.vrfsJson,
      collectedAt: snmpSnapshotsTable.collectedAt,
    })
    .from(snmpSnapshotsTable)
    .leftJoin(devicesTable, eq(snmpSnapshotsTable.deviceId, devicesTable.id))
    .$dynamic();

  if (conditions.length > 0) {
    snapshotsQuery.where(and(...conditions));
  }

  const snapshots = await snapshotsQuery
    .orderBy(desc(snmpSnapshotsTable.collectedAt))
    .limit(limit);

  res.json(snapshots.map((snapshot) => ({
    ...snapshot,
    collectedAt: snapshot.collectedAt.toISOString(),
  })));
});

export default router;
