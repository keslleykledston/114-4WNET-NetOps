import type { Device } from "@workspace/db";
import { BGP_STATE_BY_CODE, IF_ADMIN_STATUS, IF_OPER_STATUS, SNMP_OIDS } from "./oids.js";
import {
  createSnmpSession,
  decodeSnmpAddress,
  decodeSnmpMac,
  decodeSnmpString,
  peerIpFromIndex,
  snmpWalk,
  snmpWalkWithDiagnostics,
  toSnmpNumber,
  type OidWalkResult,
  type SnmpSession,
} from "./snmp-session.js";
import {
  preflightFailureSummary,
  runSnmpPreflightForDevice,
  type SnmpPreflightResult,
} from "./snmp-preflight.js";
import type { OidDiagnostic, SnmpCollectedBgpPeer, SnmpCollectedInterface, SnmpReadonlyCollectPayload } from "./types.js";

export type SnmpFastInterfaceCollectHooks = {
  runPreflight?: (device: Device, community: string) => Promise<SnmpPreflightResult>;
  collectInterfacesFn?: (
    session: SnmpSession,
    errors: string[],
    warnings: string[],
  ) => ReturnType<typeof collectInterfaces>;
};

export function isNetopsSnmpRealEnabled(): boolean {
  return process.env["NETOPS_SNMP_REAL_ENABLED"]?.trim().toLowerCase() === "true";
}

export function getSnmpFastSessionOptions(): { timeout: number; retries: number } {
  const timeout = Number(process.env["SNMP_FAST_TIMEOUT_MS"] ?? 10000);
  const retries = Number(process.env["SNMP_FAST_RETRIES"] ?? 2);
  return {
    timeout: Number.isFinite(timeout) && timeout > 0 ? timeout : 10000,
    retries: Number.isFinite(retries) && retries >= 0 ? retries : 2,
  };
}

