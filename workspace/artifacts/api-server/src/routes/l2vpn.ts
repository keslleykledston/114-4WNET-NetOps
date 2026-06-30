import { Router } from "express";
import { db, l2CircuitsTable, devicesTable } from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import { requirePermission } from "../lib/auth.js";

const router = Router();

type CircuitStatus = "UP" | "DEGRADED" | "DOWN";

function normalizeStatus(status: string | null | undefined): CircuitStatus {
  const value = String(status ?? "").toUpperCase();
  if (value === "UP") return "UP";
  if (value === "DOWN") return "DOWN";
  return "DEGRADED";
}

router.get("/stats", requirePermission("provisioning.read"), async (_req, res) => {
  try {
    const rows = await db
      .select({
        id: l2CircuitsTable.id,
        circuitType: l2CircuitsTable.circuitType,
        name: l2CircuitsTable.name,
        description: l2CircuitsTable.description,
        outerVlan: l2CircuitsTable.outerVlan,
        vsiName: l2CircuitsTable.vsiName,
        peerIp: l2CircuitsTable.peerIp,
        operStatus: l2CircuitsTable.operStatus,
        adminStatus: l2CircuitsTable.adminStatus,
        deviceId: l2CircuitsTable.deviceId,
        deviceHostname: devicesTable.hostname,
        deviceSite: devicesTable.site,
      })
      .from(l2CircuitsTable)
      .innerJoin(devicesTable, eq(l2CircuitsTable.deviceId, devicesTable.id))
      .orderBy(desc(l2CircuitsTable.updatedAt))
      .limit(500);

    const circuits = rows.map((row) => {
      const status = normalizeStatus(row.operStatus ?? row.adminStatus);
      return {
        id: String(row.id),
        type: row.circuitType.toUpperCase().includes("VSI") ? "VSI" : "L2VC",
        siteA: `${row.deviceSite ?? "site"} / ${row.deviceHostname ?? `device-${row.deviceId}`}`,
        siteB: row.peerIp ?? row.vsiName ?? row.outerVlan?.toString() ?? row.description ?? row.name,
        status,
      } as const;
    });

    const total = circuits.length;
    const up = circuits.filter((item) => item.status === "UP").length;
    const degraded = circuits.filter((item) => item.status === "DEGRADED").length;
    const down = circuits.filter((item) => item.status === "DOWN").length;

    res.json({ total, up, degraded, down, circuits });
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : "Internal server error" });
  }
});

export default router;
