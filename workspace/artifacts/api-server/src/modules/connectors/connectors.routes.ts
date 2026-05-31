import { Router } from "express";
import { requireRole } from "../../lib/auth.js";
import { getRequestSourceIp, logAuditEvent } from "../../lib/audit.js";
import { getRequestContext } from "../../lib/request-context.js";
import type { ConnectorAuthedRequest } from "./connector-auth.middleware.js";
import { requireConnectorAuth } from "./connector-auth.middleware.js";
import {
  addConnectorNetwork,
  createConnector,
  createConnectorJob,
  createTenant,
  deleteConnector,
  expireTimedOutJobs,
  generateBootstrapPackage,
  getConnectorById,
  getConnectorWireGuardStatus,
  getWireGuardConfigForConnector,
  listConnectorJobs,
  listConnectorJobsEnriched,
  getConnectorJobDetail,
  listConnectors,
  listPendingJobsForConnector,
  listTenants,
  processHeartbeat,
  regenerateWireGuardKeys,
  revokeConnector,
  provisionWireGuardForConnector,
  WireGuardServerKeyMissingError,
  submitJobResult,
  updateConnector,
} from "./connectors.service.js";
import {
  createConnectorGroup,
  deleteConnectorGroup,
  getConnectorGroupById,
  listConnectorGroupMembers,
  listConnectorGroups,
  removeConnectorGroupMember,
  updateConnectorGroup,
  upsertConnectorGroupMember,
} from "./connector-groups.service.js";
import type {
  ConnectorGroupStrategy,
  ConnectorHeartbeatPayload,
  ConnectorJobResultPayload,
  ConnectorJobType,
} from "./connectors.types.js";
import { ConflictError } from "../../lib/db-errors.js";
import { maskConnectorToken } from "./connector-token.js";
import { processConfigBundleAfterSubmit } from "./connector-config-collect.service.js";
import {
  calculateConnectorHealth,
  getConnectorHealthSummary,
  getConnectorMetrics,
} from "./connector-health.service.js";
import {
  executeNetconfGetConfig,
  executeNetconfTest,
} from "./connector-netconf.service.js";
import {
  acknowledgeConnectorAlert,
  countOpenAlertsForConnector,
  evaluateConnectorAlert,
  listConnectorAlerts,
  manuallyResolveConnectorAlert,
} from "./connector-alert-engine.service.js";
import { buildProvisioningPreview } from "../provisioning/provisioning-preview.service.js";

function sendRouteError(res: import("express").Response, error: unknown, fallback: string) {
  if (error instanceof ConflictError) {
    res.status(409).json({ error: error.message });
    return;
  }
  res.status(500).json({ error: error instanceof Error ? error.message : fallback });
}

export const connectorAgentRouter = Router();

connectorAgentRouter.post("/connectors/heartbeat", requireConnectorAuth, async (req: ConnectorAuthedRequest, res) => {
  try {
    const payload = req.body as ConnectorHeartbeatPayload;
    const result = await processHeartbeat(req.connector!.id, payload);
    res.json(result);
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : "Heartbeat failed" });
  }
});

connectorAgentRouter.get("/connectors/jobs/pending", requireConnectorAuth, async (req: ConnectorAuthedRequest, res) => {
  try {
    await expireTimedOutJobs();
    const jobs = await listPendingJobsForConnector(req.connector!.id, 20);
    res.json({ jobs });
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : "Failed to list pending jobs" });
  }
});

connectorAgentRouter.post("/connectors/jobs/:jobId/result", requireConnectorAuth, async (req: ConnectorAuthedRequest, res) => {
  try {
    const jobId = Number(req.params.jobId);
    if (!Number.isInteger(jobId) || jobId < 1) {
      res.status(400).json({ error: "Invalid job id" });
      return;
    }
    const result = await submitJobResult(req.connector!.id, jobId, req.body as ConnectorJobResultPayload);
    void processConfigBundleAfterSubmit(req.connector!.id, jobId).catch((error) => {
      console.error("config bundle post-process failed:", error);
    });
    res.json(result);
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : "Failed to submit job result" });
  }
});

