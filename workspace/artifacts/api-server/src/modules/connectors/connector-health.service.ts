import { and, count, desc, eq, gte, inArray } from "drizzle-orm";
import {
  connectorHeartbeatsTable,
  connectorJobResultsTable,
  connectorJobsTable,
  connectorAlertsTable,
  connectorsTable,
  db,
} from "@workspace/db";
import type {
  ConnectorHealthResult,
  ConnectorHealthSignals,
  ConnectorHealthStatus,
  ConnectorHealthSummary,
  ConnectorMetricsResponse,
} from "./connector-health.types.js";

const HEARTBEAT_HEALTHY_MAX = 120;
const HEARTBEAT_WARNING_MAX = 300;
const HEARTBEAT_OFFLINE_MAX = 600;
const WG_HANDSHAKE_HEALTHY_MAX = 180;
const WG_HANDSHAKE_WARNING_MAX = 600;
const JOBS_FAILED_WARNING_THRESHOLD = 5;
const JOBS_PENDING_BACKLOG_THRESHOLD = 20;
const OLDEST_PENDING_WARNING_SECONDS = 600;
const RESOURCE_CRITICAL_THRESHOLD = 90;

export function deriveConnectorHealthStatus(signals: ConnectorHealthSignals): ConnectorHealthResult {
  const reasons: string[] = [];
  const hb = signals.lastHeartbeatAgeSeconds;
  const wg = signals.lastHandshakeAgeSeconds;
  const wgUp = (signals.wireguardStatus ?? "").toUpperCase() === "UP";

  if (hb == null) {
    reasons.push("no_heartbeat");
  } else if (hb > HEARTBEAT_OFFLINE_MAX) {
    reasons.push(`heartbeat_stale_${hb}s`);
  } else if (hb > HEARTBEAT_WARNING_MAX) {
    reasons.push(`heartbeat_delayed_${hb}s`);
  } else if (hb > HEARTBEAT_HEALTHY_MAX) {
    reasons.push(`heartbeat_slow_${hb}s`);
  }

  if (wgUp && wg != null) {
    if (wg > WG_HANDSHAKE_WARNING_MAX) {
      reasons.push(`wireguard_handshake_stale_${wg}s`);
    } else if (wg > WG_HANDSHAKE_HEALTHY_MAX) {
      reasons.push(`wireguard_handshake_slow_${wg}s`);
    }
  }

  if (signals.jobsFailedLastHour > JOBS_FAILED_WARNING_THRESHOLD) {
    reasons.push(`jobs_failed_${signals.jobsFailedLastHour}_last_hour`);
  } else if (signals.jobsFailedLastHour > 0) {
    reasons.push(`jobs_failed_${signals.jobsFailedLastHour}_last_hour`);
  }

  if (signals.jobsPending > JOBS_PENDING_BACKLOG_THRESHOLD) {
    reasons.push(`jobs_pending_${signals.jobsPending}`);
  }
  if (
    signals.oldestPendingJobAgeSeconds != null &&
    signals.oldestPendingJobAgeSeconds > OLDEST_PENDING_WARNING_SECONDS
  ) {
    reasons.push(`oldest_pending_job_${signals.oldestPendingJobAgeSeconds}s`);
  }

  if (signals.cpuUsage != null && signals.cpuUsage > RESOURCE_CRITICAL_THRESHOLD) {
    reasons.push(`cpu_high_${signals.cpuUsage}%`);
  }
  if (signals.memoryUsage != null && signals.memoryUsage > RESOURCE_CRITICAL_THRESHOLD) {
    reasons.push(`memory_high_${signals.memoryUsage}%`);
  }

  let status: ConnectorHealthStatus = "HEALTHY";
  if (hb == null || hb > HEARTBEAT_OFFLINE_MAX) {
    status = "OFFLINE";
  } else if (
    hb > HEARTBEAT_WARNING_MAX ||
    (wgUp && wg != null && wg > WG_HANDSHAKE_WARNING_MAX) ||
    signals.jobsPending > JOBS_PENDING_BACKLOG_THRESHOLD ||
    (signals.oldestPendingJobAgeSeconds != null &&
      signals.oldestPendingJobAgeSeconds > OLDEST_PENDING_WARNING_SECONDS) ||
    (signals.cpuUsage != null && signals.cpuUsage > RESOURCE_CRITICAL_THRESHOLD) ||
    (signals.memoryUsage != null && signals.memoryUsage > RESOURCE_CRITICAL_THRESHOLD) ||
    signals.jobsFailedLastHour > JOBS_FAILED_WARNING_THRESHOLD
  ) {
    status = "CRITICAL";
  } else if (
    hb > HEARTBEAT_HEALTHY_MAX ||
    (wgUp && wg != null && wg > WG_HANDSHAKE_HEALTHY_MAX) ||
    signals.jobsFailedLastHour > 0
  ) {
    status = "WARNING";
  }

  const score =
    status === "HEALTHY" ? 100 : status === "WARNING" ? 70 : status === "CRITICAL" ? 40 : 0;

  return {
    status,
    score,
    reasons,
    lastHeartbeatAgeSeconds: hb,
    lastHandshakeAgeSeconds: wg,
    jobsFailedLastHour: signals.jobsFailedLastHour,
    jobsPending: signals.jobsPending,
    cpuUsage: signals.cpuUsage,
    memoryUsage: signals.memoryUsage,
  };
}

