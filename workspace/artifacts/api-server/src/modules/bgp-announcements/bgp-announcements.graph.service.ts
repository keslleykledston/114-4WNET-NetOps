import { parseBgpNetworkStatements } from "./parsers/bgp-network.parser.js";
import { parseHuaweiPolicyDependencyPipeline, type PolicyRoutePolicyConsumer } from "../netops/huawei-vrp/parsers/policy-dependency-pipeline.js";
import { normalizePolicyLookupKey } from "../netops/huawei-vrp/parsers/policy-utils.js";
import { resolveAnnouncementMatrix } from "./bgp-announcements.matrix-resolver.js";
import {
  buildAnnouncementCommunitySetLibrary,
  buildProtectedGlobalFilterFindings,
  findExactCommunitySetMatch,
  runAnnouncementUpstreamAudit,
} from "./bgp-announcements.audit.service.js";
import type {
  AnnouncementFinding,
  AnnouncementMatrixPayload,
  AnnouncementMatrixRow,
  AnnouncementMatrixSummaryPayload,
  AnnouncementMatrixTargetType,
  AnnouncementSnapshotSource,
} from "./bgp-announcements.types.js";

export interface AnnouncementGraphPeerInput {
  peerIp: string;
  name?: string | null;
  role?: string | null;
  importPolicy?: string | null;
  exportPolicy?: string | null;
  addressFamily?: string | null;
}

export interface AnnouncementGraphPolicyInput {
  name: string;
  nodes: Array<{
    sequence: number | null;
    action: string | null;
    matches: string[];
    applies: string[];
  }>;
}

export interface AnnouncementGraphBinding {
  type: "NETWORK_USES_ORIGIN_POLICY" | "PEER_USES_POLICY";
  policyName: string;
  family: "ipv4" | "ipv6" | "mixed" | "unknown";
  prefix?: string;
  peer?: string;
  direction?: "import" | "export";
  peerRole?: string | null;
  confidence: "high" | "medium" | "low";
}

export interface AnnouncementPolicyClassification {
  policyName: string;
  policyType: AnnouncementMatrixTargetType;
  modifiable: boolean;
  auditOnly: boolean;
  includeInAnnouncementMatrix: boolean;
  reason: string;
  confidence: "high" | "medium" | "low";
  family: "ipv4" | "ipv6" | "mixed" | "unknown";
  prefixScope: string[];
  matrixSource: AnnouncementSnapshotSource;
  findings: AnnouncementFinding[];
}

export interface AnnouncementGraphBuildInput {
  rawConfig: string;
  routePolicies: AnnouncementGraphPolicyInput[];
  bgpPeers: AnnouncementGraphPeerInput[];
  localAs?: number | null;
}

export interface AnnouncementGraphBuildResult {
  payload: AnnouncementMatrixPayload;
  summary: AnnouncementMatrixSummaryPayload;
  bindings: AnnouncementGraphBinding[];
  classifications: AnnouncementPolicyClassification[];
}

function normalizeFamily(value: string | null | undefined): "ipv4" | "ipv6" | "mixed" | "unknown" {
  if (!value) return "unknown";
  const lower = value.toLowerCase();
  if (lower.includes("ipv6") || lower.includes(":")) return "ipv6";
  if (lower.includes("ipv4") || /\d+\.\d+\.\d+\.\d+/.test(lower)) return "ipv4";
  return "unknown";
}

function familyFromPrefix(prefix: string): "ipv4" | "ipv6" {
  return prefix.includes(":") ? "ipv6" : "ipv4";
}

function isCxxPolicy(name: string): boolean {
  return /^C\d+/i.test(name);
}

function isInternalPolicy(name: string): boolean {
  return /(MALHA|IBGP|REFLECT-CLIENT|INTERNAL)/i.test(name);
}

function hasCommunityApply(policy: AnnouncementGraphPolicyInput): boolean {
  return policy.nodes.some((node) =>
    node.applies.some((line) => /(community-list|community-filter|set\s+community|apply\s+community)/i.test(line)),
  );
}

function hasPrefixScopeHint(policy: AnnouncementGraphPolicyInput): string[] {
  const scope = new Set<string>();
  for (const node of policy.nodes) {
    for (const line of node.matches) {
      const ip = /if-match\s+ip-prefix\s+(\S+)/i.exec(line);
      if (ip?.[1]) scope.add(ip[1]);
      const ipv6 = /if-match\s+ipv6\s+address\s+prefix-list\s+(\S+)/i.exec(line);
      if (ipv6?.[1]) scope.add(ipv6[1]);
    }
  }
  return [...scope];
}

