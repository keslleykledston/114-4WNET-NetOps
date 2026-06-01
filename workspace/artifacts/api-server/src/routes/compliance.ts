import { Router } from "express";
import { db } from "@workspace/db";
import {
  compliancePoliciesTable,
  complianceJobsTable,
  complianceFindingsTable,
  complianceDriftsTable,
  devicesTable,
} from "@workspace/db";
import { compliancePolicyProfilesTable } from "@workspace/db/schema";
import { eq, desc } from "drizzle-orm";
import {
  CreateCompliancePolicyBody,
  UpdateCompliancePolicyBody,
  GetCompliancePolicyParams,
  UpdateCompliancePolicyParams,
  DeleteCompliancePolicyParams,
  CreateComplianceJobBody,
  GetComplianceJobParams,
  ExecuteComplianceJobParams,
  ListComplianceJobsQueryParams,
} from "@workspace/api-zod";
import { getRequestSourceIp, logAuditEvent } from "../lib/audit.js";
import { executeComplianceJob } from "../modules/compliance/compliance-engine.js";
import { COMPLIANCE_ENGINE_VERSION, COMPLIANCE_PARSER_VERSION, INTERFACE_PARSER_VERSION } from "../modules/netops/versioning.js";

const router = Router();
type FindingFreshness = "current" | "stale" | "legacy" | "superseded";

function isTruthyQuery(value: unknown): boolean {
  return value === true || value === "true" || value === "1" || value === "yes";
}

function freshnessQuery(value: unknown): FindingFreshness | "all" {
  return value === "current" || value === "stale" || value === "legacy" || value === "superseded" || value === "all"
    ? value
    : "all";
}

function metadataRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function latestJobMap(jobs: Array<{ id: number; deviceId: number; createdAt: Date }>) {
  const latest = new Map<number, { id: number; createdAt: Date }>();
  for (const job of jobs) {
    const current = latest.get(job.deviceId);
    if (!current || job.createdAt > current.createdAt || (job.createdAt.getTime() === current.createdAt.getTime() && job.id > current.id)) {
      latest.set(job.deviceId, { id: job.id, createdAt: job.createdAt });
    }
  }
  return latest;
}

function findingFreshness(row: { jobId: number; deviceId: number | null; metadataJson: unknown }, latestByDevice: Map<number, { id: number }>): FindingFreshness {
  const metadata = metadataRecord(row.metadataJson);
  if (!metadata.complianceEngineVersion || !metadata.parserVersion) return "legacy";
  if (metadata.complianceEngineVersion !== COMPLIANCE_ENGINE_VERSION || metadata.parserVersion !== COMPLIANCE_PARSER_VERSION) return "stale";
  if (row.deviceId && latestByDevice.get(row.deviceId)?.id !== row.jobId) return "superseded";
  return "current";
}

function versionFields(metadataJson: unknown) {
  const metadata = metadataRecord(metadataJson);
  const parserVersions = metadataRecord(metadata.parserVersions);
  return {
    complianceEngineVersion: typeof metadata.complianceEngineVersion === "string" ? metadata.complianceEngineVersion : null,
    parserVersion: typeof metadata.parserVersion === "string" ? metadata.parserVersion : null,
    interfaceParserVersion: typeof parserVersions.interface === "string" ? parserVersions.interface : null,
  };
}

// ── POLICY PROFILES HANDLERS ────────────────────────────────────────────────

async function listPolicyProfiles(req: any, res: any) {
  const profiles = await db.select().from(compliancePolicyProfilesTable).orderBy(compliancePolicyProfilesTable.name);
  res.json(profiles.map(p => ({
    ...p,
    createdAt: p.createdAt.toISOString(),
    updatedAt: p.updatedAt.toISOString(),
  })));
}

async function createPolicyProfile(req: any, res: any) {
  const { name, description, deviceRole, vendor, platform, rulesJson, thresholdsJson } = req.body;
  if (!name) { res.status(400).json({ error: "name required" }); return; }
  const [profile] = await db.insert(compliancePolicyProfilesTable).values({
    name,
    description: description ?? null,
    deviceRole: deviceRole ?? null,
    vendor: vendor ?? null,
    platform: platform ?? null,
    rulesJson: rulesJson ?? {},
    thresholdsJson: thresholdsJson ?? {},
  }).returning();
  await logAuditEvent({
    action: "compliance_profile_created",
    objectType: "compliance_policy_profile",
    objectId: String(profile.id),
    metadata: { name: profile.name },
    sourceIp: getRequestSourceIp(req),
  });
  res.status(201).json({
    ...profile,
    createdAt: profile.createdAt.toISOString(),
    updatedAt: profile.updatedAt.toISOString(),
  });
}

async function getPolicyProfile(req: any, res: any) {
  const [profile] = await db.select().from(compliancePolicyProfilesTable).where(eq(compliancePolicyProfilesTable.name, req.params.name));
  if (!profile) { res.status(404).json({ error: "Not found" }); return; }
  res.json({
    ...profile,
    createdAt: profile.createdAt.toISOString(),
    updatedAt: profile.updatedAt.toISOString(),
  });
}

async function updatePolicyProfile(req: any, res: any) {
  const { description, rulesJson, thresholdsJson, enabled } = req.body;
  const [updated] = await db.update(compliancePolicyProfilesTable)
    .set({
      description: description ?? undefined,
      rulesJson: rulesJson ?? undefined,
      thresholdsJson: thresholdsJson ?? undefined,
      enabled: enabled ?? undefined,
      updatedAt: new Date(),
    })
    .where(eq(compliancePolicyProfilesTable.name, req.params.name))
    .returning();
  if (!updated) { res.status(404).json({ error: "Not found" }); return; }
  await logAuditEvent({
    action: "compliance_profile_updated",
    objectType: "compliance_policy_profile",
    objectId: String(updated.id),
    metadata: { name: updated.name },
    sourceIp: getRequestSourceIp(req),
  });
  res.json({
    ...updated,
    createdAt: updated.createdAt.toISOString(),
    updatedAt: updated.updatedAt.toISOString(),
  });
}

// ── POLICY PROFILES ROUTES (both /compliance-policy-profiles and /compliance/policy-profiles) ──

router.get("/compliance-policy-profiles", listPolicyProfiles);
router.get("/compliance/policy-profiles", listPolicyProfiles);

router.post("/compliance-policy-profiles", createPolicyProfile);
router.post("/compliance/policy-profiles", createPolicyProfile);

router.get("/compliance-policy-profiles/:name", getPolicyProfile);
router.get("/compliance/policy-profiles/:name", getPolicyProfile);

router.patch("/compliance-policy-profiles/:name", updatePolicyProfile);
router.patch("/compliance/policy-profiles/:name", updatePolicyProfile);

// ── POLICIES ────────────────────────────────────────────────────────────────

