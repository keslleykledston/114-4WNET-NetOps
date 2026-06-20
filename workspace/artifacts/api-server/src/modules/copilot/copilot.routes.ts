import { Router } from "express";
import { getRequestContext } from "../../lib/request-context.js";
import { requirePermission, requireRole } from "../../lib/auth.js";
import { assertCopilotEnabled } from "./copilot.gate.js";
import {
  approveCopilotAlias,
  getCopilotAliasStats,
  listCopilotAliasesByStatus,
  listPendingCopilotAliases,
  proposeCopilotAlias,
  rejectCopilotAlias,
} from "./copilot.aliases.service.js";
import { autoProposeAliasCandidates } from "./copilot.alias-suggest.js";
import { getCopilotMessageById, listCopilotSessionsForUser, saveCopilotFeedback } from "./copilot.repository.js";
import { getCopilotInventoryRefreshConfig, isCopilotInventoryRefreshEnabled } from "./copilot.inventory-refresh.js";
import { getCopilotNetboxConfig, isCopilotNetboxEnabled } from "./copilot.netbox-query.js";
import { getCopilotNluConfig, isCopilotNluEnabled, probeCopilotNlu } from "./copilot.nlu.js";
import { getCopilotSshOnDemandConfig, isCopilotSshOnDemandEnabled } from "./copilot.ssh-on-demand.js";
import { askCopilot, getCopilotSkillCatalog, planCopilotQuery } from "./copilot.service.js";
import type { CopilotResponseMode } from "./copilot.types.js";

const router = Router();

function parseMode(value: unknown): CopilotResponseMode | undefined {
  if (value === "quick" || value === "technical" || value === "diagnostic" || value === "action") {
    return value;
  }
  return undefined;
}

router.get("/copilot/netbox/status", requirePermission("devices.read"), async (_req, res) => {
  const gate = assertCopilotEnabled();
  if (!gate.ok) {
    res.status(gate.status).json({ error: gate.message });
    return;
  }

  const config = getCopilotNetboxConfig();
  res.json({
    enabled: isCopilotNetboxEnabled(),
    netboxEnabled: config.netboxEnabled,
    maxMatches: config.maxMatches,
    readOnly: true,
  });
});

router.get("/copilot/inventory/status", requirePermission("devices.read"), async (_req, res) => {
  const gate = assertCopilotEnabled();
  if (!gate.ok) {
    res.status(gate.status).json({ error: gate.message });
    return;
  }

  const config = getCopilotInventoryRefreshConfig();
  res.json({
    enabled: isCopilotInventoryRefreshEnabled(),
    snmpRealEnabled: config.snmpRealEnabled,
    maxDevices: config.maxDevices,
    readOnly: true,
  });
});

router.get("/copilot/ssh/status", requirePermission("devices.read"), async (_req, res) => {
  const gate = assertCopilotEnabled();
  if (!gate.ok) {
    res.status(gate.status).json({ error: gate.message });
    return;
  }

  const config = getCopilotSshOnDemandConfig();
  res.json({
    enabled: isCopilotSshOnDemandEnabled(),
    maxPeersPerDevice: config.maxPeersPerDevice,
    timeoutMs: config.timeoutMs,
    readOnly: true,
  });
});

router.get("/copilot/nlu/status", requirePermission("devices.read"), async (_req, res) => {
  const gate = assertCopilotEnabled();
  if (!gate.ok) {
    res.status(gate.status).json({ error: gate.message });
    return;
  }

  const config = getCopilotNluConfig();
  const probe = config.enabled ? await probeCopilotNlu() : { reachable: false, error: "disabled" };

  res.json({
    enabled: isCopilotNluEnabled(),
    model: config.model,
    minConfidence: config.minConfidence,
    timeoutMs: config.timeoutMs,
    reachable: probe.reachable,
    error: probe.error ?? null,
    readOnly: true,
  });
});

router.get("/copilot/skills", requirePermission("devices.read"), async (req, res) => {
  const gate = assertCopilotEnabled();
  if (!gate.ok) {
    res.status(gate.status).json({ error: gate.message });
    return;
  }

  const tenantIdRaw = req.query.tenantId;
  const tenantId = tenantIdRaw == null ? null : Number(tenantIdRaw);
  res.json({
    skills: await getCopilotSkillCatalog(Number.isFinite(tenantId) ? tenantId : null),
    readOnly: true,
  });
});

router.post("/copilot/query-plan", requirePermission("devices.read"), async (req, res) => {
  const gate = assertCopilotEnabled();
  if (!gate.ok) {
    res.status(gate.status).json({ error: gate.message });
    return;
  }

  const question = typeof req.body?.question === "string" ? req.body.question : "";
  const deviceIdRaw = req.body?.deviceId;
  const deviceId = deviceIdRaw == null ? undefined : Number(deviceIdRaw);

  if (!question.trim()) {
    res.status(400).json({ error: "question is required" });
    return;
  }

  const result = await planCopilotQuery({ question, deviceId });
  res.json(result);
});

