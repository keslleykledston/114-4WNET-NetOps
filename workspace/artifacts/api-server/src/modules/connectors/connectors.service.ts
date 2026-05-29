import { and, count, desc, eq, inArray } from "drizzle-orm";
import {
  connectorHeartbeatsTable,
  connectorJobResultsTable,
  connectorJobsTable,
  connectorNetworksTable,
  connectorsTable,
  db,
  devicesTable,
  tenantsTable,
} from "@workspace/db";
import { env } from "../../lib/env.js";
import { generateConnectorToken, hashConnectorToken } from "./connector-token.js";
import type {
  ConnectorCreateResponse,
  ConnectorDetailView,
  ConnectorHeartbeatPayload,
  ConnectorJobResultPayload,
  ConnectorPublicView,
  CreateConnectorInput,
  CreateConnectorJobInput,
} from "./connectors.types.js";
import { assertReadOnlySshCommand } from "./ssh-readonly-policy.js";
import { buildWireGuardClientConfig } from "./wireguard-config.js";
import {
  decryptWireGuardPrivateKey,
  encryptWireGuardPrivateKey,
  generateWireGuardKeyPair,
} from "./wireguard-keys.js";

const HEARTBEAT_OFFLINE_MS = 2 * 60 * 1000;

function slugify(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64) || "tenant";
}

function getWireGuardServerConfig() {
  return {
    publicKey: process.env["NETOPS_WG_SERVER_PUBLIC_KEY"]?.trim() || "",
    endpoint: process.env["NETOPS_WG_ENDPOINT"]?.trim() || "vpn.netops.local:51820",
    allowedIps: process.env["NETOPS_WG_DEFAULT_ALLOWED_IPS"]?.trim() || "10.0.0.0/8,192.168.0.0/16",
    serverAddress: process.env["NETOPS_WG_SERVER_ADDRESS"]?.trim() || "10.255.0.1",
  };
}

async function countPendingJobs(connectorId: number): Promise<number> {
  const [row] = await db
    .select({ total: count() })
    .from(connectorJobsTable)
    .where(and(eq(connectorJobsTable.connectorId, connectorId), eq(connectorJobsTable.status, "PENDING")));
  return Number(row?.total ?? 0);
}

async function countDevicesForConnector(connectorId: number): Promise<number> {
  const [row] = await db
    .select({ total: count() })
    .from(devicesTable)
    .where(eq(devicesTable.connectorId, connectorId));
  return Number(row?.total ?? 0);
}

function mapConnectorRow(
  connector: typeof connectorsTable.$inferSelect,
  tenant: typeof tenantsTable.$inferSelect,
  pendingJobs: number,
): ConnectorPublicView {
  return {
    id: connector.id,
    tenant_id: connector.tenantId,
    tenant_name: tenant.name,
    tenant_slug: tenant.slug,
    name: connector.name,
    description: connector.description,
    status: connector.status as ConnectorPublicView["status"],
    version: connector.version,
    wireguard_ip: connector.wireguardIp,
    wireguard_public_key: connector.wireguardPublicKey,
    last_heartbeat: connector.lastHeartbeat?.toISOString() ?? null,
    pending_jobs: pendingJobs,
    created_at: connector.createdAt.toISOString(),
    updated_at: connector.updatedAt.toISOString(),
  };
}

export async function listTenants() {
  return db.select().from(tenantsTable).orderBy(tenantsTable.name);
}

export async function createTenant(input: { name: string; slug?: string }) {
  const slug = input.slug?.trim() ? slugify(input.slug) : slugify(input.name);
  const [tenant] = await db
    .insert(tenantsTable)
    .values({ name: input.name.trim(), slug, status: "active" })
    .returning();
  return tenant;
}

export async function listConnectors(): Promise<ConnectorPublicView[]> {
  await refreshConnectorOnlineStatus();
  const rows = await db
    .select({ connector: connectorsTable, tenant: tenantsTable })
    .from(connectorsTable)
    .innerJoin(tenantsTable, eq(connectorsTable.tenantId, tenantsTable.id))
    .orderBy(desc(connectorsTable.updatedAt));

  const result: ConnectorPublicView[] = [];
  for (const row of rows) {
    result.push(mapConnectorRow(row.connector, row.tenant, await countPendingJobs(row.connector.id)));
  }
  return result;
}

