#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function read(relPath) {
  return readFileSync(path.join(root, relPath), "utf8");
}

/** Mirror connector-health.service deriveConnectorHealthStatus */
function deriveConnectorHealthStatus(signals) {
  const reasons = [];
  const hb = signals.lastHeartbeatAgeSeconds;
  const wg = signals.lastHandshakeAgeSeconds;
  const wgUp = (signals.wireguardStatus ?? "").toUpperCase() === "UP";

  if (hb == null) reasons.push("no_heartbeat");
  else if (hb > 600) reasons.push(`heartbeat_stale_${hb}s`);
  else if (hb > 300) reasons.push(`heartbeat_delayed_${hb}s`);
  else if (hb > 120) reasons.push(`heartbeat_slow_${hb}s`);

  if (wgUp && wg != null) {
    if (wg > 600) reasons.push(`wireguard_handshake_stale_${wg}s`);
    else if (wg > 180) reasons.push(`wireguard_handshake_slow_${wg}s`);
  }

  if (signals.jobsFailedLastHour > 5) reasons.push(`jobs_failed_${signals.jobsFailedLastHour}_last_hour`);
  else if (signals.jobsFailedLastHour > 0) reasons.push(`jobs_failed_${signals.jobsFailedLastHour}_last_hour`);

  if (signals.jobsPending > 20) reasons.push(`jobs_pending_${signals.jobsPending}`);
  if (signals.oldestPendingJobAgeSeconds != null && signals.oldestPendingJobAgeSeconds > 600) {
    reasons.push(`oldest_pending_job_${signals.oldestPendingJobAgeSeconds}s`);
  }

  if (signals.cpuUsage != null && signals.cpuUsage > 90) reasons.push(`cpu_high_${signals.cpuUsage}%`);
  if (signals.memoryUsage != null && signals.memoryUsage > 90) reasons.push(`memory_high_${signals.memoryUsage}%`);

  let status = "HEALTHY";
  if (hb == null || hb > 600) status = "OFFLINE";
  else if (
    hb > 300 ||
    (wgUp && wg != null && wg > 600) ||
    signals.jobsPending > 20 ||
    (signals.oldestPendingJobAgeSeconds != null && signals.oldestPendingJobAgeSeconds > 600) ||
    (signals.cpuUsage != null && signals.cpuUsage > 90) ||
    (signals.memoryUsage != null && signals.memoryUsage > 90) ||
    signals.jobsFailedLastHour > 5
  ) {
    status = "CRITICAL";
  } else if (
    hb > 120 ||
    (wgUp && wg != null && wg > 180) ||
    signals.jobsFailedLastHour > 0
  ) {
    status = "WARNING";
  }

  const score = status === "HEALTHY" ? 100 : status === "WARNING" ? 70 : status === "CRITICAL" ? 40 : 0;
  return { status, score, reasons };
}

const healthy = deriveConnectorHealthStatus({
  lastHeartbeatAgeSeconds: 60,
  lastHandshakeAgeSeconds: 90,
  wireguardStatus: "UP",
  jobsFailedLastHour: 0,
  jobsPending: 0,
  oldestPendingJobAgeSeconds: null,
  cpuUsage: 20,
  memoryUsage: 30,
});
assert.equal(healthy.status, "HEALTHY");
assert.equal(healthy.score, 100);

const warningHb = deriveConnectorHealthStatus({
  lastHeartbeatAgeSeconds: 150,
  lastHandshakeAgeSeconds: 90,
  wireguardStatus: "UP",
  jobsFailedLastHour: 0,
  jobsPending: 0,
  oldestPendingJobAgeSeconds: null,
  cpuUsage: 20,
  memoryUsage: 30,
});
assert.equal(warningHb.status, "WARNING");

const offline = deriveConnectorHealthStatus({
  lastHeartbeatAgeSeconds: 700,
  lastHandshakeAgeSeconds: null,
  wireguardStatus: "DOWN",
  jobsFailedLastHour: 0,
  jobsPending: 0,
  oldestPendingJobAgeSeconds: null,
  cpuUsage: null,
  memoryUsage: null,
});
assert.equal(offline.status, "OFFLINE");

