import { Router, type Request, type Response } from "express";
import { checkPermission, getSessionUserFromRequest } from "../../lib/auth.js";
import { getRequestSourceIp, logAuditEvent } from "../../lib/audit.js";
import { env } from "../../lib/env.js";
import type { ConfigGeneratorFieldOrigins } from "./config-generator.types.js";
import {
  ConfigGeneratorHttpError,
  createConfigGeneratorTemplateVersion,
  ensureConfigGeneratorSeeded,
  ensureConfigGeneratorWriteAllowed,
  getConfigGeneratorChangeRequest,
  getConfigGeneratorFeatureEnabled,
  getConfigGeneratorRun,
  getConfigGeneratorRunArtifacts,
  getConfigGeneratorTemplateSchema,
  listConfigGeneratorRuns,
  listConfigGeneratorTemplates,
  renderConfigGenerator,
  saveConfigGeneratorRun,
  updateConfigGeneratorTemplate,
  validateConfigGenerator,
} from "./config-generator.service.js";
import {
  getConfigGeneratorPreviewDiff,
  getConfigGeneratorRunDiff,
} from "./config-generator-diff.service.js";
import {
  getConfigGeneratorDeviceContext,
  getConfigGeneratorServiceContext,
  listConfigGeneratorSuggestionDevices,
  listConfigGeneratorSuggestionScope,
  listConfigGeneratorSuggestionTemplates,
} from "./config-generator-suggestions.service.js";
import {
  listConfigGeneratorDiscoveredIds,
  listConfigGeneratorIdRangesCatalog,
  refreshConfigGeneratorIdInventory,
  suggestNextId,
  validateRequestedId,
} from "./config-generator-id-allocator.service.js";
import { ensureTenantExists } from "./config-generator-id-inventory.service.js";

const router = Router();

function disabledResponse() {
  return { code: "CONFIG_GENERATOR_DISABLED", error: "Config Generator disabled" };
}

function writeDisabledResponse() {
  return { allowed: false, code: "CONFIG_WRITE_DISABLED", reason: "CONFIG_WRITE_ENABLED=false. MVP permite apenas geração e preview." };
}

function validationFailedResponse(message: string, details?: Record<string, unknown>) {
  return { code: "VALIDATION_FAILED", error: message, ...(details ? { details } : {}) };
}

async function requireConfigGeneratorAccess(req: Request, permission: string) {
  const user = await getSessionUserFromRequest(req);
  if (!user) return { ok: false as const, status: 403, body: { code: "RBAC_FORBIDDEN", error: "Forbidden" } };
  if (!checkPermission({ role: user.role, permissionsJson: null }, permission)) {
    return { ok: false as const, status: 403, body: { code: "RBAC_FORBIDDEN", error: `Permission denied: ${permission}` } };
  }
  return { ok: true as const, user };
}

function sendConfigGeneratorError(res: Response, error: unknown) {
  if (error instanceof ConfigGeneratorHttpError) {
    res.status(error.status).json({ code: error.code, error: error.message, ...(error.details ? { details: error.details } : {}) });
    return;
  }
  res.status(500).json({ code: "VALIDATION_FAILED", error: error instanceof Error ? error.message : "Config Generator failed" });
}

