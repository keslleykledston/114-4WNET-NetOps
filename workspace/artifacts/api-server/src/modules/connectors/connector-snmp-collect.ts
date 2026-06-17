import type { Device } from "@workspace/db";
import type { SnmpCollectedBgpPeer, SnmpCollectedInterface, SnmpReadonlyCollectPayload } from "../netops/snmp/types.js";
import {
  BGP_STATE_BY_CODE,
  HUAWEI_BGP_OIDS,
  HUAWEI_BGP_STATE_BY_CODE,
  IF_ADMIN_STATUS,
  IF_OPER_STATUS,
  SNMP_OIDS,
} from "../netops/snmp/oids.js";
import { decodeSnmpAddress, peerIpFromIndex, toSnmpNumber } from "../netops/snmp/snmp-session.js";
import { executeSnmpGet, executeSnmpWalk, resolveDeviceConnectorContext } from "./connector-execution.service.js";

const IF_DESCR_OID = "1.3.6.1.2.1.2.2.1.2";
const IF_ADMIN_OID = "1.3.6.1.2.1.2.2.1.7";
const IF_OPER_OID = "1.3.6.1.2.1.2.2.1.8";
const IF_NAME_OID = "1.3.6.1.2.1.31.1.1.1.1";
const RFC4273_BGP_STATE_OID = "1.3.6.1.2.1.15.2.1.2";
const RFC4273_BGP_REMOTE_ADDR_OID = "1.3.6.1.2.1.15.2.1.7";
const RFC4273_BGP_REMOTE_AS_OID = "1.3.6.1.2.1.15.2.1.4";
const RFC4273_BGP_IN_UPDATES_OID = "1.3.6.1.2.1.15.2.1.10";
const RFC4273_BGP_OUT_UPDATES_OID = "1.3.6.1.2.1.15.2.1.11";
const RFC4273_BGP_UPTIME_OID = "1.3.6.1.2.1.15.2.1.16";

/** net-snmp/snmpwalk prints `iso.*` where iso is MIB root 1 (not 1.3.6.1). */
function normalizeSnmpWalkOid(oid: string): string {
  return oid.replace(/^iso\./, "1.");
}

function suffixFromOid(oid: string, baseOid: string): string | null {
  const normalized = normalizeSnmpWalkOid(oid);
  const prefix = `${baseOid}.`;
  if (!normalized.startsWith(prefix)) return null;
  const suffix = normalized.slice(prefix.length);
  return suffix.length > 0 ? suffix : null;
}

function parseSnmpWalkLines(stdout: string): Map<string, string> {
  const values = new Map<string, string>();
  for (const line of stdout.split("\n")) {
    if (/No Such (Instance|Object)/i.test(line)) continue;
    const match = line.match(/^([^=\s]+)\s*=\s*(?:[\w-]+:\s*)?(.+)$/);
    if (!match) continue;
    const oid = normalizeSnmpWalkOid(match[1].trim());
    let value = match[2].trim();
    if (value.startsWith('"') && value.endsWith('"')) {
      value = value.slice(1, -1);
    }
    values.set(oid, value);
  }
  return values;
}

function interfaceIndexFromOid(oid: string, baseOid: string): number | null {
  const suffix = suffixFromOid(oid, baseOid);
  if (!suffix) return null;
  const index = Number(suffix);
  return Number.isInteger(index) && index > 0 ? index : null;
}

function collectIndexSuffixes(map: Map<string, string>, baseOid: string): Set<string> {
  const indexes = new Set<string>();
  for (const oid of map.keys()) {
    const suffix = suffixFromOid(oid, baseOid);
    if (suffix) indexes.add(suffix);
  }
  return indexes;
}

function mapStatus(code: string | undefined, table: Record<number, string>): string {
  const numeric = Number(code);
  return table[numeric] ?? (code ? `unknown(${code})` : "unknown");
}

