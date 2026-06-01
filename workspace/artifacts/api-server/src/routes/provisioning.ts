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
import { getRequestContext } from "../lib/request-context.js";
import { requireRole } from "../lib/auth.js";
import { buildProvisioningJobReportMarkdown, createProvisioningReport, getProvisioningJobDetail } from "../modules/netops/provisioning.service.js";
import {
  buildProvisioningPreview,
  getProvisioningServiceCatalog,
  isAllowedJobTransition,
} from "../modules/netops/provisioning-preview.service.js";
import { maskParametersForAudit } from "../modules/provisioning/provisioning-preview.service.js";
import { buildL2vpnPreview, buildL3vpnPreview } from "../modules/provisioning/provisioning-preview.service.js";
import { buildProvisioningPreviewViaConnector } from "../modules/provisioning/provisioning-connector.service.js";
import { ensureServiceTemplatesInDb } from "../modules/netops/provisioning-template-seed.js";
import { executeProvisioningJobControlled, validateExecutionEnabledOrThrow } from "../modules/provisioning/provisioning-execute.service.js";
import { runProvisioningPostCheck } from "../modules/provisioning/provisioning-postcheck.service.js";

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

function parseJsonValue<T>(value: string | null | undefined, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function toPositiveInteger(value: unknown, fallback: number): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function serializeProvisioningJob(job: typeof provisioningJobsTable.$inferSelect) {
  const deviceIds = parseDeviceIds(job.deviceIds);
  const targetDevices = parseJsonValue<number[]>(job.targetDevicesJson, deviceIds);
  const parametersJson = parseJsonValue<Record<string, unknown>>(job.parametersJson, {});
  const validationResultJson = parseJsonValue<Record<string, unknown>>(job.validationResultJson, {});
  const renderedConfigJson = parseJsonValue<Record<string, unknown>>(job.renderedConfigJson, {});
  const renderedRollbackJson = parseJsonValue<Record<string, unknown>>(job.renderedRollbackJson, {});
  const renderedValidationJson = parseJsonValue<Record<string, unknown>>(job.renderedValidationJson, {});
  const riskSummaryJson = parseJsonValue<Record<string, unknown>>(job.riskSummaryJson, {});

  return {
    ...job,
    deviceIds,
    targetDevices,
    parametersJson,
    validationResultJson,
    renderedConfigJson,
    renderedRollbackJson,
    renderedValidationJson,
    riskSummaryJson,
    validatedAt: job.validatedAt?.toISOString() ?? null,
    executedAt: job.executedAt?.toISOString() ?? null,
    completedAt: job.completedAt?.toISOString() ?? null,
    approvedAt: job.approvedAt?.toISOString() ?? null,
    updatedAt: job.updatedAt?.toISOString() ?? null,
    createdAt: job.createdAt.toISOString(),
  };
}

function readStructuredParameters(job: typeof provisioningJobsTable.$inferSelect): Record<string, unknown> {
  const fromJson = parseJsonValue<Record<string, unknown>>(job.parametersJson, {});
  if (Object.keys(fromJson).length > 0) {
    return fromJson;
  }
  const fromLegacy = parseJsonValue<Record<string, unknown>>(job.parameters, {});
  return fromLegacy;
}

function isStructuredServiceType(value: string | null | undefined): value is "l2vpn" | "l3vpn" {
  return value === "l2vpn" || value === "l3vpn";
}

function hasBlockingFindings(job: typeof provisioningJobsTable.$inferSelect): boolean {
  const validation = parseJsonValue<{ findings?: Array<{ blocking?: boolean }> }>(job.validationResultJson, {});
  return Boolean(validation.findings?.some((finding) => finding.blocking));
}

function parametersChangedSinceApproval(job: typeof provisioningJobsTable.$inferSelect): boolean {
  if (!job.approvedParametersJson) return false;
  return job.approvedParametersJson !== (job.parametersJson ?? "");
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

async function generateStructuredPreviewForJob(job: typeof provisioningJobsTable.$inferSelect) {
  const parameters = readStructuredParameters(job);
  const deviceIds = parseDeviceIds(job.deviceIds);
  if (isStructuredServiceType(job.serviceType)) {
    if (job.serviceType === "l2vpn") {
      return buildL2vpnPreview({
        deviceAId: toPositiveInteger(parameters.deviceA, deviceIds[0] ?? 0),
        deviceBId: toPositiveInteger(parameters.deviceB, deviceIds[1] ?? deviceIds[0] ?? 0),
        parameters: {
          customerName: String(parameters.customerName ?? job.customerName ?? job.name),
          description: String(parameters.description ?? job.description ?? job.name ?? ""),
          deviceA: toPositiveInteger(parameters.deviceA, deviceIds[0] ?? 0),
          interfaceA: String(parameters.interfaceA ?? ""),
          vlanA: String(parameters.vlanA ?? ""),
          qinqA: parameters.qinqA === undefined || parameters.qinqA === null ? null : String(parameters.qinqA),
          deviceB: toPositiveInteger(parameters.deviceB, deviceIds[1] ?? deviceIds[0] ?? 0),
          interfaceB: String(parameters.interfaceB ?? ""),
          vlanB: String(parameters.vlanB ?? ""),
          qinqB: parameters.qinqB === undefined || parameters.qinqB === null ? null : String(parameters.qinqB),
          type: String(parameters.type ?? "vpws") as "vpws" | "vpls" | "vsi" | "l2vc",
          serviceId: String(parameters.serviceId ?? ""),
          remotePeer: parameters.remotePeer ? String(parameters.remotePeer) : null,
          notes: parameters.notes ? String(parameters.notes) : null,
        },
      });
    }

    return buildL3vpnPreview({
      deviceId: toPositiveInteger(parameters.deviceId, deviceIds[0] ?? 0),
      parameters: {
        customerName: String(parameters.customerName ?? job.customerName ?? job.name),
        description: String(parameters.description ?? job.description ?? job.name ?? ""),
        deviceId: toPositiveInteger(parameters.deviceId, deviceIds[0] ?? 0),
        interfaceName: String(parameters.interfaceName ?? ""),
        vlan: String(parameters.vlan ?? ""),
        vrfName: String(parameters.vrfName ?? ""),
        rd: String(parameters.rd ?? ""),
        rtImport: String(parameters.rtImport ?? ""),
        rtExport: String(parameters.rtExport ?? ""),
        ipWan: String(parameters.ipWan ?? ""),
        peerBgp: String(parameters.peerBgp ?? ""),
        remoteAsn: parameters.remoteAsn === undefined || parameters.remoteAsn === null ? "" : String(parameters.remoteAsn),
        importRoutePolicy: String(parameters.importRoutePolicy ?? ""),
        exportRoutePolicy: String(parameters.exportRoutePolicy ?? ""),
        prefixList: parameters.prefixList ? String(parameters.prefixList) : null,
        communityFilter: parameters.communityFilter ? String(parameters.communityFilter) : null,
        notes: parameters.notes ? String(parameters.notes) : null,
      },
    });
  }

  const legacyPreview = await buildProvisioningPreviewViaConnector({
    deviceId: parseDeviceIds(job.deviceIds)[0] ?? 0,
    templateId: job.templateId ? String(job.templateId) : "",
    parameters,
    mode: "dry_run",
    maintenanceWindowStart: job.maintenanceWindowStart?.toISOString?.() ?? null,
    maintenanceWindowEnd: job.maintenanceWindowEnd?.toISOString?.() ?? null,
    rollbackPlan: job.rollbackPlanGenerated ?? null,
  });

  return legacyPreview;
}

router.get("/provisioning/templates", async (_req, res) => {
  res.json(getProvisioningServiceCatalog());
});

router.get("/provisioning/jobs", async (req, res) => {
  const query = req.query as Record<string, unknown>;
  const jobs = await db.select().from(provisioningJobsTable).orderBy(desc(provisioningJobsTable.createdAt)).limit(200);
  const filtered = jobs.filter((job) => {
    const serviceType = typeof query.serviceType === "string" ? query.serviceType : null;
    const status = typeof query.status === "string" ? query.status : null;
    const approvalStatus = typeof query.approvalStatus === "string" ? query.approvalStatus : null;
    if (serviceType && job.serviceType !== serviceType) return false;
    if (status && job.status !== status) return false;
    if (approvalStatus && job.approvalStatus !== approvalStatus) return false;
    return true;
  });
  res.json(filtered.map(serializeProvisioningJob));
});

router.post("/provisioning/jobs", async (req, res) => {
  const body = req.body as Record<string, unknown>;
  const serviceType = typeof body.serviceType === "string" ? body.serviceType : "";
  if (!serviceType) {
    res.status(400).json({ error: "serviceType is required" });
    return;
  }
  const targetDevices = Array.isArray(body.targetDevices)
    ? body.targetDevices.map((item) => Number(item)).filter((item) => Number.isInteger(item))
    : [];
  const parameters = body.parameters && typeof body.parameters === "object" && !Array.isArray(body.parameters)
    ? body.parameters as Record<string, unknown>
    : {};
  const customerName = String(body.customerName ?? parameters.customerName ?? "");
  const description = String(body.description ?? parameters.description ?? "");
  const context = getRequestContext();

  const [job] = await db.insert(provisioningJobsTable).values({
    name: customerName || description || serviceType,
    type: serviceType,
    status: "draft",
    serviceType,
    customerName: customerName || null,
    description: description || null,
    deviceIds: JSON.stringify(targetDevices),
    targetDevicesJson: JSON.stringify(targetDevices),
    parameters: JSON.stringify(parameters),
    parametersJson: JSON.stringify(parameters),
    approvalStatus: env.provisioningRequireApproval ? "required" : "not_required",
    createdBy: context?.user?.email ?? null,
  }).returning();

  await logAuditEvent({
    action: "provisioning_request_created",
    objectType: "provisioning_job",
    objectId: String(job.id),
    metadata: {
      serviceType,
      targetDevices,
      customerName,
      description,
    },
    sourceIp: getRequestSourceIp(req),
  });

  res.status(201).json(serializeProvisioningJob(job));
});

router.patch("/provisioning/jobs/:id", async (req, res) => {
  const params = Number(req.params.id);
  if (!Number.isInteger(params) || params < 1) {
    res.status(400).json({ error: "Invalid ID" });
    return;
  }
  const [job] = await db.select().from(provisioningJobsTable).where(eq(provisioningJobsTable.id, params)).limit(1);
  if (!job) {
    res.status(404).json({ error: "Not found" });
    return;
  }

  const body = req.body as Record<string, unknown>;
  const nextParameters = body.parameters && typeof body.parameters === "object" && !Array.isArray(body.parameters)
    ? body.parameters as Record<string, unknown>
    : readStructuredParameters(job);
  const nextTargetDevices = Array.isArray(body.targetDevices)
    ? body.targetDevices.map((item) => Number(item)).filter((item) => Number.isInteger(item))
    : parseDeviceIds(job.deviceIds);
  const nextCustomerName = typeof body.customerName === "string" ? body.customerName : job.customerName ?? "";
  const nextDescription = typeof body.description === "string" ? body.description : job.description ?? "";

  const approvalInvalidated = Boolean(job.approvalStatus === "approved" && (
    JSON.stringify(nextParameters) !== (job.approvedParametersJson ?? job.parametersJson ?? JSON.stringify(readStructuredParameters(job)))
    || JSON.stringify(nextTargetDevices) !== JSON.stringify(parseDeviceIds(job.deviceIds))
  ));

  const updatePayload: Record<string, unknown> = {
    customerName: nextCustomerName || null,
    description: nextDescription || null,
    targetDevicesJson: JSON.stringify(nextTargetDevices),
    deviceIds: JSON.stringify(nextTargetDevices),
    parametersJson: JSON.stringify(nextParameters),
    parameters: JSON.stringify(nextParameters),
    updatedAt: new Date(),
  };

  if (approvalInvalidated) {
    updatePayload.approvalStatus = "invalidated";
    updatePayload.status = "draft";
    updatePayload.approvedBy = null;
    updatePayload.approvedByUserId = null;
    updatePayload.approvedAt = null;
    updatePayload.approvedParametersJson = null;
  }

  const [updated] = await db.update(provisioningJobsTable).set(updatePayload).where(eq(provisioningJobsTable.id, params)).returning();
  if (approvalInvalidated) {
    await logAuditEvent({
      action: "provisioning_approval_invalidated",
      objectType: "provisioning_job",
      objectId: String(params),
      metadata: { reason: "parameters_changed_after_approval" },
      sourceIp: getRequestSourceIp(req),
    });
  }
  res.json(serializeProvisioningJob(updated));
});

router.get("/provisioning/jobs/:id", async (req, res) => {
  const params = Number(req.params.id);
  if (!Number.isInteger(params) || params < 1) {
    res.status(400).json({ error: "Invalid ID" });
    return;
  }
  const detail = await buildJobDetail(params);
  if (!detail) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  res.json(detail);
});

router.post("/provisioning/jobs/:id/precheck", async (req, res) => {
  const jobId = Number(req.params.id);
  if (!Number.isInteger(jobId) || jobId < 1) {
    res.status(400).json({ error: "Invalid ID" });
    return;
  }
  const [job] = await db.select().from(provisioningJobsTable).where(eq(provisioningJobsTable.id, jobId)).limit(1);
  if (!job) {
    res.status(404).json({ error: "Not found" });
    return;
  }

  await db.update(provisioningJobsTable).set({ status: "checking", updatedAt: new Date() }).where(eq(provisioningJobsTable.id, jobId));
  await logAuditEvent({
    action: "provisioning_precheck_started",
    objectType: "provisioning_job",
    objectId: String(jobId),
    metadata: { serviceType: job.serviceType ?? job.type },
    sourceIp: getRequestSourceIp(req),
  });

  const preview = await generateStructuredPreviewForJob(job);
  if ("error" in preview) {
    res.status(preview.status).json({ error: preview.error });
    return;
  }

  const blocking = Boolean(preview.findings?.some((finding) => finding.blocking) || preview.blockedReasons.length > 0);
  const nextStatus = blocking ? "check_failed" : "validated";
  await db.update(provisioningJobsTable).set({
    status: nextStatus,
    validationResultJson: preview.validationResultJson ?? null,
    renderedValidationJson: preview.renderedValidationJson ?? null,
    riskSummaryJson: preview.riskSummaryJson ?? null,
    renderedConfigJson: preview.renderedConfigJson ?? null,
    renderedRollbackJson: preview.renderedRollbackJson ?? null,
    updatedAt: new Date(),
  }).where(eq(provisioningJobsTable.id, jobId));

  await logAuditEvent({
    action: "provisioning_precheck_finished",
    objectType: "provisioning_job",
    objectId: String(jobId),
    metadata: {
      blocking,
      findings: preview.findings?.length ?? 0,
      serviceType: job.serviceType ?? job.type,
    },
    sourceIp: getRequestSourceIp(req),
  });

  res.json({
    ...serializeProvisioningJob({
      ...job,
      status: nextStatus,
      validationResultJson: preview.validationResultJson ?? null,
      renderedValidationJson: preview.renderedValidationJson ?? null,
      renderedConfigJson: preview.renderedConfigJson ?? null,
      renderedRollbackJson: preview.renderedRollbackJson ?? null,
      riskSummaryJson: preview.riskSummaryJson ?? null,
      updatedAt: new Date(),
    } as typeof provisioningJobsTable.$inferSelect),
    preview,
  });
});

router.post("/provisioning/jobs/:id/preview", async (req, res) => {
  const jobId = Number(req.params.id);
  if (!Number.isInteger(jobId) || jobId < 1) {
    res.status(400).json({ error: "Invalid ID" });
    return;
  }
  const [job] = await db.select().from(provisioningJobsTable).where(eq(provisioningJobsTable.id, jobId)).limit(1);
  if (!job) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  const preview = await generateStructuredPreviewForJob(job);
  if ("error" in preview) {
    res.status(preview.status).json({ error: preview.error });
    return;
  }

  await db.update(provisioningJobsTable).set({
    status: preview.findings?.some((finding) => finding.blocking) ? "blocked" : "preview_ready",
    validationResultJson: preview.validationResultJson ?? null,
    renderedConfigJson: preview.renderedConfigJson ?? null,
    renderedRollbackJson: preview.renderedRollbackJson ?? null,
    renderedValidationJson: preview.renderedValidationJson ?? null,
    riskSummaryJson: preview.riskSummaryJson ?? null,
    updatedAt: new Date(),
  }).where(eq(provisioningJobsTable.id, jobId));

  await logAuditEvent({
    action: "provisioning_preview_generated",
    objectType: "provisioning_job",
    objectId: String(jobId),
    metadata: {
      serviceType: job.serviceType ?? job.type,
      findings: preview.findings?.length ?? 0,
    },
    sourceIp: getRequestSourceIp(req),
  });

  res.json({
    ...serializeProvisioningJob({
      ...job,
      status: preview.findings?.some((finding) => finding.blocking) ? "blocked" : "preview_ready",
      validationResultJson: preview.validationResultJson ?? null,
      renderedConfigJson: preview.renderedConfigJson ?? null,
      renderedRollbackJson: preview.renderedRollbackJson ?? null,
      renderedValidationJson: preview.renderedValidationJson ?? null,
      riskSummaryJson: preview.riskSummaryJson ?? null,
      updatedAt: new Date(),
    } as typeof provisioningJobsTable.$inferSelect),
    preview,
  });
});

router.post("/provisioning/jobs/:id/approve", requireRole(["admin", "operator"]), async (req, res) => {
  const jobId = Number(req.params.id);
  if (!Number.isInteger(jobId) || jobId < 1) {
    res.status(400).json({ error: "Invalid ID" });
    return;
  }
  const [job] = await db.select().from(provisioningJobsTable).where(eq(provisioningJobsTable.id, jobId)).limit(1);
  if (!job) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  if (job.approvalStatus === "approved") {
    res.json(serializeProvisioningJob(job));
    return;
  }
  if (hasBlockingFindings(job)) {
    res.status(409).json({ error: "Blocking findings present — precheck/preview must be fixed before approval." });
    return;
  }

  const context = getRequestContext();
  const approvedBy = context?.user?.email ?? context?.user?.name ?? "unknown";
  const [updated] = await db.update(provisioningJobsTable).set({
    approvalStatus: "approved",
    approvedBy,
    approvedByUserId: context?.user?.id ?? null,
    approvedAt: new Date(),
    approvedParametersJson: job.parametersJson ?? job.parameters ?? null,
    status: "approved",
    updatedAt: new Date(),
  }).where(eq(provisioningJobsTable.id, jobId)).returning();

  await logAuditEvent({
    action: "provisioning_approved",
    objectType: "provisioning_job",
    objectId: String(jobId),
    metadata: {
      approvedBy,
      serviceType: job.serviceType ?? job.type,
    },
    sourceIp: getRequestSourceIp(req),
  });

  res.json(serializeProvisioningJob(updated));
});

router.post("/provisioning/jobs/:id/apply", requireRole(["admin", "operator"]), async (req, res) => {
  const jobId = Number(req.params.id);
  if (!Number.isInteger(jobId) || jobId < 1) {
    res.status(400).json({ error: "Invalid ID" });
    return;
  }
  const [job] = await db.select().from(provisioningJobsTable).where(eq(provisioningJobsTable.id, jobId)).limit(1);
  if (!job) {
    res.status(404).json({ error: "Not found" });
    return;
  }

  const blockedReasons: string[] = [];
  if (!env.provisioningApplyEnabled) blockedReasons.push("PROVISIONING_APPLY_ENABLED=false");
  if (!job.approvalStatus || job.approvalStatus !== "approved") blockedReasons.push("Approval required");
  if (hasBlockingFindings(job)) blockedReasons.push("Blocking findings present");
  if (parametersChangedSinceApproval(job)) blockedReasons.push("Parameters changed after approval");

  if (blockedReasons.length > 0) {
    await db.update(provisioningJobsTable).set({
      status: "blocked",
      approvalStatus: "blocked",
      errorMessage: blockedReasons.join("; "),
      updatedAt: new Date(),
    }).where(eq(provisioningJobsTable.id, jobId));
    await logAuditEvent({
      action: "provisioning_apply_blocked",
      objectType: "provisioning_job",
      objectId: String(jobId),
      metadata: { blockedReasons },
      sourceIp: getRequestSourceIp(req),
    });
    res.status(409).json({ error: blockedReasons.join("; "), blockedReasons });
    return;
  }

  if (!env.provisioningExecuteEnabled) {
    await logAuditEvent({
      action: "provisioning_apply_blocked",
      objectType: "provisioning_job",
      objectId: String(jobId),
      metadata: { blockedReasons: ["PROVISIONING_EXECUTE_ENABLED=false"] },
      sourceIp: getRequestSourceIp(req),
    });
    res.status(409).json({ error: "Apply real still requires PROVISIONING_EXECUTE_ENABLED=true", blockedReasons: ["PROVISIONING_EXECUTE_ENABLED=false"] });
    return;
  }

  const result = await executeProvisioningJobControlled(jobId, getRequestContext()?.user?.id ?? null);
  if ("error" in result) {
    await logAuditEvent({
      action: "provisioning_apply_blocked",
      objectType: "provisioning_job",
      objectId: String(jobId),
      metadata: { blockedReasons: [result.error.message] },
      sourceIp: getRequestSourceIp(req),
    });
    res.status(result.error.status).json({ error: result.error.message });
    return;
  }

  await logAuditEvent({
    action: "provisioning_apply",
    objectType: "provisioning_job",
    objectId: String(jobId),
    metadata: { serviceType: job.serviceType ?? job.type },
    sourceIp: getRequestSourceIp(req),
  });

  const [updated] = await db.update(provisioningJobsTable).set({
    status: "closed",
    executedAt: new Date(),
    completedAt: new Date(),
    updatedAt: new Date(),
  }).where(eq(provisioningJobsTable.id, jobId)).returning();

  res.json(serializeProvisioningJob(updated));
});

router.post("/provisioning/jobs/:id/report", async (req, res) => {
  const jobId = Number(req.params.id);
  if (!Number.isInteger(jobId) || jobId < 1) {
    res.status(400).json({ error: "Invalid ID" });
    return;
  }
  const report = await createProvisioningReport(jobId, getRequestContext()?.user?.email ?? "system");
  if (!report) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  await logAuditEvent({
    action: "provisioning_report_generated",
    objectType: "provisioning_job",
    objectId: String(jobId),
    metadata: { reportId: report.id, reportType: report.reportType },
    sourceIp: getRequestSourceIp(req),
  });
  res.status(201).json({
    ...report,
    generatedAt: report.generatedAt.toISOString(),
  });
});

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
    const preview = await buildProvisioningPreviewViaConnector({
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

router.post("/provisioning-jobs/:id/approve", requireRole(["admin", "operator"]), async (req, res) => {
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

  const context = getRequestContext();
  const approvedByUserId = context?.user?.id ?? null;
  const approvedAt = new Date();

  await db.update(provisioningJobsTable).set({
    status: "approved",
    approvedByUserId,
    approvedAt,
  }).where(eq(provisioningJobsTable.id, params.data.id));

  await logAuditEvent({
    action: "provisioning_approve",
    objectType: "provisioning_job",
    objectId: String(params.data.id),
    metadata: {
      jobName: detail.name,
      jobType: detail.type,
      approvedBy: context?.user?.email ?? "unknown",
      executeEnabled: env.provisioningExecuteEnabled,
    },
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

router.post("/provisioning-jobs/:id/execute", requireRole(["admin", "operator"]), async (req, res) => {
  const params = ExecuteProvisioningJobParams.safeParse({ id: Number(req.params.id) });
  if (!params.success) {
    res.status(400).json({ error: "Invalid ID" });
    return;
  }

  // 1. Validar feature flag
  const flagError = validateExecutionEnabledOrThrow();
  if (flagError) {
    await logAuditEvent({
      action: "provisioning_execute_blocked",
      objectType: "provisioning_job",
      objectId: String(params.data.id),
      metadata: { reason: "PROVISIONING_EXECUTE_ENABLED=false" },
      sourceIp: getRequestSourceIp(req),
    });
    res.status(flagError.status).json({ error: flagError.message });
    return;
  }

  // 2. Executar via serviço controlado
  const context = getRequestContext();
  const result = await executeProvisioningJobControlled(params.data.id, context?.user?.id ?? null);

  if ("error" in result) {
    await logAuditEvent({
      action: "provisioning_execute_failed",
      objectType: "provisioning_job",
      objectId: String(params.data.id),
      metadata: { reason: result.error.message },
      sourceIp: getRequestSourceIp(req),
    });
    res.status(result.error.status).json({ error: result.error.message });
    return;
  }

  // 3. Log sucesso
  const [job] = await db.select().from(provisioningJobsTable).where(eq(provisioningJobsTable.id, params.data.id));
  await logAuditEvent({
    action: "provisioning_execute",
    objectType: "provisioning_job",
    objectId: String(params.data.id),
    metadata: {
      jobName: job?.name,
      jobType: job?.type,
      executedBy: context?.user?.email,
    },
    sourceIp: getRequestSourceIp(req),
  });

  const detail = await buildJobDetail(params.data.id);
  if (!detail) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  res.json(detail);

});

router.post("/provisioning-jobs/:id/rollback", requireRole(["admin", "operator"]), async (req, res) => {
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

  if (!job.rollbackPlanGenerated) {
    res.status(409).json({ error: "Rollback plan nunca foi gerado. Execute o job primeiro." });
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

// FASE v0.7.0: Novos endpoints para execução controlada

router.post("/provisioning-jobs/:id/postcheck", requireRole(["admin", "operator"]), async (req, res) => {
  const params = GetProvisioningJobParams.safeParse({ id: Number(req.params.id) });
  if (!params.success) {
    res.status(400).json({ error: "Invalid ID" });
    return;
  }

  const result = await runProvisioningPostCheck(params.data.id);

  if ("error" in result) {
    await logAuditEvent({
      action: "provisioning_postcheck_failed",
      objectType: "provisioning_job",
      objectId: String(params.data.id),
      metadata: { reason: result.error },
      sourceIp: getRequestSourceIp(req),
    });
    res.status(result.status).json({ error: result.error });
    return;
  }

  await logAuditEvent({
    action: "provisioning_postcheck",
    objectType: "provisioning_job",
    objectId: String(params.data.id),
    metadata: {
      passed: result.passed,
      status: result.status,
      outputLength: result.output.length,
    },
    sourceIp: getRequestSourceIp(req),
  });

  const detail = await buildJobDetail(params.data.id);
  res.json(detail);
});

router.get("/provisioning-jobs/:id/rollback-preview", requireRole(["admin", "operator"]), async (req, res) => {
  const params = GetProvisioningJobParams.safeParse({ id: Number(req.params.id) });
  if (!params.success) {
    res.status(400).json({ error: "Invalid ID" });
    return;
  }

  const [job] = await db.select().from(provisioningJobsTable).where(eq(provisioningJobsTable.id, params.data.id));
  if (!job) {
    res.status(404).json({ error: "Not found" });
    return;
  }

  await logAuditEvent({
    action: "provisioning_rollback_preview",
    objectType: "provisioning_job",
    objectId: String(params.data.id),
    metadata: { jobName: job.name, hasPlan: Boolean(job.rollbackPlanGenerated) },
    sourceIp: getRequestSourceIp(req),
  });

  res.json({
    jobId: job.id,
    rollbackPlan: job.rollbackPlanGenerated ?? null,
    generated: job.rollbackPlanGenerated ? true : false,
  });
});

export default router;
