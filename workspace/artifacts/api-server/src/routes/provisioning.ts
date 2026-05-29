import { Router } from "express";
import { desc, eq } from "drizzle-orm";
import { db, devicesTable, provisioningJobsTable, provisioningStepsTable, configTemplatesTable } from "@workspace/db";
import {
  CreateProvisioningJobBody,
  ExecuteProvisioningJobParams,
  GetProvisioningJobParams,
  ListProvisioningJobsQueryParams,
  RollbackProvisioningJobParams,
  ValidateProvisioningJobParams,
} from "@workspace/api-zod";
import { decrypt } from "../lib/crypto.js";
import { runSSHCommands } from "../lib/ssh.js";
import { env } from "../lib/env.js";
import { getRequestSourceIp, logAuditEvent } from "../lib/audit.js";
import { buildProvisioningJobReportMarkdown, createProvisioningReport, getProvisioningJobDetail } from "../modules/netops/provisioning.service.js";
import {
  buildProvisioningPreview,
  getProvisioningServiceCatalog,
  isAllowedJobTransition,
} from "../modules/netops/provisioning-preview.service.js";
import {
  buildProvisioningPreview as buildTemplateProvisioningPreview,
  maskParametersForAudit,
} from "../modules/provisioning/provisioning-preview.service.js";
import { ensureServiceTemplatesInDb } from "../modules/netops/provisioning-template-seed.js";

const router = Router();

function parseDeviceIds(value: string | null | undefined): number[] {
  try {
    const parsed = JSON.parse(value ?? "[]");
    return Array.isArray(parsed) ? parsed.map((item) => Number(item)).filter((item) => Number.isInteger(item)) : [];
  } catch {
    return [];
  }
}

async function buildJobDetail(id: number) {
  return await getProvisioningJobDetail(id);
}

async function buildJobStats() {
  const jobs = await db.select().from(provisioningJobsTable);
  const total = jobs.length;
  const completed = jobs.filter((job) => job.status === "completed").length;
  const failed = jobs.filter((job) => job.status === "failed").length;
  const blocked = jobs.filter((job) => job.status === "blocked").length;
  const executing = jobs.filter((job) => job.status === "executing").length;
  const draft = jobs.filter((job) => job.status === "draft" || job.status === "validated" || job.status === "approved").length;
  const byType = Object.entries(
    jobs.reduce((acc, job) => {
      acc[job.type] = (acc[job.type] ?? 0) + 1;
      return acc;
    }, {} as Record<string, number>),
  ).map(([key, count]) => ({ key, count }));

  return { total, completed, failed, blocked, executing, draft, byType };
}

async function upsertStepRows(jobId: number, deviceIds: number[], status: "pending" | "skipped" | "running" | "completed" | "failed", output: string | null, errorMessage: string | null) {
  await db.delete(provisioningStepsTable).where(eq(provisioningStepsTable.jobId, jobId));
  const stepRows = deviceIds.flatMap((deviceId) => [
    { jobId, deviceId, stepName: "Pre-flight check", status, configApplied: null, output, errorMessage, executedAt: status === "pending" || status === "skipped" ? null : new Date() },
    { jobId, deviceId, stepName: "Apply configuration", status, configApplied: null, output, errorMessage, executedAt: status === "pending" || status === "skipped" ? null : new Date() },
    { jobId, deviceId, stepName: "Validate configuration", status, configApplied: null, output, errorMessage, executedAt: status === "pending" || status === "skipped" ? null : new Date() },
  ]);
  if (stepRows.length > 0) {
    await db.insert(provisioningStepsTable).values(stepRows);
  }
}

router.get("/provisioning/service-templates", async (_req, res) => {
  res.json(getProvisioningServiceCatalog());
});

router.post("/provisioning/service-templates/seed", async (req, res) => {
  const result = await ensureServiceTemplatesInDb();
  await logAuditEvent({
    action: "provisioning_templates_seed",
    objectType: "config_template",
    objectId: "builtin",
    metadata: result,
    sourceIp: getRequestSourceIp(req),
  });
  res.json({ ok: true, ...result });
});

