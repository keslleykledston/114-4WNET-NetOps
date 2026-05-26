import type { DeviceDiscoverySnapshot } from "../netops/device-discovery/discovery.types.js";
import {
  buildPolicyDependencyConfigFromSnapshot,
  type ParsedPolicyDependencyConfig,
  type RoutePolicyDependency,
} from "../netops/huawei-vrp/parsers/policy-dependency-pipeline.js";
import type { BgpPeerFamily, ParsedHuaweiBgpPeerDependencyModel } from "../netops/huawei-vrp/parsers/bgp-peer-dependency-parser.js";
import {
  extractRoutePolicyIfMatchDependencies,
  normalizePolicyLookupKey,
  normalizePolicyObjectName,
} from "../netops/huawei-vrp/parsers/policy-utils.js";
import {
  EMPTY_ROUTE_TABLES,
  type BgpPeerDependencyEdge,
  type BgpPeerDrilldownQuery,
  type BgpPeerDrilldownResult,
  type BgpPeerEffectivePolicy,
  type BgpPeerFamilyConfig,
  type BgpPeerRoutePolicyDrilldown,
  type BgpPeerRoutePolicyMatchRef,
  type DrilldownSource,
} from "./bgp-peer-drilldown.types.js";

function drilldownSourceFromConfig(config: ParsedPolicyDependencyConfig): DrilldownSource {
  if (config.configBuildSource === "raw_config") return "ssh_full_config";
  if (config.configBuildSource === "parsed_config_cache") return "local_db";
  return "local_db";
}

function discoverySourceFromDrilldown(source: DrilldownSource): DeviceDiscoverySnapshot["sourcesUsed"][number] {
  return source === "ssh_full_config" ? "ssh_running_config" : "local_db";
}

export function resolvePeerKey(peer: string, model: ParsedHuaweiBgpPeerDependencyModel): string | null {
  const key = normalizePolicyLookupKey(peer);
  if (model.roots[key]) return key;
  for (const root of Object.values(model.roots)) {
    if (normalizePolicyLookupKey(root.peerAddressOrName) === key) return root.peerKey;
  }
  for (const fam of model.families) {
    if (normalizePolicyLookupKey(fam.peerAddressOrName) === key) return fam.peerKey;
  }
  return null;
}

function effectivePolicySource(fam: BgpPeerFamily): "peer" | "peer_group" | "none" {
  const hasImport = Boolean(fam.effectiveImportRoutePolicy ?? fam.importRoutePolicy);
  const hasExport = Boolean(fam.effectiveExportRoutePolicy ?? fam.exportRoutePolicy);
  if (!hasImport && !hasExport) return "none";
  if (fam.inheritedFromGroup) return "peer_group";
  return "peer";
}

function policyBindingStatus(
  config: ParsedPolicyDependencyConfig,
  peer: string,
  afiSafi: string,
  direction: "import" | "export",
  policyName: string,
): ParsedPolicyDependencyConfig["dependency_graph"]["bgp_policy_bindings"][number]["status"] {
  const binding = config.dependency_graph.bgp_policy_bindings.find(
    (b) =>
      normalizePolicyLookupKey(b.consumerName) === normalizePolicyLookupKey(peer)
      && b.afiSafi === afiSafi
      && b.direction === direction
      && normalizePolicyLookupKey(b.routePolicy) === normalizePolicyLookupKey(policyName),
  );
  return binding?.status ?? "UNKNOWN";
}

function parseMatchRefs(matches: string[]): BgpPeerRoutePolicyMatchRef[] {
  const refs: BgpPeerRoutePolicyMatchRef[] = [];
  for (const raw of matches) {
    for (const dep of extractRoutePolicyIfMatchDependencies(raw)) {
      refs.push({ type: dep.type, name: dep.name, raw });
    }
    const list = /^if-match\s+community-list\s+(\S+)/i.exec(raw.trim());
    if (list) refs.push({ type: "community-list", name: normalizePolicyObjectName(list[1]), raw });
  }
  return refs;
}

function catalogObjectForDependency(
  config: ParsedPolicyDependencyConfig,
  dep: RoutePolicyDependency,
): Record<string, unknown> | null {
  const maps = {
    "ip-prefix": config.catalogs.ip_prefixes,
    "ipv6-prefix": config.catalogs.ipv6_prefixes,
    "community-filter": config.catalogs.community_filters,
    "as-path-filter": config.catalogs.as_path_filters,
    "extcommunity-filter": config.catalogs.extcommunity_filters,
    acl: config.catalogs.acls,
  } as const;
  const entry = maps[dep.dependencyType]?.[normalizePolicyLookupKey(dep.dependencyName)];
  if (!entry) return null;
  return {
    name: entry.name,
    type: entry.type,
    entries: entry.entries,
    source: entry.source,
  };
}

