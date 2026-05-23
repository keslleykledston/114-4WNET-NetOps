import { eq } from "drizzle-orm";
import { db, devicesTable } from "@workspace/db";
import { env } from "../../lib/env.js";
import { getServiceTemplate, listServiceTemplates, type ProvisioningServiceType } from "./provisioning-templates.js";

export type ProvisioningJobStatus =
  | "draft"
  | "validated"
  | "pending_approval"
  | "approved"
  | "blocked"
  | "cancelled"
  | "executing"
  | "completed"
  | "failed"
  | "rolled_back";

export interface ProvisioningPreviewInput {
  deviceId: number;
  serviceType: ProvisioningServiceType | string;
  parameters: Record<string, unknown>;
  maintenanceWindowStart?: string | null;
  maintenanceWindowEnd?: string | null;
  rollbackPlan?: string | null;
}

export interface ProvisioningValidationCheck {
  name: string;
  passed: boolean;
  message: string;
  severity?: "info" | "warn" | "error";
}

export interface ProvisioningPreviewResult {
  deviceId: number;
  serviceType: string;
  configPreview: string;
  rollbackPreview: string;
  validations: ProvisioningValidationCheck[];
  risks: string[];
  missingData: string[];
  maintenanceWindow: { start: string | null; end: string | null } | null;
  rollbackPlan: string | null;
  applyBlocked: boolean;
  applyBlockedReason: string | null;
}

function renderTemplate(template: string, params: Record<string, unknown>): string {
  let rendered = template;
  for (const [key, value] of Object.entries(params)) {
    const replacement = String(value ?? "");
    rendered = rendered.replaceAll(`{{${key}}}`, replacement);
    rendered = rendered.replaceAll(`{{ ${key} }}`, replacement);
  }
  return rendered;
}

function missingRequired(
  required: string[],
  parameters: Record<string, unknown>,
): string[] {
  return required.filter((key) => {
    const value = parameters[key];
    return value === undefined || value === null || String(value).trim() === "";
  });
}

export async function buildProvisioningPreview(
  input: ProvisioningPreviewInput,
): Promise<ProvisioningPreviewResult | { error: string; status: number }> {
  const [device] = await db.select().from(devicesTable).where(eq(devicesTable.id, input.deviceId)).limit(1);
  if (!device) {
    return { error: "Device not found", status: 404 };
  }

  const template = getServiceTemplate(input.serviceType);
  if (!template) {
    return { error: `Unknown serviceType: ${input.serviceType}`, status: 400 };
  }

  const params: Record<string, unknown> = {
    ...input.parameters,
    description: input.parameters.description ?? `${template.name} on ${device.hostname}`,
    localAs: input.parameters.localAs ?? "65000",
  };

  const missingData = missingRequired(template.requiredParameters, params);
  const validations: ProvisioningValidationCheck[] = [];
  const risks: string[] = [];

  validations.push({
    name: "Device reachable metadata",
    passed: Boolean(device.ipAddress),
    message: device.ipAddress ? `Target ${device.hostname} (${device.ipAddress})` : "Device IP missing",
  });

  validations.push({
    name: "Required parameters",
    passed: missingData.length === 0,
    message: missingData.length === 0
      ? "All required parameters present"
      : `Missing: ${missingData.join(", ")}`,
    severity: missingData.length === 0 ? "info" : "error",
  });

  if (!device.snmpCommunity && !device.username) {
    risks.push("Device credentials incomplete — discovery/compliance may be limited.");
  }

  if (input.maintenanceWindowStart && input.maintenanceWindowEnd) {
    const start = new Date(input.maintenanceWindowStart);
    const end = new Date(input.maintenanceWindowEnd);
    const windowOk = !Number.isNaN(start.getTime()) && !Number.isNaN(end.getTime()) && end > start;
    validations.push({
      name: "Maintenance window",
      passed: windowOk,
      message: windowOk
        ? `Window ${input.maintenanceWindowStart} → ${input.maintenanceWindowEnd}`
        : "Invalid maintenance window dates",
      severity: windowOk ? "info" : "warn",
    });
    if (!windowOk) {
      risks.push("Maintenance window invalid — change window before approval.");
    }
  } else {
    risks.push("No maintenance window defined — recommend scheduling before production apply.");
  }

  const applyBlocked = env.configApplyEnabled !== true;
  if (applyBlocked) {
    risks.push("Real apply blocked: CONFIG_APPLY_ENABLED=false.");
  }

  risks.push("Preview only — no configuration mode or commit in v0.4.0.");

  const configPreview = renderTemplate(template.template, params);
  const rollbackFromTemplate = renderTemplate(template.rollbackTemplate, params);
  const rollbackPlan = input.rollbackPlan?.trim()
    ? `${input.rollbackPlan.trim()}\n\n--- Template rollback ---\n${rollbackFromTemplate}`
    : rollbackFromTemplate;

  return {
    deviceId: input.deviceId,
    serviceType: input.serviceType,
    configPreview,
    rollbackPreview: rollbackFromTemplate,
    validations,
    risks,
    missingData,
    maintenanceWindow: input.maintenanceWindowStart || input.maintenanceWindowEnd
      ? { start: input.maintenanceWindowStart ?? null, end: input.maintenanceWindowEnd ?? null }
      : null,
    rollbackPlan,
    applyBlocked,
    applyBlockedReason: applyBlocked ? "CONFIG_APPLY_ENABLED=false" : null,
  };
}

export function getProvisioningServiceCatalog() {
  return listServiceTemplates().map((item) => ({
    serviceType: item.serviceType,
    name: item.name,
    description: item.description,
    configTemplateType: item.configTemplateType,
    requiredParameters: item.requiredParameters,
    optionalParameters: item.optionalParameters,
    parameterSchema: item.parameterSchema,
  }));
}

export function isAllowedJobTransition(from: string, to: ProvisioningJobStatus): boolean {
  const transitions: Record<string, ProvisioningJobStatus[]> = {
    draft: ["validated", "cancelled"],
    validated: ["pending_approval", "draft", "cancelled"],
    pending_approval: ["approved", "blocked", "cancelled", "validated"],
    approved: ["executing", "blocked", "cancelled"],
    blocked: ["draft", "cancelled"],
    cancelled: [],
    executing: ["completed", "failed", "blocked"],
    completed: [],
    failed: ["draft"],
    rolled_back: ["draft"],
  };
  return (transitions[from] ?? []).includes(to);
}
