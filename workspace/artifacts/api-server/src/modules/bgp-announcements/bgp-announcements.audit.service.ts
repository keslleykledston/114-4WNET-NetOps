import { createHash } from "node:crypto";
import { parseRunningConfigCommunities, usageCountsForLibraryNames } from "../netops/huawei-vrp/parsers/community-parser.js";
import { normalizePolicyLookupKey } from "../netops/huawei-vrp/parsers/policy-utils.js";
import { parseAnnouncementCommunityValue } from "./bgp-announcements.matrix-resolver.js";
import type {
  AnnouncementCommunitySet,
  AnnouncementCommunitySetExactMatch,
  AnnouncementFinding,
  AnnouncementFindingSeverity,
  AnnouncementUpstreamAuditPayload,
  AnnouncementUpstreamAuditCircuit,
} from "./bgp-announcements.types.js";

export interface AnnouncementAuditRoutePolicyInput {
  name: string;
  nodes: Array<{
    sequence: number | null;
    action: string | null;
    matches: string[];
    applies: string[];
  }>;
}

export interface AnnouncementAuditBindingInput {
  policyName: string;
  type: "NETWORK_USES_ORIGIN_POLICY" | "PEER_USES_POLICY";
  direction?: "import" | "export";
  peerRole?: string | null;
  peer?: string;
  prefix?: string;
}

export interface AnnouncementAuditClassificationInput {
  policyName: string;
  policyType: string;
  includeInAnnouncementMatrix: boolean;
  confidence?: "high" | "medium" | "low";
  findings?: AnnouncementFinding[];
}

const PROTECTED_GLOBAL_FILTER_PATTERNS = [
  /^GLOBAL-EXPORT-UPSTREAM-/i,
  /^GLOBAL-EXPORT-ALL-/i,
  /^GLOBAL-EXPORT-CDNS-/i,
  /^GLOBAL-EXPORT-PTT-PUBLIC-/i,
  /^IXBR-EXPORT-/i,
  /^FULL-ROUTE-ALL$/i,
];

const ACTION_CODE_TO_LABEL: Record<string, string> = {
  "00": "Rx",
  "01": "On",
  "02": "P1",
  "03": "P2",
  "04": "P3",
  "05": "P4",
  "08": "NE",
  "09": "Def",
  "66": "BH",
  "67": "Off",
};

const LEGACY_FILTER_ACTION_CODE: Record<string, string> = {
  P1: "01",
  P2: "02",
  P3: "03",
  P4: "04",
  P5: "05",
  BLOCK: "67",
  BLACKHOLE: "66",
  NOEXPORT: "08",
  DEFAULT: "09",
  ON: "01",
  OFF: "67",
  NE: "08",
  BH: "66",
  DEF: "09",
};

function dedupeSorted(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))].sort((left, right) => left.localeCompare(right));
}

function normalizeCommunityList(values: string[]): string[] {
  return dedupeSorted(values);
}

function hashNormalizedCommunities(values: string[]): string {
  return createHash("sha256").update(JSON.stringify(values), "utf8").digest("hex");
}

function summaryFromCommunities(values: string[]): string {
  const parsed = values.map((community) => parseAnnouncementCommunityValue(community));
  const parts = parsed.map((item) => {
    if (item.state === "unknown") return item.community;
    return `${item.circuitId ?? "??"}:${item.label}`;
  });
  return parts.join(", ");
}

function communityListUsageFromConfig(rawConfig: string): Map<string, Set<string>> {
  const usage = new Map<string, Set<string>>();
  const lines = rawConfig.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
  let currentPolicy: string | null = null;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line === "#") continue;

    const policyHeader = /^route-policy\s+(\S+)\s+(?:permit|deny)\s+node\s+(\d+)/i.exec(line);
    if (policyHeader) {
      currentPolicy = policyHeader[1] ?? null;
      continue;
    }

    const listRef = /^(?:if-match|apply\s+community)\s+community-list\s+(\S+)\s*$/i.exec(line);
    if (currentPolicy && listRef?.[1]) {
      const key = normalizePolicyLookupKey(listRef[1]);
      const bucket = usage.get(key) ?? new Set<string>();
      bucket.add(currentPolicy);
      usage.set(key, bucket);
    }

    if (!rawLine.startsWith(" ") && !rawLine.startsWith("\t")) {
      currentPolicy = null;
    }
  }

  return usage;
}

