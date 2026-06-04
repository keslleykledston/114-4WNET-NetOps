import { BGP_STATE_BY_CODE } from "../netops/snmp/oids.js";
import {
  createSnmpSession,
  decodeSnmpAddress,
  peerIpFromIndex,
  snmpGet,
  snmpWalkWithDiagnostics,
  toSnmpNumber,
  type SnmpSession,
} from "../netops/snmp/snmp-session.js";
import type { CollectedBgpPeerRow } from "./operational-bgp.types.js";

/** RFC4273 bgpPeerTable (`bgpPeerEntry` columns). */
export const RFC4273_BGP_PEER_COLUMNS = {
  state: "1.3.6.1.2.1.15.2.1.2",
  adminStatus: "1.3.6.1.2.1.15.2.1.3",
  remoteAs: "1.3.6.1.2.1.15.2.1.4",
  remoteAddr: "1.3.6.1.2.1.15.2.1.7",
  fsmEstablishedTime: "1.3.6.1.2.1.15.2.1.16",
} as const;

/** Legacy BGP4-MIB peer table (widely implemented on Huawei/Cisco). */
export const BGP4_MIB_PEER_COLUMNS = {
  state: "1.3.6.1.2.1.15.3.1.2",
  adminStatus: "1.3.6.1.2.1.15.3.1.3",
  remoteAddr: "1.3.6.1.2.1.15.3.1.7",
  remoteAs: "1.3.6.1.2.1.15.3.1.9",
  fsmEstablishedTime: "1.3.6.1.2.1.15.3.1.16",
} as const;

const BGP_ADMIN_STATUS: Record<string, string> = {
  "1": "stop",
  "2": "start",
};

export function getBgpWalkSessionOptions(): { timeout: number; retries: number } {
  const timeout = Number(process.env["SNMP_FAST_BGP_TIMEOUT_MS"] ?? 5000);
  const retries = Number(process.env["SNMP_FAST_BGP_WALK_RETRIES"] ?? 1);
  const boundedTimeout = Number.isFinite(timeout) && timeout >= 3000 && timeout <= 8000 ? timeout : 5000;
  const boundedRetries = Number.isFinite(retries) && retries >= 0 && retries <= 1 ? retries : 1;
  return { timeout: boundedTimeout, retries: boundedRetries };
}

type PeerColumnOids = {
  state: string;
  adminStatus: string;
  remoteAs: string;
  remoteAddr: string;
  fsmEstablishedTime: string;
};

async function walkPeerColumns(
  session: SnmpSession,
  columns: PeerColumnOids,
  warnings: string[],
  label: string,
) {
  const stateResult = await snmpWalkWithDiagnostics(session, columns.state);
  if (stateResult.status !== "ok" && stateResult.error) {
    warnings.push(`${label} bgpPeerState walk: ${stateResult.error.message}`);
  }

  const remoteAddrResult = await snmpWalkWithDiagnostics(session, columns.remoteAddr);
  const remoteAsResult = await snmpWalkWithDiagnostics(session, columns.remoteAs);
  const adminResult = await snmpWalkWithDiagnostics(session, columns.adminStatus);
  const uptimeResult = await snmpWalkWithDiagnostics(session, columns.fsmEstablishedTime);

  return { stateResult, remoteAddrResult, remoteAsResult, adminResult, uptimeResult };
}

function mapFsmState(stateCode: number | null): string {
  if (stateCode == null) return "unknown";
  return BGP_STATE_BY_CODE[String(stateCode)] ?? "unknown";
}

function mapOperStatus(fsmState: string): string {
  return fsmState === "established" ? "up" : "down";
}

function mapAdminStatus(code: number | null): string {
  if (code == null) return "unknown";
  return BGP_ADMIN_STATUS[String(code)] ?? "unknown";
}

function classifyAfi(peerIp: string): string {
  if (/^\d+\.\d+\.\d+\.\d+$/.test(peerIp)) return "ipv4";
  if (peerIp.includes(":")) return "ipv6";
  return "ipv4";
}

