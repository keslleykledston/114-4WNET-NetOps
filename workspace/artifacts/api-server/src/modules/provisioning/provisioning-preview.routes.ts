import { Router } from "express";
import { requirePermission } from "../../lib/auth.js";
import { getRequestSourceIp, logAuditEvent } from "../../lib/audit.js";
import {
  exportProvisioningPreview,
  getTemplateSummaryById,
  listTemplateSummaries,
  maskParametersForAudit,
} from "../provisioning/provisioning-preview.service.js";

const router = Router();

router.get("/provisioning/templates", requirePermission("provisioning.read"), (_req, res) => {
  res.json(listTemplateSummaries());
});

router.get("/provisioning/templates/:id", requirePermission("provisioning.read"), (req, res) => {
  const templateId = String(req.params.id);
  const template = getTemplateSummaryById(templateId);
  if (!template) {
    res.status(404).json({ error: "Template not found" });
    return;
  }
  res.json(template);
});

router.post("/provisioning/preview/export", requirePermission("provisioning.read"), async (req, res) => {
  const body = req.body as Record<string, unknown>;
  const deviceId = Number(body.deviceId);
  const templateId = typeof body.templateId === "string" ? body.templateId : "";
  const format = body.format === "json" ? "json" : "markdown";
  const parameters = body.parameters && typeof body.parameters === "object" && !Array.isArray(body.parameters)
    ? body.parameters as Record<string, unknown>
    : {};

  if (!Number.isInteger(deviceId) || deviceId < 1 || !templateId) {
    res.status(400).json({ error: "deviceId and templateId are required" });
    return;
  }

  const exported = await exportProvisioningPreview({
    deviceId,
    templateId,
    parameters,
    format,
    mode: typeof body.mode === "string" ? body.mode : "dry_run",
    maintenanceWindowStart: typeof body.maintenanceWindowStart === "string" ? body.maintenanceWindowStart : null,
    maintenanceWindowEnd: typeof body.maintenanceWindowEnd === "string" ? body.maintenanceWindowEnd : null,
    rollbackPlan: typeof body.rollbackPlan === "string" ? body.rollbackPlan : null,
  });

  if ("error" in exported) {
    res.status(exported.status).json({ error: exported.error });
    return;
  }

  await logAuditEvent({
    action: "provisioning_preview_export",
    objectType: "device",
    objectId: String(deviceId),
    metadata: {
      templateId,
      format: exported.format,
      status: exported.preview.status,
      contentLength: exported.content.length,
      parameters: maskParametersForAudit(templateId, parameters),
    },
    sourceIp: getRequestSourceIp(req),
  });

  res.json(exported);
});

export default router;