function isCustomerPeerRole(role: string | null | undefined): boolean {
  return role === "customer" || role === "cdn" || role === "cdn_ix";
}

function isUpstreamPeerRole(role: string | null | undefined): boolean {
  return role === "provider" || role === "ix";
}

function peerRoleOf(peer: AnnouncementGraphPeerInput): string | null {
  return peer.role?.trim().toLowerCase() ?? null;
}

function policyNameMatchesCustomerImport(policyName: string): boolean {
  return /^AS\d+.*-IMPORT/i.test(policyName) || /IMPORT/i.test(policyName);
}

function policyNameMatchesCustomerExport(policyName: string): boolean {
  return /^AS\d+.*-EXPORT/i.test(policyName) || /EXPORT/i.test(policyName);
}

function classifyBgpPolicy(
  policyName: string,
  bindings: AnnouncementGraphBinding[],
  context: { policy?: AnnouncementGraphPolicyInput | null } = {},
): AnnouncementPolicyClassification {
  const policy = context.policy ?? null;
  const policyBindings = bindings.filter((binding) => normalizePolicyLookupKey(binding.policyName) === normalizePolicyLookupKey(policyName));
  const networkBindings = policyBindings.filter((binding) => binding.type === "NETWORK_USES_ORIGIN_POLICY");
  const peerBindings = policyBindings.filter((binding) => binding.type === "PEER_USES_POLICY");
  const prefixScope = networkBindings.map((binding) => binding.prefix ?? "").filter(Boolean);
  const familySet = new Set(policyBindings.map((binding) => binding.family).filter(Boolean));
  const family = familySet.size === 1 ? [...familySet][0] ?? "unknown" : familySet.size > 1 ? "mixed" : "unknown";
  const policyHasCommunity = policy ? hasCommunityApply(policy) : false;
  const policyHasPrefixHint = policy ? hasPrefixScopeHint(policy).length > 0 : false;
  const customerImports = peerBindings.filter((binding) => binding.direction === "import" && isCustomerPeerRole(binding.peerRole));
  const customerExports = peerBindings.filter((binding) => binding.direction === "export" && isCustomerPeerRole(binding.peerRole));
  const upstreamExports = peerBindings.filter((binding) => binding.direction === "export" && (isUpstreamPeerRole(binding.peerRole) || isCxxPolicy(policyName)));
  const upstreamImports = peerBindings.filter((binding) => binding.direction === "import" && (isUpstreamPeerRole(binding.peerRole) || isCxxPolicy(policyName)));
  const internalBindings = peerBindings.filter((binding) => binding.direction && (binding.peerRole === "ibgp" || isInternalPolicy(policyName)));

  if (networkBindings.length > 0) {
    return {
      policyName,
      policyType: "origin_target",
      modifiable: true,
      auditOnly: false,
      includeInAnnouncementMatrix: true,
      reason: "referenciada por network ... route-policy",
      confidence: "high",
      family,
      prefixScope: prefixScope.length > 0 ? prefixScope : ["pending_prefix_expansion"],
      matrixSource: "policy_graph",
      findings: [],
    };
  }

  if (upstreamExports.length > 0) {
    return {
      policyName,
      policyType: "upstream_export_audit",
      modifiable: false,
      auditOnly: true,
      includeInAnnouncementMatrix: false,
      reason: "política Cxx export ou export de upstream",
      confidence: "high",
      family,
      prefixScope: ["excluded_upstream_export"],
      matrixSource: "policy_graph",
      findings: upstreamExports.map(() => ({
        code: "EXPORT_POLICY_EXCLUDED_FROM_ANNOUNCEMENT_MATRIX",
        severity: "info" as const,
        scope: "target" as const,
        targetPolicyName: policyName,
        message: `A policy ${policyName} está associada como export e foi excluída da matriz, pois a matriz representa apenas pontos de marcação de community em ORIGIN/customer import.`,
      })),
    };
  }

  if (upstreamImports.length > 0) {
    return {
      policyName,
      policyType: "upstream_import_audit",
      modifiable: false,
      auditOnly: true,
      includeInAnnouncementMatrix: false,
      reason: "política Cxx import ou import de upstream",
      confidence: "high",
      family,
      prefixScope: ["excluded_upstream_import"],
      matrixSource: "policy_graph",
      findings: [],
    };
  }

  if (customerImports.length > 0 && !isCxxPolicy(policyName) && !isInternalPolicy(policyName)) {
    const reason = policyHasCommunity || policyNameMatchesCustomerImport(policyName)
      ? "peer cliente em import com comunidade/padrao de import"
      : "peer cliente em import";
    return {
      policyName,
      policyType: "customer_import_target",
      modifiable: true,
      auditOnly: false,
      includeInAnnouncementMatrix: true,
      reason,
      confidence: policyHasCommunity || policyNameMatchesCustomerImport(policyName) ? "high" : "medium",
      family,
      prefixScope: policyHasPrefixHint && policy ? hasPrefixScopeHint(policy) : ["pending_prefix_expansion"],
      matrixSource: "policy_graph",
      findings: [],
    };
  }

  if (internalBindings.length > 0 || isInternalPolicy(policyName)) {
    return {
      policyName,
      policyType: "internal_mesh",
      modifiable: false,
      auditOnly: true,
      includeInAnnouncementMatrix: false,
      reason: "MALHA/iBGP/internal",
      confidence: "high",
      family,
      prefixScope: ["excluded_internal"],
      matrixSource: "policy_graph",
      findings: [],
    };
  }

  if (customerExports.length > 0 || (!isCxxPolicy(policyName) && policyNameMatchesCustomerExport(policyName))) {
    return {
      policyName,
      policyType: "customer_export",
      modifiable: false,
      auditOnly: false,
      includeInAnnouncementMatrix: false,
      reason: "peer cliente em export",
      confidence: "high",
      family,
      prefixScope: ["excluded_export"],
      matrixSource: "policy_graph",
      findings: customerExports.map((binding) => ({
        code: "EXPORT_POLICY_EXCLUDED_FROM_ANNOUNCEMENT_MATRIX",
        severity: "info" as const,
        scope: "target" as const,
        targetPolicyName: policyName,
        message: `A policy ${policyName} está associada como export e foi excluída da matriz, pois a matriz representa apenas pontos de marcação de community em ORIGIN/customer import.`,
      })),
    };
  }

  return {
    policyName,
    policyType: "unknown",
    modifiable: false,
    auditOnly: false,
    includeInAnnouncementMatrix: false,
    reason: "sem binding suficiente para classificar",
    confidence: "low",
    family,
    prefixScope: ["unknown"],
    matrixSource: "policy_graph",
    findings: [],
  };
}

