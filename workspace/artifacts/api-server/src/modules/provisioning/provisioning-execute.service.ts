import { eq } from "drizzle-orm";
import { db, provisioningJobsTable, provisioningStepsTable } from "@workspace/db";
import { env } from "../../lib/env.js";
import { buildExecutionPlan, renderTemplateString } from "./provisioning-renderer.js";
import { renderRollbackPreview } from "./provisioning-rollback.js";
import { getProvisioningTemplateById } from "./provisioning-template-registry.js";
import { executeViaConnector, resolveDeviceConnectorContext } from "../connectors/connector-execution.service.js";
import type { ProvisioningPreviewInput } from "./provisioning.types.js";

export interface ExecutionCheckError {
  code: "EXECUTE_DISABLED" | "NO_APPROVAL" | "WINDOW_CLOSED" | "EXECUTION_FAILED";
  message: string;
  status: number;
}

export function validateExecutionEnabledOrThrow(): ExecutionCheckError | null {
  if (!env.provisioningExecuteEnabled) {
    return {
      code: "EXECUTE_DISABLED",
      message: "PROVISIONING_EXECUTE_ENABLED=false. Execução bloqueada.",
      status: 503,
    };
  }
  return null;
}

export function validateApprovalOrThrow(approvedByUserId: number | null): ExecutionCheckError | null {
  if (!approvedByUserId) {
    return {
      code: "NO_APPROVAL",
      message: "Job não aprovado. Solicite aprovação antes de executar.",
      status: 409,
    };
  }
  return null;
}

export function validateMaintenanceWindow(
  maintenanceWindowStart: Date | null | undefined,
  maintenanceWindowEnd: Date | null | undefined,
): ExecutionCheckError | null {
  if (maintenanceWindowStart && maintenanceWindowEnd) {
    const now = new Date();
    if (now < maintenanceWindowStart || now > maintenanceWindowEnd) {
      return {
        code: "WINDOW_CLOSED",
        message: `Execução fora da janela. Janela: ${maintenanceWindowStart.toISOString()} → ${maintenanceWindowEnd.toISOString()}`,
        status: 409,
      };
    }
  }
  return null;
}

export function maskSensitiveOutput(output: string, sensitiveKeys: string[]): string {
  let masked = output;
  const patterns = [
    /password\s*=\s*\S+/gi,
    /community\s*=\s*\S+/gi,
    /secret\s*=\s*\S+/gi,
    /preshared\s*key\s*=\s*\S+/gi,
    /token\s*=\s*\S+/gi,
  ];
  for (const pattern of patterns) {
    masked = masked.replace(pattern, (match) => {
      const prefix = match.split("=")[0] || "";
      return `${prefix}=[REDACTED]`;
    });
  }
  for (const key of sensitiveKeys) {
    const pattern = new RegExp(`${key}\\s*=\\s*\\S+`, "gi");
    masked = masked.replace(pattern, `${key}=[REDACTED]`);
  }
  return masked;
}

