import { eq } from "drizzle-orm";
import { db, provisioningJobsTable, devicesTable } from "@workspace/db";
import { executeViaConnector, resolveDeviceConnectorContext } from "../connectors/connector-execution.service.js";
import { getProvisioningTemplateById } from "./provisioning-template-registry.js";

export interface PostCheckResult {
  jobId: number;
  passed: boolean;
  status: "passed" | "failed" | "partial";
  output: string;
  timestamp: Date;
}

export async function runProvisioningPostCheck(jobId: number): Promise<PostCheckResult | { error: string; status: number }> {
  // 1. Buscar job
  const [job] = await db.select().from(provisioningJobsTable).where(eq(provisioningJobsTable.id, jobId));
  if (!job) {
    return { error: "Job não encontrado", status: 404 };
  }

  // 2. Validar que job foi completado
  if (job.status !== "completed") {
    return { error: `Job status ${job.status} não permite postcheck. Status deve ser 'completed'.`, status: 409 };
  }

  // 3. Marcar como postcheck_running
  await db.update(provisioningJobsTable)
    .set({ status: "postcheck_running" })
    .where(eq(provisioningJobsTable.id, jobId));

  // 4. Extrair device ID e parâmetros
  let deviceId: number | null = null;
  let parameters: Record<string, unknown> = {};

  try {
    const parsed = JSON.parse(job.deviceIds);
    const ids = Array.isArray(parsed) ? parsed.map((d) => Number(d)).filter((d) => Number.isInteger(d)) : [];
    deviceId = ids[0] ?? null;
  } catch {
    // Sem device IDs
  }

  if (job.parameters) {
    try {
      parameters = JSON.parse(job.parameters);
    } catch {
      // Sem parâmetros
    }
  }

  let postcheckOutput = "";
  let postcheckPassed = false;

  // 5. Executar postcheck via connector
  if (deviceId && job.templateId) {
    try {
      const { connectorId } = await resolveDeviceConnectorContext(deviceId);
      if (connectorId) {
        const template = getProvisioningTemplateById(String(job.templateId));
        const postcheckHints = template?.postcheckHints ?? [];

        const result = await executeViaConnector({
          deviceId,
          connectorId,
          targetIp: "",
          jobType: "PROVISION_POSTCHECK",
          payload: {
            job_id: jobId,
            template_id: job.templateId,
            parameters,
            postcheck_hints: postcheckHints,
          },
          timeoutSeconds: 120,
          auditAction: "provisioning_postcheck_connector",
          auditMetadata: {
            job_id: jobId,
            device_id: deviceId,
          },
        });

        postcheckOutput = result.stdout || "";
        postcheckPassed = result.success;
      }
    } catch (error) {
      postcheckOutput = error instanceof Error ? error.message : String(error);
      postcheckPassed = false;
    }
  }

  // 6. Atualizar job com resultado
  const postcheckResult: "passed" | "failed" | "partial" = postcheckPassed ? "passed" : "failed";
  await db.update(provisioningJobsTable)
    .set({
      status: "postcheck_completed",
      postcheckAt: new Date(),
      postcheckResult,
      postcheckOutput,
    })
    .where(eq(provisioningJobsTable.id, jobId));

  return {
    jobId,
    passed: postcheckPassed,
    status: postcheckResult,
    output: postcheckOutput,
    timestamp: new Date(),
  };
}
