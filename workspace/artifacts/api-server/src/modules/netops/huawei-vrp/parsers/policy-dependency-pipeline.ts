import type { BgpPeerSummary, DeviceDiscoverySnapshot, DiscoverySource, RoutePolicySummary } from "../../device-discovery/discovery.types.js";
import {
  buildBgpPolicyBindingsFromPeerModel,
  parseHuaweiBgpPeerDependencies,
  type ParsedHuaweiBgpPeerDependencyModel,
} from "./bgp-peer-dependency-parser.js";
import { extractRoutePolicyIfMatchDependencies, normalizePolicyLookupKey, normalizePolicyObjectName } from "./policy-utils.js";

export type CatalogStatus = "loaded" | "empty" | "unknown" | "failed";
export type DependencyStatus = "FOUND" | "MISSING" | "UNKNOWN" | "ORPHAN";
export type PolicyDependencyType = "ip-prefix" | "ipv6-prefix" | "community-filter" | "as-path-filter" | "extcommunity-filter" | "acl" | "route-policy";

export interface PolicyCatalogEntry {
  name: string;
  type: string;
  entries: Array<Record<string, unknown>>;
  source: DiscoverySource;
  raw?: string;
}

export interface PolicyConsumerNode {
  sequence: number | null;
  action: string | null;
  matches: string[];
  applies: string[];
}

export interface PolicyRoutePolicyConsumer {
  name: string;
  nodes: PolicyConsumerNode[];
  source: DiscoverySource;
}

export interface PolicyBgpConsumer {
  name: string;
  peerIp?: string;
  importPolicy: string | null;
  exportPolicy: string | null;
  source: DiscoverySource;
}

export interface RoutePolicyDependency {
  routePolicy: string;
  node: number | null;
  dependencyType: Exclude<PolicyDependencyType, "route-policy">;
  dependencyName: string;
  raw: string;
  source: DiscoverySource;
  status: DependencyStatus;
  evidence: string;
  reason?: string;
}

export interface BgpPolicyBindingDependency {
  consumerType: "bgp_peer" | "peer_group" | "vpn_instance";
  consumerName: string;
  peerIp?: string;
  direction: "import" | "export";
  routePolicy: string;
  source: DiscoverySource;
  status: DependencyStatus;
  evidence: string;
  reason?: string;
  afiSafi?: string;
  inheritedFromGroup?: boolean;
  inheritedGroup?: string;
}

export interface ParsedPolicyDependencyConfig {
  catalogs: {
    community_filters: Record<string, PolicyCatalogEntry>;
    ip_prefixes: Record<string, PolicyCatalogEntry>;
    ipv6_prefixes: Record<string, PolicyCatalogEntry>;
    as_path_filters: Record<string, PolicyCatalogEntry>;
    extcommunity_filters: Record<string, PolicyCatalogEntry>;
    acls: Record<string, PolicyCatalogEntry>;
  };
  consumers: {
    route_policies: Record<string, PolicyRoutePolicyConsumer>;
    bgp_peers: Record<string, PolicyBgpConsumer>;
    peer_groups: Record<string, PolicyBgpConsumer>;
    vpn_instances: Record<string, Record<string, unknown>>;
  };
  dependency_graph: {
    route_policy_dependencies: RoutePolicyDependency[];
    bgp_policy_bindings: BgpPolicyBindingDependency[];
  };
  catalog_status: {
    community_filters: CatalogStatus;
    ip_prefixes: CatalogStatus;
    ipv6_prefixes: CatalogStatus;
    as_path_filters: CatalogStatus;
    extcommunity_filters: CatalogStatus;
    acls: CatalogStatus;
    route_policies: CatalogStatus;
  };
  bgp_peer_model?: ParsedHuaweiBgpPeerDependencyModel;
}