function sendWireGuardProvisionError(res: import("express").Response, error: unknown) {
  if (error instanceof WireGuardServerKeyMissingError) {
    res.status(503).json({
      error: error.message,
      code: error.code,
      hint: "Configure NETOPS_WG_SERVER_PUBLIC_KEY on the NetOps API server (WireGuard hub public key, base64).",
    });
    return;
  }
  res.status(400).json({ error: error instanceof Error ? error.message : "WireGuard provision failed" });
}

connectorAgentRouter.post("/connectors/wireguard/provision", requireConnectorAuth, async (req: ConnectorAuthedRequest, res) => {
  try {
    const provision = await provisionWireGuardForConnector(req.connector!.id);
    if (!provision) {
      res.status(404).json({ error: "WireGuard not configured for connector", code: "WG_NOT_CONFIGURED" });
      return;
    }
    res.json(provision);
  } catch (error) {
    sendWireGuardProvisionError(res, error);
  }
});

connectorAgentRouter.get("/connectors/wireguard/provision", requireConnectorAuth, async (req: ConnectorAuthedRequest, res) => {
  try {
    const provision = await provisionWireGuardForConnector(req.connector!.id);
    if (!provision) {
      res.status(404).json({ error: "WireGuard not configured for connector", code: "WG_NOT_CONFIGURED" });
      return;
    }
    res.json(provision);
  } catch (error) {
    sendWireGuardProvisionError(res, error);
  }
});

connectorAgentRouter.post("/connectors/provisioning/preview", requireConnectorAuth, async (req: ConnectorAuthedRequest, res) => {
  try {
    const body = req.body as Record<string, unknown>;
    const deviceId = Number(body.device_id);
    const templateId = typeof body.template_id === "string" ? body.template_id : "";
    const parameters = body.parameters && typeof body.parameters === "object" && !Array.isArray(body.parameters)
      ? body.parameters as Record<string, unknown>
      : {};

    if (!Number.isInteger(deviceId) || deviceId < 1 || !templateId) {
      res.status(400).json({ error: "device_id and template_id are required" });
      return;
    }

    const preview = await buildProvisioningPreview({
      deviceId,
      templateId,
      parameters,
      mode: typeof body.mode === "string" ? body.mode : "dry_run",
      maintenanceWindowStart: typeof body.maintenanceWindowStart === "string" ? body.maintenanceWindowStart : null,
      maintenanceWindowEnd: typeof body.maintenanceWindowEnd === "string" ? body.maintenanceWindowEnd : null,
      rollbackPlan: typeof body.rollbackPlan === "string" ? body.rollbackPlan : null,
    });

    if ("error" in preview) {
      res.status(preview.status).json({ error: preview.error });
      return;
    }

    res.json(preview);
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : "Provisioning preview failed" });
  }
});

export const connectorsManagementRouter = Router();
const management = connectorsManagementRouter;

management.get("/connectors", async (_req, res) => {
  const connectors = await listConnectors();
  res.json(connectors);
});

management.get("/connectors/health/summary", async (_req, res) => {
  try {
    res.json(await getConnectorHealthSummary());
  } catch (error) {
    sendRouteError(res, error, "Failed to load connector health summary");
  }
});

management.get("/connectors/metrics", async (_req, res) => {
  try {
    res.json(await getConnectorMetrics());
  } catch (error) {
    sendRouteError(res, error, "Failed to load connector metrics");
  }
});