router.get("/compliance-policies", async (req, res) => {
  const policies = await db.select().from(compliancePoliciesTable).orderBy(compliancePoliciesTable.name);
  res.json(policies.map(p => ({ ...p, createdAt: p.createdAt.toISOString() })));
});

router.post("/compliance-policies", async (req, res) => {
  const parsed = CreateCompliancePolicyBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid body" }); return; }
  const [policy] = await db.insert(compliancePoliciesTable).values({
    ...parsed.data,
    enabled: parsed.data.enabled ?? true,
  }).returning();
  await logAuditEvent({
    action: "compliance_policy_created",
    objectType: "compliance_policy",
    objectId: String(policy.id),
    metadata: { name: policy.name, context: policy.context, severity: policy.severity },
    sourceIp: getRequestSourceIp(req),
  });
  res.status(201).json({ ...policy, createdAt: policy.createdAt.toISOString() });
});

router.get("/compliance-policies/:id", async (req, res) => {
  const params = GetCompliancePolicyParams.safeParse({ id: Number(req.params.id) });
  if (!params.success) { res.status(400).json({ error: "Invalid ID" }); return; }
  const [policy] = await db.select().from(compliancePoliciesTable).where(eq(compliancePoliciesTable.id, params.data.id));
  if (!policy) { res.status(404).json({ error: "Not found" }); return; }
  res.json({ ...policy, createdAt: policy.createdAt.toISOString() });
});

router.patch("/compliance-policies/:id", async (req, res) => {
  const params = UpdateCompliancePolicyParams.safeParse({ id: Number(req.params.id) });
  if (!params.success) { res.status(400).json({ error: "Invalid ID" }); return; }
  const parsed = UpdateCompliancePolicyBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid body" }); return; }
  const [updated] = await db.update(compliancePoliciesTable).set(parsed.data).where(eq(compliancePoliciesTable.id, params.data.id)).returning();
  if (!updated) { res.status(404).json({ error: "Not found" }); return; }
  await logAuditEvent({
    action: "compliance_policy_updated",
    objectType: "compliance_policy",
    objectId: String(updated.id),
    metadata: { name: updated.name, context: updated.context, severity: updated.severity },
    sourceIp: getRequestSourceIp(req),
  });
  res.json({ ...updated, createdAt: updated.createdAt.toISOString() });
});

router.delete("/compliance-policies/:id", async (req, res) => {
  const params = DeleteCompliancePolicyParams.safeParse({ id: Number(req.params.id) });
  if (!params.success) { res.status(400).json({ error: "Invalid ID" }); return; }
  await db.delete(compliancePoliciesTable).where(eq(compliancePoliciesTable.id, params.data.id));
  await logAuditEvent({
    action: "compliance_policy_deleted",
    objectType: "compliance_policy",
    objectId: String(params.data.id),
    metadata: {},
    sourceIp: getRequestSourceIp(req),
  });
  res.status(204).end();
});

// ── JOBS HANDLERS ──────────────────────────────────────────────────────────────

async function listJobs(req: any, res: any) {
  const query = ListComplianceJobsQueryParams.safeParse(req.query);
  const jobs = await db.select({
    id: complianceJobsTable.id,
    deviceId: complianceJobsTable.deviceId,
    deviceHostname: devicesTable.hostname,
    contexts: complianceJobsTable.contexts,
    status: complianceJobsTable.status,
    passCount: complianceJobsTable.passCount,
    failCount: complianceJobsTable.failCount,
    errorMessage: complianceJobsTable.errorMessage,
    startedAt: complianceJobsTable.startedAt,
    completedAt: complianceJobsTable.completedAt,
    createdAt: complianceJobsTable.createdAt,
  })
    .from(complianceJobsTable)
    .leftJoin(devicesTable, eq(complianceJobsTable.deviceId, devicesTable.id))
    .orderBy(desc(complianceJobsTable.createdAt))
    .limit(100);

  const filtered = jobs.filter(j => {
    if (query.success) {
      if (query.data.deviceId && j.deviceId !== query.data.deviceId) return false;
      if (query.data.status && j.status !== query.data.status) return false;
    }
    return true;
  });

  res.json(filtered.map(j => ({
    ...j,
    contexts: JSON.parse(j.contexts ?? "[]"),
    startedAt: j.startedAt?.toISOString() ?? null,
    completedAt: j.completedAt?.toISOString() ?? null,
    createdAt: j.createdAt.toISOString(),
  })));
}

async function getJobSummary(req: any, res: any) {
  const allJobs = await db.select({
    id: complianceJobsTable.id,
    deviceId: complianceJobsTable.deviceId,
    deviceHostname: devicesTable.hostname,
    contexts: complianceJobsTable.contexts,
    status: complianceJobsTable.status,
    passCount: complianceJobsTable.passCount,
    failCount: complianceJobsTable.failCount,
    errorMessage: complianceJobsTable.errorMessage,
    startedAt: complianceJobsTable.startedAt,
    completedAt: complianceJobsTable.completedAt,
    createdAt: complianceJobsTable.createdAt,
  })
    .from(complianceJobsTable)
    .leftJoin(devicesTable, eq(complianceJobsTable.deviceId, devicesTable.id))
    .orderBy(desc(complianceJobsTable.createdAt));

  const findings = await db.select().from(complianceFindingsTable);

  const totalJobs = allJobs.length;
  const passed = allJobs.filter(j => j.status === "passed").length;
  const failed = allJobs.filter(j => j.status === "failed").length;
  const running = allJobs.filter(j => j.status === "running").length;
  const recentJobs = allJobs.slice(0, 10).map(j => ({
    ...j,
    contexts: JSON.parse(j.contexts ?? "[]"),
    startedAt: j.startedAt?.toISOString() ?? null,
    completedAt: j.completedAt?.toISOString() ?? null,
    createdAt: j.createdAt.toISOString(),
  }));

  const failedFindings = findings.filter(f => (f.status ?? f.result) === "fail");
  const warningFindings = findings.filter(f => (f.status ?? f.result) === "warning");
  const unknownFindings = findings.filter(f => (f.status ?? f.result) === "unknown");
  const criticalFindings = findings.filter(f => f.severity === "critical");
  const byContext = Object.entries(
    failedFindings.reduce((acc, f) => { acc[f.context] = (acc[f.context] ?? 0) + 1; return acc; }, {} as Record<string, number>)
  ).map(([key, count]) => ({ key, count }));

  const bySeverity = Object.entries(
    failedFindings.reduce((acc, f) => { acc[f.severity] = (acc[f.severity] ?? 0) + 1; return acc; }, {} as Record<string, number>)
  ).map(([key, count]) => ({ key, count }));

  res.json({
    totalJobs,
    passed,
    failed,
    running,
    warningFindings: warningFindings.length,
    unknownFindings: unknownFindings.length,
    criticalFindings: criticalFindings.length,
    recentJobs,
    failuresByContext: byContext,
    failuresBySeverity: bySeverity,
  });
}