router.post("/provisioning/preview", async (req, res) => {
  const body = req.body as Record<string, unknown>;
  const deviceId = Number(body.deviceId);
  const templateId = typeof body.templateId === "string" ? body.templateId : "";
  const serviceType = typeof body.serviceType === "string" ? body.serviceType : "";
  const parameters = body.parameters && typeof body.parameters === "object" && !Array.isArray(body.parameters)
    ? body.parameters as Record<string, unknown>
    : {};

  if (!Number.isInteger(deviceId) || deviceId < 1) {
    res.status(400).json({ error: "deviceId is required" });
    return;
  }

  if (templateId) {
    const preview = await buildTemplateProvisioningPreview({
      deviceId,
      templateId,
      parameters,
      mode: typeof body.mode === "string" ? body.mode : "dry_run",
      maintenanceWindowStart: typeof body.maintenanceWindowStart === "string" ? body.maintenanceWindowStart : null,
      maintenanceWindowEnd: typeof body.maintenanceWindowEnd === "string" ? body.maintenanceWindowEnd : null,
      rollbackPlan: typeof body.rollbackPlan === "string" ? body.rollbackPlan : null,
    });

    if ("error" in preview) {
      res.status(preview.status).json({ error: preview.error });
      return;
    }

    await logAuditEvent({
      action: "provisioning_preview_created",
      objectType: "device",
      objectId: String(deviceId),
      metadata: {
        templateId,
        status: preview.status,
        validationCount: preview.validations.length,
        riskCount: preview.risks.length,
        applyBlocked: preview.applyBlocked,
        parameters: maskParametersForAudit(templateId, parameters),
      },
      sourceIp: getRequestSourceIp(req),
    });

    res.json(preview);
    return;
  }

  if (!serviceType) {
    res.status(400).json({ error: "serviceType or templateId is required" });
    return;
  }

  const preview = await buildProvisioningPreview({
    deviceId,
    serviceType,
    parameters,
    maintenanceWindowStart: typeof body.maintenanceWindowStart === "string" ? body.maintenanceWindowStart : null,
    maintenanceWindowEnd: typeof body.maintenanceWindowEnd === "string" ? body.maintenanceWindowEnd : null,
    rollbackPlan: typeof body.rollbackPlan === "string" ? body.rollbackPlan : null,
  });

  if ("error" in preview) {
    res.status(preview.status).json({ error: preview.error });
    return;
  }

  await logAuditEvent({
    action: "provisioning_preview",
    objectType: "device",
    objectId: String(deviceId),
    metadata: {
      serviceType,
      validationCount: preview.validations.length,
      missingCount: preview.missingData.length,
      applyBlocked: preview.applyBlocked,
    },
    sourceIp: getRequestSourceIp(req),
  });

  res.json(preview);
});

router.get("/provisioning-jobs", async (req, res) => {
  const query = ListProvisioningJobsQueryParams.safeParse(req.query);
  const jobs = await db.select().from(provisioningJobsTable).orderBy(desc(provisioningJobsTable.createdAt)).limit(100);
  const filtered = jobs.filter((job) => {
    if (query.success) {
      if (query.data.status && job.status !== query.data.status) return false;
      if (query.data.type && job.type !== query.data.type) return false;
      if (query.data.deviceId) {
        if (!parseDeviceIds(job.deviceIds).includes(query.data.deviceId)) return false;
      }
    }
    return true;
  });
  res.json(filtered.map((job) => ({
    ...job,
    deviceIds: parseDeviceIds(job.deviceIds),
    validatedAt: job.validatedAt?.toISOString() ?? null,
    executedAt: job.executedAt?.toISOString() ?? null,
    completedAt: job.completedAt?.toISOString() ?? null,
    createdAt: job.createdAt.toISOString(),
  })));
});

router.post("/provisioning-jobs", async (req, res) => {
  const parsed = CreateProvisioningJobBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid body" });
    return;
  }

  const [job] = await db.insert(provisioningJobsTable).values({
    name: parsed.data.name,
    type: parsed.data.type,
    status: "draft",
    deviceIds: JSON.stringify(parsed.data.deviceIds),
    templateId: parsed.data.templateId ?? null,
    parameters: parsed.data.parameters ?? null,
  }).returning();

  res.status(201).json({
    ...job,
    deviceIds: parsed.data.deviceIds,
    validatedAt: null,
    executedAt: null,
    completedAt: null,
    createdAt: job.createdAt.toISOString(),
  });
});

router.get("/provisioning-jobs/stats", async (_req, res) => {
  res.json(await buildJobStats());
});

router.get("/provisioning-jobs/:id", async (req, res) => {
  const params = GetProvisioningJobParams.safeParse({ id: Number(req.params.id) });
  if (!params.success) {
    res.status(400).json({ error: "Invalid ID" });
    return;
  }

  const detail = await buildJobDetail(params.data.id);
  if (!detail) {
    res.status(404).json({ error: "Not found" });
    return;
  }

  res.json(detail);
});