router.post("/copilot/ask", requirePermission("devices.read"), async (req, res) => {
  const gate = assertCopilotEnabled();
  if (!gate.ok) {
    res.status(gate.status).json({ error: gate.message });
    return;
  }

  const question = typeof req.body?.question === "string" ? req.body.question : "";
  const deviceIdRaw = req.body?.deviceId;
  const deviceId = deviceIdRaw == null ? undefined : Number(deviceIdRaw);
  const sessionIdRaw = req.body?.sessionId;
  const sessionId = sessionIdRaw == null ? undefined : Number(sessionIdRaw);
  const mode = parseMode(req.body?.mode);
  const user = getRequestContext()?.user ?? null;

  if (!question.trim()) {
    res.status(400).json({ error: "question is required" });
    return;
  }

  if (deviceIdRaw != null && !Number.isFinite(deviceId)) {
    res.status(400).json({ error: "deviceId must be a number" });
    return;
  }

  if (sessionIdRaw != null && !Number.isFinite(sessionId)) {
    res.status(400).json({ error: "sessionId must be a number" });
    return;
  }

  const result = await askCopilot({
    question,
    deviceId,
    mode,
    sessionId,
    userId: user?.id,
  });
  res.json(result);
});

router.post("/copilot/chat", requirePermission("devices.read"), async (req, res) => {
  const gate = assertCopilotEnabled();
  if (!gate.ok) {
    res.status(gate.status).json({ error: gate.message });
    return;
  }

  const question = typeof req.body?.question === "string" ? req.body.question : "";
  const deviceIdRaw = req.body?.deviceId;
  const deviceId = deviceIdRaw == null ? undefined : Number(deviceIdRaw);
  const sessionIdRaw = req.body?.sessionId;
  const sessionId = sessionIdRaw == null ? undefined : Number(sessionIdRaw);
  const mode = parseMode(req.body?.mode) ?? "technical";
  const user = getRequestContext()?.user ?? null;

  if (!question.trim()) {
    res.status(400).json({ error: "question is required" });
    return;
  }

  if (!user) {
    res.status(401).json({ error: "authentication required for chat sessions" });
    return;
  }

  const result = await askCopilot({
    question,
    deviceId,
    mode,
    sessionId,
    userId: user.id,
  });
  res.json(result);
});

router.post("/copilot/feedback", requirePermission("devices.read"), async (req, res) => {
  const gate = assertCopilotEnabled();
  if (!gate.ok) {
    res.status(gate.status).json({ error: gate.message });
    return;
  }

  const user = getRequestContext()?.user ?? null;
  if (!user) {
    res.status(401).json({ error: "authentication required" });
    return;
  }

  const messageId = Number(req.body?.messageId);
  const rating = req.body?.rating;
  const comment = typeof req.body?.comment === "string" ? req.body.comment : undefined;

  if (!Number.isFinite(messageId)) {
    res.status(400).json({ error: "messageId is required" });
    return;
  }

  if (rating !== "useful" && rating !== "incorrect" && rating !== "teach") {
    res.status(400).json({ error: "rating must be useful, incorrect or teach" });
    return;
  }

  const row = await saveCopilotFeedback({ messageId, userId: user.id, rating, comment });

  let aliasProposalId: number | null = null;

  if (rating === "teach" && typeof req.body?.alias === "string" && typeof req.body?.canonicalName === "string") {
    const tenantId = Number(req.body?.tenantId);
    if (Number.isFinite(tenantId)) {
      const proposed = await proposeCopilotAlias({
        tenantId,
        alias: req.body.alias,
        entityType: typeof req.body?.entityType === "string" ? req.body.entityType : "customer",
        canonicalName: req.body.canonicalName,
        createdBy: user.id,
      });
      aliasProposalId = proposed.id;
    }
  }

  if (rating === "incorrect") {
    const tenantId = Number(req.body?.tenantId);
    const question = typeof req.body?.question === "string" ? req.body.question : "";
    if (Number.isFinite(tenantId) && question.trim()) {
      await autoProposeAliasCandidates({
        tenantId,
        question,
        resolvedEntities: [],
        createdBy: user.id,
        source: "incorrect_feedback",
      });
    }
  }

  res.json({ ok: true, feedbackId: row.id, aliasProposalId });
});

router.get("/copilot/sessions", requirePermission("devices.read"), async (req, res) => {
  const gate = assertCopilotEnabled();
  if (!gate.ok) {
    res.status(gate.status).json({ error: gate.message });
    return;
  }

  const user = getRequestContext()?.user ?? null;
  if (!user) {
    res.status(401).json({ error: "authentication required" });
    return;
  }

  const tenantId = Number(req.query.tenantId);
  if (!Number.isFinite(tenantId)) {
    res.status(400).json({ error: "tenantId query param is required" });
    return;
  }

  const sessions = await listCopilotSessionsForUser(user.id, tenantId);
  res.json({ sessions, readOnly: true });
});