async function createJob(req: any, res: any) {
  const parsed = CreateComplianceJobBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid body" }); return; }

  const [device] = await db.select().from(devicesTable).where(eq(devicesTable.id, parsed.data.deviceId));
  if (!device) { res.status(400).json({ error: "Device not found" }); return; }

  const parsedData = parsed.data as { deviceId: number; contexts: string[]; policyProfileName?: string };
  const profileName = parsedData.policyProfileName ?? "huawei-vrp-edge-balanced";

  const [job] = await db.insert(complianceJobsTable).values({
    deviceId: parsed.data.deviceId,
    contexts: JSON.stringify(parsed.data.contexts),
    policyProfileName: profileName,
    status: "pending",
    passCount: 0,
    failCount: 0,
  }).returning();

  const result = { ...job, deviceHostname: device.hostname, contexts: parsed.data.contexts, startedAt: null, completedAt: null, policyProfileName: job.policyProfileName, createdAt: job.createdAt.toISOString() };
  res.status(201).json(result);

  await logAuditEvent({
    action: "compliance_create",
    objectType: "compliance_job",
    objectId: String(job.id),
    metadata: { deviceId: job.deviceId, contexts: parsed.data.contexts, policyProfileName: profileName },
    sourceIp: getRequestSourceIp(req),
  });

  executeJob(job.id).catch(() => {});
}

async function getJob(req: any, res: any) {
  const params = GetComplianceJobParams.safeParse({ id: Number(req.params.id) });
  if (!params.success) { res.status(400).json({ error: "Invalid ID" }); return; }
  const detail = await buildJobDetail(params.data.id);
  if (!detail) { res.status(404).json({ error: "Not found" }); return; }
  res.json(detail);
}

async function executeJobHandler(req: any, res: any) {
  const params = ExecuteComplianceJobParams.safeParse({ id: Number(req.params.id) });
  if (!params.success) { res.status(400).json({ error: "Invalid ID" }); return; }

  await db.update(complianceJobsTable).set({ status: "pending", passCount: 0, failCount: 0, errorMessage: null }).where(eq(complianceJobsTable.id, params.data.id));
  await db.delete(complianceFindingsTable).where(eq(complianceFindingsTable.jobId, params.data.id));

  await logAuditEvent({
    action: "compliance_execute",
    objectType: "compliance_job",
    objectId: String(params.data.id),
    metadata: { reset: true },
    sourceIp: getRequestSourceIp(req),
  });

  const detail = await buildJobDetail(params.data.id);
  if (!detail) { res.status(404).json({ error: "Not found" }); return; }
  res.json(detail);

  executeJob(params.data.id).catch(() => {});
}

// ── JOBS ROUTES (both /compliance-jobs and /compliance/jobs) ───────────────────

router.get("/compliance-jobs", listJobs);
router.get("/compliance/jobs", listJobs);

router.get("/compliance-jobs/summary", getJobSummary);
router.get("/compliance/jobs/summary", getJobSummary);

router.post("/compliance-jobs", createJob);
router.post("/compliance/jobs", createJob);

router.get("/compliance-jobs/:id", getJob);
router.get("/compliance/jobs/:id", getJob);

router.post("/compliance-jobs/:id/execute", executeJobHandler);
router.post("/compliance/jobs/:id/execute", executeJobHandler);

// ── REPORT DOWNLOAD ─────────────────────────────────────────────────────────
import { requirePermission } from "../lib/auth.js";
import {
  exportComplianceReport,
  buildReportFilename,
} from "../modules/compliance/report-export/compliance-report-export.service.js";

router.get("/compliance/jobs/:id/report/download", requirePermission("compliance.export"), async (req, res) => {
  try {
    const jobId = Number(req.params.id);
    if (!jobId) {
      res.status(400).json({ error: "Invalid job ID" });
      return;
    }

    const format = req.query.format as "markdown" | "json" | "csv" || "markdown";
    if (!["markdown", "json", "csv"].includes(format)) {
      res.status(400).json({ error: "Invalid format" });
      return;
    }

    // Verify job exists
    const [job] = await db.select().from(complianceJobsTable).where(eq(complianceJobsTable.id, jobId));
    if (!job) {
      res.status(404).json({ error: "Job not found" });
      return;
    }

    // Build filters from query params
    const filters = {
      status: req.query.status as string | undefined,
      severity: req.query.severity as string | undefined,
      context: req.query.context as string | undefined,
      source: req.query.source as string | undefined,
      confidence: req.query.confidence as string | undefined,
      operationalCategory: req.query.operationalCategory as string | undefined,
      freshness: req.query.freshness as string | undefined,
      actionableOnly: isTruthyQuery(req.query.actionableOnly),
    };

    const { content, contentType } = await exportComplianceReport(jobId, format, filters);
    const filename = buildReportFilename(jobId, format);

    // Audit logging
    const findings = await db.select().from(complianceFindingsTable).where(eq(complianceFindingsTable.jobId, jobId));
    await logAuditEvent({
      action: "compliance_report_download",
      objectType: "compliance_job",
      objectId: String(jobId),
      metadata: {
        format,
        findingsCount: findings.length,
        filters,
        sanitized: true,
      },
      sourceIp: getRequestSourceIp(req),
    });

    res.setHeader("Content-Type", contentType);
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.send(content);
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : "Report generation failed",
    });
  }
});

// ── FINDINGS EXPORT ─────────────────────────────────────────────────────────
import { exportFindingsCsv, exportGroupsCsv } from "../modules/compliance/report-export/compliance-report-csv.js";

