import type { Device } from "@workspace/db";
import { BGP_STATE_BY_CODE, IF_ADMIN_STATUS, IF_OPER_STATUS, SNMP_OIDS } from "./oids.js";
import {
  createSnmpSession,
  decodeSnmpAddress,
  decodeSnmpMac,
  decodeSnmpString,
  peerIpFromIndex,
  snmpWalk,
  toSnmpNumber,
  type SnmpSession,
} from "./snmp-session.js";
import type { SnmpCollectedBgpPeer, SnmpCollectedInterface, SnmpReadonlyCollectPayload } from "./types.js";

export function isNetopsSnmpRealEnabled(): boolean {
  return process.env["NETOPS_SNMP_REAL_ENABLED"]?.trim().toLowerCase() === "true";
}

export async function collectSnmpReadonly(device: Device, community: string): Promise<SnmpReadonlyCollectPayload> {
  const collectedAt = new Date().toISOString();
  const errors: string[] = [];
  const session = createSnmpSession(device.ipAddress, community);

  try {
    const interfaces = await collectInterfaces(session, errors);
    const bgpPeers = await collectBgp4Peers(session, errors);

    return {
      success: errors.length === 0,
      errorMessage: errors.length > 0 ? errors.join("; ") : null,
      errors,
      interfaces,
      bgpPeers,
      collectedAt,
      source: "snmp",
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "SNMP collection failed";
    return {
      success: false,
      errorMessage: message,
      errors: [message],
      interfaces: [],
      bgpPeers: [],
      collectedAt,
      source: "snmp",
    };
  } finally {
    session.close();
  }
}

async function collectInterfaces(session: SnmpSession, errors: string[]): Promise<SnmpCollectedInterface[]> {
  try {
    const [
      descr,
      type,
      mtu,
      speed,
      mac,
      admin,
      oper,
      ifName,
      alias,
      inOctets,
      outOctets,
    ] = await Promise.all([
      snmpWalk(session, SNMP_OIDS.ifDescr),
      snmpWalk(session, SNMP_OIDS.ifType),
      snmpWalk(session, SNMP_OIDS.ifMtu),
      snmpWalk(session, SNMP_OIDS.ifSpeed),
      snmpWalk(session, SNMP_OIDS.ifPhysAddress),
      snmpWalk(session, SNMP_OIDS.ifAdminStatus),
      snmpWalk(session, SNMP_OIDS.ifOperStatus),
      snmpWalk(session, SNMP_OIDS.ifName),
      snmpWalk(session, SNMP_OIDS.ifAlias),
      snmpWalk(session, SNMP_OIDS.ifHCInOctets),
      snmpWalk(session, SNMP_OIDS.ifHCOutOctets),
    ]);

    const indexes = new Set<string>([
      ...Object.keys(descr),
      ...Object.keys(ifName),
    ]);

    return [...indexes]
      .sort(compareIfIndexes)
      .map((index) => {
        const ifIndex = Number(index);
        const description = decodeSnmpString(descr[index]);
        const name = decodeSnmpString(ifName[index]) ?? description ?? `ifIndex-${index}`;
        const adminCode = toSnmpNumber(admin[index]);
        const operCode = toSnmpNumber(oper[index]);

        return {
          ifIndex: Number.isFinite(ifIndex) ? ifIndex : Number(index) || 0,
          name,
          description,
          alias: decodeSnmpString(alias[index]),
          adminStatus: IF_ADMIN_STATUS[String(adminCode ?? "")] ?? "unknown",
          operStatus: IF_OPER_STATUS[String(operCode ?? "")] ?? "unknown",
          type: toSnmpNumber(type[index]),
          mtu: toSnmpNumber(mtu[index]),
          speed: toSnmpNumber(speed[index]),
          mac: decodeSnmpMac(mac[index]),
          inOctets: toSnmpNumber(inOctets[index]),
          outOctets: toSnmpNumber(outOctets[index]),
          source: "snmp" as const,
        };
      });
  } catch (error) {
    const message = error instanceof Error ? error.message : "IF-MIB walk failed";
    errors.push(message);
    return [];
  }
}

async function collectBgp4Peers(session: SnmpSession, errors: string[]): Promise<SnmpCollectedBgpPeer[]> {
  try {
    const [stateRaw, remoteAddrRaw, remoteAsRaw, inUpdatesRaw, outUpdatesRaw, uptimeRaw] = await Promise.all([
      snmpWalk(session, SNMP_OIDS.bgpPeerState),
      snmpWalk(session, SNMP_OIDS.bgpPeerRemoteAddr),
      snmpWalk(session, SNMP_OIDS.bgpPeerRemoteAs),
      snmpWalk(session, SNMP_OIDS.bgpPeerInUpdates),
      snmpWalk(session, SNMP_OIDS.bgpPeerOutUpdates),
      snmpWalk(session, SNMP_OIDS.bgpPeerFsmEstablishedTime),
    ]);

    const peerIndexes = new Set<string>([
      ...Object.keys(stateRaw),
      ...Object.keys(remoteAddrRaw),
      ...Object.keys(remoteAsRaw),
    ]);

    const peers: SnmpCollectedBgpPeer[] = [];

    for (const index of peerIndexes) {
      const remoteFromColumn = decodeSnmpAddress(remoteAddrRaw[index]);
      const peerIp = remoteFromColumn ?? peerIpFromIndex(index);
      const stateCode = toSnmpNumber(stateRaw[index]);
      const state = BGP_STATE_BY_CODE[String(stateCode ?? "")] ?? "unknown";
      const uptimeTicks = toSnmpNumber(uptimeRaw[index]);

      peers.push({
        peerIp,
        remoteAs: toSnmpNumber(remoteAsRaw[index]),
        state,
        uptimeSecs: uptimeTicks != null ? Math.floor(uptimeTicks / 100) : null,
        inUpdates: toSnmpNumber(inUpdatesRaw[index]),
        outUpdates: toSnmpNumber(outUpdatesRaw[index]),
        addressFamily: classifyPeerAddressFamily(peerIp),
        source: "snmp",
      });
    }

    return peers.sort((left, right) => left.peerIp.localeCompare(right.peerIp));
  } catch (error) {
    const message = error instanceof Error ? error.message : "BGP4-MIB walk failed";
    errors.push(message);
    return [];
  }
}

function classifyPeerAddressFamily(peerIp: string): "ipv4" | "ipv6" | "unknown" {
  if (/^\d+\.\d+\.\d+\.\d+$/.test(peerIp)) return "ipv4";
  if (peerIp.includes(":")) return "ipv6";
  return "unknown";
}

function compareIfIndexes(left: string, right: string): number {
  const leftNum = Number(left);
  const rightNum = Number(right);
  if (Number.isFinite(leftNum) && Number.isFinite(rightNum)) return leftNum - rightNum;
  return left.localeCompare(right);
}