async function resolveLocalAs(deviceId: number, session: SnmpSession, warnings: string[]): Promise<number | null> {
  const localAsResult = await snmpGet(session, "1.3.6.1.2.1.15.1.1.0");
  const snmpLocalAs = toSnmpNumber(localAsResult);
  if (snmpLocalAs != null) return snmpLocalAs;

  const { getLatestDiscoverySnapshot } = await import("../netops/device-discovery/discovery.service.js");
  const snapshot = await getLatestDiscoverySnapshot(deviceId);
  const discoveryLocalAs = snapshot?.parsed_config?.bgp_peer_model?.localAs ?? null;
  if (discoveryLocalAs != null) {
    warnings.push("bgp localAs missing from SNMP - using discovery parsed_config.bgp_peer_model.localAs");
    return discoveryLocalAs;
  }

  warnings.push("bgp localAs missing from SNMP and discovery snapshot");
  return null;
}

function rowsToPeers(
  walks: Awaited<ReturnType<typeof walkPeerColumns>>,
  localAs: number | null,
  warnings: string[],
): CollectedBgpPeerRow[] {
  const { stateResult, remoteAddrResult, remoteAsResult, adminResult, uptimeResult } = walks;
  const peerIndexes = new Set<string>([
    ...Object.keys(stateResult.rows),
    ...Object.keys(remoteAddrResult.rows),
    ...Object.keys(remoteAsResult.rows),
  ]);

  const peers: CollectedBgpPeerRow[] = [];

  for (const index of peerIndexes) {
    const remoteFromColumn = decodeSnmpAddress(remoteAddrResult.rows[index]);
    const peerIp = remoteFromColumn ?? peerIpFromIndex(index);
    if (!peerIp || peerIp === "0.0.0.0") continue;

    const fsmState = mapFsmState(toSnmpNumber(stateResult.rows[index]));
    const uptimeTicks = toSnmpNumber(uptimeResult.rows[index]);
    const remoteAs = toSnmpNumber(remoteAsResult.rows[index]);

    if (remoteAs == null) {
      warnings.push(`bgp peer ${peerIp} missing remoteAs from supported MIB walks`);
    }

    let peerType = "unknown";
    if (localAs != null && remoteAs != null) {
      peerType = remoteAs === localAs ? "iBGP" : "eBGP";
    }

    peers.push({
      peerIp,
      peerAs: remoteAs,
      peerType,
      vrf: null,
      afi: classifyAfi(peerIp),
      safi: "unicast",
      adminStatus: mapAdminStatus(toSnmpNumber(adminResult.rows[index])),
      operStatus: mapOperStatus(fsmState),
      fsmState,
      uptimeSeconds: uptimeTicks != null ? Math.floor(uptimeTicks / 100) : null,
      receivedPrefixes: null,
      acceptedPrefixes: null,
      advertisedPrefixes: null,
      lastChange: null,
    });
  }

  return peers.sort((left, right) => left.peerIp.localeCompare(right.peerIp));
}

export async function collectRfc4273BgpPeers(
  deviceId: number,
  session: SnmpSession,
  warnings: string[],
): Promise<CollectedBgpPeerRow[]> {
  const localAs = await resolveLocalAs(deviceId, session, warnings);

  const rfc4273 = await walkPeerColumns(session, RFC4273_BGP_PEER_COLUMNS, warnings, "rfc4273");
  const peers = rowsToPeers(rfc4273, localAs, warnings);
  if (peers.length > 0) return peers;

  warnings.push("rfc4273 bgpPeerTable (15.2.1) empty - trying BGP4-MIB 15.3.1");
  const legacy = await walkPeerColumns(session, BGP4_MIB_PEER_COLUMNS, warnings, "bgp4-mib");
  return rowsToPeers(legacy, localAs, warnings);
}

export async function withBgpSnmpSession<T>(
  host: string,
  community: string,
  fn: (session: SnmpSession) => Promise<T>,
): Promise<T> {
  const opts = getBgpWalkSessionOptions();
  const session = createSnmpSession(host, community, opts);
  try {
    return await fn(session);
  } finally {
    session.close();
  }
}

export async function snmpGetPreflightOid(
  host: string,
  community: string,
  oid: string,
  options: { timeoutMs: number; retries: number },
): Promise<void> {
  const session = createSnmpSession(host, community, {
    timeout: options.timeoutMs,
    retries: options.retries,
  });
  try {
    await snmpGet(session, oid);
  } finally {
    session.close();
  }
}
