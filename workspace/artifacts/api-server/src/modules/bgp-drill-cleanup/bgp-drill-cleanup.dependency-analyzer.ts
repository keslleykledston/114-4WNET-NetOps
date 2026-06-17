import { buildPolicyDependencyConfigFromSnapshot } from "../netops/huawei-vrp/parsers/policy-dependency-pipeline.js";
import { normalizePolicyLookupKey, normalizePolicyObjectName } from "../netops/huawei-vrp/parsers/policy-utils.js";
import {
  GLOBAL_CLEANUP_OBJECT_REASON,
  isGlobalCleanupObject,
} from "./bgp-drill-cleanup-global-objects.js";
import type {
  BgpPeerCleanupDependency,
  BgpPeerCleanupDependencyBuckets,
  BgpPeerCleanupDependencyStatus,
  BgpPeerCleanupDependencyType,
  BgpPeerCleanupTwinPeer,
} from "./bgp-drill-cleanup.types.js";
import type { BgpPeerDrilldownResult } from "../bgp-drilldown/bgp-peer-drilldown.types.js";
import type { DeviceDiscoverySnapshot, BgpPeerSummary } from "../netops/device-discovery/discovery.types.js";

function normalizeKey(value: string): string {
  return normalizePolicyLookupKey(value);
}

function inferCommunityFilterMatchType(snapshot: DeviceDiscoverySnapshot, name: string): "basic" | "advanced" | null {
  const target = normalizeKey(name);
  for (const community of snapshot.communities ?? []) {
    if (normalizeKey(community.name) !== target) continue;
    for (const entry of community.entries ?? []) {
      if (!entry || typeof entry !== "object") continue;
      const line = "line" in entry ? String((entry as { line?: unknown }).line ?? "") : "";
      const match = /^\s*ip\s+community-filter\s+(basic|advanced)\s+\S+/i.exec(line);
      if (match) return (match[1] || "basic").toLowerCase() as "basic" | "advanced";
    }
  }
  return null;
}

