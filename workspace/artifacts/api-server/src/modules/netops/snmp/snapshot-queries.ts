import { db, snmpSnapshotsTable } from "@workspace/db";
import { and, desc, eq, inArray } from "drizzle-orm";

/** Collectors that represent real SNMP walks (exclude ssh_bundle / ssh config mirrors). */
export const SNMP_COLLECTOR_IDS = ["snmp"] as const;

export async function getLatestSnmpCollectorSnapshot(deviceId: number) {
  const [snapshot] = await db
    .select()
    .from(snmpSnapshotsTable)
    .where(and(
      eq(snmpSnapshotsTable.deviceId, deviceId),
      inArray(snmpSnapshotsTable.collector, [...SNMP_COLLECTOR_IDS]),
    ))
    .orderBy(desc(snmpSnapshotsTable.collectedAt))
    .limit(1);

  return snapshot ?? null;
}
