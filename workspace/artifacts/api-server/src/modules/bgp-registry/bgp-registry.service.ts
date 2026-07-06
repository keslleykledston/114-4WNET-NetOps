import { asc, desc, eq } from "drizzle-orm";
import { db } from "@workspace/db";
import {
  bgpAuthorizedPrefixesTable,
  bgpCustomerConnectionsTable,
  bgpCustomersTable,
  bgpExitCommunityActionsTable,
  bgpExitPointsTable,
  bgpRegistryAuditLogTable,
} from "../../../../../lib/db/src/schema/bgp_registry.js";
import { getLatestAnnouncementMatrix } from "../bgp-announcements/bgp-announcements.service.js";
import { compileAnnouncementPreview } from "../bgp-announcements/bgp-announcements.preview.service.js";

type Jsonish = Record<string, unknown>;

function now() {
  return new Date();
}

function rowJson(row: unknown): string | null {
  return row ? JSON.stringify(row) : null;
}

async function writeAudit(entityType: string, entityId: number, action: string, before: unknown, after: unknown, reason?: string | null) {
  await db.insert(bgpRegistryAuditLogTable).values({
    entityType,
    entityId,
    action,
    beforeJson: rowJson(before),
    afterJson: rowJson(after),
    reason: reason ?? null,
    createdAt: now(),
  });
}

function buildUpdate(body: Jsonish, fields: Record<string, string>) {
  const payload: Record<string, unknown> = { updatedAt: now() };
  for (const [key, column] of Object.entries(fields)) {
    if (Object.prototype.hasOwnProperty.call(body, key)) {
      payload[column] = body[key];
    }
  }
  return payload;
}

export async function listBgpCustomers() {
  return db.select().from(bgpCustomersTable).orderBy(asc(bgpCustomersTable.name));
}

export async function createBgpCustomer(body: Jsonish) {
  const [created] = await db.insert(bgpCustomersTable).values({
    name: String(body.name ?? "").trim(),
    code: String(body.code ?? "").trim(),
    asn: Number(body.asn),
    type: typeof body.type === "string" ? body.type.trim() : "customer",
    status: typeof body.status === "string" ? body.status.trim() : "active",
    parentCustomerId: body.parentCustomerId == null ? null : Number(body.parentCustomerId),
    asSet: typeof body.asSet === "string" ? body.asSet.trim() : null,
    irrSource: typeof body.irrSource === "string" ? body.irrSource.trim() : null,
    irrValidationMode: typeof body.irrValidationMode === "string" ? body.irrValidationMode.trim() : null,
    rpkiValidationMode: typeof body.rpkiValidationMode === "string" ? body.rpkiValidationMode.trim() : null,
    notes: typeof body.notes === "string" ? body.notes.trim() : null,
    createdAt: now(),
    updatedAt: now(),
  }).returning();
  await writeAudit("customer", created.id, "create", null, created, typeof body.reason === "string" ? body.reason : null);
  return created;
}

export async function updateBgpCustomer(id: number, body: Jsonish) {
  const [before] = await db.select().from(bgpCustomersTable).where(eq(bgpCustomersTable.id, id)).limit(1);
  if (!before) return null;
  const [updated] = await db.update(bgpCustomersTable).set({
    ...buildUpdate(body, {
      name: "name",
      code: "code",
      asn: "asn",
      type: "type",
      status: "status",
      parentCustomerId: "parentCustomerId",
      asSet: "asSet",
      irrSource: "irrSource",
      irrValidationMode: "irrValidationMode",
      rpkiValidationMode: "rpkiValidationMode",
      notes: "notes",
    }),
  }).where(eq(bgpCustomersTable.id, id)).returning();
  await writeAudit("customer", id, "update", before, updated, typeof body.reason === "string" ? body.reason : null);
  return updated ?? null;
}

export async function deleteBgpCustomer(id: number) {
  const [before] = await db.select().from(bgpCustomersTable).where(eq(bgpCustomersTable.id, id)).limit(1);
  if (!before) return false;
  await db.delete(bgpCustomersTable).where(eq(bgpCustomersTable.id, id));
  await writeAudit("customer", id, "delete", before, null);
  return true;
}

