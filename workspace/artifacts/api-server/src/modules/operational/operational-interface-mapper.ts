import type { SnmpCollectedInterface } from "../netops/snmp/types.js";
import type { FreshnessStatus } from "./freshness.js";
import { freshnessExpiresAt } from "./freshness.js";

export type OperationalInterfaceInsertRow = {
  deviceId: number;
  collectionJobId: number;
  ifIndex: number;
  ifName: string;
  ifDescr: string | null;
  ifAlias: string | null;
  adminStatus: string;
  operStatus: string;
  ifHighSpeedMbps: number | null;
  ifSpeedBps: number | null;
  ifLastChangeTicks: number | null;
  hcInOctets: bigint | null;
  hcOutOctets: bigint | null;
  source: string;
  collectedAt: Date;
  freshnessStatus: FreshnessStatus;
  freshnessExpiresAt: Date;
};

/** Map SNMP IF-MIB row to operational_interfaces insert (no secrets). */
export function mapSnmpInterfaceToOperationalRow(
  deviceId: number,
  jobId: number,
  iface: SnmpCollectedInterface,
  collectedAt: Date,
  freshnessStatus: FreshnessStatus,
): OperationalInterfaceInsertRow {
  return {
    deviceId,
    collectionJobId: jobId,
    ifIndex: iface.ifIndex,
    ifName: iface.name,
    ifDescr: iface.rawDescr,
    ifAlias: iface.alias,
    adminStatus: iface.adminStatus,
    operStatus: iface.operStatus,
    ifHighSpeedMbps: iface.highSpeedMbps,
    ifSpeedBps: iface.speed,
    ifLastChangeTicks: iface.lastChangeTicks,
    hcInOctets: iface.inOctets != null ? BigInt(iface.inOctets) : null,
    hcOutOctets: iface.outOctets != null ? BigInt(iface.outOctets) : null,
    source: "snmp",
    collectedAt,
    freshnessStatus,
    freshnessExpiresAt: freshnessExpiresAt(collectedAt),
  };
}
