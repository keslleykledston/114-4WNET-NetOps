import type { ParsedPolicyDependencyConfig } from "../../netops/huawei-vrp/parsers/policy-dependency-pipeline.js";
import { parseRunningConfigCommunities } from "../../netops/huawei-vrp/parsers/community-parser.js";
import { normalizePolicyLookupKey } from "../../netops/huawei-vrp/parsers/policy-utils.js";
import type { BgpNetworkStatement } from "../bgp-announcement.types.js";
import { parseBgpNetworkStatements } from "../parsers/bgp-network.parser.js";
import { parseNodeApplies } from "../parsers/apply-community.parser.js";
import { parseCircuitCommunity } from "../parsers/community-circuit.parser.js";
import { classifyPolicy } from "../resolvers/policy-classifier.js";
import { isProtectedGlobalCommunityFilter } from "../resolvers/protected-global-filter.js";
import { ACTION_CODE_TO_STATE } from "../bgp-announcement.types.js";

export interface GraphNodeRef {
  id: string;
  type: string;
  label: string;
}

export interface GraphEdge {
  type: string;
  from: string;
  to: string;
  attrs?: Record<string, unknown>;
}

export interface CommunityUsagePath {
  community: string;
  communityLists: string[];
  policyNodes: Array<{ policy: string; node: number }>;
  networks: BgpNetworkStatement[];
}

export interface BgpPolicyGraph {
  nodes: GraphNodeRef[];
  edges: GraphEdge[];
  networks: BgpNetworkStatement[];
  communityLists: Map<string, string[]>;
  reverseIndex: Map<string, CommunityUsagePath>;
  policyClassifications: ReturnType<typeof classifyPolicy>[];
}

export function buildBgpPolicyGraph(
  parsedConfig: ParsedPolicyDependencyConfig,
  rawConfigText: string,
): BgpPolicyGraph {
  const nodes: GraphNodeRef[] = [];
  const edges: GraphEdge[] = [];
  const networks = parseBgpNetworkStatements(rawConfigText);
  const communityParsed = parseRunningConfigCommunities(rawConfigText);

  const communityLists = new Map<string, string[]>();
  for (const entry of communityParsed.communityLists) {
    const list = communityLists.get(entry.listName) ?? [];
    list.push(entry.value);
    communityLists.set(entry.listName, list);
  }
  for (const [name, values] of communityLists) {
    communityLists.set(name, [...new Set(values)].sort());
  }

  for (const net of networks) {
    const netId = `network:${net.family}:${net.prefix}`;
    nodes.push({ id: netId, type: "network", label: net.prefix });
    const polId = `policy:${normalizePolicyLookupKey(net.routePolicyName)}`;
    edges.push({
      type: "NETWORK_USES_ORIGIN_POLICY",
      from: netId,
      to: polId,
      attrs: { raw: net.raw },
    });
  }

  for (const [key, policy] of Object.entries(parsedConfig.consumers.route_policies)) {
    const polId = `policy:${key}`;
    nodes.push({ id: polId, type: "route_policy", label: policy.name });
    for (const node of policy.nodes) {
      const nodeId = `${polId}:node:${node.sequence}`;
      nodes.push({ id: nodeId, type: "policy_node", label: `${policy.name}#${node.sequence}` });
      edges.push({ type: "POLICY_HAS_NODE", from: polId, to: nodeId, attrs: { action: node.action } });

      for (const match of node.matches) {
        if (/if-match\s+ip-prefix/i.test(match)) {
          const m = /if-match\s+ip-prefix\s+(\S+)/i.exec(match);
          if (m) {
            const plId = `ip_prefix:${normalizePolicyLookupKey(m[1])}`;
            edges.push({ type: "POLICY_NODE_MATCHES_PREFIX_LIST", from: nodeId, to: plId, attrs: { raw: match, family: "ipv4" } });
          }
        }
        if (/if-match\s+ipv6/i.test(match)) {
          const m = /if-match\s+ipv6\s+address\s+prefix-list\s+(\S+)/i.exec(match);
          if (m) {
            const plId = `ipv6_prefix:${normalizePolicyLookupKey(m[1])}`;
            edges.push({ type: "POLICY_NODE_MATCHES_PREFIX_LIST", from: nodeId, to: plId, attrs: { raw: match, family: "ipv6" } });
          }
        }
        const cfMatch = /if-match\s+community-filter\s+(\S+)/i.exec(match);
        if (cfMatch) {
          const filterName = cfMatch[1];
          const cfId = `community_filter:${normalizePolicyLookupKey(filterName)}`;
          edges.push({
            type: "POLICY_NODE_MATCHES_COMMUNITY_FILTER",
            from: nodeId,
            to: cfId,
            attrs: {
              raw: match,
              protectedGlobal: isProtectedGlobalCommunityFilter(filterName),
            },
          });
          const filterKey = normalizePolicyLookupKey(filterName);
          const catalog = parsedConfig.catalogs.community_filters[filterKey];
          for (const entry of catalog?.entries ?? []) {
            const value = String(entry.value ?? entry.expression ?? "").trim();
            if (!value) continue;
            const commId = `community:${value}`;
            edges.push({
              type: "COMMUNITY_FILTER_MATCHES_COMMUNITY",
              from: cfId,
              to: commId,
              attrs: { action: entry.action ?? "permit" },
            });
            appendCommunityCircuitResolution(edges, commId, value);
          }
        }
        const asPathMatch = /if-match\s+as-path-filter\s+(\S+)/i.exec(match);
        if (asPathMatch) {
          edges.push({
            type: "POLICY_NODE_MATCHES_AS_PATH_FILTER",
            from: nodeId,
            to: `as_path_filter:${normalizePolicyLookupKey(asPathMatch[1])}`,
            attrs: { raw: match },
          });
        }
      }

      const parsed = parseNodeApplies(node.applies);
      if (parsed.communityListName) {
        const clId = `community_list:${normalizePolicyLookupKey(parsed.communityListName)}`;
        edges.push({ type: "POLICY_NODE_APPLIES_COMMUNITY_LIST", from: nodeId, to: clId, attrs: { raw: parsed.rawApplies } });
        const members = communityLists.get(parsed.communityListName) ?? [];
        for (const comm of members) {
          edges.push({ type: "COMMUNITY_LIST_CONTAINS_COMMUNITY", from: clId, to: `community:${comm}`, attrs: {} });
          appendCommunityCircuitResolution(edges, `community:${comm}`, comm);
        }
      }
      for (const comm of parsed.directCommunities) {
        edges.push({ type: "POLICY_NODE_APPLIES_COMMUNITY", from: nodeId, to: `community:${comm}`, attrs: {} });
        appendCommunityCircuitResolution(edges, `community:${comm}`, comm);
      }
      for (const apply of node.applies) {
        const asPathApply = /apply\s+as-path\s+(.+?)(?:\s+additive)?$/i.exec(apply.trim());
        if (asPathApply) {
          edges.push({
            type: "POLICY_NODE_APPLIES_AS_PATH",
            from: nodeId,
            to: `as_path:${asPathApply[1].trim().replace(/\s+/g, "_")}`,
            attrs: { raw: apply.trim() },
          });
        }
        const localPref = /apply\s+local-preference\s+(\d+)/i.exec(apply.trim());
        if (localPref) {
          edges.push({
            type: "POLICY_NODE_APPLIES_LOCAL_PREF",
            from: nodeId,
            to: `local_pref:${localPref[1]}`,
            attrs: { raw: apply.trim() },
          });
        }
        const goto = /goto\s+next-node/i.exec(apply.trim());
        if (goto) {
          edges.push({ type: "POLICY_NODE_GOTO_NEXT", from: nodeId, to: nodeId, attrs: { raw: apply.trim() } });
        }
      }
    }
  }

  for (const binding of parsedConfig.dependency_graph.bgp_policy_bindings) {
    const peerId = `peer:${binding.peerIp ?? binding.consumerName}`;
    const polId = `policy:${normalizePolicyLookupKey(binding.routePolicy)}`;
    edges.push({
      type: "PEER_USES_POLICY",
      from: peerId,
      to: polId,
      attrs: { direction: binding.direction, family: binding.afiSafi },
    });
  }

  const reverseIndex = buildReverseIndex(edges, networks, communityLists);
  const policyClassifications = Object.values(parsedConfig.consumers.route_policies).map((p) =>
    classifyPolicy(p.name, networks, parsedConfig),
  );

  return { nodes, edges, networks, communityLists, reverseIndex, policyClassifications };
}