function parseId(value: string | number | string[] | undefined) {
  const raw = Array.isArray(value) ? value[0] : value;
  const parsed = Number(raw);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function parsePayload(body: Record<string, unknown>) {
  const tenantId = parseId(body.tenantId as string | number | string[] | undefined);
  const deviceId = parseId(body.deviceId as string | number | string[] | undefined);
  const templateId = parseId(body.templateId as string | number | string[] | undefined);
  const templateVersionId = body.templateVersionId == null || body.templateVersionId === ""
    ? null
    : parseId(body.templateVersionId as string | number | string[] | undefined);
  const input = (body.input && typeof body.input === "object" ? body.input : {}) as Record<string, unknown>;
  const fieldOrigins = (body.fieldOrigins && typeof body.fieldOrigins === "object" && !Array.isArray(body.fieldOrigins))
    ? Object.fromEntries(
      Object.entries(body.fieldOrigins as Record<string, unknown>)
        .filter(([, value]) => typeof value === "string" && value.trim().length > 0)
        .map(([key, value]) => [key, String(value).trim()]),
    )
    : {};
  if (!tenantId || !deviceId || !templateId) return null;
  return { tenantId, deviceId, templateId, templateVersionId, input, fieldOrigins: fieldOrigins as ConfigGeneratorFieldOrigins };
}

router.use(async (_req, _res, next) => {
  if (env.configGeneratorEnabled) {
    await ensureConfigGeneratorSeeded().catch(() => undefined);
  }
  next();
});

router.get("/config-generator/templates", async (req, res) => {
  const access = await requireConfigGeneratorAccess(req, "configGenerator.read");
  if (!access.ok) {
    res.status(access.status).json(access.body);
    return;
  }
  if (!env.configGeneratorEnabled) {
    res.status(404).json(disabledResponse());
    return;
  }
  res.json(await listConfigGeneratorTemplates());
});

router.get("/config-generator/suggestions/scope", async (req, res) => {
  const access = await requireConfigGeneratorAccess(req, "configGenerator.read");
  if (!access.ok) {
    res.status(access.status).json(access.body);
    return;
  }
  if (!env.configGeneratorEnabled) {
    res.status(404).json(disabledResponse());
    return;
  }
  res.json(await listConfigGeneratorSuggestionScope());
});

router.get("/config-generator/suggestions/devices", async (req, res) => {
  const access = await requireConfigGeneratorAccess(req, "configGenerator.read");
  if (!access.ok) {
    res.status(access.status).json(access.body);
    return;
  }
  if (!env.configGeneratorEnabled) {
    res.status(404).json(disabledResponse());
    return;
  }
  const tenantId = parseId(req.query.tenantId as string | number | string[] | undefined);
  if (!tenantId) {
    res.status(400).json(validationFailedResponse("tenantId is required"));
    return;
  }
  res.json(await listConfigGeneratorSuggestionDevices(tenantId));
});

router.get("/config-generator/suggestions/device-context", async (req, res) => {
  const access = await requireConfigGeneratorAccess(req, "configGenerator.read");
  if (!access.ok) {
    res.status(access.status).json(access.body);
    return;
  }
  if (!env.configGeneratorEnabled) {
    res.status(404).json(disabledResponse());
    return;
  }
  const tenantId = parseId(req.query.tenantId as string | number | string[] | undefined);
  const deviceId = parseId(req.query.deviceId as string | number | string[] | undefined);
  if (!tenantId || !deviceId) {
    res.status(400).json(validationFailedResponse("tenantId and deviceId are required"));
    return;
  }
  const context = await getConfigGeneratorDeviceContext({ tenantId, deviceId });
  if (!context) {
    res.status(404).json({ code: "TENANT_DEVICE_MISMATCH", error: "Device not in tenant scope" });
    return;
  }
  res.json(context);
});

router.get("/config-generator/suggestions/templates", async (req, res) => {
  const access = await requireConfigGeneratorAccess(req, "configGenerator.read");
  if (!access.ok) {
    res.status(access.status).json(access.body);
    return;
  }
  if (!env.configGeneratorEnabled) {
    res.status(404).json(disabledResponse());
    return;
  }
  const tenantId = parseId(req.query.tenantId as string | number | string[] | undefined);
  const deviceId = parseId(req.query.deviceId as string | number | string[] | undefined);
  const serviceType = typeof req.query.serviceType === "string" ? req.query.serviceType : null;
  const templates = await listConfigGeneratorSuggestionTemplates({ tenantId, deviceId, serviceType });
  res.json(templates);
});

router.get("/config-generator/suggestions/service-context", async (req, res) => {
  const access = await requireConfigGeneratorAccess(req, "configGenerator.read");
  if (!access.ok) {
    res.status(access.status).json(access.body);
    return;
  }
  if (!env.configGeneratorEnabled) {
    res.status(404).json(disabledResponse());
    return;
  }
  const tenantId = parseId(req.query.tenantId as string | number | string[] | undefined);
  const deviceId = parseId(req.query.deviceId as string | number | string[] | undefined);
  const serviceType = typeof req.query.serviceType === "string" ? req.query.serviceType : null;
  const ref = typeof req.query.ref === "string" ? req.query.ref : null;
  if (!tenantId || !deviceId || !serviceType) {
    res.status(400).json(validationFailedResponse("tenantId, deviceId and serviceType are required"));
    return;
  }
  const context = await getConfigGeneratorServiceContext({ tenantId, deviceId, serviceType, ref });
  if (!context) {
    res.status(404).json({ code: "TENANT_DEVICE_MISMATCH", error: "Device not in tenant scope" });
    return;
  }
  res.json(context);
});

router.get("/config-generator/templates/:id/schema", async (req, res) => {
  const access = await requireConfigGeneratorAccess(req, "configGenerator.read");
  if (!access.ok) {
    res.status(access.status).json(access.body);
    return;
  }
  if (!env.configGeneratorEnabled) {
    res.status(404).json(disabledResponse());
    return;
  }
  const templateId = parseId(req.params.id);
  if (!templateId) {
    res.status(400).json({ error: "Invalid template id" });
    return;
  }
  const schema = await getConfigGeneratorTemplateSchema(templateId);
  if (!schema) {
    res.status(404).json({ code: "VALIDATION_FAILED", error: "Template not found" });
    return;
  }
  res.json(schema);
});

router.post("/config-generator/validate", async (req, res) => {
  const access = await requireConfigGeneratorAccess(req, "configGenerator.validate");
  if (!access.ok) {
    res.status(access.status).json(access.body);
    return;
  }
  if (!env.configGeneratorEnabled) {
    res.status(404).json(disabledResponse());
    return;
  }
  const payload = parsePayload(req.body ?? {});
  if (!payload) {
    res.status(400).json(validationFailedResponse("tenantId, deviceId and templateId are required"));
    return;
  }
  try {
    res.json(await validateConfigGenerator(payload));
  } catch (error) {
    sendConfigGeneratorError(res, error);
  }
});

router.post("/config-generator/render", async (req, res) => {
  const access = await requireConfigGeneratorAccess(req, "configGenerator.render");
  if (!access.ok) {
    res.status(access.status).json(access.body);
    return;
  }
  if (!env.configGeneratorEnabled) {
    res.status(404).json(disabledResponse());
    return;
  }
  const payload = parsePayload(req.body ?? {});
  if (!payload) {
    res.status(400).json(validationFailedResponse("tenantId, deviceId and templateId are required"));
    return;
  }
  try {
    res.json(await renderConfigGenerator(payload, access.user.id));
  } catch (error) {
    sendConfigGeneratorError(res, error);
  }
});

router.post("/config-generator/diff", async (req, res) => {
  const access = await requireConfigGeneratorAccess(req, "configGenerator.render");
  if (!access.ok) {
    res.status(access.status).json(access.body);
    return;
  }
  if (!env.configGeneratorEnabled) {
    res.status(404).json(disabledResponse());
    return;
  }
  const payload = parsePayload(req.body ?? {});
  if (!payload) {
    res.status(400).json(validationFailedResponse("tenantId, deviceId and templateId are required"));
    return;
  }
  try {
    res.json(await getConfigGeneratorPreviewDiff(payload));
  } catch (error) {
    sendConfigGeneratorError(res, error);
  }
});

router.post("/config-generator/runs", async (req, res) => {
  const access = await requireConfigGeneratorAccess(req, "configGenerator.write");
  if (!access.ok) {
    res.status(access.status).json(access.body);
    return;
  }
  if (!env.configGeneratorEnabled) {
    res.status(404).json(disabledResponse());
    return;
  }
  const payload = parsePayload(req.body ?? {});
  if (!payload) {
    res.status(400).json(validationFailedResponse("tenantId, deviceId and templateId are required"));
    return;
  }
  try {
    res.json(await saveConfigGeneratorRun(payload, access.user.id));
  } catch (error) {
    sendConfigGeneratorError(res, error);
  }
});

router.get("/config-generator/runs", async (req, res) => {
  const access = await requireConfigGeneratorAccess(req, "configGenerator.read");
  if (!access.ok) {
    res.status(access.status).json(access.body);
    return;
  }
  if (!env.configGeneratorEnabled) {
    res.status(404).json(disabledResponse());
    return;
  }
  const tenantId = parseId(req.query.tenantId as string | number | string[] | undefined);
  const deviceId = parseId(req.query.deviceId as string | number | string[] | undefined);
  const limit = parseId(req.query.limit as string | number | string[] | undefined) ?? 20;
  res.json(await listConfigGeneratorRuns({ tenantId: tenantId ?? undefined, deviceId: deviceId ?? undefined, limit }));
});

router.get("/config-generator/runs/:id", async (req, res) => {
  const access = await requireConfigGeneratorAccess(req, "configGenerator.read");
  if (!access.ok) {
    res.status(access.status).json(access.body);
    return;
  }
  if (!env.configGeneratorEnabled) {
    res.status(404).json(disabledResponse());
    return;
  }
  const runId = parseId(req.params.id);
  if (!runId) {
    res.status(400).json(validationFailedResponse("Invalid run id"));
    return;
  }
  const run = await getConfigGeneratorRun(runId);
  if (!run) {
    res.status(404).json({ code: "RUN_NOT_FOUND", error: "Run not found" });
    return;
  }
  res.json(run);
});

router.get("/config-generator/runs/:id/artifacts", async (req, res) => {
  const access = await requireConfigGeneratorAccess(req, "configGenerator.read");
  if (!access.ok) {
    res.status(access.status).json(access.body);
    return;
  }
  if (!env.configGeneratorEnabled) {
    res.status(404).json(disabledResponse());
    return;
  }
  const runId = parseId(req.params.id);
  if (!runId) {
    res.status(400).json(validationFailedResponse("Invalid run id"));
    return;
  }
  res.json(await getConfigGeneratorRunArtifacts(runId));
});

router.post("/config-generator/runs/:id/diff", async (req, res) => {
  const access = await requireConfigGeneratorAccess(req, "configGenerator.read");
  if (!access.ok) {
    res.status(access.status).json(access.body);
    return;
  }
  if (!env.configGeneratorEnabled) {
    res.status(404).json(disabledResponse());
    return;
  }
  const runId = parseId(req.params.id);
  if (!runId) {
    res.status(400).json(validationFailedResponse("Invalid run id"));
    return;
  }
  const diff = await getConfigGeneratorRunDiff(runId);
  if (!diff) {
    res.status(404).json({ code: "RUN_NOT_FOUND", error: "Run not found" });
    return;
  }
  res.json(diff);
});

router.post("/config-generator/templates/:id/versions", async (req, res) => {
  const access = await requireConfigGeneratorAccess(req, "configGenerator.admin");
  if (!access.ok) {
    res.status(access.status).json(access.body);
    return;
  }
  if (!env.configGeneratorEnabled) {
    res.status(404).json(disabledResponse());
    return;
  }
  const templateId = parseId(req.params.id);
  if (!templateId) {
    res.status(400).json(validationFailedResponse("Invalid template id"));
    return;
  }
  const body = req.body as Record<string, unknown>;
  if (typeof body.version !== "string" || typeof body.content !== "string" || typeof body.renderer !== "string" || !body.schemaJson || typeof body.schemaJson !== "object") {
    res.status(400).json(validationFailedResponse("version, content, renderer and schemaJson are required"));
    return;
  }
  const created = await createConfigGeneratorTemplateVersion({
    templateId,
    version: body.version,
    content: body.content,
    schemaJson: body.schemaJson as Record<string, unknown>,
    renderer: body.renderer,
    createdBy: access.user.id,
  });
  if (!created) {
    res.status(500).json({ code: "VALIDATION_FAILED", error: "Failed to create template version" });
    return;
  }
  await logAuditEvent({
    actorId: access.user.id,
    action: "config_generator_template_version_created",
    objectType: "config_generator_template",
    objectId: String(templateId),
    metadata: { templateId, version: body.version, renderer: body.renderer },
    sourceIp: getRequestSourceIp(req),
  });
  res.status(201).json(created);
});

router.patch("/config-generator/templates/:id", async (req, res) => {
  const access = await requireConfigGeneratorAccess(req, "configGenerator.admin");
  if (!access.ok) {
    res.status(access.status).json(access.body);
    return;
  }
  if (!env.configGeneratorEnabled) {
    res.status(404).json(disabledResponse());
    return;
  }
  const templateId = parseId(req.params.id);
  if (!templateId) {
    res.status(400).json(validationFailedResponse("Invalid template id"));
    return;
  }
  const body = req.body as Record<string, unknown>;
  const updated = await updateConfigGeneratorTemplate(templateId, {
    isActive: typeof body.isActive === "boolean" ? body.isActive : undefined,
  });
  if (!updated) {
    res.status(404).json({ code: "VALIDATION_FAILED", error: "Template not found" });
    return;
  }
  await logAuditEvent({
    actorId: access.user.id,
    action: "config_generator_template_updated",
    objectType: "config_generator_template",
    objectId: String(templateId),
    metadata: { isActive: updated.isActive },
    sourceIp: getRequestSourceIp(req),
  });
  res.json(updated);
});

router.post("/config-generator/runs/:id/request-approval", async (_req, res) => {
  const access = await requireConfigGeneratorAccess(_req, "configGenerator.admin");
  if (!access.ok) {
    res.status(access.status).json(access.body);
    return;
  }
  const result = await ensureConfigGeneratorWriteAllowed();
  if (!result.allowed) {
    res.status(409).json(writeDisabledResponse());
    return;
  }
  res.status(501).json(writeDisabledResponse());
});

router.post("/config-generator/change-requests/:id/approve", async (_req, res) => {
  const access = await requireConfigGeneratorAccess(_req, "configGenerator.admin");
  if (!access.ok) {
    res.status(access.status).json(access.body);
    return;
  }
  const result = await ensureConfigGeneratorWriteAllowed();
  if (!result.allowed) {
    res.status(409).json(writeDisabledResponse());
    return;
  }
  res.status(501).json(writeDisabledResponse());
});

router.post("/config-generator/change-requests/:id/execute", async (_req, res) => {
  const access = await requireConfigGeneratorAccess(_req, "configGenerator.admin");
  if (!access.ok) {
    res.status(access.status).json(access.body);
    return;
  }
  const result = await ensureConfigGeneratorWriteAllowed();
  if (!result.allowed) {
    res.status(409).json(writeDisabledResponse());
    return;
  }
  res.status(501).json(writeDisabledResponse());
});

router.get("/config-generator/change-requests/:id", async (req, res) => {
  const access = await requireConfigGeneratorAccess(req, "configGenerator.read");
  if (!access.ok) {
    res.status(access.status).json(access.body);
    return;
  }
  if (!env.configGeneratorEnabled) {
    res.status(404).json(disabledResponse());
    return;
  }
  const runId = parseId(req.params.id);
  if (!runId) {
    res.status(400).json(validationFailedResponse("Invalid change request id"));
    return;
  }
  const changeRequest = await getConfigGeneratorChangeRequest(runId);
  if (!changeRequest) {
    res.status(404).json({ code: "RUN_NOT_FOUND", error: "Change request not found" });
    return;
  }
  res.json(changeRequest);
});

router.get("/config-generator/feature", async (req, res) => {
  const access = await requireConfigGeneratorAccess(req, "configGenerator.read");
  if (!access.ok) {
    res.status(access.status).json(access.body);
    return;
  }
  res.json({ enabled: await getConfigGeneratorFeatureEnabled() });
});

router.get("/config-generator/id-ranges", async (req, res) => {
  const access = await requireConfigGeneratorAccess(req, "configGenerator.read");
  if (!access.ok) {
    res.status(access.status).json(access.body);
    return;
  }
  if (!env.configGeneratorEnabled) {
    res.status(404).json(disabledResponse());
    return;
  }
  res.json(listConfigGeneratorIdRangesCatalog());
});

router.get("/config-generator/id-inventory", async (req, res) => {
  const access = await requireConfigGeneratorAccess(req, "configGenerator.read");
  if (!access.ok) {
    res.status(access.status).json(access.body);
    return;
  }
  if (!env.configGeneratorEnabled) {
    res.status(404).json(disabledResponse());
    return;
  }
  const tenantId = parseId(req.query.tenantId as string | number | string[] | undefined);
  const deviceId = parseId(req.query.deviceId as string | number | string[] | undefined);
  const idType = typeof req.query.idType === "string" ? req.query.idType : undefined;
  const siteCode = typeof req.query.siteCode === "string" ? req.query.siteCode : undefined;
  if (!tenantId) {
    res.status(400).json(validationFailedResponse("tenantId is required"));
    return;
  }
  const rows = await listConfigGeneratorDiscoveredIds({
    tenantId,
    deviceId: deviceId ?? undefined,
    siteCode,
    idType: idType as "vlan" | "subinterface" | "l2vc" | "vsi" | undefined,
  });
  const summary: Record<string, number[]> = {};
  for (const type of ["vlan", "subinterface", "l2vc", "vsi"] as const) {
    summary[type] = [...new Set(rows.filter((row) => row.idType === type).map((row) => row.idValue))].sort((a, b) => a - b);
  }
  res.json({
    tenantId,
    siteCode: siteCode ?? null,
    deviceId: deviceId ?? null,
    idType: idType ?? null,
    items: rows.map((row) => ({
      id: row.id,
      tenantId: row.tenantId,
      siteCode: row.siteCode,
      deviceId: row.deviceId,
      idType: row.idType,
      idValue: row.idValue,
      parentInterface: row.parentInterface,
      interfaceName: row.interfaceName,
      serviceType: row.serviceType,
      serviceName: row.serviceName,
      status: row.status,
      source: row.source,
      confidence: row.confidence,
      lastSeenAt: row.lastSeenAt.toISOString(),
    })),
    summary,
  });
});

router.post("/config-generator/id-inventory/refresh", async (req, res) => {
  const access = await requireConfigGeneratorAccess(req, "configGenerator.validate");
  if (!access.ok) {
    res.status(access.status).json(access.body);
    return;
  }
  if (!env.configGeneratorEnabled) {
    res.status(404).json(disabledResponse());
    return;
  }
  const body = req.body as Record<string, unknown>;
  const tenantId = parseId(body.tenantId as string | number | string[] | undefined);
  const deviceId = parseId(body.deviceId as string | number | string[] | undefined);
  const siteCode = typeof body.siteCode === "string" ? body.siteCode : undefined;
  if (!tenantId) {
    res.status(400).json(validationFailedResponse("tenantId is required"));
    return;
  }
  if (!(await ensureTenantExists(tenantId))) {
    res.status(404).json({ code: "TENANT_DEVICE_MISMATCH", error: "Tenant not found" });
    return;
  }
  const result = await refreshConfigGeneratorIdInventory({ tenantId, deviceId, siteCode });
  await logAuditEvent({
    actorId: access.user.id,
    action: "config_generator_id_inventory_refresh",
    objectType: "config_generator_id_inventory",
    objectId: String(tenantId),
    metadata: { tenantId, deviceId, siteCode, ...result },
    sourceIp: getRequestSourceIp(req),
  });
  res.json({ ok: true, ...result, message: "Inventário reprocessado a partir de dados existentes (sem coleta em device)." });
});

router.post("/config-generator/id-allocator/suggest", async (req, res) => {
  const access = await requireConfigGeneratorAccess(req, "configGenerator.read");
  if (!access.ok) {
    res.status(access.status).json(access.body);
    return;
  }
  if (!env.configGeneratorEnabled) {
    res.status(404).json(disabledResponse());
    return;
  }
  const body = req.body as Record<string, unknown>;
  const tenantId = parseId(body.tenantId as string | number | string[] | undefined);
  const deviceId = parseId(body.deviceId as string | number | string[] | undefined);
  const serviceType = typeof body.serviceType === "string" ? body.serviceType.trim() : "";
  const siteCode = typeof body.siteCode === "string" ? body.siteCode : undefined;
  const parentInterface = typeof body.parentInterface === "string" ? body.parentInterface : undefined;
  if (!tenantId || !serviceType) {
    res.status(400).json(validationFailedResponse("tenantId and serviceType are required"));
    return;
  }
  res.json(await suggestNextId({ tenantId, deviceId, serviceType, siteCode, parentInterface }));
});

router.post("/config-generator/id-allocator/validate", async (req, res) => {
  const access = await requireConfigGeneratorAccess(req, "configGenerator.validate");
  if (!access.ok) {
    res.status(access.status).json(access.body);
    return;
  }
  if (!env.configGeneratorEnabled) {
    res.status(404).json(disabledResponse());
    return;
  }
  const body = req.body as Record<string, unknown>;
  const tenantId = parseId(body.tenantId as string | number | string[] | undefined);
  const deviceId = parseId(body.deviceId as string | number | string[] | undefined);
  const serviceType = typeof body.serviceType === "string" ? body.serviceType.trim() : "";
  if (!tenantId || !serviceType) {
    res.status(400).json(validationFailedResponse("tenantId and serviceType are required"));
    return;
  }
  const parseOptionalInt = (value: unknown) => {
    if (value == null || value === "") return null;
    const parsed = Number(value);
    return Number.isInteger(parsed) ? parsed : null;
  };
  res.json(await validateRequestedId({
    tenantId,
    deviceId,
    siteCode: typeof body.siteCode === "string" ? body.siteCode : null,
    serviceType,
    parentInterface: typeof body.parentInterface === "string" ? body.parentInterface : null,
    vlan: parseOptionalInt(body.vlan),
    subinterfaceId: parseOptionalInt(body.subinterfaceId),
    l2vcId: parseOptionalInt(body.l2vcId),
    vsiId: parseOptionalInt(body.vsiId),
  }));
});

export default router;
