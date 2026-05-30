import { db, devicesTable, operationalCollectionJobsTable, operationalInterfacesTable } from "@workspace/db";
import { desc, eq } from "drizzle-orm";
import { collectSnmpInterfacesOnly, isNetopsSnmpRealEnabled } from "../netops/snmp/collect.js";
import { collectSnmpInterfacesViaConnector } from "../connectors/connector-snmp-collect.js";
import { deviceUsesConnector } from "../connectors/connector-execution.service.js";
import { computeFreshnessStatus, type FreshnessStatus } from "./freshness.js";
import { mapSnmpInterfaceToOperationalRow } from "./operational-interface-mapper.js";
import { assertSnmpFastPilotDevice, OperationalPilotError } from "./pilot.js";
import { SnmpCredentialsNotConfiguredError } from "./operational-errors.js";
import { checkSnmpFastRateLimit, recordSnmpFastCollect } from "./rate-limit.js";

export { SnmpCredentialsNotConfiguredError } from "./operational-errors.js";

export { mapSnmpInterfaceToOperationalRow } from "./operational-interface-mapper.js";

export type OperationalInterfaceDto = {
  ifIndex: number;
  ifName: string;
  ifDescr: string | null;
  ifAlias: string | null;
  adminStatus: string;
  operStatus: string;
  ifHighSpeedMbps: number | null;
  ifSpeedBps: number | null;
  ifLastChangeTicks: number | null;
  hcInOctets: string | null;
  hcOutOctets: string | null;
  source: string;
  collectedAt: string;
  freshnessStatus: FreshnessStatus;
};

export type OperationalInterfacesResponse = {
  deviceId: number;
  collectionJobId: number | null;
  job_id: number | null;
  collectedAt: string | null;
  collected_at: string | null;
  freshness: FreshnessStatus;
  freshness_status: FreshnessStatus;
  source: string | null;
  interfaceCount: number;
  interfaces: OperationalInterfaceDto[];
};

function toDto(row: typeof operationalInterfacesTable.$inferSelect): OperationalInterfaceDto {
  const collectedAt = row.collectedAt;
  return {
    ifIndex: row.ifIndex,
    ifName: row.ifName,
    ifDescr: row.ifDescr,
    ifAlias: row.ifAlias,
    adminStatus: row.adminStatus,
    operStatus: row.operStatus,
    ifHighSpeedMbps: row.ifHighSpeedMbps,
    ifSpeedBps: row.ifSpeedBps,
    ifLastChangeTicks: row.ifLastChangeTicks,
    hcInOctets: row.hcInOctets != null ? String(row.hcInOctets) : null,
    hcOutOctets: row.hcOutOctets != null ? String(row.hcOutOctets) : null,
    source: row.source,
    collectedAt: collectedAt.toISOString(),
    freshnessStatus: computeFreshnessStatus(collectedAt),
  };
}

async function getLatestJob(deviceId: number) {
  const [job] = await db
    .select()
    .from(operationalCollectionJobsTable)
    .where(eq(operationalCollectionJobsTable.deviceId, deviceId))
    .orderBy(desc(operationalCollectionJobsTable.startedAt))
    .limit(1);
  return job ?? null;
}

async function getLatestInterfacesPerIndex(deviceId: number): Promise<OperationalInterfaceDto[]> {
  const rows = await db
    .select()
    .from(operationalInterfacesTable)
    .where(eq(operationalInterfacesTable.deviceId, deviceId))
    .orderBy(desc(operationalInterfacesTable.collectedAt));

  const latestByIndex = new Map<number, (typeof rows)[number]>();
  for (const row of rows) {
    if (!latestByIndex.has(row.ifIndex)) {
      latestByIndex.set(row.ifIndex, row);
    }
  }

  return [...latestByIndex.values()]
    .sort((left, right) => left.ifIndex - right.ifIndex)
    .map((row) => toDto(row));
}