function appendCommunityCircuitResolution(edges: GraphEdge[], commId: string, value: string): void {
  const parsed = parseCircuitCommunity(value);
  if (!parsed.valid) return;
  const state = ACTION_CODE_TO_STATE[parsed.actionCode] ?? "unknown";
  edges.push({
    type: "COMMUNITY_RESOLVES_TO_CIRCUIT_ACTION",
    from: commId,
    to: `circuit:${parsed.circuitId}:action:${parsed.actionCode}`,
    attrs: { circuitId: parsed.circuitId, actionCode: parsed.actionCode, state },
  });
}

function buildReverseIndex(
  edges: GraphEdge[],
  networks: BgpNetworkStatement[],
  communityLists: Map<string, string[]>,
): Map<string, CommunityUsagePath> {
  const index = new Map<string, CommunityUsagePath>();

  const ensure = (comm: string): CommunityUsagePath => {
    const existing = index.get(comm);
    if (existing) return existing;
    const created: CommunityUsagePath = { community: comm, communityLists: [], policyNodes: [], networks: [] };
    index.set(comm, created);
    return created;
  };

  for (const [listName, members] of communityLists) {
    for (const comm of members) {
      const path = ensure(comm);
      if (!path.communityLists.includes(listName)) path.communityLists.push(listName);
    }
  }

  for (const edge of edges) {
    if (edge.type === "POLICY_NODE_APPLIES_COMMUNITY" && edge.to.startsWith("community:")) {
      const comm = edge.to.replace("community:", "");
      const path = ensure(comm);
      const nodeMatch = /^policy:(.+):node:(\d+)$/.exec(edge.from);
      if (nodeMatch) {
        const policyKey = nodeMatch[1];
        const node = Number(nodeMatch[2]);
        const policyName = policyKey;
        if (!path.policyNodes.some((p) => p.policy === policyName && p.node === node)) {
          path.policyNodes.push({ policy: policyName, node });
        }
      }
    }
  }

  for (const net of networks) {
    for (const [comm, path] of index) {
      if (path.policyNodes.some((p) => normalizePolicyLookupKey(p.policy) === normalizePolicyLookupKey(net.routePolicyName))) {
        if (!path.networks.some((n) => n.prefix === net.prefix)) path.networks.push(net);
      }
      void comm;
    }
  }

  return index;
}
