import { and, desc, eq, sql } from "drizzle-orm";
import {
  changePlanDiffsTable,
  changePlanItemsTable,
  changePlanSnapshotsTable,
  changePlansTable,
  db,
  devicesTable,
} from "@workspace/db";
import { logAuditEvent } from "../../lib/audit.js";
import { computeChangeDiff } from "./change-plans.diff-engine.js";
import { buildChangePlanJson, buildChangePlanMarkdown } from "./change-plans.markdown.js";
import type {
  ChangeDiffResult,
  ChangePlanCreateInput,
  ChangePlanDetail,
  ChangePlanExportResponse,
  ChangePlanItemRecord,
  ChangePlanListQuery,
  ChangePlanRollbackDocument,
  ChangePlanSnapshotPayload,
  ChangePlanStatus,
  ChangePlanSummary,
} from "./change-plans.types.js";

function mapItemRow(row: typeof changePlanItemsTable.$inferSelect): ChangePlanItemRecord {
  return {
    id: row.id,
    itemType: row.itemType,
    itemName: row.itemName,
    classification: row.classification as ChangePlanItemRecord["classification"],
    usageCount: row.usageCount,
    willBeRemoved: row.willBeRemoved,
    reason: row.reason,
    users: (row.usersJson as ChangePlanItemRecord["users"]) ?? [],
    metadata: (row.metadataJson as Record<string, unknown>) ?? {},
  };
}

function resolveStatus(input: ChangePlanCreateInput): ChangePlanStatus {
  if (!input.rollback.valid) return "invalid";
  if (input.snapshot.impact.recommendation === "skip") return "invalid";
  return "valid";
}

function summaryFromRow(row: typeof changePlansTable.$inferSelect, hostname: string | null): ChangePlanSummary {
  const metadata = (row.metadataJson as Record<string, unknown>) ?? {};
  return {
    id: row.id,
    module: row.module as ChangePlanSummary["module"],
    changeType: row.changeType,
    deviceId: row.deviceId,
    hostname,
    status: row.status as ChangePlanStatus,
    createdBy: row.createdBy ?? null,
    ticketRef: row.ticketRef ?? null,
    sourceObjectType: row.sourceObjectType ?? null,
    sourceObjectId: row.sourceObjectId ?? null,
    metadata,
    createdAt: row.createdAt?.toISOString() ?? new Date().toISOString(),
    updatedAt: row.updatedAt?.toISOString() ?? new Date().toISOString(),
    peerIp: typeof metadata.peerIp === "string" ? metadata.peerIp : null,
    recommendation: typeof metadata.recommendation === "string" ? metadata.recommendation : null,
    riskLevel: typeof metadata.riskLevel === "string" ? metadata.riskLevel : null,
  };
}

async function loadHostname(deviceId: number): Promise<string | null> {
  const [device] = await db.select({ hostname: devicesTable.hostname }).from(devicesTable).where(eq(devicesTable.id, deviceId)).limit(1);
  return device?.hostname ?? null;
}

export async function createChangePlan(input: ChangePlanCreateInput): Promise<ChangePlanDetail> {
  const status = input.statusOverride ?? resolveStatus(input);
  const diff = computeChangeDiff({
    beforeState: input.beforeState,
    afterState: input.afterState,
  });

  const [planRow] = await db.insert(changePlansTable).values({
    module: input.module,
    changeType: input.changeType,
    deviceId: input.deviceId,
    createdBy: input.createdBy ?? null,
    status,
    ticketRef: input.ticketRef ?? null,
    sourceObjectType: input.sourceObjectType ?? null,
    sourceObjectId: input.sourceObjectId ?? null,
    metadataJson: {
      ...(input.metadata ?? {}),
      hostname: input.hostname ?? null,
    },
  }).returning();

  if (!planRow) throw new Error("Failed to persist change plan");

  await db.insert(changePlanSnapshotsTable).values({
    changePlanId: planRow.id,
    snapshotJson: input.snapshot,
  });

  if (input.items.length > 0) {
    await db.insert(changePlanItemsTable).values(
      input.items.map((item) => ({
        changePlanId: planRow.id,
        itemType: item.itemType,
        itemName: item.itemName,
        classification: item.classification,
        usageCount: item.usageCount,
        willBeRemoved: item.willBeRemoved,
        reason: item.reason ?? null,
        usersJson: item.users,
        metadataJson: item.metadata ?? {},
      })),
    );
  }

  await db.insert(changePlanDiffsTable).values({
    changePlanId: planRow.id,
    beforeJson: input.beforeState,
    afterJson: input.afterState,
    rollbackJson: input.rollback,
    diffJson: diff,
  });

  const detail = await getChangePlanById(planRow.id);
  if (!detail) throw new Error("Failed to load persisted change plan");
  return detail;
}