function buildPolicyDrilldowns(
  config: ParsedPolicyDependencyConfig,
  peerFamilies: BgpPeerFamily[],
  includePolicies: boolean,
  includePolicyObjects: boolean,
): BgpPeerRoutePolicyDrilldown[] {
  if (!includePolicies) return [];

  const policies: BgpPeerRoutePolicyDrilldown[] = [];
  const seen = new Set<string>();

  for (const fam of peerFamilies) {
    for (const direction of ["import", "export"] as const) {
      const policyName = direction === "import" ? fam.effectiveImportRoutePolicy : fam.effectiveExportRoutePolicy;
      if (!policyName) continue;
      const dedupeKey = `${fam.afiSafi}|${direction}|${normalizePolicyLookupKey(policyName)}`;
      if (seen.has(dedupeKey)) continue;
      seen.add(dedupeKey);

      const policyKey = normalizePolicyLookupKey(policyName);
      const consumer = config.consumers.route_policies[policyKey];
      const routePolicyStatus = config.catalog_status.route_policies;
      const status = routePolicyStatus !== "loaded"
        ? "UNKNOWN"
        : consumer
          ? "FOUND"
          : "MISSING";

      const deps = config.dependency_graph.route_policy_dependencies.filter(
        (d) => normalizePolicyLookupKey(d.routePolicy) === policyKey,
      );

      const dependencyEdges: BgpPeerDependencyEdge[] = deps.map((d) => ({
        fromType: "route-policy",
        fromName: d.routePolicy,
        fromNode: d.node,
        dependencyType: d.dependencyType,
        dependencyName: d.dependencyName,
        status: d.status,
        evidence: d.evidence,
        source: d.source,
      }));

      policies.push({
        name: policyName,
        direction,
        afiSafi: fam.afiSafi,
        nodes: (consumer?.nodes ?? []).map((node) => ({
          sequence: node.sequence,
          action: node.action,
          matches: parseMatchRefs(node.matches),
          applies: node.applies.map((raw) => ({ type: "apply", raw })),
          control: [],
        })),
        dependencies: dependencyEdges,
        catalogObject: includePolicyObjects && consumer
          ? { name: consumer.name, nodes: consumer.nodes.length, source: consumer.source }
          : null,
        status,
      });

      if (includePolicyObjects && policies[policies.length - 1]) {
        const catalogObjects = deps
          .map((dep) => catalogObjectForDependency(config, dep))
          .filter((obj): obj is Record<string, unknown> => obj !== null);
        if (catalogObjects.length > 0) {
          policies[policies.length - 1].catalogObject = {
            ...(policies[policies.length - 1].catalogObject ?? {}),
            resolvedObjects: catalogObjects,
          };
        }
      }
    }
  }

  return policies;
}

function flattenDependencies(
  config: ParsedPolicyDependencyConfig,
  peer: string,
  peerFamilies: BgpPeerFamily[],
  policyDrilldowns: BgpPeerRoutePolicyDrilldown[],
): BgpPeerDependencyEdge[] {
  const edges: BgpPeerDependencyEdge[] = [];
  const discSource = config.configBuildSource === "raw_config" ? "ssh_running_config" : "local_db";

  for (const fam of peerFamilies) {
    for (const direction of ["import", "export"] as const) {
      const policyName = direction === "import" ? fam.effectiveImportRoutePolicy : fam.effectiveExportRoutePolicy;
      if (!policyName) continue;
      edges.push({
        fromType: "bgp_peer",
        fromName: peer,
        fromNode: null,
        dependencyType: "route-policy",
        dependencyName: policyName,
        status: policyBindingStatus(config, fam.peerAddressOrName, fam.afiSafi, direction, policyName),
        evidence: `BGP peer ${peer} ${fam.afiSafi} ${direction} → ${policyName}`,
        source: discSource,
        direction,
        afiSafi: fam.afiSafi,
      });
    }
  }

  for (const policy of policyDrilldowns) {
    for (const dep of policy.dependencies) {
      edges.push(dep);
    }
  }

  const deduped = new Map<string, BgpPeerDependencyEdge>();
  for (const edge of edges) {
    const key = `${edge.fromType}|${edge.fromName}|${edge.fromNode}|${edge.dependencyType}|${edge.dependencyName}|${edge.direction ?? ""}|${edge.afiSafi ?? ""}`;
    deduped.set(key, edge);
  }
  return [...deduped.values()];
}