export async function getConnectorById(id: number): Promise<ConnectorDetailView | null> {
  await refreshConnectorOnlineStatus();
  const [row] = await db
    .select({ connector: connectorsTable, tenant: tenantsTable })
    .from(connectorsTable)
    .innerJoin(tenantsTable, eq(connectorsTable.tenantId, tenantsTable.id))
    .where(eq(connectorsTable.id, id))
    .limit(1);
  if (!row) return null;

  const networks = await db
    .select()
    .from(connectorNetworksTable)
    .where(eq(connectorNetworksTable.connectorId, id));

  const base = mapConnectorRow(row.connector, row.tenant, await countPendingJobs(id));
  return {
    ...base,
    wireguard_endpoint: row.connector.wireguardEndpoint,
    wireguard_allowed_ips: row.connector.wireguardAllowedIps,
    networks: networks.map((n) => ({
      id: n.id,
      network_cidr: n.networkCidr,
      description: n.description,
    })),
    device_count: await countDevicesForConnector(id),
  };
}

export async function createConnector(input: CreateConnectorInput): Promise<ConnectorCreateResponse> {
  const token = generateConnectorToken();
  const tokenHash = hashConnectorToken(token);
  const wgKeys = generateWireGuardKeyPair();
  const wgServer = getWireGuardServerConfig();
  const privateEnc = encryptWireGuardPrivateKey(wgKeys.privateKey, env.sessionSecret);
  const wireguardIp = input.wireguard_ip?.trim() || allocateWireGuardIp();

  const [connector] = await db
    .insert(connectorsTable)
    .values({
      tenantId: input.tenant_id,
      name: input.name.trim(),
      description: input.description?.trim() || null,
      status: "PENDING",
      connectorTokenHash: tokenHash,
      wireguardIp,
      wireguardPublicKey: wgKeys.publicKey,
      wireguardPrivateKeyEnc: privateEnc,
      wireguardServerPublicKey: wgServer.publicKey || null,
      wireguardEndpoint: input.wireguard_endpoint?.trim() || wgServer.endpoint,
      wireguardAllowedIps: input.wireguard_allowed_ips?.trim() || wgServer.allowedIps,
    })
    .returning();

  if (input.networks?.length) {
    await db.insert(connectorNetworksTable).values(
      input.networks.map((n) => ({
        connectorId: connector.id,
        networkCidr: n.network_cidr.trim(),
        description: n.description?.trim() || null,
      })),
    );
  }

  const detail = await getConnectorById(connector.id);
  if (!detail) throw new Error("Connector creation failed");

  const wgPrivate = wgKeys.privateKey;
  const configPreview = buildWireGuardClientConfig({
    connectorPrivateKey: wgPrivate,
    connectorAddress: wireguardIp,
    serverPublicKey: wgServer.publicKey || "<NETOPS_WG_SERVER_PUBLIC_KEY>",
    serverEndpoint: detail.wireguard_endpoint || wgServer.endpoint,
    allowedIps: detail.wireguard_allowed_ips || wgServer.allowedIps,
  });

  return {
    ...detail,
    connector_token: token,
    wireguard_config_preview: configPreview,
  };
}

function allocateWireGuardIp(): string {
  const base = process.env["NETOPS_WG_IP_POOL_BASE"]?.trim() || "10.255.0.";
  const host = 2 + Math.floor(Math.random() * 250);
  return `${base}${host}`;
}

export async function updateConnector(
  id: number,
  patch: Partial<{ description: string | null; status: string; wireguard_endpoint: string | null }>,
) {
  const [updated] = await db
    .update(connectorsTable)
    .set({
      description: patch.description,
      status: patch.status,
      wireguardEndpoint: patch.wireguard_endpoint,
      updatedAt: new Date(),
    })
    .where(eq(connectorsTable.id, id))
    .returning();
  return updated ?? null;
}

export async function revokeConnector(id: number) {
  return updateConnector(id, { status: "REVOKED" });
}

export async function deleteConnector(id: number) {
  await db.delete(connectorsTable).where(eq(connectorsTable.id, id));
}

export async function addConnectorNetwork(connectorId: number, networkCidr: string, description?: string | null) {
  const [row] = await db
    .insert(connectorNetworksTable)
    .values({
      connectorId,
      networkCidr: networkCidr.trim(),
      description: description?.trim() || null,
    })
    .returning();
  return row;
}

export async function findConnectorByToken(token: string) {
  const tokenHash = hashConnectorToken(token);
  const [row] = await db
    .select()
    .from(connectorsTable)
    .where(eq(connectorsTable.connectorTokenHash, tokenHash))
    .limit(1);
  if (!row || row.status === "REVOKED" || row.status === "DISABLED") return null;
  return row;
}

