import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const snmp = require("net-snmp") as {
  Version2c: number;
  createSession: (target: string, community: string, options?: Record<string, unknown>) => SnmpSession;
};

interface SnmpSession {
  close: () => void;
  tableColumns: (
    oid: string,
    columns: number[],
    maxRepetitions: number,
    callback: (error: Error | null, table?: Record<string, Record<string, unknown>>) => void,
  ) => void;
}

interface SnmpDevice {
  id: number;
  hostname: string;
  ipAddress: string;
  vendor: string;
  platform: string;
  snmpCommunity: string;
}

export interface SnmpInterfaceSnapshot {
  index: string;
  name: string;
  description: string | null;
  alias: string | null;
  adminStatus: string;
  operStatus: string;
  speedBps: number | null;
  vrfName: string | null;
}

export interface SnmpBgpPeerSnapshot {
  peerKey: string;
  remoteAddress: string;
  remoteAs: number | null;
  state: string;
  vrfName: string | null;
}

export interface SnmpVrfSnapshot {
  name: string;
}

export interface SnmpCollectionResult {
  success: boolean;
  errorMessage: string | null;
  interfaces: SnmpInterfaceSnapshot[];
  bgpPeers: SnmpBgpPeerSnapshot[];
  vrfs: SnmpVrfSnapshot[];
}

const IF_TABLE_OID = "1.3.6.1.2.1.2.2.1";
const IF_X_TABLE_OID = "1.3.6.1.2.1.31.1.1.1";
const HUAWEI_BGP_PEER_VRF_OID = "1.3.6.1.4.1.2011.5.25.177.1.1.1";
const HUAWEI_BGP_PEER_OID = "1.3.6.1.4.1.2011.5.25.177.1.1.2";

export async function collectSnmpSnapshot(device: SnmpDevice): Promise<SnmpCollectionResult> {
  const session = snmp.createSession(device.ipAddress, device.snmpCommunity, {
    version: snmp.Version2c,
    timeout: 5000,
    retries: 1,
    idBitsSize: 32,
  });

  try {
    const [ifTable, ifXTable] = await Promise.all([
      tableColumns(session, IF_TABLE_OID, [2, 5, 7, 8]),
      tableColumns(session, IF_X_TABLE_OID, [1, 18]),
    ]);

    const interfaces = buildInterfaces(ifTable, ifXTable);
    const bgpPeers = device.vendor === "huawei" || device.platform === "vrp"
      ? await buildHuaweiBgpPeers(session)
      : [];
    const vrfs = Array.from(
      new Set(
        bgpPeers
          .map((peer) => peer.vrfName)
          .filter((vrfName): vrfName is string => Boolean(vrfName)),
      ),
    ).map((name) => ({ name }));

    return {
      success: true,
      errorMessage: null,
      interfaces,
      bgpPeers,
      vrfs,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "SNMP collection failed";
    return {
      success: false,
      errorMessage: message,
      interfaces: [],
      bgpPeers: [],
      vrfs: [],
    };
  } finally {
    session.close();
  }
}

function tableColumns(
  session: SnmpSession,
  oid: string,
  columns: number[],
): Promise<Record<string, Record<string, unknown>>> {
  return new Promise((resolve, reject) => {
    session.tableColumns(oid, columns, 20, (error, table) => {
      if (error) {
        reject(error);
        return;
      }

      resolve(table ?? {});
    });
  });
}

function buildInterfaces(
  ifTable: Record<string, Record<string, unknown>>,
  ifXTable: Record<string, Record<string, unknown>>,
): SnmpInterfaceSnapshot[] {
  return Object.keys(ifTable)
    .sort(compareSnmpKeys)
    .map((index) => {
      const row = ifTable[index] ?? {};
      const extRow = ifXTable[index] ?? {};

      const description = decodeString(row["2"]);
      const ifName = decodeString(extRow["1"]);
      const alias = decodeString(extRow["18"]);

      return {
        index,
        name: ifName ?? description ?? `ifIndex-${index}`,
        description,
        alias,
        adminStatus: mapInterfaceState(row["7"]),
        operStatus: mapInterfaceState(row["8"]),
        speedBps: toNumber(row["5"]),
        vrfName: null,
      };
    });
}

async function buildHuaweiBgpPeers(session: SnmpSession): Promise<SnmpBgpPeerSnapshot[]> {
  const [peerVrfTable, peerTable] = await Promise.all([
    tableColumns(session, HUAWEI_BGP_PEER_VRF_OID, [6]),
    tableColumns(session, HUAWEI_BGP_PEER_OID, [2, 4, 5]),
  ]);

  return Object.keys(peerTable)
    .sort(compareSnmpKeys)
    .map((peerKey) => {
      const peerRow = peerTable[peerKey] ?? {};
      const vrfRow = peerVrfTable[peerKey] ?? {};

      return {
        peerKey,
        remoteAddress: decodeAddress(peerRow["4"]) ?? peerKey,
        remoteAs: toNumber(peerRow["2"]),
        state: mapHuaweiBgpState(peerRow["5"]),
        vrfName: decodeString(vrfRow["6"]),
      };
    });
}

function compareSnmpKeys(left: string, right: string): number {
  const leftParts = left.split(".").map((value) => Number(value));
  const rightParts = right.split(".").map((value) => Number(value));
  const maxLength = Math.max(leftParts.length, rightParts.length);

  for (let index = 0; index < maxLength; index += 1) {
    const leftValue = leftParts[index] ?? -1;
    const rightValue = rightParts[index] ?? -1;
    if (leftValue !== rightValue) {
      return leftValue - rightValue;
    }
  }

  return 0;
}

function decodeString(value: unknown): string | null {
  if (value == null) return null;
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }
  if (Buffer.isBuffer(value)) {
    const utf8 = value.toString("utf8").replace(/\0/g, "").trim();
    return utf8.length > 0 ? utf8 : null;
  }
  return String(value);
}

function decodeAddress(value: unknown): string | null {
  if (value == null) return null;
  if (typeof value === "string") return value;
  if (!Buffer.isBuffer(value)) return String(value);
  if (value.length === 4) return Array.from(value.values()).join(".");
  if (value.length === 16) {
    const groups: string[] = [];
    for (let index = 0; index < value.length; index += 2) {
      groups.push(value.readUInt16BE(index).toString(16));
    }
    return groups.join(":");
  }
  return value.toString("hex");
}

function toNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function mapInterfaceState(value: unknown): string {
  switch (toNumber(value)) {
    case 1:
      return "up";
    case 2:
      return "down";
    case 3:
      return "testing";
    default:
      return "unknown";
  }
}

function mapHuaweiBgpState(value: unknown): string {
  switch (toNumber(value)) {
    case 1:
      return "idle";
    case 2:
      return "connect";
    case 3:
      return "active";
    case 4:
      return "opensent";
    case 5:
      return "openconfirm";
    case 6:
      return "established";
    case 9:
      return "noneg";
    default:
      return "unknown";
  }
}
