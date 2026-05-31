import { and, desc, eq, inArray } from "drizzle-orm";
import { ConflictError, isUniqueViolation } from "../../lib/db-errors.js";
import {
  connectorGroupMembersTable,
  connectorGroupsTable,
  connectorJobsTable,
  connectorsTable,
  db,
  tenantsTable,
} from "@workspace/db";
import {
  type ConnectorGroupDetailView,
  type ConnectorGroupInput,
  type ConnectorGroupMemberInput,
  type ConnectorGroupMemberView,
  type ConnectorGroupView,
  type ConnectorGroupStrategy,
} from "./connectors.types.js";
import { refreshConnectorOnlineStatus } from "./connectors.service.js";

export class ConnectorGroupOfflineError extends ConflictError {
  constructor(message = "No available connector in group") {
    super(message);
    this.name = "ConnectorGroupOfflineError";
  }
}

type MemberRow = {
  connectorId: number;
  connectorName: string;
  connectorStatus: string;
  connectorTenantId: number;
  priority: number;
  weight: number;
};

function isConnectorEligible(status: string): boolean {
  return status === "ONLINE";
}

function expandWeightedMembers(members: MemberRow[]): MemberRow[] {
  const expanded: MemberRow[] = [];
  for (const member of members) {
    const copies = Math.max(1, member.weight);
    for (let i = 0; i < copies; i += 1) {
      expanded.push(member);
    }
  }
  return expanded;
}

function orderMembers(members: MemberRow[], strategy: ConnectorGroupStrategy): MemberRow[] {
  const sorted = [...members].sort((a, b) => {
    if (a.priority !== b.priority) return a.priority - b.priority;
    if (strategy === "PRIORITY" && a.weight !== b.weight) return b.weight - a.weight;
    const byName = a.connectorName.localeCompare(b.connectorName);
    if (byName !== 0) return byName;
    return a.connectorId - b.connectorId;
  });
  if (strategy === "ROUND_ROBIN") {
    return expandWeightedMembers(sorted);
  }
  return sorted;
}

async function loadGroupBase(groupId: number) {
  const [row] = await db
    .select({ group: connectorGroupsTable, tenant: tenantsTable })
    .from(connectorGroupsTable)
    .innerJoin(tenantsTable, eq(connectorGroupsTable.tenantId, tenantsTable.id))
    .where(eq(connectorGroupsTable.id, groupId))
    .limit(1);
  if (!row) return null;
  return row;
}

async function loadGroupMembers(groupId: number): Promise<MemberRow[]> {
  const rows = await db
    .select({
      connectorId: connectorsTable.id,
      connectorName: connectorsTable.name,
      connectorStatus: connectorsTable.status,
      connectorTenantId: connectorsTable.tenantId,
      priority: connectorGroupMembersTable.priority,
      weight: connectorGroupMembersTable.weight,
    })
    .from(connectorGroupMembersTable)
    .innerJoin(connectorsTable, eq(connectorGroupMembersTable.connectorId, connectorsTable.id))
    .where(eq(connectorGroupMembersTable.connectorGroupId, groupId))
    .orderBy(connectorGroupMembersTable.priority, connectorsTable.name);
  return rows;
}

function toGroupView(
  group: typeof connectorGroupsTable.$inferSelect,
  tenantName: string,
  members: MemberRow[],
): ConnectorGroupView {
  const activeMemberCount = members.filter((member) => isConnectorEligible(member.connectorStatus)).length;
  return {
    id: group.id,
    tenant_id: group.tenantId,
    tenant_name: tenantName,
    name: group.name,
    strategy: group.strategy as ConnectorGroupStrategy,
    member_count: members.length,
    active_member_count: activeMemberCount,
    created_at: group.createdAt.toISOString(),
    updated_at: group.updatedAt.toISOString(),
  };
}

