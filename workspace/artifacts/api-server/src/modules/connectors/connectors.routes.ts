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
  getConnectorById,
  getConnectorWireGuardStatus,
  getWireGuardConfigForConnector,
  listConnectorJobs,
  listConnectors,
  listPendingJobsForConnector,
  listTenants,
  processHeartbeat,
  regenerateWireGuardKeys,
  revokeConnector,
  submitJobResult,
  updateConnector,
} from "./connectors.service.js";
import type { ConnectorHeartbeatPayload, ConnectorJobResultPayload, ConnectorJobType } from "./connectors.types.js";
import { maskConnectorToken } from "./connector-token.js";

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
    res.json(result);
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : "Failed to submit job result" });
  }
});

export const connectorsManagementRouter = Router();
const management = connectorsManagementRouter;

management.get("/connectors", async (_req, res) => {
  const connectors = await listConnectors();
  res.json(connectors);
});

management.get("/connectors/tenants", async (_req, res) => {
  const tenants = await listTenants();
  res.json(tenants);
});

management.post("/connectors/tenants", requireRole(["admin"]), async (req, res) => {
  const name = typeof req.body?.name === "string" ? req.body.name : "";
  if (!name.trim()) {
    res.status(400).json({ error: "name is required" });
    return;
  }
  const tenant = await createTenant({ name, slug: req.body?.slug });
  res.status(201).json(tenant);
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
      action: "connector_created",
      objectType: "connector",
      objectId: String(created.id),
      metadata: {
        name: created.name,
        tenant_id: created.tenant_id,
        token_preview: maskConnectorToken(created.connector_token),
      },
      sourceIp: getRequestSourceIp(req),
    });

    res.status(201).json(created);
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : "Failed to create connector" });
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
  await deleteConnector(id);
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
  const jobs = await listConnectorJobs(id);
  res.json(jobs);
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

