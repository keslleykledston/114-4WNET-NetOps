import type { BgpPeerDetails, BgpPeerSummary, CommunityFilter, CommunityList, PrefixList, RoutePolicySummary } from "../discovery.types.js";
import { sourceConfidence } from "../source-priority.js";
import type { NetopsBgpPeer } from "../../types.js";

function normalizeLegacyRole(role: NetopsBgpPeer["role"] | null | undefined): NetopsBgpPeer["role"] | null {
  if (!role || role === "unknown") return null;
  return role;
}

function normalizeLegacyRoleSource(roleSource: NetopsBgpPeer["roleSource"] | null | undefined): NetopsBgpPeer["roleSource"] | null {
  if (!roleSource || roleSource === "unknown") return null;
  return roleSource;
}

export function primaryDirectionForRole(role: NetopsBgpPeer["role"]): BgpPeerSummary["primaryDirection"] {
  if (role === "customer") return "import";
  if (role === "ibgp") return "internal";
  return "export";
}

export function normalizeDiscoveryBgpPeers(
  sshPeers: NetopsBgpPeer[],
  snmpPeers: NetopsBgpPeer[],
  cachedPeers: NetopsBgpPeer[],
  localDbPeers: NetopsBgpPeer[] = [],
): BgpPeerSummary[] {
  const byPeer = new Map<string, BgpPeerSummary>();

  const upsert = (peer: NetopsBgpPeer, source: BgpPeerSummary["source"], evidence: string) => {
    const key = `${peer.peerIp}|${peer.addressFamily}|${peer.vrf ?? ""}`;
    const current = byPeer.get(key);
    const merged: NetopsBgpPeer = {
      ...(current ?? peer),
      ...peer,
      state: peer.state !== "Unknown" ? peer.state : current?.state ?? peer.state,
      role: normalizeLegacyRole(peer.role) ?? normalizeLegacyRole(current?.role) ?? "customer",
      roleSource: normalizeLegacyRoleSource(peer.roleSource) ?? normalizeLegacyRoleSource(current?.roleSource) ?? "classifier",
      importPolicy: peer.importPolicy ?? current?.importPolicy ?? null,
      exportPolicy: peer.exportPolicy ?? current?.exportPolicy ?? null,
      description: peer.description ?? current?.description ?? null,
      name: peer.name ?? current?.name ?? null,
      receivedPrefixes: peer.receivedPrefixes ?? current?.receivedPrefixes ?? null,
      advertisedPrefixes: peer.advertisedPrefixes ?? current?.advertisedPrefixes ?? null,
    };
    const received = merged.receivedPrefixes ?? 0;
    const advertised = merged.advertisedPrefixes ?? 0;
    byPeer.set(key, {
      ...merged,
      category: merged.role,
      primaryDirection: primaryDirectionForRole(merged.role),
      largeReceivedRoutes: received > 5000,
      largeAdvertisedRoutes: advertised > 5000,
      autoLoadRoutes: false,
      requiresExplicitRouteSearch: received > 5000 || advertised > 5000,
      source,
      confidence: sourceConfidence(source),
      evidence,
    });
  };

  localDbPeers.forEach((peer) => upsert(peer, "local_db", `local bgp peer ${peer.peerIp}`));
  cachedPeers.forEach((peer) => upsert(peer, "ssh_running_config", `peer ${peer.peerIp}`));
  sshPeers.forEach((peer) => upsert(peer, "ssh_live", `display bgp peer ${peer.peerIp}`));
  snmpPeers.forEach((peer) => upsert(peer, "snmp_snapshot", `bgpPeerRemoteAddr = ${peer.peerIp}`));

  return [...byPeer.values()].sort((left, right) => left.peerIp.localeCompare(right.peerIp));
}

export function buildBgpPeerDetails(
  peer: BgpPeerSummary,
  policies: RoutePolicySummary[],
  communityFilters: CommunityFilter[],
  communityLists: CommunityList[],
  prefixLists: PrefixList[],
): BgpPeerDetails {
  const primaryPolicy = peer.primaryDirection === "export" ? peer.exportPolicy : peer.primaryDirection === "import" ? peer.importPolicy : null;
  const secondaryPolicy = peer.primaryDirection === "export" ? peer.importPolicy : peer.primaryDirection === "import" ? peer.exportPolicy : null;
  const policyNames = [peer.importPolicy, peer.exportPolicy].filter((item): item is string => Boolean(item));
  const matchedPolicies = policies.filter((policy) => policyNames.includes(policy.name));

  return {
    peer,
    category: peer.category,
    primaryDirection: peer.primaryDirection,
    importPolicy: peer.importPolicy,
    exportPolicy: peer.exportPolicy,
    primaryPolicy,
    secondaryPolicy,
    routePolicyNodes: matchedPolicies.flatMap((policy) => policy.nodes),
    referencedIpPrefixes: prefixLists,
    referencedCommunityFilters: communityFilters,
    referencedCommunityLists: communityLists,
    routeCounters: {
      receivedRoutes: peer.receivedPrefixes,
      advertisedRoutes: peer.advertisedPrefixes,
      largeReceivedRoutes: peer.largeReceivedRoutes,
      largeAdvertisedRoutes: peer.largeAdvertisedRoutes,
      autoLoadRoutes: false,
      requiresExplicitRouteSearch: peer.requiresExplicitRouteSearch,
    },
    operationalState: peer.state,
    protections: {
      noFullDumpAutomatic: true,
      sampleLimit: 50,
      maxAutoRoutes: 5000,
    },
    evidence: [{ source: peer.source, confidence: peer.confidence, evidence: peer.evidence }],
  };
}
