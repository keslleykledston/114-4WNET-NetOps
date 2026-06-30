import { Router } from "express";
import { db, l2CircuitsTable, devicesTable, provisioningJobsTable } from "@workspace/db";
import { eq, desc, inArray } from "drizzle-orm";
import { requirePermission } from "../lib/auth.js";

const router = Router();

type CircuitStatus = "UP" | "DEGRADED" | "DOWN";

function circuitTypeLabel(circuitType: string): "L2VC" | "VSI" {
  return circuitType.toLowerCase().includes("vsi") || circuitType.toLowerCase().includes("vpls") ? "VSI" : "L2VC";
}

function buildCircuitStatus(row: {
  operStatus: string | null;
  adminStatus: string | null;
  findings?: unknown;
}) {
  if (String(row.operStatus ?? row.adminStatus ?? "").toUpperCase() === "DOWN") return "DOWN" as const;
  if (String(row.operStatus ?? row.adminStatus ?? "").toUpperCase() === "UP") return "UP" as const;
  return "DEGRADED" as const;
}

async function loadL2CircuitRows() {
  return db
    .select({
      id: l2CircuitsTable.id,
      deviceId: l2CircuitsTable.deviceId,
      circuitType: l2CircuitsTable.circuitType,
      serviceId: l2CircuitsTable.serviceId,
      name: l2CircuitsTable.name,
      description: l2CircuitsTable.description,
      outerVlan: l2CircuitsTable.outerVlan,
      innerVlan: l2CircuitsTable.innerVlan,
      vcId: l2CircuitsTable.vcId,
      vsiName: l2CircuitsTable.vsiName,
      vsiId: l2CircuitsTable.vsiId,
      localInterface: l2CircuitsTable.localInterface,
      parentInterface: l2CircuitsTable.parentInterface,
      peerIp: l2CircuitsTable.peerIp,
      adminStatus: l2CircuitsTable.adminStatus,
      operStatus: l2CircuitsTable.operStatus,
      findings: l2CircuitsTable.findings,
      deviceHostname: devicesTable.hostname,
      deviceSite: devicesTable.site,
    })
    .from(l2CircuitsTable)
    .innerJoin(devicesTable, eq(l2CircuitsTable.deviceId, devicesTable.id))
    .orderBy(desc(l2CircuitsTable.updatedAt))
    .limit(1000);
}

