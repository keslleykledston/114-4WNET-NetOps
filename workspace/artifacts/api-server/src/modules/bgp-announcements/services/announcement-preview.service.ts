import type { ParsedPolicyDependencyConfig } from "../../netops/huawei-vrp/parsers/policy-dependency-pipeline.js";
import { normalizePolicyLookupKey } from "../../netops/huawei-vrp/parsers/policy-utils.js";
import type {
  AnnouncementFinding,
  CellState,
  PreviewChangeRequest,
  PreviewChangeResponse,
  RiskLevel,
} from "../bgp-announcement.types.js";
import {
  CELL_STATE_TO_LABEL,
  STATE_TO_ACTION_CODE,
} from "../bgp-announcement.types.js";
import type { BgpPolicyGraph } from "../graph/bgp-policy-graph.builder.js";
import {
  buildApplyCommunityLine,
  buildUndoApplyCommunityLine,
  parseNodeApplies,
} from "../parsers/apply-community.parser.js";
import { parseCircuitPolicyName } from "../parsers/circuit-policy.parser.js";
import { isBgpCommunitySetMatchEnabled } from "../bgp-announcement.gate.js";
import { isProtectedGlobalCommunityFilter } from "../resolvers/protected-global-filter.js";
import { classifyPolicy, isModifiableTarget, isUpstreamAuditPolicy } from "../resolvers/policy-classifier.js";
import {
  applyCircuitStateChange,
  findExactCommunitySetMatch,
  resolveNodeCommunities,
  type CommunitySetRecord,
} from "../resolvers/community-set-matcher.js";
import { expandPrefixList, findPrefixListForNode } from "../resolvers/prefix-expansion.resolver.js";
import { getCellForUpstream, buildAnnouncementMatrix, type UpstreamColumn } from "../resolvers/announcement-matrix.resolver.js";

export interface CompilePreviewInput {
  request: PreviewChangeRequest;
  parsedConfig: ParsedPolicyDependencyConfig;
  graph: BgpPolicyGraph;
  upstreams: UpstreamColumn[];
  communitySets: CommunitySetRecord[];
  localAs: number | null;
}

function stateToActionCode(state: CellState): string | null {
  return STATE_TO_ACTION_CODE[state] ?? null;
}

function computePreviewRisk(findings: AnnouncementFinding[]): RiskLevel {
  if (findings.some((f) => f.severity === "critical")) return "critical";
  if (findings.some((f) => f.severity === "high")) return "high";
  if (findings.some((f) => f.severity === "medium")) return "medium";
  return "low";
}