function toMemberView(member: MemberRow): ConnectorGroupMemberView {
  return {
    connector_id: member.connectorId,
    connector_name: member.connectorName,
    connector_status: member.connectorStatus,
    connector_tenant_id: member.connectorTenantId,
    priority: member.priority,
    weight: member.weight,
  };
}

export async function listConnectorGroups(): Promise<ConnectorGroupView[]> {
  await refreshConnectorOnlineStatus();
  const rows = await db
    .select({ group: connectorGroupsTable, tenant: tenantsTable })
    .from(connectorGroupsTable)
    .innerJoin(tenantsTable, eq(connectorGroupsTable.tenantId, tenantsTable.id))
    .orderBy(connectorGroupsTable.tenantId, connectorGroupsTable.name);

  const result: ConnectorGroupView[] = [];
  for (const row of rows) {
    const members = await loadGroupMembers(row.group.id);
    result.push(toGroupView(row.group, row.tenant.name, members));
  }
  return result;
}

export async function getConnectorGroupById(id: number): Promise<ConnectorGroupDetailView | null> {
  await refreshConnectorOnlineStatus();
  const base = await loadGroupBase(id);
  if (!base) return null;

  const members = await loadGroupMembers(id);
  return {
    ...toGroupView(base.group, base.tenant.name, members),
    members: members.map(toMemberView),
  };
}

export async function createConnectorGroup(input: ConnectorGroupInput): Promise<ConnectorGroupDetailView> {
  const tenant = await db.select().from(tenantsTable).where(eq(tenantsTable.id, input.tenant_id)).limit(1).then((rows) => rows[0] ?? null);
  if (!tenant) {
    throw new Error("Tenant not found");
  }

  try {
    const [group] = await db
      .insert(connectorGroupsTable)
      .values({
        tenantId: input.tenant_id,
        name: input.name.trim(),
        strategy: input.strategy,
      })
      .returning();

    return {
      ...toGroupView(group, tenant.name, []),
      members: [],
    };
  } catch (error) {
    if (isUniqueViolation(error, "connector_groups_tenant_name_unique_idx")) {
      throw new ConflictError(`Connector group "${input.name.trim()}" already exists for this tenant`);
    }
    throw error;
  }
}

export async function updateConnectorGroup(
  id: number,
  patch: Partial<ConnectorGroupInput>,
): Promise<ConnectorGroupDetailView | null> {
  const current = await loadGroupBase(id);
  if (!current) return null;

  const [updated] = await db
    .update(connectorGroupsTable)
    .set({
      ...(patch.name !== undefined ? { name: patch.name.trim() } : {}),
      ...(patch.strategy !== undefined ? { strategy: patch.strategy } : {}),
      updatedAt: new Date(),
    })
    .where(eq(connectorGroupsTable.id, id))
    .returning();

  const members = await loadGroupMembers(id);
  return {
    ...toGroupView(updated ?? current.group, current.tenant.name, members),
    members: members.map(toMemberView),
  };
}

export async function deleteConnectorGroup(id: number): Promise<boolean> {
  const deleted = await db.delete(connectorGroupsTable).where(eq(connectorGroupsTable.id, id)).returning({ id: connectorGroupsTable.id });
  return deleted.length > 0;
}

async function validateMemberTenant(groupId: number, connectorId: number): Promise<{ groupTenantId: number; connectorTenantId: number }> {
  const [group, connector] = await Promise.all([
    db.select({ tenantId: connectorGroupsTable.tenantId }).from(connectorGroupsTable).where(eq(connectorGroupsTable.id, groupId)).limit(1).then((rows) => rows[0] ?? null),
    db.select({ tenantId: connectorsTable.tenantId }).from(connectorsTable).where(eq(connectorsTable.id, connectorId)).limit(1).then((rows) => rows[0] ?? null),
  ]);

  if (!group) throw new Error("Connector group not found");
  if (!connector) throw new Error("Connector not found");
  if (group.tenantId !== connector.tenantId) {
    throw new ConflictError("Connector must belong to the same tenant as the group");
  }
  return { groupTenantId: group.tenantId, connectorTenantId: connector.tenantId };
}

