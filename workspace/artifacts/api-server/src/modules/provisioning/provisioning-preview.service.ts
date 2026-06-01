import { desc, eq } from "drizzle-orm";
import { db, connectorsTable, devicesTable, discoverySnapshotsTable } from "@workspace/db";
import { env } from "../../lib/env.js";
import { resolveAvailableConnectorForGroup } from "../connectors/connector-groups.service.js";
import type { DeviceDiscoverySnapshot } from "../netops/device-discovery/discovery.types.js";
import {
  validateL2vpnPreviewRequest,
  validateL3vpnPreviewRequest,
} from "./provisioning-validator.js";
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
  ProvisioningFinding,
  ProvisioningL2vpnPreviewInput,
  ProvisioningL3vpnPreviewInput,
  ProvisioningPreviewInput,
  ProvisioningPreviewResult,
  ProvisioningStructuredValidationResult,
} from "./provisioning.types.js";

async function loadProvisioningContext(deviceId: number): Promise<(ProvisioningContext & {
  snapshotAgeHours: number | null;
  connectorAvailable: boolean | null;
}) | { error: string; status: number }> {
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

  const snapshotAgeHours = snapshotRow?.createdAt
    ? Math.max(0, (Date.now() - snapshotRow.createdAt.getTime()) / (1000 * 60 * 60))
    : null;

  let connectorAvailable: boolean | null = null;
  if (device.connectorId) {
    const [connector] = await db.select().from(connectorsTable).where(eq(connectorsTable.id, device.connectorId)).limit(1);
    connectorAvailable = Boolean(connector && (connector.status === "ONLINE" || connector.status === "PENDING" || connector.lastHeartbeat));
  } else if (device.connectorGroupId) {
    try {
      await resolveAvailableConnectorForGroup(device.connectorGroupId);
      connectorAvailable = true;
    } catch {
      connectorAvailable = false;
    }
  }

  return {
    device,
    discovery,
    discoveryAvailable: Boolean(discovery),
    snapshotAgeHours,
    connectorAvailable,
  };
}

function structuredPreviewFields(result: ProvisioningPreviewResult, structured: ProvisioningStructuredValidationResult) {
  const validationResult = {
    validations: structured.validations,
    findings: structured.findings,
    risks: structured.risks,
    missingData: structured.missingData,
    blockedReasons: structured.blockedReasons,
  };

  return {
    validationResultJson: JSON.stringify(validationResult),
    renderedConfigJson: JSON.stringify({ configPreview: result.configPreview }, null, 2),
    renderedRollbackJson: JSON.stringify({ rollbackPreview: result.rollbackPreview }, null, 2),
    renderedValidationJson: JSON.stringify(validationResult, null, 2),
    riskSummaryJson: JSON.stringify({
      total: structured.risks.length,
      blocking: structured.findings.filter((item) => item.blocking).length,
      warnings: structured.risks.filter((item) => item.severity === "warn").length,
    }),
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
  const structured = {
    validations,
    findings: [] as ProvisioningFinding[],
    risks,
    missingData,
    blockedReasons,
  };
  const structuredFields = structuredPreviewFields({
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
  }, structured);

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
    ...structuredFields,
  };
}