function ageSecondsFromDate(value: Date | null | undefined, nowMs = Date.now()): number | null {
  if (!value) return null;
  return Math.max(0, Math.floor((nowMs - value.getTime()) / 1000));
}

function parseHandshakeAgeFromResultJson(resultJson: Record<string, unknown> | null): number | null {
  if (!resultJson) return null;
  const age = resultJson["latest_handshake_age_seconds"];
  if (typeof age === "number" && Number.isFinite(age)) return Math.max(0, Math.floor(age));
  const epoch = resultJson["latest_handshake_epoch"];
  if (typeof epoch === "number" && Number.isFinite(epoch)) {
    return Math.max(0, Math.floor(Date.now() / 1000 - epoch));
  }
  return null;
}

export async function gatherConnectorHealthSignals(connectorId: number): Promise<ConnectorHealthSignals> {
  const [connector] = await db
    .select()
    .from(connectorsTable)
    .where(eq(connectorsTable.id, connectorId))
    .limit(1);
  if (!connector) {
    throw new Error("Connector not found");
  }

  const [lastHb] = await db
    .select()
    .from(connectorHeartbeatsTable)
    .where(eq(connectorHeartbeatsTable.connectorId, connectorId))
    .orderBy(desc(connectorHeartbeatsTable.receivedAt))
    .limit(1);

  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
  const [failedRow] = await db
    .select({ total: count() })
    .from(connectorJobsTable)
    .where(
      and(
        eq(connectorJobsTable.connectorId, connectorId),
        eq(connectorJobsTable.status, "FAILED"),
        gte(connectorJobsTable.finishedAt, oneHourAgo),
      ),
    );

  const [pendingRow] = await db
    .select({ total: count() })
    .from(connectorJobsTable)
    .where(
      and(eq(connectorJobsTable.connectorId, connectorId), eq(connectorJobsTable.status, "PENDING")),
    );

  const [oldestPending] = await db
    .select({ createdAt: connectorJobsTable.createdAt })
    .from(connectorJobsTable)
    .where(
      and(eq(connectorJobsTable.connectorId, connectorId), eq(connectorJobsTable.status, "PENDING")),
    )
    .orderBy(connectorJobsTable.createdAt)
    .limit(1);

  const [lastWgJob] = await db
    .select({
      finishedAt: connectorJobsTable.finishedAt,
      resultJson: connectorJobResultsTable.resultJson,
    })
    .from(connectorJobsTable)
    .leftJoin(connectorJobResultsTable, eq(connectorJobResultsTable.jobId, connectorJobsTable.id))
    .where(
      and(
        eq(connectorJobsTable.connectorId, connectorId),
        eq(connectorJobsTable.jobType, "WG_STATUS"),
        eq(connectorJobsTable.status, "SUCCESS"),
      ),
    )
    .orderBy(desc(connectorJobsTable.finishedAt))
    .limit(1);

  let lastHandshakeAgeSeconds = parseHandshakeAgeFromResultJson(
    (lastWgJob?.resultJson as Record<string, unknown> | null) ?? null,
  );
  if (lastHandshakeAgeSeconds == null && lastWgJob?.finishedAt) {
    lastHandshakeAgeSeconds = ageSecondsFromDate(lastWgJob.finishedAt);
  }

  const heartbeatAt = connector.lastHeartbeat ?? lastHb?.receivedAt ?? null;

  return {
    lastHeartbeatAgeSeconds: ageSecondsFromDate(heartbeatAt),
    lastHandshakeAgeSeconds,
    wireguardStatus: lastHb?.wireguardStatus ?? null,
    jobsFailedLastHour: Number(failedRow?.total ?? 0),
    jobsPending: Number(pendingRow?.total ?? 0),
    oldestPendingJobAgeSeconds: ageSecondsFromDate(oldestPending?.createdAt ?? null),
    cpuUsage: lastHb?.cpuUsage ?? null,
    memoryUsage: lastHb?.memoryUsage ?? null,
  };
}

