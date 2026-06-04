import { buildPolicyDependencyConfigFromSnapshot } from "../netops/huawei-vrp/parsers/policy-dependency-pipeline.js";
import { normalizePolicyLookupKey, normalizePolicyObjectName } from "../netops/huawei-vrp/parsers/policy-utils.js";
import type {
  BgpPeerCleanupDependency,
  BgpPeerCleanupDependencyBuckets,
  BgpPeerCleanupDependencyStatus,
  BgpPeerCleanupDependencyType,
  BgpPeerCleanupObjectUsage,
  BgpPeerCleanupTwinPeer,
} from "./bgp-drill-cleanup.types.js";
import type { BgpPeerDrilldownResult } from "../bgp-drilldown/bgp-peer-drilldown.types.js";
import type { DeviceDiscoverySnapshot, BgpPeerSummary } from "../netops/device-discovery/discovery.types.js";

function normalizeKey(value: string): string {
  return normalizePolicyLookupKey(value);
}

function peerIdentity(peer: BgpPeerSummary): string {
  return `${peer.peerIp}|${peer.vrf ?? ""}|${peer.addressFamily}`;
}

function objectUsageStatus(usage: BgpPeerSummary[], targetPeerIp: string): BgpPeerCleanupDependencyStatus {
  if (usage.length === 0) return "ambiguous";
  const otherUsers = usage.filter((peer) => peer.peerIp !== targetPeerIp);
  if (otherUsers.length === 0) return "exclusive";
  return "shared";
}

function mapPeerUsageToDependencyUsers(peers: BgpPeerSummary[]) {
  return peers.map((peer) => ({
    peerIp: peer.peerIp,
    state: peer.state,
    vrf: peer.vrf ?? null,
    afi: peer.addressFamily,
    safi: peer.sessionType === "iBGP" || peer.sessionType === "eBGP" ? "unicast" : "unicast",
  }));
}

function collectPeerPolicyNames(snapshot: DeviceDiscoverySnapshot, policyName: string): BgpPeerSummary[] {
  const target = normalizeKey(policyName);
  return snapshot.bgpPeers.filter((peer) => {
    const importPolicy = normalizeKey(peer.importPolicy ?? "");
    const exportPolicy = normalizeKey(peer.exportPolicy ?? "");
    return importPolicy === target || exportPolicy === target;
  });
}

function buildObjectUsageMap(snapshot: DeviceDiscoverySnapshot, targetPeerIp: string) {
  const config = buildPolicyDependencyConfigFromSnapshot(snapshot, { rawConfig: "" });
  const usage = new Map<string, BgpPeerCleanupObjectUsage>();

  for (const dep of config.dependency_graph.route_policy_dependencies) {
    if (!dep.dependencyType) continue;
    const key = `${dep.dependencyType}|${normalizeKey(dep.dependencyName)}`;
    const existing = usage.get(key) ?? {
      type: dep.dependencyType as BgpPeerCleanupDependencyType,
      name: normalizePolicyObjectName(dep.dependencyName),
      routePolicies: [],
      peers: [],
      status: "ambiguous" as const,
    };
    if (!existing.routePolicies.includes(dep.routePolicy)) {
      existing.routePolicies.push(dep.routePolicy);
    }
    usage.set(key, existing);
  }

  for (const [key, entry] of usage) {
    const [type, name] = key.split("|", 2);
    const policies = entry.routePolicies.map((policyName) =>
      collectPeerPolicyNames(snapshot, policyName),
    ).flat();
    const peerMap = new Map<string, BgpPeerSummary>();
    for (const peer of policies) {
      peerMap.set(peerIdentity(peer), peer);
    }
    const peers = [...peerMap.values()];
    entry.peers = peers;
    entry.status = objectUsageStatus(peers, targetPeerIp);
    if (entry.status === "shared") {
      entry.reason = `${type} ${name} usado por outros peers`;
    } else if (entry.status === "exclusive") {
      entry.reason = `${type} ${name} usado somente pelo peer alvo`;
    } else {
      entry.reason = `uso insuficiente para provar exclusividade de ${type} ${name}`;
    }
    usage.set(key, entry);
  }

  return usage;
}

function collectPolicyUsages(snapshot: DeviceDiscoverySnapshot, policyName: string) {
  const target = normalizeKey(policyName);
  return snapshot.bgpPeers.filter((peer) => {
    const importPolicy = normalizeKey(peer.importPolicy ?? "");
    const exportPolicy = normalizeKey(peer.exportPolicy ?? "");
    return importPolicy === target || exportPolicy === target;
  });
}