export async function getChangePlanById(id: number): Promise<ChangePlanDetail | null> {
  const [planRow] = await db.select().from(changePlansTable).where(eq(changePlansTable.id, id)).limit(1);
  if (!planRow) return null;

  const [snapshotRow] = await db
    .select()
    .from(changePlanSnapshotsTable)
    .where(eq(changePlanSnapshotsTable.changePlanId, id))
    .orderBy(desc(changePlanSnapshotsTable.createdAt))
    .limit(1);

  const [diffRow] = await db
    .select()
    .from(changePlanDiffsTable)
    .where(eq(changePlanDiffsTable.changePlanId, id))
    .orderBy(desc(changePlanDiffsTable.createdAt))
    .limit(1);

  const itemRows = await db
    .select()
    .from(changePlanItemsTable)
    .where(eq(changePlanItemsTable.changePlanId, id))
    .orderBy(changePlanItemsTable.id);

  const hostname = await loadHostname(planRow.deviceId);
  const summary = summaryFromRow(planRow, hostname);

  return {
    ...summary,
    snapshot: (snapshotRow?.snapshotJson as ChangePlanSnapshotPayload) ?? {
      deviceId: planRow.deviceId,
      hostname,
      timestamp: summary.createdAt,
      routePolicies: [],
      prefixLists: [],
      ipv6PrefixLists: [],
      communityFilters: [],
      communityLists: [],
      asPathFilters: [],
      extcommunityFilters: [],
      globalPreserved: [],
      suggestedScript: [],
      suggestedRollback: { valid: false, script: [], steps: [], dependencies: [], warnings: [] },
      validations: { before: [], after: [] },
      findings: [],
      impact: { recommendation: "skip", riskLevel: "high", blockedReasons: [], warnings: [] },
      sourceModule: planRow.module as ChangePlanSnapshotPayload["sourceModule"],
    },
    items: itemRows.map(mapItemRow),
    diff: (diffRow?.diffJson as ChangeDiffResult) ?? computeChangeDiff({ beforeState: {}, afterState: {} }),
    rollback: (diffRow?.rollbackJson as ChangePlanRollbackDocument) ?? { valid: false, script: [], steps: [], dependencies: [], warnings: [] },
    beforeState: (diffRow?.beforeJson as Record<string, unknown[]>) ?? {},
    afterState: (diffRow?.afterJson as Record<string, unknown[]>) ?? {},
  };
}