router.get("/compliance/findings/export", requirePermission("compliance.export"), async (req, res) => {
  try {
    const format = req.query.format as "csv" | "json" || "csv";
    if (!["csv", "json"].includes(format)) {
      res.status(400).json({ error: "Invalid format" });
      return;
    }

    const rows = await db.select({
      id: complianceFindingsTable.id,
      jobId: complianceFindingsTable.jobId,
      policyId: complianceFindingsTable.policyId,
      policyName: complianceFindingsTable.policyName,
      severity: complianceFindingsTable.severity,
      context: complianceFindingsTable.context,
      status: complianceFindingsTable.status,
      message: complianceFindingsTable.message,
      recommendation: complianceFindingsTable.recommendation,
      source: complianceFindingsTable.source,
      confidence: complianceFindingsTable.confidence,
      objectType: complianceFindingsTable.objectType,
      objectName: complianceFindingsTable.objectName,
      ruleId: complianceFindingsTable.ruleId,
      ruleName: complianceFindingsTable.ruleName,
      operationalCategory: complianceFindingsTable.operationalCategory,
      metadataJson: complianceFindingsTable.metadataJson,
      deviceId: complianceJobsTable.deviceId,
      deviceHostname: devicesTable.hostname,
    }).from(complianceFindingsTable)
      .innerJoin(complianceJobsTable, eq(complianceFindingsTable.jobId, complianceJobsTable.id))
      .innerJoin(devicesTable, eq(complianceJobsTable.deviceId, devicesTable.id));

    const findings = rows.map((r) => {
      const metadata = (r.metadataJson as Record<string, unknown>) || {};
      return {
        id: r.id,
        jobId: r.jobId,
        deviceId: r.deviceId!,
        deviceHostname: r.deviceHostname,
        status: r.status || "unknown",
        severity: r.severity,
        context: r.context,
        operationalCategory: r.operationalCategory || "unknown",
        freshness: (metadata.freshness as string) || "fresh",
        source: r.source || "unknown",
        confidence: r.confidence || "medium",
        ruleId: r.ruleId || "unknown",
        ruleName: r.ruleName || "unknown",
        objectType: r.objectType || "unknown",
        objectName: r.objectName || "unknown",
        message: r.message || "",
        recommendation: r.recommendation || "",
        createdAt: r.id.toString(),
      };
    });

    let content: string;
    let contentType: string;

    if (format === "csv") {
      content = exportFindingsCsv(findings);
      contentType = "text/csv; charset=utf-8";
    } else {
      content = JSON.stringify(findings, null, 2);
      contentType = "application/json";
    }

    const timestamp = new Date().toISOString().slice(0, 10);
    const ext = format;
    const filename = `compliance-findings-${timestamp}.${ext}`;

    await logAuditEvent({
      action: "compliance_findings_export",
      objectType: "compliance_findings",
      objectId: "bulk",
      metadata: {
        format,
        findingsCount: findings.length,
        sanitized: true,
      },
      sourceIp: getRequestSourceIp(req),
    });

    res.setHeader("Content-Type", contentType);
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.send(content);
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : "Export failed",
    });
  }
});

router.get("/compliance/findings/groups/export", requirePermission("compliance.export"), async (req, res) => {
  try {
    const format = req.query.format as "csv" | "json" || "csv";
    if (!["csv", "json"].includes(format)) {
      res.status(400).json({ error: "Invalid format" });
      return;
    }

    const rows = await db.select({
      id: complianceFindingsTable.id,
      jobId: complianceFindingsTable.jobId,
      policyName: complianceFindingsTable.policyName,
      severity: complianceFindingsTable.severity,
      context: complianceFindingsTable.context,
      message: complianceFindingsTable.message,
      ruleId: complianceFindingsTable.ruleId,
      ruleName: complianceFindingsTable.ruleName,
      operationalCategory: complianceFindingsTable.operationalCategory,
      metadataJson: complianceFindingsTable.metadataJson,
    }).from(complianceFindingsTable);

    const groupMap = new Map<string, { count: number; sampleIds: number[]; policyName: string | null; ruleName: string | null; message: string }>();

    for (const row of rows) {
      const metadata = (row.metadataJson as Record<string, unknown>) || {};
      const freshness = (metadata.freshness as string) || "fresh";
      const key = `${row.ruleId || "unknown"}|${row.policyName}|${row.context}|${row.severity}|${row.operationalCategory || "unknown"}|${freshness}`;

      if (!groupMap.has(key)) {
        groupMap.set(key, {
          count: 0,
          sampleIds: [],
          policyName: row.policyName,
          ruleName: row.ruleName,
          message: row.message || "",
        });
      }

      const group = groupMap.get(key)!;
      group.count++;
      if (group.sampleIds.length < 5) {
        group.sampleIds.push(row.id);
      }
    }

    const groups = Array.from(groupMap.entries()).map(([key, data]) => {
      const [ruleId, policyName, context, severity, category, freshness] = key.split("|");
      return {
        ruleId: ruleId || "unknown",
        ruleName: data.ruleName || "unknown",
        policyName: data.policyName || "unknown",
        context,
        severity,
        operationalCategory: category,
        freshness,
        message: data.message,
        count: data.count,
        sampleFindingIds: data.sampleIds,
      };
    });

    let content: string;
    let contentType: string;

    if (format === "csv") {
      content = exportGroupsCsv(groups);
      contentType = "text/csv; charset=utf-8";
    } else {
      content = JSON.stringify(groups, null, 2);
      contentType = "application/json";
    }

    const timestamp = new Date().toISOString().slice(0, 10);
    const ext = format;
    const filename = `compliance-groups-${timestamp}.${ext}`;

    await logAuditEvent({
      action: "compliance_groups_export",
      objectType: "compliance_findings",
      objectId: "groups",
      metadata: {
        format,
        groupsCount: groups.length,
      },
      sourceIp: getRequestSourceIp(req),
    });

    res.setHeader("Content-Type", contentType);
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.send(content);
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : "Export failed",
    });
  }
});

// ── FINDINGS ────────────────────────────────────────────────────────────────

router.get("/compliance-findings", async (req, res) => {
  const jobs = await db.select({
    id: complianceJobsTable.id,
    deviceId: complianceJobsTable.deviceId,
    createdAt: complianceJobsTable.createdAt,
  }).from(complianceJobsTable);
  const latestByDevice = latestJobMap(jobs);
  const selectedFreshness = freshnessQuery(req.query.freshness);
  const latestOnly = isTruthyQuery(req.query.latestJobOnly);

  const rows = await db.select({
    id: complianceFindingsTable.id,
    jobId: complianceFindingsTable.jobId,
    deviceId: complianceJobsTable.deviceId,
    deviceHostname: devicesTable.hostname,
    policyId: complianceFindingsTable.policyId,
    policyName: complianceFindingsTable.policyName,
    severity: complianceFindingsTable.severity,
    context: complianceFindingsTable.context,
    result: complianceFindingsTable.result,
    detail: complianceFindingsTable.detail,
    evidence: complianceFindingsTable.evidence,
    status: complianceFindingsTable.status,
    message: complianceFindingsTable.message,
    recommendation: complianceFindingsTable.recommendation,
    blocking: complianceFindingsTable.blocking,
    source: complianceFindingsTable.source,
    confidence: complianceFindingsTable.confidence,
    objectType: complianceFindingsTable.objectType,
    objectId: complianceFindingsTable.objectId,
    objectName: complianceFindingsTable.objectName,
    ruleId: complianceFindingsTable.ruleId,
    ruleName: complianceFindingsTable.ruleName,
    operationalCategory: complianceFindingsTable.operationalCategory,
    rawReference: complianceFindingsTable.rawReference,
    metadataJson: complianceFindingsTable.metadataJson,
    jobCreatedAt: complianceJobsTable.createdAt,
  })
    .from(complianceFindingsTable)
    .leftJoin(complianceJobsTable, eq(complianceFindingsTable.jobId, complianceJobsTable.id))
    .leftJoin(devicesTable, eq(complianceJobsTable.deviceId, devicesTable.id))
    .orderBy(desc(complianceFindingsTable.id))
    .limit(500);

  const filtered = rows.filter((row) => {
    const freshness = findingFreshness(row, latestByDevice);
    if (latestOnly && (!row.deviceId || latestByDevice.get(row.deviceId)?.id !== row.jobId)) return false;
    if (selectedFreshness !== "all" && freshness !== selectedFreshness) return false;
    if (req.query.status && (row.status ?? row.result) !== String(req.query.status)) return false;
    if (req.query.severity && row.severity !== String(req.query.severity)) return false;
    if (req.query.context && row.context !== String(req.query.context)) return false;
    if (req.query.confidence && row.confidence !== String(req.query.confidence)) return false;
    if (req.query.source && row.source !== String(req.query.source)) return false;
    if (req.query.operationalCategory && row.operationalCategory !== String(req.query.operationalCategory)) return false;
    if (req.query.deviceId && row.deviceId !== Number(req.query.deviceId)) return false;
    return true;
  });

  res.json(filtered.map((row) => ({
    ...row,
    ...versionFields(row.metadataJson),
    freshness: findingFreshness(row, latestByDevice),
    isLatestJobForDevice: row.deviceId ? latestByDevice.get(row.deviceId)?.id === row.jobId : false,
    status: row.status ?? row.result,
    message: row.message ?? row.detail,
    jobCreatedAt: row.jobCreatedAt?.toISOString() ?? null,
  })));
});