export function buildBgpPeerDrilldownResult(input: {
  deviceId: number;
  peer: string;
  snapshot: DeviceDiscoverySnapshot;
  rawConfig: string;
  collectedAt: Date;
  snapshotId: number | null;
  query: BgpPeerDrilldownQuery;
}): BgpPeerDrilldownResult {
  const includePolicies = input.query.includePolicies !== false;
  const includePolicyObjects = input.query.includePolicyObjects !== false;

  const config = buildPolicyDependencyConfigFromSnapshot(input.snapshot, { rawConfig: input.rawConfig });
  const model = config.bgp_peer_model;
  const warnings: string[] = [];

  if (!input.rawConfig.trim() && config.configBuildSource !== "parsed_config_cache") {
    warnings.push("Nenhum raw_config disponível; usando parsed_config ou agregado do snapshot.");
  }
  if (!model?.root_context_loaded) {
    warnings.push("Bloco BGP root não encontrado no config.");
  }

  const peerKey = model ? resolvePeerKey(input.peer, model) : null;
  const peerDisplay = normalizePolicyObjectName(input.peer);
  const drilldownSource = drilldownSourceFromConfig(config);
  const discSource = discoverySourceFromDrilldown(drilldownSource);

  const rootRow = peerKey && model ? model.roots[peerKey] : null;
  const peerFamilies = model && peerKey
    ? model.families.filter((f) => f.peerKey === peerKey)
    : [];

  if (!peerKey || peerFamilies.length === 0) {
    warnings.push(`Peer ${peerDisplay} não encontrado em address-families BGP.`);
  }

  const families: BgpPeerFamilyConfig[] = peerFamilies.map((fam) => ({
    afiSafi: fam.afiSafi,
    vrf: fam.vrfName,
    enabled: fam.enabled,
    importPolicy: fam.importRoutePolicy,
    exportPolicy: fam.exportRoutePolicy,
    defaultRouteAdvertise: fam.defaultRouteAdvertise,
    nextHopLocal: fam.nextHopLocal,
    advertiseCommunity: fam.advertiseCommunity,
    advertiseExtCommunity: fam.advertiseExtCommunity,
    reflectClient: fam.reflectClient,
    keepAllRoutes: null,
    filterPolicy: null,
    asPathFilter: null,
    ipPrefixFilter: null,
    inheritedFromGroup: fam.inheritedFromGroup,
    inheritedGroup: fam.inheritedGroup,
    effectiveImportPolicy: fam.effectiveImportRoutePolicy,
    effectiveExportPolicy: fam.effectiveExportRoutePolicy,
    effectiveNextHopLocal: fam.effectiveNextHopLocal,
    effectiveAdvertiseCommunity: fam.effectiveAdvertiseCommunity,
    effectiveAdvertiseExtCommunity: fam.effectiveAdvertiseExtCommunity,
    effectivePolicySource: effectivePolicySource(fam),
    source: drilldownSource,
  }));

  const effectivePolicies: BgpPeerEffectivePolicy[] = [];
  for (const fam of peerFamilies) {
    for (const direction of ["import", "export"] as const) {
      const policyName = direction === "import" ? fam.effectiveImportRoutePolicy : fam.effectiveExportRoutePolicy;
      if (!policyName) continue;
      effectivePolicies.push({
        afiSafi: fam.afiSafi,
        vrf: fam.vrfName,
        direction,
        policyName,
        source: fam.inheritedFromGroup ? "peer_group" : "peer",
        inheritedFromGroup: fam.inheritedFromGroup,
        inheritedGroup: fam.inheritedGroup,
        status: policyBindingStatus(config, fam.peerAddressOrName, fam.afiSafi, direction, policyName),
      });
    }
  }

  const policies = buildPolicyDrilldowns(config, peerFamilies, includePolicies, includePolicyObjects);
  const dependencies = flattenDependencies(config, peerDisplay, peerFamilies, policies);

  const rawEvidenceRefs = input.rawConfig.trim()
    ? [{
      id: null,
      source: discSource,
      commandOrScope: "collected_configs.raw_config",
      collectedAt: input.collectedAt.toISOString(),
    }]
    : [];

  return {
    contractVersion: "bgp-peer-drilldown-v1",
    deviceId: input.deviceId,
    peer: rootRow?.peerAddressOrName ?? peerDisplay,
    source: drilldownSource,
    collectedAt: input.collectedAt.toISOString(),
    configBuildSource: config.configBuildSource ?? "unknown",
    snapshotId: input.snapshotId,
    root: {
      peer: rootRow?.peerAddressOrName ?? peerDisplay,
      asNumber: rootRow?.asNumber ?? null,
      description: rootRow?.description ?? null,
      group: rootRow?.groupName ?? null,
      connectInterface: rootRow?.connectInterface ?? null,
      timers: null,
      passwordPresent: false,
      source: drilldownSource,
      status: rootRow ? "FOUND" : "MISSING",
    },
    families,
    effectivePolicies,
    policies,
    dependencies,
    runtime: null,
    routeTables: EMPTY_ROUTE_TABLES,
    warnings,
    rawEvidenceRefs,
  };
}
