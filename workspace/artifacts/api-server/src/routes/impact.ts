import { Router } from "express";
import { requirePermission } from "../lib/auth.js";
import { getRequestSourceIp, logAuditEvent } from "../lib/audit.js";
import {
  analyzeDeviceImpact,
  analyzeInterfaceImpact,
  analyzeL2CircuitImpact,
  analyzeBgpPeerImpact,
  analyzeResourceImpact,
  persistImpactScenario,
  getImpactSummary,
  getScenarios,
  getScenarioDetails,
  acknowledgeScenario,
  resolveScenario,
} from "../modules/impact/impact-analysis.service.js";

const router = Router();

// GET /api/impact/summary — Impact summary
router.get("/impact/summary", requirePermission("impact.read"), async (req, res) => {
  try {
    const summary = await getImpactSummary();
    res.json(summary);
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : "Internal server error" });
  }
});

// POST /api/impact/analyze — Analyze impact
router.post("/impact/analyze", requirePermission("impact.admin"), async (req, res) => {
  try {
    const { targetType, targetId } = req.body;
    if (!targetType || !targetId) {
      res.status(400).json({ error: "targetType and targetId required" });
      return;
    }

    let analysis: any;
    switch (targetType) {
      case "DEVICE":
        analysis = await analyzeDeviceImpact(targetId);
        break;
      case "INTERFACE":
        analysis = await analyzeInterfaceImpact(targetId);
        break;
      case "L2_CIRCUIT":
        analysis = await analyzeL2CircuitImpact(targetId);
        break;
      case "BGP_PEER":
        analysis = await analyzeBgpPeerImpact(targetId);
        break;
      case "RESOURCE":
        analysis = await analyzeResourceImpact(targetId);
        break;
      default:
        res.status(400).json({ error: "Invalid targetType" });
        return;
    }

    const scenarioId = await persistImpactScenario(
      targetType,
      targetId,
      analysis.targetLabel,
      analysis.severity,
      `${targetType} ${targetId} failure analysis`,
      analysis.affectedItems
    );

    await logAuditEvent({
      action: "impact_analyzed",
      objectType: "impact_scenario",
      objectId: String(scenarioId),
      metadata: { targetType, targetId, severity: analysis.severity },
      sourceIp: getRequestSourceIp(req),
    });

    res.status(201).json({
      id: scenarioId,
      ...analysis,
    });
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : "Internal server error" });
  }
});

// GET /api/impact/scenarios — List scenarios
router.get("/impact/scenarios", requirePermission("impact.read"), async (req, res) => {
  try {
    const status = req.query.status as string | undefined;
    const scenarios = await getScenarios(status);
    res.json(scenarios);
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : "Internal server error" });
  }
});

// GET /api/impact/scenarios/:id — Get scenario
router.get("/impact/scenarios/:id", requirePermission("impact.read"), async (req, res) => {
  try {
    const scenario = await getScenarioDetails(Number(req.params.id));
    if (!scenario) {
      res.status(404).json({ error: "Scenario not found" });
      return;
    }
    res.json(scenario);
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : "Internal server error" });
  }
});

// POST /api/impact/scenarios/:id/ack — Acknowledge scenario
router.post("/impact/scenarios/:id/ack", requirePermission("impact.write"), async (req, res) => {
  try {
    await acknowledgeScenario(Number(req.params.id));

    await logAuditEvent({
      action: "scenario_acknowledged",
      objectType: "impact_scenario",
      objectId: String(req.params.id),
      metadata: {},
      sourceIp: getRequestSourceIp(req),
    });

    res.status(204).end();
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : "Internal server error" });
  }
});

// POST /api/impact/scenarios/:id/resolve — Resolve scenario
router.post("/impact/scenarios/:id/resolve", requirePermission("impact.write"), async (req, res) => {
  try {
    await resolveScenario(Number(req.params.id));

    await logAuditEvent({
      action: "scenario_resolved",
      objectType: "impact_scenario",
      objectId: String(req.params.id),
      metadata: {},
      sourceIp: getRequestSourceIp(req),
    });

    res.status(204).end();
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : "Internal server error" });
  }
});

// GET /api/devices/:id/impact — Device impact
router.get("/devices/:id/impact", requirePermission("impact.read"), async (req, res) => {
  try {
    const impact = await analyzeDeviceImpact(Number(req.params.id));
    res.json(impact);
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : "Internal server error" });
  }
});

export default router;
