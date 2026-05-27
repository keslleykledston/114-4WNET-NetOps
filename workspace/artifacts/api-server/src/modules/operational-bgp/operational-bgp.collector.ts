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

/**
 * Try collectors in order: RFC4273 → BGP4-V2 → Huawei.
 * H3.1: stub/offline — always returns empty peer set, no snmpWalk.
 */
export async function collectBgpPeers(_input: {
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