export function compileAnnouncementPreview(input: CompilePreviewInput): PreviewChangeResponse {
  const { request, parsedConfig, graph, upstreams, communitySets, localAs } = input;
  const findings: AnnouncementFinding[] = [];
  const blockedReasons: string[] = [];

  const policyKey = request.targetPolicyName;
  const classification = classifyPolicy(policyKey, graph.networks, parsedConfig);

  if (isUpstreamAuditPolicy(classification) || parseCircuitPolicyName(policyKey)) {
    findings.push({
      code: "UPSTREAM_POLICY_IS_MODIFIABLE",
      severity: "critical",
      message: "Policies upstream Cxx são audit-only e não podem ser alteradas.",
      context: { policy: policyKey },
    });
    blockedReasons.push("upstream_policy_blocked");
  }

  if (!isModifiableTarget(classification)) {
    findings.push({
      code: "TARGET_POLICY_UNKNOWN",
      severity: "critical",
      message: "Target policy não classificada como modificável.",
      context: { policy: policyKey, class: classification.policyClass },
    });
    blockedReasons.push("target_not_modifiable");
  }

  const policy = parsedConfig.consumers.route_policies[normalizePolicyLookupKey(policyKey)]
    ?? Object.values(parsedConfig.consumers.route_policies).find((p) => p.name === policyKey);

  if (!policy) {
    blockedReasons.push("policy_not_found");
    return emptyBlockedResponse(request, blockedReasons, findings);
  }

  const node = policy.nodes.find((n) => n.sequence === request.node);
  if (!node) {
    blockedReasons.push("node_not_found");
    return emptyBlockedResponse(request, blockedReasons, findings);
  }

  const { listName } = findPrefixListForNode(node.matches, request.family);
  const affectedPrefixes = listName
    ? expandPrefixList(listName, request.family, parsedConfig.catalogs)
    : graph.networks.filter((n) => n.routePolicyName === policy.name).map((n) => n.prefix);

  if (affectedPrefixes.length === 0 && !listName) {
    findings.push({
      code: "TARGET_POLICY_WITHOUT_PREFIX_SCOPE",
      severity: "high",
      message: "Policy sem escopo de prefixo claro.",
    });
  }

  const parsedApplies = parseNodeApplies(node.applies);
  const resolved = resolveNodeCommunities(
    parsedApplies.directCommunities,
    parsedApplies.communityListName,
    graph.communityLists,
  );

  if (parsedApplies.communityListName) {
    findings.push({
      code: "TARGET_POLICY_USES_SHARED_COMMUNITY_LIST",
      severity: "medium",
      message: "Community-list compartilhada não será modificada; preview usará communities diretas se necessário.",
      context: { listName: parsedApplies.communityListName },
    });
  }

  const matrix = buildAnnouncementMatrix({
    deviceId: request.deviceId,
    parsedConfig,
    graph,
    upstreams,
    collectionAgeMinutes: null,
    lastCollectedAt: null,
  });

  const row = matrix.rows.find(
    (r) => r.routePolicyName === policy.name && r.node === request.node && r.family === request.family,
  );
  const cell = row ? getCellForUpstream(row, request.upstreamCircuitId) : undefined;
  const oldStateLabel = cell?.label ?? "—";

  const newActionCode = stateToActionCode(request.newState);
  if (!newActionCode && request.newState !== "none") {
    blockedReasons.push("invalid_new_state");
  }

  const { communities: newCommunities, removed, added } = applyCircuitStateChange(
    resolved.communities,
    request.upstreamCircuitId,
    request.newState === "none" ? null : newActionCode,
  );

  if (removed.length > 1) {
    findings.push({
      code: "MULTIPLE_ACTIONS_FOR_SAME_UPSTREAM",
      severity: "critical",
      message: "Múltiplas communities para o mesmo circuito detectadas antes da alteração.",
      context: { removed },
    });
    blockedReasons.push("multiple_actions_same_upstream");
  }

  let communitySetMatchName: string | null = null;
  let usesCommunityList = false;

  if (isBgpCommunitySetMatchEnabled()) {
    const match = findExactCommunitySetMatch(newCommunities, communitySets);
    if (match) {
      communitySetMatchName = match.name;
      usesCommunityList = true;
      findings.push({
        code: "COMMUNITY_SET_EXACT_MATCH_FOUND",
        severity: "info",
        message: `Match exato com community-list ${match.name}.`,
      });
    } else {
      findings.push({
        code: "COMMUNITY_SET_NO_EXACT_MATCH",
        severity: "medium",
        message: "Nenhuma community-list existente com match exato; preview usará communities diretas.",
      });
    }
  }

  const upstream = upstreams.find((u) => u.circuitId === request.upstreamCircuitId);
  const auditFinding = auditUpstreamForAction(
    parsedConfig,
    graph,
    request.upstreamCircuitId,
    request.newState,
    localAs,
  );
  findings.push(...auditFinding);

  const riskLevel = computePreviewRisk(findings);
  if (findings.some((f) => f.severity === "critical")) {
    blockedReasons.push("critical_findings");
  }

  const scriptLines = [
    "system-view",
    `route-policy ${policy.name} permit node ${request.node}`,
    buildUndoApplyCommunityLine(),
  ];
  if (usesCommunityList && communitySetMatchName) {
    scriptLines.push(buildApplyCommunityLine([], communitySetMatchName).trim());
  } else if (newCommunities.length > 0) {
    scriptLines.push(buildApplyCommunityLine(newCommunities).trim());
  }
  scriptLines.push("commit", "return");

  const rollbackLines = [
    "system-view",
    `route-policy ${policy.name} permit node ${request.node}`,
    buildUndoApplyCommunityLine(),
  ];
  if (parsedApplies.communityListName) {
    rollbackLines.push(buildApplyCommunityLine([], parsedApplies.communityListName).trim());
  } else if (resolved.communities.length > 0) {
    rollbackLines.push(buildApplyCommunityLine(resolved.communities).trim());
  }
  rollbackLines.push("commit", "return");

  const diff = [
    `Upstream: ${upstream?.displayName ?? request.upstreamCircuitId}`,
    `Estado: ${oldStateLabel} → ${CELL_STATE_TO_LABEL[request.newState]}`,
    `Communities removidas: ${removed.join(", ") || "(nenhuma)"}`,
    `Communities adicionadas: ${added.join(", ") || "(nenhuma)"}`,
    `Conjunto final: ${newCommunities.join(" ")}`,
  ];

  return {
    allowed: blockedReasons.length === 0,
    blockedReasons,
    targetPolicyName: policy.name,
    node: request.node,
    affectedPrefixes,
    oldState: oldStateLabel,
    newState: CELL_STATE_TO_LABEL[request.newState],
    oldCommunities: resolved.communities,
    newCommunities,
    communitySetMatchName,
    usesCommunityList,
    generatedScript: scriptLines.join("\n"),
    rollbackScript: rollbackLines.join("\n"),
    diff,
    riskLevel,
    findings,
  };
}

