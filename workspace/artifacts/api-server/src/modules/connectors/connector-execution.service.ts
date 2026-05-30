import { randomUUID } from "node:crypto";
import { and, eq, inArray } from "drizzle-orm";
import {
  connectorJobResultsTable,
  connectorJobsTable,
  connectorsTable,
  db,
  devicesTable,
  type Device,
} from "@workspace/db";
import { decrypt } from "../../lib/crypto.js";
import { getRequestContext } from "../../lib/request-context.js";
import { logAuditEvent } from "../../lib/audit.js";
import { ConflictError } from "../../lib/db-errors.js";
import { maskSensitivePayload } from "./connector-payload-mask.js";
import { assertReadOnlySshCommand } from "./ssh-readonly-policy.js";
import type { ConnectorJobType } from "./connectors.types.js";
import { createConnectorJob, expireTimedOutJobs } from "./connectors.service.js";

const HEARTBEAT_ONLINE_MS = 2 * 60 * 1000;
const POLL_INTERVAL_MS = 500;

export const CONNECTOR_JOB_TIMEOUT_DEFAULTS: Record<string, number> = {
  PING: 15,
  TCP_CHECK: 10,
  SNMP_GET: 30,
  SNMP_WALK: 120,
  SSH_COMMAND: 120,
  SSH_CONFIG_BUNDLE: 300,
  BGP: 300,
  L2VPN: 300,
};

export type ConnectorExecutionResult = {
  success: boolean;
  stdout: string;
  stderr: string;
  exitCode: number;
  resultJson: Record<string, unknown> | null;
  jobId: number;
  executionMode: "connector";
  durationMs: number;
  status: string;
};

export class ConnectorOfflineError extends Error {
  constructor(message = "Connector offline ou sem heartbeat recente.") {
    super(message);
    this.name = "ConnectorOfflineError";
  }
}

export class ConnectorJobTimeoutError extends Error {
  constructor(message = "Connector não retornou resultado dentro do tempo limite.") {
    super(message);
    this.name = "ConnectorJobTimeoutError";
  }
}

type BaseExecutionInput = {
  deviceId?: number;
  connectorId: number;
  targetIp: string;
  timeoutSeconds?: number;
  correlationId?: string;
  createdBy?: number | null;
};

export async function assertConnectorAcceptsJobs(connectorId: number): Promise<void> {
  const [connector] = await db.select().from(connectorsTable).where(eq(connectorsTable.id, connectorId)).limit(1);
  if (!connector) {
    throw new Error("Connector not found");
  }
  if (connector.status === "REVOKED" || connector.status === "DISABLED") {
    throw new ConflictError(`Connector is ${connector.status.toLowerCase()} and cannot accept jobs`);
  }
  if (connector.status === "ONLINE") {
    return;
  }
  const lastHeartbeat = connector.lastHeartbeat?.getTime() ?? 0;
  const heartbeatFresh = lastHeartbeat > 0 && Date.now() - lastHeartbeat <= HEARTBEAT_ONLINE_MS;
  if (heartbeatFresh) {
    return;
  }
  throw new ConnectorOfflineError();
}

export async function waitForJobResult(jobId: number, timeoutSeconds: number): Promise<ConnectorExecutionResult> {
  const started = Date.now();
  const deadline = started + timeoutSeconds * 1000;

  while (Date.now() < deadline) {
    await expireTimedOutJobs();

    const [job] = await db.select().from(connectorJobsTable).where(eq(connectorJobsTable.id, jobId)).limit(1);
    if (!job) {
      throw new Error("Connector job not found");
    }

    if (["SUCCESS", "FAILED", "TIMEOUT", "CANCELLED"].includes(job.status)) {
      const [result] = await db
        .select()
        .from(connectorJobResultsTable)
        .where(eq(connectorJobResultsTable.jobId, jobId))
        .limit(1);

      const finishedAt = job.finishedAt?.getTime() ?? Date.now();
      const durationMs = Math.max(0, finishedAt - job.createdAt.getTime());

      if (job.status === "TIMEOUT") {
        throw new ConnectorJobTimeoutError();
      }

      return {
        success: job.status === "SUCCESS" && (result?.success ?? false),
        stdout: result?.stdout ?? "",
        stderr: result?.stderr ?? "",
        exitCode: result?.exitCode ?? (job.status === "SUCCESS" ? 0 : 1),
        resultJson: (result?.resultJson as Record<string, unknown> | null) ?? null,
        jobId,
        executionMode: "connector",
        durationMs,
        status: job.status,
      };
    }

    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }

  await db
    .update(connectorJobsTable)
    .set({ status: "TIMEOUT", finishedAt: new Date() })
    .where(and(eq(connectorJobsTable.id, jobId), inArray(connectorJobsTable.status, ["PENDING", "RUNNING"])));

  throw new ConnectorJobTimeoutError();
}

