import type { Request, Response } from "express";
import { getRequestSourceIp, logAuditEvent } from "../../lib/audit.js";
import { getRequestContext } from "../../lib/request-context.js";
import { createScheduledJob, deleteScheduledJob, enableScheduledJob, getScheduledJob, getScheduledJobRunDetail, listScheduledJobRunItems, listScheduledJobRuns, listScheduledJobs, runScheduledJob, updateScheduledJob } from "./scheduler.service.js";
import type { ScheduledJobTargetType, ScheduledJobType } from "./scheduler.types.js";

function parseId(value: string | string[] | undefined): number | null {
  const raw = Array.isArray(value) ? value[0] : value;
  const parsed = Number(raw);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function jsonBody(req: Request): Record<string, unknown> {
  return req.body && typeof req.body === "object" ? req.body as Record<string, unknown> : {};
}

function isAdmin() {
  return getRequestContext()?.user?.role === "admin";
}

function isOperatorOrAdmin() {
  const role = getRequestContext()?.user?.role;
  return role === "admin" || role === "operator";
}

function ensureRole(res: Response, allowed: boolean) {
  if (!allowed) {
    res.status(403).json({ error: "Forbidden" });
    return false;
  }
  return true;
}

export async function listSchedulerJobsHandler(_req: Request, res: Response) {
  res.json(await listScheduledJobs());
}

export async function createSchedulerJobHandler(req: Request, res: Response) {
  if (!ensureRole(res, isAdmin())) return;
  const body = jsonBody(req);
  const job = await createScheduledJob({
    name: String(body.name ?? "").trim(),
    description: typeof body.description === "string" ? body.description : null,
    jobType: body.jobType as ScheduledJobType,
    targetType: body.targetType as ScheduledJobTargetType,
    targetId: typeof body.targetId === "number" ? body.targetId : Number.isFinite(Number(body.targetId)) ? Number(body.targetId) : null,
    contextsJson: body.contextsJson ?? body.contexts ?? [],
    cronExpression: typeof body.cronExpression === "string" ? body.cronExpression : null,
    intervalMinutes: Number(body.intervalMinutes ?? 60),
    enabled: body.enabled !== false,
    runOnStartup: Boolean(body.runOnStartup),
    maxRuntimeSeconds: Number(body.maxRuntimeSeconds ?? 3600),
    createdBy: getRequestContext()?.actorId ?? null,
  });
  if (!job) {
    res.status(400).json({ error: "Could not create scheduled job" });
    return;
  }
  await logAuditEvent({
    actorId: getRequestContext()?.actorId ?? null,
    action: "scheduled_job_created",
    objectType: "scheduled_job",
    objectId: String(job.id),
    metadata: { jobType: job.jobType, targetType: job.targetType, targetId: job.targetId, enabled: job.enabled },
    sourceIp: getRequestSourceIp(req),
  });
  res.status(201).json(job);
}

export async function getSchedulerJobHandler(req: Request, res: Response) {
  const id = parseId(req.params.id);
  if (!id) { res.status(400).json({ error: "Invalid ID" }); return; }
  const job = await getScheduledJob(id);
  if (!job) { res.status(404).json({ error: "Not found" }); return; }
  res.json(job);
}

export async function updateSchedulerJobHandler(req: Request, res: Response) {
  if (!ensureRole(res, isAdmin())) return;
  const id = parseId(req.params.id);
  if (!id) { res.status(400).json({ error: "Invalid ID" }); return; }
  const body = jsonBody(req);
  const job = await updateScheduledJob(id, {
    name: typeof body.name === "string" ? body.name : undefined,
    description: body.description === null ? null : typeof body.description === "string" ? body.description : undefined,
    jobType: body.jobType as ScheduledJobType | undefined,
    targetType: body.targetType as ScheduledJobTargetType | undefined,
    targetId: body.targetId === null ? null : typeof body.targetId === "number" ? body.targetId : Number.isFinite(Number(body.targetId)) ? Number(body.targetId) : undefined,
    contextsJson: body.contextsJson ?? body.contexts,
    cronExpression: body.cronExpression === null ? null : typeof body.cronExpression === "string" ? body.cronExpression : undefined,
    intervalMinutes: body.intervalMinutes === null ? null : Number(body.intervalMinutes ?? 60),
    enabled: typeof body.enabled === "boolean" ? body.enabled : undefined,
    runOnStartup: typeof body.runOnStartup === "boolean" ? body.runOnStartup : undefined,
    maxRuntimeSeconds: body.maxRuntimeSeconds === null ? null : Number(body.maxRuntimeSeconds ?? 3600),
  });
  if (!job) { res.status(404).json({ error: "Not found" }); return; }
  await logAuditEvent({
    actorId: getRequestContext()?.actorId ?? null,
    action: "scheduled_job_updated",
    objectType: "scheduled_job",
    objectId: String(job.id),
    metadata: { jobType: job.jobType, targetType: job.targetType, targetId: job.targetId, enabled: job.enabled },
    sourceIp: getRequestSourceIp(req),
  });
  res.json(job);
}

export async function deleteSchedulerJobHandler(req: Request, res: Response) {
  if (!ensureRole(res, isAdmin())) return;
  const id = parseId(req.params.id);
  if (!id) { res.status(400).json({ error: "Invalid ID" }); return; }
  await deleteScheduledJob(id);
  await logAuditEvent({
    actorId: getRequestContext()?.actorId ?? null,
    action: "scheduled_job_deleted",
    objectType: "scheduled_job",
    objectId: String(id),
    metadata: { deleted: true },
    sourceIp: getRequestSourceIp(req),
  });
  res.status(204).end();
}

export async function runSchedulerJobNowHandler(req: Request, res: Response) {
  if (!ensureRole(res, isOperatorOrAdmin())) return;
  const id = parseId(req.params.id);
  if (!id) { res.status(400).json({ error: "Invalid ID" }); return; }
  const result = await runScheduledJob(id, "manual", getRequestContext()?.actorId ?? null, getRequestContext()?.sourceIp ?? null);
  if (!result) { res.status(404).json({ error: "Not found or job disabled/running" }); return; }
  res.json(await getScheduledJobRunDetail(result.id));
}

export async function enableSchedulerJobHandler(req: Request, res: Response) {
  if (!ensureRole(res, isAdmin())) return;
  const id = parseId(req.params.id);
  if (!id) { res.status(400).json({ error: "Invalid ID" }); return; }
  const job = await enableScheduledJob(id, true);
  if (!job) { res.status(404).json({ error: "Not found" }); return; }
  await logAuditEvent({
    actorId: getRequestContext()?.actorId ?? null,
    action: "scheduled_job_enabled",
    objectType: "scheduled_job",
    objectId: String(job.id),
    metadata: { jobType: job.jobType, targetType: job.targetType, targetId: job.targetId },
    sourceIp: getRequestSourceIp(req),
  });
  res.json(job);
}

export async function disableSchedulerJobHandler(req: Request, res: Response) {
  if (!ensureRole(res, isAdmin())) return;
  const id = parseId(req.params.id);
  if (!id) { res.status(400).json({ error: "Invalid ID" }); return; }
  const job = await enableScheduledJob(id, false);
  if (!job) { res.status(404).json({ error: "Not found" }); return; }
  await logAuditEvent({
    actorId: getRequestContext()?.actorId ?? null,
    action: "scheduled_job_disabled",
    objectType: "scheduled_job",
    objectId: String(job.id),
    metadata: { jobType: job.jobType, targetType: job.targetType, targetId: job.targetId },
    sourceIp: getRequestSourceIp(req),
  });
  res.json(job);
}

export async function listSchedulerRunsHandler(req: Request, res: Response) {
  const scheduledJobId = req.query.scheduledJobId ? Number(req.query.scheduledJobId) : undefined;
  res.json(await listScheduledJobRuns(Number.isInteger(scheduledJobId) ? scheduledJobId : undefined));
}

export async function getSchedulerRunHandler(req: Request, res: Response) {
  const id = parseId(req.params.id);
  if (!id) { res.status(400).json({ error: "Invalid ID" }); return; }
  const run = await getScheduledJobRunDetail(id);
  if (!run) { res.status(404).json({ error: "Not found" }); return; }
  res.json(run);
}

export async function listSchedulerRunItemsHandler(req: Request, res: Response) {
  const id = parseId(req.params.id);
  if (!id) { res.status(400).json({ error: "Invalid ID" }); return; }
  const run = await getScheduledJobRunDetail(id);
  if (!run) { res.status(404).json({ error: "Not found" }); return; }
  res.json(run.items ?? []);
}