export async function processHeartbeat(connectorId: number, payload: ConnectorHeartbeatPayload) {
  const [connector] = await db
    .select()
    .from(connectorsTable)
    .where(eq(connectorsTable.id, connectorId))
    .limit(1);

  if (!connector) {
    throw new Error("Connector not found");
  }
  if (payload.connector_name && payload.connector_name !== connector.name) {
    throw new Error("connector_name mismatch");
  }

  const now = new Date();
  const status = payload.status?.toUpperCase() === "ONLINE" ? "ONLINE" : "OFFLINE";

  await db.insert(connectorHeartbeatsTable).values({
    connectorId: connector.id,
    status,
    wireguardStatus: payload.wireguard_status ?? null,
    cpuUsage: payload.cpu_usage ?? null,
    memoryUsage: payload.memory_usage ?? null,
    routesCount: payload.routes_count ?? null,
    natEnabled: payload.nat_enabled ?? null,
    lanIp: payload.lan_ip ?? null,
    wgIp: payload.wg_ip ?? null,
    version: payload.version ?? null,
    receivedAt: now,
  });

  await db
    .update(connectorsTable)
    .set({
      status,
      version: payload.version ?? connector.version,
      lastHeartbeat: now,
      wireguardIp: payload.wg_ip ?? connector.wireguardIp,
      updatedAt: now,
    })
    .where(eq(connectorsTable.id, connector.id));

  return { connector_id: connector.id, status, received_at: now.toISOString() };
}

export async function refreshConnectorOnlineStatus() {
  const threshold = new Date(Date.now() - HEARTBEAT_OFFLINE_MS);
  const online = await db
    .select()
    .from(connectorsTable)
    .where(eq(connectorsTable.status, "ONLINE"));
  for (const row of online) {
    if (!row.lastHeartbeat || row.lastHeartbeat < threshold) {
      await db
        .update(connectorsTable)
        .set({ status: "OFFLINE", updatedAt: new Date() })
        .where(eq(connectorsTable.id, row.id));
    }
  }
}

export async function getWireGuardConfigForConnector(id: number, revealPrivateKey: boolean) {
  const connector = await getConnectorById(id);
  if (!connector) return null;
  const [row] = await db.select().from(connectorsTable).where(eq(connectorsTable.id, id)).limit(1);
  if (!row?.wireguardPrivateKeyEnc) return null;

  const wgServer = getWireGuardServerConfig();
  let privateKey = "[encrypted — regenerate or use install bundle]";
  if (revealPrivateKey) {
    privateKey = decryptWireGuardPrivateKey(row.wireguardPrivateKeyEnc, env.sessionSecret);
  }

  return {
    connector_id: id,
    wireguard_ip: row.wireguardIp,
    wireguard_public_key: row.wireguardPublicKey,
    server_public_key: row.wireguardServerPublicKey || wgServer.publicKey,
    endpoint: row.wireguardEndpoint || wgServer.endpoint,
    allowed_ips: row.wireguardAllowedIps || wgServer.allowedIps,
    config: buildWireGuardClientConfig({
      connectorPrivateKey: privateKey.startsWith("[") ? "<PRIVATE_KEY>" : privateKey,
      connectorAddress: row.wireguardIp || "10.255.0.2",
      serverPublicKey: row.wireguardServerPublicKey || wgServer.publicKey || "<SERVER_PUBLIC_KEY>",
      serverEndpoint: row.wireguardEndpoint || wgServer.endpoint,
      allowedIps: row.wireguardAllowedIps || wgServer.allowedIps,
    }),
  };
}

export async function regenerateWireGuardKeys(id: number) {
  const wgKeys = generateWireGuardKeyPair();
  const privateEnc = encryptWireGuardPrivateKey(wgKeys.privateKey, env.sessionSecret);
  const [updated] = await db
    .update(connectorsTable)
    .set({
      wireguardPublicKey: wgKeys.publicKey,
      wireguardPrivateKeyEnc: privateEnc,
      updatedAt: new Date(),
    })
    .where(eq(connectorsTable.id, id))
    .returning();
  return updated;
}