function mapSeverity(a: AnnouncementFindingSeverity | null | undefined): number {
  if (a === "error") return 3;
  if (a === "warning") return 2;
  if (a === "info") return 1;
  return 0;
}

function extractCircuitIdFromName(name: string): string | null {
  const match = /^C(\d{2})/i.exec(name.trim());
  return match?.[1] ?? null;
}

function resolveActionCodeFromLegacyName(name: string): string | null {
  const upper = name.trim().toUpperCase();
  for (const [token, code] of Object.entries(LEGACY_FILTER_ACTION_CODE)) {
    if (upper.includes(token)) return code;
  }
  return null;
}

function buildFinding(input: Partial<AnnouncementFinding> & Pick<AnnouncementFinding, "code" | "severity" | "scope" | "message">): AnnouncementFinding {
  return {
    ...input,
    targetPolicyName: input.targetPolicyName ?? null,
    node: input.node ?? null,
    upstreamCircuitId: input.upstreamCircuitId ?? null,
    upstreamName: input.upstreamName ?? null,
    community: input.community ?? null,
    communityFilter: input.communityFilter ?? null,
    communityList: input.communityList ?? null,
    prefixList: input.prefixList ?? null,
    recommendation: input.recommendation ?? null,
  };
}

export function buildAnnouncementCommunitySetLibrary(rawConfig: string): AnnouncementCommunitySet[] {
  const parsed = parseRunningConfigCommunities(rawConfig);
  const usageCounts = usageCountsForLibraryNames(parsed);
  const usageByList = communityListUsageFromConfig(rawConfig);

  return parsed.communityLists.reduce<AnnouncementCommunitySet[]>((acc, entry) => {
    const name = entry.listName.trim();
    if (!name) return acc;
    const bucket = acc.find((item) => item.name.toLowerCase() === name.toLowerCase());
    const value = (entry.value || "").trim();
    if (!bucket) {
      acc.push({
        name,
        communities: value && value !== "[lista-sem-members-no-backup]" ? [value] : [],
        normalizedCommunities: [],
        normalizedHash: "",
        semanticSummary: "",
        usageCount: usageCounts[name] ?? 0,
        usedByPolicies: [...(usageByList.get(normalizePolicyLookupKey(name)) ?? new Set<string>())].sort((left, right) => left.localeCompare(right)),
        isShared: false,
        findings: [],
      });
      return acc;
    }
    if (value && value !== "[lista-sem-members-no-backup]" && !bucket.communities.some((community) => community.toLowerCase() === value.toLowerCase())) {
      bucket.communities.push(value);
    }
    bucket.usageCount = usageCounts[name] ?? bucket.usageCount;
    bucket.usedByPolicies = [...new Set([...bucket.usedByPolicies, ...(usageByList.get(normalizePolicyLookupKey(name)) ?? new Set<string>())])].sort((left, right) => left.localeCompare(right));
    return acc;
  }, []).map((set) => {
    const normalizedCommunities = normalizeCommunityList(set.communities);
    return {
      ...set,
      communities: normalizedCommunities,
      normalizedCommunities,
      normalizedHash: hashNormalizedCommunities(normalizedCommunities),
      semanticSummary: summaryFromCommunities(normalizedCommunities),
      isShared: set.usedByPolicies.length > 1 || set.usageCount > 1,
    };
  }).sort((left, right) => left.name.localeCompare(right.name));
}

export function findExactCommunitySetMatch(
  desiredCommunities: string[],
  communitySets: AnnouncementCommunitySet[],
): AnnouncementCommunitySetExactMatch {
  const normalizedDesired = normalizeCommunityList(desiredCommunities);
  const desiredHash = hashNormalizedCommunities(normalizedDesired);
  const exact = communitySets.find((set) => set.normalizedHash === desiredHash && set.normalizedCommunities.length === normalizedDesired.length);
  if (exact) {
    return {
      matched: true,
      matchType: "exact",
      communityListName: exact.name,
      normalizedHash: exact.normalizedHash,
      communities: [...exact.normalizedCommunities],
      desiredCommunities: normalizedDesired,
      nearestMatches: [],
    };
  }

  const nearestMatches = communitySets
    .map((set) => {
      const overlap = normalizedDesired.filter((community) => set.normalizedCommunities.includes(community)).length;
      return { name: set.name, normalizedHash: set.normalizedHash, overlap };
    })
    .filter((item) => item.overlap > 0)
    .sort((left, right) => right.overlap - left.overlap || left.name.localeCompare(right.name))
    .slice(0, 3);

  return {
    matched: false,
    matchType: "none",
    communities: [],
    desiredCommunities: normalizedDesired,
    nearestMatches,
  };
}

