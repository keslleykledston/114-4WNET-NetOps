import type { ParsedPolicyDependencyConfig } from "../../netops/huawei-vrp/parsers/policy-dependency-pipeline.js";
import { normalizePolicyLookupKey } from "../../netops/huawei-vrp/parsers/policy-utils.js";
import type {
  AnnouncementFinding,
  AnnouncementFamily,
  CellState,
  MatrixCell,
  MatrixRow,
  RiskLevel,
  TargetType,
} from "../bgp-announcement.types.js";
import {
  ACTION_CODE_TO_STATE,
  CELL_STATE_TO_LABEL,
} from "../bgp-announcement.types.js";
import type { BgpPolicyGraph } from "../graph/bgp-policy-graph.builder.js";
import { parseNodeApplies } from "../parsers/apply-community.parser.js";
import { parseCircuitCommunity } from "../parsers/community-circuit.parser.js";
import { classifyPolicy, shouldIncludeInAnnouncementMatrix } from "./policy-classifier.js";
import {
  resolveRowDependencySemantics,
  shouldSuppressSharedDependencyFinding,
} from "./semantic-dependency-classifier.js";
import {
  expandPrefixList,
  findPrefixListForNode,
  countPoliciesUsingPrefixList,
} from "./prefix-expansion.resolver.js";
import { resolveNodeCommunities } from "./community-set-matcher.js";

export interface UpstreamColumn {
  circuitId: string;
  displayName: string;
  role: string;
}

export interface MatrixBuildInput {
  deviceId: number;
  parsedConfig: ParsedPolicyDependencyConfig;
  graph: BgpPolicyGraph;
  upstreams: UpstreamColumn[];
  collectionAgeMinutes: number | null;
  lastCollectedAt: string | null;
  baseAsn?: number;
}

function resolveCellStatesForCommunities(
  communities: string[],
  upstreams: UpstreamColumn[],
  baseAsn: number,
): MatrixCell[] {
  const byCircuit = new Map<string, Array<{ comm: string; actionCode: string; state: CellState }>>();

  for (const comm of communities) {
    const parsed = parseCircuitCommunity(comm, baseAsn);
    if (!parsed.valid) continue;
    const state = ACTION_CODE_TO_STATE[parsed.actionCode] ?? "unknown";
    const bucket = byCircuit.get(parsed.circuitId) ?? [];
    bucket.push({ comm: parsed.raw, actionCode: parsed.actionCode, state });
    byCircuit.set(parsed.circuitId, bucket);
  }

  return upstreams.map((up) => {
    const entries = byCircuit.get(up.circuitId) ?? [];
    if (entries.length === 0) {
      return {
        circuitId: up.circuitId,
        upstreamName: up.displayName,
        state: "none" as CellState,
        label: CELL_STATE_TO_LABEL.none,
        community: null,
        actionCode: null,
        prependCount: null,
        confidence: "high" as const,
      };
    }
    if (entries.length > 1) {
      return {
        circuitId: up.circuitId,
        upstreamName: up.displayName,
        state: "conflict" as CellState,
        label: CELL_STATE_TO_LABEL.conflict,
        community: entries.map((e) => e.comm).join(", "),
        actionCode: null,
        prependCount: null,
        confidence: "low" as const,
      };
    }
    const entry = entries[0];
    const prependMap: Record<string, number | null> = { on: 0, p1: 1, p2: 2, p3: 3, p4: 4 };
    return {
      circuitId: up.circuitId,
      upstreamName: up.displayName,
      state: entry.state,
      label: CELL_STATE_TO_LABEL[entry.state],
      community: entry.comm,
      actionCode: entry.actionCode,
      prependCount: prependMap[entry.state] ?? null,
      confidence: "high" as const,
    };
  });
}

function computeRisk(
  prefixes: string[],
  prefixListShared: boolean,
  hasPrefixScope: boolean,
  modifiable: boolean,
): RiskLevel {
  if (!modifiable) return "critical";
  if (!hasPrefixScope) return "high";
  if (prefixListShared) return "medium";
  if (prefixes.length === 1) return "low";
  return "medium";
}