export async function listBgpCustomerConnections(customerId?: number | null) {
  const query = db.select().from(bgpCustomerConnectionsTable).orderBy(desc(bgpCustomerConnectionsTable.id));
  return customerId ? query.where(eq(bgpCustomerConnectionsTable.customerId, customerId)) : query;
}

export async function createBgpCustomerConnection(body: Jsonish) {
  const [created] = await db.insert(bgpCustomerConnectionsTable).values({
    customerId: Number(body.customerId),
    deviceId: Number(body.deviceId),
    addressFamily: typeof body.addressFamily === "string" ? body.addressFamily : "ipv4",
    neighborIpv4: typeof body.neighborIpv4 === "string" ? body.neighborIpv4.trim() : null,
    neighborIpv6: typeof body.neighborIpv6 === "string" ? body.neighborIpv6.trim() : null,
    interfaceName: typeof body.interfaceName === "string" ? body.interfaceName.trim() : null,
    vrfName: typeof body.vrfName === "string" ? body.vrfName.trim() : null,
    importRoutePolicy: typeof body.importRoutePolicy === "string" ? body.importRoutePolicy.trim() : null,
    exportRoutePolicy: typeof body.exportRoutePolicy === "string" ? body.exportRoutePolicy.trim() : null,
    originRoutePolicy: typeof body.originRoutePolicy === "string" ? body.originRoutePolicy.trim() : null,
    ipv4PrefixList: typeof body.ipv4PrefixList === "string" ? body.ipv4PrefixList.trim() : null,
    ipv6PrefixList: typeof body.ipv6PrefixList === "string" ? body.ipv6PrefixList.trim() : null,
    status: typeof body.status === "string" ? body.status : "active",
    source: typeof body.source === "string" ? body.source : "manual",
    lastSnapshotId: body.lastSnapshotId == null ? null : Number(body.lastSnapshotId),
    lastSeenAt: body.lastSeenAt ? new Date(String(body.lastSeenAt)) : null,
    notes: typeof body.notes === "string" ? body.notes.trim() : null,
    createdAt: now(),
    updatedAt: now(),
  }).returning();
  await writeAudit("connection", created.id, "create", null, created);
  return created;
}

export async function updateBgpCustomerConnection(id: number, body: Jsonish) {
  const [before] = await db.select().from(bgpCustomerConnectionsTable).where(eq(bgpCustomerConnectionsTable.id, id)).limit(1);
  if (!before) return null;
  const [updated] = await db.update(bgpCustomerConnectionsTable).set(buildUpdate(body, {
    customerId: "customerId",
    deviceId: "deviceId",
    addressFamily: "addressFamily",
    neighborIpv4: "neighborIpv4",
    neighborIpv6: "neighborIpv6",
    interfaceName: "interfaceName",
    vrfName: "vrfName",
    importRoutePolicy: "importRoutePolicy",
    exportRoutePolicy: "exportRoutePolicy",
    originRoutePolicy: "originRoutePolicy",
    ipv4PrefixList: "ipv4PrefixList",
    ipv6PrefixList: "ipv6PrefixList",
    status: "status",
    source: "source",
    lastSnapshotId: "lastSnapshotId",
    lastSeenAt: "lastSeenAt",
    notes: "notes",
  })).where(eq(bgpCustomerConnectionsTable.id, id)).returning();
  await writeAudit("connection", id, "update", before, updated);
  return updated ?? null;
}

export async function deleteBgpCustomerConnection(id: number) {
  const [before] = await db.select().from(bgpCustomerConnectionsTable).where(eq(bgpCustomerConnectionsTable.id, id)).limit(1);
  if (!before) return false;
  await db.delete(bgpCustomerConnectionsTable).where(eq(bgpCustomerConnectionsTable.id, id));
  await writeAudit("connection", id, "delete", before, null);
  return true;
}

export async function listBgpAuthorizedPrefixes(customerId?: number | null) {
  const query = db.select().from(bgpAuthorizedPrefixesTable).orderBy(desc(bgpAuthorizedPrefixesTable.id));
  return customerId ? query.where(eq(bgpAuthorizedPrefixesTable.customerId, customerId)) : query;
}