export async function upsertConnectorGroupMember(
  groupId: number,
  input: ConnectorGroupMemberInput,
): Promise<ConnectorGroupMemberView[]> {
  await validateMemberTenant(groupId, input.connector_id);
  await db
    .delete(connectorGroupMembersTable)
    .where(and(
      eq(connectorGroupMembersTable.connectorGroupId, groupId),
      eq(connectorGroupMembersTable.connectorId, input.connector_id),
    ));

  await db.insert(connectorGroupMembersTable).values({
    connectorGroupId: groupId,
    connectorId: input.connector_id,
    priority: input.priority ?? 100,
    weight: input.weight ?? 1,
  });

  return listConnectorGroupMembers(groupId);
}

export async function removeConnectorGroupMember(groupId: number, connectorId: number): Promise<ConnectorGroupMemberView[]> {
  await db
    .delete(connectorGroupMembersTable)
    .where(and(
      eq(connectorGroupMembersTable.connectorGroupId, groupId),
      eq(connectorGroupMembersTable.connectorId, connectorId),
    ));
  return listConnectorGroupMembers(groupId);
}

export async function listConnectorGroupMembers(groupId: number): Promise<ConnectorGroupMemberView[]> {
  const members = await loadGroupMembers(groupId);
  return members.map(toMemberView);
}

async function resolveAvailableMemberRows(
  groupId: number,
  excludeConnectorIds: number[] = [],
): Promise<{ group: typeof connectorGroupsTable.$inferSelect; tenantName: string; members: MemberRow[] }> {
  await refreshConnectorOnlineStatus();
  const base = await loadGroupBase(groupId);
  if (!base) {
    throw new Error("Connector group not found");
  }

  const rawMembers = await loadGroupMembers(groupId);
  const filtered = rawMembers.filter(
    (member) => isConnectorEligible(member.connectorStatus) && !excludeConnectorIds.includes(member.connectorId),
  );
  if (filtered.length === 0) {
    throw new ConnectorGroupOfflineError();
  }

  return { group: base.group, tenantName: base.tenant.name, members: filtered };
}

async function chooseRoundRobinMember(groupId: number, members: MemberRow[]): Promise<MemberRow> {
  const connectorIds = members.map((member) => member.connectorId);
  const [lastJob] = await db
    .select({ connectorId: connectorsTable.id })
    .from(connectorJobsTable)
    .innerJoin(connectorsTable, eq(connectorJobsTable.connectorId, connectorsTable.id))
    .where(inArray(connectorJobsTable.connectorId, connectorIds))
    .orderBy(desc(connectorJobsTable.createdAt))
    .limit(1);

  if (!lastJob) {
    return members[0]!;
  }
  const lastIndex = members.findIndex((member) => member.connectorId === lastJob.connectorId);
  if (lastIndex < 0) {
    return members[0]!;
  }
  return members[(lastIndex + 1) % members.length]!;
}

export async function resolveAvailableConnectorForGroup(
  groupId: number,
  excludeConnectorIds: number[] = [],
): Promise<{ connectorId: number; groupId: number; tenantId: number; strategy: ConnectorGroupStrategy }> {
  const { group, members } = await resolveAvailableMemberRows(groupId, excludeConnectorIds);
  const ordered = orderMembers(members, group.strategy as ConnectorGroupStrategy);
  if (ordered.length === 0) {
    throw new ConnectorGroupOfflineError();
  }

  const chosen =
    (group.strategy as ConnectorGroupStrategy) === "ROUND_ROBIN"
      ? await chooseRoundRobinMember(groupId, ordered)
      : ordered[0]!;

  return {
    connectorId: chosen.connectorId,
    groupId,
    tenantId: group.tenantId,
    strategy: group.strategy as ConnectorGroupStrategy,
  };
}