async function getConnectorIdForDevice(device: Device): Promise<number | null> {
  if (!device.connectorId && !device.connectorGroupId) return null;
  const { connectorId } = await resolveDeviceConnectorContext(device.id);
  return connectorId;
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

  const connectorId = await getConnectorIdForDevice(device);
  if (!connectorId) {
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
    connectorId,
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
    connectorId,
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
      connectorId,
      targetIp: device.ipAddress,
      oid: IF_ADMIN_OID,
      community,
      timeoutSeconds: 120,
    }),
    executeSnmpWalk({
      deviceId: device.id,
      connectorId,
      targetIp: device.ipAddress,
      oid: IF_OPER_OID,
      community,
      timeoutSeconds: 120,
    }),
    executeSnmpWalk({
      deviceId: device.id,
      connectorId,
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
    const index = interfaceIndexFromOid(oid, IF_DESCR_OID);
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
  const connectorId = await getConnectorIdForDevice(device);
  if (!connectorId) return new Map();
  const walk = await executeSnmpWalk({
    deviceId: device.id,
    connectorId,
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

function peerKey(peerIp: string, addressFamily: string, vrf?: string | null): string {
  const vrfKey = (vrf ?? "").trim().toUpperCase();
  return `${peerIp}|${addressFamily}|${vrfKey}`;
}

function decodeHexAsciiIp(value: string): string | null {
  if (!/^[0-9a-f]+$/i.test(value) || value.length % 2 !== 0) return null;
  const ascii = Buffer.from(value, "hex").toString("utf8").replace(/\0/g, "").trim();
  return /^\d+\.\d+\.\d+\.\d+$/.test(ascii) ? ascii : null;
}

function peerIpFromHuaweiIndex(index: string): string | null {
  const v4 = index.match(/\.4\.((?:\d+\.){3}\d+)$/);
  if (v4) return v4[1];
  return peerIpFromIndex(index);
}

function resolveHuaweiPeerIp(peerIndex: string, remoteAddrValue: string | undefined): string {
  return decodeSnmpAddress(remoteAddrValue)
    ?? decodeHexAsciiIp(remoteAddrValue ?? "")
    ?? peerIpFromHuaweiIndex(peerIndex)
    ?? peerIndex;
}

function isHuaweiDevice(device: Device): boolean {
  return device.vendor?.toLowerCase().includes("huawei") || device.platform === "vrp";
}

/** Group a flat snmpwalk map into column → peerIndex → value (Huawei table walks). */
function groupHuaweiTableWalk(flatMap: Map<string, string>, tableBase: string): Map<string, Map<string, string>> {
  const byColumn = new Map<string, Map<string, string>>();
  // Huawei BGP tables nest columns as {tableBase}.1.{column}.{peerIndex}
  const prefix = `${tableBase}.1.`;

  for (const [oid, value] of flatMap) {
    if (!oid.startsWith(prefix)) continue;
    const rest = oid.slice(prefix.length);
    const firstDot = rest.indexOf(".");
    if (firstDot < 0) continue;
    const columnId = rest.slice(0, firstDot);
    const peerIndex = rest.slice(firstDot + 1);
    if (!byColumn.has(columnId)) {
      byColumn.set(columnId, new Map());
    }
    byColumn.get(columnId)!.set(peerIndex, value);
  }

  return byColumn;
}

/** Huawei enterprise BGP MIB — includes vpn-instance peers (e.g. CDN). */
async function collectHuaweiBgpPeersViaConnector(
  device: Device,
  community: string,
): Promise<SnmpCollectedBgpPeer[]> {
  const [peerTableFlat, vrfTableFlat] = await Promise.all([
    walkConnectorOid(device, community, HUAWEI_BGP_OIDS.peerTable),
    walkConnectorOid(device, community, HUAWEI_BGP_OIDS.peerVrfTable),
  ]);

  const peerColumns = groupHuaweiTableWalk(peerTableFlat, HUAWEI_BGP_OIDS.peerTable);
  const vrfColumns = groupHuaweiTableWalk(vrfTableFlat, HUAWEI_BGP_OIDS.peerVrfTable);

  const remoteAsMap = peerColumns.get("2") ?? new Map<string, string>();
  const remoteAddrMap = peerColumns.get("4") ?? new Map<string, string>();
  const stateMap = peerColumns.get("5") ?? new Map<string, string>();
  const vrfMap = vrfColumns.get("6") ?? new Map<string, string>();

  const peerIndexes = new Set<string>([
    ...remoteAsMap.keys(),
    ...remoteAddrMap.keys(),
    ...stateMap.keys(),
    ...vrfMap.keys(),
  ]);

  const peersByKey = new Map<string, SnmpCollectedBgpPeer>();
  for (const index of peerIndexes) {
    const peerIp = resolveHuaweiPeerIp(index, remoteAddrMap.get(index));
    const stateCode = toSnmpNumber(stateMap.get(index));
    const vrfRaw = vrfMap.get(index)?.trim() ?? null;
    const peer: SnmpCollectedBgpPeer = {
      peerIp,
      remoteAs: toSnmpNumber(remoteAsMap.get(index)),
      state: HUAWEI_BGP_STATE_BY_CODE[String(stateCode ?? "")] ?? "unknown",
      uptimeSecs: null,
      inUpdates: null,
      outUpdates: null,
      addressFamily: classifyPeerAddressFamily(peerIp),
      vrf: vrfRaw,
      source: "snmp",
    };
    peersByKey.set(peerKey(peer.peerIp, peer.addressFamily, peer.vrf), peer);
  }

  return [...peersByKey.values()].sort((left, right) => {
    const vrfCmp = (left.vrf ?? "").localeCompare(right.vrf ?? "");
    return vrfCmp !== 0 ? vrfCmp : left.peerIp.localeCompare(right.peerIp);
  });
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

  const [rfc4273StateMap, rfc4273RemoteAddrMap, rfc4273RemoteAsMap, rfc4273InUpdatesMap, rfc4273OutUpdatesMap, rfc4273UptimeMap] = await Promise.all([
    walkConnectorOid(device, community, RFC4273_BGP_STATE_OID),
    walkConnectorOid(device, community, RFC4273_BGP_REMOTE_ADDR_OID),
    walkConnectorOid(device, community, RFC4273_BGP_REMOTE_AS_OID),
    walkConnectorOid(device, community, RFC4273_BGP_IN_UPDATES_OID),
    walkConnectorOid(device, community, RFC4273_BGP_OUT_UPDATES_OID),
    walkConnectorOid(device, community, RFC4273_BGP_UPTIME_OID),
  ]);

  const peerIndexes = new Set<string>();
  for (const [map, base] of [
    [stateMap, SNMP_OIDS.bgpPeerState],
    [remoteAddrMap, SNMP_OIDS.bgpPeerRemoteAddr],
    [remoteAsMap, SNMP_OIDS.bgpPeerRemoteAs],
    [rfc4273StateMap, RFC4273_BGP_STATE_OID],
    [rfc4273RemoteAddrMap, RFC4273_BGP_REMOTE_ADDR_OID],
    [rfc4273RemoteAsMap, RFC4273_BGP_REMOTE_AS_OID],
  ] as const) {
    for (const index of collectIndexSuffixes(map, base)) {
      peerIndexes.add(index);
    }
  }

  const peersByKey = new Map<string, SnmpCollectedBgpPeer>();
  for (const index of peerIndexes) {
    if (!index) continue;
    const remoteFromColumn = decodeSnmpAddress(remoteAddrMap.get(`${SNMP_OIDS.bgpPeerRemoteAddr}.${index}`));
    const peerIp = remoteFromColumn ?? peerIpFromIndex(index);
    const stateCode = toSnmpNumber(stateMap.get(`${SNMP_OIDS.bgpPeerState}.${index}`));
    const uptimeTicks = toSnmpNumber(uptimeMap.get(`${SNMP_OIDS.bgpPeerFsmEstablishedTime}.${index}`));
    const peer: SnmpCollectedBgpPeer = {
      peerIp,
      remoteAs: toSnmpNumber(remoteAsMap.get(`${SNMP_OIDS.bgpPeerRemoteAs}.${index}`)),
      state: BGP_STATE_BY_CODE[String(stateCode ?? "")] ?? "unknown",
      uptimeSecs: uptimeTicks != null ? Math.floor(uptimeTicks / 100) : null,
      inUpdates: toSnmpNumber(inUpdatesMap.get(`${SNMP_OIDS.bgpPeerInUpdates}.${index}`)),
      outUpdates: toSnmpNumber(outUpdatesMap.get(`${SNMP_OIDS.bgpPeerOutUpdates}.${index}`)),
      addressFamily: classifyPeerAddressFamily(peerIp),
      source: "snmp",
    };
    peersByKey.set(peerKey(peer.peerIp, peer.addressFamily, null), peer);
  }

  for (const index of peerIndexes) {
    if (!index) continue;
    const remoteFromColumn = decodeSnmpAddress(rfc4273RemoteAddrMap.get(`${RFC4273_BGP_REMOTE_ADDR_OID}.${index}`));
    const peerIp = remoteFromColumn ?? peerIpFromIndex(index);
    const stateCode = toSnmpNumber(rfc4273StateMap.get(`${RFC4273_BGP_STATE_OID}.${index}`));
    const uptimeTicks = toSnmpNumber(rfc4273UptimeMap.get(`${RFC4273_BGP_UPTIME_OID}.${index}`));
    const peer: SnmpCollectedBgpPeer = {
      peerIp,
      remoteAs: toSnmpNumber(rfc4273RemoteAsMap.get(`${RFC4273_BGP_REMOTE_AS_OID}.${index}`)),
      state: BGP_STATE_BY_CODE[String(stateCode ?? "")] ?? "unknown",
      uptimeSecs: uptimeTicks != null ? Math.floor(uptimeTicks / 100) : null,
      inUpdates: toSnmpNumber(rfc4273InUpdatesMap.get(`${RFC4273_BGP_IN_UPDATES_OID}.${index}`)),
      outUpdates: toSnmpNumber(rfc4273OutUpdatesMap.get(`${RFC4273_BGP_OUT_UPDATES_OID}.${index}`)),
      addressFamily: classifyPeerAddressFamily(peerIp),
      source: "snmp",
    };
    peersByKey.set(peerKey(peer.peerIp, peer.addressFamily, null), peer);
  }

  return [...peersByKey.values()].sort((left, right) => left.peerIp.localeCompare(right.peerIp));
}

async function collectBgpPeersForDeviceViaConnector(device: Device, community: string): Promise<SnmpCollectedBgpPeer[]> {
  if (isHuaweiDevice(device)) {
    const huaweiPeers = await collectHuaweiBgpPeersViaConnector(device, community);
    if (huaweiPeers.length > 0) {
      return huaweiPeers;
    }
  }
  return collectBgpPeersViaConnector(device, community);
}

/** IF-MIB + BGP4-MIB via connector agent (discovery / readonly inventory). */
export async function collectSnmpReadonlyViaConnector(
  device: Device,
  community: string,
): Promise<SnmpReadonlyCollectPayload> {
  const collectedAt = new Date().toISOString();
  const errors: string[] = [];
  const warnings: string[] = [];

  const connectorId = await getConnectorIdForDevice(device);
  if (!connectorId) {
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
    bgpPeers = await collectBgpPeersForDeviceViaConnector(device, community);
    if (bgpPeers.length === 0) {
      warnings.push("BGP peer walks returned no peers via connector");
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "BGP peer collection failed via connector";
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
