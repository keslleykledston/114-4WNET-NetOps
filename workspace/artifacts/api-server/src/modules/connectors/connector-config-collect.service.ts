import { eq } from "drizzle-orm";
import {
  collectedConfigsTable,
  connectorJobResultsTable,
  connectorJobsTable,
  db,
  type Device,
} from "@workspace/db";
import { decrypt } from "../../lib/crypto.js";
import { logAuditEvent } from "../../lib/audit.js";
import { maskSensitivePayload } from "./connector-payload-mask.js";
import { assertReadOnlySshCommand } from "./ssh-readonly-policy.js";
import { assertConnectorAcceptsJobs } from "./connector-execution.service.js";
import { createConnectorJob } from "./connectors.service.js";
import { parseAndPersistConfigBundle } from "../config-backup/config-bundle-parser.service.js";

export const HUAWEI_SSH_CONFIG_BUNDLE_COMMANDS = [
  "display current-configuration",
  "display bgp peer",
  "display bgp peer verbose",
  "display mpls l2vc verbose",
  "display vsi verbose",
  "display interface description",
  "display interface brief",
] as const;

export const SSH_CONFIG_BUNDLE_TIMEOUT_SECONDS = 300;

export type ConfigCollectEnqueueResult =
  | { status: "queued"; jobId: number }
  | { status: "failed"; message: string };

export function getConfigBundleCommands(vendor: string): string[] {
  if (vendor.toLowerCase().includes("huawei")) {
    return [...HUAWEI_SSH_CONFIG_BUNDLE_COMMANDS];
  }
  return ["show running-config", "show ip bgp summary", "show interfaces"];
}

export async function enqueueSshConfigBundleForDevice(
  device: Device,
  options?: { correlationId?: string; createdBy?: number | null },
): Promise<ConfigCollectEnqueueResult> {
  if (!device.connectorId) {
    return { status: "failed", message: "Device has no connector" };
  }

  try {
    await assertConnectorAcceptsJobs(device.connectorId);
    const password = decrypt(device.passwordEncrypted);
    const commands = getConfigBundleCommands(device.vendor);
    for (const command of commands) {
      assertReadOnlySshCommand(command);
    }

    const payload = {
      username: device.username,
      password,
      commands,
      vendor: device.vendor,
      port: device.sshPort,
    };

    const job = await createConnectorJob({
      connector_id: device.connectorId,
      job_type: "SSH_CONFIG_BUNDLE",
      target_ip: device.ipAddress,
      target_port: device.sshPort,
      device_id: device.id,
      timeout_seconds: SSH_CONFIG_BUNDLE_TIMEOUT_SECONDS,
      payload_json: payload,
      masked_payload_json: maskSensitivePayload(payload),
      correlation_id: options?.correlationId,
      created_by: options?.createdBy ?? null,
    });

    await logAuditEvent({
      actorId: options?.createdBy ?? null,
      action: "connector_config_bundle_enqueued",
      objectType: "connector_job",
      objectId: String(job.id),
      metadata: {
        device_id: device.id,
        connector_id: device.connectorId,
        command_count: commands.length,
      },
    });

    return { status: "queued", jobId: job.id };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to enqueue config bundle";
    return { status: "failed", message };
  }
}

export async function processConfigBundleAfterSubmit(connectorId: number, jobId: number): Promise<void> {
  const [job] = await db
    .select()
    .from(connectorJobsTable)
    .where(eq(connectorJobsTable.id, jobId))
    .limit(1);

  if (!job || job.connectorId !== connectorId || job.jobType !== "SSH_CONFIG_BUNDLE" || !job.deviceId) {
    return;
  }

  const [result] = await db
    .select()
    .from(connectorJobResultsTable)
    .where(eq(connectorJobResultsTable.jobId, jobId))
    .limit(1);

  if (!result) return;

  const rawConfig = result.stdout?.trim() ?? "";
  if (!rawConfig) {
    await logAuditEvent({
      action: "device_config_collect_failed",
      objectType: "device",
      objectId: String(job.deviceId),
      metadata: { job_id: jobId, stderr: result.stderr ?? null },
    });
    return;
  }

  const payload = (job.payloadJson ?? {}) as Record<string, unknown>;
  const vendor = typeof payload.vendor === "string" ? payload.vendor : "huawei";

  const [cfg] = await db
    .insert(collectedConfigsTable)
    .values({
      deviceId: job.deviceId,
      connectorId: job.connectorId,
      connectorJobId: jobId,
      source: "connector_ssh_bundle",
      rawConfig,
      parserStatus: "PENDING",
    })
    .returning();

  await logAuditEvent({
    action: "device_config_collected_via_connector",
    objectType: "device",
    objectId: String(job.deviceId),
    metadata: { job_id: jobId, collected_config_id: cfg.id, raw_bytes: rawConfig.length },
  });

  setImmediate(() => {
    void parseAndPersistConfigBundle({
      deviceId: job.deviceId!,
      connectorId: job.connectorId,
      collectedConfigId: cfg.id,
      connectorJobId: jobId,
      rawBundle: rawConfig,
      vendor,
    }).catch(async (error) => {
      await db
        .update(collectedConfigsTable)
        .set({
          parserStatus: "FAILED",
          parserError: error instanceof Error ? error.message : String(error),
        })
        .where(eq(collectedConfigsTable.id, cfg.id));
    });
  });
}