const emptyCatalogs = (): ParsedPolicyDependencyConfig["catalogs"] => ({
  community_filters: {},
  ip_prefixes: {},
  ipv6_prefixes: {},
  as_path_filters: {},
  extcommunity_filters: {},
  acls: {},
});

function statusFor(catalog: Record<string, unknown>, parserRan: boolean): CatalogStatus {
  if (!parserRan) return "unknown";
  return Object.keys(catalog).length > 0 ? "loaded" : "empty";
}

function hasName(catalog: Record<string, unknown>, name: string): boolean {
  return Boolean(catalog[normalizePolicyLookupKey(name)]);
}

function addCatalogEntry(
  catalog: Record<string, PolicyCatalogEntry>,
  name: string,
  entry: Omit<PolicyCatalogEntry, "name">,
): void {
  const normalizedName = normalizePolicyObjectName(name);
  if (!normalizedName) return;
  const key = normalizePolicyLookupKey(normalizedName);
  const current = catalog[key] ?? {
    name: normalizedName,
    type: entry.type,
    entries: [],
    source: entry.source,
    raw: entry.raw,
  };
  current.entries.push(...entry.entries);
  if (entry.raw && !current.raw) current.raw = entry.raw;
  catalog[key] = current;
}

function dependencyStatus(
  catalog: Record<string, PolicyCatalogEntry>,
  catalogStatus: CatalogStatus,
  name: string,
): { status: DependencyStatus; reason?: string } {
  if (catalogStatus !== "loaded") {
    return { status: "UNKNOWN", reason: `catálogo status=${catalogStatus}` };
  }
  return hasName(catalog, name)
    ? { status: "FOUND" }
    : { status: "MISSING" };
}

function dependencyEvidence(routePolicy: string, node: number | null, type: string, name: string, status: DependencyStatus, source: DiscoverySource, reason?: string): string {
  if (status === "FOUND") return `${type} ${name} encontrado no snapshot (${source}).`;
  if (status === "MISSING") return `Route-policy ${routePolicy} node ${node ?? "sem-node"} referencia ${type} ${name}, mas ele não foi encontrado no snapshot (${source}).`;
  return `Catálogo ${type} indisponível para route-policy ${routePolicy} node ${node ?? "sem-node"}; motivo=${reason ?? "unknown"}; source=${source}.`;
}

function bindingEvidence(consumerName: string, direction: "import" | "export", policy: string, status: DependencyStatus, source: DiscoverySource, reason?: string): string {
  if (status === "FOUND") return `BGP consumer ${consumerName} ${direction} route-policy ${policy} encontrado no snapshot (${source}).`;
  if (status === "MISSING") return `BGP consumer ${consumerName} referencia route-policy ${policy} ${direction}, mas ela não foi encontrada no snapshot (${source}).`;
  return `Catálogo route-policy indisponível para BGP consumer ${consumerName}; motivo=${reason ?? "unknown"}; source=${source}.`;
}

export function emptyPolicyDependencyConfig(source: DiscoverySource = "local_db"): ParsedPolicyDependencyConfig {
  const catalogs = emptyCatalogs();
  return {
    catalogs,
    consumers: {
      route_policies: {},
      bgp_peers: {},
      peer_groups: {},
      vpn_instances: {},
    },
    dependency_graph: {
      route_policy_dependencies: [],
      bgp_policy_bindings: [],
    },
    catalog_status: {
      community_filters: "unknown",
      ip_prefixes: "unknown",
      ipv6_prefixes: "unknown",
      as_path_filters: "unknown",
      extcommunity_filters: "unknown",
      acls: "unknown",
      route_policies: "unknown",
    },
  };
}

