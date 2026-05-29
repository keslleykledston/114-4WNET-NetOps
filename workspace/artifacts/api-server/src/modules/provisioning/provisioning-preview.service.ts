import { desc, eq } from "drizzle-orm";
import { db, devicesTable, discoverySnapshotsTable } from "@workspace/db";
import { env } from "../../lib/env.js";
import type { DeviceDiscoverySnapshot } from "../netops/device-discovery/discovery.types.js";
import {
  getProvisioningTemplateById,
  listProvisioningTemplates,
  normalizeParameters,
  toTemplateSummary,
} from "./provisioning-template-registry.js";
import { renderRollbackPreview } from "./provisioning-rollback.js";
import { buildExecutionPlan, renderTemplateString, withPreviewHeader } from "./provisioning-renderer.js";
import { exportProvisioningPreviewMarkdown } from "./provisioning-export.js";
import {
  derivePreviewStatus,
  validateProvisioningParameters,
} from "./provisioning-validator.js";
import type {
  ProvisioningContext,
  ProvisioningExportInput,
  ProvisioningExportResult,
  ProvisioningPreviewInput,
  ProvisioningPreviewResult,
} from "./provisioning.types.js";

async function loadProvisioningContext(deviceId: number): Promise<ProvisioningContext | { error: string; status: number }> {
  const [device] = await db.select().from(devicesTable).where(eq(devicesTable.id, deviceId)).limit(1);
  if (!device) {
    return { error: "Device not found", status: 404 };
  }

  const [snapshotRow] = await db
    .select()
    .from(discoverySnapshotsTable)
    .where(eq(discoverySnapshotsTable.deviceId, deviceId))
    .orderBy(desc(discoverySnapshotsTable.createdAt))
    .limit(1);

  const discovery = snapshotRow?.snapshotJson
    ? snapshotRow.snapshotJson as DeviceDiscoverySnapshot
    : null;

  return {
    device,
    discovery,
    discoveryAvailable: Boolean(discovery),
  };
}

function getSensitiveKeys(templateId: string): string[] {
  const template = getProvisioningTemplateById(templateId);
  if (!template) return ["password"];
  return Object.entries(template.parameterSchema)
    .filter(([, schema]) => schema.sensitive)
    .map(([key]) => key);
}

export function listTemplateSummaries() {
  return listProvisioningTemplates().map(toTemplateSummary);
}

export function getTemplateSummaryById(templateId: string) {
  const template = getProvisioningTemplateById(templateId);
  return template ? toTemplateSummary(template) : null;
}

export async function buildProvisioningPreview(
  input: ProvisioningPreviewInput,
): Promise<ProvisioningPreviewResult | { error: string; status: number }> {
  const template = getProvisioningTemplateById(input.templateId);
  if (!template) {
    return { error: `Unknown templateId: ${input.templateId}`, status: 404 };
  }

  const contextResult = await loadProvisioningContext(input.deviceId);
  if ("error" in contextResult) {
    return contextResult;
  }

  const parameters = normalizeParameters(template, input.parameters ?? {}, contextResult);
  const { validations, risks, missingData, blockedReasons } = validateProvisioningParameters(
    template,
    parameters,
    contextResult,
  );

  const sensitiveKeys = getSensitiveKeys(template.id);
  const configPreview = withPreviewHeader(
    renderTemplateString(template.configTemplate, parameters, { maskSensitive: true, sensitiveKeys }),
  );
  const rollbackPreview = renderRollbackPreview(template, parameters, input.rollbackPlan);
  const executionPlan = buildExecutionPlan(template.serviceType, parameters);
  const applyBlocked = env.configApplyEnabled !== true;

  if (applyBlocked) {
    risks.push({
      code: "apply_blocked",
      message: "Real apply blocked: CONFIG_APPLY_ENABLED=false.",
      severity: "info",
    });
  }

  risks.push({
    code: "preview_only",
    message: "Preview only — no configuration mode or commit in v0.4.0.",
    severity: "info",
  });

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
      risks.push({
        code: "maintenance_window_invalid",
        message: "Maintenance window invalid — adjust before approval.",
        severity: "warn",
      });
    }
  } else {
    risks.push({
      code: "maintenance_window_missing",
      message: "No maintenance window defined — recommend scheduling before production apply.",
      severity: "warn",
    });
  }

  const status = derivePreviewStatus(blockedReasons, risks);

  return {
    status,
    deviceId: input.deviceId,
    templateId: template.id,
    serviceType: template.serviceType,
    configPreview,
    rollbackPreview,
    executionPlan,
    validations,
    risks,
    precheckHints: template.precheckHints,
    postcheckHints: template.postcheckHints,
    missingData,
    blockedReasons,
    applyBlocked,
    applyBlockedReason: applyBlocked ? "CONFIG_APPLY_ENABLED=false" : null,
    maintenanceWindow: input.maintenanceWindowStart || input.maintenanceWindowEnd
      ? { start: input.maintenanceWindowStart ?? null, end: input.maintenanceWindowEnd ?? null }
      : null,
    rollbackPlan: input.rollbackPlan?.trim() ? input.rollbackPlan.trim() : null,
  };
}

export async function exportProvisioningPreview(
  input: ProvisioningExportInput,
): Promise<ProvisioningExportResult | { error: string; status: number }> {
  const previewResult = await buildProvisioningPreview(input);
  if ("error" in previewResult) {
    return previewResult;
  }

  if (input.format === "json") {
    return {
      format: "json",
      content: JSON.stringify(previewResult, null, 2),
      preview: previewResult,
    };
  }

  return {
    format: "markdown",
    content: exportProvisioningPreviewMarkdown(previewResult, input.parameters ?? {}),
    preview: previewResult,
  };
}

export function maskParametersForAudit(
  templateId: string,
  parameters: Record<string, unknown>,
): Record<string, unknown> {
  const sensitiveKeys = new Set(getSensitiveKeys(templateId));
  const masked: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(parameters)) {
    masked[key] = sensitiveKeys.has(key) && !isBlank(value) ? "***REDACTED***" : value;
  }
  return masked;
}

function isBlank(value: unknown): boolean {
  return value === undefined || value === null || String(value).trim() === "";
}
