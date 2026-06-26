import { and, desc, eq, isNull } from "drizzle-orm";
import { db, topologyLayoutsTable } from "@workspace/db";

export type MapLayoutPosition = { x: number; y: number };

export type MapLayoutPayload = {
  devices: unknown[];
  links: unknown[];
  positions: Record<string, MapLayoutPosition>;
};

export type MapLayoutSummary = {
  id: number;
  name: string;
  isActive: boolean;
  updatedAt: string;
  createdAt: string;
};

export type MapLayoutDetail = MapLayoutSummary & {
  payload: MapLayoutPayload;
};

type Scope = { scopeType?: string; scopeId?: number | null };

function scopeWhere(scope: Scope) {
  const scopeType = scope.scopeType ?? "global";
  const scopeId = scope.scopeId ?? null;
  return scopeId == null
    ? and(eq(topologyLayoutsTable.scopeType, scopeType), isNull(topologyLayoutsTable.scopeId))
    : and(eq(topologyLayoutsTable.scopeType, scopeType), eq(topologyLayoutsTable.scopeId, scopeId));
}

function rowToSummary(row: typeof topologyLayoutsTable.$inferSelect): MapLayoutSummary {
  return {
    id: row.id,
    name: row.name,
    isActive: row.isActive,
    updatedAt: row.updatedAt?.toISOString() ?? new Date().toISOString(),
    createdAt: row.createdAt?.toISOString() ?? new Date().toISOString(),
  };
}

function normalizePayload(raw: unknown): MapLayoutPayload {
  const obj = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  return {
    devices: Array.isArray(obj.devices) ? obj.devices : [],
    links: Array.isArray(obj.links) ? obj.links : [],
    positions:
      obj.positions && typeof obj.positions === "object" && !Array.isArray(obj.positions)
        ? (obj.positions as Record<string, MapLayoutPosition>)
        : {},
  };
}

export async function listMapLayouts(scope: Scope = {}): Promise<MapLayoutSummary[]> {
  const rows = await db
    .select()
    .from(topologyLayoutsTable)
    .where(scopeWhere(scope))
    .orderBy(desc(topologyLayoutsTable.updatedAt));
  return rows.map(rowToSummary);
}

export async function getMapLayout(id: number): Promise<MapLayoutDetail | null> {
  const [row] = await db.select().from(topologyLayoutsTable).where(eq(topologyLayoutsTable.id, id));
  if (!row) return null;
  return {
    ...rowToSummary(row),
    payload: normalizePayload(row.payloadJson),
  };
}

export async function getActiveMapLayout(scope: Scope = {}): Promise<MapLayoutDetail | null> {
  const [row] = await db
    .select()
    .from(topologyLayoutsTable)
    .where(and(scopeWhere(scope), eq(topologyLayoutsTable.isActive, true)))
    .orderBy(desc(topologyLayoutsTable.updatedAt))
    .limit(1);
  if (!row) return null;
  return {
    ...rowToSummary(row),
    payload: normalizePayload(row.payloadJson),
  };
}

async function deactivateScopeLayouts(scope: Scope): Promise<void> {
  await db
    .update(topologyLayoutsTable)
    .set({ isActive: false, updatedAt: new Date() })
    .where(scopeWhere(scope));
}

export async function saveMapLayout(input: {
  id?: number;
  name: string;
  payload: MapLayoutPayload;
  setActive?: boolean;
  scopeType?: string;
  scopeId?: number | null;
}): Promise<MapLayoutDetail> {
  const scopeType = input.scopeType ?? "global";
  const scopeId = input.scopeId ?? null;
  const setActive = input.setActive ?? true;
  const now = new Date();

  if (input.id != null) {
    if (setActive) {
      await deactivateScopeLayouts({ scopeType, scopeId });
    }
    const [updated] = await db
      .update(topologyLayoutsTable)
      .set({
        name: input.name,
        payloadJson: input.payload,
        updatedAt: now,
        isActive: setActive,
      })
      .where(eq(topologyLayoutsTable.id, input.id))
      .returning();
    if (!updated) throw new Error("Layout not found");
    const detail = await getMapLayout(updated.id);
    if (!detail) throw new Error("Layout not found after save");
    return detail;
  }

  const existing = await db
    .select()
    .from(topologyLayoutsTable)
    .where(
      and(
        eq(topologyLayoutsTable.name, input.name),
        eq(topologyLayoutsTable.scopeType, scopeType),
        scopeId == null
          ? isNull(topologyLayoutsTable.scopeId)
          : eq(topologyLayoutsTable.scopeId, scopeId),
      ),
    );

  if (existing.length > 0) {
    return saveMapLayout({
      id: existing[0].id,
      name: input.name,
      payload: input.payload,
      setActive,
      scopeType,
      scopeId,
    });
  }

  if (setActive) {
    await deactivateScopeLayouts({ scopeType, scopeId });
  }

  const [inserted] = await db
    .insert(topologyLayoutsTable)
    .values({
      name: input.name,
      scopeType,
      scopeId,
      isActive: setActive,
      payloadJson: input.payload,
      createdAt: now,
      updatedAt: now,
    })
    .returning();

  const detail = await getMapLayout(inserted.id);
  if (!detail) throw new Error("Layout not found after create");
  return detail;
}

export async function activateMapLayout(id: number): Promise<MapLayoutDetail | null> {
  const [row] = await db.select().from(topologyLayoutsTable).where(eq(topologyLayoutsTable.id, id));
  if (!row) return null;
  await deactivateScopeLayouts({ scopeType: row.scopeType, scopeId: row.scopeId });
  await db
    .update(topologyLayoutsTable)
    .set({ isActive: true, updatedAt: new Date() })
    .where(eq(topologyLayoutsTable.id, id));
  return getMapLayout(id);
}
