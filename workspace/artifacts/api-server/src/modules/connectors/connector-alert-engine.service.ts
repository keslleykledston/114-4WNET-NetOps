import { and, desc, eq, inArray, isNull, or } from "drizzle-orm";
import {
  collectedConfigsTable,
  connectorAlertsTable,
  connectorJobsTable,
  connectorsTable,
  db,
  devicesTable,
  operationalCollectionJobsTable,
} from "@workspace/db";
import { gatherConnectorHealthSignals } from "./connector-health.service.js";
import { dispatchAlertNotifications } from "../notifications/notifications.service.js";
import type {
  ConnectorAlertSeverity,
  ConnectorAlertStatus,
  ConnectorAlertType,
} from "./connector-health.types.js";

const HEARTBEAT_OFFLINE_ALERT_SECONDS = 600;
const WG_STALE_HANDSHAKE_SECONDS = 600;
const JOBS_FAILED_ALERT_THRESHOLD = 5;
const JOBS_PENDING_BACKLOG_THRESHOLD = 20;
const OLDEST_PENDING_ALERT_SECONDS = 600;
const RESOURCE_ALERT_THRESHOLD = 90;

type AlertCandidate = {
  alertType: ConnectorAlertType;
  severity: ConnectorAlertSeverity;
  deviceId?: number | null;
  title: string;
  message: string;
  details?: Record<string, unknown>;
};

function openAlertKey(connectorId: number, alertType: string, deviceId: number | null | undefined) {
  return `${connectorId}:${alertType}:${deviceId ?? "null"}`;
}

export async function upsertAlert(input: {
  connectorId: number;
  tenantId: number;
  deviceId?: number | null;
  severity: ConnectorAlertSeverity;
  alertType: ConnectorAlertType;
  title: string;
  message: string;
  details?: Record<string, unknown>;
}) {
  const now = new Date();
  const deviceId = input.deviceId ?? null;
  const conditions = [
    eq(connectorAlertsTable.connectorId, input.connectorId),
    eq(connectorAlertsTable.alertType, input.alertType),
    inArray(connectorAlertsTable.status, ["OPEN", "ACKNOWLEDGED"]),
  ];
  if (deviceId == null) {
    conditions.push(isNull(connectorAlertsTable.deviceId));
  } else {
    conditions.push(eq(connectorAlertsTable.deviceId, deviceId));
  }

  const [existing] = await db
    .select()
    .from(connectorAlertsTable)
    .where(and(...conditions))
    .orderBy(desc(connectorAlertsTable.lastSeenAt))
    .limit(1);

  if (existing) {
    await db
      .update(connectorAlertsTable)
      .set({
        severity: input.severity,
        title: input.title,
        message: input.message,
        detailsJson: input.details ?? existing.detailsJson ?? {},
        lastSeenAt: now,
        updatedAt: now,
      })
      .where(eq(connectorAlertsTable.id, existing.id));
    return existing.id;
  }

  const [inserted] = await db
    .insert(connectorAlertsTable)
    .values({
      connectorId: input.connectorId,
      tenantId: input.tenantId,
      deviceId,
      severity: input.severity,
      alertType: input.alertType,
      status: "OPEN",
      title: input.title,
      message: input.message,
      detailsJson: input.details ?? {},
      firstSeenAt: now,
      lastSeenAt: now,
      createdAt: now,
      updatedAt: now,
    })
    .returning({ id: connectorAlertsTable.id });

  return inserted?.id ?? null;
}

export async function resolveAlert(input: {
  connectorId: number;
  alertType: ConnectorAlertType;
  deviceId?: number | null;
}) {
  const now = new Date();
  const deviceId = input.deviceId ?? null;
  const conditions = [
    eq(connectorAlertsTable.connectorId, input.connectorId),
    eq(connectorAlertsTable.alertType, input.alertType),
    inArray(connectorAlertsTable.status, ["OPEN", "ACKNOWLEDGED"]),
  ];
  if (deviceId == null) {
    conditions.push(isNull(connectorAlertsTable.deviceId));
  } else {
    conditions.push(eq(connectorAlertsTable.deviceId, deviceId));
  }

  const rows = await db.select().from(connectorAlertsTable).where(and(...conditions));
  for (const row of rows) {
    await db
      .update(connectorAlertsTable)
      .set({ status: "RESOLVED", resolvedAt: now, updatedAt: now })
      .where(eq(connectorAlertsTable.id, row.id));
  }
  return rows.length;
}