export function buildAnnouncementMatrix(input: MatrixBuildInput): { rows: MatrixRow[]; findings: AnnouncementFinding[] } {
  const rows: MatrixRow[] = [];
  const globalFindings: AnnouncementFinding[] = [];
  const baseAsn = input.baseAsn ?? 64777;
  const excludedExportPolicies = new Set<string>();

  for (const [, policy] of Object.entries(input.parsedConfig.consumers.route_policies)) {
    const classification = classifyPolicy(policy.name, input.graph.networks, input.parsedConfig);
    const exportBinding = input.parsedConfig.dependency_graph.bgp_policy_bindings.find(
      (binding) => binding.routePolicy === policy.name && binding.direction === "export",
    );
    if (exportBinding && !excludedExportPolicies.has(policy.name)) {
      globalFindings.push({
        code: "EXPORT_POLICY_EXCLUDED_FROM_ANNOUNCEMENT_MATRIX",
        severity: "info",
        message: `A policy ${policy.name} está associada como export e foi excluída da matriz, pois a matriz representa apenas pontos de marcação de community em ORIGIN/customer import.`,
        context: {
          policy_name: policy.name,
          direction: exportBinding.direction,
          consumer_type: exportBinding.consumerType,
        },
      });
      excludedExportPolicies.add(policy.name);
    }

    if (!shouldIncludeInAnnouncementMatrix(classification)) continue;

    const targetType: TargetType =
      classification.policyClass === "origin_target" ? "origin" :
      classification.policyClass === "customer_import_target" ? "customer" : "unknown";

    for (const node of policy.nodes) {
      if (node.action !== "permit") continue;

      const family: AnnouncementFamily =
        /ipv6/i.test(policy.name) ? "ipv6" : "ipv4";

      const { listName, matchType } = findPrefixListForNode(node.matches, family);
      const affectedPrefixes = listName
        ? expandPrefixList(listName, family, input.parsedConfig.catalogs)
        : input.graph.networks
          .filter((n) => n.routePolicyName === policy.name)
          .map((n) => n.prefix);

      const prefixListShared = listName ? countPoliciesUsingPrefixList(input.parsedConfig, listName) > 1 : false;
      const hasPrefixScope = affectedPrefixes.length > 0 || Boolean(listName);
      const findings: AnnouncementFinding[] = [];

      if (!hasPrefixScope) {
        findings.push({
          code: "TARGET_POLICY_WITHOUT_PREFIX_SCOPE",
          severity: "high",
          message: "Esta policy não possui filtro de prefixo claro. A alteração pode afetar todos os prefixos que passarem por este node.",
          context: { policy: policy.name, node: node.sequence },
        });
      }
      if (listName && affectedPrefixes.length === 0) {
        findings.push({
          code: "PREFIX_LIST_EMPTY",
          severity: "medium",
          message: `Prefix-list ${listName} está vazia ou não foi resolvida.`,
          context: { listName },
        });
      }
      if (prefixListShared && listName && !shouldSuppressSharedDependencyFinding("PREFIX_LIST_SHARED_BY_MULTIPLE_POLICIES", listName)) {
        findings.push({
          code: "PREFIX_LIST_SHARED_BY_MULTIPLE_POLICIES",
          severity: "medium",
          message: `Prefix-list ${listName} é compartilhada por múltiplas policies.`,
          context: { listName },
        });
      }

      const parsedApplies = parseNodeApplies(node.applies);
      const resolved = resolveNodeCommunities(
        parsedApplies.directCommunities,
        parsedApplies.communityListName,
        input.graph.communityLists,
      );

      if (parsedApplies.communityListName) {
        const unknownInSet = resolved.communities.filter((c) => !parseCircuitCommunity(c, baseAsn).valid);
        if (unknownInSet.length > 0) {
          findings.push({
            code: "UNKNOWN_COMMUNITY_NAMESPACE",
            severity: "medium",
            message: "Existem communities não mapeadas no catálogo de circuito.",
            context: { communities: unknownInSet },
          });
        }
      }

      if (targetType === "customer" && resolved.communities.length === 0 && !parsedApplies.communityListName) {
        continue;
      }

      if (
        targetType === "origin"
        && resolved.communities.length === 0
        && !parsedApplies.communityListName
      ) {
        findings.push({
          code: "ORIGIN_POLICY_WITHOUT_COMMUNITY",
          severity: "high",
          message: "Policy origin sem community ou community-list aplicada neste node.",
          context: { policy: policy.name, node: node.sequence },
        });
      }

      const cells = resolveCellStatesForCommunities(resolved.communities, input.upstreams, baseAsn);
      const riskLevel = computeRisk(affectedPrefixes, prefixListShared, hasPrefixScope, classification.modifiable);

      rows.push({
        targetKey: `${normalizePolicyLookupKey(policy.name)}:${node.sequence}:${family}`,
        targetType,
        routePolicyName: policy.name,
        node: node.sequence ?? 0,
        family,
        prefixScope: listName ?? affectedPrefixes[0] ?? policy.name,
        affectedPrefixes,
        prefixListName: listName,
        modifiable: classification.modifiable,
        riskLevel,
        cells,
        findings,
        lastCollectedAt: input.lastCollectedAt,
        collectionAgeMinutes: input.collectionAgeMinutes,
        ...resolveRowDependencySemantics({
          targetKey: `${normalizePolicyLookupKey(policy.name)}:${node.sequence}:${family}`,
          targetType,
          routePolicyName: policy.name,
          node: node.sequence ?? 0,
          family,
          prefixScope: listName ?? affectedPrefixes[0] ?? policy.name,
          affectedPrefixes,
          prefixListName: listName,
          modifiable: classification.modifiable,
          riskLevel,
          cells,
          findings,
          lastCollectedAt: input.lastCollectedAt,
          collectionAgeMinutes: input.collectionAgeMinutes,
        }, input.parsedConfig),
      });

      void matchType;
    }
  }

  return { rows, findings: globalFindings };
}

export function getCellForUpstream(row: MatrixRow, circuitId: string): MatrixCell | undefined {
  return row.cells.find((c) => c.circuitId === circuitId);
}
