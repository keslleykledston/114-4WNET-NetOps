import type { Request, Response } from "express";
import { db, devicesTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { env } from "../../lib/env.js";
import { getRequestContext } from "../../lib/request-context.js";
import { getAnnouncementMatrixDiff, getLatestAnnouncementMatrix, listAnnouncementMatrixHistory, refreshAnnouncementMatrixForDevice } from "./bgp-announcements.service.js";
import {
  compileAnnouncementPreview,
  createAnnouncementChangePlanDraft,
  parseAnnouncementPreviewRequest,
} from "./bgp-announcements.preview.service.js";
import {
  cancelAnnouncementPlanExecution,
  executeAnnouncementChangePlanControlled,
  executeAnnouncementChangePlanDryRun,
  executeAnnouncementRollbackControlled,
  executeAnnouncementRollbackDryRun,
  getAnnouncementChangePlan,
  getAnnouncementApproval,
  getAnnouncementExecution,
  getAnnouncementRollback,
  listAnnouncementApprovals,
  listAnnouncementExecutions,
  listAnnouncementChangePlans,
  listAnnouncementRollbacks,
  runAnnouncementChangePlanPostcheck,
  runAnnouncementRollbackPostcheck,
  requestAnnouncementChangePlanApproval,
  requestAnnouncementRollback,
  reviewAnnouncementChangePlanApproval,
  reviewAnnouncementRollback,
} from "./bgp-announcements.approval-execution.service.js";
import { parseAnnouncementChangePlanCreateInput } from "./bgp-announcements.preview.service.js";
import {
  loadAnnouncementCommunitySets,
  loadAnnouncementUpstreamAudit,
  loadAnnouncementUpstreamAuditForCircuit,
  resolveAnnouncementCommunitySets,
} from "./bgp-announcements.insights.service.js";
import { parseAnnouncementCommunityValue } from "./bgp-announcements.matrix-resolver.js";

function parseDeviceId(value: unknown): number | null {
  const parsed = Number(Array.isArray(value) ? value[0] : value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function parseName(value: unknown): string | null {
  const raw = Array.isArray(value) ? value[0] : value;
  const text = typeof raw === "string" ? raw.trim() : "";
  return text.length > 0 ? text : null;
}

function parseMaybeDate(value: unknown): Date | null {
  const text = parseName(value);
  if (!text) return null;
  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function parseChangePlanId(value: unknown): number | null {
  const parsed = Number(Array.isArray(value) ? value[0] : value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

async function assertDevice(deviceId: number): Promise<boolean> {
  const [device] = await db
    .select({ id: devicesTable.id })
    .from(devicesTable)
    .where(eq(devicesTable.id, deviceId))
    .limit(1);
  return Boolean(device);
}

export async function getAnnouncementMatrixLatestHandler(req: Request, res: Response): Promise<void> {
  if (!env.bgpAnnouncementMatrixEnabled) {
    res.status(503).json({ error: "BGP Announcement Matrix disabled by feature flag", code: "MATRIX_DISABLED" });
    return;
  }
  const deviceId = parseDeviceId(req.query.deviceId);
  if (!deviceId) {
    res.status(400).json({ error: "Invalid deviceId" });
    return;
  }

  const result = await getLatestAnnouncementMatrix(deviceId);
  if ("empty" in result && result.empty) {
    res.status(result.message === "Device not found" ? 404 : 200).json(result);
    return;
  }
  res.json(result);
}

export async function postAnnouncementMatrixRefreshHandler(req: Request, res: Response): Promise<void> {
  if (!env.bgpAnnouncementMatrixEnabled) {
    res.status(503).json({ error: "BGP Announcement Matrix disabled by feature flag", code: "MATRIX_DISABLED" });
    return;
  }
  const deviceId = parseDeviceId(req.body?.deviceId ?? req.query.deviceId);
  if (!deviceId) {
    res.status(400).json({ error: "Invalid deviceId" });
    return;
  }

  const [device] = await db
    .select({ id: devicesTable.id })
    .from(devicesTable)
    .where(eq(devicesTable.id, deviceId))
    .limit(1);
  if (!device) {
    res.status(404).json({ error: "Device not found" });
    return;
  }

  const user = getRequestContext()?.user ?? null;
  const result = await refreshAnnouncementMatrixForDevice({
    deviceId,
    requestedBy: user?.id ?? null,
    triggerType: "manual",
  });
  if ("error" in result) {
    res.status(result.status).json({ error: result.error });
    return;
  }
  res.json(result);
}

export async function getAnnouncementCommunitySetsHandler(req: Request, res: Response): Promise<void> {
  const deviceId = parseDeviceId(req.query.deviceId);
  if (!deviceId) {
    res.status(400).json({ error: "Invalid deviceId" });
    return;
  }
  if (!(await assertDevice(deviceId))) {
    res.status(404).json({ error: "Device not found" });
    return;
  }
  const sets = await loadAnnouncementCommunitySets(deviceId);
  res.json(sets ?? []);
}

export async function getAnnouncementCommunitySetHandler(req: Request, res: Response): Promise<void> {
  const deviceId = parseDeviceId(req.query.deviceId);
  const name = parseName(req.params.name);
  if (!deviceId || !name) {
    res.status(400).json({ error: "Invalid deviceId or name" });
    return;
  }
  if (!(await assertDevice(deviceId))) {
    res.status(404).json({ error: "Device not found" });
    return;
  }
  const sets = await loadAnnouncementCommunitySets(deviceId);
  const set = sets?.find((item) => item.name.toLowerCase() === name.toLowerCase()) ?? null;
  if (!set) {
    res.status(404).json({ error: "Community set not found" });
    return;
  }
  res.json(set);
}

export async function postAnnouncementCommunitySetsResolveHandler(req: Request, res: Response): Promise<void> {
  const deviceId = parseDeviceId(req.body?.deviceId ?? req.query.deviceId);
  const communities = Array.isArray(req.body?.communities)
    ? req.body.communities.filter((value: unknown): value is string => typeof value === "string")
    : [];
  if (!deviceId) {
    res.status(400).json({ error: "Invalid deviceId" });
    return;
  }
  if (!(await assertDevice(deviceId))) {
    res.status(404).json({ error: "Device not found" });
    return;
  }
  res.json({
    communities,
    resolved: communities.map((community: string) => parseAnnouncementCommunityValue(community)),
  });
}

export async function postAnnouncementCommunitySetsExactMatchHandler(req: Request, res: Response): Promise<void> {
  const deviceId = parseDeviceId(req.body?.deviceId ?? req.query.deviceId);
  const communities = Array.isArray(req.body?.communities)
    ? req.body.communities.filter((value: unknown): value is string => typeof value === "string")
    : [];
  if (!deviceId) {
    res.status(400).json({ error: "Invalid deviceId" });
    return;
  }
  if (!(await assertDevice(deviceId))) {
    res.status(404).json({ error: "Device not found" });
    return;
  }
  const result = await resolveAnnouncementCommunitySets(deviceId, communities);
  res.json(result ?? { matched: false, matchType: "none", communities: [], desiredCommunities: communities, nearestMatches: [] });
}

export async function getAnnouncementUpstreamsAuditHandler(req: Request, res: Response): Promise<void> {
  const deviceId = parseDeviceId(req.query.deviceId);
  if (!deviceId) {
    res.status(400).json({ error: "Invalid deviceId" });
    return;
  }
  if (!(await assertDevice(deviceId))) {
    res.status(404).json({ error: "Device not found" });
    return;
  }
  const result = await loadAnnouncementUpstreamAudit(deviceId);
  res.json(result ?? { findings: [], byCircuit: {}, totalUpstreamsAudited: 0, totalAuditFindings: 0, totalCriticalAuditFindings: 0, localAsUnknownCount: 0, prependMismatchCount: 0 });
}

export async function getAnnouncementUpstreamAuditByCircuitHandler(req: Request, res: Response): Promise<void> {
  const deviceId = parseDeviceId(req.query.deviceId);
  const circuitId = parseName(req.params.circuitId);
  if (!deviceId || !circuitId) {
    res.status(400).json({ error: "Invalid deviceId or circuitId" });
    return;
  }
  if (!(await assertDevice(deviceId))) {
    res.status(404).json({ error: "Device not found" });
    return;
  }
  const result = await loadAnnouncementUpstreamAuditForCircuit(deviceId, circuitId);
  res.json(result ?? { findings: [], byCircuit: {}, totalUpstreamsAudited: 0, totalAuditFindings: 0, totalCriticalAuditFindings: 0, localAsUnknownCount: 0, prependMismatchCount: 0 });
}

export async function postAnnouncementUpstreamsAuditRunHandler(req: Request, res: Response): Promise<void> {
  const deviceId = parseDeviceId(req.body?.deviceId ?? req.query.deviceId);
  if (!deviceId) {
    res.status(400).json({ error: "Invalid deviceId" });
    return;
  }
  if (!(await assertDevice(deviceId))) {
    res.status(404).json({ error: "Device not found" });
    return;
  }
  const result = await loadAnnouncementUpstreamAudit(deviceId);
  res.json(result ?? { findings: [], byCircuit: {}, totalUpstreamsAudited: 0, totalAuditFindings: 0, totalCriticalAuditFindings: 0, localAsUnknownCount: 0, prependMismatchCount: 0 });
}

export async function postAnnouncementPreviewChangeHandler(req: Request, res: Response): Promise<void> {
  if (!env.bgpAnnouncementPreviewEnabled) {
    res.status(503).json({ error: "BGP Announcement preview disabled by feature flag", code: "PREVIEW_DISABLED" });
    return;
  }
  const input = parseAnnouncementPreviewRequest({
    ...req.body,
    deviceId: req.body?.deviceId ?? req.query.deviceId,
    baseSnapshotId: req.body?.baseSnapshotId ?? req.query.baseSnapshotId,
  } as Record<string, unknown>);
  if (!input) {
    res.status(400).json({ error: "Invalid preview payload" });
    return;
  }
  if (!(await assertDevice(input.deviceId))) {
    res.status(404).json({ error: "Device not found" });
    return;
  }
  const result = await compileAnnouncementPreview({
    ...input,
    requestedBy: getRequestContext()?.user?.id ?? null,
  });
  if ("error" in result) {
    res.status(result.status).json({ error: result.error, code: result.code ?? null });
    return;
  }
  res.json(result);
}

export async function postAnnouncementChangePlansHandler(req: Request, res: Response): Promise<void> {
  const input = parseAnnouncementChangePlanCreateInput(req.body as Record<string, unknown>);
  if (!input) {
    res.status(400).json({ error: "Invalid change-plan payload" });
    return;
  }
  const result = await createAnnouncementChangePlanDraft({
    ...input,
    requestedBy: getRequestContext()?.user?.id ?? null,
  });
  if ("error" in result) {
    res.status(result.status).json({ error: result.error });
    return;
  }
  res.json(result);
}

export async function getAnnouncementChangePlansHandler(req: Request, res: Response): Promise<void> {
  const deviceId = parseDeviceId(req.query.deviceId);
  if (!deviceId) {
    res.status(400).json({ error: "Invalid deviceId" });
    return;
  }
  if (!(await assertDevice(deviceId))) {
    res.status(404).json({ error: "Device not found" });
    return;
  }
  res.json(await listAnnouncementChangePlans(deviceId));
}

export async function getAnnouncementChangePlanByIdHandler(req: Request, res: Response): Promise<void> {
  const changePlanId = parseChangePlanId(req.params.id);
  if (!changePlanId) {
    res.status(400).json({ error: "Invalid change plan id" });
    return;
  }
  const record = await getAnnouncementChangePlan(changePlanId);
  if (!record) {
    res.status(404).json({ error: "Change plan not found" });
    return;
  }
  res.json(record);
}

export async function postAnnouncementChangePlanCancelHandler(req: Request, res: Response): Promise<void> {
  const changePlanId = parseChangePlanId(req.params.id);
  if (!changePlanId) {
    res.status(400).json({ error: "Invalid change plan id" });
    return;
  }
  const record = await cancelAnnouncementPlanExecution(changePlanId);
  if ("error" in record) {
    res.status(record.status).json({ error: record.error, code: record.code ?? null });
    return;
  }
  res.json(record);
}

export async function postAnnouncementChangePlanRequestApprovalHandler(req: Request, res: Response): Promise<void> {
  const changePlanId = parseChangePlanId(req.params.id);
  if (!changePlanId) {
    res.status(400).json({ error: "Invalid change plan id" });
    return;
  }
  const result = await requestAnnouncementChangePlanApproval({
    changePlanId,
    note: typeof req.body?.note === "string" ? req.body.note : null,
  });
  if ("error" in result) {
    res.status(result.status).json({ error: result.error, code: result.code ?? null });
    return;
  }
  res.json({ approvalId: result.id, changePlanId: result.changePlanId, status: result.status });
}

export async function postAnnouncementApprovalApproveHandler(req: Request, res: Response): Promise<void> {
  const approvalId = parseChangePlanId(req.params.id);
  if (!approvalId) {
    res.status(400).json({ error: "Invalid approval id" });
    return;
  }
  const result = await reviewAnnouncementChangePlanApproval({
    approvalId,
    status: "approved",
    reason: typeof req.body?.reason === "string" ? req.body.reason : null,
  });
  if ("error" in result) {
    res.status(result.status).json({ error: result.error, code: result.code ?? null });
    return;
  }
  res.json({ approvalId: result.id, changePlanId: result.changePlanId, status: result.status });
}

export async function postAnnouncementApprovalRejectHandler(req: Request, res: Response): Promise<void> {
  const approvalId = parseChangePlanId(req.params.id);
  if (!approvalId) {
    res.status(400).json({ error: "Invalid approval id" });
    return;
  }
  const result = await reviewAnnouncementChangePlanApproval({
    approvalId,
    status: "rejected",
    reason: typeof req.body?.reason === "string" ? req.body.reason : null,
  });
  if ("error" in result) {
    res.status(result.status).json({ error: result.error, code: result.code ?? null });
    return;
  }
  res.json({ approvalId: result.id, changePlanId: result.changePlanId, status: result.status });
}

export async function getAnnouncementApprovalsHandler(req: Request, res: Response): Promise<void> {
  const deviceId = parseDeviceId(req.query.deviceId);
  const approvals = await listAnnouncementApprovals(deviceId ?? undefined);
  res.json(approvals);
}

export async function getAnnouncementApprovalByIdHandler(req: Request, res: Response): Promise<void> {
  const approvalId = parseChangePlanId(req.params.id);
  if (!approvalId) {
    res.status(400).json({ error: "Invalid approval id" });
    return;
  }
  const approval = await getAnnouncementApproval(approvalId);
  if (!approval) {
    res.status(404).json({ error: "Approval not found" });
    return;
  }
  res.json(approval);
}

export async function postAnnouncementChangePlanDryRunHandler(req: Request, res: Response): Promise<void> {
  const changePlanId = parseChangePlanId(req.params.id);
  if (!changePlanId) {
    res.status(400).json({ error: "Invalid change plan id" });
    return;
  }
  const result = await executeAnnouncementChangePlanDryRun(changePlanId);
  if ("error" in result) {
    res.status(result.status).json({ error: result.error, code: result.code ?? null });
    return;
  }
  res.json(result);
}

export async function getAnnouncementExecutionsHandler(req: Request, res: Response): Promise<void> {
  const deviceId = parseDeviceId(req.query.deviceId);
  const executions = await listAnnouncementExecutions(deviceId ?? undefined);
  res.json(executions);
}

export async function getAnnouncementExecutionByIdHandler(req: Request, res: Response): Promise<void> {
  const executionId = parseChangePlanId(req.params.id);
  if (!executionId) {
    res.status(400).json({ error: "Invalid execution id" });
    return;
  }
  const execution = await getAnnouncementExecution(executionId);
  if (!execution) {
    res.status(404).json({ error: "Execution not found" });
    return;
  }
  res.json(execution);
}

export async function postAnnouncementChangePlanExecuteHandler(req: Request, res: Response): Promise<void> {
  const changePlanId = parseChangePlanId(req.params.id);
  if (!changePlanId) {
    res.status(400).json({ error: "Invalid change plan id" });
    return;
  }
  const result = await executeAnnouncementChangePlanControlled(changePlanId);
  if ("error" in result) {
    res.status(result.status).json({ error: result.error, code: result.code ?? null });
    return;
  }
  if ("blocked" in result && result.blocked) {
    res.status(409).json(result);
    return;
  }
  res.json(result);
}

export async function postAnnouncementChangePlanPostcheckHandler(req: Request, res: Response): Promise<void> {
  const changePlanId = parseChangePlanId(req.params.id);
  if (!changePlanId) {
    res.status(400).json({ error: "Invalid change plan id" });
    return;
  }
  const result = await runAnnouncementChangePlanPostcheck(changePlanId);
  if ("error" in result) {
    res.status(result.status).json({ error: result.error, code: result.code ?? null });
    return;
  }
  res.json(result);
}

export async function getAnnouncementMatrixDiffHandler(req: Request, res: Response): Promise<void> {
  const previousSnapshotId = parseChangePlanId(req.query.previousSnapshotId);
  const currentSnapshotId = parseChangePlanId(req.query.currentSnapshotId);
  if (!previousSnapshotId || !currentSnapshotId) {
    res.status(400).json({ error: "Invalid snapshot ids" });
    return;
  }
  const result = await getAnnouncementMatrixDiff({ previousSnapshotId, currentSnapshotId });
  if (!result) {
    res.status(404).json({ error: "Snapshot diff not found" });
    return;
  }
  res.json(result);
}

export async function getAnnouncementHistoryHandler(req: Request, res: Response): Promise<void> {
  if (!env.bgpAnnouncementTimelapseEnabled) {
    res.status(503).json({ error: "BGP Announcement timelapse disabled by feature flag", code: "TIMELAPSE_DISABLED" });
    return;
  }
  const deviceId = parseDeviceId(req.query.deviceId);
  const result = await listAnnouncementMatrixHistory({
    deviceId: deviceId ?? undefined,
    targetPolicyName: parseName(req.query.targetPolicyName),
    prefix: parseName(req.query.prefix),
    upstreamCircuitId: parseName(req.query.upstreamCircuitId),
    upstreamName: parseName(req.query.upstreamName),
    family: parseName(req.query.family),
    dateFrom: parseMaybeDate(req.query.dateFrom),
    dateTo: parseMaybeDate(req.query.dateTo),
    eventType: parseName(req.query.eventType),
    limit: Math.min(Number.parseInt(String(req.query.limit ?? "200"), 10) || 200, 500),
  });
  res.json(result);
}

export async function postAnnouncementRollbackRequestHandler(req: Request, res: Response): Promise<void> {
  const changePlanId = parseChangePlanId(req.params.id);
  if (!changePlanId) {
    res.status(400).json({ error: "Invalid change plan id" });
    return;
  }
  const result = await requestAnnouncementRollback({
    changePlanId,
    note: typeof req.body?.note === "string" ? req.body.note : null,
  });
  if ("error" in result) {
    res.status(result.status).json({ error: result.error, code: result.code ?? null });
    return;
  }
  res.json(result);
}

export async function getAnnouncementRollbacksHandler(req: Request, res: Response): Promise<void> {
  const deviceId = parseDeviceId(req.query.deviceId);
  res.json(await listAnnouncementRollbacks(deviceId ?? undefined));
}

export async function getAnnouncementRollbackByIdHandler(req: Request, res: Response): Promise<void> {
  const rollbackId = parseChangePlanId(req.params.id);
  if (!rollbackId) {
    res.status(400).json({ error: "Invalid rollback id" });
    return;
  }
  const rollback = await getAnnouncementRollback(rollbackId);
  if (!rollback) {
    res.status(404).json({ error: "Rollback not found" });
    return;
  }
  res.json(rollback);
}

export async function postAnnouncementRollbackApproveHandler(req: Request, res: Response): Promise<void> {
  const rollbackId = parseChangePlanId(req.params.id);
  if (!rollbackId) {
    res.status(400).json({ error: "Invalid rollback id" });
    return;
  }
  const result = await reviewAnnouncementRollback({
    rollbackId,
    status: "approved",
    reason: typeof req.body?.reason === "string" ? req.body.reason : null,
  });
  if ("error" in result) {
    res.status(result.status).json({ error: result.error, code: result.code ?? null });
    return;
  }
  res.json({ rollbackId: result.id, changePlanId: result.changePlanId, status: result.status });
}

export async function postAnnouncementRollbackRejectHandler(req: Request, res: Response): Promise<void> {
  const rollbackId = parseChangePlanId(req.params.id);
  if (!rollbackId) {
    res.status(400).json({ error: "Invalid rollback id" });
    return;
  }
  const result = await reviewAnnouncementRollback({
    rollbackId,
    status: "rejected",
    reason: typeof req.body?.reason === "string" ? req.body.reason : null,
  });
  if ("error" in result) {
    res.status(result.status).json({ error: result.error, code: result.code ?? null });
    return;
  }
  res.json({ rollbackId: result.id, changePlanId: result.changePlanId, status: result.status });
}

export async function postAnnouncementRollbackDryRunHandler(req: Request, res: Response): Promise<void> {
  const rollbackId = parseChangePlanId(req.params.id);
  if (!rollbackId) {
    res.status(400).json({ error: "Invalid rollback id" });
    return;
  }
  const result = await executeAnnouncementRollbackDryRun(rollbackId);
  if ("error" in result) {
    res.status(result.status).json({ error: result.error, code: result.code ?? null });
    return;
  }
  res.json(result);
}

export async function postAnnouncementRollbackExecuteHandler(req: Request, res: Response): Promise<void> {
  const rollbackId = parseChangePlanId(req.params.id);
  if (!rollbackId) {
    res.status(400).json({ error: "Invalid rollback id" });
    return;
  }
  const result = await executeAnnouncementRollbackControlled(rollbackId);
  if ("error" in result) {
    res.status(result.status).json({ error: result.error, code: result.code ?? null });
    return;
  }
  if ("blocked" in result && result.blocked) {
    res.status(409).json(result);
    return;
  }
  res.json(result);
}

export async function postAnnouncementRollbackPostcheckHandler(req: Request, res: Response): Promise<void> {
  const rollbackId = parseChangePlanId(req.params.id);
  if (!rollbackId) {
    res.status(400).json({ error: "Invalid rollback id" });
    return;
  }
  const result = await runAnnouncementRollbackPostcheck(rollbackId);
  if ("error" in result) {
    res.status(result.status).json({ error: result.error, code: result.code ?? null });
    return;
  }
  res.json(result);
}
