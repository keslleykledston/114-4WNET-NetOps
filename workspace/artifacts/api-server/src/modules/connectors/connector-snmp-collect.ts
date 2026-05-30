import type { Device } from "@workspace/db";
import type { SnmpCollectedBgpPeer, SnmpCollectedInterface, SnmpReadonlyCollectPayload } from "../netops/snmp/types.js";
import { BGP_STATE_BY_CODE, IF_ADMIN_STATUS, IF_OPER_STATUS, SNMP_OIDS } from "../netops/snmp/oids.js";
import { decodeSnmpAddress, peerIpFromIndex, toSnmpNumber } from "../netops/snmp/snmp-session.js";
import { executeSnmpGet, executeSnmpWalk } from "./connector-execution.service.js";

const IF_DESCR_OID = "1.3.6.1.2.1.2.2.1.2";
const IF_ADMIN_OID = "1.3.6.1.2.1.2.2.1.7";
const IF_OPER_OID = "1.3.6.1.2.1.2.2.1.8";
const IF_NAME_OID = "1.3.6.1.2.1.31.1.1.1.1";

function parseSnmpWalkLines(stdout: string): Map<string, string> {
  const values = new Map<string, string>();
  for (const line of stdout.split("\n")) {
    const match = line.match(/^([^=\s]+)\s*=\s*(?:[\w-]+:\s*)?(.+)$/);
    if (!match) continue;
    const oid = match[1].trim();
    let value = match[2].trim();
    if (value.startsWith('"') && value.endsWith('"')) {
      value = value.slice(1, -1);
    }
    values.set(oid, value);
  }
  return values;
}

function indexFromSuffix(oid: string, baseOid: string): number | null {
  if (!oid.startsWith(`${baseOid}.`)) return null;
  const index = Number(oid.slice(baseOid.length + 1));
  return Number.isInteger(index) && index > 0 ? index : null;
}

function mapStatus(code: string | undefined, table: Record<number, string>): string {
  const numeric = Number(code);
  return table[numeric] ?? (code ? `unknown(${code})` : "unknown");
}