export function parseHuaweiPolicyDependencyPipeline(configText: string, source: DiscoverySource = "ssh_running_config"): ParsedPolicyDependencyConfig {
  const catalogs = emptyCatalogs();
  const routePolicies: Record<string, PolicyRoutePolicyConsumer> = {};
  const routePolicyDependencies: RoutePolicyDependency[] = [];
  const lines = (configText || "").replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
  const parserRan = configText.trim().length > 0;
  let currentPolicy: PolicyRoutePolicyConsumer | null = null;
  let currentNode: PolicyConsumerNode | null = null;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line === "#") continue;

    const community = /^ip\s+community-filter\s+(basic|advanced)\s+(\S+)(?:\s+index\s+(\d+))?\s+(permit|deny)\s+(.+)$/i.exec(line);
    if (community) {
      addCatalogEntry(catalogs.community_filters, community[2], {
        type: community[1].toLowerCase(),
        source,
        raw: line,
        entries: [{
          type: community[1].toLowerCase(),
          index: community[3] ? Number(community[3]) : null,
          action: community[4].toLowerCase(),
          value: community[5].trim(),
          raw: line,
        }],
      });
      continue;
    }

    const ipPrefix = /^ip\s+ip-prefix\s+(\S+)(?:\s+index\s+(\d+))?\s+(.+)$/i.exec(line);
    if (ipPrefix) {
      addCatalogEntry(catalogs.ip_prefixes, ipPrefix[1], {
        type: "ip-prefix",
        source,
        raw: line,
        entries: [{ index: ipPrefix[2] ? Number(ipPrefix[2]) : null, expression: ipPrefix[3].trim(), raw: line }],
      });
      continue;
    }

    const ipv6Prefix = /^ip\s+ipv6-prefix\s+(\S+)(?:\s+index\s+(\d+))?\s+(.+)$/i.exec(line);
    if (ipv6Prefix) {
      addCatalogEntry(catalogs.ipv6_prefixes, ipv6Prefix[1], {
        type: "ipv6-prefix",
        source,
        raw: line,
        entries: [{ index: ipv6Prefix[2] ? Number(ipv6Prefix[2]) : null, expression: ipv6Prefix[3].trim(), raw: line }],
      });
      continue;
    }

    const asPath = /^ip\s+as-path-filter\s+(\S+)(?:\s+index\s+(\d+))?\s+(permit|deny)\s+(.+)$/i.exec(line);
    if (asPath) {
      addCatalogEntry(catalogs.as_path_filters, asPath[1], {
        type: "as-path-filter",
        source,
        raw: line,
        entries: [{ index: asPath[2] ? Number(asPath[2]) : null, action: asPath[3].toLowerCase(), value: asPath[4].trim(), raw: line }],
      });
      continue;
    }

    const extCommunity = /^ip\s+extcommunity-filter\s+(basic|advanced)\s+(\S+)(?:\s+index\s+(\d+))?\s+(permit|deny)\s+(.+)$/i.exec(line);
    if (extCommunity) {
      addCatalogEntry(catalogs.extcommunity_filters, extCommunity[2], {
        type: extCommunity[1].toLowerCase(),
        source,
        raw: line,
        entries: [{ index: extCommunity[3] ? Number(extCommunity[3]) : null, action: extCommunity[4].toLowerCase(), value: extCommunity[5].trim(), raw: line }],
      });
      continue;
    }

    const acl = /^(?:acl\s+(?:name\s+)?(\S+)|acl\s+number\s+(\S+))$/i.exec(line);
    if (acl) {
      addCatalogEntry(catalogs.acls, acl[1] ?? acl[2], {
        type: "acl",
        source,
        raw: line,
        entries: [{ raw: line }],
      });
      continue;
    }

    const routePolicy = /^route-policy\s+(\S+)\s+(permit|deny)\s+node\s+(\d+)$/i.exec(line);
    if (routePolicy) {
      const policyName = normalizePolicyObjectName(routePolicy[1]);
      const key = normalizePolicyLookupKey(policyName);
      currentPolicy = routePolicies[key] ?? { name: policyName, nodes: [], source };
      currentNode = { sequence: Number(routePolicy[3]), action: routePolicy[2].toLowerCase(), matches: [], applies: [] };
      currentPolicy.nodes.push(currentNode);
      routePolicies[key] = currentPolicy;
      continue;
    }

    if (currentNode && /^if-match\b/i.test(line)) {
      currentNode.matches.push(line);
      if (!currentPolicy) continue;
      for (const ref of extractRoutePolicyIfMatchDependencies(line)) {
        routePolicyDependencies.push({
          routePolicy: currentPolicy.name,
          node: currentNode.sequence,
          dependencyType: ref.type,
          dependencyName: ref.name,
          raw: line,
          source,
          status: "UNKNOWN",
          evidence: "",
        });
      }
      continue;
    }

    if (currentNode && /^apply\b/i.test(line)) {
      currentNode.applies.push(line);
      continue;
    }

    if (!rawLine.startsWith(" ") && !rawLine.startsWith("\t")) {
      currentNode = null;
      currentPolicy = null;
    }
  }

  const config: ParsedPolicyDependencyConfig = {
    catalogs,
    consumers: {
      route_policies: routePolicies,
      bgp_peers: {},
      peer_groups: {},
      vpn_instances: {},
    },
    dependency_graph: {
      route_policy_dependencies: [],
      bgp_policy_bindings: [],
    },
    catalog_status: {
      community_filters: statusFor(catalogs.community_filters, parserRan),
      ip_prefixes: statusFor(catalogs.ip_prefixes, parserRan),
      ipv6_prefixes: statusFor(catalogs.ipv6_prefixes, parserRan),
      as_path_filters: statusFor(catalogs.as_path_filters, parserRan),
      extcommunity_filters: statusFor(catalogs.extcommunity_filters, parserRan),
      acls: statusFor(catalogs.acls, parserRan),
      route_policies: statusFor(routePolicies, parserRan),
    },
  };

  config.dependency_graph.route_policy_dependencies = routePolicyDependencies.map((dep) => resolveRoutePolicyDependency(config, dep));
  const bgpModel = parseHuaweiBgpPeerDependencies(configText, source);
  config.bgp_peer_model = bgpModel;
  if (bgpModel.root_context_loaded) {
    config.dependency_graph.bgp_policy_bindings = buildBgpPolicyBindingsFromPeerModel(
      bgpModel,
      config.consumers.route_policies,
      config.catalog_status.route_policies,
      source,
    );
  }
  return config;
}