router.get("/stats", requirePermission("provisioning.read"), async (_req, res) => {
  try {
    const rows = await loadL2CircuitRows();

    const circuits = rows.map((row) => {
      const status = buildCircuitStatus(row);
      return {
        id: String(row.id),
        type: circuitTypeLabel(row.circuitType),
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

router.get("/circuits", requirePermission("provisioning.read"), async (_req, res) => {
  try {
    const rows = await loadL2CircuitRows();
    const circuits = rows.map((row) => ({
      id: row.id,
      deviceId: row.deviceId,
      device: row.deviceHostname,
      site: row.deviceSite,
      name: row.name,
      type: circuitTypeLabel(row.circuitType),
      circuitType: row.circuitType,
      status: buildCircuitStatus(row),
      description: row.description,
      outerVlan: row.outerVlan,
      innerVlan: row.innerVlan,
      vcId: row.vcId,
      vsiName: row.vsiName,
      vsiId: row.vsiId,
      localInterface: row.localInterface,
      parentInterface: row.parentInterface,
      peerIp: row.peerIp,
      findings: row.findings,
    }));
    res.json({ total: circuits.length, circuits });
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : "Internal server error" });
  }
});

router.post("/validate", requirePermission("provisioning.read"), async (req, res) => {
  try {
    const leftId = Number(req.body?.leftCircuitId);
    const rightId = Number(req.body?.rightCircuitId);
    if (!Number.isInteger(leftId) || !Number.isInteger(rightId) || leftId <= 0 || rightId <= 0) {
      res.status(400).json({ error: "leftCircuitId and rightCircuitId required" });
      return;
    }

    const rows = await db
      .select({
        id: l2CircuitsTable.id,
        deviceId: l2CircuitsTable.deviceId,
        circuitType: l2CircuitsTable.circuitType,
        name: l2CircuitsTable.name,
        description: l2CircuitsTable.description,
        outerVlan: l2CircuitsTable.outerVlan,
        innerVlan: l2CircuitsTable.innerVlan,
        vcId: l2CircuitsTable.vcId,
        vsiName: l2CircuitsTable.vsiName,
        vsiId: l2CircuitsTable.vsiId,
        localInterface: l2CircuitsTable.localInterface,
        parentInterface: l2CircuitsTable.parentInterface,
        peerIp: l2CircuitsTable.peerIp,
        adminStatus: l2CircuitsTable.adminStatus,
        operStatus: l2CircuitsTable.operStatus,
        findings: l2CircuitsTable.findings,
        deviceHostname: devicesTable.hostname,
        deviceSite: devicesTable.site,
      })
      .from(l2CircuitsTable)
      .innerJoin(devicesTable, eq(l2CircuitsTable.deviceId, devicesTable.id))
      .where(inArray(l2CircuitsTable.id, [leftId, rightId]));

    const left = rows.find((row) => row.id === leftId);
    const right = rows.find((row) => row.id === rightId);
    if (!left || !right) {
      res.status(404).json({ error: "Circuit not found" });
      return;
    }

    const diffs = [
      { field: "tipo", left: left.circuitType, right: right.circuitType, match: left.circuitType === right.circuitType },
      { field: "vlan externa", left: left.outerVlan ?? null, right: right.outerVlan ?? null, match: left.outerVlan === right.outerVlan },
      { field: "vlan interna", left: left.innerVlan ?? null, right: right.innerVlan ?? null, match: left.innerVlan === right.innerVlan },
      { field: "vc-id", left: left.vcId ?? null, right: right.vcId ?? null, match: left.vcId === right.vcId },
      { field: "vsi", left: left.vsiName ?? null, right: right.vsiName ?? null, match: left.vsiName === right.vsiName },
      { field: "interface", left: left.localInterface ?? null, right: right.localInterface ?? null, match: left.localInterface === right.localInterface },
      { field: "peer", left: left.peerIp ?? null, right: right.peerIp ?? null, match: left.peerIp === right.peerIp },
      { field: "status", left: left.operStatus ?? left.adminStatus ?? null, right: right.operStatus ?? right.adminStatus ?? null, match: (left.operStatus ?? left.adminStatus) === (right.operStatus ?? right.adminStatus) },
      { field: "descricao", left: left.description ?? null, right: right.description ?? null, match: left.description === right.description },
    ];

    const blocking = diffs.some((item) => !item.match && (item.field === "vc-id" || item.field === "vsi" || item.field === "vlan externa"));
    const status = blocking ? "BLOCKER" : diffs.some((item) => !item.match) ? "WARN" : "PASS";

    res.json({
      status,
      left: {
        id: left.id,
        deviceId: left.deviceId,
        device: left.deviceHostname,
        site: left.deviceSite,
        name: left.name,
        type: circuitTypeLabel(left.circuitType),
        status: buildCircuitStatus(left),
      },
      right: {
        id: right.id,
        deviceId: right.deviceId,
        device: right.deviceHostname,
        site: right.deviceSite,
        name: right.name,
        type: circuitTypeLabel(right.circuitType),
        status: buildCircuitStatus(right),
      },
      diffs,
      recommendedAction: status === "BLOCKER"
        ? "Corrigir divergência antes de aprovar."
        : status === "WARN"
          ? "Revisar diferenças e validar a necessidade operacional."
          : "Sem divergência relevante.",
    });
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : "Internal server error" });
  }
});

router.post("/drafts", requirePermission("provisioning.write"), async (req, res) => {
  try {
    const circuitIds = Array.isArray(req.body?.circuitIds)
      ? req.body.circuitIds.map((value: unknown) => Number(value)).filter((value: number) => Number.isInteger(value) && value > 0)
      : [];
    const title = String(req.body?.title ?? "").trim();
    const notes = String(req.body?.notes ?? "").trim();
    const validation = req.body?.validation ?? null;
    const edits = Array.isArray(req.body?.edits) ? req.body.edits : [];

    if (circuitIds.length === 0 || !title) {
      res.status(400).json({ error: "title and circuitIds required" });
      return;
    }

    const [job] = await db.insert(provisioningJobsTable).values({
      name: title,
      type: "l2vpn_draft",
      status: "draft",
      serviceType: "l2vpn",
      description: notes || null,
      deviceIds: JSON.stringify(circuitIds),
      parameters: JSON.stringify({
        circuitIds,
        notes,
        validation,
        edits,
        mode: "supervised-draft",
      }),
      parametersJson: JSON.stringify({
        circuitIds,
        notes,
        validation,
        edits,
        mode: "supervised-draft",
      }),
      createdAt: new Date(),
      updatedAt: new Date(),
    } as typeof provisioningJobsTable.$inferInsert).returning();

    res.status(201).json({
      id: job?.id ?? null,
      status: job?.status ?? "draft",
      title,
      circuitIds,
      notes,
      edits,
    });
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : "Internal server error" });
  }
});

export default router;