function peerIdentity(peer: BgpPeerSummary): string {
  return `${peer.peerIp}|${peer.vrf ?? ""}|${peer.addressFamily}`;
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

function collectPolicyUsages(snapshot: DeviceDiscoverySnapshot, policyName: string) {
  return collectPeerPolicyNames(snapshot, policyName);
}

function routePolicyPeerStatus(snapshot: DeviceDiscoverySnapshot, policyName: string, targetPeerIp: string): BgpPeerCleanupDependencyStatus {
  const users = collectPolicyUsages(snapshot, policyName);
  if (users.length === 0) return "ambiguous";
  const otherUsers = users.filter((peer) => peer.peerIp !== targetPeerIp);
  if (otherUsers.length === 0) return "exclusive";
  return "shared";
}

function buildRoutePolicyReferenceMap(snapshot: DeviceDiscoverySnapshot) {
  const config = buildPolicyDependencyConfigFromSnapshot(snapshot, { rawConfig: "" });
  const usage = new Map<string, { type: BgpPeerCleanupDependencyType; name: string; routePolicies: string[] }>();

  for (const dep of config.dependency_graph.route_policy_dependencies) {
    if (!dep.dependencyType) continue;
    const key = `${dep.dependencyType}|${normalizeKey(dep.dependencyName)}`;
    const existing = usage.get(key) ?? {
      type: dep.dependencyType as BgpPeerCleanupDependencyType,
      name: normalizePolicyObjectName(dep.dependencyName),
      routePolicies: [],
    };
    const policyKey = normalizeKey(dep.routePolicy);
    if (!existing.routePolicies.some((policy) => normalizeKey(policy) === policyKey)) {
      existing.routePolicies.push(dep.routePolicy);
    }
    usage.set(key, existing);
  }

  return usage;
}

function classifyCatalogObject(input: {
  type: BgpPeerCleanupDependencyType;
  name: string;
  routePolicies: string[];
  snapshot: DeviceDiscoverySnapshot;
  targetPeerIp: string;
}): { status: BgpPeerCleanupDependencyStatus; reason: string } {
  const displayName = normalizePolicyObjectName(input.name);

  if (isGlobalCleanupObject(displayName)) {
    return { status: "global", reason: GLOBAL_CLEANUP_OBJECT_REASON };
  }

  const uniquePolicies = [...new Set(input.routePolicies.map((policy) => normalizeKey(policy)))];
  if (uniquePolicies.length === 0) {
    return {
      status: "ambiguous",
      reason: `uso insuficiente para provar exclusividade de ${input.type} ${displayName}`,
    };
  }

  if (uniquePolicies.length === 1) {
    const onlyPolicy = input.routePolicies[0];
    const policyStatus = routePolicyPeerStatus(input.snapshot, onlyPolicy, input.targetPeerIp);
    if (policyStatus === "exclusive") {
      return {
        status: "exclusive",
        reason: `${input.type} ${displayName} usado somente pela route-policy exclusiva ${onlyPolicy}`,
      };
    }
    return {
      status: "shared",
      reason: `${input.type} ${displayName} referenciado pela route-policy compartilhada ${onlyPolicy}`,
    };
  }

  return {
    status: "shared",
    reason: `${input.type} ${displayName} referenciado por ${uniquePolicies.length} route-policies`,
  };
}

function classifyRoutePolicy(input: {
  policyName: string;
  snapshot: DeviceDiscoverySnapshot;
  targetPeerIp: string;
}): { status: BgpPeerCleanupDependencyStatus; reason: string; users: BgpPeerSummary[] } {
  const displayName = normalizePolicyObjectName(input.policyName);
  const users = collectPolicyUsages(input.snapshot, displayName);

  if (isGlobalCleanupObject(displayName)) {
    return {
      status: "global",
      reason: GLOBAL_CLEANUP_OBJECT_REASON,
      users,
    };
  }

  const status = routePolicyPeerStatus(input.snapshot, displayName, input.targetPeerIp);
  if (status === "exclusive") {
    return {
      status,
      reason: `route-policy ${displayName} usada somente pelo peer alvo`,
      users,
    };
  }
  if (status === "shared") {
    return {
      status,
      reason: `route-policy ${displayName} usada por outros peers`,
      users,
    };
  }
  return {
    status,
    reason: `Nenhum uso comprovado no snapshot para route-policy ${displayName}`,
    users,
  };
}

function toDependency(
  type: BgpPeerCleanupDependencyType,
  name: string,
  status: BgpPeerCleanupDependencyStatus,
  users: BgpPeerSummary[],
  evidence: string,
  reason?: string | null,
  matchType?: "basic" | "advanced" | null,
  source: BgpPeerCleanupDependency["source"] = "discovery",
): BgpPeerCleanupDependency {
  return {
    type,
    name: normalizePolicyObjectName(name),
    matchType,
    status,
    users: mapPeerUsageToDependencyUsers(users),
    evidence,
    reason,
    source,
  };
}

function pushDependency(
  buckets: BgpPeerCleanupDependencyBuckets,
  item: BgpPeerCleanupDependency,
) {
  switch (item.status) {
    case "exclusive":
      buckets.exclusive.push(item);
      break;
    case "shared":
      buckets.shared.push(item);
      break;
    case "global":
      buckets.global.push(item);
      break;
    default:
      buckets.ambiguous.push(item);
      break;
  }
}

export function analyzeBgpPeerCleanupDependencies(input: {
  targetPeerIp: string;
  snapshot: DeviceDiscoverySnapshot;
  drilldown: BgpPeerDrilldownResult;
}): BgpPeerCleanupDependencyBuckets {
  const buckets: BgpPeerCleanupDependencyBuckets = {
    exclusive: [],
    shared: [],
    global: [],
    ambiguous: [],
  };
  const objectUsage = buildRoutePolicyReferenceMap(input.snapshot);
  const seen = new Set<string>();

  for (const effectivePolicy of input.drilldown.effectivePolicies) {
    const policyName = normalizePolicyObjectName(effectivePolicy.policyName);
    const policyKey = `route-policy|${normalizeKey(policyName)}`;
    if (seen.has(policyKey)) continue;
    seen.add(policyKey);

    const classified = classifyRoutePolicy({
      policyName,
      snapshot: input.snapshot,
      targetPeerIp: input.targetPeerIp,
    });
    pushDependency(
      buckets,
      toDependency(
        "route-policy",
        policyName,
        classified.status,
        classified.users,
        `route-policy ${policyName} usada por ${classified.users.length} peer(s)`,
        classified.reason,
        null,
        "discovery",
      ),
    );
  }

  for (const policy of input.drilldown.policies) {
    for (const dep of policy.dependencies) {
      if (dep.dependencyType === "route-policy") continue;
      const key = `${dep.dependencyType}|${normalizeKey(dep.dependencyName)}`;
      if (seen.has(key)) continue;
      seen.add(key);

      const usage = objectUsage.get(key);
      const classified = classifyCatalogObject({
        type: dep.dependencyType as BgpPeerCleanupDependencyType,
        name: dep.dependencyName,
        routePolicies: usage?.routePolicies ?? [policy.name],
        snapshot: input.snapshot,
        targetPeerIp: input.targetPeerIp,
      });
      const matchType = dep.dependencyType === "community-filter"
        ? inferCommunityFilterMatchType(input.snapshot, dep.dependencyName)
        : null;

      const users = usage?.routePolicies
        .flatMap((policyName) => collectPolicyUsages(input.snapshot, policyName)) ?? [];
      const peerMap = new Map<string, BgpPeerSummary>();
      for (const peer of users) peerMap.set(peerIdentity(peer), peer);

      const evidence = usage?.routePolicies.length
        ? `${dep.dependencyType} ${normalizePolicyObjectName(dep.dependencyName)} referenciado por ${usage.routePolicies.join(", ")}`
        : dep.evidence;

      pushDependency(
        buckets,
        toDependency(
          dep.dependencyType as BgpPeerCleanupDependencyType,
          dep.dependencyName,
          classified.status,
          [...peerMap.values()],
          evidence,
          classified.reason,
          matchType,
          dep.source === "ssh_running_config" ? "collected_config" : "discovery",
        ),
      );
    }
  }

  return buckets;
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