management.get("/connector-alerts", async (req, res) => {
  try {
    const statusParam = typeof req.query.status === "string" ? req.query.status : undefined;
    const connectorId = Number(req.query.connector_id);
    const alerts = await listConnectorAlerts({
      connectorId: Number.isInteger(connectorId) && connectorId > 0 ? connectorId : undefined,
      status: statusParam
        ? (statusParam.split(",") as Array<"OPEN" | "ACKNOWLEDGED" | "RESOLVED">)
        : undefined,
      limit: 500,
    });
    res.json(alerts);
  } catch (error) {
    sendRouteError(res, error, "Failed to list connector alerts");
  }
});

management.post("/connector-alerts/:id/ack", requireRole(["admin", "operator"]), async (req, res) => {
  const alertId = Number(req.params.id);
  if (!Number.isInteger(alertId) || alertId < 1) {
    res.status(400).json({ error: "Invalid alert id" });
    return;
  }
  const updated = await acknowledgeConnectorAlert(alertId);
  if (!updated) {
    res.status(404).json({ error: "Alert not found" });
    return;
  }
  res.json({ id: alertId, status: "ACKNOWLEDGED" });
});

management.post("/connector-alerts/:id/resolve", requireRole(["admin", "operator"]), async (req, res) => {
  const alertId = Number(req.params.id);
  if (!Number.isInteger(alertId) || alertId < 1) {
    res.status(400).json({ error: "Invalid alert id" });
    return;
  }
  const updated = await manuallyResolveConnectorAlert(alertId);
  if (!updated) {
    res.status(404).json({ error: "Alert not found" });
    return;
  }
  res.json({ id: alertId, status: "RESOLVED" });
});

management.get("/connectors/tenants", async (_req, res) => {
  const tenants = await listTenants();
  res.json(tenants);
});

management.post("/connectors/tenants", requireRole(["admin"]), async (req, res) => {
  try {
    const name = typeof req.body?.name === "string" ? req.body.name : "";
    if (!name.trim()) {
      res.status(400).json({ error: "name is required" });
      return;
    }
    const tenant = await createTenant({ name, slug: req.body?.slug });
    res.status(201).json(tenant);
  } catch (error) {
    sendRouteError(res, error, "Failed to create tenant");
  }
});

management.get("/connectors/groups", async (_req, res) => {
  try {
    res.json(await listConnectorGroups());
  } catch (error) {
    sendRouteError(res, error, "Failed to list connector groups");
  }
});

management.get("/connectors/groups/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const group = await getConnectorGroupById(id);
    if (!group) {
      res.status(404).json({ error: "Connector group not found" });
      return;
    }
    res.json(group);
  } catch (error) {
    sendRouteError(res, error, "Failed to load connector group");
  }
});

management.post("/connectors/groups", requireRole(["admin", "operator"]), async (req, res) => {
  try {
    const body = req.body as Record<string, unknown>;
    const tenantId = Number(body.tenant_id);
    const name = typeof body.name === "string" ? body.name.trim() : "";
    const strategy = typeof body.strategy === "string" ? body.strategy : "";
    if (!Number.isInteger(tenantId) || tenantId < 1 || !name || !["ACTIVE_PASSIVE", "ROUND_ROBIN", "PRIORITY"].includes(strategy)) {
      res.status(400).json({ error: "tenant_id, name and strategy are required" });
      return;
    }
    const group = await createConnectorGroup({ tenant_id: tenantId, name, strategy: strategy as ConnectorGroupStrategy });
    res.status(201).json(group);
  } catch (error) {
    sendRouteError(res, error, "Failed to create connector group");
  }
});

management.patch("/connectors/groups/:id", requireRole(["admin", "operator"]), async (req, res) => {
  try {
    const id = Number(req.params.id);
    const body = req.body as Record<string, unknown>;
    const patch: { name?: string; strategy?: ConnectorGroupStrategy } = {};
    if (typeof body.name === "string" && body.name.trim()) {
      patch.name = body.name.trim();
    }
    if (typeof body.strategy === "string" && ["ACTIVE_PASSIVE", "ROUND_ROBIN", "PRIORITY"].includes(body.strategy)) {
      patch.strategy = body.strategy as ConnectorGroupStrategy;
    }
    const updated = await updateConnectorGroup(id, patch);
    if (!updated) {
      res.status(404).json({ error: "Connector group not found" });
      return;
    }
    res.json(updated);
  } catch (error) {
    sendRouteError(res, error, "Failed to update connector group");
  }
});

