import { and, desc, eq, lte } from "drizzle-orm";
import {
  complianceJobsTable,
  db,
  deviceGroupsTable,
  devicesTable,
  scheduledJobRunItemsTable,
  scheduledJobRunsTable,
  scheduledJobsTable,
  discoverySnapshotsTable,
} from "@workspace/db";
import type {
  ScheduledJob as DbScheduledJob,
  ScheduledJobRun as DbScheduledJobRun,
  ScheduledJobRunItem as DbScheduledJobRunItem,
} from "@workspace/db";
import { runDeviceDiscovery } from "../netops/device-discovery/discovery.service.js";
import { executeJob as executeComplianceJob } from "../../routes/compliance.js";
import { decrypt } from "../../lib/crypto.js";
import { testSSHConnection } from "../../lib/ssh.js";
import { logAuditEvent } from "../../lib/audit.js";
import type {
  ScheduledJobType,
  ScheduledJobTargetType,
  ScheduledJobRunStatus,
} from "./scheduler.types.js";

type SchedulerJobTarget = {
  id: number;
  hostname: string;
  ipAddress: string;
  vendor: string;
  platform: string;
  sshPort: number;
  username: string;
  passwordEncrypted: string;
  groupId: number | null;
  site: string;
  snmpCommunity: string | null;
};

export type ScheduledJobRecord = Omit<DbScheduledJob, "createdAt" | "updatedAt" | "lastRunAt" | "nextRunAt"> & {
  createdAt: string;
  updatedAt: string;
  lastRunAt: string | null;
  nextRunAt: string | null;
  contextsJson: string[];
};

export type ScheduledJobRunRecord = Omit<DbScheduledJobRun, "startedAt" | "finishedAt" | "createdAt" | "summaryJson"> & {
  startedAt: string | null;
  finishedAt: string | null;
  createdAt: string;
  summaryJson: Record<string, unknown> | null;
};

export type ScheduledJobRunItemRecord = Omit<DbScheduledJobRunItem, "startedAt" | "finishedAt" | "createdAt" | "summaryJson"> & {
  startedAt: string | null;
  finishedAt: string | null;
  createdAt: string;
  summaryJson: Record<string, unknown> | null;
};

function toDateString(value: Date | null | undefined): string | null {
  return value ? value.toISOString() : null;
}

function parseContexts(value: unknown): string[] {
  if (Array.isArray(value)) return value.filter((item): item is string => typeof item === "string");
  return [];
}