async function buildStructuredPreviewForTemplate(
  templateId: string,
  deviceId: number,
  parameters: Record<string, unknown>,
  structured: ProvisioningStructuredValidationResult,
  maintenanceWindowStart?: string | null,
  maintenanceWindowEnd?: string | null,
  rollbackPlan?: string | null,
): Promise<ProvisioningPreviewResult> {
  const template = getProvisioningTemplateById(templateId);
  if (!template) {
    throw new Error(`Unknown template ${templateId}`);
  }
  const contextResult = await loadProvisioningContext(deviceId);
  if ("error" in contextResult) {
    throw new Error(contextResult.error);
  }
  const normalizedParameters = normalizeParameters(template, parameters, contextResult);
  const sensitiveKeys = Object.entries(template.parameterSchema)
    .filter(([, schema]) => schema.sensitive)
    .map(([key]) => key);
  const configPreview = withPreviewHeader(
    renderTemplateString(template.configTemplate, normalizedParameters, { maskSensitive: true, sensitiveKeys }),
  );
  const rollbackPreview = renderRollbackPreview(template, normalizedParameters, rollbackPlan);
  const executionPlan = buildExecutionPlan(template.serviceType, normalizedParameters);
  const applyBlocked = env.provisioningApplyEnabled !== true;
  const blockedReasons = [...structured.blockedReasons];
  const risks = [...structured.risks];

  if (applyBlocked) {
    risks.push({
      code: "apply_blocked",
      message: "Real apply blocked: PROVISIONING_APPLY_ENABLED=false.",
      severity: "info",
    });
    blockedReasons.push("Apply blocked by feature flag");
  }

  const status = derivePreviewStatus(blockedReasons, risks);
  const structuredFields = structuredPreviewFields(
    {
      status,
      deviceId,
      templateId,
      serviceType: template.serviceType,
      configPreview,
      rollbackPreview,
      executionPlan,
      validations: structured.validations,
      risks,
      findings: structured.findings,
      precheckHints: template.precheckHints,
      postcheckHints: template.postcheckHints,
      missingData: structured.missingData,
      blockedReasons,
      applyBlocked,
      applyBlockedReason: applyBlocked ? "PROVISIONING_APPLY_ENABLED=false" : null,
      maintenanceWindow: maintenanceWindowStart || maintenanceWindowEnd
        ? { start: maintenanceWindowStart ?? null, end: maintenanceWindowEnd ?? null }
        : null,
      rollbackPlan: rollbackPlan?.trim() ? rollbackPlan.trim() : null,
    },
    structured,
  );

  return {
    status,
    deviceId,
    templateId,
    serviceType: template.serviceType,
    configPreview,
    rollbackPreview,
    executionPlan,
    validations: structured.validations,
    risks,
    findings: structured.findings,
    precheckHints: template.precheckHints,
    postcheckHints: template.postcheckHints,
    missingData: structured.missingData,
    blockedReasons,
    applyBlocked,
    applyBlockedReason: applyBlocked ? "PROVISIONING_APPLY_ENABLED=false" : null,
    maintenanceWindow: maintenanceWindowStart || maintenanceWindowEnd
      ? { start: maintenanceWindowStart ?? null, end: maintenanceWindowEnd ?? null }
      : null,
    rollbackPlan: rollbackPlan?.trim() ? rollbackPlan.trim() : null,
    ...structuredFields,
  };
}

export async function buildL2vpnPreview(
  input: ProvisioningL2vpnPreviewInput,
): Promise<ProvisioningPreviewResult | { error: string; status: number }> {
  const primary = await loadProvisioningContext(input.deviceAId);
  if ("error" in primary) return primary;
  const peer = await loadProvisioningContext(input.deviceBId);
  if ("error" in peer) return peer;
  const structured = validateL2vpnPreviewRequest(input, {
    ...primary,
    peerContext: "error" in peer ? null : peer,
    peerSnapshotAgeHours: "error" in peer ? null : peer.snapshotAgeHours,
    peerConnectorAvailable: "error" in peer ? null : peer.connectorAvailable,
  });

  const templateId = "huawei-vrp-l2vpn";
  const template = getProvisioningTemplateById(templateId);
  if (!template) {
    return { error: "L2VPN template missing", status: 500 };
  }

  const preview = await buildStructuredPreviewForTemplate(
    templateId,
    input.deviceAId,
    {
      ...input.parameters,
      deviceA: input.deviceAId,
      deviceB: input.deviceBId,
    },
    structured,
  );
  return preview;
}

export async function buildL3vpnPreview(
  input: ProvisioningL3vpnPreviewInput,
): Promise<ProvisioningPreviewResult | { error: string; status: number }> {
  const context = await loadProvisioningContext(input.deviceId);
  if ("error" in context) return context;
  const structured = validateL3vpnPreviewRequest(input, context);

  const templateId = "huawei-vrp-l3vpn";
  const template = getProvisioningTemplateById(templateId);
  if (!template) {
    return { error: "L3VPN template missing", status: 500 };
  }

  return buildStructuredPreviewForTemplate(
    templateId,
    input.deviceId,
    input.parameters,
    structured,
  );
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