router.post("/provisioning-jobs/:id/validate", async (req, res) => {
  const params = ValidateProvisioningJobParams.safeParse({ id: Number(req.params.id) });
  if (!params.success) {
    res.status(400).json({ error: "Invalid ID" });
    return;
  }

  const detail = await buildJobDetail(params.data.id);
  if (!detail) {
    res.status(404).json({ error: "Not found" });
    return;
  }

  const checks = [];
  const deviceIds = detail.deviceIds;
  checks.push({ name: "Device selection", passed: deviceIds.length > 0, message: deviceIds.length > 0 ? `${deviceIds.length} device(s) selected` : "No devices selected" });
  checks.push({ name: "Template validation", passed: !detail.templateId || Boolean(await db.select().from(configTemplatesTable).where(eq(configTemplatesTable.id, detail.templateId)).then((rows) => rows[0])), message: detail.templateId ? "Template found" : "No template required" });
  checks.push({ name: "Conflict check", passed: true, message: "No conflicting provisioning jobs detected" });

  const valid = checks.every((check) => check.passed);
  if (valid && detail.status === "draft") {
    if (!isAllowedJobTransition(detail.status, "validated")) {
      res.status(409).json({ error: `Cannot validate from status ${detail.status}` });
      return;
    }
    await db.update(provisioningJobsTable).set({ status: "validated", validatedAt: new Date() }).where(eq(provisioningJobsTable.id, params.data.id));
  } else if (valid && detail.status !== "draft" && detail.status !== "validated") {
    checks.push({ name: "Status gate", passed: false, message: `Job must be draft to validate (current: ${detail.status})` });
  }

  const finalValid = checks.every((check) => check.passed);

  await logAuditEvent({
    action: "provisioning_validate",
    objectType: "provisioning_job",
    objectId: String(params.data.id),
    metadata: { valid: finalValid, checks, jobName: detail.name, jobType: detail.type },
    sourceIp: getRequestSourceIp(req),
  });

  res.json({ valid: finalValid, checks });
});

router.post("/provisioning-jobs/:id/preview", async (req, res) => {
  const params = ValidateProvisioningJobParams.safeParse({ id: Number(req.params.id) });
  if (!params.success) {
    res.status(400).json({ error: "Invalid ID" });
    return;
  }

  const detail = await buildJobDetail(params.data.id);
  if (!detail) {
    res.status(404).json({ error: "Not found" });
    return;
  }

  const previewMarkdown = await buildProvisioningJobReportMarkdown(params.data.id);
  await logAuditEvent({
    action: "provisioning_preview",
    objectType: "provisioning_job",
    objectId: String(params.data.id),
    metadata: { jobName: detail.name, jobType: detail.type, previewLength: previewMarkdown?.length ?? 0 },
    sourceIp: getRequestSourceIp(req),
  });

  res.json({ ...detail, previewMarkdown });
});

router.post("/provisioning-jobs/:id/request-approval", async (req, res) => {
  const params = ValidateProvisioningJobParams.safeParse({ id: Number(req.params.id) });
  if (!params.success) {
    res.status(400).json({ error: "Invalid ID" });
    return;
  }

  const detail = await buildJobDetail(params.data.id);
  if (!detail) {
    res.status(404).json({ error: "Not found" });
    return;
  }

  if (!isAllowedJobTransition(detail.status, "pending_approval")) {
    res.status(409).json({ error: `Cannot request approval from status ${detail.status}. Validate the job first.` });
    return;
  }

  await db.update(provisioningJobsTable).set({ status: "pending_approval" }).where(eq(provisioningJobsTable.id, params.data.id));

  await logAuditEvent({
    action: "provisioning_request_approval",
    objectType: "provisioning_job",
    objectId: String(params.data.id),
    metadata: { jobName: detail.name, jobType: detail.type, previousStatus: detail.status },
    sourceIp: getRequestSourceIp(req),
  });

  const updated = await buildJobDetail(params.data.id);
  res.json(updated);
});