export async function createBgpAuthorizedPrefix(body: Jsonish) {
  const [created] = await db.insert(bgpAuthorizedPrefixesTable).values({
    customerId: Number(body.customerId),
    connectionId: body.connectionId == null ? null : Number(body.connectionId),
    prefix: String(body.prefix ?? "").trim(),
    addressFamily: typeof body.addressFamily === "string" ? body.addressFamily : "ipv4",
    originAsn: body.originAsn == null ? null : Number(body.originAsn),
    maxPrefixLength: body.maxPrefixLength == null ? null : Number(body.maxPrefixLength),
    source: typeof body.source === "string" ? body.source : "manual",
    validationStatus: typeof body.validationStatus === "string" ? body.validationStatus : "active",
    description: typeof body.description === "string" ? body.description.trim() : null,
    validFrom: body.validFrom ? new Date(String(body.validFrom)) : null,
    validUntil: body.validUntil ? new Date(String(body.validUntil)) : null,
    createdAt: now(),
    updatedAt: now(),
  }).returning();
  await writeAudit("prefix", created.id, "create", null, created);
  return created;
}

export async function updateBgpAuthorizedPrefix(id: number, body: Jsonish) {
  const [before] = await db.select().from(bgpAuthorizedPrefixesTable).where(eq(bgpAuthorizedPrefixesTable.id, id)).limit(1);
  if (!before) return null;
  const [updated] = await db.update(bgpAuthorizedPrefixesTable).set(buildUpdate(body, {
    customerId: "customerId",
    connectionId: "connectionId",
    prefix: "prefix",
    addressFamily: "addressFamily",
    originAsn: "originAsn",
    maxPrefixLength: "maxPrefixLength",
    source: "source",
    validationStatus: "validationStatus",
    description: "description",
    validFrom: "validFrom",
    validUntil: "validUntil",
  })).where(eq(bgpAuthorizedPrefixesTable.id, id)).returning();
  await writeAudit("prefix", id, "update", before, updated);
  return updated ?? null;
}

export async function deleteBgpAuthorizedPrefix(id: number) {
  const [before] = await db.select().from(bgpAuthorizedPrefixesTable).where(eq(bgpAuthorizedPrefixesTable.id, id)).limit(1);
  if (!before) return false;
  await db.delete(bgpAuthorizedPrefixesTable).where(eq(bgpAuthorizedPrefixesTable.id, id));
  await writeAudit("prefix", id, "delete", before, null);
  return true;
}

export async function listBgpExitPoints() {
  return db.select().from(bgpExitPointsTable).orderBy(asc(bgpExitPointsTable.displayOrder), asc(bgpExitPointsTable.name));
}

export async function createBgpExitPoint(body: Jsonish) {
  const [created] = await db.insert(bgpExitPointsTable).values({
    name: String(body.name ?? "").trim(),
    slug: String(body.slug ?? "").trim(),
    type: typeof body.type === "string" ? body.type : "upstream",
    asn: body.asn == null ? null : Number(body.asn),
    circuitId: typeof body.circuitId === "string" ? body.circuitId.trim() : null,
    deviceId: body.deviceId == null ? null : Number(body.deviceId),
    neighborIpv4: typeof body.neighborIpv4 === "string" ? body.neighborIpv4.trim() : null,
    neighborIpv6: typeof body.neighborIpv6 === "string" ? body.neighborIpv6.trim() : null,
    exportRoutePolicy: typeof body.exportRoutePolicy === "string" ? body.exportRoutePolicy.trim() : null,
    enabledIpv4: typeof body.enabledIpv4 === "boolean" ? body.enabledIpv4 : true,
    enabledIpv6: typeof body.enabledIpv6 === "boolean" ? body.enabledIpv6 : true,
    displayOrder: body.displayOrder == null ? 0 : Number(body.displayOrder),
    status: typeof body.status === "string" ? body.status : "active",
    notes: typeof body.notes === "string" ? body.notes.trim() : null,
    createdAt: now(),
    updatedAt: now(),
  }).returning();
  await writeAudit("exit_point", created.id, "create", null, created);
  return created;
}