function shouldIncludeInAnnouncementMatrix(classification: AnnouncementPolicyClassification): boolean {
  return (
    classification.modifiable
    && !classification.auditOnly
    && classification.includeInAnnouncementMatrix
    && (classification.policyType === "origin_target" || classification.policyType === "customer_import_target")
  );
}

function bindingExclusionFinding(binding: AnnouncementGraphBinding): AnnouncementFinding | null {
  if (binding.type !== "PEER_USES_POLICY") return null;
  if (binding.direction === "export" && isCustomerPeerRole(binding.peerRole)) {
    return {
      code: "EXPORT_POLICY_EXCLUDED_FROM_ANNOUNCEMENT_MATRIX",
      severity: "info",
      scope: "target",
      targetPolicyName: binding.policyName,
      message: `A policy ${binding.policyName} está associada como export e foi excluída da matriz, pois a matriz representa apenas pontos de marcação de community em ORIGIN/customer import.`,
    };
  }
  if (binding.direction === "export" && (isUpstreamPeerRole(binding.peerRole) || isCxxPolicy(binding.policyName))) {
    return {
      code: "EXPORT_POLICY_EXCLUDED_FROM_ANNOUNCEMENT_MATRIX",
      severity: "info",
      scope: "upstream",
      targetPolicyName: binding.policyName,
      message: `A policy ${binding.policyName} está associada como export e foi excluída da matriz, pois a matriz representa apenas pontos de marcação de community em ORIGIN/customer import.`,
    };
  }
  if (binding.direction === "import" && (isUpstreamPeerRole(binding.peerRole) || isCxxPolicy(binding.policyName))) {
    return {
      code: "EXPORT_POLICY_EXCLUDED_FROM_ANNOUNCEMENT_MATRIX",
      severity: "info",
      scope: "upstream",
      targetPolicyName: binding.policyName,
      message: `A policy ${binding.policyName} está associada como import de upstream e foi excluída da matriz, pois a matriz representa apenas pontos de marcação de community em ORIGIN/customer import.`,
    };
  }
  if (binding.peerRole === "ibgp" || isInternalPolicy(binding.policyName)) {
    return {
      code: "EXPORT_POLICY_EXCLUDED_FROM_ANNOUNCEMENT_MATRIX",
      severity: "info",
      scope: "target",
      targetPolicyName: binding.policyName,
      message: `A policy ${binding.policyName} é interna/MALHA e foi excluída da matriz.`,
    };
  }
  return null;
}