async function getJobDetail(id: number, res: any) {
  const detail = await buildJobDetail(id);
  if (!detail) { res.status(404).json({ error: "Not found" }); return; }
  res.json(detail);
}

async function buildJobDetail(id: number) {
  const [job] = await db.select({
    id: complianceJobsTable.id,
    deviceId: complianceJobsTable.deviceId,
    deviceHostname: devicesTable.hostname,
    contexts: complianceJobsTable.contexts,
    status: complianceJobsTable.status,
    passCount: complianceJobsTable.passCount,
    failCount: complianceJobsTable.failCount,
    errorMessage: complianceJobsTable.errorMessage,
    startedAt: complianceJobsTable.startedAt,
    completedAt: complianceJobsTable.completedAt,
    createdAt: complianceJobsTable.createdAt,
  })
    .from(complianceJobsTable)
    .leftJoin(devicesTable, eq(complianceJobsTable.deviceId, devicesTable.id))
    .where(eq(complianceJobsTable.id, id));
  if (!job) return null;

  const findings = await db.select().from(complianceFindingsTable).where(eq(complianceFindingsTable.jobId, id));

  return {
    ...job,
    contexts: JSON.parse(job.contexts ?? "[]"),
    startedAt: job.startedAt?.toISOString() ?? null,
    completedAt: job.completedAt?.toISOString() ?? null,
    createdAt: job.createdAt.toISOString(),
    findings,
  };
}

router.get("/compliance-findings-freshness-summary", async (_req, res) => {
  const jobs = await db.select({
    id: complianceJobsTable.id,
    deviceId: complianceJobsTable.deviceId,
    deviceHostname: devicesTable.hostname,
    status: complianceJobsTable.status,
    createdAt: complianceJobsTable.createdAt,
    completedAt: complianceJobsTable.completedAt,
  })
    .from(complianceJobsTable)
    .leftJoin(devicesTable, eq(complianceJobsTable.deviceId, devicesTable.id));
  const latestByDevice = latestJobMap(jobs.map((job) => ({ id: job.id, deviceId: job.deviceId, createdAt: job.createdAt })));
  const latestJobs = jobs
    .filter((job) => latestByDevice.get(job.deviceId)?.id === job.id)
    .sort((a, b) => a.deviceHostname?.localeCompare(b.deviceHostname ?? "") ?? 0)
    .map((job) => ({
      id: job.id,
      deviceId: job.deviceId,
      deviceHostname: job.deviceHostname,
      status: job.status,
      createdAt: job.createdAt.toISOString(),
      completedAt: job.completedAt?.toISOString() ?? null,
    }));

  const findings = await db.select({
    jobId: complianceFindingsTable.jobId,
    metadataJson: complianceFindingsTable.metadataJson,
    deviceId: complianceJobsTable.deviceId,
  })
    .from(complianceFindingsTable)
    .leftJoin(complianceJobsTable, eq(complianceFindingsTable.jobId, complianceJobsTable.id))
    .limit(5000);

  const counts = { current: 0, stale: 0, legacy: 0, superseded: 0 };
  for (const finding of findings) {
    const freshness = findingFreshness(finding, latestByDevice);
    counts[freshness] += 1;
  }

  res.json({
    ...counts,
    totalFindings: findings.length,
    latestJobs,
    currentComplianceEngineVersion: COMPLIANCE_ENGINE_VERSION,
    currentParserVersion: COMPLIANCE_PARSER_VERSION,
    currentInterfaceParserVersion: INTERFACE_PARSER_VERSION,
  });
});

