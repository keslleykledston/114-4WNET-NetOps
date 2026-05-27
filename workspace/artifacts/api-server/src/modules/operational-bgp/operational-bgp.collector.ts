import {
  collectRfc4273BgpPeers,
  withBgpSnmpSession,
} from "./operational-bgp-rfc4273-snmp.js";
import { isNetopsSnmpBgpRealEnabled } from "./operational-bgp.gate.js";
import {
  BGP_MIB_COLLECTOR_ORDER,
  type BgpMibCollector,
  type CollectBgpPeersResult,
  type CollectedBgpPeerRow,
} from "./operational-bgp.types.js";

export { isNetopsSnmpBgpRealEnabled } from "./operational-bgp.gate.js";

/** RFC4273 peer table base — walks deferred to H3.2+. */
export const RFC4273_BGP_PEER_TABLE_BASE = "1.3.6.1.2.1.15.2.1";

/** Placeholder roots for fallback collectors (inventory in pilot). */
export const BGP4_V2_MIB_PLACEHOLDER = "bgp4-v2-mib";
export const HUAWEI_BGP_MIB_PLACEHOLDER = "huawei-bgp-mib";

async function collectFromMibStub(collector: BgpMibCollector): Promise<CollectedBgpPeerRow[]> {
  void collector;
  return [];
}

async function collectStubMode(_input: {
  deviceId: number;
  host: string;
  community: string;
}): Promise<CollectBgpPeersResult> {
  const warnings: string[] = ["H3.1 stub mode: no live SNMP walk executed"];

  for (const collector of BGP_MIB_COLLECTOR_ORDER) {
    const peers = await collectFromMibStub(collector);
    if (peers.length > 0) {
      return { peers, collectorUsed: collector, warnings, stub: true };
    }
  }

  return {
    peers: [],
    collectorUsed: null,
    warnings,
    stub: true,
  };
}

async function collectLiveMode(input: {
  deviceId: number;
  host: string;
  community: string;
}): Promise<CollectBgpPeersResult> {
  const warnings: string[] = [];
  const started = Date.now();

  const peers = await withBgpSnmpSession(input.host, input.community, async (session) => {
    return collectRfc4273BgpPeers(session, warnings);
  });

  console.log(
    `[operational-bgp] walk deviceId=${input.deviceId} ip=${input.host} peerCount=${peers.length} elapsedMs=${Date.now() - started}`,
  );

  if (peers.length > 0) {
    return {
      peers,
      collectorUsed: "rfc4273",
      warnings,
      stub: false,
    };
  }

  warnings.push("all BGP MIB collectors returned zero peers (rfc4273 + bgp4-mib fallback)");

  for (const collector of BGP_MIB_COLLECTOR_ORDER) {
    if (collector === "rfc4273") continue;
    const stubPeers = await collectFromMibStub(collector);
    if (stubPeers.length > 0) {
      return { peers: stubPeers, collectorUsed: collector, warnings, stub: false };
    }
  }

  return {
    peers: [],
    collectorUsed: null,
    warnings,
    stub: false,
  };
}

/**
 * Try collectors in order: RFC4273 → BGP4-V2 → Huawei.
 * Live walk when NETOPS_SNMP_BGP_REAL_ENABLED=true.
 */
export async function collectBgpPeers(input: {
  deviceId: number;
  host: string;
  community: string;
}): Promise<CollectBgpPeersResult> {
  if (!isNetopsSnmpBgpRealEnabled()) {
    return collectStubMode(input);
  }
  return collectLiveMode(input);
}