function bindingExclusionCategory(binding: AnnouncementGraphBinding): "customer_export" | "upstream" | "internal" | null {
  if (binding.type !== "PEER_USES_POLICY") return null;
  if (binding.direction === "export" && isCustomerPeerRole(binding.peerRole)) return "customer_export";
  if (binding.direction && (isUpstreamPeerRole(binding.peerRole) || isCxxPolicy(binding.policyName))) return "upstream";
  if (binding.peerRole === "ibgp" || isInternalPolicy(binding.policyName)) return "internal";
  return null;
}

function collectRowCommunities(row: AnnouncementMatrixRow): string[] {
  const values: string[] = [];
  for (const cell of Object.values(row.cells)) {
    if (Array.isArray(cell.communities) && cell.communities.length > 0) {
      values.push(...cell.communities);
      continue;
    }
    if (cell.community) values.push(cell.community);
  }
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))].sort((left, right) => left.localeCompare(right));
}

function refineFinding(finding: AnnouncementFinding): AnnouncementFinding {
  return {
    ...finding,
    targetPolicyName: finding.targetPolicyName ?? null,
    node: finding.node ?? null,
    upstreamCircuitId: finding.upstreamCircuitId ?? null,
    upstreamName: finding.upstreamName ?? null,
    community: finding.community ?? null,
    communityFilter: finding.communityFilter ?? null,
    communityList: finding.communityList ?? null,
    prefixList: finding.prefixList ?? null,
    recommendation: finding.recommendation ?? null,
  };
}

function dedupeFindings(findings: AnnouncementFinding[]): AnnouncementFinding[] {
  const seen = new Set<string>();
  const out: AnnouncementFinding[] = [];
  for (const finding of findings) {
    const key = [
      finding.code,
      finding.scope,
      finding.targetPolicyName ?? "",
      finding.upstreamCircuitId ?? "",
      finding.upstreamName ?? "",
      finding.community ?? "",
      finding.communityFilter ?? "",
      finding.communityList ?? "",
      finding.prefixList ?? "",
      finding.message,
    ].join("|");
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(refineFinding(finding));
  }
  return out;
}