export function buildPolicyDependencyConfigFromSnapshot(snapshot: DeviceDiscoverySnapshot): ParsedPolicyDependencyConfig {
  const existing = (snapshot as unknown as { parsed_config?: ParsedPolicyDependencyConfig; parsedConfig?: ParsedPolicyDependencyConfig }).parsed_config
    ?? (snapshot as unknown as { parsedConfig?: ParsedPolicyDependencyConfig }).parsedConfig;
  if (existing?.catalogs && existing?.consumers && existing?.dependency_graph && existing?.catalog_status) {
    const source = snapshot.sourcesUsed?.[0] ?? "local_db";
    const bgpBindings = existing.bgp_peer_model?.root_context_loaded
      ? buildBgpPolicyBindingsFromPeerModel(
        existing.bgp_peer_model,
        existing.consumers.route_policies,
        existing.catalog_status.route_policies,
        source,
      )
      : existing.dependency_graph.bgp_policy_bindings.length > 0
        ? existing.dependency_graph.bgp_policy_bindings
        : buildBgpPolicyBindings(existing, snapshot.bgpPeers ?? [], snapshot.policies ?? []);
    return {
      ...existing,
      dependency_graph: {
        ...existing.dependency_graph,
        bgp_policy_bindings: bgpBindings,
      },
    };
  }

  const source = snapshot.sourcesUsed?.[0] ?? "local_db";
  const catalogs = emptyCatalogs();
  for (const community of snapshot.communities ?? []) {
    addCatalogEntry(catalogs.community_filters, community.name, { type: "community-filter", source: community.source, entries: Array.isArray(community.entries) ? community.entries as Array<Record<string, unknown>> : [] });
  }
  for (const prefix of snapshot.prefixLists ?? []) {
    addCatalogEntry(catalogs.ip_prefixes, prefix.name, { type: "ip-prefix", source: prefix.source, entries: Array.isArray(prefix.entries) ? prefix.entries as Array<Record<string, unknown>> : [] });
  }
  for (const prefix of snapshot.ipv6PrefixLists ?? []) {
    addCatalogEntry(catalogs.ipv6_prefixes, prefix.name, { type: "ipv6-prefix", source: prefix.source, entries: Array.isArray(prefix.entries) ? prefix.entries as Array<Record<string, unknown>> : [] });
  }
  for (const asPath of snapshot.asPathFilters ?? []) {
    addCatalogEntry(catalogs.as_path_filters, asPath.name, { type: "as-path-filter", source: asPath.source, entries: Array.isArray(asPath.entries) ? asPath.entries as Array<Record<string, unknown>> : [] });
  }
  for (const extcommunity of snapshot.extcommunityFilters ?? []) {
    addCatalogEntry(catalogs.extcommunity_filters, extcommunity.name, { type: "extcommunity-filter", source: extcommunity.source, entries: Array.isArray(extcommunity.entries) ? extcommunity.entries as Array<Record<string, unknown>> : [] });
  }
  for (const acl of snapshot.aclFilters ?? []) {
    addCatalogEntry(catalogs.acls, acl.name, { type: "acl", source: acl.source, entries: Array.isArray(acl.entries) ? acl.entries as Array<Record<string, unknown>> : [] });
  }

  const routePolicies: Record<string, PolicyRoutePolicyConsumer> = {};
  for (const policy of snapshot.policies ?? []) {
    routePolicies[normalizePolicyLookupKey(policy.name)] = {
      name: policy.name,
      source: policy.source,
      nodes: policy.nodes.map((node) => ({
        sequence: node.sequence,
        action: node.action,
        matches: node.matches,
        applies: node.applies,
      })),
    };
  }

  const peers: Record<string, PolicyBgpConsumer> = {};
  for (const peer of snapshot.bgpPeers ?? []) {
    peers[peer.peerIp] = {
      name: peer.name ?? peer.description ?? peer.peerIp,
      peerIp: peer.peerIp,
      importPolicy: peer.importPolicy,
      exportPolicy: peer.exportPolicy,
      source: peer.source,
    };
  }

  const config: ParsedPolicyDependencyConfig = {
    catalogs,
    consumers: {
      route_policies: routePolicies,
      bgp_peers: peers,
      peer_groups: {},
      vpn_instances: {},
    },
    dependency_graph: {
      route_policy_dependencies: [],
      bgp_policy_bindings: [],
    },
    catalog_status: {
      community_filters: statusFor(catalogs.community_filters, true),
      ip_prefixes: statusFor(catalogs.ip_prefixes, true),
      ipv6_prefixes: statusFor(catalogs.ipv6_prefixes, true),
      as_path_filters: statusFor(catalogs.as_path_filters, Boolean(snapshot.asPathFilters)),
      extcommunity_filters: statusFor(catalogs.extcommunity_filters, Boolean(snapshot.extcommunityFilters)),
      acls: statusFor(catalogs.acls, Boolean(snapshot.aclFilters)),
      route_policies: statusFor(routePolicies, true),
    },
  };

  for (const policy of snapshot.policies ?? []) {
    for (const node of policy.nodes ?? []) {
      for (const detail of node.matchDetails ?? []) {
        const dependencyType = detail.type === "community-filter" || detail.type === "ip-prefix" || detail.type === "ipv6-prefix" || detail.type === "as-path-filter" || detail.type === "extcommunity-filter" || detail.type === "acl"
          ? detail.type
          : null;
        if (!dependencyType) continue;
        config.dependency_graph.route_policy_dependencies.push(resolveRoutePolicyDependency(config, {
          routePolicy: policy.name,
          node: node.sequence,
          dependencyType,
          dependencyName: detail.name,
          raw: detail.raw,
          source: policy.source,
          status: "UNKNOWN",
          evidence: "",
        }));
      }
    }
  }

  if (config.bgp_peer_model?.root_context_loaded) {
    config.dependency_graph.bgp_policy_bindings = buildBgpPolicyBindingsFromPeerModel(
      config.bgp_peer_model,
      config.consumers.route_policies,
      config.catalog_status.route_policies,
      snapshot.sourcesUsed?.[0] ?? "local_db",
    );
  } else {
    config.dependency_graph.bgp_policy_bindings = buildBgpPolicyBindings(config, snapshot.bgpPeers ?? [], snapshot.policies ?? []);
  }
  return config;
}