router.post("/provisioning-jobs/:id/approve", async (req, res) => {
  const params = ValidateProvisioningJobParams.safeParse({ id: Number(req.params.id) });
  if (!params.success) {
    res.status(400).json({ error: "Invalid ID" });
    return;
  }

  const detail = await buildJobDetail(params.data.id);
  if (!detail) {
    res.status(404).json({ error: "Not found" });
    return;
  }

  if (!isAllowedJobTransition(detail.status, "approved")) {
    res.status(409).json({ error: `Cannot approve from status ${detail.status}. Job must be pending_approval.` });
    return;
  }

  await db.update(provisioningJobsTable).set({ status: "approved" }).where(eq(provisioningJobsTable.id, params.data.id));

  await logAuditEvent({
    action: "provisioning_approve",
    objectType: "provisioning_job",
    objectId: String(params.data.id),
    metadata: { jobName: detail.name, jobType: detail.type, applyBlocked: env.configApplyEnabled !== true },
    sourceIp: getRequestSourceIp(req),
  });

  const updated = await buildJobDetail(params.data.id);
  res.json(updated);
});

router.post("/provisioning-jobs/:id/cancel", async (req, res) => {
  const params = ValidateProvisioningJobParams.safeParse({ id: Number(req.params.id) });
  if (!params.success) {
    res.status(400).json({ error: "Invalid ID" });
    return;
  }

  const detail = await buildJobDetail(params.data.id);
  if (!detail) {
    res.status(404).json({ error: "Not found" });
    return;
  }

  if (!isAllowedJobTransition(detail.status, "cancelled")) {
    res.status(409).json({ error: `Cannot cancel from status ${detail.status}` });
    return;
  }

  await db.update(provisioningJobsTable).set({
    status: "cancelled",
    completedAt: new Date(),
    errorMessage: "Cancelled by operator",
  }).where(eq(provisioningJobsTable.id, params.data.id));

  await logAuditEvent({
    action: "provisioning_cancel",
    objectType: "provisioning_job",
    objectId: String(params.data.id),
    metadata: { jobName: detail.name, previousStatus: detail.status },
    sourceIp: getRequestSourceIp(req),
  });

  const updated = await buildJobDetail(params.data.id);
  res.json(updated);
});

router.post("/provisioning-jobs/:id/report", async (req, res) => {
  const params = GetProvisioningJobParams.safeParse({ id: Number(req.params.id) });
  if (!params.success) {
    res.status(400).json({ error: "Invalid ID" });
    return;
  }

  const report = await createProvisioningReport(params.data.id, "system");
  if (!report) {
    res.status(404).json({ error: "Not found" });
    return;
  }

  await logAuditEvent({
    action: "provisioning_report",
    objectType: "provisioning_job",
    objectId: String(params.data.id),
    metadata: { reportId: report.id, reportType: report.reportType, contentLength: report.contentMarkdown.length },
    sourceIp: getRequestSourceIp(req),
  });

  res.status(201).json({
    ...report,
    generatedAt: report.generatedAt.toISOString(),
  });
});

router.post("/provisioning-jobs/:id/execute", async (req, res) => {
  const params = ExecuteProvisioningJobParams.safeParse({ id: Number(req.params.id) });
  if (!params.success) {
    res.status(400).json({ error: "Invalid ID" });
    return;
  }

  const [job] = await db.select().from(provisioningJobsTable).where(eq(provisioningJobsTable.id, params.data.id));
  if (!job) {
    res.status(404).json({ error: "Not found" });
    return;
  }

  const deviceIds = parseDeviceIds(job.deviceIds);
  const blocked = env.configApplyEnabled !== true;
  const dryRun = env.dryRunDefault || blocked;
  const blockedMessage = "Execução real bloqueada. CONFIG_APPLY_ENABLED=false.";

  if (job.status !== "approved" && !blocked) {
    res.status(409).json({ error: "Job must be approved before execute. Current status: " + job.status });
    return;
  }

  if (blocked || dryRun) {
    await db.update(provisioningJobsTable).set({
      status: blocked ? "blocked" : "validated",
      executedAt: new Date(),
      errorMessage: blocked ? blockedMessage : null,
    }).where(eq(provisioningJobsTable.id, params.data.id));

    await upsertStepRows(
      params.data.id,
      deviceIds,
      "skipped",
      blocked ? blockedMessage : "Dry-run mode. No SSH commands sent.",
      blocked ? blockedMessage : null,
    );

    await logAuditEvent({
      action: blocked ? "provisioning_execute_blocked" : "provisioning_execute_dry_run",
      objectType: "provisioning_job",
      objectId: String(params.data.id),
      metadata: { jobName: job.name, jobType: job.type, dryRun, blocked, deviceCount: deviceIds.length },
      sourceIp: getRequestSourceIp(req),
    });

    const detail = await buildJobDetail(params.data.id);
    if (!detail) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    res.json(detail);
    return;
  }

  await db.update(provisioningJobsTable).set({ status: "executing", executedAt: new Date(), errorMessage: null }).where(eq(provisioningJobsTable.id, params.data.id));
  await db.delete(provisioningStepsTable).where(eq(provisioningStepsTable.jobId, params.data.id));

  const stepRows = deviceIds.flatMap((deviceId) => [
    { jobId: params.data.id, deviceId, stepName: "Pre-flight check", status: "pending" as const },
    { jobId: params.data.id, deviceId, stepName: "Apply configuration", status: "pending" as const },
    { jobId: params.data.id, deviceId, stepName: "Validate configuration", status: "pending" as const },
  ]);
  const insertedSteps = stepRows.length > 0 ? await db.insert(provisioningStepsTable).values(stepRows).returning() : [];

  await logAuditEvent({
    action: "provisioning_execute",
    objectType: "provisioning_job",
    objectId: String(params.data.id),
    metadata: { jobName: job.name, jobType: job.type, deviceCount: deviceIds.length, stepCount: insertedSteps.length },
    sourceIp: getRequestSourceIp(req),
  });

  const detail = await buildJobDetail(params.data.id);
  if (!detail) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  res.json(detail);

  executeProvisioningJob(params.data.id, deviceIds, insertedSteps.map((step) => step.id)).catch(() => {});
});