async function buildConnectorLevelCandidates(connectorId: number): Promise<AlertCandidate[]> {
  const signals = await gatherConnectorHealthSignals(connectorId);
  const candidates: AlertCandidate[] = [];
  const wgUp = (signals.wireguardStatus ?? "").toUpperCase() === "UP";

  if (
    signals.lastHeartbeatAgeSeconds != null &&
    signals.lastHeartbeatAgeSeconds > HEARTBEAT_OFFLINE_ALERT_SECONDS
  ) {
    candidates.push({
      alertType: "CONNECTOR_OFFLINE",
      severity: "CRITICAL",
      title: "Connector offline",
      message: `No heartbeat for ${signals.lastHeartbeatAgeSeconds}s`,
      details: { last_heartbeat_age_seconds: signals.lastHeartbeatAgeSeconds },
    });
  }

  if (
    wgUp &&
    signals.lastHandshakeAgeSeconds != null &&
    signals.lastHandshakeAgeSeconds > WG_STALE_HANDSHAKE_SECONDS
  ) {
    candidates.push({
      alertType: "WIREGUARD_STALE_HANDSHAKE",
      severity: "WARNING",
      title: "WireGuard handshake stale",
      message: `Latest handshake age ${signals.lastHandshakeAgeSeconds}s while tunnel is UP`,
      details: { last_handshake_age_seconds: signals.lastHandshakeAgeSeconds },
    });
  }

  if (signals.jobsFailedLastHour > JOBS_FAILED_ALERT_THRESHOLD) {
    candidates.push({
      alertType: "JOBS_FAILING",
      severity: "WARNING",
      title: "Connector jobs failing",
      message: `${signals.jobsFailedLastHour} jobs failed in the last hour`,
      details: { jobs_failed_last_hour: signals.jobsFailedLastHour },
    });
  }

  if (
    signals.jobsPending > JOBS_PENDING_BACKLOG_THRESHOLD ||
    (signals.oldestPendingJobAgeSeconds != null &&
      signals.oldestPendingJobAgeSeconds > OLDEST_PENDING_ALERT_SECONDS)
  ) {
    candidates.push({
      alertType: "JOBS_QUEUE_BACKLOG",
      severity: "WARNING",
      title: "Connector job queue backlog",
      message: `${signals.jobsPending} pending jobs (oldest ${signals.oldestPendingJobAgeSeconds ?? "n/a"}s)`,
      details: {
        jobs_pending: signals.jobsPending,
        oldest_pending_age_seconds: signals.oldestPendingJobAgeSeconds,
      },
    });
  }

  if (signals.cpuUsage != null && signals.cpuUsage > RESOURCE_ALERT_THRESHOLD) {
    candidates.push({
      alertType: "HIGH_CPU",
      severity: "WARNING",
      title: "High CPU on connector",
      message: `CPU usage ${signals.cpuUsage}%`,
      details: { cpu_usage: signals.cpuUsage },
    });
  }

  if (signals.memoryUsage != null && signals.memoryUsage > RESOURCE_ALERT_THRESHOLD) {
    candidates.push({
      alertType: "HIGH_MEMORY",
      severity: "WARNING",
      title: "High memory on connector",
      message: `Memory usage ${signals.memoryUsage}%`,
      details: { memory_usage: signals.memoryUsage },
    });
  }

  return candidates;
}