export function resolveRoutePolicyDependency(config: ParsedPolicyDependencyConfig, dep: RoutePolicyDependency): RoutePolicyDependency {
  const catalogMap = {
    "community-filter": config.catalogs.community_filters,
    "ip-prefix": config.catalogs.ip_prefixes,
    "ipv6-prefix": config.catalogs.ipv6_prefixes,
    "as-path-filter": config.catalogs.as_path_filters,
    "extcommunity-filter": config.catalogs.extcommunity_filters,
    acl: config.catalogs.acls,
  } satisfies Record<Exclude<PolicyDependencyType, "route-policy">, Record<string, PolicyCatalogEntry>>;
  const statusMap = {
    "community-filter": config.catalog_status.community_filters,
    "ip-prefix": config.catalog_status.ip_prefixes,
    "ipv6-prefix": config.catalog_status.ipv6_prefixes,
    "as-path-filter": config.catalog_status.as_path_filters,
    "extcommunity-filter": config.catalog_status.extcommunity_filters,
    acl: config.catalog_status.acls,
  } satisfies Record<Exclude<PolicyDependencyType, "route-policy">, CatalogStatus>;
  const resolved = dependencyStatus(catalogMap[dep.dependencyType], statusMap[dep.dependencyType], dep.dependencyName);
  return {
    ...dep,
    status: resolved.status,
    reason: resolved.reason,
    evidence: dependencyEvidence(dep.routePolicy, dep.node, dep.dependencyType, dep.dependencyName, resolved.status, dep.source, resolved.reason),
  };
}

