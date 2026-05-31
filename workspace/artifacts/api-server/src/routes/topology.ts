import { Router } from "express";
import { requirePermission } from "../lib/auth.js";
import { getRequestSourceIp, logAuditEvent } from "../lib/audit.js";
import {
  buildTopology,
  buildDeviceTopology,
  buildSiteTopology,
  getTopologySummary,
  getDeviceTopology,
  clearTopology,
} from "../modules/topology/topology-builder.service.js";
import { detectOrphans, getOrphansSummary } from "../modules/topology/topology-orphans.service.js";

const router = Router();

// GET /api/topology/summary — Topology summary
router.get("/topology/summary", requirePermission("topology.read"), async (req, res) => {
  try {
    const summary = await getTopologySummary();
    res.json(summary);
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : "Internal server error" });
  }
});

// GET /api/topology/device/:id — Device topology
router.get("/topology/device/:id", requirePermission("topology.read"), async (req, res) => {
  try {
    const deviceId = Number(req.params.id);
    const topology = await getDeviceTopology(deviceId);
    if (!topology) {
      res.status(404).json({ error: "Device not found in topology" });
      return;
    }
    res.json(topology);
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : "Internal server error" });
  }
});

// POST /api/topology/rebuild — Rebuild topology
router.post("/topology/rebuild", requirePermission("topology.admin"), async (req, res) => {
  try {
    const scope = req.body.scope || "global";
    const scopeId = req.body.scopeId;

    if (scope === "device" && scopeId) {
      await buildDeviceTopology(scopeId);
    } else if (scope === "site" && scopeId) {
      await buildSiteTopology(scopeId);
    } else {
      await buildTopology();
    }

    await logAuditEvent({
      action: "topology_rebuilt",
      objectType: "topology",
      objectId: scope,
      metadata: { scope, scopeId },
      sourceIp: getRequestSourceIp(req),
    });

    const summary = await getTopologySummary();
    res.json({ status: "rebuilt", ...summary });
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : "Internal server error" });
  }
});

// GET /api/topology/orphans — Detect orphans
router.get("/topology/orphans", requirePermission("topology.read"), async (req, res) => {
  try {
    const orphans = await detectOrphans();
    res.json(orphans);
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : "Internal server error" });
  }
});

// GET /api/topology/orphans/summary — Orphans summary
router.get("/topology/orphans/summary", requirePermission("topology.read"), async (req, res) => {
  try {
    const summary = await getOrphansSummary();
    res.json(summary);
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : "Internal server error" });
  }
});

// POST /api/topology/clear — Clear topology
router.post("/topology/clear", requirePermission("topology.admin"), async (req, res) => {
  try {
    await clearTopology();

    await logAuditEvent({
      action: "topology_cleared",
      objectType: "topology",
      objectId: "global",
      metadata: {},
      sourceIp: getRequestSourceIp(req),
    });

    res.json({ status: "cleared" });
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : "Internal server error" });
  }
});

export default router;