export async function updateBgpExitPoint(id: number, body: Jsonish) {
  const [before] = await db.select().from(bgpExitPointsTable).where(eq(bgpExitPointsTable.id, id)).limit(1);
  if (!before) return null;
  const [updated] = await db.update(bgpExitPointsTable).set(buildUpdate(body, {
    name: "name",
    slug: "slug",
    type: "type",
    asn: "asn",
    circuitId: "circuitId",
    deviceId: "deviceId",
    neighborIpv4: "neighborIpv4",
    neighborIpv6: "neighborIpv6",
    exportRoutePolicy: "exportRoutePolicy",
    enabledIpv4: "enabledIpv4",
    enabledIpv6: "enabledIpv6",
    displayOrder: "displayOrder",
    status: "status",
    notes: "notes",
  })).where(eq(bgpExitPointsTable.id, id)).returning();
  await writeAudit("exit_point", id, "update", before, updated);
  return updated ?? null;
}

export async function deleteBgpExitPoint(id: number) {
  const [before] = await db.select().from(bgpExitPointsTable).where(eq(bgpExitPointsTable.id, id)).limit(1);
  if (!before) return false;
  await db.delete(bgpExitPointsTable).where(eq(bgpExitPointsTable.id, id));
  await writeAudit("exit_point", id, "delete", before, null);
  return true;
}

export async function listBgpExitCommunityActions(exitPointId?: number | null) {
  const query = db.select().from(bgpExitCommunityActionsTable).orderBy(asc(bgpExitCommunityActionsTable.action));
  return exitPointId ? query.where(eq(bgpExitCommunityActionsTable.exitPointId, exitPointId)) : query;
}

export async function createBgpExitCommunityAction(body: Jsonish) {
  const [created] = await db.insert(bgpExitCommunityActionsTable).values({
    exitPointId: Number(body.exitPointId),
    action: String(body.action ?? "").trim(),
    community: String(body.community ?? "").trim(),
    label: String(body.label ?? "").trim(),
    riskLevel: typeof body.riskLevel === "string" ? body.riskLevel : "low",
    addressFamily: typeof body.addressFamily === "string" ? body.addressFamily : null,
    enabled: typeof body.enabled === "boolean" ? body.enabled : true,
    description: typeof body.description === "string" ? body.description.trim() : null,
    createdAt: now(),
    updatedAt: now(),
  }).returning();
  await writeAudit("exit_action", created.id, "create", null, created);
  return created;
}

export async function updateBgpExitCommunityAction(id: number, body: Jsonish) {
  const [before] = await db.select().from(bgpExitCommunityActionsTable).where(eq(bgpExitCommunityActionsTable.id, id)).limit(1);
  if (!before) return null;
  const [updated] = await db.update(bgpExitCommunityActionsTable).set(buildUpdate(body, {
    exitPointId: "exitPointId",
    action: "action",
    community: "community",
    label: "label",
    riskLevel: "riskLevel",
    addressFamily: "addressFamily",
    enabled: "enabled",
    description: "description",
  })).where(eq(bgpExitCommunityActionsTable.id, id)).returning();
  await writeAudit("exit_action", id, "update", before, updated);
  return updated ?? null;
}

export async function deleteBgpExitCommunityAction(id: number) {
  const [before] = await db.select().from(bgpExitCommunityActionsTable).where(eq(bgpExitCommunityActionsTable.id, id)).limit(1);
  if (!before) return false;
  await db.delete(bgpExitCommunityActionsTable).where(eq(bgpExitCommunityActionsTable.id, id));
  await writeAudit("exit_action", id, "delete", before, null);
  return true;
}

export async function listBgpRegistryAuditLog(limit = 100) {
  return db.select().from(bgpRegistryAuditLogTable).orderBy(desc(bgpRegistryAuditLogTable.id)).limit(limit);
}

export async function getCustomerAnnouncementState(customerId: number) {
  const [customer] = await db.select().from(bgpCustomersTable).where(eq(bgpCustomersTable.id, customerId)).limit(1);
  if (!customer) return null;
  const connections = await listBgpCustomerConnections(customerId);
  const prefixes = await listBgpAuthorizedPrefixes(customerId);
  const exitPoints = await listBgpExitPoints();
  const actions = await listBgpExitCommunityActions();
  return { customer, connections, prefixes, exitPoints, actions, previewReady: true, engine: "bgp-announcements" };
}

