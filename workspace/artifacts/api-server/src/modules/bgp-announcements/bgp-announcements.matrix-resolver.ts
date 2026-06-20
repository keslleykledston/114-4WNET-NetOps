import { parseRunningConfigCommunities } from "../netops/huawei-vrp/parsers/community-parser.js";
import { extractRoutePolicyIfMatchDependencies, normalizePolicyLookupKey } from "../netops/huawei-vrp/parsers/policy-utils.js";
import type {
  AnnouncementExpandedPrefix,
  AnnouncementFinding,
  AnnouncementMatrixCell,
  AnnouncementMatrixColumn,
  AnnouncementMatrixPrefixScope,
  AnnouncementMatrixRow,
  AnnouncementMatrixSummaryPayload,
  AnnouncementSnapshotSource,
} from "./bgp-announcements.types.js";

export interface AnnouncementMatrixRoutePolicyInput {
  name: string;
  nodes: Array<{
    sequence: number | null;
    action: string | null;
    matches: string[];
    applies: string[];
  }>;
}

export interface AnnouncementMatrixCatalogEntry {
  name: string;
  entries: Array<Record<string, unknown>>;
}

export interface AnnouncementMatrixCatalogsInput {
  ip_prefixes: Record<string, AnnouncementMatrixCatalogEntry>;
  ipv6_prefixes: Record<string, AnnouncementMatrixCatalogEntry>;
}

export interface AnnouncementMatrixBindingInput {
  policyName: string;
  type: "NETWORK_USES_ORIGIN_POLICY" | "PEER_USES_POLICY";
  direction?: "import" | "export";
  peerRole?: string | null;
  peer?: string;
  prefix?: string;
}

export interface AnnouncementMatrixClassificationInput {
  policyName: string;
  policyType: string;
  family: "ipv4" | "ipv6" | "mixed" | "unknown";
  prefixScope: unknown;
  findings?: AnnouncementFinding[];
  confidence?: "high" | "medium" | "low";
  matrixSource?: AnnouncementSnapshotSource;
  includeInAnnouncementMatrix?: boolean;
}

export interface AnnouncementMatrixResolutionInput {
  rawConfig: string;
  routePolicies: AnnouncementMatrixRoutePolicyInput[];
  catalogs: AnnouncementMatrixCatalogsInput;
  classifications: AnnouncementMatrixClassificationInput[];
  bindings: AnnouncementMatrixBindingInput[];
}

export interface AnnouncementMatrixResolutionResult {
  columns: AnnouncementMatrixColumn[];
  rows: AnnouncementMatrixRow[];
  summary: AnnouncementMatrixSummaryPayload;
}

type CellState = "unmarked" | "on" | "p1" | "p2" | "p3" | "p4" | "ne" | "def" | "bh" | "off" | "rx" | "unknown" | "conflict";

interface ParsedAppliedCommunity {
  community: string;
  sourceType: "direct" | "community_list" | "unknown";
  sourceName: string | null;
}

interface ResolvedAction {
  community: string;
  sourceType: "direct" | "community_list" | "unknown";
  sourceName: string | null;
  circuitId: string | null;
  actionCode: string | null;
  state: CellState;
  label: string;
}

interface RowResolution {
  cells: Record<string, AnnouncementMatrixCell>;
  findings: AnnouncementFinding[];
  prefixScope: AnnouncementMatrixPrefixScope;
  affectedPrefixes: string[];
  targetRisk: "low" | "medium" | "high";
  totalOn: number;
  totalP1: number;
  totalP2: number;
  totalP3: number;
  totalP4: number;
  totalOff: number;
  totalUnmarked: number;
  totalConflict: number;
  totalUnknown: number;
  totalExpandedPrefixes: number;
  totalPrefixScopeUnknown: number;
  totalFindings: number;
  totalCriticalFindings: number;
}