function emptyBlockedResponse(
  request: PreviewChangeRequest,
  blockedReasons: string[],
  findings: AnnouncementFinding[],
): PreviewChangeResponse {
  return {
    allowed: false,
    blockedReasons,
    targetPolicyName: request.targetPolicyName,
    node: request.node,
    affectedPrefixes: [],
    oldState: "—",
    newState: CELL_STATE_TO_LABEL[request.newState],
    oldCommunities: [],
    newCommunities: [],
    communitySetMatchName: null,
    usesCommunityList: false,
    generatedScript: "",
    rollbackScript: "",
    diff: [],
    riskLevel: "critical",
    findings,
  };
}

function auditUpstreamForAction(
  parsedConfig: ParsedPolicyDependencyConfig,
  graph: BgpPolicyGraph,
  circuitId: string,
  newState: CellState,
  localAs: number | null,
): AnnouncementFinding[] {
  const findings: AnnouncementFinding[] = [];
  if (newState === "none" || newState === "unknown" || newState === "conflict") return findings;

  const exportPolicyName = Object.keys(parsedConfig.consumers.route_policies).find((name) => {
    const parsed = parseCircuitPolicyName(name);
    return parsed?.circuitId === circuitId && parsed.function === "EXPORT";
  });

  if (!exportPolicyName) {
    findings.push({
      code: "UPSTREAM_EXPORT_POLICY_MISSING_ACTION",
      severity: "high",
      message: `Export policy para circuito ${circuitId} não encontrada para auditoria.`,
    });
    return findings;
  }

  const actionCode = STATE_TO_ACTION_CODE[newState];
  if (!actionCode) return findings;

  const policy = parsedConfig.consumers.route_policies[normalizePolicyLookupKey(exportPolicyName)]
    ?? Object.values(parsedConfig.consumers.route_policies).find((p) => p.name === exportPolicyName);

  if (!policy) return findings;

  for (const node of policy.nodes) {
    for (const apply of node.applies) {
      const asPath = /apply\s+as-path\s+(.+?)(?:\s+additive)?$/i.exec(apply.trim());
      if (!asPath) continue;
      if (!["p1", "p2", "p3", "p4"].includes(newState)) continue;
      const expectedMap: Record<string, number> = { p1: 1, p2: 2, p3: 3, p4: 4 };
      const expectedCount = expectedMap[newState] ?? 0;
      const tokens = asPath[1].trim().split(/\s+/);
      if (localAs && tokens.some((t) => Number(t) !== localAs)) {
        findings.push({
          code: "AS_PATH_PREPEND_LOCAL_AS_MISMATCH",
          severity: "critical",
          message: `Local-AS esperado ${localAs}, encontrado ${tokens.join(" ")} na export policy.`,
          context: { policy: exportPolicyName, node: node.sequence },
        });
      }
      if (tokens.length !== expectedCount) {
        findings.push({
          code: "AS_PATH_PREPEND_COUNT_MISMATCH",
          severity: "high",
          message: `Prepend count esperado ${expectedCount}, encontrado ${tokens.length}.`,
          context: { policy: exportPolicyName, node: node.sequence },
        });
      }
    }
  }

  void graph;
  return findings;
}