management.delete("/connectors/groups/:id", requireRole(["admin"]), async (req, res) => {
  try {
    const id = Number(req.params.id);
    const deleted = await deleteConnectorGroup(id);
    if (!deleted) {
      res.status(404).json({ error: "Connector group not found" });
      return;
    }
    res.status(204).end();
  } catch (error) {
    sendRouteError(res, error, "Failed to delete connector group");
  }
});

management.get("/connectors/groups/:id/members", async (req, res) => {
  try {
    const id = Number(req.params.id);
    res.json(await listConnectorGroupMembers(id));
  } catch (error) {
    sendRouteError(res, error, "Failed to list connector group members");
  }
});

management.put("/connectors/groups/:id/members/:connectorId", requireRole(["admin", "operator"]), async (req, res) => {
  try {
    const groupId = Number(req.params.id);
    const connectorId = Number(req.params.connectorId);
    const priority = Number.isInteger(req.body?.priority) ? Number(req.body.priority) : undefined;
    const weight = Number.isInteger(req.body?.weight) ? Number(req.body.weight) : undefined;
    const members = await upsertConnectorGroupMember(groupId, {
      connector_id: connectorId,
      priority,
      weight,
    });
    res.json(members);
  } catch (error) {
    sendRouteError(res, error, "Failed to update connector group member");
  }
});

management.delete("/connectors/groups/:id/members/:connectorId", requireRole(["admin", "operator"]), async (req, res) => {
  try {
    const groupId = Number(req.params.id);
    const connectorId = Number(req.params.connectorId);
    const members = await removeConnectorGroupMember(groupId, connectorId);
    res.json(members);
  } catch (error) {
    sendRouteError(res, error, "Failed to remove connector group member");
  }
});

management.post("/connectors", requireRole(["admin", "operator"]), async (req, res) => {
  try {
    const body = req.body as Record<string, unknown>;
    const tenantId = Number(body.tenant_id);
    const name = typeof body.name === "string" ? body.name : "";
    if (!Number.isInteger(tenantId) || tenantId < 1 || !name.trim()) {
      res.status(400).json({ error: "tenant_id and name are required" });
      return;
    }
    const created = await createConnector({
      tenant_id: tenantId,
      name,
      description: typeof body.description === "string" ? body.description : null,
      wireguard_ip: typeof body.wireguard_ip === "string" ? body.wireguard_ip : null,
      wireguard_endpoint: typeof body.wireguard_endpoint === "string" ? body.wireguard_endpoint : null,
      wireguard_allowed_ips: typeof body.wireguard_allowed_ips === "string" ? body.wireguard_allowed_ips : null,
      networks: Array.isArray(body.networks) ? body.networks as Array<{ network_cidr: string; description?: string }> : [],
    });

    const user = getRequestContext()?.user ?? null;
    await logAuditEvent({
      actorId: user?.id ?? null,
      action: created.reprovisioned ? "connector_reprovisioned" : "connector_created",
      objectType: "connector",
      objectId: String(created.id),
      metadata: {
        name: created.name,
        tenant_id: created.tenant_id,
        reprovisioned: Boolean(created.reprovisioned),
      },
      sourceIp: getRequestSourceIp(req),
    });

    res.status(201).json(created);
  } catch (error) {
    if (error instanceof ConflictError) {
      res.status(409).json({ error: error.message });
      return;
    }
    res.status(400).json({ error: error instanceof Error ? error.message : "Failed to create connector" });
  }
});