router.get("/compliance-findings-groups", async (req, res) => {
  const jobs = await db.select({
    id: complianceJobsTable.id,
    deviceId: complianceJobsTable.deviceId,
    createdAt: complianceJobsTable.createdAt,
  }).from(complianceJobsTable);
  const latestByDevice = latestJobMap(jobs);
  const selectedFreshness = freshnessQuery(req.query.freshness);
  const latestOnly = isTruthyQuery(req.query.latestJobOnly);

  const rows = await db.select({
    id: complianceFindingsTable.id,
    jobId: complianceFindingsTable.jobId,
    policyName: complianceFindingsTable.policyName,
    severity: complianceFindingsTable.severity,
    context: complianceFindingsTable.context,
    message: complianceFindingsTable.message,
    detail: complianceFindingsTable.detail,
    status: complianceFindingsTable.status,
    result: complianceFindingsTable.result,
    source: complianceFindingsTable.source,
    confidence: complianceFindingsTable.confidence,
    ruleId: complianceFindingsTable.ruleId,
    ruleName: complianceFindingsTable.ruleName,
    operationalCategory: complianceFindingsTable.operationalCategory,
    metadataJson: complianceFindingsTable.metadataJson,
    deviceId: complianceJobsTable.deviceId,
  })
    .from(complianceFindingsTable)
    .leftJoin(complianceJobsTable, eq(complianceFindingsTable.jobId, complianceJobsTable.id))
    .orderBy(desc(complianceFindingsTable.id))
    .limit(500);

  const filtered = rows.filter((row) => {
    const freshness = findingFreshness(row, latestByDevice);
    if (latestOnly && (!row.deviceId || latestByDevice.get(row.deviceId)?.id !== row.jobId)) return false;
    if (selectedFreshness !== "all" && freshness !== selectedFreshness) return false;
    if (req.query.status && (row.status ?? row.result) !== String(req.query.status)) return false;
    if (req.query.severity && row.severity !== String(req.query.severity)) return false;
    if (req.query.context && row.context !== String(req.query.context)) return false;
    if (req.query.confidence && row.confidence !== String(req.query.confidence)) return false;
    if (req.query.source && row.source !== String(req.query.source)) return false;
    if (req.query.deviceId && row.deviceId !== Number(req.query.deviceId)) return false;
    if (req.query.operationalCategory && row.operationalCategory !== String(req.query.operationalCategory)) return false;
    return true;
  });

  const groups = new Map<string, {
    count: number;
    examples: string[];
    ruleName: string | null;
    policyName: string | null;
    message: string;
  }>();
  for (const row of filtered) {
    const ruleId = row.ruleId ?? row.policyName ?? "unknown";
    const message = row.message ?? row.detail ?? "Sem mensagem normalizada";
    const key = `${ruleId}|${row.severity}|${row.context}|${row.operationalCategory ?? "unknown"}|${message}`;
    if (!groups.has(key)) {
      groups.set(key, {
        count: 0,
        examples: [],
        ruleName: row.ruleName,
        policyName: row.policyName,
        message,
      });
    }
    const group = groups.get(key)!;
    group.count++;
    if (group.examples.length < 3) group.examples.push(String(row.id));
  }

  const result = Array.from(groups.entries()).map(([key, data]) => {
    const [ruleId, severity, context, category] = key.split("|");
    return {
      ruleId,
      ruleName: data.ruleName,
      severity,
      context,
      operationalCategory: category,
      policyName: data.policyName,
      count: data.count,
      sampleFindingIds: data.examples,
      exampleFindingIds: data.examples,
      message: data.message,
    };
  }).sort((a, b) => b.count - a.count);

  res.json(result);
});

// ── NEW ROUTES (FASE v0.9.0) ────────────────────────────────────────────────

import { calculateComplianceScore } from "../modules/compliance/compliance-engine.js";
import { detectDriftForDevice, getLatestDriftForDevice } from "../modules/compliance/drift-detector.service.js";
import { generateRemediationPreview } from "../modules/compliance/remediation-preview.service.js";

// POST /compliance/run/device/:id — Trigger compliance + drift for single device
router.post("/compliance/run/device/:id", requirePermission("compliance.execute"), async (req, res) => {
  try {
    const deviceId = Number(req.params.id);
    if (!deviceId) {
      res.status(400).json({ error: "Invalid device ID" });
      return;
    }

    const [device] = await db.select().from(devicesTable).where(eq(devicesTable.id, deviceId)).limit(1);
    if (!device) {
      res.status(404).json({ error: "Device not found" });
      return;
    }

    // Create and execute compliance job
    const [job] = await db
      .insert(complianceJobsTable)
      .values({
        deviceId,
        contexts: JSON.stringify(["security", "ntp", "snmp", "interface", "bgp", "l3vpn", "l2vpn"]),
        policyProfileName: "huawei-vrp-edge-balanced",
        status: "pending",
      })
      .returning();

    await logAuditEvent({
      action: "compliance_run_device",
      objectType: "device",
      objectId: String(deviceId),
      metadata: { jobId: job.id },
      sourceIp: getRequestSourceIp(req),
    });

    // Trigger execution asynchronously
    void executeJob(job.id).catch(() => {});

    // Trigger drift detection asynchronously
    void detectDriftForDevice(deviceId).catch(() => {});

    res.status(201).json({
      jobId: job.id,
      deviceId,
      status: "pending",
      createdAt: job.createdAt.toISOString(),
    });
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : "Internal server error" });
  }
});

// POST /compliance/run/site/:siteName — Trigger compliance for all devices in site
router.post("/compliance/run/site/:siteName", requirePermission("compliance.execute"), async (req, res) => {
  try {
    const siteName = Array.isArray(req.params.siteName) ? req.params.siteName[0] : req.params.siteName;
    if (!siteName) {
      res.status(400).json({ error: "Invalid site name" });
      return;
    }

    const devices = await db.select().from(devicesTable).where(eq(devicesTable.site, siteName));

    const jobIds: number[] = [];
    for (const device of devices) {
      const [job] = await db
        .insert(complianceJobsTable)
        .values({
          deviceId: device.id,
          contexts: JSON.stringify(["security", "ntp", "snmp", "interface", "bgp", "l3vpn", "l2vpn"]),
          policyProfileName: "huawei-vrp-edge-balanced",
          status: "pending",
        })
        .returning();

      jobIds.push(job.id);

      // Trigger async
      void executeJob(job.id).catch(() => {});
      void detectDriftForDevice(device.id).catch(() => {});
    }

    await logAuditEvent({
      action: "compliance_run_site",
      objectType: "site",
      objectId: siteName,
      metadata: { deviceCount: devices.length, jobIds },
      sourceIp: getRequestSourceIp(req),
    });

    res.status(201).json({
      siteName,
      deviceCount: devices.length,
      jobIds,
      createdAt: new Date().toISOString(),
    });
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : "Internal server error" });
  }
});

// GET /compliance/dashboard — Dashboard metrics
router.get("/compliance/dashboard", requirePermission("compliance.read"), async (req, res) => {
  try {
    const allJobs = await db.select().from(complianceJobsTable);
    const allFindings = await db.select().from(complianceFindingsTable);

    const passedJobs = allJobs.filter((j) => j.status === "passed").length;
    const failedJobs = allJobs.filter((j) => j.status === "failed").length;
    const runningJobs = allJobs.filter((j) => j.status === "running").length;

    const passFindings = allFindings.filter((f) => (f.status ?? f.result) === "pass").length;
    const failFindingRows = allFindings.filter((f) => (f.status ?? f.result) === "fail");
    const failFindings = failFindingRows.length;
    const warningFindings = allFindings.filter((f) => (f.status ?? f.result) === "warning").length;
    const unknownFindings = allFindings.filter((f) => (f.status ?? f.result) === "unknown").length;

    // Compute scores by device
    const deviceScores = new Map<number, number>();
    for (const job of allJobs) {
      const findings = allFindings.filter((f) => f.jobId === job.id);
      const score = calculateComplianceScore(findings.map((finding) => ({
        ...finding,
        status: finding.status ?? undefined,
      })));
      deviceScores.set(job.deviceId, score);
    }

    // Group by site
    const siteScores = new Map<string, number[]>();
    const devicesByJob = new Map<number, { id: number; hostname: string; site: string }>();

    const devicesWithData = await db
      .select({ id: devicesTable.id, hostname: devicesTable.hostname, site: devicesTable.site })
      .from(devicesTable);

    for (const device of devicesWithData) {
      devicesByJob.set(device.id, device);
    }

    for (const [deviceId, score] of deviceScores) {
      const device = devicesByJob.get(deviceId);
      if (device) {
        const siteScores_ = siteScores.get(device.site) || [];
        siteScores_.push(score);
        siteScores.set(device.site, siteScores_);
      }
    }

    // Average scores by site
    const siteAverages: Record<string, number> = {};
    for (const [site, scores] of siteScores) {
      siteAverages[site] = scores.reduce((a, b) => a + b, 0) / scores.length;
    }

    // Group findings by context
    const byContext: Record<string, number> = {};
    for (const finding of failFindingRows as Array<{ context: string }>) {
      byContext[finding.context] = (byContext[finding.context] ?? 0) + 1;
    }

    // Group findings by vendor
    const byVendor: Record<string, number> = {};
    const vendorMap = new Map<number, string>();
    for (const device of devicesWithData) {
      vendorMap.set(device.id, device.hostname);
    }

    res.json({
      totalJobs: allJobs.length,
      passed: passedJobs,
      failed: failedJobs,
      running: runningJobs,
      passFindings,
      failFindings,
      warningFindings,
      unknownFindings,
      deviceScores: Object.fromEntries(deviceScores),
      siteAverages,
      failuresByContext: byContext,
    });
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : "Internal server error" });
  }
});

