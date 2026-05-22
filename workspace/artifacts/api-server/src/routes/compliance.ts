import { Router } from "express";
import { db } from "@workspace/db";
import {
  compliancePoliciesTable,
  complianceJobsTable,
  complianceFindingsTable,
  devicesTable,
} from "@workspace/db";
import { eq, desc, sql } from "drizzle-orm";
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
import { decrypt } from "../lib/crypto.js";
import { runSSHCommands, getCollectionCommands } from "../lib/ssh.js";
import { getRequestSourceIp, logAuditEvent } from "../lib/audit.js";

const router = Router();

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
  res.json({ ...updated, createdAt: updated.createdAt.toISOString() });
});

router.delete("/compliance-policies/:id", async (req, res) => {
  const params = DeleteCompliancePolicyParams.safeParse({ id: Number(req.params.id) });
  if (!params.success) { res.status(400).json({ error: "Invalid ID" }); return; }
  await db.delete(compliancePoliciesTable).where(eq(compliancePoliciesTable.id, params.data.id));
  res.status(204).end();
});

// ── JOBS ─────────────────────────────────────────────────────────────────────

router.get("/compliance-jobs", async (req, res) => {
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
});

router.get("/compliance-jobs/summary", async (req, res) => {
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

  const failedFindings = findings.filter(f => f.result === "fail");
  const byContext = Object.entries(
    failedFindings.reduce((acc, f) => { acc[f.context] = (acc[f.context] ?? 0) + 1; return acc; }, {} as Record<string, number>)
  ).map(([key, count]) => ({ key, count }));

  const bySeverity = Object.entries(
    failedFindings.reduce((acc, f) => { acc[f.severity] = (acc[f.severity] ?? 0) + 1; return acc; }, {} as Record<string, number>)
  ).map(([key, count]) => ({ key, count }));

  res.json({ totalJobs, passed, failed, running, recentJobs, failuresByContext: byContext, failuresBySeverity: bySeverity });
});

router.post("/compliance-jobs", async (req, res) => {
  const parsed = CreateComplianceJobBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid body" }); return; }

  const [device] = await db.select().from(devicesTable).where(eq(devicesTable.id, parsed.data.deviceId));
  if (!device) { res.status(400).json({ error: "Device not found" }); return; }

  const [job] = await db.insert(complianceJobsTable).values({
    deviceId: parsed.data.deviceId,
    contexts: JSON.stringify(parsed.data.contexts),
    status: "pending",
    passCount: 0,
    failCount: 0,
  }).returning();

  const result = { ...job, deviceHostname: device.hostname, contexts: parsed.data.contexts, startedAt: null, completedAt: null, createdAt: job.createdAt.toISOString() };
  res.status(201).json(result);

  await logAuditEvent({
    action: "compliance_create",
    objectType: "compliance_job",
    objectId: String(job.id),
    metadata: { deviceId: job.deviceId, contexts: parsed.data.contexts },
    sourceIp: getRequestSourceIp(req),
  });

  executeJob(job.id).catch(() => {});
});

router.get("/compliance-jobs/:id", async (req, res) => {
  const params = GetComplianceJobParams.safeParse({ id: Number(req.params.id) });
  if (!params.success) { res.status(400).json({ error: "Invalid ID" }); return; }
  res.json(await getJobDetail(params.data.id, res));
});

router.post("/compliance-jobs/:id/execute", async (req, res) => {
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

export async function executeJob(jobId: number) {
  await db.update(complianceJobsTable).set({ status: "running", startedAt: new Date() }).where(eq(complianceJobsTable.id, jobId));

  const [job] = await db.select().from(complianceJobsTable).where(eq(complianceJobsTable.id, jobId));
  if (!job) return;

  const [device] = await db.select().from(devicesTable).where(eq(devicesTable.id, job.deviceId));
  if (!device) {
    await db.update(complianceJobsTable).set({ status: "error", errorMessage: "Device not found", completedAt: new Date() }).where(eq(complianceJobsTable.id, jobId));
    return;
  }

  const contexts: string[] = JSON.parse(job.contexts ?? "[]");
  const policies = await db.select().from(compliancePoliciesTable).where(eq(compliancePoliciesTable.enabled, true));
  const relevantPolicies = policies.filter(p => contexts.includes(p.context) && (!p.vendor || p.vendor === device.vendor));

  let rawConfig = "";
  try {
    const password = decrypt(device.passwordEncrypted);
    const commands = getCollectionCommands(device.vendor, device.platform);
    const results = await runSSHCommands({ host: device.ipAddress, port: device.sshPort, username: device.username, password }, commands);
    rawConfig = results.map(r => r.output).join("\n\n");

    await db.update(devicesTable).set({ status: "active", lastSeen: new Date(), updatedAt: new Date() }).where(eq(devicesTable.id, device.id));
  } catch {
    await db.update(devicesTable).set({ status: "unreachable", updatedAt: new Date() }).where(eq(devicesTable.id, device.id));
  }

  let passCount = 0;
  let failCount = 0;
  const findings = [];

  for (const policy of relevantPolicies) {
    let result: "pass" | "fail" | "error" = "pass";
    let detail = "";
    let evidence = "";

    try {
      if (!rawConfig) {
        result = "error";
        detail = "Could not collect device configuration via SSH";
      } else if (policy.ruleType === "regex" && policy.rulePattern) {
        const regex = new RegExp(policy.rulePattern, "im");
        if (regex.test(rawConfig)) {
          result = "pass";
          const match = rawConfig.match(regex);
          evidence = match?.[0]?.substring(0, 200) ?? "";
        } else {
          result = "fail";
          detail = `Pattern not found: ${policy.rulePattern}`;
        }
      } else if (policy.ruleType === "presence" && policy.rulePattern) {
        const found = rawConfig.toLowerCase().includes(policy.rulePattern.toLowerCase());
        result = found ? "pass" : "fail";
        if (!found) detail = `Required element not present: ${policy.rulePattern}`;
      } else if (policy.ruleType === "absence" && policy.rulePattern) {
        const found = rawConfig.toLowerCase().includes(policy.rulePattern.toLowerCase());
        result = found ? "fail" : "pass";
        if (found) detail = `Forbidden element found: ${policy.rulePattern}`;
      } else {
        result = "pass";
      }
    } catch (e) {
      result = "error";
      detail = String(e);
    }

    if (result === "pass") passCount++;
    else if (result === "fail") failCount++;

    findings.push({
      jobId,
      policyId: policy.id,
      policyName: policy.name,
      severity: policy.severity,
      context: policy.context,
      result,
      detail: detail || null,
      evidence: evidence || null,
    });
  }

  if (findings.length > 0) {
    await db.insert(complianceFindingsTable).values(findings);
  }

  const finalStatus = failCount > 0 ? "failed" : "passed";
  await db.update(complianceJobsTable).set({
    status: finalStatus,
    passCount,
    failCount,
    completedAt: new Date(),
  }).where(eq(complianceJobsTable.id, jobId));
}

export default router;
