import { db, devicesTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";

const resourceAllocationsTable = (null as any);

export interface CollisionDetectionResult {
  type: "VLAN" | "VC_ID" | "RD" | "RT" | "LOOPBACK" | "SERVICE_ID";
  value: number | string;
  devices: string[];
  services: string[];
  severity: "WARNING" | "CRITICAL";
  message: string;
}

export async function detectResourceCollisions(): Promise<CollisionDetectionResult[]> {
  const collisions: CollisionDetectionResult[] = [];

  try {
    // Get all allocations
    const allocations = await db
      .select()
      .from(resourceAllocationsTable)
      .where(eq(resourceAllocationsTable.status, "ALLOCATED"));

    // Group by resource type + value to find duplicates
    const grouped = new Map<string, typeof allocations>();
    for (const alloc of allocations) {
      const key = `${alloc.resourceType}:${alloc.resourceValue}`;
      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key)!.push(alloc);
    }

    // Check for duplicates
    for (const [key, group] of grouped) {
      if (group.length > 1) {
        const [type, value] = key.split(":");
        const devices: string[] = [];
        const services: string[] = [];

        for (const alloc of group) {
          if (alloc.deviceId) {
            const device = await db
              .select({ hostname: devicesTable.hostname })
              .from(devicesTable)
              .where(eq(devicesTable.id, alloc.deviceId));
            if (device.length) devices.push(device[0].hostname);
          }
          if (alloc.serviceRequestId) {
            services.push(`SR-${alloc.serviceRequestId}`);
          }
        }

        collisions.push({
          type: type as any,
          value: isNaN(Number(value)) ? value : Number(value),
          devices,
          services,
          severity: "CRITICAL",
          message: `Duplicate ${type} ${value} found in ${devices.length} devices`,
        });
      }
    }
  } catch (err) {
    console.error("Error detecting collisions:", err);
  }

  return collisions;
}

export async function checkVlanConflict(vlanId: number, siteId?: number): Promise<boolean> {
  const allocations = await db
    .select()
    .from(resourceAllocationsTable)
    .where(
      and(
        eq(resourceAllocationsTable.resourceType, "VLAN"),
        eq(resourceAllocationsTable.resourceValue, vlanId),
        eq(resourceAllocationsTable.status, "ALLOCATED")
      )
    );

  return allocations.length > 1;
}

export async function checkVCIdConflict(vcId: number): Promise<boolean> {
  const allocations = await db
    .select()
    .from(resourceAllocationsTable)
    .where(
      and(
        eq(resourceAllocationsTable.resourceType, "VC_ID"),
        eq(resourceAllocationsTable.resourceValue, vcId),
        eq(resourceAllocationsTable.status, "ALLOCATED")
      )
    );

  return allocations.length > 1;
}

export async function checkRDConflict(rd: string): Promise<boolean> {
  const allocations = await db
    .select()
    .from(resourceAllocationsTable)
    .where(
      and(
        eq(resourceAllocationsTable.resourceType, "RD"),
        eq(resourceAllocationsTable.resourceValue, rd),
        eq(resourceAllocationsTable.status, "ALLOCATED")
      )
    );

  return allocations.length > 1;
}

export async function checkRTConflict(rt: string): Promise<boolean> {
  const allocations = await db
    .select()
    .from(resourceAllocationsTable)
    .where(
      and(
        eq(resourceAllocationsTable.resourceType, "RT"),
        eq(resourceAllocationsTable.resourceValue, rt),
        eq(resourceAllocationsTable.status, "ALLOCATED")
      )
    );

  return allocations.length > 1;
}

export async function logCollisionEvent(
  collision: CollisionDetectionResult,
  detectedBy: string
): Promise<void> {
  // Log to audit trail
  console.log(
    `[COLLISION] Type: ${collision.type}, Value: ${collision.value}, Severity: ${collision.severity}`
  );
}

export async function generateCollisionReport(): Promise<CollisionDetectionResult[]> {
  return detectResourceCollisions();
}