router.get("/copilot/aliases/stats", requirePermission("devices.read"), async (req, res) => {
  const gate = assertCopilotEnabled();
  if (!gate.ok) {
    res.status(gate.status).json({ error: gate.message });
    return;
  }

  const tenantId = Number(req.query.tenantId);
  if (!Number.isFinite(tenantId)) {
    res.status(400).json({ error: "tenantId is required" });
    return;
  }

  res.json({ stats: await getCopilotAliasStats(tenantId), readOnly: true });
});

router.get("/copilot/aliases", requirePermission("devices.read"), async (req, res) => {
  const gate = assertCopilotEnabled();
  if (!gate.ok) {
    res.status(gate.status).json({ error: gate.message });
    return;
  }

  const tenantId = Number(req.query.tenantId);
  const status = typeof req.query.status === "string" ? req.query.status : "pending";
  if (!Number.isFinite(tenantId)) {
    res.status(400).json({ error: "tenantId is required" });
    return;
  }

  const aliases = await listCopilotAliasesByStatus(tenantId, status);
  res.json({ aliases, readOnly: true });
});

router.post("/copilot/aliases/suggest", requirePermission("devices.read"), async (req, res) => {
  const gate = assertCopilotEnabled();
  if (!gate.ok) {
    res.status(gate.status).json({ error: gate.message });
    return;
  }

  const user = getRequestContext()?.user ?? null;
  const tenantId = Number(req.body?.tenantId);
  const question = typeof req.body?.question === "string" ? req.body.question : "";
  if (!Number.isFinite(tenantId) || !question.trim()) {
    res.status(400).json({ error: "tenantId and question are required" });
    return;
  }

  const result = await autoProposeAliasCandidates({
    tenantId,
    question,
    resolvedEntities: [],
    createdBy: user?.id ?? null,
    source: "unresolved_entity",
  });

  res.json({ ...result, readOnly: true });
});

router.get("/copilot/aliases/pending", requirePermission("devices.read"), async (req, res) => {
  const gate = assertCopilotEnabled();
  if (!gate.ok) {
    res.status(gate.status).json({ error: gate.message });
    return;
  }

  const tenantId = Number(req.query.tenantId);
  if (!Number.isFinite(tenantId)) {
    res.status(400).json({ error: "tenantId is required" });
    return;
  }

  const aliases = await listPendingCopilotAliases(tenantId);
  res.json({ aliases, readOnly: true });
});

router.post("/copilot/aliases/propose", requirePermission("devices.read"), async (req, res) => {
  const gate = assertCopilotEnabled();
  if (!gate.ok) {
    res.status(gate.status).json({ error: gate.message });
    return;
  }

  const user = getRequestContext()?.user ?? null;
  const tenantId = Number(req.body?.tenantId);
  const alias = typeof req.body?.alias === "string" ? req.body.alias : "";
  const canonicalName = typeof req.body?.canonicalName === "string" ? req.body.canonicalName : "";
  const entityType = typeof req.body?.entityType === "string" ? req.body.entityType : "customer";

  if (!Number.isFinite(tenantId) || !alias.trim() || !canonicalName.trim()) {
    res.status(400).json({ error: "tenantId, alias and canonicalName are required" });
    return;
  }

  const row = await proposeCopilotAlias({
    tenantId,
    alias,
    entityType,
    canonicalName,
    createdBy: user?.id ?? null,
  });
  res.json({ alias: row, status: "pending" });
});

router.post("/copilot/aliases/:id/approve", requireRole(["admin"]), async (req, res) => {
  const gate = assertCopilotEnabled();
  if (!gate.ok) {
    res.status(gate.status).json({ error: gate.message });
    return;
  }

  const user = getRequestContext()?.user ?? null;
  if (!user) {
    res.status(401).json({ error: "authentication required" });
    return;
  }

  const aliasId = Number(req.params.id);
  const tenantId = Number(req.body?.tenantId);
  if (!Number.isFinite(aliasId) || !Number.isFinite(tenantId)) {
    res.status(400).json({ error: "alias id and tenantId are required" });
    return;
  }

  const row = await approveCopilotAlias({ aliasId, tenantId, approvedBy: user.id });
  if (!row) {
    res.status(404).json({ error: "alias not found" });
    return;
  }
  res.json({ alias: row });
});

router.post("/copilot/aliases/:id/reject", requireRole(["admin"]), async (req, res) => {
  const gate = assertCopilotEnabled();
  if (!gate.ok) {
    res.status(gate.status).json({ error: gate.message });
    return;
  }

  const user = getRequestContext()?.user ?? null;
  if (!user) {
    res.status(401).json({ error: "authentication required" });
    return;
  }

  const aliasId = Number(req.params.id);
  const tenantId = Number(req.body?.tenantId);
  if (!Number.isFinite(aliasId) || !Number.isFinite(tenantId)) {
    res.status(400).json({ error: "alias id and tenantId are required" });
    return;
  }

  const row = await rejectCopilotAlias({ aliasId, tenantId, approvedBy: user.id });
  if (!row) {
    res.status(404).json({ error: "alias not found" });
    return;
  }
  res.json({ alias: row });
});

export default router;
