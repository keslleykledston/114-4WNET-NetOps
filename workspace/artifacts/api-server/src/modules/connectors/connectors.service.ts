import { and, count, desc, eq, inArray } from "drizzle-orm";
import { ConflictError, isUniqueViolation } from "../../lib/db-errors.js";
import {
  connectorBootstrapTokensTable,
  connectorHeartbeatsTable,
  connectorJobResultsTable,
  connectorJobsTable,
  connectorNetworksTable,
  connectorsTable,
  db,
  devicesTable,
  tenantsTable,
  usersTable,
  type ConnectorBootstrapToken,
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
import { maskSensitivePayload } from "./connector-payload-mask.js";
import { buildWireGuardClientConfig } from "./wireguard-config.js";
import { assertReadOnlySshCommand } from "./ssh-readonly-policy.js";
import { resolveAvailableConnectorForGroup } from "./connector-groups.service.js";
import {
  encryptWireGuardPrivateKey,
  decryptWireGuardPrivateKey,
  generateWireGuardKeyPair,
} from "./wireguard-keys.js";
import { buildConnectorPayloadWithCredential } from "../credentials/credential-vault.resolver.js";

const HEARTBEAT_OFFLINE_MS = 2 * 60 * 1000;

function slugify(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64) || "tenant";
}

const LEGACY_WG_ENDPOINT_HOSTS = new Set(["vpn.netops.local", "vpn.example.com"]);

function getWireGuardServerConfig() {
  return {
    publicKey: process.env["NETOPS_WG_SERVER_PUBLIC_KEY"]?.trim() || "",
    endpoint: process.env["NETOPS_WG_ENDPOINT"]?.trim() || "vpn.netops.local:51820",
    allowedIps: process.env["NETOPS_WG_DEFAULT_ALLOWED_IPS"]?.trim() || "10.0.0.0/8,192.168.0.0/16",
    serverAddress: process.env["NETOPS_WG_SERVER_ADDRESS"]?.trim() || "10.255.0.1",
  };
}

/** Prefer NETOPS_WG_ENDPOINT when the connector still has a lab/default hostname stored at create time. */
function resolveWireGuardEndpoint(stored: string | null | undefined): string {
  const wgServer = getWireGuardServerConfig();
  const fromRow = stored?.trim() || "";
  if (!fromRow) return wgServer.endpoint;
  const host = fromRow.split(":")[0]?.trim().toLowerCase() ?? "";
  if (LEGACY_WG_ENDPOINT_HOSTS.has(host)) return wgServer.endpoint;
  return fromRow;
}

async function persistWireGuardEndpointIfLegacy(connectorId: number, endpoint: string): Promise<void> {
  await db
    .update(connectorsTable)
    .set({ wireguardEndpoint: endpoint, updatedAt: new Date() })
    .where(eq(connectorsTable.id, connectorId));
}

export class WireGuardServerKeyMissingError extends Error {
  readonly code = "WG_SERVER_PUBLIC_KEY_MISSING";

  constructor() {
    super(
      "WireGuard server public key is not configured. Set NETOPS_WG_SERVER_PUBLIC_KEY on the NetOps API server.",
    );
    this.name = "WireGuardServerKeyMissingError";
  }
}

function resolveWireGuardServerPublicKey(connector: typeof connectorsTable.$inferSelect): string {
  const fromEnv = getWireGuardServerConfig().publicKey;
  const fromRow = connector.wireguardServerPublicKey?.trim() || "";
  return fromEnv || fromRow;
}

async function persistWireGuardServerPublicKeyIfMissing(
  connectorId: number,
  serverPublicKey: string,
): Promise<void> {
  const [row] = await db
    .select({ wireguardServerPublicKey: connectorsTable.wireguardServerPublicKey })
    .from(connectorsTable)
    .where(eq(connectorsTable.id, connectorId))
    .limit(1);
  if (!row?.wireguardServerPublicKey?.trim()) {
    await db
      .update(connectorsTable)
      .set({ wireguardServerPublicKey: serverPublicKey, updatedAt: new Date() })
      .where(eq(connectorsTable.id, connectorId));
  }
}

