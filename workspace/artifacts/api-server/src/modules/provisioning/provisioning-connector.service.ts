import { eq } from "drizzle-orm";
import { db, devicesTable } from "@workspace/db";
import { executeViaConnector, type ConnectorExecutionResult, resolveDeviceConnectorContext } from "../connectors/connector-execution.service.js";
import { buildProvisioningPreview } from "./provisioning-preview.service.js";
import type { ProvisioningPreviewInput, ProvisioningPreviewResult } from "./provisioning.types.js";

type ConnectorProvisioningPreviewResponse = ProvisioningPreviewResult & {
  commandsGenerated: string[];
  warnings: string[];
  conflicts: string[];
  missingResources: string[];
};

function deriveCommandsGenerated(preview: ProvisioningPreviewResult): string[] {
  return preview.configPreview
    .split("\n")
    .map((line) => line.trimEnd())
    .filter((line) => line.length > 0 && !line.startsWith("# PREVIEW ONLY"));
}

function toConnectorPreviewResult(preview: ProvisioningPreviewResult): ConnectorProvisioningPreviewResponse {
  return {
    ...preview,
    commandsGenerated: deriveCommandsGenerated(preview),
    warnings: preview.risks.map((risk) => risk.message),
    conflicts: preview.blockedReasons,
    missingResources: preview.missingData,
  };
}

async function loadDevice(deviceId: number) {
  const [device] = await db.select().from(devicesTable).where(eq(devicesTable.id, deviceId)).limit(1);
  if (!device) {
    throw new Error("Device not found");
  }
  return device;
}

async function executeConnectorPreview(input: ProvisioningPreviewInput): Promise<ProvisioningPreviewResult | { error: string; status: number }> {
  const device = await loadDevice(input.deviceId);
  if (!device.connectorId && !device.connectorGroupId) {
    return buildProvisioningPreview(input);
  }
  const { connectorId } = await resolveDeviceConnectorContext(device.id);
  if (!connectorId) {
    return { error: "Device has no connector", status: 409 };
  }

  const result = await executeViaConnector({
    deviceId: device.id,
    connectorId,
    targetIp: device.ipAddress,
    jobType: "PROVISION_PREVIEW",
    payload: {
      device_id: device.id,
      template_id: input.templateId,
      parameters: input.parameters ?? {},
      mode: input.mode ?? "dry_run",
      maintenanceWindowStart: input.maintenanceWindowStart ?? null,
      maintenanceWindowEnd: input.maintenanceWindowEnd ?? null,
      rollbackPlan: input.rollbackPlan ?? null,
    },
    timeoutSeconds: 240,
    auditAction: "provisioning_preview_via_connector",
    auditMetadata: {
      device_id: device.id,
      template_id: input.templateId,
      parameter_count: Object.keys(input.parameters ?? {}).length,
      via_connector: true,
    },
  });

  if (!result.success) {
    return { error: result.stderr || "Provisioning preview failed", status: 502 };
  }

  const preview = extractPreviewFromConnectorResult(result);
  if (!preview) {
    return { error: "Invalid provisioning preview response from connector", status: 502 };
  }
  return preview;
}

function extractPreviewFromConnectorResult(result: ConnectorExecutionResult): ConnectorProvisioningPreviewResponse | null {
  const fromResultJson = result.resultJson?.preview;
  if (fromResultJson && typeof fromResultJson === "object" && !Array.isArray(fromResultJson)) {
    return toConnectorPreviewResult(fromResultJson as ProvisioningPreviewResult);
  }

  if (result.stdout.trim()) {
    try {
      const parsed = JSON.parse(result.stdout) as ProvisioningPreviewResult;
      return toConnectorPreviewResult(parsed);
    } catch {
      return null;
    }
  }
  return null;
}

export async function buildProvisioningPreviewViaConnector(
  input: ProvisioningPreviewInput,
): Promise<ConnectorProvisioningPreviewResponse | { error: string; status: number }> {
  const preview = await executeConnectorPreview(input);
  if ("error" in preview) {
    return preview;
  }
  return toConnectorPreviewResult(preview);
}
