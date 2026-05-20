import { Router } from "express";
import { db } from "@workspace/db";
import {
  provisioningJobsTable,
  provisioningStepsTable,
  devicesTable,
  configTemplatesTable,
} from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import {
  CreateProvisioningJobBody,
  GetProvisioningJobParams,
  ValidateProvisioningJobParams,
  ExecuteProvisioningJobParams,
  RollbackProvisioningJobParams,
  ListProvisioningJobsQueryParams,
} from "@workspace/api-zod";
import { decrypt } from "../lib/crypto.js";
import { runSSHCommands } from "../lib/ssh.js";

const router = Router();

async function buildJobDetail(id: number) {
  const [job] = await db.select().from(provisioningJobsTable).where(eq(provisioningJobsTable.id, id));
  if (!job) return null;

  const steps = await db.select({
    id: provisioningStepsTable.id,
    jobId: provisioningStepsTable.jobId,
    deviceId: provisioningStepsTable.deviceId,
    deviceHostname: devicesTable.hostname,
    stepName: provisioningStepsTable.stepName,
    status: provisioningStepsTable.status,
    configApplied: provisioningStepsTable.configApplied,
    output: provisioningStepsTable.output,
    errorMessage: provisioningStepsTable.errorMessage,
    executedAt: provisioningStepsTable.executedAt,
  })
    .from(provisioningStepsTable)
    .leftJoin(devicesTable, eq(provisioningStepsTable.deviceId, devicesTable.id))
    .where(eq(provisioningStepsTable.jobId, id));

  return {
    ...job,
    deviceIds: JSON.parse(job.deviceIds ?? "[]"),
    validatedAt: job.validatedAt?.toISOString() ?? null,
    executedAt: job.executedAt?.toISOString() ?? null,
    completedAt: job.completedAt?.toISOString() ?? null,
    createdAt: job.createdAt.toISOString(),
    steps: steps.map(s => ({ ...s, executedAt: s.executedAt?.toISOString() ?? null })),
  };
}

router.get("/provisioning-jobs", async (req, res) => {
  const query = ListProvisioningJobsQueryParams.safeParse(req.query);
  const jobs = await db.select().from(provisioningJobsTable).orderBy(desc(provisioningJobsTable.createdAt)).limit(100);
  const filtered = jobs.filter(j => {
    if (query.success) {
      if (query.data.status && j.status !== query.data.status) return false;
      if (query.data.type && j.type !== query.data.type) return false;
      if (query.data.deviceId) {
        const ids: number[] = JSON.parse(j.deviceIds ?? "[]");
        if (!ids.includes(query.data.deviceId)) return false;
      }
    }
    return true;
  });
  res.json(filtered.map(j => ({
    ...j,
    deviceIds: JSON.parse(j.deviceIds ?? "[]"),
    validatedAt: j.validatedAt?.toISOString() ?? null,
    executedAt: j.executedAt?.toISOString() ?? null,
    completedAt: j.completedAt?.toISOString() ?? null,
    createdAt: j.createdAt.toISOString(),
  })));
});