export function buildBgpPolicyBindings(
  config: ParsedPolicyDependencyConfig,
  peers: BgpPeerSummary[],
  policies: RoutePolicySummary[],
): BgpPolicyBindingDependency[] {
  const routePolicyStatus = config.catalog_status.route_policies;
  const routePolicyNames = new Set(policies.map((policy) => normalizePolicyLookupKey(policy.name)));
  const bindings: BgpPolicyBindingDependency[] = [];
  for (const peer of peers) {
    for (const direction of ["import", "export"] as const) {
      const routePolicy = direction === "import" ? peer.importPolicy : peer.exportPolicy;
      if (!routePolicy) continue;
      const resolved = routePolicyStatus !== "loaded"
        ? { status: "UNKNOWN" as const, reason: `catálogo route-policy status=${routePolicyStatus}` }
        : routePolicyNames.has(normalizePolicyLookupKey(routePolicy))
          ? { status: "FOUND" as const }
          : { status: "MISSING" as const };
      const consumerName = peer.name ?? peer.description ?? peer.peerIp;
      bindings.push({
        consumerType: "bgp_peer",
        consumerName,
        peerIp: peer.peerIp,
        direction,
        routePolicy,
        source: peer.source,
        status: resolved.status,
        reason: resolved.reason,
        evidence: bindingEvidence(consumerName, direction, routePolicy, resolved.status, peer.source, resolved.reason),
      });
    }
  }
  return bindings;
}