export function validateJobPayload(jobType: string, payload: Record<string, unknown>) {
  if (jobType === "SSH_COMMAND") {
    const command = typeof payload.command === "string" ? payload.command : "";
    assertReadOnlySshCommand(command);
  }
  if (jobType === "SNMP_GET" || jobType === "SNMP_WALK") {
    const oid = typeof payload.oid === "string" ? payload.oid : "";
    if (!oid) throw new Error("SNMP jobs require payload.oid");
  }
}

export async function createConnectorJob(input: CreateConnectorJobInput) {
  validateJobPayload(input.job_type, input.payload_json ?? {});
  const [job] = await db
    .insert(connectorJobsTable)
    .values({
      connectorId: input.connector_id,
      jobType: input.job_type,
      targetIp: input.target_ip ?? null,
      targetPort: input.target_port ?? null,
      payloadJson: input.payload_json ?? {},
      status: "PENDING",
      createdBy: input.created_by ?? null,
      timeoutSeconds: input.timeout_seconds ?? 120,
    })
    .returning();
  return job;
}

export async function listConnectorJobs(connectorId: number, limit = 50) {
  return db
    .select()
    .from(connectorJobsTable)
    .where(eq(connectorJobsTable.connectorId, connectorId))
    .orderBy(desc(connectorJobsTable.createdAt))
    .limit(limit);
}

export async function listPendingJobsForConnector(connectorId: number, limit = 10) {
  const jobs = await db
    .select()
    .from(connectorJobsTable)
    .where(and(eq(connectorJobsTable.connectorId, connectorId), eq(connectorJobsTable.status, "PENDING")))
    .orderBy(connectorJobsTable.createdAt)
    .limit(limit);

  if (jobs.length === 0) return [];

  const now = new Date();
  await db
    .update(connectorJobsTable)
    .set({ status: "RUNNING", startedAt: now })
    .where(inArray(connectorJobsTable.id, jobs.map((j) => j.id)));

  return jobs.map((j) => ({
    id: j.id,
    job_type: j.jobType,
    target_ip: j.targetIp,
    target_port: j.targetPort,
    payload_json: j.payloadJson,
    timeout_seconds: j.timeoutSeconds,
    status: "RUNNING" as const,
  }));
}

export async function submitJobResult(connectorId: number, jobId: number, result: ConnectorJobResultPayload) {
  const [job] = await db
    .select()
    .from(connectorJobsTable)
    .where(and(eq(connectorJobsTable.id, jobId), eq(connectorJobsTable.connectorId, connectorId)))
    .limit(1);

  if (!job) throw new Error("Job not found");
  if (!["PENDING", "RUNNING"].includes(job.status)) {
    throw new Error(`Job is not accepting results (status=${job.status})`);
  }

  const finishedAt = new Date();
  const status = result.success ? "SUCCESS" : "FAILED";

  await db.insert(connectorJobResultsTable).values({
    jobId,
    success: result.success,
    stdout: result.stdout ?? null,
    stderr: result.stderr ?? null,
    exitCode: result.exit_code ?? null,
    resultJson: result.result_json ?? null,
  });

  await db
    .update(connectorJobsTable)
    .set({ status, finishedAt })
    .where(eq(connectorJobsTable.id, jobId));

  return { job_id: jobId, status };
}

export async function expireTimedOutJobs() {
  const rows = await db
    .select()
    .from(connectorJobsTable)
    .where(inArray(connectorJobsTable.status, ["PENDING", "RUNNING"]));
  const now = Date.now();
  let expired = 0;
  for (const job of rows) {
    const deadline = job.createdAt.getTime() + job.timeoutSeconds * 1000;
    if (now > deadline) {
      await db
        .update(connectorJobsTable)
        .set({ status: "TIMEOUT", finishedAt: new Date() })
        .where(eq(connectorJobsTable.id, job.id));
      expired += 1;
    }
  }
  return expired;
}

export async function getConnectorWireGuardStatus(id: number) {
  const connector = await getConnectorById(id);
  if (!connector) return null;
  const [lastHb] = await db
    .select()
    .from(connectorHeartbeatsTable)
    .where(eq(connectorHeartbeatsTable.connectorId, id))
    .orderBy(desc(connectorHeartbeatsTable.receivedAt))
    .limit(1);

  return {
    connector_id: id,
    status: connector.status,
    wireguard_ip: connector.wireguard_ip,
    wireguard_public_key: connector.wireguard_public_key,
    last_heartbeat: connector.last_heartbeat,
    last_wireguard_status: lastHb?.wireguardStatus ?? null,
    online: connector.status === "ONLINE",
  };
}
