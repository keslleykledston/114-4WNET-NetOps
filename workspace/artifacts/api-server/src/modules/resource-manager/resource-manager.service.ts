import { db } from "@workspace/db";
import { eq, and, lt, gte } from "drizzle-orm";

const resourcePoolsTable = (null as any);
const resourceAllocationsTable = (null as any);
const resourceReservationsTable = (null as any);

export async function allocate(
  poolId: number,
  resourceValue?: number,
  deviceId?: number,
  serviceRequestId?: number,
  allocatedBy: string = "system"
): Promise<{ id: number; poolId: number; value: number }> {
  // If resourceValue provided, allocate exactly that
  if (resourceValue !== undefined) {
    const existing = await db
      .select()
      .from(resourceAllocationsTable)
      .where(and(
        eq(resourceAllocationsTable.resourcePoolId, poolId),
        eq(resourceAllocationsTable.resourceValue, resourceValue)
      ));

    if (existing.length > 0) {
      throw new Error(`Resource ${resourceValue} already allocated in pool ${poolId}`);
    }

    const allocs = (await db
      .insert(resourceAllocationsTable)
      .values({
        resourcePoolId: poolId,
        resourceType: "UNKNOWN",
        resourceValue,
        status: "ALLOCATED",
        deviceId,
        serviceRequestId,
        allocatedBy,
      })
      .returning()) as any[];

    const alloc = allocs[0];
    return { id: alloc.id, poolId, value: resourceValue };
  }

  // Else find next available
  const next = await findNextAvailable(poolId);
  if (!next) throw new Error(`No resources available in pool ${poolId}`);

  const allocs = (await db
    .insert(resourceAllocationsTable)
    .values({
      resourcePoolId: poolId,
      resourceType: "UNKNOWN",
      resourceValue: next,
      status: "ALLOCATED",
      deviceId,
      serviceRequestId,
      allocatedBy,
    })
    .returning()) as any[];

  const alloc = allocs[0];
  return { id: alloc.id, poolId, value: next };
}

export async function findNextAvailable(poolId: number): Promise<number | null> {
  const pool = (await db.select().from(resourcePoolsTable).where(eq(resourcePoolsTable.id, poolId))) as any[];
  if (!pool.length) return null;

  const p = pool[0];
  const allocations = (await db
    .select({ value: resourceAllocationsTable.resourceValue })
    .from(resourceAllocationsTable)
    .where(
      and(
        eq(resourceAllocationsTable.resourcePoolId, poolId),
        eq(resourceAllocationsTable.status, "ALLOCATED")
      )
    )) as any[];

  const used = new Set(allocations.map((a) => a.value));
  for (let i = p.rangeStart; i <= p.rangeEnd; i++) {
    if (!used.has(i)) return i;
  }

  return null;
}

export async function reserve(
  poolId: number,
  resourceValue: number,
  expiresAt: Date,
  createdBy: string
): Promise<{ id: number }> {
  // Check if value already allocated
  const alloc = await db
    .select()
    .from(resourceAllocationsTable)
    .where(
      and(
        eq(resourceAllocationsTable.resourcePoolId, poolId),
        eq(resourceAllocationsTable.resourceValue, resourceValue),
        eq(resourceAllocationsTable.status, "ALLOCATED")
      )
    );

  if (alloc.length > 0) {
    throw new Error(`Resource ${resourceValue} already allocated`);
  }

  const ress = (await db
    .insert(resourceReservationsTable)
    .values({
      resourcePoolId: poolId,
      resourceValue,
      expiresAt,
      createdBy,
    })
    .returning()) as any[];

  const res = ress[0];
  return { id: res.id };
}

export async function release(allocationId: number, releasedBy: string = "system"): Promise<void> {
  await db
    .update(resourceAllocationsTable)
    .set({
      status: "RELEASED",
      releasedAt: new Date(),
    })
    .where(eq(resourceAllocationsTable.id, allocationId));
}

export async function validateAvailability(poolId: number, resourceValue: number): Promise<boolean> {
  const alloc = (await db
    .select()
    .from(resourceAllocationsTable)
    .where(
      and(
        eq(resourceAllocationsTable.resourcePoolId, poolId),
        eq(resourceAllocationsTable.resourceValue, resourceValue),
        eq(resourceAllocationsTable.status, "ALLOCATED")
      )
    )) as any[];

  return alloc.length === 0;
}

export async function getPoolUsage(poolId: number): Promise<{
  total: number;
  allocated: number;
  reserved: number;
  available: number;
}> {
  const pool = await db.select().from(resourcePoolsTable).where(eq(resourcePoolsTable.id, poolId));
  if (!pool.length) throw new Error(`Pool ${poolId} not found`);

  const p = pool[0];
  const total = p.rangeEnd - p.rangeStart + 1;

  const allocated = await db
    .select()
    .from(resourceAllocationsTable)
    .where(
      and(
        eq(resourceAllocationsTable.resourcePoolId, poolId),
        eq(resourceAllocationsTable.status, "ALLOCATED")
      )
    );

  const reserved = await db
    .select()
    .from(resourceReservationsTable)
    .where(
      and(
        eq(resourceReservationsTable.resourcePoolId, poolId),
        gte(resourceReservationsTable.expiresAt, new Date())
      )
    );

  return {
    total,
    allocated: allocated.length,
    reserved: reserved.length,
    available: total - allocated.length - reserved.length,
  };
}

export async function createPool(
  name: string,
  resourceType: string,
  rangeStart: number,
  rangeEnd: number,
  vendor?: string,
  tenantId?: number,
  siteId?: number,
  metadata?: Record<string, any>
): Promise<{ id: number }> {
  const pools = (await db
    .insert(resourcePoolsTable)
    .values({
      name,
      resourceType,
      vendor,
      tenantId,
      siteId,
      rangeStart,
      rangeEnd,
      metadataJson: metadata || {},
      enabled: true,
    })
    .returning()) as any[];

  const pool = pools[0];
  return { id: pool.id };
}

export async function listPools(resourceType?: string): Promise<any[]> {
  if (resourceType) {
    return db
      .select()
      .from(resourcePoolsTable)
      .where(eq(resourcePoolsTable.resourceType, resourceType));
  }
  return db.select().from(resourcePoolsTable);
}

export async function getAllocations(poolId?: number, status?: string): Promise<any[]> {
  let query = db.select().from(resourceAllocationsTable);

  if (poolId && status) {
    return query.where(
      and(
        eq(resourceAllocationsTable.resourcePoolId, poolId),
        eq(resourceAllocationsTable.status, status)
      )
    );
  }

  if (poolId) {
    return query.where(eq(resourceAllocationsTable.resourcePoolId, poolId));
  }

  if (status) {
    return query.where(eq(resourceAllocationsTable.status, status));
  }

  return query;
}

export async function searchAllocations(searchTerm: string): Promise<any[]> {
  const allocations = await getAllocations();
  return allocations.filter(
    (a) =>
      a.resourceValue?.toString().includes(searchTerm) ||
      a.resourceType?.toLowerCase().includes(searchTerm.toLowerCase())
  );
}

export async function getActiveReservations(poolId: number): Promise<any[]> {
  return db
    .select()
    .from(resourceReservationsTable)
    .where(
      and(
        eq(resourceReservationsTable.resourcePoolId, poolId),
        gte(resourceReservationsTable.expiresAt, new Date())
      )
    );
}

export async function cleanupExpiredReservations(): Promise<number> {
  const result = await db
    .delete(resourceReservationsTable)
    .where(lt(resourceReservationsTable.expiresAt, new Date()));

  return result.rowCount || 0;
}