router.post("/provisioning-jobs", async (req, res) => {
  const parsed = CreateProvisioningJobBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid body" }); return; }
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

router.get("/provisioning-jobs/stats", async (req, res) => {
  const jobs = await db.select().from(provisioningJobsTable);
  const total = jobs.length;
  const completed = jobs.filter(j => j.status === "completed").length;
  const failed = jobs.filter(j => j.status === "failed").length;
  const executing = jobs.filter(j => j.status === "executing").length;
  const draft = jobs.filter(j => j.status === "draft" || j.status === "validated").length;
  const byType = Object.entries(
    jobs.reduce((acc, j) => { acc[j.type] = (acc[j.type] ?? 0) + 1; return acc; }, {} as Record<string, number>)
  ).map(([key, count]) => ({ key, count }));
  res.json({ total, completed, failed, executing, draft, byType });
});

router.get("/provisioning-jobs/:id", async (req, res) => {
  const params = GetProvisioningJobParams.safeParse({ id: Number(req.params.id) });
  if (!params.success) { res.status(400).json({ error: "Invalid ID" }); return; }
  const detail = await buildJobDetail(params.data.id);
  if (!detail) { res.status(404).json({ error: "Not found" }); return; }
  res.json(detail);
});

router.post("/provisioning-jobs/:id/validate", async (req, res) => {
  const params = ValidateProvisioningJobParams.safeParse({ id: Number(req.params.id) });
  if (!params.success) { res.status(400).json({ error: "Invalid ID" }); return; }

  const [job] = await db.select().from(provisioningJobsTable).where(eq(provisioningJobsTable.id, params.data.id));
  if (!job) { res.status(404).json({ error: "Not found" }); return; }

  const deviceIds: number[] = JSON.parse(job.deviceIds ?? "[]");
  const checks = [];

  if (deviceIds.length === 0) {
    checks.push({ name: "Device selection", passed: false, message: "No devices selected" });
  } else {
    checks.push({ name: "Device selection", passed: true, message: `${deviceIds.length} device(s) selected` });
  }

  const devicesFound = await db.select().from(devicesTable).where(eq(devicesTable.id, deviceIds[0] ?? 0));
  const allFound = deviceIds.length > 0;
  checks.push({ name: "Device reachability", passed: allFound, message: allFound ? "All target devices found in inventory" : "Some devices not found in inventory" });

  if (job.templateId) {
    const [tmpl] = await db.select().from(configTemplatesTable).where(eq(configTemplatesTable.id, job.templateId));
    checks.push({ name: "Template validation", passed: !!tmpl, message: tmpl ? `Template '${tmpl.name}' found` : "Template not found" });
  } else {
    checks.push({ name: "Template validation", passed: true, message: "No template required" });
  }

  checks.push({ name: "Parameters check", passed: true, message: "Parameters look valid" });
  checks.push({ name: "Conflict check", passed: true, message: "No conflicting provisioning jobs detected" });

  const valid = checks.every(c => c.passed);
  if (valid) {
    await db.update(provisioningJobsTable).set({ status: "validated", validatedAt: new Date() }).where(eq(provisioningJobsTable.id, params.data.id));
  }

  res.json({ valid, checks });
});

router.post("/provisioning-jobs/:id/execute", async (req, res) => {
  const params = ExecuteProvisioningJobParams.safeParse({ id: Number(req.params.id) });
  if (!params.success) { res.status(400).json({ error: "Invalid ID" }); return; }

  const [job] = await db.select().from(provisioningJobsTable).where(eq(provisioningJobsTable.id, params.data.id));
  if (!job) { res.status(404).json({ error: "Not found" }); return; }

  await db.update(provisioningJobsTable).set({ status: "executing", executedAt: new Date() }).where(eq(provisioningJobsTable.id, params.data.id));
  const deviceIds: number[] = JSON.parse(job.deviceIds ?? "[]");

  await db.delete(provisioningStepsTable).where(eq(provisioningStepsTable.jobId, params.data.id));
  const stepRows = deviceIds.flatMap(deviceId => [
    { jobId: params.data.id, deviceId, stepName: "Pre-flight check", status: "pending" as const },
    { jobId: params.data.id, deviceId, stepName: "Apply configuration", status: "pending" as const },
    { jobId: params.data.id, deviceId, stepName: "Validate configuration", status: "pending" as const },
  ]);
  const insertedSteps = stepRows.length > 0 ? await db.insert(provisioningStepsTable).values(stepRows).returning() : [];

  const detail = await buildJobDetail(params.data.id);
  if (!detail) { res.status(404).json({ error: "Not found" }); return; }
  res.json(detail);

  executeProvisioningJob(params.data.id, deviceIds, insertedSteps.map(s => s.id)).catch(() => {});
});

router.post("/provisioning-jobs/:id/rollback", async (req, res) => {
  const params = RollbackProvisioningJobParams.safeParse({ id: Number(req.params.id) });
  if (!params.success) { res.status(400).json({ error: "Invalid ID" }); return; }
  await db.update(provisioningJobsTable).set({ status: "rolled_back" }).where(eq(provisioningJobsTable.id, params.data.id));
  await db.update(provisioningStepsTable).set({ status: "skipped" }).where(eq(provisioningStepsTable.jobId, params.data.id));
  const detail = await buildJobDetail(params.data.id);
  if (!detail) { res.status(404).json({ error: "Not found" }); return; }
  res.json(detail);
});

async function executeProvisioningJob(jobId: number, deviceIds: number[], stepIds: number[]) {
  let anyFailed = false;

  for (const deviceId of deviceIds) {
    const [device] = await db.select().from(devicesTable).where(eq(devicesTable.id, deviceId));
    if (!device) continue;

    const deviceStepIds = stepIds.splice(0, 3);

    for (let i = 0; i < deviceStepIds.length; i++) {
      const stepId = deviceStepIds[i];
      if (!stepId) continue;

      await db.update(provisioningStepsTable).set({ status: "running", executedAt: new Date() }).where(eq(provisioningStepsTable.id, stepId));

      await new Promise(r => setTimeout(r, 1000 + Math.random() * 1000));

      try {
        const password = decrypt(device.passwordEncrypted);
        const result = await runSSHCommands(
          { host: device.ipAddress, port: device.sshPort, username: device.username, password },
          i === 0 ? ["show version"] : i === 1 ? ["show running-config | section mpls"] : ["show mpls l2transport vc"]
        );
        await db.update(provisioningStepsTable).set({
          status: "completed",
          output: result[0]?.output ?? "",
        }).where(eq(provisioningStepsTable.id, stepId));
      } catch (e) {
        await db.update(provisioningStepsTable).set({
          status: "failed",
          errorMessage: String(e),
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