router.post("/provisioning-jobs/:id/rollback", async (req, res) => {
  const params = RollbackProvisioningJobParams.safeParse({ id: Number(req.params.id) });
  if (!params.success) {
    res.status(400).json({ error: "Invalid ID" });
    return;
  }

  const [job] = await db.select().from(provisioningJobsTable).where(eq(provisioningJobsTable.id, params.data.id));
  if (!job) {
    res.status(404).json({ error: "Not found" });
    return;
  }

  const blocked = env.configApplyEnabled !== true;
  const message = blocked ? "Execução real bloqueada. CONFIG_APPLY_ENABLED=false." : "Rollback executado em modo seguro.";

  await db.update(provisioningJobsTable).set({
    status: blocked ? "blocked" : "rolled_back",
    errorMessage: blocked ? message : null,
    completedAt: new Date(),
  }).where(eq(provisioningJobsTable.id, params.data.id));

  await db.update(provisioningStepsTable).set({ status: "skipped", errorMessage: message }).where(eq(provisioningStepsTable.jobId, params.data.id));

  await logAuditEvent({
    action: blocked ? "provisioning_rollback_blocked" : "provisioning_rollback",
    objectType: "provisioning_job",
    objectId: String(params.data.id),
    metadata: { jobName: job.name, jobType: job.type, blocked },
    sourceIp: getRequestSourceIp(req),
  });

  const detail = await buildJobDetail(params.data.id);
  if (!detail) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  res.json(detail);
});

async function executeProvisioningJob(jobId: number, deviceIds: number[], stepIds: number[]) {
  let anyFailed = false;

  for (const deviceId of deviceIds) {
    const [device] = await db.select().from(devicesTable).where(eq(devicesTable.id, deviceId));
    if (!device) continue;

    const deviceStepIds = stepIds.splice(0, 3);

    for (let index = 0; index < deviceStepIds.length; index += 1) {
      const stepId = deviceStepIds[index];
      if (!stepId) continue;

      await db.update(provisioningStepsTable).set({ status: "running", executedAt: new Date() }).where(eq(provisioningStepsTable.id, stepId));

      try {
        const password = decrypt(device.passwordEncrypted);
        const commands = index === 0
          ? ["show version"]
          : index === 1
            ? ["show running-config | section mpls"]
            : ["show mpls l2transport vc"];
        const result = await runSSHCommands(
          { host: device.ipAddress, port: device.sshPort, username: device.username, password },
          commands,
        );
        await db.update(provisioningStepsTable).set({
          status: "completed",
          output: result[0]?.output ?? "",
        }).where(eq(provisioningStepsTable.id, stepId));
      } catch (error) {
        await db.update(provisioningStepsTable).set({
          status: "failed",
          errorMessage: error instanceof Error ? error.message : String(error),
        }).where(eq(provisioningStepsTable.id, stepId));
        anyFailed = true;
        break;
      }
    }
  }

  const finalStatus = anyFailed ? "failed" : "completed";
  await db.update(provisioningJobsTable).set({ status: finalStatus, completedAt: new Date() }).where(eq(provisioningJobsTable.id, jobId));
}

export default router;