export async function getOperationalInterfaces(deviceId: number): Promise<OperationalInterfacesResponse | null> {
  assertSnmpFastPilotDevice(deviceId);

  const [device] = await db.select().from(devicesTable).where(eq(devicesTable.id, deviceId)).limit(1);
  if (!device) return null;

  const job = await getLatestJob(deviceId);
  const interfaces = await getLatestInterfacesPerIndex(deviceId);
  const collectedAt = job?.completedAt ?? job?.startedAt ?? null;
  const freshness = computeFreshnessStatus(collectedAt);
  const collectedAtIso = collectedAt?.toISOString() ?? null;
  const source = interfaces[0]?.source ?? (interfaces.length > 0 ? "snmp" : null);

  return {
    deviceId,
    collectionJobId: job?.id ?? null,
    job_id: job?.id ?? null,
    collectedAt: collectedAtIso,
    collected_at: collectedAtIso,
    freshness,
    freshness_status: freshness,
    source,
    interfaceCount: interfaces.length,
    interfaces,
  };
}

export type SnmpFastCollectResult = {
  deviceId: number;
  jobId: number;
  status: string;
  executed: boolean;
  interfaceCount: number;
  collectedAt: string;
  freshness: FreshnessStatus;
  errors: string[];
  warnings: string[];
  errorCode: string | null;
  errorSummary: string | null;
  ifMibSkipped: boolean;
};

export class SnmpFastRateLimitError extends Error {
  readonly statusCode = 429;
  readonly retryAfterSec: number;
  constructor(retryAfterSec: number) {
    super(`SNMP_FAST rate limit: retry after ${retryAfterSec}s`);
    this.name = "SnmpFastRateLimitError";
    this.retryAfterSec = retryAfterSec;
  }
}

export class SnmpFastNotEnabledError extends Error {
  readonly statusCode = 503;
  constructor() {
    super("NETOPS_SNMP_REAL_ENABLED is false — SNMP_FAST collection disabled.");
    this.name = "SnmpFastNotEnabledError";
  }
}

export async function collectSnmpFastInterfaces(
  deviceId: number,
  createdBy: string,
): Promise<SnmpFastCollectResult> {
  assertSnmpFastPilotDevice(deviceId);

  const rate = checkSnmpFastRateLimit(deviceId);
  if (!rate.allowed) {
    throw new SnmpFastRateLimitError(rate.retryAfterSec ?? 60);
  }

  if (!isNetopsSnmpRealEnabled()) {
    throw new SnmpFastNotEnabledError();
  }

  const [device] = await db.select().from(devicesTable).where(eq(devicesTable.id, deviceId)).limit(1);
  if (!device) {
    throw new Error("Device not found");
  }
  if (!device.snmpCommunity?.trim()) {
    throw new SnmpCredentialsNotConfiguredError(deviceId);
  }

  const [job] = await db
    .insert(operationalCollectionJobsTable)
    .values({
      deviceId,
      layer: "snmp_fast",
      scope: "interfaces",
      status: "running",
      createdBy,
    })
    .returning();

  const community = device.snmpCommunity.trim();
  const payload = deviceUsesConnector(device)
    ? await collectSnmpInterfacesViaConnector(device, community)
    : await collectSnmpInterfacesOnly(device, community);
  const collectedAt = new Date(payload.collectedAt);
  const freshnessStatus = computeFreshnessStatus(collectedAt);

  if (payload.interfaces.length > 0) {
    await db.insert(operationalInterfacesTable).values(
      payload.interfaces.map((iface) => mapSnmpInterfaceToOperationalRow(deviceId, job.id, iface, collectedAt, freshnessStatus)),
    );
  }

  const jobStatus = payload.success
    ? payload.interfaces.length > 0
      ? "succeeded"
      : "partial"
    : "failed";

  await db
    .update(operationalCollectionJobsTable)
    .set({
      status: jobStatus,
      completedAt: new Date(),
      errorSummary: payload.errorMessage,
    })
    .where(eq(operationalCollectionJobsTable.id, job.id));

  if (payload.interfaces.length > 0) {
    recordSnmpFastCollect(deviceId);
    await db
      .update(devicesTable)
      .set({ lastSeen: new Date(), updatedAt: new Date() })
      .where(eq(devicesTable.id, deviceId));
  }

  return {
    deviceId,
    jobId: job.id,
    status: jobStatus,
    executed: true,
    interfaceCount: payload.interfaces.length,
    collectedAt: collectedAt.toISOString(),
    freshness: freshnessStatus,
    errors: payload.errors,
    warnings: payload.warnings,
    errorCode: payload.errorCode,
    errorSummary: payload.errorMessage,
    ifMibSkipped: payload.ifMibSkipped,
  };
}