export async function reconcileBgpCustomer(customerId: number) {
  const state = await getCustomerAnnouncementState(customerId);
  if (!state) return null;
  const deviceId = Number(state.connections[0]?.deviceId ?? 0) || null;
  const matrix = deviceId ? await getLatestAnnouncementMatrix(deviceId) : null;
  const actionMap = new Map<string, string>();
  for (const action of state.actions) {
    actionMap.set(String(action.community), String(action.label ?? action.action ?? action.community));
  }
  const exitMap = new Map<number, string>();
  for (const exitPoint of state.exitPoints) {
    exitMap.set(Number(exitPoint.id), String(exitPoint.name ?? exitPoint.slug));
  }
  const reconciledActions = (state.actions ?? []).map((action) => ({
    ...action,
    friendlyLabel: `${exitMap.get(Number(action.exitPointId)) ?? "Saída"} · ${String(action.label ?? action.action)}`,
  }));
  const matrixRows = Array.isArray((matrix as any)?.matrix?.rows) ? (matrix as any).matrix.rows : [];
  const matrixCommunities = new Map<string, { label: string; row: string; exit: string }>();
  for (const row of matrixRows) {
    const prefix = String(row?.prefixScope?.name ?? row?.targetPolicyName ?? row?.routePolicyName ?? "-");
    for (const [exitName, cell] of Object.entries(row?.cells ?? {})) {
      const community = String((cell as any)?.community ?? "");
      if (!community) continue;
      matrixCommunities.set(community, {
        label: String((cell as any)?.label ?? (cell as any)?.state ?? "?"),
        row: prefix,
        exit: String(exitName),
      });
    }
  }
  const missingLabels = [...actionMap.entries()]
    .filter(([community]) => !matrixCommunities.has(community))
    .map(([community, label]) => ({ community, label, kind: "registry_only", message: `Community ${community} cadastrada como ${label}, mas não apareceu na matriz` }));
  const unknownInMatrix = [...matrixCommunities.entries()]
    .filter(([community]) => !actionMap.has(community))
    .map(([community, meta]) => ({ community, kind: "matrix_only", message: `Community ${community} apareceu na matriz sem cadastro`, ...meta }));
  const mismatches = [
    ...(matrix?.empty ? [{ kind: "no_snapshot", message: "Matriz atual não encontrada" }] : []),
    ...(state.connections.length === 0 ? [{ kind: "missing_connection", message: "Cliente sem conexão cadastrada" }] : []),
    ...(state.prefixes.length === 0 ? [{ kind: "missing_prefix", message: "Cliente sem prefixos autorizados" }] : []),
    ...missingLabels,
    ...unknownInMatrix,
  ];
  return {
    customer: state.customer,
    deviceId,
    matrix,
    actions: reconciledActions,
    mismatchCount: mismatches.length,
    mismatches,
  };
}

export async function previewBgpCustomer(
  customerId: number,
  input: {
    deviceId?: number | null;
    desiredState?: "On" | "P1" | "P2" | "P3" | "P4" | "Off" | "NE" | "BH" | "Def" | "Clear";
    rowIndex?: number | null;
    exitIndex?: number | null;
  } = {},
) {
  const state = await getCustomerAnnouncementState(customerId);
  if (!state) return null;
  const deviceId = input.deviceId ?? Number(state.connections[0]?.deviceId ?? 0);
  if (!deviceId) return { error: "Customer without device connection", status: 409 };
  const latest = await getLatestAnnouncementMatrix(deviceId);
  const rows = Array.isArray((latest as any)?.matrix?.rows) ? (latest as any).matrix.rows : [];
  const columns = Array.isArray((latest as any)?.matrix?.columns) ? (latest as any).matrix.columns : [];
  const row = rows[input.rowIndex ?? 0] ?? rows[0];
  const column = columns[input.exitIndex ?? 0] ?? columns[0];
  if (!row || !column) return { error: "Matrix target not available", status: 409 };
  const result = await compileAnnouncementPreview({
    baseSnapshotId: Number((latest as any).snapshot_id),
    deviceId,
    targetPolicyName: String(row.targetPolicyName ?? row.routePolicyName ?? ""),
    node: Number(row.node ?? 0),
    upstreamCircuitId: String(column.upstreamCircuitId ?? ""),
    desiredState: input.desiredState ?? "P2",
    requestedBy: null,
    note: `Registry preview for customer ${state.customer.name}`,
  });
  return result;
}