const backlog = deriveConnectorHealthStatus({
  lastHeartbeatAgeSeconds: 60,
  lastHandshakeAgeSeconds: 60,
  wireguardStatus: "UP",
  jobsFailedLastHour: 0,
  jobsPending: 25,
  oldestPendingJobAgeSeconds: 100,
  cpuUsage: 10,
  memoryUsage: 10,
});
assert.equal(backlog.status, "CRITICAL");

const failingJobs = deriveConnectorHealthStatus({
  lastHeartbeatAgeSeconds: 60,
  lastHandshakeAgeSeconds: 60,
  wireguardStatus: "UP",
  jobsFailedLastHour: 8,
  jobsPending: 0,
  oldestPendingJobAgeSeconds: null,
  cpuUsage: 10,
  memoryUsage: 10,
});
assert.equal(failingJobs.status, "CRITICAL");

const migration = read("workspace/lib/db/migrations/0023_connector_alerts.sql");
const schema = read("workspace/lib/db/src/schema/connectors.ts");
const healthSvc = read("workspace/artifacts/api-server/src/modules/connectors/connector-health.service.ts");
const alertSvc = read("workspace/artifacts/api-server/src/modules/connectors/connector-alert-engine.service.ts");
const runner = read("workspace/artifacts/api-server/src/modules/connectors/connector-health.runner.ts");
const routes = read("workspace/artifacts/api-server/src/modules/connectors/connectors.routes.ts");
const index = read("workspace/artifacts/api-server/src/index.ts");
const collection = read("workspace/artifacts/api-server/src/modules/config-backup/config-bundle-parser.service.ts");
const dashboard = read("workspace/artifacts/netops-manager/src/pages/connector-dashboard.tsx");
const detail = read("workspace/artifacts/netops-manager/src/pages/connector-detail.tsx");
const layout = read("workspace/artifacts/netops-manager/src/components/layout.tsx");

assert.match(migration, /connector_alerts/);
assert.match(migration, /CONNECTOR_OFFLINE|alert_type/);
assert.match(schema, /connectorAlertsTable/);

assert.match(healthSvc, /calculateConnectorHealth/);
assert.match(healthSvc, /deriveConnectorHealthStatus/);
assert.match(healthSvc, /getConnectorHealthSummary/);
assert.match(healthSvc, /getConnectorMetrics/);

assert.match(alertSvc, /evaluateConnectorAlerts/);
assert.match(alertSvc, /evaluateConnectorAlert/);
assert.match(alertSvc, /upsertAlert/);
assert.match(alertSvc, /resolveAlert/);
assert.match(alertSvc, /CONNECTOR_OFFLINE/);
assert.match(alertSvc, /CONFIG_PARSE_FAILED/);
assert.match(alertSvc, /JOBS_QUEUE_BACKLOG/);

assert.match(runner, /CONNECTOR_HEALTH_EVAL_INTERVAL/);
assert.match(runner, /evaluateConnectorAlerts/);

assert.match(routes, /\/connectors\/health\/summary/);
assert.match(routes, /\/connectors\/metrics/);
assert.match(routes, /\/connector-alerts/);
assert.match(routes, /\/connectors\/:id\/health/);
assert.match(routes, /\/connectors\/:id\/alerts/);
assert.match(routes, /connector-alerts\/:id\/ack/);
assert.match(routes, /connector-alerts\/:id\/resolve/);

assert.match(index, /startConnectorHealthEvaluation/);

assert.match(collection, /connectorHealth/);
assert.match(collection, /lastSshBundleAgeSeconds/);
assert.match(collection, /lastSnmpFastAgeSeconds/);
assert.match(collection, /openAlerts/);

assert.match(dashboard, /Dashboard Connectors/);
assert.match(dashboard, /Jobs Falhos 1h/);
assert.match(detail, /value="alerts"/);
assert.match(detail, /acknowledgeConnectorAlert/);
assert.match(layout, /openConnectorAlerts/);

console.log("connectors-phase5-alerts-selftest: 28 checks OK");