management.get("/connectors/:id/health", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id < 1) {
    res.status(400).json({ error: "Invalid connector id" });
    return;
  }
  try {
    const connector = await getConnectorById(id);
    if (!connector) {
      res.status(404).json({ error: "Connector not found" });
      return;
    }
    const health = await calculateConnectorHealth(id);
    const openAlerts = await countOpenAlertsForConnector(id);
    res.json({ connector_id: id, open_alerts: openAlerts, ...health });
  } catch (error) {
    sendRouteError(res, error, "Failed to load connector health");
  }
});

management.get("/connectors/:id/alerts", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id < 1) {
    res.status(400).json({ error: "Invalid connector id" });
    return;
  }
  try {
    const alerts = await listConnectorAlerts({ connectorId: id, limit: 200 });
    res.json(alerts);
  } catch (error) {
    sendRouteError(res, error, "Failed to list connector alerts");
  }
});

management.post("/connectors/:id/health/evaluate", requireRole(["admin", "operator"]), async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id < 1) {
    res.status(400).json({ error: "Invalid connector id" });
    return;
  }
  try {
    res.json(await evaluateConnectorAlert(id));
  } catch (error) {
    sendRouteError(res, error, "Failed to evaluate connector alerts");
  }
});

management.get("/connectors/:id", async (req, res) => {
  const id = Number(req.params.id);
  const connector = await getConnectorById(id);
  if (!connector) {
    res.status(404).json({ error: "Connector not found" });
    return;
  }
  res.json(connector);
});

management.put("/connectors/:id", requireRole(["admin"]), async (req, res) => {
  const id = Number(req.params.id);
  const updated = await updateConnector(id, {
    description: typeof req.body?.description === "string" ? req.body.description : undefined,
    status: typeof req.body?.status === "string" ? req.body.status : undefined,
    wireguard_endpoint: typeof req.body?.wireguard_endpoint === "string" ? req.body.wireguard_endpoint : undefined,
  });
  if (!updated) {
    res.status(404).json({ error: "Connector not found" });
    return;
  }
  res.json(await getConnectorById(id));
});

management.delete("/connectors/:id", requireRole(["admin"]), async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id < 1) {
    res.status(400).json({ error: "Invalid connector id" });
    return;
  }

  const deleted = await deleteConnector(id);
  if (!deleted) {
    res.status(404).json({ error: "Connector not found" });
    return;
  }

  const user = getRequestContext()?.user ?? null;
  await logAuditEvent({
    actorId: user?.id ?? null,
    action: "connector_deleted",
    objectType: "connector",
    objectId: String(id),
    metadata: {
      name: deleted.name,
      tenant_id: deleted.tenantId,
      status: deleted.status,
    },
    sourceIp: getRequestSourceIp(req),
  });

  res.status(204).end();
});

management.post("/connectors/:id/revoke", requireRole(["admin"]), async (req, res) => {
  const id = Number(req.params.id);
  await revokeConnector(id);
  const user = getRequestContext()?.user ?? null;
  await logAuditEvent({
    actorId: user?.id ?? null,
    action: "connector_revoked",
    objectType: "connector",
    objectId: String(id),
    sourceIp: getRequestSourceIp(req),
  });
  res.json(await getConnectorById(id));
});

management.post("/connectors/:id/bootstrap-package", requireRole(["admin"]), async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id < 1) {
      res.status(400).json({ error: "Invalid connector id" });
      return;
    }

    const user = getRequestContext()?.user ?? null;
    const pkg = await generateBootstrapPackage(id, user?.id ?? null);

    await logAuditEvent({
      actorId: user?.id ?? null,
      action: "connector_bootstrap_issued",
      objectType: "connector",
      objectId: String(id),
      sourceIp: getRequestSourceIp(req),
    });

    res.setHeader("Content-Disposition", `attachment; filename="${pkg.connectorName}.env"`);
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.send(pkg.envContent);
  } catch (error) {
    if (error instanceof Error && error.message.includes("Active bootstrap token")) {
      res.status(409).json({ error: error.message });
      return;
    }
    res.status(400).json({ error: error instanceof Error ? error.message : "Failed to generate bootstrap package" });
  }
});