export function buildProtectedGlobalFilterFindings(rawConfig: string): AnnouncementFinding[] {
  const parsed = parseRunningConfigCommunities(rawConfig);
  const usageByFilter = new Map<string, Set<string>>();

  for (const ref of parsed.routePolicyIfMatch) {
    const key = normalizePolicyLookupKey(ref.filterName);
    const bucket = usageByFilter.get(key) ?? new Set<string>();
    bucket.add(ref.routePolicy);
    usageByFilter.set(key, bucket);
  }

  const findings: AnnouncementFinding[] = [];
  for (const filter of parsed.communityFilters) {
    const name = filter.name.trim();
    if (!name || !PROTECTED_GLOBAL_FILTER_PATTERNS.some((pattern) => pattern.test(name))) continue;
    const usedBy = [...(usageByFilter.get(normalizePolicyLookupKey(name)) ?? new Set<string>())].sort((left, right) => left.localeCompare(right));
    findings.push(buildFinding({
      code: "PROTECTED_GLOBAL_FILTER_SHARED_OK",
      severity: "info",
      scope: "protected_global_filter",
      message: `Filtro global protegido ${name} pode ser reutilizado sem conflito compartilhado.`,
      communityFilter: name,
      evidence: { usedBy },
    }));
    findings.push(buildFinding({
      code: "PROTECTED_GLOBAL_FILTER_PRESERVE_ON_REMOVE",
      severity: "info",
      scope: "protected_global_filter",
      message: `Filtro global protegido ${name} deve ser preservado em remoção futura.`,
      communityFilter: name,
      evidence: { usedBy },
    }));
  }

  return findings;
}

function parseAsPathLine(line: string): { localAs: number | null; count: number } | null {
  const match = /^apply\s+as-path\s+(.+)$/i.exec(line.trim());
  if (!match?.[1]) return null;
  const blob = match[1].replace(/\s+additive\s*$/i, "").trim();
  const values = blob.split(/\s+/).filter(Boolean);
  const first = values[0] ? Number(values[0]) : null;
  return {
    localAs: Number.isInteger(first ?? NaN) ? first : null,
    count: values.length,
  };
}

function expectedPrependCount(actionCode: string | null): number | null {
  switch (actionCode) {
    case "01": return 0;
    case "02": return 1;
    case "03": return 2;
    case "04": return 3;
    case "05": return 4;
    default: return null;
  }
}