const ACTION_LABEL_BY_CODE: Record<string, string> = {
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

function isCommunityListReference(line: string): string | null {
  const match = /^apply\s+community\s+community-list\s+(\S+)\s*$/i.exec(line.trim());
  return match?.[1] ? match[1] : null;
}

function parseDirectCommunities(line: string): string[] {
  const trimmed = line.trim();
  const match = /^apply\s+community\s+(.+?)\s*$/i.exec(trimmed);
  if (!match?.[1]) return [];
  const blob = match[1].replace(/\s+additive\s*$/i, "").trim();
  if (/^community-list\s+\S+/i.test(blob)) return [];
  return blob
    .split(/\s+/)
    .map((part) => part.trim().replace(/,+$/, ""))
    .filter((part) => Boolean(part) && !/^additive$/i.test(part));
}

export function parseAnnouncementCommunityValue(community: string): ResolvedAction {
  const trimmed = community.trim();
  const match = /^64777:5(\d{2})(\d{2})$/i.exec(trimmed);
  if (!match) {
    return {
      community: trimmed,
      sourceType: "unknown",
      sourceName: null,
      circuitId: null,
      actionCode: null,
      state: "unknown",
      label: "?",
    };
  }

  const circuitId = match[1] ?? null;
  const actionCode = match[2] ?? null;
  const label = actionCode ? (ACTION_LABEL_BY_CODE[actionCode] ?? "?") : "?";
  const state = actionCode
    ? (actionCode === "01"
      ? "on"
      : actionCode === "02"
        ? "p1"
        : actionCode === "03"
          ? "p2"
          : actionCode === "04"
            ? "p3"
            : actionCode === "05"
              ? "p4"
              : actionCode === "08"
                ? "ne"
                : actionCode === "09"
                  ? "def"
                  : actionCode === "66"
                    ? "bh"
                    : actionCode === "67"
                      ? "off"
                      : actionCode === "00"
                        ? "rx"
                        : "unknown")
    : "unknown";

  return {
    community: trimmed,
    sourceType: "direct",
    sourceName: null,
    circuitId,
    actionCode,
    state,
    label,
  };
}

function normalizePrefixLength(value: string | null | undefined): number | null {
  if (!value) return null;
  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : null;
}

function parsePrefixEntry(raw: Record<string, unknown>, family: "ipv4" | "ipv6"): AnnouncementExpandedPrefix | null {
  const rawText = String(raw.raw ?? raw.line ?? raw.expression ?? "").trim();
  if (!rawText) return null;
  const index = raw.index == null ? null : Number(raw.index);
  const base = family === "ipv4"
    ? /^ip\s+ip-prefix\s+\S+\s+index\s+(\d+)\s+(permit|deny)\s+(\S+)\s+(\S+)(.*)$/i.exec(rawText)
    : /^ip\s+ipv6-prefix\s+\S+\s+index\s+(\d+)\s+(permit|deny)\s+(\S+)\s+(\S+)(.*)$/i.exec(rawText);
  if (!base) {
    const short = family === "ipv4"
      ? /^(\S+)\s+(\d+)(.*)$/i.exec(String(raw.expression ?? rawText).trim())
      : /^(\S+)\s+(\d+)(.*)$/i.exec(String(raw.expression ?? rawText).trim());
    const prefix = short?.[1];
    const length = short?.[2];
    if (!prefix || !length) return null;
    return {
      index: Number.isFinite(index ?? NaN) ? index : null,
      action: null,
      prefix: `${prefix}/${length}`,
      raw: rawText,
    };
  }

  const action = (base[2] ?? null)?.toLowerCase() ?? null;
  const prefix = base[3] ?? null;
  const length = normalizePrefixLength(base[4]);
  const suffix = base[5] ?? "";
  const ge = /greater-equal\s+(\d+)/i.exec(suffix)?.[1];
  const le = /less-equal\s+(\d+)/i.exec(suffix)?.[1];
  if (!prefix || length == null) return null;
  return {
    index: Number.isFinite(index ?? NaN) ? index : null,
    action,
    prefix: `${prefix}/${length}`,
    ge: ge ? Number(ge) : null,
    le: le ? Number(le) : null,
    raw: rawText,
  };
}

function expandCatalogEntries(
  entries: Array<Record<string, unknown>>,
  family: "ipv4" | "ipv6",
): AnnouncementExpandedPrefix[] {
  const expanded: AnnouncementExpandedPrefix[] = [];
  for (const entry of entries) {
    const resolved = parsePrefixEntry(entry, family);
    if (resolved) expanded.push(resolved);
  }
  return expanded;
}

function familyFromMatch(line: string): "ipv4" | "ipv6" | "unknown" {
  if (/ipv6\s+address\s+prefix-list/i.test(line)) return "ipv6";
  if (/ip-prefix/i.test(line)) return "ipv4";
  return "unknown";
}

function buildCommunityCatalog(rawConfig: string): Map<string, string[]> {
  const parsed = parseRunningConfigCommunities(rawConfig);
  const catalogs = new Map<string, string[]>();
  for (const list of parsed.communityLists) {
    if (!catalogs.has(normalizePolicyLookupKey(list.listName))) {
      catalogs.set(normalizePolicyLookupKey(list.listName), []);
    }
    const bucket = catalogs.get(normalizePolicyLookupKey(list.listName)) ?? [];
    if (list.value && !/^\[lista-sem-members-no-backup\]$/i.test(list.value)) {
      bucket.push(list.value.trim());
    }
    catalogs.set(normalizePolicyLookupKey(list.listName), bucket);
  }
  return catalogs;
}

function collectAppliedCommunities(
  policy: AnnouncementMatrixRoutePolicyInput,
  communityLists: Map<string, string[]>,
): { communities: ParsedAppliedCommunity[]; unknownEvidence: Array<{ code: string; message: string }> } {
  const resolved: ParsedAppliedCommunity[] = [];
  const unknownEvidence: Array<{ code: string; message: string }> = [];

  for (const node of policy.nodes) {
    for (const line of node.applies) {
      const listName = isCommunityListReference(line);
      if (listName) {
        const communities = communityLists.get(normalizePolicyLookupKey(listName)) ?? [];
        if (communities.length === 0) {
          unknownEvidence.push({
            code: "COMMUNITY_LIST_NOT_FOUND",
            message: `community-list ${listName} vazia ou nao encontrada em ${policy.name}`,
          });
        }
        for (const community of communities) {
          resolved.push({ community, sourceType: "community_list", sourceName: listName });
        }
        continue;
      }

      const direct = parseDirectCommunities(line);
      if (direct.length === 0) {
        if (/^apply\s+community\b/i.test(line.trim())) {
          unknownEvidence.push({
            code: "UNKNOWN_COMMUNITY_NAMESPACE",
            message: `apply community nao resolvido em ${policy.name}: ${line.trim()}`,
          });
        }
        continue;
      }

      for (const community of direct) {
        resolved.push({ community, sourceType: "direct", sourceName: null });
      }
    }
  }

  return { communities: resolved, unknownEvidence };
}

function buildPrefixScope(
  policy: AnnouncementMatrixRoutePolicyInput,
  catalogs: AnnouncementMatrixCatalogsInput,
  sharedCounts: Map<string, number>,
  bindings: AnnouncementMatrixBindingInput[],
): { prefixScope: AnnouncementMatrixPrefixScope; affectedPrefixes: string[]; findings: AnnouncementFinding[]; totalExpandedPrefixes: number; totalPrefixScopeUnknown: number } {
  const networkBindings = bindings.filter((binding) => binding.type === "NETWORK_USES_ORIGIN_POLICY" && normalizePolicyLookupKey(binding.policyName) === normalizePolicyLookupKey(policy.name));
  if (networkBindings.length > 0) {
    const expandedPrefixes = networkBindings
      .map((binding) => binding.prefix?.trim() ?? "")
      .filter(Boolean)
      .map((prefix) => ({
        index: null,
        action: "permit",
        prefix,
        raw: `network ${prefix} route-policy ${policy.name}`,
      }));
    return {
      prefixScope: {
        type: "network",
        name: policy.name,
        expandedPrefixes,
        affectedPrefixCount: expandedPrefixes.length,
        shared: networkBindings.length > 1,
      },
      affectedPrefixes: expandedPrefixes.map((item) => item.prefix),
      findings: [],
      totalExpandedPrefixes: expandedPrefixes.length,
      totalPrefixScopeUnknown: 0,
    };
  }

  const refs = new Map<string, "ipv4" | "ipv6">();
  for (const node of policy.nodes) {
    for (const match of node.matches) {
      for (const ref of extractRoutePolicyIfMatchDependencies(match)) {
        if (ref.type === "ip-prefix") refs.set(ref.name, "ipv4");
        if (ref.type === "ipv6-prefix") refs.set(ref.name, "ipv6");
      }
    }
  }

  if (refs.size === 0) {
    return {
      prefixScope: {
        type: "unknown",
        name: policy.name,
        expandedPrefixes: [],
        affectedPrefixCount: 0,
        shared: null,
      },
      affectedPrefixes: [],
      findings: [{
        code: "TARGET_POLICY_WITHOUT_PREFIX_SCOPE",
        message: `A policy ${policy.name} nao referencia ip-prefix/ipv6-prefix.`,
        severity: "warning",
        scope: "prefix_scope",
        targetPolicyName: policy.name,
      }],
      totalExpandedPrefixes: 0,
      totalPrefixScopeUnknown: 1,
    };
  }

  const expandedPrefixes: AnnouncementExpandedPrefix[] = [];
  const names: string[] = [];
  const findings: AnnouncementFinding[] = [];

  for (const [name, family] of refs) {
    names.push(name);
    const catalog = family === "ipv6" ? catalogs.ipv6_prefixes[normalizePolicyLookupKey(name)] : catalogs.ip_prefixes[normalizePolicyLookupKey(name)];
    if (!catalog || catalog.entries.length === 0) {
        findings.push({
          code: "PREFIX_LIST_EMPTY",
          message: `Prefix-list ${name} nao encontrada ou vazia em ${policy.name}.`,
          severity: "warning",
          scope: "prefix_scope",
          targetPolicyName: policy.name,
          prefixList: name,
        });
        findings.push({
          code: "PREFIX_LIST_EXPANSION_REQUIRED",
          message: `Prefix-list ${name} precisa ser expandida para ${policy.name}.`,
          severity: "warning",
          scope: "prefix_scope",
          targetPolicyName: policy.name,
          prefixList: name,
        });
      continue;
    }
    expandedPrefixes.push(...expandCatalogEntries(catalog.entries as Array<Record<string, unknown>>, family));
  }

  const shared = names.some((name) => (sharedCounts.get(normalizePolicyLookupKey(name)) ?? 0) > 1);
  const scopeType = [...refs.values()].some((family) => family === "ipv6") ? "ipv6_prefix" : "ip_prefix";

  return {
    prefixScope: {
      type: scopeType,
      name: names.join(", "),
      expandedPrefixes,
      affectedPrefixCount: expandedPrefixes.length,
      shared,
    },
    affectedPrefixes: expandedPrefixes.map((item) => item.prefix),
    findings,
    totalExpandedPrefixes: expandedPrefixes.length,
    totalPrefixScopeUnknown: expandedPrefixes.length === 0 ? 1 : 0,
  };
}

function labelForCircuitId(circuitId: string): string {
  const trimmed = String(circuitId ?? "").trim();
  if (!trimmed) return "C??";
  if (/^C\d+$/i.test(trimmed)) return trimmed.toUpperCase();
  if (/^\d+$/.test(trimmed)) return `C${trimmed.padStart(2, "0")}`;
  return trimmed.toUpperCase();
}

function normalizeActionCode(cellState: CellState): string | null {
  switch (cellState) {
    case "rx": return "00";
    case "on": return "01";
    case "p1": return "02";
    case "p2": return "03";
    case "p3": return "04";
    case "p4": return "05";
    case "ne": return "08";
    case "def": return "09";
    case "bh": return "66";
    case "off": return "67";
    default: return null;
  }
}

function buildCellFromState(
  circuitId: string,
  rowPolicyName: string,
  state: CellState,
  communities: ParsedAppliedCommunity[],
): AnnouncementMatrixCell {
  const chosen = communities[0] ?? null;
  const hasConflict = state === "conflict";
  const community = hasConflict ? null : chosen?.community ?? null;
  const labelByState: Record<CellState, string> = {
    unmarked: "—",
    on: "On",
    p1: "P1",
    p2: "P2",
    p3: "P3",
    p4: "P4",
    ne: "NE",
    def: "Def",
    bh: "BH",
    off: "Off",
    rx: "Rx",
    unknown: "?",
    conflict: "!",
  };
  return {
    circuitId,
    upstreamName: labelForCircuitId(circuitId),
    state,
    label: labelByState[state],
    communities: communities.length > 1 ? communities.map((item) => item.community) : undefined,
    community,
    actionCode: hasConflict ? null : normalizeActionCode(state),
    communitySourceType: chosen?.sourceType ?? "unknown",
    communitySourceName: chosen?.sourceName ?? null,
    note: hasConflict ? `Conflito em ${rowPolicyName} para ${circuitId}` : null,
  };
}

function resolveRowCells(
  policy: AnnouncementMatrixRoutePolicyInput,
  columns: AnnouncementMatrixColumn[],
  communityLists: Map<string, string[]>,
  catalogs: AnnouncementMatrixCatalogsInput,
  sharedPrefixCounts: Map<string, number>,
  bindings: AnnouncementMatrixBindingInput[],
): RowResolution {
  const { communities, unknownEvidence } = collectAppliedCommunities(policy, communityLists);
  const resolvedByCircuit = new Map<string, ParsedAppliedCommunity[]>();
  const findings: AnnouncementFinding[] = [];
  let totalOn = 0;
  let totalP1 = 0;
  let totalP2 = 0;
  let totalP3 = 0;
  let totalP4 = 0;
  let totalOff = 0;
  let totalUnmarked = 0;
  let totalConflict = 0;
  let totalUnknown = 0;

  for (const item of communities) {
    const parsed = parseAnnouncementCommunityValue(item.community);
    if (parsed.state === "unknown") {
      totalUnknown += 1;
        findings.push({
          code: "UNKNOWN_COMMUNITY_NAMESPACE",
          message: `Community desconhecida em ${policy.name}: ${item.community}`,
          severity: "warning",
          scope: "cell",
          targetPolicyName: policy.name,
          community: item.community,
        });
        continue;
      }
    if (!parsed.circuitId) continue;
    const bucket = resolvedByCircuit.get(parsed.circuitId) ?? [];
    bucket.push(item);
    resolvedByCircuit.set(parsed.circuitId, bucket);
  }

  for (const entry of unknownEvidence) {
    totalUnknown += 1;
      findings.push({
        code: entry.code,
        message: entry.message,
        severity: "warning",
        scope: "cell",
        targetPolicyName: policy.name,
      });
    }

  const cells: Record<string, AnnouncementMatrixCell> = {};

  for (const column of columns) {
    const resolved = resolvedByCircuit.get(column.upstreamCircuitId) ?? [];
    const parsedActions = resolved.map((item) => parseAnnouncementCommunityValue(item.community)).filter((item) => item.state !== "unknown");
    const uniqueStates = new Set(parsedActions.map((item) => item.actionCode).filter((value): value is string => Boolean(value)));
    let cellState: CellState = "unmarked";
    if (resolved.length > 0) {
      if (parsedActions.length === 0) {
        cellState = "unknown";
        totalUnknown += 1;
      } else if (uniqueStates.size > 1) {
        cellState = "conflict";
        totalConflict += 1;
          findings.push({
            code: "MULTIPLE_ACTIONS_FOR_SAME_UPSTREAM",
            message: `Mais de uma action para o mesmo upstream ${column.upstreamCircuitId} em ${policy.name}.`,
            severity: "error",
            scope: "cell",
            targetPolicyName: policy.name,
            upstreamCircuitId: column.upstreamCircuitId,
            upstreamName: column.upstreamName,
          });
        } else {
        const actionCode = parsedActions[0]?.actionCode ?? null;
        cellState = actionCode === "01"
          ? "on"
          : actionCode === "02"
            ? "p1"
            : actionCode === "03"
              ? "p2"
              : actionCode === "04"
                ? "p3"
                : actionCode === "05"
                  ? "p4"
                  : actionCode === "08"
                    ? "ne"
                    : actionCode === "09"
                      ? "def"
                      : actionCode === "66"
                        ? "bh"
                        : actionCode === "67"
                          ? "off"
                          : actionCode === "00"
                            ? "rx"
                            : "unknown";
        if (cellState === "on") totalOn += 1;
        else if (cellState === "p1") totalP1 += 1;
        else if (cellState === "p2") totalP2 += 1;
        else if (cellState === "p3") totalP3 += 1;
        else if (cellState === "p4") totalP4 += 1;
        else if (cellState === "off" || cellState === "bh" || cellState === "ne" || cellState === "def" || cellState === "rx") totalOff += 1;
        else totalUnknown += 1;
      }
    } else {
      totalUnmarked += 1;
    }

    cells[column.upstreamCircuitId] = buildCellFromState(column.upstreamCircuitId, policy.name, cellState, resolved);
  }

  const prefixScopeResult = buildPrefixScope(policy, catalogs, sharedPrefixCounts, bindings);
    findings.push(...prefixScopeResult.findings);

  const targetRisk = findings.some((finding) => finding.severity === "error")
    ? "high"
    : findings.some((finding) => finding.severity === "warning")
      ? "medium"
      : "low";

  return {
    cells,
    findings,
    prefixScope: prefixScopeResult.prefixScope,
    affectedPrefixes: prefixScopeResult.affectedPrefixes,
    targetRisk,
    totalOn,
    totalP1,
    totalP2,
    totalP3,
    totalP4,
    totalOff,
    totalUnmarked,
    totalConflict,
    totalUnknown,
    totalExpandedPrefixes: prefixScopeResult.totalExpandedPrefixes,
    totalPrefixScopeUnknown: prefixScopeResult.totalPrefixScopeUnknown,
    totalFindings: findings.length,
    totalCriticalFindings: findings.filter((finding) => finding.severity === "error").length,
  };
}

export function resolveAnnouncementMatrix(
  input: AnnouncementMatrixResolutionInput,
): AnnouncementMatrixResolutionResult {
  const rowsByPolicy = new Map<string, AnnouncementMatrixRoutePolicyInput>();
  for (const policy of input.routePolicies) {
    rowsByPolicy.set(normalizePolicyLookupKey(policy.name), policy);
  }

  const allColumns = new Set<string>();
  const rows: AnnouncementMatrixRow[] = [];

  const prefixSharedCounts = new Map<string, number>();
  for (const policy of input.routePolicies) {
    for (const node of policy.nodes) {
      for (const line of node.matches) {
        for (const ref of extractRoutePolicyIfMatchDependencies(line)) {
          prefixSharedCounts.set(normalizePolicyLookupKey(ref.name), (prefixSharedCounts.get(normalizePolicyLookupKey(ref.name)) ?? 0) + 1);
        }
      }
    }
  }

  // Pre-collect columns from every applied community.
  const cachedCommunityLists = buildCommunityCatalog(input.rawConfig);
  for (const policy of input.routePolicies) {
    const { communities } = collectAppliedCommunities(policy, cachedCommunityLists);
    for (const item of communities) {
      const parsed = parseAnnouncementCommunityValue(item.community);
      if (parsed.circuitId) allColumns.add(parsed.circuitId);
    }
  }

  const columns = [...allColumns]
    .sort((left, right) => left.localeCompare(right, undefined, { numeric: true }))
    .map((circuitId) => ({
      key: circuitId,
      label: labelForCircuitId(circuitId),
      upstreamCircuitId: circuitId,
      upstreamName: labelForCircuitId(circuitId),
      role: null,
      source: "policy_graph_community_resolver" as const,
    }));

  let totalOn = 0;
  let totalP1 = 0;
  let totalP2 = 0;
  let totalP3 = 0;
  let totalP4 = 0;
  let totalOff = 0;
  let totalUnmarked = 0;
  let totalConflict = 0;
  let totalUnknown = 0;
  let totalExpandedPrefixes = 0;
  let totalPrefixScopeUnknown = 0;
  let totalFindings = 0;
  let totalCriticalFindings = 0;

  for (const classification of input.classifications) {
    if (!classification.includeInAnnouncementMatrix) continue;
    const policy = rowsByPolicy.get(normalizePolicyLookupKey(classification.policyName));
    if (!policy) continue;
    const resolution = resolveRowCells(policy, columns, cachedCommunityLists, input.catalogs, prefixSharedCounts, input.bindings);
    totalOn += resolution.totalOn;
    totalP1 += resolution.totalP1;
    totalP2 += resolution.totalP2;
    totalP3 += resolution.totalP3;
    totalP4 += resolution.totalP4;
    totalOff += resolution.totalOff;
    totalUnmarked += resolution.totalUnmarked;
    totalConflict += resolution.totalConflict;
    totalUnknown += resolution.totalUnknown;
    totalExpandedPrefixes += resolution.totalExpandedPrefixes;
    totalPrefixScopeUnknown += resolution.totalPrefixScopeUnknown;
    totalFindings += resolution.totalFindings;
    totalCriticalFindings += resolution.totalCriticalFindings;

    const riskLevel = resolution.targetRisk;
    rows.push({
      targetPolicyName: policy.name,
      routePolicyName: policy.name,
      targetType: classification.policyType,
      family: classification.family,
      prefixScope: resolution.prefixScope,
      affectedPrefixes: resolution.affectedPrefixes,
      source: classification.matrixSource ?? "policy_graph_community_resolver",
      confidence: classification.confidence ?? "medium",
      matrixState: {},
      findings: [...(classification.findings ?? []), ...resolution.findings],
      riskLevel,
      cells: resolution.cells,
      risk: riskLevel,
      node: policy.nodes.find((node) => node.sequence != null)?.sequence ?? policy.nodes[0]?.sequence ?? null,
    });
  }

  const totalTargets = rows.length;
  const totalUpstreams = columns.length;
  const summary: AnnouncementMatrixSummaryPayload = {
    totalTargets,
    totalOriginTargets: rows.filter((row) => row.targetType === "origin_target").length,
    totalCustomerImportTargets: rows.filter((row) => row.targetType === "customer_import_target").length,
    totalExcludedCustomerExports: input.classifications.filter((classification) => classification.policyType === "customer_export").length,
    totalExcludedUpstreamPolicies: input.classifications.filter((classification) => classification.policyType === "upstream_export_audit" || classification.policyType === "upstream_import_audit").length,
    totalExcludedInternalPolicies: input.classifications.filter((classification) => classification.policyType === "internal_mesh").length,
    totalUnknownPolicies: input.classifications.filter((classification) => classification.policyType === "unknown").length,
    totalOn,
    totalP1,
    totalP2,
    totalP3,
    totalP4,
    totalOff,
    totalUnmarked,
    totalConflict,
    totalUnknown,
    totalExpandedPrefixes,
    totalPrefixScopeUnknown,
    totalUpstreams,
    totalCells: rows.reduce((count, row) => count + Object.keys(row.cells).length, 0),
    totalFindings,
    totalCriticalFindings,
    note: "Policy graph snapshot; community cells e prefix expansion habilitados",
    debugFindings: rows.flatMap((row) => (row.findings ?? []).map((finding) => ({
      ...finding,
      targetPolicyName: finding.targetPolicyName ?? row.targetPolicyName,
    }))),
  };

  return { columns, rows, summary };
}