management.post("/connectors/:id/wireguard/generate", requireRole(["admin"]), async (req, res) => {
  const id = Number(req.params.id);
  await regenerateWireGuardKeys(id);
  res.json(await getWireGuardConfigForConnector(id, false));
});

management.get("/connectors/:id/wireguard/config", requireRole(["admin"]), async (req, res) => {
  const id = Number(req.params.id);
  const reveal = req.query.reveal === "true";
  const config = await getWireGuardConfigForConnector(id, reveal);
  if (!config) {
    res.status(404).json({ error: "Connector not found" });
    return;
  }
  res.json(config);
});

management.get("/connectors/:id/wireguard/status", async (req, res) => {
  const id = Number(req.params.id);
  const status = await getConnectorWireGuardStatus(id);
  if (!status) {
    res.status(404).json({ error: "Connector not found" });
    return;
  }
  res.json(status);
});

management.post("/connectors/:id/networks", requireRole(["admin", "operator"]), async (req, res) => {
  const id = Number(req.params.id);
  const cidr = typeof req.body?.network_cidr === "string" ? req.body.network_cidr : "";
  if (!cidr.trim()) {
    res.status(400).json({ error: "network_cidr is required" });
    return;
  }
  const row = await addConnectorNetwork(id, cidr, req.body?.description);
  res.status(201).json(row);
});

management.get("/connectors/:id/jobs", async (req, res) => {
  const id = Number(req.params.id);
  const jobs = await listConnectorJobsEnriched(id);
  res.json(jobs);
});

management.get("/connectors/:connectorId/jobs/:jobId", async (req, res) => {
  const jobId = Number(req.params.jobId);
  const connectorId = Number(req.params.connectorId);
  const job = await getConnectorJobDetail(jobId);
  if (!job || job.connector_id !== connectorId) {
    res.status(404).json({ error: "Job not found" });
    return;
  }
  res.json(job);
});

management.post("/connectors/:id/jobs", requireRole(["admin", "operator"]), async (req, res) => {
  try {
    const id = Number(req.params.id);
    const jobType = req.body?.job_type as ConnectorJobType;
    const user = getRequestContext()?.user ?? null;
    const job = await createConnectorJob({
      connector_id: id,
      job_type: jobType,
      target_ip: typeof req.body?.target_ip === "string" ? req.body.target_ip : null,
      target_port: Number.isInteger(req.body?.target_port) ? req.body.target_port : null,
      payload_json: req.body?.payload_json && typeof req.body.payload_json === "object" ? req.body.payload_json : {},
      timeout_seconds: Number.isInteger(req.body?.timeout_seconds) ? req.body.timeout_seconds : 120,
      created_by: user?.id ?? null,
    });

    await logAuditEvent({
      actorId: user?.id ?? null,
      action: "connector_job_created",
      objectType: "connector_job",
      objectId: String(job.id),
      metadata: { connector_id: id, job_type: jobType, target_ip: job.targetIp },
      sourceIp: getRequestSourceIp(req),
    });

    res.status(201).json(job);
  } catch (error) {
    if (error instanceof ConflictError) {
      res.status(409).json({ error: error.message });
      return;
    }
    res.status(400).json({ error: error instanceof Error ? error.message : "Failed to create job" });
  }
});

async function createDiagnosticJob(
  connectorId: number,
  jobType: ConnectorJobType,
  targetIp: string | null,
  payload: Record<string, unknown>,
  req: import("express").Request,
) {
  const user = getRequestContext()?.user ?? null;
  return createConnectorJob({
    connector_id: connectorId,
    job_type: jobType,
    target_ip: targetIp,
    payload_json: payload,
    created_by: user?.id ?? null,
  });
}