export function buildAnnouncementGraph(input: AnnouncementGraphBuildInput): AnnouncementGraphBuildResult {
  const pipeline = parseHuaweiPolicyDependencyPipeline(input.rawConfig, "ssh_running_config");
  const networkBindings: AnnouncementGraphBinding[] = parseBgpNetworkStatements(input.rawConfig)
    .filter((statement) => Boolean(statement.routePolicyName))
    .map((statement) => ({
      type: "NETWORK_USES_ORIGIN_POLICY" as const,
      policyName: statement.routePolicyName!,
      family: familyFromPrefix(statement.prefix),
      prefix: statement.prefix,
      confidence: "high" as const,
    }));

  const peerRoleByName = new Map<string, string>();
  for (const peer of input.bgpPeers) {
    const keys = [peer.peerIp, peer.name].filter((value): value is string => Boolean(value));
    for (const key of keys) {
      peerRoleByName.set(normalizePolicyLookupKey(key), peer.role?.toLowerCase() ?? "unknown");
    }
  }

  const peerBindings: AnnouncementGraphBinding[] = pipeline.dependency_graph.bgp_policy_bindings.map((binding) => {
    const peerKey = normalizePolicyLookupKey(binding.peerIp ?? binding.consumerName);
    const peerRole = peerRoleByName.get(peerKey) ?? "unknown";
    return {
      type: "PEER_USES_POLICY" as const,
      policyName: binding.routePolicy,
      family: normalizeFamily(binding.afiSafi),
      peer: binding.peerIp ?? binding.consumerName,
      direction: binding.direction,
      peerRole,
      confidence: binding.status === "FOUND" ? "high" : binding.status === "MISSING" ? "medium" : "low",
    };
  });

  const bindings = [...networkBindings, ...peerBindings];
  const policyMap = new Map<string, AnnouncementGraphPolicyInput>();
  for (const policy of input.routePolicies) {
    policyMap.set(normalizePolicyLookupKey(policy.name), policy);
  }

  const policyNames = new Set<string>([
    ...input.routePolicies.map((policy) => policy.name),
    ...bindings.map((binding) => binding.policyName),
  ]);

  const classifications = [...policyNames].map((policyName) =>
    classifyBgpPolicy(policyName, bindings, { policy: policyMap.get(normalizePolicyLookupKey(policyName)) ?? null }),
  );
  const resolution = resolveAnnouncementMatrix({
    rawConfig: input.rawConfig,
    routePolicies: input.routePolicies,
    catalogs: {
      ip_prefixes: pipeline.catalogs.ip_prefixes,
      ipv6_prefixes: pipeline.catalogs.ipv6_prefixes,
    },
    classifications,
    bindings,
  });

  const communitySets = buildAnnouncementCommunitySetLibrary(input.rawConfig);
  const protectedGlobalFilterFindings = buildProtectedGlobalFilterFindings(input.rawConfig);
  const upstreamAudit = runAnnouncementUpstreamAudit({
    rawConfig: input.rawConfig,
    routePolicies: input.routePolicies,
    classifications,
    bindings,
    localAs: input.localAs ?? null,
  });

  const augmentedRows = resolution.rows.map((row) => {
    const desiredCommunities = collectRowCommunities(row);
    const exactMatch = desiredCommunities.length > 0
      ? findExactCommunitySetMatch(desiredCommunities, communitySets)
      : null;
    const rowFindings = [...(row.findings ?? [])];

    if (desiredCommunities.length > 0) {
      if (exactMatch?.matched) {
        rowFindings.push({
          code: "COMMUNITY_SET_EXACT_MATCH_FOUND",
          severity: "info",
          scope: "community_set",
          targetPolicyName: row.targetPolicyName,
          communityList: exactMatch.communityListName ?? null,
          message: `Combinação de communities em ${row.targetPolicyName} bate com community-list ${exactMatch.communityListName}.`,
          evidence: exactMatch,
        });
      } else {
        rowFindings.push({
          code: "COMMUNITY_SET_NO_EXACT_MATCH",
          severity: "info",
          scope: "community_set",
          targetPolicyName: row.targetPolicyName,
          message: `Combinação de communities em ${row.targetPolicyName} nao tem match exato em community-list.`,
          evidence: exactMatch,
        });
      }
    }

    const sharedListNames = new Set<string>();
    for (const cell of Object.values(row.cells)) {
      if (cell.communitySourceType !== "community_list" || !cell.communitySourceName) continue;
      const set = communitySets.find((item) => item.name.toLowerCase() === cell.communitySourceName?.toLowerCase());
      if (set?.isShared) sharedListNames.add(set.name);
    }
    for (const communityList of sharedListNames) {
      rowFindings.push({
        code: "TARGET_POLICY_USES_SHARED_COMMUNITY_LIST",
        severity: "warning",
        scope: "community_set",
        targetPolicyName: row.targetPolicyName,
        communityList,
        message: `Target ${row.targetPolicyName} usa community-list compartilhada ${communityList}.`,
      });
    }

    return {
      ...row,
      matrixState: {
        ...(row.matrixState ?? {}),
        communitySetMatch: exactMatch,
      },
      findings: dedupeFindings(rowFindings),
    };
  });

  const exclusionFindings = classifications.flatMap((classification) => classification.findings ?? []);
  const debugFindings = dedupeFindings([
    ...exclusionFindings,
    ...protectedGlobalFilterFindings,
    ...upstreamAudit.findings,
    ...augmentedRows.flatMap((row) => row.findings ?? []),
    ...(resolution.summary.debugFindings ?? []),
  ]);

  const payload: AnnouncementMatrixPayload = {
    columns: resolution.columns,
    rows: augmentedRows,
    generatedFrom: "policy_graph_community_resolver",
    featureStatus: "community_cells",
    upstreamAudit,
  };

  const summary: AnnouncementMatrixSummaryPayload = {
    ...resolution.summary,
    totalFindings: debugFindings.length,
    totalCriticalFindings: debugFindings.filter((finding) => finding.severity === "error").length,
    debugFindings,
    upstreamAudit: {
      totalUpstreamsAudited: upstreamAudit.totalUpstreamsAudited,
      totalAuditFindings: upstreamAudit.totalAuditFindings,
      totalCriticalAuditFindings: upstreamAudit.totalCriticalAuditFindings,
      localAsUnknownCount: upstreamAudit.localAsUnknownCount,
      prependMismatchCount: upstreamAudit.prependMismatchCount,
    },
  };

  return {
    payload,
    summary,
    bindings,
    classifications,
  };
}

export {
  classifyBgpPolicy,
  shouldIncludeInAnnouncementMatrix,
};