async function buildDeviceLevelCandidates(connectorId: number): Promise<AlertCandidate[]> {
  const devices = await db
    .select()
    .from(devicesTable)
    .where(eq(devicesTable.connectorId, connectorId));

  const candidates: AlertCandidate[] = [];
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);

  for (const device of devices) {
    const [latestConfig] = await db
      .select()
      .from(collectedConfigsTable)
      .where(eq(collectedConfigsTable.deviceId, device.id))
      .orderBy(desc(collectedConfigsTable.collectedAt))
      .limit(1);

    if (latestConfig?.parserStatus === "FAILED") {
      candidates.push({
        alertType: "CONFIG_PARSE_FAILED",
        severity: "WARNING",
        deviceId: device.id,
        title: `Config parse failed (${device.hostname})`,
        message: latestConfig.parserError ?? "Parser returned FAILED",
        details: { collected_config_id: latestConfig.id, parser_status: "FAILED" },
      });
      const summary = (latestConfig.parsedSummaryJson ?? {}) as { errors?: string[] };
      const errors = summary.errors ?? [];
      if (errors.some((e) => /bgp/i.test(e))) {
        candidates.push({
          alertType: "BGP_PARSE_FAILED",
          severity: "WARNING",
          deviceId: device.id,
          title: `BGP parse failed (${device.hostname})`,
          message: errors.find((e) => /bgp/i.test(e)) ?? "BGP section parse error",
          details: { collected_config_id: latestConfig.id },
        });
      }
      if (errors.some((e) => /l2|mpls|vsi/i.test(e))) {
        candidates.push({
          alertType: "L2_PARSE_FAILED",
          severity: "WARNING",
          deviceId: device.id,
          title: `L2 parse failed (${device.hostname})`,
          message: errors.find((e) => /l2|mpls|vsi/i.test(e)) ?? "L2 section parse error",
          details: { collected_config_id: latestConfig.id },
        });
      }
    }

    const [lastSshJob] = await db
      .select({ status: connectorJobsTable.status, finishedAt: connectorJobsTable.finishedAt })
      .from(connectorJobsTable)
      .where(
        and(
          eq(connectorJobsTable.connectorId, connectorId),
          eq(connectorJobsTable.deviceId, device.id),
          eq(connectorJobsTable.jobType, "SSH_CONFIG_BUNDLE"),
        ),
      )
      .orderBy(desc(connectorJobsTable.createdAt))
      .limit(1);

    if (lastSshJob?.status === "FAILED" && lastSshJob.finishedAt && lastSshJob.finishedAt >= oneHourAgo) {
      candidates.push({
        alertType: "SSH_COLLECTION_FAILED",
        severity: "WARNING",
        deviceId: device.id,
        title: `SSH bundle failed (${device.hostname})`,
        message: "Latest SSH_CONFIG_BUNDLE job failed",
        details: { device_id: device.id },
      });
    }

    const [lastSnmpJob] = await db
      .select({
        status: operationalCollectionJobsTable.status,
        completedAt: operationalCollectionJobsTable.completedAt,
        errorSummary: operationalCollectionJobsTable.errorSummary,
      })
      .from(operationalCollectionJobsTable)
      .where(
        and(
          eq(operationalCollectionJobsTable.deviceId, device.id),
          eq(operationalCollectionJobsTable.layer, "snmp_fast"),
        ),
      )
      .orderBy(desc(operationalCollectionJobsTable.startedAt))
      .limit(1);

    if (lastSnmpJob?.status === "failed") {
      candidates.push({
        alertType: "SNMP_COLLECTION_FAILED",
        severity: "WARNING",
        deviceId: device.id,
        title: `SNMP fast failed (${device.hostname})`,
        message: lastSnmpJob.errorSummary ?? "SNMP_FAST collection failed",
        details: { device_id: device.id },
      });
    }

    const [lastSnmpConnectorJob] = await db
      .select({ status: connectorJobsTable.status, finishedAt: connectorJobsTable.finishedAt })
      .from(connectorJobsTable)
      .where(
        and(
          eq(connectorJobsTable.connectorId, connectorId),
          eq(connectorJobsTable.deviceId, device.id),
          or(eq(connectorJobsTable.jobType, "SNMP_WALK"), eq(connectorJobsTable.jobType, "SNMP_GET")),
        ),
      )
      .orderBy(desc(connectorJobsTable.createdAt))
      .limit(1);

    if (
      lastSnmpConnectorJob?.status === "FAILED" &&
      lastSnmpConnectorJob.finishedAt &&
      lastSnmpConnectorJob.finishedAt >= oneHourAgo
    ) {
      const alreadySnmp = candidates.some(
        (c) => c.alertType === "SNMP_COLLECTION_FAILED" && c.deviceId === device.id,
      );
      if (!alreadySnmp) {
        candidates.push({
          alertType: "SNMP_COLLECTION_FAILED",
          severity: "WARNING",
          deviceId: device.id,
          title: `SNMP job failed (${device.hostname})`,
          message: "Latest SNMP connector job failed",
          details: { device_id: device.id },
        });
      }
    }
  }

  return candidates;
}

const CONNECTOR_LEVEL_TYPES: ConnectorAlertType[] = [
  "CONNECTOR_OFFLINE",
  "WIREGUARD_STALE_HANDSHAKE",
  "JOBS_FAILING",
  "JOBS_QUEUE_BACKLOG",
  "HIGH_CPU",
  "HIGH_MEMORY",
];

const DEVICE_LEVEL_TYPES: ConnectorAlertType[] = [
  "SSH_COLLECTION_FAILED",
  "SNMP_COLLECTION_FAILED",
  "CONFIG_PARSE_FAILED",
  "BGP_PARSE_FAILED",
  "L2_PARSE_FAILED",
];