export async function calculateConnectorHealth(connectorId: number): Promise<ConnectorHealthResult> {
  const signals = await gatherConnectorHealthSignals(connectorId);
  return deriveConnectorHealthStatus(signals);
}

export async function getConnectorHealthSummary(): Promise<ConnectorHealthSummary> {
  const connectors = await db
    .select({ id: connectorsTable.id, status: connectorsTable.status })
    .from(connectorsTable)
    .where(inArray(connectorsTable.status, ["PENDING", "ONLINE", "OFFLINE", "DISABLED"]));

  let healthy = 0;
  let warning = 0;
  let critical = 0;
  let offline = 0;
  let jobsPending = 0;
  let jobsFailedLastHour = 0;

  for (const row of connectors) {
    const health = await calculateConnectorHealth(row.id);
    if (health.status === "HEALTHY") healthy += 1;
    else if (health.status === "WARNING") warning += 1;
    else if (health.status === "CRITICAL") critical += 1;
    else offline += 1;
    jobsPending += health.jobsPending;
    jobsFailedLastHour += health.jobsFailedLastHour;
  }

  const [openAlertsRow] = await db
    .select({ total: count() })
    .from(connectorAlertsTable)
    .where(inArray(connectorAlertsTable.status, ["OPEN", "ACKNOWLEDGED"]));

  return {
    total: connectors.length,
    healthy,
    warning,
    critical,
    offline,
    openAlerts: Number(openAlertsRow?.total ?? 0),
    jobsPending,
    jobsFailedLastHour,
  };
}

export async function getConnectorMetrics(): Promise<ConnectorMetricsResponse> {
  const connectors = await db
    .select({ id: connectorsTable.id, name: connectorsTable.name, status: connectorsTable.status })
    .from(connectorsTable);

  const summary = await getConnectorHealthSummary();
  const connectorMetrics: ConnectorMetricsResponse["connectors"] = [];

  for (const row of connectors) {
    const health = await calculateConnectorHealth(row.id);
    const [openRow] = await db
      .select({ total: count() })
      .from(connectorAlertsTable)
      .where(
        and(
          eq(connectorAlertsTable.connectorId, row.id),
          inArray(connectorAlertsTable.status, ["OPEN", "ACKNOWLEDGED"]),
        ),
      );
    const openAlerts = Number(openRow?.total ?? 0);
    connectorMetrics.push({
      connector_id: row.id,
      connector_name: row.name,
      connector_heartbeat_age_seconds: health.lastHeartbeatAgeSeconds,
      connector_health_score: health.score,
      connector_health_status: health.status,
      connector_wireguard_handshake_age_seconds: health.lastHandshakeAgeSeconds,
      connector_jobs_pending: health.jobsPending,
      connector_jobs_failed_1h: health.jobsFailedLastHour,
      connector_alerts_open: openAlerts,
    });
  }

  const onlineTotal = connectors.filter((c) => c.status === "ONLINE").length;

  return {
    connector_total: connectors.length,
    connector_online_total: onlineTotal,
    connector_offline_total: connectors.length - onlineTotal,
    connector_alerts_open_total: summary.openAlerts,
    connector_jobs_pending_total: summary.jobsPending,
    connector_jobs_failed_1h_total: summary.jobsFailedLastHour,
    connectors: connectorMetrics,
  };
}

export async function countOpenConnectorAlerts(): Promise<number> {
  const [row] = await db
    .select({ total: count() })
    .from(connectorAlertsTable)
    .where(inArray(connectorAlertsTable.status, ["OPEN", "ACKNOWLEDGED"]));
  return Number(row?.total ?? 0);
}