export async function collectSnmpInterfacesViaConnector(
  device: Device,
  community: string,
): Promise<{
  success: boolean;
  errorMessage: string | null;
  errorCode: string | null;
  ifMibSkipped: boolean;
  preflightElapsedMs: number | null;
  errors: string[];
  warnings: string[];
  interfaces: SnmpCollectedInterface[];
  collectedAt: string;
  source: "snmp";
}> {
  const collectedAt = new Date().toISOString();
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!device.connectorId) {
    return {
      success: false,
      errorMessage: "Device has no connector_id",
      errorCode: "NO_CONNECTOR",
      ifMibSkipped: true,
      preflightElapsedMs: null,
      errors: ["Device has no connector_id"],
      warnings: [],
      interfaces: [],
      collectedAt,
      source: "snmp",
    };
  }

  const preflightStarted = Date.now();
  const sysName = await executeSnmpGet({
    deviceId: device.id,
    connectorId: device.connectorId,
    targetIp: device.ipAddress,
    oid: "1.3.6.1.2.1.1.5.0",
    community,
  });
  const preflightElapsedMs = Date.now() - preflightStarted;

  if (!sysName.success) {
    const summary = sysName.stderr || "SNMP preflight failed via connector";
    return {
      success: false,
      errorMessage: summary,
      errorCode: "SNMP_PREFLIGHT_FAILED",
      ifMibSkipped: true,
      preflightElapsedMs,
      errors: [summary],
      warnings: [],
      interfaces: [],
      collectedAt,
      source: "snmp",
    };
  }

  const descrWalk = await executeSnmpWalk({
    deviceId: device.id,
    connectorId: device.connectorId,
    targetIp: device.ipAddress,
    oid: IF_DESCR_OID,
    community,
    timeoutSeconds: 120,
  });

  if (!descrWalk.success) {
    const summary = descrWalk.stderr || "IF-MIB walk failed via connector";
    return {
      success: false,
      errorMessage: summary,
      errorCode: "IF_MIB_WALK_FAILED",
      ifMibSkipped: true,
      preflightElapsedMs,
      errors: [summary],
      warnings: [],
      interfaces: [],
      collectedAt,
      source: "snmp",
    };
  }

  const [adminWalk, operWalk, nameWalk] = await Promise.all([
    executeSnmpWalk({
      deviceId: device.id,
      connectorId: device.connectorId,
      targetIp: device.ipAddress,
      oid: IF_ADMIN_OID,
      community,
      timeoutSeconds: 120,
    }),
    executeSnmpWalk({
      deviceId: device.id,
      connectorId: device.connectorId,
      targetIp: device.ipAddress,
      oid: IF_OPER_OID,
      community,
      timeoutSeconds: 120,
    }),
    executeSnmpWalk({
      deviceId: device.id,
      connectorId: device.connectorId,
      targetIp: device.ipAddress,
      oid: IF_NAME_OID,
      community,
      timeoutSeconds: 120,
    }),
  ]);

  const descrMap = parseSnmpWalkLines(descrWalk.stdout);
  const adminMap = parseSnmpWalkLines(adminWalk.stdout);
  const operMap = parseSnmpWalkLines(operWalk.stdout);
  const nameMap = parseSnmpWalkLines(nameWalk.stdout);

  const indices = new Set<number>();
  for (const oid of descrMap.keys()) {
    const index = indexFromSuffix(oid, IF_DESCR_OID);
    if (index) indices.add(index);
  }

  const interfaces: SnmpCollectedInterface[] = [...indices]
    .sort((a, b) => a - b)
    .map((ifIndex) => {
      const descr = descrMap.get(`${IF_DESCR_OID}.${ifIndex}`) ?? `if${ifIndex}`;
      const ifName = nameMap.get(`${IF_NAME_OID}.${ifIndex}`) ?? descr;
      const adminStatus = mapStatus(adminMap.get(`${IF_ADMIN_OID}.${ifIndex}`), IF_ADMIN_STATUS);
      const operStatus = mapStatus(operMap.get(`${IF_OPER_OID}.${ifIndex}`), IF_OPER_STATUS);
      return {
        ifIndex,
        name: ifName,
        description: descr,
        alias: null,
        rawDescr: descr,
        adminStatus,
        operStatus,
        type: null,
        mtu: null,
        speed: null,
        highSpeedMbps: null,
        lastChangeTicks: null,
        mac: null,
        inOctets: null,
        outOctets: null,
        source: "snmp" as const,
      };
    });

  if (interfaces.length === 0) {
    warnings.push("IF-MIB walk returned no interfaces via connector");
  }

  return {
    success: true,
    errorMessage: null,
    errorCode: null,
    ifMibSkipped: false,
    preflightElapsedMs,
    errors,
    warnings,
    interfaces,
    collectedAt,
    source: "snmp",
  };
}

async function walkConnectorOid(
  device: Device,
  community: string,
  oid: string,
): Promise<Map<string, string>> {
  if (!device.connectorId) return new Map();
  const walk = await executeSnmpWalk({
    deviceId: device.id,
    connectorId: device.connectorId,
    targetIp: device.ipAddress,
    oid,
    community,
    timeoutSeconds: 120,
  });
  if (!walk.success) return new Map();
  return parseSnmpWalkLines(walk.stdout);
}

function classifyPeerAddressFamily(peerIp: string): "ipv4" | "ipv6" | "unknown" {
  if (/^\d+\.\d+\.\d+\.\d+$/.test(peerIp)) return "ipv4";
  if (peerIp.includes(":")) return "ipv6";
  return "unknown";
}