export async function evaluateConnectorAlert(connectorId: number) {
  const [connector] = await db
    .select()
    .from(connectorsTable)
    .where(eq(connectorsTable.id, connectorId))
    .limit(1);
  if (!connector || connector.status === "REVOKED") {
    return { connectorId, upserted: 0, resolved: 0 };
  }

  const connectorCandidates = await buildConnectorLevelCandidates(connectorId);
  const deviceCandidates = await buildDeviceLevelCandidates(connectorId);
  const activeKeys = new Set<string>();

  let upserted = 0;
  for (const candidate of [...connectorCandidates, ...deviceCandidates]) {
    activeKeys.add(openAlertKey(connectorId, candidate.alertType, candidate.deviceId));
    await upsertAlert({
      connectorId,
      tenantId: connector.tenantId,
      deviceId: candidate.deviceId,
      severity: candidate.severity,
      alertType: candidate.alertType,
      title: candidate.title,
      message: candidate.message,
      details: candidate.details,
    });
    void dispatchAlertNotifications({
      tenantId: connector.tenantId,
      connectorId,
      connectorName: connector.name,
      deviceId: candidate.deviceId ?? null,
      alertType: candidate.alertType,
      severity: candidate.severity,
      title: candidate.title,
      message: candidate.message,
      payload: candidate.details ?? {},
    }).catch((error) => {
      console.error("alert notification dispatch failed:", error);
    });
    upserted += 1;
  }

  const openRows = await db
    .select()
    .from(connectorAlertsTable)
    .where(
      and(
        eq(connectorAlertsTable.connectorId, connectorId),
        inArray(connectorAlertsTable.status, ["OPEN", "ACKNOWLEDGED"]),
      ),
    );

  let resolved = 0;
  for (const row of openRows) {
    const type = row.alertType as ConnectorAlertType;
    const isConnectorLevel = CONNECTOR_LEVEL_TYPES.includes(type);
    const isDeviceLevel = DEVICE_LEVEL_TYPES.includes(type);
    const key = openAlertKey(connectorId, type, row.deviceId);
    if ((isConnectorLevel || isDeviceLevel) && !activeKeys.has(key)) {
      await resolveAlert({ connectorId, alertType: type, deviceId: row.deviceId });
      resolved += 1;
    }
  }

  return { connectorId, upserted, resolved };
}

export async function evaluateConnectorAlerts() {
  const connectors = await db
    .select({ id: connectorsTable.id })
    .from(connectorsTable)
    .where(inArray(connectorsTable.status, ["PENDING", "ONLINE", "OFFLINE", "DISABLED"]));

  const results = [];
  for (const row of connectors) {
    results.push(await evaluateConnectorAlert(row.id));
  }
  return results;
}

export async function listConnectorAlerts(filters?: {
  connectorId?: number;
  status?: ConnectorAlertStatus | ConnectorAlertStatus[];
  limit?: number;
}) {
  const conditions = [];
  if (filters?.connectorId) {
    conditions.push(eq(connectorAlertsTable.connectorId, filters.connectorId));
  }
  if (filters?.status) {
    const statuses = Array.isArray(filters.status) ? filters.status : [filters.status];
    conditions.push(inArray(connectorAlertsTable.status, statuses));
  }

  const rows = await db
    .select()
    .from(connectorAlertsTable)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(connectorAlertsTable.lastSeenAt))
    .limit(filters?.limit ?? 200);

  return rows.map((row) => ({
    id: row.id,
    connector_id: row.connectorId,
    tenant_id: row.tenantId,
    device_id: row.deviceId,
    severity: row.severity,
    alert_type: row.alertType,
    status: row.status,
    title: row.title,
    message: row.message,
    details_json: row.detailsJson,
    first_seen_at: row.firstSeenAt.toISOString(),
    last_seen_at: row.lastSeenAt.toISOString(),
    resolved_at: row.resolvedAt?.toISOString() ?? null,
    created_at: row.createdAt.toISOString(),
    updated_at: row.updatedAt.toISOString(),
  }));
}

export async function acknowledgeConnectorAlert(alertId: number) {
  const [row] = await db
    .select()
    .from(connectorAlertsTable)
    .where(eq(connectorAlertsTable.id, alertId))
    .limit(1);
  if (!row) return null;
  if (row.status === "RESOLVED") return row;
  const now = new Date();
  await db
    .update(connectorAlertsTable)
    .set({ status: "ACKNOWLEDGED", updatedAt: now })
    .where(eq(connectorAlertsTable.id, alertId));
  return { ...row, status: "ACKNOWLEDGED" as const, updatedAt: now };
}

export async function manuallyResolveConnectorAlert(alertId: number) {
  const [row] = await db
    .select()
    .from(connectorAlertsTable)
    .where(eq(connectorAlertsTable.id, alertId))
    .limit(1);
  if (!row) return null;
  const now = new Date();
  await db
    .update(connectorAlertsTable)
    .set({ status: "RESOLVED", resolvedAt: now, updatedAt: now })
    .where(eq(connectorAlertsTable.id, alertId));
  return { ...row, status: "RESOLVED" as const, resolvedAt: now, updatedAt: now };
}

export async function countOpenAlertsForConnector(connectorId: number): Promise<number> {
  const rows = await listConnectorAlerts({
    connectorId,
    status: ["OPEN", "ACKNOWLEDGED"],
    limit: 500,
  });
  return rows.length;
}