function toDependency(
  type: BgpPeerCleanupDependencyType,
  name: string,
  status: BgpPeerCleanupDependencyStatus,
  users: BgpPeerSummary[],
  evidence: string,
  reason?: string | null,
  source: BgpPeerCleanupDependency["source"] = "discovery",
): BgpPeerCleanupDependency {
  return {
    type,
    name: normalizePolicyObjectName(name),
    status,
    users: mapPeerUsageToDependencyUsers(users),
    evidence,
    reason,
    source,
  };
}

export function analyzeBgpPeerCleanupDependencies(input: {
  targetPeerIp: string;
  snapshot: DeviceDiscoverySnapshot;
  drilldown: BgpPeerDrilldownResult;
}): BgpPeerCleanupDependencyBuckets {
  const exclusive: BgpPeerCleanupDependency[] = [];
  const shared: BgpPeerCleanupDependency[] = [];
  const ambiguous: BgpPeerCleanupDependency[] = [];
  const objectUsage = buildObjectUsageMap(input.snapshot, input.targetPeerIp);
  const seen = new Set<string>();

  for (const effectivePolicy of input.drilldown.effectivePolicies) {
    const policyName = normalizePolicyObjectName(effectivePolicy.policyName);
    const policyUsers = collectPolicyUsages(input.snapshot, policyName);
    const policyStatus = objectUsageStatus(policyUsers, input.targetPeerIp);
    const policyEvidence = `route-policy ${policyName} usado por ${policyUsers.length} peer(s)`;
    const policyDependency = toDependency(
      "route-policy",
      policyName,
      policyStatus,
      policyUsers,
      policyEvidence,
      policyUsers.length === 0 ? "Nenhum uso comprovado no snapshot" : null,
      "discovery",
    );
    const policyKey = `route-policy|${normalizeKey(policyName)}`;
    if (!seen.has(policyKey)) {
      seen.add(policyKey);
      (policyStatus === "exclusive" ? exclusive : policyStatus === "shared" ? shared : ambiguous).push(policyDependency);
    }
  }

  for (const policy of input.drilldown.policies) {
    for (const dep of policy.dependencies) {
      if (dep.dependencyType === "route-policy") continue;
      const key = `${dep.dependencyType}|${normalizeKey(dep.dependencyName)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const usage = objectUsage.get(key);
      const status = usage?.status ?? "ambiguous";
      const users = usage?.peers ?? [];
      const evidence = usage?.routePolicies.length
        ? `${dep.dependencyType} ${normalizePolicyObjectName(dep.dependencyName)} usado por ${usage.routePolicies.join(", ")}`
        : dep.evidence;
      const reason = usage?.reason ?? (status === "ambiguous" ? "uso insuficiente para prova" : null);
      const item = toDependency(
        dep.dependencyType as BgpPeerCleanupDependencyType,
        dep.dependencyName,
        status,
        users,
        evidence,
        reason,
        dep.source === "ssh_running_config" ? "collected_config" : "discovery",
      );
      (status === "exclusive" ? exclusive : status === "shared" ? shared : ambiguous).push(item);
    }
  }

  return { exclusive, shared, ambiguous };
}

export function findTwinPeer(input: {
  snapshot: DeviceDiscoverySnapshot;
  targetPeer: BgpPeerSummary;
}): BgpPeerCleanupTwinPeer | null {
  const oppositeAf = input.targetPeer.addressFamily === "ipv4" ? "ipv6" : input.targetPeer.addressFamily === "ipv6" ? "ipv4" : "unknown";
  if (oppositeAf === "unknown") return null;

  const sameVrfs = input.snapshot.bgpPeers.filter((peer) =>
    peer.peerIp !== input.targetPeer.peerIp
    && peer.addressFamily === oppositeAf
    && peer.vrf === input.targetPeer.vrf
    && (peer.remoteAs === input.targetPeer.remoteAs || peer.name === input.targetPeer.name || peer.description === input.targetPeer.description),
  );

  const activeTwin = sameVrfs.find((peer) => peer.state === "Established");
  const candidate = activeTwin ?? sameVrfs[0];
  if (!candidate) return null;
  return {
    peerIp: candidate.peerIp,
    state: candidate.state,
    afi: candidate.addressFamily,
    vrf: candidate.vrf ?? null,
    remoteAs: candidate.remoteAs ?? null,
  };
}