// GET /devices/:id/compliance — Device compliance status + score
router.get("/devices/:id/compliance", requirePermission("compliance.read"), async (req, res) => {
  try {
    const deviceId = Number(req.params.id);
    if (!deviceId) {
      res.status(400).json({ error: "Invalid device ID" });
      return;
    }

    const jobs = await db
      .select()
      .from(complianceJobsTable)
      .where(eq(complianceJobsTable.deviceId, deviceId))
      .orderBy(desc(complianceJobsTable.createdAt));

    const [latestJob] = jobs;
    if (!latestJob) {
      res.json({
        deviceId,
        hasData: false,
        message: "No compliance data available",
      });
      return;
    }

    const findings = await db
      .select()
      .from(complianceFindingsTable)
      .where(eq(complianceFindingsTable.jobId, latestJob.id));

    const score = calculateComplianceScore(findings.map((finding) => ({
      ...finding,
      status: finding.status ?? undefined,
    })));
    const failingFindings = findings.filter((f) => (f.status ?? f.result) === "fail").slice(0, 10);

    const remediations = failingFindings.map((f) => {
      const suggestion = generateRemediationPreview({
        ruleId: f.ruleId || f.ruleName || "unknown",
        objectName: f.objectName || undefined,
        severity: f.severity,
        message: f.message || "",
      });
      return { finding: f, remediation: suggestion };
    });

    res.json({
      deviceId,
      jobId: latestJob.id,
      status: latestJob.status,
      score,
      scoreCategory: score >= 100 ? "PASS" : score >= 80 ? "WARNING" : "FAIL",
      passCount: latestJob.passCount,
      failCount: latestJob.failCount,
      totalFindings: findings.length,
      failingFindings: failingFindings.length,
      completedAt: latestJob.completedAt?.toISOString() ?? null,
      remediations,
    });
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : "Internal server error" });
  }
});

// GET /devices/:id/drift — Device drifts
router.get("/devices/:id/drift", requirePermission("compliance.read"), async (req, res) => {
  try {
    const deviceId = Number(req.params.id);
    if (!deviceId) {
      res.status(400).json({ error: "Invalid device ID" });
      return;
    }

    const drifts = await db
      .select()
      .from(complianceDriftsTable)
      .where(eq(complianceDriftsTable.deviceId, deviceId))
      .orderBy(desc(complianceDriftsTable.createdAt));

    res.json(
      drifts.map((d) => ({
        ...d,
        createdAt: d.createdAt.toISOString(),
      }))
    );
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : "Internal server error" });
  }
});

// GET /compliance/drifts — All drifts (paginated)
router.get("/compliance/drifts", requirePermission("compliance.read"), async (req, res) => {
  try {
    const deviceId = req.query.deviceId ? Number(req.query.deviceId) : undefined;
    const limit = Math.min(Number(req.query.limit) || 100, 500);

    const query = deviceId
      ? db
          .select()
          .from(complianceDriftsTable)
          .where(eq(complianceDriftsTable.deviceId, deviceId))
          .orderBy(desc(complianceDriftsTable.createdAt))
          .limit(limit)
      : db.select().from(complianceDriftsTable).orderBy(desc(complianceDriftsTable.createdAt)).limit(limit);

    const drifts = await query;

    res.json(
      drifts.map((d) => ({
        ...d,
        createdAt: d.createdAt.toISOString(),
      }))
    );
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : "Internal server error" });
  }
});

// ── BASELINES (v0.9.1) ──────────────────────────────────────────────────────

import {
  listBaselines,
  getBaseline,
  createBaseline,
  updateBaseline,
  deleteBaseline,
  type CreateBaselineInput,
  type UpdateBaselineInput,
} from "../modules/compliance/compliance-baselines.service.js";
import { getTrends } from "../modules/compliance/compliance-trends.service.js";

router.get("/compliance/baselines", requirePermission("compliance.read"), async (req, res) => {
  try {
    const scopeType = req.query.scopeType as string | undefined;
    const baselines = await listBaselines(scopeType);
    res.json(baselines);
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : "Internal server error" });
  }
});

router.post("/compliance/baselines", requirePermission("compliance.admin"), async (req, res) => {
  try {
    const data: CreateBaselineInput = req.body;
    if (!data.scopeType || !data.name) {
      res.status(400).json({ error: "scopeType and name required" });
      return;
    }
    const baseline = await createBaseline(data);
    await logAuditEvent({
      action: "compliance_baseline_created",
      objectType: "compliance_baseline",
      objectId: String(baseline.id),
      metadata: { scopeType: baseline.scopeType, scopeId: baseline.scopeId, name: baseline.name },
      sourceIp: getRequestSourceIp(req),
    });
    res.status(201).json(baseline);
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : "Internal server error" });
  }
});

router.get("/compliance/baselines/:id", requirePermission("compliance.read"), async (req, res) => {
  try {
    const baseline = await getBaseline(Number(req.params.id));
    if (!baseline) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    res.json(baseline);
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : "Internal server error" });
  }
});

router.put("/compliance/baselines/:id", requirePermission("compliance.admin"), async (req, res) => {
  try {
    const data: UpdateBaselineInput = req.body;
    const baseline = await updateBaseline(Number(req.params.id), data);
    await logAuditEvent({
      action: "compliance_baseline_updated",
      objectType: "compliance_baseline",
      objectId: String(baseline.id),
      metadata: { name: baseline.name },
      sourceIp: getRequestSourceIp(req),
    });
    res.json(baseline);
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : "Internal server error" });
  }
});