export async function listChangePlans(query: ChangePlanListQuery = {}): Promise<{ items: ChangePlanSummary[]; total: number }> {
  const limit = Math.min(Math.max(query.limit ?? 50, 1), 200);
  const offset = Math.max(query.offset ?? 0, 0);
  const filters = [];

  if (query.module) filters.push(eq(changePlansTable.module, query.module));
  if (query.deviceId) filters.push(eq(changePlansTable.deviceId, query.deviceId));
  if (query.status) filters.push(eq(changePlansTable.status, query.status));
  if (query.peerIp) {
    filters.push(sql`${changePlansTable.metadataJson}->>'peerIp' = ${query.peerIp}`);
  }
  if (query.sourceObjectType) {
    filters.push(eq(changePlansTable.sourceObjectType, query.sourceObjectType));
  }
  if (query.sourceObjectId) {
    filters.push(eq(changePlansTable.sourceObjectId, query.sourceObjectId));
  }

  const whereClause = filters.length ? and(...filters) : undefined;

  const rows = await db
    .select()
    .from(changePlansTable)
    .where(whereClause)
    .orderBy(desc(changePlansTable.createdAt))
    .limit(limit)
    .offset(offset);

  const [countRow] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(changePlansTable)
    .where(whereClause);

  const hostnames = new Map<number, string>();
  for (const row of rows) {
    if (!hostnames.has(row.deviceId)) hostnames.set(row.deviceId, (await loadHostname(row.deviceId)) ?? "");
  }

  return {
    items: rows.map((row) => summaryFromRow(row, hostnames.get(row.deviceId) || null)),
    total: countRow?.total ?? rows.length,
  };
}

export async function getChangePlanDiff(id: number): Promise<ChangeDiffResult | null> {
  const plan = await getChangePlanById(id);
  return plan?.diff ?? null;
}

export async function exportChangePlan(input: {
  id: number;
  format?: "markdown" | "json";
  sourceIp?: string | null;
  actorLabel?: string | null;
}): Promise<ChangePlanExportResponse | "not_found" | "invalid"> {
  const plan = await getChangePlanById(input.id);
  if (!plan) return "not_found";
  if (plan.status === "invalid") return "invalid";

  const format = input.format ?? "markdown";
  const content = format === "json" ? buildChangePlanJson(plan) : buildChangePlanMarkdown(plan);
  const exportedAt = new Date().toISOString();

  await db.update(changePlansTable)
    .set({ status: "exported", updatedAt: new Date() })
    .where(eq(changePlansTable.id, input.id));

  await logAuditEvent({
    action: "change_plan_exported",
    objectType: "change_plan",
    objectId: String(input.id),
    metadata: {
      module: plan.module,
      deviceId: plan.deviceId,
      format,
      peerIp: plan.peerIp ?? null,
    },
    sourceIp: input.sourceIp ?? undefined,
  });

  return {
    changePlanId: plan.id,
    format,
    content,
    exportedAt,
    status: "exported",
  };
}

export async function auditChangePlanEvent(input: {
  action: "change_plan_created" | "change_plan_updated" | "change_plan_viewed" | "change_plan_closed";
  changePlanId: number;
  module: string;
  deviceId: number;
  metadata?: Record<string, unknown>;
  sourceIp?: string | null;
}) {
  await logAuditEvent({
    action: input.action,
    objectType: "change_plan",
    objectId: String(input.changePlanId),
    metadata: {
      module: input.module,
      deviceId: input.deviceId,
      ...(input.metadata ?? {}),
    },
    sourceIp: input.sourceIp ?? undefined,
  });
}

export async function closeChangePlan(id: number, sourceIp?: string | null): Promise<ChangePlanDetail | null> {
  const plan = await getChangePlanById(id);
  if (!plan) return null;

  await db.update(changePlansTable)
    .set({ status: "closed", updatedAt: new Date() })
    .where(eq(changePlansTable.id, id));

  await auditChangePlanEvent({
    action: "change_plan_closed",
    changePlanId: id,
    module: plan.module,
    deviceId: plan.deviceId,
    sourceIp,
  });

  return getChangePlanById(id);
}

export async function recordChangePlanViewed(id: number, sourceIp?: string | null): Promise<void> {
  const plan = await getChangePlanById(id);
  if (!plan) return;
  await auditChangePlanEvent({
    action: "change_plan_viewed",
    changePlanId: id,
    module: plan.module,
    deviceId: plan.deviceId,
    metadata: { peerIp: plan.peerIp ?? null },
    sourceIp,
  });
}