management.post("/connectors/:id/diagnostics/ping", requireRole(["admin", "operator"]), async (req, res) => {
  try {
    const id = Number(req.params.id);
    const target = typeof req.body?.target_ip === "string" ? req.body.target_ip : "";
    const job = await createDiagnosticJob(id, "PING", target, {
      target_ip: target,
      count: req.body?.count ?? 4,
    }, req);
    res.status(201).json(job);
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : "Failed" });
  }
});

management.post("/connectors/:id/diagnostics/traceroute", requireRole(["admin", "operator"]), async (req, res) => {
  try {
    const id = Number(req.params.id);
    const target = typeof req.body?.target_ip === "string" ? req.body.target_ip : "";
    const job = await createDiagnosticJob(id, "TRACEROUTE", target, { target_ip: target }, req);
    res.status(201).json(job);
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : "Failed" });
  }
});

management.post("/connectors/:id/diagnostics/tcp-check", requireRole(["admin", "operator"]), async (req, res) => {
  try {
    const id = Number(req.params.id);
    const target = typeof req.body?.target_ip === "string" ? req.body.target_ip : "";
    const port = Number(req.body?.port ?? 22);
    const job = await createDiagnosticJob(id, "TCP_CHECK", target, { target_ip: target, port }, req);
    res.status(201).json(job);
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : "Failed" });
  }
});

management.post("/connectors/:id/diagnostics/snmpwalk", requireRole(["admin", "operator"]), async (req, res) => {
  try {
    const id = Number(req.params.id);
    const target = typeof req.body?.target_ip === "string" ? req.body.target_ip : "";
    const job = await createDiagnosticJob(id, "SNMP_WALK", target, {
      oid: req.body?.oid ?? "1.3.6.1.2.1.1",
      community: "[redacted-use-connector-local-profile]",
    }, req);
    res.status(201).json(job);
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : "Failed" });
  }
});

management.post("/connectors/:id/diagnostics/ssh-command", requireRole(["admin", "operator"]), async (req, res) => {
  try {
    const id = Number(req.params.id);
    const target = typeof req.body?.target_ip === "string" ? req.body.target_ip : "";
    const command = typeof req.body?.command === "string" ? req.body.command : "";
    const job = await createDiagnosticJob(id, "SSH_COMMAND", target, { command }, req);
    res.status(201).json(job);
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : "Failed" });
  }
});

management.post("/connectors/netconf/test", requireRole(["admin", "operator"]), async (req, res) => {
  try {
    const deviceId = Number(req.body?.device_id);
    if (!Number.isInteger(deviceId) || deviceId < 1) {
      res.status(400).json({ error: "device_id is required" });
      return;
    }
    const result = await executeNetconfTest({
      deviceId,
      credentialId: typeof req.body?.credential_id === "string" ? req.body.credential_id : undefined,
      rpc: typeof req.body?.rpc === "string" ? req.body.rpc : undefined,
      port: Number.isInteger(req.body?.port) ? Number(req.body.port) : undefined,
      timeoutSeconds: Number.isInteger(req.body?.timeout_seconds) ? Number(req.body.timeout_seconds) : undefined,
      createdBy: getRequestContext()?.user?.id ?? null,
    });
    res.json(result);
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : "Failed" });
  }
});

management.post("/connectors/netconf/get-config", requireRole(["admin", "operator"]), async (req, res) => {
  try {
    const deviceId = Number(req.body?.device_id);
    if (!Number.isInteger(deviceId) || deviceId < 1) {
      res.status(400).json({ error: "device_id is required" });
      return;
    }
    const result = await executeNetconfGetConfig({
      deviceId,
      credentialId: typeof req.body?.credential_id === "string" ? req.body.credential_id : undefined,
      port: Number.isInteger(req.body?.port) ? Number(req.body.port) : undefined,
      timeoutSeconds: Number.isInteger(req.body?.timeout_seconds) ? Number(req.body.timeout_seconds) : undefined,
      createdBy: getRequestContext()?.user?.id ?? null,
    });
    res.json(result);
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : "Failed" });
  }
});