router.delete("/compliance/baselines/:id", requirePermission("compliance.admin"), async (req, res) => {
  try {
    await deleteBaseline(Number(req.params.id));
    await logAuditEvent({
      action: "compliance_baseline_deleted",
      objectType: "compliance_baseline",
      objectId: String(req.params.id),
      metadata: {},
      sourceIp: getRequestSourceIp(req),
    });
    res.status(204).end();
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : "Internal server error" });
  }
});

// ── RULES OVERRIDE ──────────────────────────────────────────────────────────

router.get("/compliance/rules", requirePermission("compliance.read"), async (req, res) => {
  try {
    const rules = await db.select().from(compliancePoliciesTable).orderBy(compliancePoliciesTable.name);
    res.json(rules.map((r) => ({ ...r, createdAt: r.createdAt.toISOString() })));
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : "Internal server error" });
  }
});

router.put("/compliance/rules/:id", requirePermission("compliance.admin"), async (req, res) => {
  try {
    const { enabled, severity } = req.body;
    const [updated] = await db
      .update(compliancePoliciesTable)
      .set({
        enabled: enabled !== undefined ? enabled : undefined,
        severity: severity !== undefined ? severity : undefined,
      })
      .where(eq(compliancePoliciesTable.id, Number(req.params.id)))
      .returning();

    if (!updated) {
      res.status(404).json({ error: "Not found" });
      return;
    }

    await logAuditEvent({
      action: "compliance_rule_updated",
      objectType: "compliance_policy",
      objectId: String(updated.id),
      metadata: { name: updated.name, enabled: updated.enabled, severity: updated.severity },
      sourceIp: getRequestSourceIp(req),
    });

    res.json({ ...updated, createdAt: updated.createdAt.toISOString() });
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : "Internal server error" });
  }
});

// ── TRENDS ──────────────────────────────────────────────────────────────────

router.get("/compliance/trends", requirePermission("compliance.read"), async (req, res) => {
  try {
    const scope = (req.query.scope as string) || "global";
    const scopeId = req.query.scopeId as string | number | undefined;
    const days = req.query.days ? Number(req.query.days) : 30;

    if (!["device", "site", "vendor", "global"].includes(scope)) {
      res.status(400).json({ error: "Invalid scope" });
      return;
    }

    const trends = await getTrends({
      scope: scope as any,
      scopeId,
      days,
    });

    res.json(trends);
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : "Internal server error" });
  }
});

// ── COMPLIANCE SCHEDULES (v0.9.2) ──────────────────────────────────────────

import { listScheduledJobs, getScheduledJob, createScheduledJob, updateScheduledJob, deleteScheduledJob, runScheduledJob, listScheduledJobRuns, getScheduledJobRun } from "../modules/scheduler/scheduler.service.js";

router.get("/compliance/schedules", requirePermission("compliance.read"), async (req, res) => {
  try {
    const jobs = await listScheduledJobs();
    const filtered = jobs.filter((j) => j.jobType === "compliance");
    res.json(filtered.map((j: any) => ({
      id: j.id,
      name: j.name,
      targetType: j.targetType,
      targetId: j.targetId,
      contextsJson: j.contextsJson,
      intervalMinutes: j.intervalMinutes,
      enabled: j.enabled,
      lastRunAt: j.lastRunAt ? (typeof j.lastRunAt === "string" ? j.lastRunAt : new Date(j.lastRunAt).toISOString()) : null,
      nextRunAt: j.nextRunAt ? (typeof j.nextRunAt === "string" ? j.nextRunAt : new Date(j.nextRunAt).toISOString()) : null,
    })));
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : "Internal server error" });
  }
});

router.post("/compliance/schedules", requirePermission("compliance.admin"), async (req, res) => {
  try {
    const { name, scopeType, scopeId, intervalHours, contexts, enabled } = req.body;
    if (!name || !scopeType) {
      res.status(400).json({ error: "name and scopeType required" });
      return;
    }

    let targetType: "device" | "device_group" | "all_devices" | "site" | "global" =
      scopeType === "global" ? "global" : scopeType === "site" ? "site" : "device";
    let targetId = null;
    let contextsJson: any = { contexts: Array.isArray(contexts) ? contexts : [] };

    if (scopeType === "site" && scopeId) {
      contextsJson.site = scopeId;
    } else if (scopeType === "device" && scopeId) {
      targetId = Number(scopeId);
    }

    const job = await createScheduledJob({
      name,
      jobType: "compliance",
      targetType,
      targetId,
      contextsJson,
      intervalMinutes: Math.max((intervalHours || 24) * 60, 60),
      enabled: enabled !== false,
    });

    if (!job) {
      res.status(500).json({ error: "Failed to create schedule" });
      return;
    }

    await logAuditEvent({
      action: "compliance_schedule_created",
      objectType: "scheduled_job",
      objectId: String(job.id),
      metadata: { name: job.name, scopeType },
      sourceIp: getRequestSourceIp(req),
    });

    res.status(201).json(job);
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : "Internal server error" });
  }
});

router.get("/compliance/schedules/:id", requirePermission("compliance.read"), async (req, res) => {
  try {
    const job = await getScheduledJob(Number(req.params.id));
    if (!job || job.jobType !== "compliance") {
      res.status(404).json({ error: "Not found" });
      return;
    }
    res.json(job);
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : "Internal server error" });
  }
});

router.put("/compliance/schedules/:id", requirePermission("compliance.admin"), async (req, res) => {
  try {
    const job = await updateScheduledJob(Number(req.params.id), req.body);
    if (!job) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    res.json(job);
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : "Internal server error" });
  }
});

router.delete("/compliance/schedules/:id", requirePermission("compliance.admin"), async (req, res) => {
  try {
    await deleteScheduledJob(Number(req.params.id));
    res.status(204).end();
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : "Internal server error" });
  }
});

router.post("/compliance/schedules/:id/run-now", requirePermission("compliance.admin"), async (req, res) => {
  try {
    const run = await runScheduledJob(Number(req.params.id), "manual", null, getRequestSourceIp(req));
    res.json(run);
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : "Internal server error" });
  }
});

router.get("/compliance/schedules/:id/history", requirePermission("compliance.read"), async (req, res) => {
  try {
    const runs = await listScheduledJobRuns(Number(req.params.id));
    res.json(runs.map((r: any) => ({
      ...r,
      startedAt: r.startedAt ? (typeof r.startedAt === "string" ? r.startedAt : new Date(r.startedAt).toISOString()) : null,
      finishedAt: r.finishedAt ? (typeof r.finishedAt === "string" ? r.finishedAt : new Date(r.finishedAt).toISOString()) : null,
    })));
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : "Internal server error" });
  }
});

export async function executeJob(jobId: number) {
  await executeComplianceJob(jobId);
}

export default router;