export function runAnnouncementUpstreamAudit(input: {
  rawConfig: string;
  routePolicies: AnnouncementAuditRoutePolicyInput[];
  classifications: AnnouncementAuditClassificationInput[];
  bindings: AnnouncementAuditBindingInput[];
  localAs: number | null;
}): AnnouncementUpstreamAuditPayload {
  const parsed = parseRunningConfigCommunities(input.rawConfig);
  const localAs = input.localAs ?? parseLocalAsFromRawConfig(input.rawConfig);
  const communityFilterValues = new Map<string, string[]>();
  for (const filter of parsed.communityFilters) {
    const key = normalizePolicyLookupKey(filter.name);
    communityFilterValues.set(key, [...(communityFilterValues.get(key) ?? []), filter.value]);
  }

  const audits: Record<string, AnnouncementUpstreamAuditCircuit> = {};
  const findings: AnnouncementFinding[] = [];
  let localAsUnknownCount = 0;
  let prependMismatchCount = 0;

  const exportPolicies = input.classifications.filter((classification) => classification.policyType === "upstream_export_audit");
  for (const classification of exportPolicies) {
    const policy = input.routePolicies.find((item) => normalizePolicyLookupKey(item.name) === normalizePolicyLookupKey(classification.policyName));
    if (!policy) continue;

    const circuitId = extractCircuitIdFromName(policy.name) ?? classifyCircuitFromCommunities(policy.nodes) ?? "??";
    const audit: AnnouncementUpstreamAuditCircuit = audits[circuitId] ?? {
      circuitId,
      upstreamName: `C${circuitId}`,
      localAs,
      exportPolicy: policy.name,
      findings: [],
      maxSeverity: null,
      actions: {},
    };
    audit.exportPolicy = policy.name;
    audit.localAs = localAs;
    if (audit.upstreamName === `C${circuitId}` && policy.name) {
      audit.upstreamName = policy.name;
    }

    if (audit.localAs == null) {
      localAsUnknownCount += 1;
      const finding = buildFinding({
        code: "LOCAL_AS_UNKNOWN",
        severity: "warning",
        scope: "upstream",
        targetPolicyName: policy.name,
        upstreamCircuitId: circuitId,
        upstreamName: audit.upstreamName,
        message: `Local-AS nao detectado para ${policy.name}.`,
      });
      audit.findings.push(finding);
      findings.push(finding);
    }

    for (const node of policy.nodes) {
      const communityFilterRefs = node.matches
        .flatMap((line) => {
          const match = /^if-match\s+community-filter\s+(?:(?:basic|advanced)\s+)?(\S+)/i.exec(line.trim());
          return match?.[1] ? [match[1]] : [];
        });
      const asPath = node.applies.map(parseAsPathLine).find((value) => value !== null) ?? null;

      for (const line of node.applies) {
        if (/^apply\s+community\s+no-export$/i.test(line.trim())) {
          const finding = buildFinding({
            code: "UPSTREAM_EXPORT_POLICY_NO_OFF_RULE",
            severity: "info",
            scope: "upstream",
            targetPolicyName: policy.name,
            node: node.sequence,
            upstreamCircuitId: circuitId,
            upstreamName: audit.upstreamName,
            message: `Policy ${policy.name} aplica no-export.`,
            evidence: line.trim(),
          });
          audit.findings.push(finding);
          findings.push(finding);
        }
      }

      for (const filterName of communityFilterRefs) {
        const values = communityFilterValues.get(normalizePolicyLookupKey(filterName)) ?? [];
        if (values.length === 0) {
          const finding = buildFinding({
            code: "UPSTREAM_EXPORT_POLICY_UNKNOWN_COMMUNITY",
            severity: "warning",
            scope: "upstream",
            targetPolicyName: policy.name,
            node: node.sequence,
            upstreamCircuitId: circuitId,
            upstreamName: audit.upstreamName,
            communityFilter: filterName,
            message: `community-filter ${filterName} sem community resolvida em ${policy.name}.`,
          });
          audit.findings.push(finding);
          findings.push(finding);
          continue;
        }

        for (const value of values) {
          const parsedCommunity = parseAnnouncementCommunityValue(value);
          const expectedCircuit = extractCircuitIdFromName(policy.name);
          if (parsedCommunity.state === "unknown") {
            const finding = buildFinding({
              code: "UPSTREAM_EXPORT_POLICY_UNKNOWN_COMMUNITY",
              severity: "warning",
              scope: "upstream",
              targetPolicyName: policy.name,
              node: node.sequence,
              upstreamCircuitId: circuitId,
              upstreamName: audit.upstreamName,
              communityFilter: filterName,
              community: value,
              message: `Community desconhecida em ${policy.name}: ${value}.`,
            });
            audit.findings.push(finding);
            findings.push(finding);
            continue;
          }
          if (expectedCircuit && parsedCommunity.circuitId && parsedCommunity.circuitId !== expectedCircuit) {
            const finding = buildFinding({
              code: "UPSTREAM_COMMUNITY_CIRCUIT_MISMATCH",
              severity: "error",
              scope: "upstream",
              targetPolicyName: policy.name,
              node: node.sequence,
              upstreamCircuitId: circuitId,
              upstreamName: audit.upstreamName,
              communityFilter: filterName,
              community: value,
              message: `community ${value} nao bate com CID ${expectedCircuit} esperado por ${policy.name}.`,
            });
            audit.findings.push(finding);
            findings.push(finding);
          }

          const expectedActionCode = resolveActionCodeFromLegacyName(filterName);
          if (expectedActionCode && parsedCommunity.actionCode && parsedCommunity.actionCode !== expectedActionCode) {
            const finding = buildFinding({
              code: "COMMUNITY_FILTER_ACTION_CODE_MISMATCH",
              severity: "error",
              scope: "upstream",
              targetPolicyName: policy.name,
              node: node.sequence,
              upstreamCircuitId: circuitId,
              upstreamName: audit.upstreamName,
              communityFilter: filterName,
              community: value,
              message: `community-filter ${filterName} aponta action ${expectedActionCode}, mas community ${value} resolve ${parsedCommunity.actionCode}.`,
            });
            audit.findings.push(finding);
            findings.push(finding);
          }

          const actionLabel = ACTION_CODE_TO_LABEL[parsedCommunity.actionCode ?? ""] ?? parsedCommunity.label;
          audit.actions[actionLabel] = {
            actionLabel,
            actionCode: parsedCommunity.actionCode,
            community: value,
            sourceType: "community_filter",
            sourceName: filterName,
          };

          const expectedPrepends = expectedPrependCount(parsedCommunity.actionCode);
          if (expectedPrepends != null) {
            if (!asPath && expectedPrepends > 0) {
              const finding = buildFinding({
                code: "UPSTREAM_EXPORT_POLICY_MISSING_ACTION",
                severity: "warning",
                scope: "upstream",
                targetPolicyName: policy.name,
                node: node.sequence,
                upstreamCircuitId: circuitId,
                upstreamName: audit.upstreamName,
                community: value,
                communityFilter: filterName,
                message: `Policy ${policy.name} sem apply as-path para action ${actionLabel}.`,
              });
              audit.findings.push(finding);
              findings.push(finding);
            } else if (asPath && audit.localAs != null) {
              if (asPath.localAs !== audit.localAs) {
                const finding = buildFinding({
                  code: "AS_PATH_PREPEND_LOCAL_AS_MISMATCH",
                  severity: "error",
                  scope: "upstream",
                  targetPolicyName: policy.name,
                  node: node.sequence,
                  upstreamCircuitId: circuitId,
                  upstreamName: audit.upstreamName,
                  community: value,
                  communityFilter: filterName,
                  message: `apply as-path usa ${asPath.localAs}, esperado ${audit.localAs}.`,
                  evidence: lineEvidence(node.applies),
                });
                audit.findings.push(finding);
                findings.push(finding);
              }
              if (asPath.count !== expectedPrepends + 1) {
                const finding = buildFinding({
                  code: "AS_PATH_PREPEND_COUNT_MISMATCH",
                  severity: "error",
                  scope: "upstream",
                  targetPolicyName: policy.name,
                  node: node.sequence,
                  upstreamCircuitId: circuitId,
                  upstreamName: audit.upstreamName,
                  community: value,
                  communityFilter: filterName,
                  message: `apply as-path conta ${asPath.count - 1} prepend(s), esperado ${expectedPrepends}.`,
                  evidence: lineEvidence(node.applies),
                });
                audit.findings.push(finding);
                findings.push(finding);
                prependMismatchCount += 1;
              }
            }
          }
        }
      }
    }

    audit.maxSeverity = audit.findings.length === 0
      ? null
      : audit.findings.reduce<AnnouncementFindingSeverity | null>(
        (max, finding) => (mapSeverity(finding.severity) > mapSeverity(max) ? finding.severity : max),
        null,
      );
    audits[circuitId] = audit;
  }

  const allFindings = findings.sort((left, right) => mapSeverity(right.severity) - mapSeverity(left.severity));
  return {
    findings: allFindings,
    byCircuit: audits,
    totalUpstreamsAudited: Object.keys(audits).length,
    totalAuditFindings: allFindings.length,
    totalCriticalAuditFindings: allFindings.filter((finding) => finding.severity === "error").length,
    localAsUnknownCount,
    prependMismatchCount,
  };
}

function parseLocalAsFromRawConfig(rawConfig: string): number | null {
  const match = /^\s*bgp\s+(\d+)\s*$/im.exec(rawConfig);
  return match?.[1] ? Number(match[1]) : null;
}

function classifyCircuitFromCommunities(nodes: AnnouncementAuditRoutePolicyInput["nodes"]): string | null {
  for (const node of nodes) {
    for (const line of node.applies) {
      const match = /^apply\s+community\s+([^\s]+)$/i.exec(line.trim());
      if (!match?.[1]) continue;
      const parsed = parseAnnouncementCommunityValue(match[1]);
      if (parsed.circuitId) return parsed.circuitId;
    }
  }
  return null;
}

function lineEvidence(lines: string[]): string {
  return lines.join(" | ");
}