export async function executeProvisioningJobControlled(
  jobId: number,
  actorUserId: number | null,
): Promise<{ error: ExecutionCheckError } | { success: true }> {
  // 1. Buscar job
  const [job] = await db.select().from(provisioningJobsTable).where(eq(provisioningJobsTable.id, jobId));
  if (!job) {
    return {
      error: {
        code: "EXECUTION_FAILED",
        message: "Job não encontrado",
        status: 404,
      },
    };
  }

  // 2. Validar flag
  const flagError = validateExecutionEnabledOrThrow();
  if (flagError) return { error: flagError };

  // 3. Validar approval
  const approvalError = validateApprovalOrThrow(job.approvedByUserId);
  if (approvalError) return { error: approvalError };

  // 4. Validar maintenance window
  const windowError = validateMaintenanceWindow(job.maintenanceWindowStart, job.maintenanceWindowEnd);
  if (windowError) return { error: windowError };

  // 5. Extrair parâmetros do job
  let parameters: Record<string, unknown> = {};
  if (job.parameters) {
    try {
      parameters = JSON.parse(job.parameters);
    } catch {
      // Sem parâmetros
    }
  }

  // 6. Gerar rollback plan snapshot se não existir
  if (!job.rollbackPlanGenerated && job.templateId) {
    const template = getProvisioningTemplateById(String(job.templateId));
    if (template) {
      const rollbackPreview = renderRollbackPreview(template, parameters, null);
      await db.update(provisioningJobsTable)
        .set({ rollbackPlanGenerated: rollbackPreview })
        .where(eq(provisioningJobsTable.id, jobId));
    }
  }

  // 7. Gerar execution plan se não existir
  if (!job.executionPlanJson && job.templateId) {
    const template = getProvisioningTemplateById(String(job.templateId));
    if (template) {
      const plan = buildExecutionPlan(template.serviceType, parameters);
      const planJson = JSON.stringify({ commands: plan, timestamp: new Date().toISOString() });
      await db.update(provisioningJobsTable)
        .set({ executionPlanJson: planJson })
        .where(eq(provisioningJobsTable.id, jobId));
    }
  }

  // 8. Marcar como executando
  await db.update(provisioningJobsTable)
    .set({ status: "executing", executedAt: new Date() })
    .where(eq(provisioningJobsTable.id, jobId));

  // 9. Executar via connector (async, fire-and-forget)
  executeViaConnectorAsync(jobId, job.templateId, parameters).catch(() => {
    // Erros capturados no executor async
  });

  return { success: true };
}

async function executeViaConnectorAsync(
  jobId: number,
  templateId: number | null,
  parameters: Record<string, unknown>,
): Promise<void> {
  if (!templateId) return;

  const [job] = await db.select().from(provisioningJobsTable).where(eq(provisioningJobsTable.id, jobId));
  if (!job) return;

  // Parsing device IDs
  let deviceIds: number[] = [];
  try {
    const parsed = JSON.parse(job.deviceIds);
    deviceIds = Array.isArray(parsed) ? parsed.map((d) => Number(d)).filter((d) => Number.isInteger(d)) : [];
  } catch {
    // Sem device IDs
  }

  for (const deviceId of deviceIds) {
    try {
      const { connectorId } = await resolveDeviceConnectorContext(deviceId);
      if (!connectorId) continue;

      const result = await executeViaConnector({
        deviceId,
        connectorId,
        targetIp: "",
        jobType: "PROVISION_EXECUTE",
        payload: {
          job_id: jobId,
          template_id: templateId,
          parameters,
        },
        timeoutSeconds: 300,
        auditAction: "provisioning_execute_connector",
        auditMetadata: {
          job_id: jobId,
          device_id: deviceId,
        },
      });

      // Gravar resultado
      if (result.success) {
        const output = result.stdout ? maskSensitiveOutput(result.stdout, []) : "";
        const steps = await db.select().from(provisioningStepsTable)
          .where(eq(provisioningStepsTable.jobId, jobId));
        if (steps.length > 0) {
          await db.update(provisioningStepsTable)
            .set({
              status: "completed",
              stdout: output,
              executedAt: new Date(),
            })
            .where(eq(provisioningStepsTable.id, steps[0]!.id));
        }
      } else {
        const steps = await db.select().from(provisioningStepsTable)
          .where(eq(provisioningStepsTable.jobId, jobId));
        if (steps.length > 0) {
          await db.update(provisioningStepsTable)
            .set({
              status: "failed",
              stderr: result.stderr || "Execution failed",
              executedAt: new Date(),
            })
            .where(eq(provisioningStepsTable.id, steps[0]!.id));
        }
      }
    } catch (error) {
      const steps = await db.select().from(provisioningStepsTable)
        .where(eq(provisioningStepsTable.jobId, jobId));
      if (steps.length > 0) {
        await db.update(provisioningStepsTable)
          .set({
            status: "failed",
            stderr: error instanceof Error ? error.message : String(error),
            executedAt: new Date(),
          })
          .where(eq(provisioningStepsTable.id, steps[0]!.id));
      }
    }
  }

  // Finalizar job
  await db.update(provisioningJobsTable)
    .set({ status: "completed", completedAt: new Date() })
    .where(eq(provisioningJobsTable.id, jobId));
}