/** IF-MIB only — no BGP walks (SNMP_FAST H2). sysDescr preflight before IF-MIB (H2.1E). */
export async function collectSnmpInterfacesOnly(
  device: Device,
  community: string,
  hooks?: SnmpFastInterfaceCollectHooks,
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

  const runPreflightFn = hooks?.runPreflight ?? runSnmpPreflightForDevice;
  const preflight = await runPreflightFn(device, community);

  if (!preflight.ok) {
    const summary = preflightFailureSummary(preflight.errorCode);
    console.warn(
      `[snmp-fast] SNMP preflight failed deviceId=${device.id} ip=${device.ipAddress} code=${preflight.errorCode} reason=${preflight.reason} elapsedMs=${preflight.elapsedMs}`,
    );
    return {
      success: false,
      errorMessage: summary,
      errorCode: preflight.errorCode,
      ifMibSkipped: true,
      preflightElapsedMs: preflight.elapsedMs,
      errors: [summary],
      warnings: [],
      interfaces: [],
      collectedAt,
      source: "snmp",
    };
  }

  const sessionOpts = getSnmpFastSessionOptions();
  const session = createSnmpSession(device.ipAddress, community, sessionOpts);
  const collectFn = hooks?.collectInterfacesFn ?? collectInterfaces;

  try {
    const { interfaces, ifMibDiagnostics } = await collectFn(session, errors, warnings);
    if (interfaces.length === 0 && Object.values(ifMibDiagnostics).some((d) => d.status !== "ok" && d.status !== "empty")) {
      warnings.push("IF-MIB incomplete. Check SNMP view for 1.3.6.1.2.1.2 and 1.3.6.1.2.1.31 OID access.");
    }
    return {
      success: errors.length === 0,
      errorMessage: errors.length > 0 ? errors.join("; ") : null,
      errorCode: null,
      ifMibSkipped: false,
      preflightElapsedMs: preflight.elapsedMs,
      errors,
      warnings,
      interfaces,
      collectedAt,
      source: "snmp",
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "SNMP interface collection failed";
    return {
      success: false,
      errorMessage: message,
      errorCode: null,
      ifMibSkipped: false,
      preflightElapsedMs: preflight.elapsedMs,
      errors: [message],
      warnings: [],
      interfaces: [],
      collectedAt,
      source: "snmp",
    };
  } finally {
    session.close();
  }
}

export async function collectSnmpReadonly(device: Device, community: string): Promise<SnmpReadonlyCollectPayload> {
  const collectedAt = new Date().toISOString();
  const errors: string[] = [];
  const warnings: string[] = [];
  const oidDiagnostics: Record<string, OidDiagnostic> = {};
  const session = createSnmpSession(device.ipAddress, community, { timeout: 60000, retries: 4 });

  try {
    const { interfaces, ifMibDiagnostics } = await collectInterfaces(session, errors, warnings);
    Object.assign(oidDiagnostics, ifMibDiagnostics);

    const { bgpPeers, bgpDiagnostics } = await collectBgp4Peers(session, errors, warnings);
    Object.assign(oidDiagnostics, bgpDiagnostics);

    if (interfaces.length === 0 && Object.values(ifMibDiagnostics).some((d) => d.status !== "ok" && d.status !== "empty")) {
      warnings.push(`IF-MIB incomplete. Check SNMP view for 1.3.6.1.2.1.2 and 1.3.6.1.2.1.31 OID access.`);
    }

    return {
      success: errors.length === 0,
      errorMessage: errors.length > 0 ? errors.join("; ") : null,
      errors,
      warnings: warnings.length > 0 ? warnings : undefined,
      interfaces,
      bgpPeers,
      collectedAt,
      source: "snmp",
      oidDiagnostics: Object.keys(oidDiagnostics).length > 0 ? oidDiagnostics : undefined,
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

async function collectInterfaces(
  session: SnmpSession,
  errors: string[],
  warnings: string[],
): Promise<{ interfaces: SnmpCollectedInterface[]; ifMibDiagnostics: Record<string, OidDiagnostic> }> {
  const ifMibDiagnostics: Record<string, OidDiagnostic> = {};

  try {
    const descrResult = await snmpWalkWithDiagnostics(session, SNMP_OIDS.ifDescr);
    ifMibDiagnostics.ifDescr = { oid: descrResult.oid, status: descrResult.status, count: descrResult.count };
    if (descrResult.error) {
      warnings.push(`ifDescr (1.3.6.1.2.1.2.2.1.2) failed: ${descrResult.error.message}`);
    }

    const ifNameResult = await snmpWalkWithDiagnostics(session, SNMP_OIDS.ifName);
    ifMibDiagnostics.ifName = { oid: ifNameResult.oid, status: ifNameResult.status, count: ifNameResult.count };
    if (ifNameResult.error) {
      warnings.push(`ifName (1.3.6.1.2.1.31.1.1.1.1) failed: ${ifNameResult.error.message}`);
    }

    const ifAliasResult = await snmpWalkWithDiagnostics(session, SNMP_OIDS.ifAlias);
    ifMibDiagnostics.ifAlias = { oid: ifAliasResult.oid, status: ifAliasResult.status, count: ifAliasResult.count };

    const typeResult = await snmpWalkWithDiagnostics(session, SNMP_OIDS.ifType);
    ifMibDiagnostics.ifType = { oid: typeResult.oid, status: typeResult.status, count: typeResult.count };

    const mtuResult = await snmpWalkWithDiagnostics(session, SNMP_OIDS.ifMtu);
    ifMibDiagnostics.ifMtu = { oid: mtuResult.oid, status: mtuResult.status, count: mtuResult.count };

    const speedResult = await snmpWalkWithDiagnostics(session, SNMP_OIDS.ifSpeed);
    ifMibDiagnostics.ifSpeed = { oid: speedResult.oid, status: speedResult.status, count: speedResult.count };

    const macResult = await snmpWalkWithDiagnostics(session, SNMP_OIDS.ifPhysAddress);
    ifMibDiagnostics.ifPhysAddress = { oid: macResult.oid, status: macResult.status, count: macResult.count };

    const adminResult = await snmpWalkWithDiagnostics(session, SNMP_OIDS.ifAdminStatus);
    ifMibDiagnostics.ifAdminStatus = { oid: adminResult.oid, status: adminResult.status, count: adminResult.count };

    const operResult = await snmpWalkWithDiagnostics(session, SNMP_OIDS.ifOperStatus);
    ifMibDiagnostics.ifOperStatus = { oid: operResult.oid, status: operResult.status, count: operResult.count };

    const inOctetsResult = await snmpWalkWithDiagnostics(session, SNMP_OIDS.ifHCInOctets);
    ifMibDiagnostics.ifHCInOctets = { oid: inOctetsResult.oid, status: inOctetsResult.status, count: inOctetsResult.count };

    const outOctetsResult = await snmpWalkWithDiagnostics(session, SNMP_OIDS.ifHCOutOctets);
    ifMibDiagnostics.ifHCOutOctets = { oid: outOctetsResult.oid, status: outOctetsResult.status, count: outOctetsResult.count };

    const lastChangeResult = await snmpWalkWithDiagnostics(session, SNMP_OIDS.ifLastChange);
    ifMibDiagnostics.ifLastChange = { oid: lastChangeResult.oid, status: lastChangeResult.status, count: lastChangeResult.count };

    const highSpeedResult = await snmpWalkWithDiagnostics(session, SNMP_OIDS.ifHighSpeed);
    ifMibDiagnostics.ifHighSpeed = { oid: highSpeedResult.oid, status: highSpeedResult.status, count: highSpeedResult.count };

    const indexes = new Set<string>([
      ...Object.keys(descrResult.rows),
      ...Object.keys(ifNameResult.rows),
    ]);

    if (indexes.size === 0) {
      return { interfaces: [], ifMibDiagnostics };
    }

    const interfaces = [...indexes]
      .sort(compareIfIndexes)
      .map((index) => {
        const ifIndex = Number(index);
        const rawDescr = decodeSnmpString(descrResult.rows[index]);
        const ifName = decodeSnmpString(ifNameResult.rows[index]);
        const ifAlias = decodeSnmpString(ifAliasResult.rows[index]);
        const name = ifName ?? rawDescr ?? `ifIndex-${index}`;
        const description = ifAlias || rawDescr || null;
        const adminCode = toSnmpNumber(adminResult.rows[index]);
        const operCode = toSnmpNumber(operResult.rows[index]);
        const speedBps = toSnmpNumber(speedResult.rows[index]);
        const highSpeedRaw = toSnmpNumber(highSpeedResult.rows[index]);
        const highSpeedMbps = highSpeedRaw != null && highSpeedRaw > 0
          ? highSpeedRaw
          : speedBps != null && speedBps > 0
            ? Math.round(speedBps / 1_000_000)
            : null;

        return {
          ifIndex: Number.isFinite(ifIndex) ? ifIndex : Number(index) || 0,
          name,
          description,
          alias: ifAlias,
          rawDescr,
          adminStatus: IF_ADMIN_STATUS[String(adminCode ?? "")] ?? "unknown",
          operStatus: IF_OPER_STATUS[String(operCode ?? "")] ?? "unknown",
          type: toSnmpNumber(typeResult.rows[index]),
          mtu: toSnmpNumber(mtuResult.rows[index]),
          speed: speedBps,
          highSpeedMbps,
          lastChangeTicks: toSnmpNumber(lastChangeResult.rows[index]),
          mac: decodeSnmpMac(macResult.rows[index]),
          inOctets: toSnmpNumber(inOctetsResult.rows[index]),
          outOctets: toSnmpNumber(outOctetsResult.rows[index]),
          source: "snmp" as const,
        };
      });

    return { interfaces, ifMibDiagnostics };
  } catch (error) {
    const message = error instanceof Error ? error.message : "IF-MIB collection failed";
    errors.push(message);
    return { interfaces: [], ifMibDiagnostics };
  }
}

async function collectBgp4Peers(
  session: SnmpSession,
  errors: string[],
  warnings: string[],
): Promise<{ bgpPeers: SnmpCollectedBgpPeer[]; bgpDiagnostics: Record<string, OidDiagnostic> }> {
  const bgpDiagnostics: Record<string, OidDiagnostic> = {};

  try {
    const stateResult = await snmpWalkWithDiagnostics(session, SNMP_OIDS.bgpPeerState);
    bgpDiagnostics.bgpPeerState = { oid: stateResult.oid, status: stateResult.status, count: stateResult.count };
    if (stateResult.error) {
      warnings.push(`bgpPeerState (1.3.6.1.2.1.15.3.1.2) failed: ${stateResult.error.message}`);
    }

    const remoteAddrResult = await snmpWalkWithDiagnostics(session, SNMP_OIDS.bgpPeerRemoteAddr);
    bgpDiagnostics.bgpPeerRemoteAddr = { oid: remoteAddrResult.oid, status: remoteAddrResult.status, count: remoteAddrResult.count };

    const remoteAsResult = await snmpWalkWithDiagnostics(session, SNMP_OIDS.bgpPeerRemoteAs);
    bgpDiagnostics.bgpPeerRemoteAs = { oid: remoteAsResult.oid, status: remoteAsResult.status, count: remoteAsResult.count };

    const inUpdatesResult = await snmpWalkWithDiagnostics(session, SNMP_OIDS.bgpPeerInUpdates);
    bgpDiagnostics.bgpPeerInUpdates = { oid: inUpdatesResult.oid, status: inUpdatesResult.status, count: inUpdatesResult.count };

    const outUpdatesResult = await snmpWalkWithDiagnostics(session, SNMP_OIDS.bgpPeerOutUpdates);
    bgpDiagnostics.bgpPeerOutUpdates = { oid: outUpdatesResult.oid, status: outUpdatesResult.status, count: outUpdatesResult.count };

    const uptimeResult = await snmpWalkWithDiagnostics(session, SNMP_OIDS.bgpPeerFsmEstablishedTime);
    bgpDiagnostics.bgpPeerFsmEstablishedTime = { oid: uptimeResult.oid, status: uptimeResult.status, count: uptimeResult.count };

    const peerIndexes = new Set<string>([
      ...Object.keys(stateResult.rows),
      ...Object.keys(remoteAddrResult.rows),
      ...Object.keys(remoteAsResult.rows),
    ]);

    const peers: SnmpCollectedBgpPeer[] = [];

    for (const index of peerIndexes) {
      const remoteFromColumn = decodeSnmpAddress(remoteAddrResult.rows[index]);
      const peerIp = remoteFromColumn ?? peerIpFromIndex(index);
      const stateCode = toSnmpNumber(stateResult.rows[index]);
      const state = BGP_STATE_BY_CODE[String(stateCode ?? "")] ?? "unknown";
      const uptimeTicks = toSnmpNumber(uptimeResult.rows[index]);

      peers.push({
        peerIp,
        remoteAs: toSnmpNumber(remoteAsResult.rows[index]),
        state,
        uptimeSecs: uptimeTicks != null ? Math.floor(uptimeTicks / 100) : null,
        // These SNMP counters are later merged with SSH verbose prefix counts.
        inUpdates: toSnmpNumber(inUpdatesResult.rows[index]),
        outUpdates: toSnmpNumber(outUpdatesResult.rows[index]),
        addressFamily: classifyPeerAddressFamily(peerIp),
        source: "snmp",
      });
    }

    return { bgpPeers: peers.sort((left, right) => left.peerIp.localeCompare(right.peerIp)), bgpDiagnostics };
  } catch (error) {
    const message = error instanceof Error ? error.message : "BGP4-MIB collection failed";
    errors.push(message);
    return { bgpPeers: [], bgpDiagnostics };
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