async function enqueueJob(input: {
  connectorId: number;
  deviceId?: number;
  jobType: ConnectorJobType;
  targetIp: string;
  targetPort?: number | null;
  payload: Record<string, unknown>;
  timeoutSeconds: number;
  correlationId?: string;
  createdBy?: number | null;
  auditAction: string;
  auditMetadata?: Record<string, unknown>;
}): Promise<number> {
  await assertConnectorAcceptsJobs(input.connectorId);

  const payloadJson = input.payload;
  const maskedPayloadJson = maskSensitivePayload(payloadJson);
  const userId = input.createdBy ?? getRequestContext()?.user?.id ?? null;
  const correlationId = input.correlationId ?? randomUUID();

  const job = await createConnectorJob({
    connector_id: input.connectorId,
    job_type: input.jobType,
    target_ip: input.targetIp,
    target_port: input.targetPort ?? null,
    payload_json: payloadJson,
    timeout_seconds: input.timeoutSeconds,
    created_by: userId,
    device_id: input.deviceId ?? null,
    correlation_id: correlationId,
    masked_payload_json: maskedPayloadJson,
  });

  await logAuditEvent({
    actorId: userId,
    action: input.auditAction,
    objectType: "connector_job",
    objectId: String(job.id),
    metadata: {
      connector_id: input.connectorId,
      device_id: input.deviceId ?? null,
      job_type: input.jobType,
      target_ip: input.targetIp,
      correlation_id: correlationId,
      masked_payload: maskedPayloadJson,
      ...input.auditMetadata,
    },
  });

  return job.id;
}

async function executeJob(input: {
  connectorId: number;
  deviceId?: number;
  jobType: ConnectorJobType;
  targetIp: string;
  targetPort?: number | null;
  payload: Record<string, unknown>;
  timeoutSeconds: number;
  correlationId?: string;
  createdBy?: number | null;
  auditAction: string;
  auditMetadata?: Record<string, unknown>;
}): Promise<ConnectorExecutionResult> {
  const jobId = await enqueueJob(input);
  return waitForJobResult(jobId, input.timeoutSeconds);
}

export async function executeViaConnector(input: BaseExecutionInput & {
  jobType: ConnectorJobType;
  targetPort?: number | null;
  payload: Record<string, unknown>;
  auditAction?: string;
  auditMetadata?: Record<string, unknown>;
}): Promise<ConnectorExecutionResult> {
  const timeoutSeconds = input.timeoutSeconds ?? CONNECTOR_JOB_TIMEOUT_DEFAULTS[input.jobType] ?? 120;
  return executeJob({
    connectorId: input.connectorId,
    deviceId: input.deviceId,
    jobType: input.jobType,
    targetIp: input.targetIp,
    targetPort: input.targetPort,
    payload: input.payload,
    timeoutSeconds,
    correlationId: input.correlationId,
    createdBy: input.createdBy,
    auditAction: input.auditAction ?? "connector_job_execute",
  });
}

export async function executePing(input: BaseExecutionInput & { count?: number }): Promise<ConnectorExecutionResult> {
  return executeViaConnector({
    ...input,
    jobType: "PING",
    timeoutSeconds: input.timeoutSeconds ?? CONNECTOR_JOB_TIMEOUT_DEFAULTS.PING,
    payload: { target_ip: input.targetIp, count: input.count ?? 4 },
    auditAction: "connector_device_ping",
  });
}