async function collectBgpPeersViaConnector(device: Device, community: string): Promise<SnmpCollectedBgpPeer[]> {
  const [stateMap, remoteAddrMap, remoteAsMap, inUpdatesMap, outUpdatesMap, uptimeMap] = await Promise.all([
    walkConnectorOid(device, community, SNMP_OIDS.bgpPeerState),
    walkConnectorOid(device, community, SNMP_OIDS.bgpPeerRemoteAddr),
    walkConnectorOid(device, community, SNMP_OIDS.bgpPeerRemoteAs),
    walkConnectorOid(device, community, SNMP_OIDS.bgpPeerInUpdates),
    walkConnectorOid(device, community, SNMP_OIDS.bgpPeerOutUpdates),
    walkConnectorOid(device, community, SNMP_OIDS.bgpPeerFsmEstablishedTime),
  ]);

  const peerIndexes = new Set<string>();
  for (const map of [stateMap, remoteAddrMap, remoteAsMap]) {
    for (const oid of map.keys()) {
      for (const base of [SNMP_OIDS.bgpPeerState, SNMP_OIDS.bgpPeerRemoteAddr, SNMP_OIDS.bgpPeerRemoteAs]) {
        const index = indexFromSuffix(oid, base);
        if (index != null) peerIndexes.add(String(index));
      }
    }
  }

  const peers: SnmpCollectedBgpPeer[] = [];
  for (const index of peerIndexes) {
    if (!index) continue;
    const remoteFromColumn = decodeSnmpAddress(remoteAddrMap.get(`${SNMP_OIDS.bgpPeerRemoteAddr}.${index}`));
    const peerIp = remoteFromColumn ?? peerIpFromIndex(index);
    const stateCode = toSnmpNumber(stateMap.get(`${SNMP_OIDS.bgpPeerState}.${index}`));
    const uptimeTicks = toSnmpNumber(uptimeMap.get(`${SNMP_OIDS.bgpPeerFsmEstablishedTime}.${index}`));
    peers.push({
      peerIp,
      remoteAs: toSnmpNumber(remoteAsMap.get(`${SNMP_OIDS.bgpPeerRemoteAs}.${index}`)),
      state: BGP_STATE_BY_CODE[String(stateCode ?? "")] ?? "unknown",
      uptimeSecs: uptimeTicks != null ? Math.floor(uptimeTicks / 100) : null,
      inUpdates: toSnmpNumber(inUpdatesMap.get(`${SNMP_OIDS.bgpPeerInUpdates}.${index}`)),
      outUpdates: toSnmpNumber(outUpdatesMap.get(`${SNMP_OIDS.bgpPeerOutUpdates}.${index}`)),
      addressFamily: classifyPeerAddressFamily(peerIp),
      source: "snmp",
    });
  }

  return peers.sort((left, right) => left.peerIp.localeCompare(right.peerIp));
}

/** IF-MIB + BGP4-MIB via connector agent (discovery / readonly inventory). */
export async function collectSnmpReadonlyViaConnector(
  device: Device,
  community: string,
): Promise<SnmpReadonlyCollectPayload> {
  const collectedAt = new Date().toISOString();
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!device.connectorId) {
    return {
      success: false,
      errorMessage: "Device has no connector_id",
      errors: ["Device has no connector_id"],
      interfaces: [],
      bgpPeers: [],
      collectedAt,
      source: "snmp",
    };
  }

  const ifaceResult = await collectSnmpInterfacesViaConnector(device, community);
  if (!ifaceResult.success) {
    return {
      success: false,
      errorMessage: ifaceResult.errorMessage,
      errors: ifaceResult.errors,
      warnings: ifaceResult.warnings.length > 0 ? ifaceResult.warnings : undefined,
      interfaces: [],
      bgpPeers: [],
      collectedAt,
      source: "snmp",
    };
  }

  errors.push(...ifaceResult.errors);
  warnings.push(...ifaceResult.warnings);

  let bgpPeers: SnmpCollectedBgpPeer[] = [];
  try {
    bgpPeers = await collectBgpPeersViaConnector(device, community);
    if (bgpPeers.length === 0) {
      warnings.push("BGP4-MIB walk returned no peers via connector");
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "BGP4-MIB collection failed via connector";
    warnings.push(message);
  }

  return {
    success: true,
    errorMessage: errors.length > 0 ? errors.join("; ") : null,
    errors,
    warnings: warnings.length > 0 ? warnings : undefined,
    interfaces: ifaceResult.interfaces,
    bgpPeers,
    collectedAt,
    source: "snmp",
  };
}
