import express, { Request, Response, Router } from "express";
import { requirePermission } from "@workspace/auth";
import {
  listTemplateRegistry,
  getTemplateDetail,
  getTemplateVersions,
  diffTemplateVersions,
  exportTemplate,
  getTemplateAuditLogs,
  seedSystemTemplates,
} from "./provisioning-template-registry.service";

const router = Router();

// Seed system templates on first request
let seeded = false;
router.use(async (_req, _res, next) => {
  if (!seeded) {
    seeded = true;
    await seedSystemTemplates().catch((err) => console.error("Seed error:", err));
  }
  next();
});

// GET /provisioning/templates — list all templates
router.get("/templates", requirePermission("provisioning.read"), async (req: Request, res: Response) => {
  try {
    const status = req.query.status ? String(req.query.status) : undefined;
    const vendor = req.query.vendor ? String(req.query.vendor) : undefined;
    const limit = req.query.limit ? Number(req.query.limit) : 100;
    const offset = req.query.offset ? Number(req.query.offset) : 0;

    const templates = await listTemplateRegistry({ status, vendor, limit, offset });
    res.json(templates);
  } catch (err) {
    console.error("List templates error:", err);
    res.status(500).json({ error: "Failed to list templates" });
  }
});

// GET /provisioning/templates/:id — get single template detail
router.get("/templates/:id", requirePermission("provisioning.read"), async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    const actor = (req as any).user?.email || "unknown";
    const ip = req.ip || "unknown";

    const detail = await getTemplateDetail(id, actor, ip);
    res.json(detail);
  } catch (err) {
    if ((err as Error).message.includes("not found")) {
      res.status(404).json({ error: (err as Error).message });
    } else {
      console.error("Get template error:", err);
      res.status(500).json({ error: "Failed to get template" });
    }
  }
});

// GET /provisioning/templates/:id/versions — get template version history
router.get("/templates/:id/versions", requirePermission("provisioning.read"), async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    const versions = await getTemplateVersions(id);
    res.json(versions);
  } catch (err) {
    console.error("Get versions error:", err);
    res.status(500).json({ error: "Failed to get versions" });
  }
});

// GET /provisioning/templates/:id/diff/:vA/:vB — diff between two versions
router.get("/templates/:id/diff/:vA/:vB", requirePermission("provisioning.read"), async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    const vA = req.params.vA;
    const vB = req.params.vB;

    const diffs = await diffTemplateVersions(id, vA, vB);
    res.json(diffs);
  } catch (err) {
    if ((err as Error).message.includes("not found")) {
      res.status(404).json({ error: (err as Error).message });
    } else {
      console.error("Diff error:", err);
      res.status(500).json({ error: "Failed to generate diff" });
    }
  }
});

// GET /provisioning/templates/:id/export — export template
router.get("/templates/:id/export", requirePermission("provisioning.read"), async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    const actor = (req as any).user?.email || "unknown";
    const ip = req.ip || "unknown";

    const exported = await exportTemplate(id, actor, ip);

    // Set response headers for download
    const timestamp = new Date().toISOString().split("T")[0];
    res.setHeader("Content-Type", "application/json");
    res.setHeader("Content-Disposition", `attachment; filename="template-${id}-${timestamp}.json"`);
    res.json(exported);
  } catch (err) {
    if ((err as Error).message.includes("not found")) {
      res.status(404).json({ error: (err as Error).message });
    } else {
      console.error("Export error:", err);
      res.status(500).json({ error: "Failed to export template" });
    }
  }
});

// GET /provisioning/templates/:id/audit — get audit logs
router.get("/templates/:id/audit", requirePermission("provisioning.read"), async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    const logs = await getTemplateAuditLogs(id);

    const formatted = logs.map((log) => ({
      id: log.id,
      actor: log.actor,
      action: log.action,
      createdAt: log.createdAt?.toISOString() || "",
      metadata: log.metadataJson ? JSON.parse(log.metadataJson) : null,
    }));

    res.json(formatted);
  } catch (err) {
    console.error("Get audit logs error:", err);
    res.status(500).json({ error: "Failed to get audit logs" });
  }
});

export const provisioningTemplateRegistryRouter = router;