export async function executeTcpCheck(
  input: BaseExecutionInput & { port?: number },
): Promise<ConnectorExecutionResult> {
  const port = input.port ?? 22;
  return executeViaConnector({
    ...input,
    jobType: "TCP_CHECK",
    targetPort: port,
    timeoutSeconds: input.timeoutSeconds ?? CONNECTOR_JOB_TIMEOUT_DEFAULTS.TCP_CHECK,
    payload: { target_ip: input.targetIp, port },
    auditAction: "connector_device_tcp_check",
  });
}

export async function executeSnmpGet(
  input: BaseExecutionInput & { oid: string; community: string; version?: string },
): Promise<ConnectorExecutionResult> {
  return executeViaConnector({
    ...input,
    jobType: "SNMP_GET",
    targetPort: 161,
    timeoutSeconds: input.timeoutSeconds ?? CONNECTOR_JOB_TIMEOUT_DEFAULTS.SNMP_GET,
    payload: {
      oid: input.oid,
      community: input.community,
      version: input.version ?? "2c",
    },
    auditAction: "connector_device_snmp_get",
    auditMetadata: { oid: input.oid },
  });
}

export async function executeSnmpWalk(
  input: BaseExecutionInput & { oid: string; community: string; version?: string },
): Promise<ConnectorExecutionResult> {
  return executeViaConnector({
    ...input,
    jobType: "SNMP_WALK",
    targetPort: 161,
    timeoutSeconds: input.timeoutSeconds ?? CONNECTOR_JOB_TIMEOUT_DEFAULTS.SNMP_WALK,
    payload: {
      oid: input.oid,
      community: input.community,
      version: input.version ?? "2c",
    },
    auditAction: "connector_device_snmp_walk",
    auditMetadata: { oid: input.oid },
  });
}

export async function executeSshCommand(
  input: BaseExecutionInput & {
    username: string;
    password: string;
    command: string;
    vendor?: string;
    port?: number;
  },
): Promise<ConnectorExecutionResult> {
  assertReadOnlySshCommand(input.command);
  return executeViaConnector({
    ...input,
    jobType: "SSH_COMMAND",
    targetPort: input.port ?? 22,
    timeoutSeconds: input.timeoutSeconds ?? CONNECTOR_JOB_TIMEOUT_DEFAULTS.SSH_COMMAND,
    payload: {
      username: input.username,
      password: input.password,
      command: input.command,
      vendor: input.vendor ?? "generic",
      port: input.port ?? 22,
    },
    auditAction: "connector_device_ssh_command",
    auditMetadata: { command: input.command, vendor: input.vendor ?? "generic" },
  });
}

export async function resolveDeviceConnectorContext(deviceId: number): Promise<{
  device: Device;
  connectorId: number | null;
  password: string;
  community: string | null;
}> {
  const [device] = await db.select().from(devicesTable).where(eq(devicesTable.id, deviceId)).limit(1);
  if (!device) {
    throw new Error("Device not found");
  }
  const password = decrypt(device.passwordEncrypted);
  return {
    device,
    connectorId: device.connectorId,
    password,
    community: device.snmpCommunity?.trim() || null,
  };
}

export function deviceUsesConnector(device: Pick<Device, "connectorId">): device is Device & { connectorId: number } {
  return typeof device.connectorId === "number" && device.connectorId > 0;
}

export async function executeSshCommandForDevice(
  device: Device,
  command: string,
  options?: { timeoutSeconds?: number; createdBy?: number | null },
): Promise<ConnectorExecutionResult> {
  if (!deviceUsesConnector(device)) {
    throw new Error("Device is not associated with a connector");
  }
  const password = decrypt(device.passwordEncrypted);
  return executeSshCommand({
    deviceId: device.id,
    connectorId: device.connectorId,
    targetIp: device.ipAddress,
    username: device.username,
    password,
    command,
    vendor: device.vendor,
    port: device.sshPort,
    timeoutSeconds: options?.timeoutSeconds,
    createdBy: options?.createdBy,
  });
}
