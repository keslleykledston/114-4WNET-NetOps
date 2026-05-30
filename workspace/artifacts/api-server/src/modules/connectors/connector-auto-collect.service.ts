import { randomUUID } from "node:crypto";
import { db, devicesTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logAuditEvent } from "../../lib/audit.js";
import type { Device } from "@workspace/db";
import { collectSnmpFastInterfaces } from "../operational/snmp-fast-interfaces.service.js";
import {
  enqueueSshConfigBundleForDevice,
  type ConfigCollectEnqueueResult,
} from "./connector-config-collect.service.js";

export type SnmpFastEnqueueResult =
  | { status: "queued" }
  | { status: "skipped"; message: string }
  | { status: "failed"; message: string };

export type PostSshCollectResult = {
  correlationId: string;
  sshConfigBundle: ConfigCollectEnqueueResult;
  snmpFast: SnmpFastEnqueueResult;
};

export async function enqueuePostSshSuccessCollections(
  device: Device,
  options?: { createdBy?: number | null; correlationId?: string },
): Promise<PostSshCollectResult> {
  const correlationId = options?.correlationId ?? randomUUID();
  const sshConfigBundle = await enqueueSshConfigBundleForDevice(device, {
    correlationId,
    createdBy: options?.createdBy ?? null,
  });

  let snmpFast: SnmpFastEnqueueResult = { status: "skipped", message: "SNMP community not configured" };
  if (device.snmpCommunity?.trim()) {
    snmpFast = { status: "queued" };
    setImmediate(() => {
      const createdBy =
        options?.createdBy != null ? `user:${options.createdBy}` : "connector_autocollect";
      void collectSnmpFastInterfaces(device.id, createdBy)
        .then((result) => {
          void logAuditEvent({
            actorId: options?.createdBy ?? null,
            action: "connector_snmp_fast_autocollect",
            objectType: "device",
            objectId: String(device.id),
            metadata: {
              correlation_id: correlationId,
              job_id: result.jobId,
              status: result.status,
              interface_count: result.interfaceCount,
            },
          });
        })
        .catch((error) => {
          void logAuditEvent({
            actorId: options?.createdBy ?? null,
            action: "connector_snmp_fast_autocollect_failed",
            objectType: "device",
            objectId: String(device.id),
            metadata: {
              correlation_id: correlationId,
              error: error instanceof Error ? error.message : String(error),
            },
          });
        });
    });
  }

  await logAuditEvent({
    actorId: options?.createdBy ?? null,
    action: "connector_post_ssh_autocollect",
    objectType: "device",
    objectId: String(device.id),
    metadata: { correlation_id: correlationId, ssh_bundle: sshConfigBundle, snmp_fast: snmpFast },
  });

  return { correlationId, sshConfigBundle, snmpFast };
}
