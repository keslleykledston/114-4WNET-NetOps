import { copilotEntitiesTable, copilotLearnedAliasesTable, db } from "@workspace/db";
import { and, desc, eq, sql } from "drizzle-orm";

export async function listCopilotAliasesByStatus(tenantId: number, status?: string) {
  const filters = [eq(copilotLearnedAliasesTable.tenantId, tenantId)];
  if (status && status !== "all") {
    filters.push(eq(copilotLearnedAliasesTable.status, status));
  }

  return db
    .select()
    .from(copilotLearnedAliasesTable)
    .where(and(...filters))
    .orderBy(desc(copilotLearnedAliasesTable.updatedAt))
    .limit(100);
}

export async function getCopilotAliasStats(tenantId: number) {
  const rows = await db
    .select({
      status: copilotLearnedAliasesTable.status,
      count: sql<number>`count(*)::int`,
    })
    .from(copilotLearnedAliasesTable)
    .where(eq(copilotLearnedAliasesTable.tenantId, tenantId))
    .groupBy(copilotLearnedAliasesTable.status);

  const stats = { pending: 0, approved: 0, rejected: 0, total: 0 };
  for (const row of rows) {
    const key = row.status as keyof typeof stats;
    if (key in stats && key !== "total") {
      stats[key] = row.count;
    }
    stats.total += row.count;
  }
  return stats;
}

export async function listPendingCopilotAliases(tenantId: number) {
  return db
    .select()
    .from(copilotLearnedAliasesTable)
    .where(and(
      eq(copilotLearnedAliasesTable.tenantId, tenantId),
      eq(copilotLearnedAliasesTable.status, "pending"),
    ))
    .orderBy(desc(copilotLearnedAliasesTable.createdAt))
    .limit(50);
}

export async function proposeCopilotAlias(input: {
  tenantId: number;
  alias: string;
  entityType: string;
  canonicalName: string;
  entityId?: number | null;
  confidence?: number;
  createdBy?: number | null;
}) {
  const [row] = await db
    .insert(copilotLearnedAliasesTable)
    .values({
      tenantId: input.tenantId,
      alias: input.alias.trim().toLowerCase(),
      entityType: input.entityType,
      entityId: input.entityId ?? null,
      canonicalName: input.canonicalName,
      confidence: input.confidence ?? 0.7,
      status: "pending",
      createdBy: input.createdBy ?? null,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [copilotLearnedAliasesTable.tenantId, copilotLearnedAliasesTable.alias],
      set: {
        entityType: input.entityType,
        canonicalName: input.canonicalName,
        confidence: input.confidence ?? 0.7,
        status: "pending",
        updatedAt: new Date(),
      },
    })
    .returning();

  return row!;
}

export async function approveCopilotAlias(input: {
  aliasId: number;
  tenantId: number;
  approvedBy: number;
}) {
  const [alias] = await db
    .select()
    .from(copilotLearnedAliasesTable)
    .where(and(
      eq(copilotLearnedAliasesTable.id, input.aliasId),
      eq(copilotLearnedAliasesTable.tenantId, input.tenantId),
    ))
    .limit(1);

  if (!alias) return null;

  const [updated] = await db
    .update(copilotLearnedAliasesTable)
    .set({
      status: "approved",
      approvedBy: input.approvedBy,
      updatedAt: new Date(),
    })
    .where(eq(copilotLearnedAliasesTable.id, alias.id))
    .returning();

  if (alias.canonicalName && alias.entityType) {
    const [entity] = await db
      .select()
      .from(copilotEntitiesTable)
      .where(and(
        eq(copilotEntitiesTable.tenantId, input.tenantId),
        eq(copilotEntitiesTable.entityType, alias.entityType),
        eq(copilotEntitiesTable.canonicalName, alias.canonicalName),
      ))
      .limit(1);

    if (entity) {
      const aliases = new Set([...(entity.aliases ?? []), alias.alias]);
      await db
        .update(copilotEntitiesTable)
        .set({ aliases: [...aliases], updatedAt: new Date() })
        .where(eq(copilotEntitiesTable.id, entity.id));
    }
  }

  return updated ?? null;
}

export async function rejectCopilotAlias(input: {
  aliasId: number;
  tenantId: number;
  approvedBy: number;
}) {
  const [updated] = await db
    .update(copilotLearnedAliasesTable)
    .set({
      status: "rejected",
      approvedBy: input.approvedBy,
      updatedAt: new Date(),
    })
    .where(and(
      eq(copilotLearnedAliasesTable.id, input.aliasId),
      eq(copilotLearnedAliasesTable.tenantId, input.tenantId),
    ))
    .returning();

  return updated ?? null;
}