export async function requireWireGuardServerPublicKey(
  connector: typeof connectorsTable.$inferSelect,
): Promise<string> {
  const serverPublicKey = resolveWireGuardServerPublicKey(connector);
  if (!serverPublicKey) {
    throw new WireGuardServerKeyMissingError();
  }
  await persistWireGuardServerPublicKeyIfMissing(connector.id, serverPublicKey);
  return serverPublicKey;
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
  const name = input.name.trim();
  const slug = input.slug?.trim() ? slugify(input.slug) : slugify(input.name);

  const [existing] = await db.select().from(tenantsTable).where(eq(tenantsTable.slug, slug)).limit(1);
  if (existing) {
    throw new ConflictError(
      `Tenant com slug "${slug}" já existe (${existing.name}). Reutilize o tenant existente para criar um novo connector.`,
    );
  }

  try {
    const [tenant] = await db
      .insert(tenantsTable)
      .values({ name, slug, status: "active" })
      .returning();
    return tenant;
  } catch (error) {
    if (isUniqueViolation(error, "tenants_slug_key")) {
      throw new ConflictError(`Tenant com slug "${slug}" já existe. Reutilize o tenant existente para criar um novo connector.`);
    }
    throw error;
  }
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

function isInactiveConnectorStatus(status: string): boolean {
  return status === "REVOKED" || status === "DISABLED";
}

type WireGuardCredentials = {
  wgKeys: ReturnType<typeof generateWireGuardKeyPair>;
  privateEnc: string;
  wireguardIp: string;
  wgServer: ReturnType<typeof getWireGuardServerConfig>;
};

function buildWireGuardKeys(wireguardIp: string): WireGuardCredentials {
  const wgKeys = generateWireGuardKeyPair();
  const wgServer = getWireGuardServerConfig();
  return {
    wgKeys,
    privateEnc: encryptWireGuardPrivateKey(wgKeys.privateKey, env.sessionSecret),
    wireguardIp,
    wgServer,
  };
}

function buildConnectorCreateResponse(
  connectorId: number,
  credentials: WireGuardCredentials,
  reprovisioned = false,
): Promise<ConnectorCreateResponse> {
  return getConnectorById(connectorId).then((detail) => {
    if (!detail) throw new Error("Connector creation failed");
    const configPreview = buildWireGuardClientConfig({
      connectorPrivateKey: "<PRIVATE_KEY>",
      connectorAddress: credentials.wireguardIp,
      serverPublicKey: credentials.wgServer.publicKey || "<NETOPS_WG_SERVER_PUBLIC_KEY>",
      serverEndpoint: detail.wireguard_endpoint || credentials.wgServer.endpoint,
      allowedIps: detail.wireguard_allowed_ips || credentials.wgServer.allowedIps,
    });
    return {
      ...detail,
      wireguard_config_preview: configPreview,
      bootstrap_pending: true,
      reprovisioned,
    };
  });
}

async function cancelOpenConnectorJobs(connectorId: number): Promise<number> {
  const openJobs = await db
    .select({ id: connectorJobsTable.id })
    .from(connectorJobsTable)
    .where(
      and(
        eq(connectorJobsTable.connectorId, connectorId),
        inArray(connectorJobsTable.status, ["PENDING", "RUNNING"]),
      ),
    );
  if (openJobs.length === 0) return 0;

  const now = new Date();
  await db
    .update(connectorJobsTable)
    .set({ status: "CANCELLED", finishedAt: now })
    .where(inArray(connectorJobsTable.id, openJobs.map((job) => job.id)));
  return openJobs.length;
}

async function reprovisionConnector(
  existing: typeof connectorsTable.$inferSelect,
  input: CreateConnectorInput,
): Promise<ConnectorCreateResponse> {
  await cancelOpenConnectorJobs(existing.id);

  const wireguardIp = input.wireguard_ip?.trim() || existing.wireguardIp || allocateWireGuardIp();
  const credentials = buildWireGuardKeys(wireguardIp);
  const description =
    input.description !== undefined ? input.description?.trim() || null : existing.description;

  await db
    .update(connectorsTable)
    .set({
      description,
      status: "PENDING",
      version: null,
      connectorTokenHash: null,
      wireguardIp,
      wireguardPublicKey: credentials.wgKeys.publicKey,
      wireguardPrivateKeyEnc: credentials.privateEnc,
      wireguardServerPublicKey: credentials.wgServer.publicKey || null,
      wireguardEndpoint: input.wireguard_endpoint?.trim() || existing.wireguardEndpoint || credentials.wgServer.endpoint,
      wireguardAllowedIps:
        input.wireguard_allowed_ips?.trim() || existing.wireguardAllowedIps || credentials.wgServer.allowedIps,
      lastHeartbeat: null,
      updatedAt: new Date(),
    })
    .where(eq(connectorsTable.id, existing.id));

  await db
    .update(connectorBootstrapTokensTable)
    .set({ revokedAt: new Date() })
    .where(eq(connectorBootstrapTokensTable.connectorId, existing.id));

  if (input.networks?.length) {
    await db.insert(connectorNetworksTable).values(
      input.networks.map((n) => ({
        connectorId: existing.id,
        networkCidr: n.network_cidr.trim(),
        description: n.description?.trim() || null,
      })),
    );
  }

  return buildConnectorCreateResponse(existing.id, credentials, true);
}

export async function createConnector(input: CreateConnectorInput): Promise<ConnectorCreateResponse> {
  const connectorName = input.name.trim();
  const [tenant] = await db.select().from(tenantsTable).where(eq(tenantsTable.id, input.tenant_id)).limit(1);
  if (!tenant) {
    throw new Error("Tenant not found");
  }

  const [existingConnector] = await db
    .select()
    .from(connectorsTable)
    .where(and(eq(connectorsTable.tenantId, input.tenant_id), eq(connectorsTable.name, connectorName)))
    .limit(1);

  if (existingConnector) {
    if (isInactiveConnectorStatus(existingConnector.status)) {
      return reprovisionConnector(existingConnector, input);
    }
    throw new ConflictError(
      `Connector "${connectorName}" já está ativo (${existingConnector.status}) para o tenant ${tenant.name}. Revogue o connector anterior ou use outro nome.`,
    );
  }

  const wireguardIp = input.wireguard_ip?.trim() || allocateWireGuardIp();
  const credentials = buildWireGuardKeys(wireguardIp);

  let connector: typeof connectorsTable.$inferSelect;
  try {
    [connector] = await db
      .insert(connectorsTable)
      .values({
        tenantId: input.tenant_id,
        name: connectorName,
        description: input.description?.trim() || null,
        status: "PENDING",
        connectorTokenHash: null,
        wireguardIp,
        wireguardPublicKey: credentials.wgKeys.publicKey,
        wireguardPrivateKeyEnc: credentials.privateEnc,
        wireguardServerPublicKey: credentials.wgServer.publicKey || null,
        wireguardEndpoint: input.wireguard_endpoint?.trim() || credentials.wgServer.endpoint,
        wireguardAllowedIps: input.wireguard_allowed_ips?.trim() || credentials.wgServer.allowedIps,
      })
      .returning();
  } catch (error) {
    if (isUniqueViolation(error, "connectors_tenant_id_name_key")) {
      const [raceConnector] = await db
        .select()
        .from(connectorsTable)
        .where(and(eq(connectorsTable.tenantId, input.tenant_id), eq(connectorsTable.name, connectorName)))
        .limit(1);
      if (raceConnector && isInactiveConnectorStatus(raceConnector.status)) {
        return reprovisionConnector(raceConnector, input);
      }
      throw new ConflictError(
        `Connector "${connectorName}" já existe para o tenant ${tenant.name}. Revogue o connector anterior ou use outro nome.`,
      );
    }
    throw error;
  }

  if (input.networks?.length) {
    await db.insert(connectorNetworksTable).values(
      input.networks.map((n) => ({
        connectorId: connector.id,
        networkCidr: n.network_cidr.trim(),
        description: n.description?.trim() || null,
      })),
    );
  }

  return buildConnectorCreateResponse(connector.id, credentials, false);
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
  await cancelOpenConnectorJobs(id);
  return updateConnector(id, { status: "REVOKED" });
}

export async function deleteConnector(id: number) {
  const [row] = await db.select().from(connectorsTable).where(eq(connectorsTable.id, id)).limit(1);
  if (!row) return null;

  await cancelOpenConnectorJobs(id);
  await db.delete(connectorsTable).where(eq(connectorsTable.id, id));
  return row;
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

export async function generateBootstrapPackage(
  connectorId: number,
  userId: number | null,
): Promise<{ token: string; envContent: string; connectorName: string }> {
  const [connector] = await db
    .select()
    .from(connectorsTable)
    .where(eq(connectorsTable.id, connectorId))
    .limit(1);

  if (!connector) {
    throw new Error("Connector not found");
  }

  const now = new Date();
  const ttl15min = new Date(now.getTime() + 15 * 60 * 1000);

  const [activeBootstrap] = await db
    .select()
    .from(connectorBootstrapTokensTable)
    .where(
      and(
        eq(connectorBootstrapTokensTable.connectorId, connectorId),
      ),
    )
    .limit(1);

  if (activeBootstrap && activeBootstrap.expiresAt > now && !activeBootstrap.usedAt && !activeBootstrap.revokedAt) {
    throw new Error(
      "Active bootstrap token already exists. Use ?rotate=true to reissue.",
    );
  }

  const token = generateConnectorToken();
  const tokenHash = hashConnectorToken(token);

  await db
    .update(connectorsTable)
    .set({ connectorTokenHash: tokenHash })
    .where(eq(connectorsTable.id, connectorId));

  await db.insert(connectorBootstrapTokensTable).values({
    connectorId,
    tokenHash,
    expiresAt: ttl15min,
    deliveredAt: now,
    createdBy: userId ?? null,
    createdAt: now,
  });

  if (!connector.wireguardPrivateKeyEnc) {
    throw new Error("Connector WireGuard private key not found");
  }

  const wgServer = getWireGuardServerConfig();
  const resolvedEndpoint = resolveWireGuardEndpoint(connector.wireguardEndpoint);
  const serverPublicKey = resolveWireGuardServerPublicKey(connector);
  const connectorPrivateKey = decryptWireGuardPrivateKey(
    connector.wireguardPrivateKeyEnc,
    env.sessionSecret,
  );

  const wgConfig = buildWireGuardClientConfig({
    connectorPrivateKey,
    connectorAddress: connector.wireguardIp || "10.255.0.2",
    serverPublicKey: serverPublicKey || wgServer.publicKey,
    serverEndpoint: resolvedEndpoint,
    allowedIps: connector.wireguardAllowedIps || wgServer.allowedIps,
  });

  const envContent = `# NetOps Connector Bootstrap Package
# Generated at: ${now.toISOString()}
# TTL: 15 minutes from generation
# WARNING: Keep this token secure. This file should be sourced into the connector agent environment.

export CONNECTOR_TOKEN="${token}"
export CONNECTOR_ID="${connector.id}"
export CONNECTOR_NAME="${connector.name}"

# WireGuard Configuration
cat > /tmp/wg-connector.conf <<'WGEOF'
${wgConfig}
WGEOF

# Source this file before starting the connector agent:
# source connector-bootstrap.env
# docker run -e CONNECTOR_TOKEN -e CONNECTOR_ID -e CONNECTOR_NAME -v /tmp/wg-connector.conf:/etc/wireguard/wg-connector.conf netops/connector-agent
`;

  return {
    token,
    envContent,
    connectorName: connector.name,
  };
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

  if (connector.connectorTokenHash) {
    db.update(connectorBootstrapTokensTable)
      .set({ usedAt: now })
      .where(
        and(
          eq(connectorBootstrapTokensTable.connectorId, connector.id),
          eq(connectorBootstrapTokensTable.tokenHash, connector.connectorTokenHash),
        ),
      )
      .catch((error) => {
        console.error("failed to mark bootstrap token as used:", error);
      });
  }

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
  const serverPublicKey = await requireWireGuardServerPublicKey(row);

  return {
    connector_id: id,
    wireguard_ip: row.wireguardIp,
    wireguard_public_key: row.wireguardPublicKey,
    server_public_key: serverPublicKey,
    endpoint: row.wireguardEndpoint || wgServer.endpoint,
    allowed_ips: row.wireguardAllowedIps || wgServer.allowedIps,
    config: buildWireGuardClientConfig({
      connectorPrivateKey: "<PRIVATE_KEY>",
      connectorAddress: row.wireguardIp || "10.255.0.2",
      serverPublicKey,
      serverEndpoint: row.wireguardEndpoint || wgServer.endpoint,
      allowedIps: row.wireguardAllowedIps || wgServer.allowedIps,
    }),
  };
}

export async function provisionWireGuardForConnector(connectorId: number) {
  const [row] = await db.select().from(connectorsTable).where(eq(connectorsTable.id, connectorId)).limit(1);
  if (!row?.wireguardPrivateKeyEnc) return null;

  const wgServer = getWireGuardServerConfig();
  const serverPublicKey = await requireWireGuardServerPublicKey(row);
  const connectorPrivateKey = decryptWireGuardPrivateKey(row.wireguardPrivateKeyEnc, env.sessionSecret);
  const endpoint = resolveWireGuardEndpoint(row.wireguardEndpoint);
  const allowedIps = row.wireguardAllowedIps?.trim() || wgServer.allowedIps;
  const wireguardIp = row.wireguardIp?.trim() || "";

  if (!wireguardIp) {
    throw new Error("Connector has no WireGuard IP assigned");
  }

  const storedHost = row.wireguardEndpoint?.split(":")[0]?.trim().toLowerCase() ?? "";
  if (storedHost && LEGACY_WG_ENDPOINT_HOSTS.has(storedHost)) {
    await persistWireGuardEndpointIfLegacy(connectorId, endpoint);
  }

  const config = buildWireGuardClientConfig({
    connectorPrivateKey,
    connectorAddress: wireguardIp,
    serverPublicKey,
    serverEndpoint: endpoint,
    allowedIps,
  });

  return {
    connector_id: connectorId,
    connector_name: row.name,
    wireguard_ip: wireguardIp,
    wireguard_public_key: row.wireguardPublicKey,
    connector_private_key: connectorPrivateKey,
    server_public_key: serverPublicKey,
    endpoint,
    allowed_ips: allowedIps,
    interface_name: "netops",
    config_path: "/etc/wireguard/netops.conf",
    config,
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
  if (jobType === "SSH_CONFIG_BUNDLE") {
    const commands = Array.isArray(payload.commands) ? payload.commands : [];
    if (commands.length === 0) {
      throw new Error("SSH_CONFIG_BUNDLE requires payload.commands");
    }
    for (const command of commands) {
      if (typeof command !== "string") {
        throw new Error("SSH_CONFIG_BUNDLE commands must be strings");
      }
      assertReadOnlySshCommand(command);
    }
  }
  if (jobType === "SNMP_GET" || jobType === "SNMP_WALK") {
    const oid = typeof payload.oid === "string" ? payload.oid : "";
    if (!oid) throw new Error("SNMP jobs require payload.oid");
  }
  if (jobType === "NETCONF_GET" || jobType === "NETCONF_GET_CONFIG" || jobType === "NETCONF_RPC") {
    const rpc = typeof payload.rpc === "string" ? payload.rpc.trim() : "";
    if (!rpc) throw new Error("NETCONF jobs require payload.rpc");
  }
  if (
    jobType === "PROVISION_PREVIEW" ||
    jobType === "PROVISION_VALIDATE" ||
    jobType === "PROVISION_EXECUTE" ||
    jobType === "PROVISION_ROLLBACK"
  ) {
    const templateId = typeof payload.template_id === "string" ? payload.template_id.trim() : "";
    const parameters = payload.parameters && typeof payload.parameters === "object" && !Array.isArray(payload.parameters)
      ? payload.parameters
      : null;
    const deviceId = Number(payload.device_id);
    if (!Number.isInteger(deviceId) || deviceId < 1) throw new Error("Provisioning jobs require payload.device_id");
    if (!templateId) throw new Error("Provisioning jobs require payload.template_id");
    if (!parameters) throw new Error("Provisioning jobs require payload.parameters");
  }
}

export async function createConnectorJob(input: CreateConnectorJobInput) {
  let connectorId = input.connector_id ?? null;
  if (!connectorId) {
    if (!input.connector_group_id) {
      throw new Error("Connector or connector group not specified");
    }
    const resolved = await resolveAvailableConnectorForGroup(input.connector_group_id);
    connectorId = resolved.connectorId;
  }

  const [connector] = await db
    .select({ status: connectorsTable.status })
    .from(connectorsTable)
    .where(eq(connectorsTable.id, connectorId))
    .limit(1);
  if (!connector) {
    throw new Error("Connector not found");
  }
  if (isInactiveConnectorStatus(connector.status)) {
    throw new ConflictError(`Connector is ${connector.status.toLowerCase()} and cannot accept jobs`);
  }

  validateJobPayload(input.job_type, input.payload_json ?? {});
  const payloadJson = input.payload_json ?? {};
  const maskedPayloadJson = input.masked_payload_json ?? maskSensitivePayload(payloadJson);
  const [job] = await db
    .insert(connectorJobsTable)
    .values({
      connectorId,
      jobType: input.job_type,
      targetIp: input.target_ip ?? null,
      targetPort: input.target_port ?? null,
      payloadJson,
      maskedPayloadJson,
      status: "PENDING",
      deviceId: input.device_id ?? null,
      correlationId: input.correlation_id ?? null,
      createdBy: input.created_by ?? null,
      timeoutSeconds: input.timeout_seconds ?? 120,
    })
    .returning();
  return job;
}

export async function getConnectorJobDetail(jobId: number) {
  const [job] = await db.select().from(connectorJobsTable).where(eq(connectorJobsTable.id, jobId)).limit(1);
  if (!job) return null;

  const [result] = await db
    .select()
    .from(connectorJobResultsTable)
    .where(eq(connectorJobResultsTable.jobId, jobId))
    .limit(1);

  let deviceHostname: string | null = null;
  if (job.deviceId) {
    const [device] = await db
      .select({ hostname: devicesTable.hostname })
      .from(devicesTable)
      .where(eq(devicesTable.id, job.deviceId))
      .limit(1);
    deviceHostname = device?.hostname ?? null;
  }

  let createdByName: string | null = null;
  if (job.createdBy) {
    const [user] = await db.select({ name: usersTable.name }).from(usersTable).where(eq(usersTable.id, job.createdBy)).limit(1);
    createdByName = user?.name ?? null;
  }

  const durationMs =
    job.finishedAt && job.createdAt ? Math.max(0, job.finishedAt.getTime() - job.createdAt.getTime()) : null;

  return {
    id: job.id,
    connector_id: job.connectorId,
    device_id: job.deviceId,
    device_hostname: deviceHostname,
    job_type: job.jobType,
    target_ip: job.targetIp,
    target_port: job.targetPort,
    status: job.status,
    payload_json: job.maskedPayloadJson,
    correlation_id: job.correlationId,
    created_by: job.createdBy,
    created_by_name: createdByName,
    created_at: job.createdAt.toISOString(),
    started_at: job.startedAt?.toISOString() ?? null,
    finished_at: job.finishedAt?.toISOString() ?? null,
    timeout_seconds: job.timeoutSeconds,
    duration_ms: durationMs,
    result: result
      ? {
          success: result.success,
          stdout: result.stdout,
          stderr: result.stderr,
          exit_code: result.exitCode,
          result_json: result.resultJson,
        }
      : null,
  };
}

export async function listConnectorJobsEnriched(connectorId: number, limit = 50) {
  const jobs = await listConnectorJobs(connectorId, limit);
  const enriched = [];
  for (const job of jobs) {
    const detail = await getConnectorJobDetail(job.id);
    if (detail) enriched.push(detail);
  }
  return enriched;
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
  await expireTimedOutJobs();

  // Reclaim RUNNING jobs left behind when a connector restarts or crashes mid-flight.
  const running = await db
    .select()
    .from(connectorJobsTable)
    .where(and(eq(connectorJobsTable.connectorId, connectorId), eq(connectorJobsTable.status, "RUNNING")));
  const now = Date.now();
  for (const job of running) {
    const [result] = await db
      .select({ id: connectorJobResultsTable.id })
      .from(connectorJobResultsTable)
      .where(eq(connectorJobResultsTable.jobId, job.id))
      .limit(1);
    if (result) continue;
    const startedMs = job.startedAt?.getTime() ?? job.createdAt.getTime();
    const reclaimAfterMs = Math.min(job.timeoutSeconds * 1000, 130_000);
    if (now - startedMs >= reclaimAfterMs) {
      await db
        .update(connectorJobsTable)
        .set({ status: "PENDING", startedAt: null, finishedAt: null })
        .where(eq(connectorJobsTable.id, job.id));
    }
  }

  const jobs = await db
    .select()
    .from(connectorJobsTable)
    .where(and(eq(connectorJobsTable.connectorId, connectorId), eq(connectorJobsTable.status, "PENDING")))
    .orderBy(connectorJobsTable.createdAt)
    .limit(limit);

  if (jobs.length === 0) return [];

  const startedAt = new Date();
  await db
    .update(connectorJobsTable)
    .set({ status: "RUNNING", startedAt })
    .where(inArray(connectorJobsTable.id, jobs.map((j) => j.id)));

  const hydrated = [];
  for (const j of jobs) {
    hydrated.push({
      id: j.id,
      job_type: j.jobType,
      target_ip: j.targetIp,
      target_port: j.targetPort,
      payload_json: await buildConnectorPayloadWithCredential({
        payload: j.payloadJson,
        jobType: j.jobType,
        deviceId: j.deviceId,
      }),
      timeout_seconds: j.timeoutSeconds,
      status: "RUNNING" as const,
    });
  }
  return hydrated;
}

export async function submitJobResult(connectorId: number, jobId: number, result: ConnectorJobResultPayload) {
  const [job] = await db
    .select()
    .from(connectorJobsTable)
    .where(and(eq(connectorJobsTable.id, jobId), eq(connectorJobsTable.connectorId, connectorId)))
    .limit(1);

  if (!job) throw new Error("Job not found");
  const [existingResult] = await db
    .select({ id: connectorJobResultsTable.id })
    .from(connectorJobResultsTable)
    .where(eq(connectorJobResultsTable.jobId, jobId))
    .limit(1);
  if (existingResult) {
    throw new Error(`Job is not accepting results (status=${job.status})`);
  }
  if (!["PENDING", "RUNNING", "TIMEOUT"].includes(job.status)) {
    throw new Error(`Job is not accepting results (status=${job.status})`);
  }

  const finishedAt = new Date();
  const stdout = result.stdout ?? "";
  const hasUsefulSshOutput =
    (job.jobType === "SSH_COMMAND" || job.jobType === "SSH_CONFIG_BUNDLE")
    && stdout.trim().length > 0;
  const normalizedSuccess = result.success || hasUsefulSshOutput;
  const status = normalizedSuccess ? "SUCCESS" : "FAILED";

  await db.insert(connectorJobResultsTable).values({
    jobId,
    success: normalizedSuccess,
    stdout: stdout || null,
    stderr: result.stderr ?? null,
    exitCode: result.exit_code ?? null,
    resultJson: result.result_json ?? null,
  });

  await db
    .update(connectorJobsTable)
    .set({ status, finishedAt })
    .where(eq(connectorJobsTable.id, jobId));

  if (normalizedSuccess && job.deviceId) {
    await db
      .update(devicesTable)
      .set({ status: "active", lastSeen: finishedAt, updatedAt: finishedAt })
      .where(eq(devicesTable.id, job.deviceId));
  }

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
    const baseMs = (job.startedAt ?? job.createdAt).getTime();
    const graceMs = job.status === "RUNNING" ? 30_000 : 0;
    const deadline = baseMs + job.timeoutSeconds * 1000 + graceMs;
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
