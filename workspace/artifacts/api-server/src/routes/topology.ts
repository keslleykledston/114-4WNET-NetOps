import { Router, type Response } from "express";
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
import { getTopologyGraph } from "../modules/topology/topology-graph.service.js";
import { computeLinkUtilization, computeDeviceInterfacesUtilization } from "../modules/topology/map-link-utilization.service.js";
import {
  activateMapLayout,
  getActiveMapLayout,
  getMapLayout,
  listMapLayouts,
  saveMapLayout,
} from "../modules/topology/topology-map-layout.service.js";

const router = Router();

// GET /api/topology/graph — Loom-friendly graph payload
router.get("/topology/graph", requirePermission("topology.read"), async (req, res) => {
  try {
    const scope = (req.query.scope as string) || "global";
    const scopeId = req.query.scopeId as string | undefined;
    const graph = await getTopologyGraph({
      scope: scope === "site" || scope === "device" ? scope : "global",
      scopeId: scopeId != null && scopeId !== "" ? scopeId : undefined,
    });
    res.json(graph);
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : "Internal server error" });
  }
});

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

// GET /api/topology/device/:id/interface-utilization
router.get("/topology/device/:id/interface-utilization", requirePermission("topology.read"), async (req, res) => {
  try {
    const deviceId = Number(req.params.id);
    if (!Number.isFinite(deviceId) || deviceId <= 0) {
      res.status(400).json({ error: "Invalid device ID" });
      return;
    }
    const interfaces = await computeDeviceInterfacesUtilization(deviceId);
    res.json({ deviceId, interfaces });
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : "Internal server error" });
  }
});

// POST /api/topology/link-utilization — Bandwidth utilization for map links
router.post("/topology/link-utilization", requirePermission("topology.read"), async (req, res) => {
  try {
    const links = Array.isArray(req.body?.links) ? req.body.links : [];
    const parsed = (links as Record<string, unknown>[])
      .map((item) => ({
        linkId: String(item.linkId ?? ""),
        sourceDeviceId: Number(item.sourceDeviceId),
        intfA: String(item.intfA ?? ""),
        targetDeviceId: Number(item.targetDeviceId),
        intfB: String(item.intfB ?? ""),
      }))
      .filter((item: { linkId: string; sourceDeviceId: number; targetDeviceId: number }) =>
        item.linkId && item.sourceDeviceId > 0 && item.targetDeviceId > 0);

    const results = await computeLinkUtilization(parsed);
    res.json({ links: results });
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : "Internal server error" });
  }
});

function noStoreLayout(res: Response) {
  res.set("Cache-Control", "no-store");
}

// GET /api/topology/map-layouts — List saved manual map layouts
router.get("/topology/map-layouts", requirePermission("topology.read"), async (_req, res) => {
  try {
    noStoreLayout(res);
    const layouts = await listMapLayouts();
    res.json({ layouts });
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : "Internal server error" });
  }
});

// GET /api/topology/map-layout/active — Active manual map layout
router.get("/topology/map-layout/active", requirePermission("topology.read"), async (_req, res) => {
  try {
    noStoreLayout(res);
    const layout = await getActiveMapLayout();
    if (!layout) {
      res.json({ layout: null });
      return;
    }
    res.json({ layout });
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : "Internal server error" });
  }
});

// GET /api/topology/map-layouts/:id — Load a saved layout
router.get("/topology/map-layouts/:id", requirePermission("topology.read"), async (req, res) => {
  try {
    noStoreLayout(res);
    const id = Number(req.params.id);
    if (!Number.isFinite(id) || id <= 0) {
      res.status(400).json({ error: "Invalid layout ID" });
      return;
    }
    const layout = await getMapLayout(id);
    if (!layout) {
      res.status(404).json({ error: "Layout not found" });
      return;
    }
    res.json({ layout });
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : "Internal server error" });
  }
});

// POST /api/topology/map-layouts — Save manual map layout
router.post("/topology/map-layouts", requirePermission("topology.admin"), async (req, res) => {
  try {
    const name = String(req.body?.name ?? "Layout principal").trim() || "Layout principal";
    const payload = {
      devices: Array.isArray(req.body?.devices) ? req.body.devices : [],
      links: Array.isArray(req.body?.links) ? req.body.links : [],
      positions:
        req.body?.positions && typeof req.body.positions === "object" && !Array.isArray(req.body.positions)
          ? req.body.positions
          : {},
    };
    const layout = await saveMapLayout({
      id: req.body?.id != null ? Number(req.body.id) : undefined,
      name,
      payload,
      setActive: req.body?.setActive !== false,
    });

    await logAuditEvent({
      action: "topology_map_layout_saved",
      objectType: "topology_layout",
      objectId: String(layout.id),
      metadata: { name: layout.name, nodeCount: payload.devices.length, linkCount: payload.links.length },
      sourceIp: getRequestSourceIp(req),
    });

    res.json({ layout });
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : "Internal server error" });
  }
});

// POST /api/topology/map-layouts/:id/activate — Set layout as active
router.post("/topology/map-layouts/:id/activate", requirePermission("topology.admin"), async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id) || id <= 0) {
      res.status(400).json({ error: "Invalid layout ID" });
      return;
    }
    const layout = await activateMapLayout(id);
    if (!layout) {
      res.status(404).json({ error: "Layout not found" });
      return;
    }
    res.json({ layout });
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : "Internal server error" });
  }
});

export default router;