function parseMaybeJson(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function serializeJob(job: DbScheduledJob): ScheduledJobRecord {
  return {
    ...job,
    contextsJson: parseContexts(job.contextsJson),
    createdAt: job.createdAt.toISOString(),
    updatedAt: job.updatedAt.toISOString(),
    lastRunAt: toDateString(job.lastRunAt),
    nextRunAt: toDateString(job.nextRunAt),
  };
}

function serializeRun(run: DbScheduledJobRun): ScheduledJobRunRecord {
  return {
    ...run,
    startedAt: toDateString(run.startedAt),
    finishedAt: toDateString(run.finishedAt),
    createdAt: run.createdAt.toISOString(),
    summaryJson: parseMaybeJson(run.summaryJson),
  };
}

function serializeRunItem(item: DbScheduledJobRunItem): ScheduledJobRunItemRecord {
  return {
    ...item,
    startedAt: toDateString(item.startedAt),
    finishedAt: toDateString(item.finishedAt),
    createdAt: item.createdAt.toISOString(),
    summaryJson: parseMaybeJson(item.summaryJson),
  };
}

function normalizeJobInputContexts(contexts: unknown): string[] {
  return parseContexts(contexts).filter((context) => ["interfaces", "bgp", "l2vpn", "policies", "vrfs", "compliance", "health"].includes(context));
}

function computeNextRunAt(now: Date, intervalMinutes: number): Date {
  return new Date(now.getTime() + Math.max(intervalMinutes, 1) * 60_000);
}

async function resolveTargetDevices(job: DbScheduledJob): Promise<SchedulerJobTarget[]> {
  if (job.targetType === "device") {
    if (!job.targetId) return [];
    const [device] = await db.select().from(devicesTable).where(eq(devicesTable.id, job.targetId));
    return device ? [device] : [];
  }

  if (job.targetType === "device_group") {
    if (!job.targetId) return [];
    return await db.select().from(devicesTable).where(eq(devicesTable.groupId, job.targetId));
  }

  return await db.select().from(devicesTable);
}

async function getTargetLabel(job: DbScheduledJob): Promise<string> {
  if (job.targetType === "all_devices") return "All devices";
  if (!job.targetId) return "N/A";
  if (job.targetType === "device") {
    const [device] = await db.select().from(devicesTable).where(eq(devicesTable.id, job.targetId));
    return device?.hostname ?? `Device #${job.targetId}`;
  }
  const [group] = await db.select().from(deviceGroupsTable).where(eq(deviceGroupsTable.id, job.targetId));
  return group?.name ?? `Group #${job.targetId}`;
}

export async function listScheduledJobs() {
  const jobs = await db.select().from(scheduledJobsTable).orderBy(desc(scheduledJobsTable.createdAt));
  const records = await Promise.all(jobs.map(async (job) => ({ ...serializeJob(job), targetLabel: await getTargetLabel(job) })));
  return records;
}

export async function getScheduledJob(id: number) {
  const [job] = await db.select().from(scheduledJobsTable).where(eq(scheduledJobsTable.id, id));
  if (!job) return null;
  return { ...serializeJob(job), targetLabel: await getTargetLabel(job) };
}

export async function createScheduledJob(input: {
  name: string;
  description?: string | null;
  jobType: ScheduledJobType;
  targetType: ScheduledJobTargetType;
  targetId?: number | null;
  contextsJson?: unknown;
  cronExpression?: string | null;
  intervalMinutes?: number | null;
  enabled?: boolean;
  runOnStartup?: boolean;
  maxRuntimeSeconds?: number | null;
  createdBy?: number | null;
}) {
  const now = new Date();
  const intervalMinutes = Math.max(Number(input.intervalMinutes ?? 60), 1);
  const runOnStartup = input.runOnStartup ?? false;
  const [job] = await db.insert(scheduledJobsTable).values({
    name: input.name,
    description: input.description ?? null,
    jobType: input.jobType,
    targetType: input.targetType,
    targetId: input.targetId ?? null,
    contextsJson: normalizeJobInputContexts(input.contextsJson),
    cronExpression: input.cronExpression ?? null,
    intervalMinutes,
    enabled: input.enabled ?? true,
    runOnStartup,
    maxRuntimeSeconds: Math.max(Number(input.maxRuntimeSeconds ?? 3600), 60),
    createdBy: input.createdBy ?? null,
    lastRunAt: null,
    nextRunAt: runOnStartup ? now : computeNextRunAt(now, intervalMinutes),
  }).returning();

  return job ? { ...serializeJob(job), targetLabel: await getTargetLabel(job) } : null;
}

export async function updateScheduledJob(id: number, input: Partial<{
  name: string;
  description: string | null;
  jobType: ScheduledJobType;
  targetType: ScheduledJobTargetType;
  targetId: number | null;
  contextsJson: unknown;
  cronExpression: string | null;
  intervalMinutes: number | null;
  enabled: boolean;
  runOnStartup: boolean;
  maxRuntimeSeconds: number | null;
}>) {
  const patch: Record<string, unknown> = { updatedAt: new Date() };
  if (input.name !== undefined) patch.name = input.name;
  if (input.description !== undefined) patch.description = input.description;
  if (input.jobType !== undefined) patch.jobType = input.jobType;
  if (input.targetType !== undefined) patch.targetType = input.targetType;
  if (input.targetId !== undefined) patch.targetId = input.targetId;
  if (input.contextsJson !== undefined) patch.contextsJson = normalizeJobInputContexts(input.contextsJson);
  if (input.cronExpression !== undefined) patch.cronExpression = input.cronExpression;
  if (input.intervalMinutes !== undefined) patch.intervalMinutes = Math.max(Number(input.intervalMinutes ?? 60), 1);
  if (input.enabled !== undefined) patch.enabled = input.enabled;
  if (input.runOnStartup !== undefined) patch.runOnStartup = input.runOnStartup;
  if (input.maxRuntimeSeconds !== undefined) patch.maxRuntimeSeconds = Math.max(Number(input.maxRuntimeSeconds ?? 3600), 60);

  const [job] = await db.update(scheduledJobsTable).set(patch).where(eq(scheduledJobsTable.id, id)).returning();
  if (!job) return null;
  return { ...serializeJob(job), targetLabel: await getTargetLabel(job) };
}

export async function deleteScheduledJob(id: number) {
  await db.delete(scheduledJobsTable).where(eq(scheduledJobsTable.id, id));
}

export async function enableScheduledJob(id: number, enabled: boolean) {
  const [job] = await db.update(scheduledJobsTable).set({ enabled, updatedAt: new Date() }).where(eq(scheduledJobsTable.id, id)).returning();
  if (!job) return null;
  return { ...serializeJob(job), targetLabel: await getTargetLabel(job) };
}

export async function listScheduledJobRuns(scheduledJobId?: number) {
  const rows = await db.select().from(scheduledJobRunsTable).orderBy(desc(scheduledJobRunsTable.createdAt));
  const filtered = scheduledJobId ? rows.filter((row) => row.scheduledJobId === scheduledJobId) : rows;
  return filtered.map(serializeRun);
}

export async function getScheduledJobRun(id: number) {
  const [row] = await db.select().from(scheduledJobRunsTable).where(eq(scheduledJobRunsTable.id, id));
  return row ? serializeRun(row) : null;
}

export async function listScheduledJobRunItems(runId: number) {
  const rows = await db.select().from(scheduledJobRunItemsTable).where(eq(scheduledJobRunItemsTable.scheduledJobRunId, runId)).orderBy(scheduledJobRunItemsTable.id);
  return rows.map(serializeRunItem);
}

async function latestRunStatus(jobId: number): Promise<ScheduledJobRunStatus | null> {
  const [latest] = await db.select().from(scheduledJobRunsTable).where(eq(scheduledJobRunsTable.scheduledJobId, jobId)).orderBy(desc(scheduledJobRunsTable.createdAt)).limit(1);
  return (latest?.status as ScheduledJobRunStatus | undefined) ?? null;
}

async function updateRunStatus(runId: number, status: ScheduledJobRunStatus, summaryJson: Record<string, unknown>, errorMessage?: string | null) {
  await db.update(scheduledJobRunsTable).set({
    status,
    summaryJson,
    errorMessage: errorMessage ?? null,
    finishedAt: new Date(),
  }).where(eq(scheduledJobRunsTable.id, runId));
}

async function updateJobSchedule(jobId: number, now: Date) {
  const [job] = await db.select().from(scheduledJobsTable).where(eq(scheduledJobsTable.id, jobId));
  if (!job) return;
  const nextRunAt = computeNextRunAt(now, job.intervalMinutes);
  await db.update(scheduledJobsTable).set({
    lastRunAt: now,
    nextRunAt,
    updatedAt: now,
  }).where(eq(scheduledJobsTable.id, jobId));
}

async function createRun(job: DbScheduledJob, triggeredBy: "scheduler" | "manual", actorId: number | null, sourceIp: string | null) {
  const now = new Date();
  const [run] = await db.insert(scheduledJobRunsTable).values({
    scheduledJobId: job.id,
    status: "running",
    startedAt: now,
    triggeredBy,
    actorId,
    summaryJson: null,
    errorMessage: null,
  }).returning();

  await logAuditEvent({
    actorId,
    action: "scheduled_job_run_started",
    objectType: "scheduled_job",
    objectId: String(job.id),
    metadata: {
      jobType: job.jobType,
      targetType: job.targetType,
      targetId: job.targetId,
      triggeredBy,
      runId: run.id,
    },
    sourceIp,
  });

  if (triggeredBy === "manual") {
    await logAuditEvent({
      actorId,
      action: "scheduled_job_manual_run",
      objectType: "scheduled_job",
      objectId: String(job.id),
      metadata: {
        jobType: job.jobType,
        targetType: job.targetType,
        targetId: job.targetId,
        runId: run.id,
      },
      sourceIp,
    });
  }

  return run;
}

async function createRunItem(runId: number, deviceId: number, actionType: string) {
  const [item] = await db.insert(scheduledJobRunItemsTable).values({
    scheduledJobRunId: runId,
    deviceId,
    status: "pending",
    actionType,
    resultRefType: null,
    resultRefId: null,
    summaryJson: null,
    errorMessage: null,
  }).returning();
  return item;
}

async function finalizeRun(job: DbScheduledJob, runId: number, summaryJson: Record<string, unknown>, status: ScheduledJobRunStatus, errorMessage?: string | null) {
  await updateRunStatus(runId, status, summaryJson, errorMessage ?? null);
  await updateJobSchedule(job.id, new Date());
  await logAuditEvent({
    action: status === "failed" ? "scheduled_job_run_failed" : "scheduled_job_run_completed",
    objectType: "scheduled_job",
    objectId: String(job.id),
    metadata: { jobType: job.jobType, targetType: job.targetType, targetId: job.targetId, runId, status, summary: summaryJson },
    sourceIp: null,
  });
}

async function executeDiscoveryRun(job: DbScheduledJob, runId: number, devices: SchedulerJobTarget[]) {
  const contexts = parseContexts(job.contextsJson);
  const summary = { totalDevices: devices.length, completed: 0, failed: 0, partial: 0, warnings: 0 };

  for (const device of devices) {
    const item = await createRunItem(runId, device.id, "discovery");
    const startedAt = new Date();
    await db.update(scheduledJobRunItemsTable).set({ status: "running", startedAt }).where(eq(scheduledJobRunItemsTable.id, item.id));
    try {
      const snapshot = await runDeviceDiscovery(device.id, {
        contexts: contexts.length > 0 ? contexts as any : ["interfaces", "bgp", "l2vpn", "policies", "vrfs"],
        preferLiveSsh: true,
        allowSnmpFallback: true,
        useCachedConfig: true,
      });
      if (!snapshot) {
        throw new Error("Device not found");
      }
      const itemSummary = {
        status: snapshot.status,
        warnings: snapshot.warnings.length,
        sourcesUsed: snapshot.sourcesUsed,
        discoveryRunId: snapshot.discoveryRunId,
      };
      await db.update(scheduledJobRunItemsTable).set({
        status: snapshot.status === "failed" ? "failed" : "completed",
        resultRefType: "discovery_snapshot",
        resultRefId: String(snapshot.persistedSnapshotId ?? snapshot.discoveryRunId),
        summaryJson: itemSummary,
        finishedAt: new Date(),
      }).where(eq(scheduledJobRunItemsTable.id, item.id));
      if (snapshot.status === "failed") {
        summary.failed += 1;
      } else {
        summary.completed += 1;
        if (snapshot.status === "partial" || snapshot.warnings.length > 0) summary.partial += 1;
        summary.warnings += snapshot.warnings.length;
      }
    } catch (error) {
      await db.update(scheduledJobRunItemsTable).set({
        status: "failed",
        errorMessage: error instanceof Error ? error.message : String(error),
        finishedAt: new Date(),
      }).where(eq(scheduledJobRunItemsTable.id, item.id));
      summary.failed += 1;
    }
  }

  return summary;
}

async function executeComplianceRun(job: DbScheduledJob, runId: number, devices: SchedulerJobTarget[]) {
  const contexts = parseContexts(job.contextsJson);
  const summary = { totalDevices: devices.length, pass: 0, fail: 0, warning: 0, unknown: 0, criticalFindings: 0 };

  for (const device of devices) {
    const item = await createRunItem(runId, device.id, "compliance");
    await db.update(scheduledJobRunItemsTable).set({ status: "running", startedAt: new Date() }).where(eq(scheduledJobRunItemsTable.id, item.id));
    try {
      const [snapshot] = await db.select().from(discoverySnapshotsTable).where(eq(discoverySnapshotsTable.deviceId, device.id)).orderBy(desc(discoverySnapshotsTable.createdAt)).limit(1);
      if (!snapshot) {
        throw new Error("Nenhum discovery snapshot encontrado.");
      }

      const [complianceJob] = await db.insert(complianceJobsTable).values({
        deviceId: device.id,
        contexts: JSON.stringify(contexts.length > 0 ? contexts : ["compliance"]),
        status: "pending",
        passCount: 0,
        failCount: 0,
      }).returning();
      if (!complianceJob) {
        throw new Error("Failed to create compliance job");
      }
      await executeComplianceJob(complianceJob.id);
      const [finishedJob] = await db.select().from(complianceJobsTable).where(eq(complianceJobsTable.id, complianceJob.id));
      const status = finishedJob?.status ?? "failed";
      const itemSummary = {
        complianceJobId: complianceJob.id,
        status,
        passCount: finishedJob?.passCount ?? 0,
        failCount: finishedJob?.failCount ?? 0,
        contexts,
      };
      await db.update(scheduledJobRunItemsTable).set({
        status: status === "passed" ? "completed" : "failed",
        resultRefType: "compliance_job",
        resultRefId: String(complianceJob.id),
        summaryJson: itemSummary,
        finishedAt: new Date(),
      }).where(eq(scheduledJobRunItemsTable.id, item.id));
      if (status === "passed") {
        summary.pass += 1;
      } else {
        summary.fail += 1;
      }
      summary.criticalFindings += finishedJob?.failCount ?? 0;
    } catch (error) {
      await db.update(scheduledJobRunItemsTable).set({
        status: "failed",
        errorMessage: error instanceof Error ? error.message : String(error),
        finishedAt: new Date(),
      }).where(eq(scheduledJobRunItemsTable.id, item.id));
      summary.warning += 1;
    }
  }

  return summary;
}

async function executeHealthCheckRun(job: DbScheduledJob, runId: number, devices: SchedulerJobTarget[]) {
  const summary = { totalDevices: devices.length, success: 0, failed: 0, warning: 0 };

  for (const device of devices) {
    const item = await createRunItem(runId, device.id, "health_check");
    await db.update(scheduledJobRunItemsTable).set({ status: "running", startedAt: new Date() }).where(eq(scheduledJobRunItemsTable.id, item.id));
    try {
      const password = decrypt(device.passwordEncrypted);
      const result = await testSSHConnection({
        host: device.ipAddress,
        port: device.sshPort,
        username: device.username,
        password,
      });
      await db.update(scheduledJobRunItemsTable).set({
        status: result.success ? "completed" : "failed",
        resultRefType: "device_health",
        resultRefId: String(device.id),
        summaryJson: { success: result.success, latencyMs: result.latencyMs, message: result.message },
        finishedAt: new Date(),
      }).where(eq(scheduledJobRunItemsTable.id, item.id));
      if (result.success) {
        summary.success += 1;
      } else {
        summary.failed += 1;
      }
    } catch (error) {
      await db.update(scheduledJobRunItemsTable).set({
        status: "failed",
        errorMessage: error instanceof Error ? error.message : String(error),
        finishedAt: new Date(),
      }).where(eq(scheduledJobRunItemsTable.id, item.id));
      summary.failed += 1;
    }
  }

  return summary;
}

export async function runScheduledJob(jobId: number, triggeredBy: "scheduler" | "manual", actorId: number | null, sourceIp: string | null) {
  const [job] = await db.select().from(scheduledJobsTable).where(eq(scheduledJobsTable.id, jobId));
  if (!job || !job.enabled) return null;
  if ((await latestRunStatus(jobId)) === "running") return null;

  const run = await createRun(job, triggeredBy, actorId, sourceIp);
  const devices = await resolveTargetDevices(job);

  try {
    let summary: Record<string, unknown>;
    let status: ScheduledJobRunStatus = "completed";

    if (job.jobType === "discovery") {
      summary = await executeDiscoveryRun(job, run.id, devices);
      if ((summary.failed as number) > 0) status = (summary.completed as number) > 0 ? "partial" : "failed";
      else if ((summary.partial as number) > 0 || (summary.warnings as number) > 0) status = "partial";
    } else if (job.jobType === "compliance") {
      summary = await executeComplianceRun(job, run.id, devices);
      if ((summary.fail as number) > 0) status = (summary.pass as number) > 0 ? "partial" : "failed";
      else if ((summary.warning as number) > 0) status = "partial";
    } else {
      summary = await executeHealthCheckRun(job, run.id, devices);
      if ((summary.failed as number) > 0) status = (summary.success as number) > 0 ? "partial" : "failed";
    }

    await finalizeRun(job, run.id, summary, status);
    return await getScheduledJobRun(run.id);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await updateRunStatus(run.id, "failed", { totalDevices: devices.length, error: message }, message);
    await updateJobSchedule(job.id, new Date());
    await logAuditEvent({
      actorId,
      action: "scheduled_job_run_failed",
      objectType: "scheduled_job",
      objectId: String(job.id),
      metadata: { jobType: job.jobType, targetType: job.targetType, targetId: job.targetId, runId: run.id, error: message },
      sourceIp,
    });
    return await getScheduledJobRun(run.id);
  }
}

export async function runDueScheduledJobs() {
  const now = new Date();
  const dueJobs = await db.select().from(scheduledJobsTable).where(and(eq(scheduledJobsTable.enabled, true), lte(scheduledJobsTable.nextRunAt, now)));
  const results = [];
  for (const job of dueJobs) {
    const result = await runScheduledJob(job.id, "scheduler", null, null);
    if (result) results.push(result);
  }
  return results;
}

export async function getScheduledJobRunDetail(id: number) {
  const run = await getScheduledJobRun(id);
  if (!run) return null;
  const items = await listScheduledJobRunItems(id);
  return { ...run, items };
}

export async function listScheduledJobsWithTarget() {
  const jobs = await listScheduledJobs();
  return jobs;
}
