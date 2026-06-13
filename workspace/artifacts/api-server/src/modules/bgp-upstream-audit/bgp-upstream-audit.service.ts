import type { ParsedPolicyDependencyConfig } from "../netops/huawei-vrp/parsers/policy-dependency-pipeline.js";
import { normalizePolicyLookupKey } from "../netops/huawei-vrp/parsers/policy-utils.js";
import type { AnnouncementFinding, AnnouncementFamily } from "../bgp-announcements/bgp-announcement.types.js";
import type { BgpPolicyGraph } from "../bgp-announcements/graph/bgp-policy-graph.builder.js";
import { parseCircuitPolicyName } from "../bgp-announcements/parsers/circuit-policy.parser.js";
import { parseCircuitCommunity } from "../bgp-announcements/parsers/community-circuit.parser.js";
import { parseNodeApplies } from "../bgp-announcements/parsers/apply-community.parser.js";
import { isGlobalCommunityNamespace } from "../bgp-announcements/parsers/community-global.parser.js";
import { ACTION_CODE_TO_STATE, CELL_STATE_TO_LABEL } from "../bgp-announcements/bgp-announcement.types.js";
import type { CellState } from "../bgp-announcements/bgp-announcement.types.js";
import {
  collectProtectedGlobalFilterUsage,
  isProtectedGlobalCommunityFilter,
  isSharedProtectedGlobalFilter,
} from "../bgp-announcements/resolvers/protected-global-filter.js";

export interface UpstreamAuditRow {
  circuitId: string;
  displayName: string;
  exportPolicyName: string | null;
  localAs: number | null;
  family: AnnouncementFamily;
  findings: AnnouncementFinding[];
  rules: Array<{
    actionCode: string;
    state: CellState;
    label: string;
    communityFilter: string | null;
    communityValue: string | null;
    asPathRule: string | null;
    status: "ok" | "warning" | "critical";
  }>;
}

export interface UpstreamAuditReport {
  deviceId: number;
  localAs: number | null;
  upstreams: UpstreamAuditRow[];
  findings: AnnouncementFinding[];
  generatedAt: string;
}

export function runUpstreamAudit(
  deviceId: number,
  parsedConfig: ParsedPolicyDependencyConfig,
  graph: BgpPolicyGraph,
  localAs: number | null,
): UpstreamAuditReport {
  const upstreams: UpstreamAuditRow[] = [];
  const globalFindings: AnnouncementFinding[] = [];

  const exportPolicies = Object.values(parsedConfig.consumers.route_policies).filter((p) => {
    const c = parseCircuitPolicyName(p.name);
    return c?.function === "EXPORT";
  });

  const byCircuit = new Map<string, typeof exportPolicies>();
  for (const policy of exportPolicies) {
    const circuit = parseCircuitPolicyName(policy.name);
    if (!circuit) continue;
    const bucket = byCircuit.get(circuit.circuitId) ?? [];
    bucket.push(policy);
    byCircuit.set(circuit.circuitId, bucket);
  }

  for (const [circuitId, policies] of byCircuit) {
    const primary = policies[0];
    const circuit = parseCircuitPolicyName(primary.name)!;
    const family: AnnouncementFamily = circuit.family ?? (primary.name.toUpperCase().includes("IPV6") ? "ipv6" : "ipv4");
    const findings: AnnouncementFinding[] = [];
    const rules: UpstreamAuditRow["rules"] = [];

    for (const policy of policies) {
      for (const node of policy.nodes) {
        const parsed = parseNodeApplies(node.applies);
        for (const match of node.matches) {
          const cf = /if-match\s+community-filter\s+(\S+)/i.exec(match);
          if (!cf) continue;
          const filterName = cf[1];
          const filterKey = normalizePolicyLookupKey(filterName);
          const protectedGlobal = isProtectedGlobalCommunityFilter(filterName);
          const catalog = parsedConfig.catalogs.community_filters[filterKey];
          if (!catalog?.entries?.length) {
            findings.push({
              code: "UPSTREAM_EXPORT_POLICY_UNKNOWN_COMMUNITY",
              severity: "medium",
              message: `Community-filter ${filterName} não resolvido.`,
              context: { policy: policy.name, node: node.sequence },
            });
            continue;
          }

          for (const entry of catalog.entries) {
            const value = String(entry.value ?? entry.expression ?? "").trim();
            const parsedComm = parseCircuitCommunity(value);
            if (parsedComm.valid && parsedComm.circuitId !== circuitId && !protectedGlobal && !isGlobalCommunityNamespace(value)) {
              findings.push({
                code: "UPSTREAM_COMMUNITY_CIRCUIT_MISMATCH",
                severity: "critical",
                message: `Community ${value} pertence ao circuito ${parsedComm.circuitId}, policy é C${circuitId}.`,
                context: { policy: policy.name, filter: filterName },
              });
            }

            if (!parsedComm.valid && !isGlobalCommunityNamespace(value) && value) {
              findings.push({
                code: "UPSTREAM_EXPORT_POLICY_UNKNOWN_COMMUNITY",
                severity: "medium",
                message: `Community ${value} não mapeada para circuito (Unknown, nunca Off).`,
                context: { policy: policy.name, filter: filterName },
              });
            }

            const actionCode = parsedComm.valid ? parsedComm.actionCode : inferActionFromFilterName(filterName);
            const state = actionCode ? (ACTION_CODE_TO_STATE[actionCode] ?? "unknown") : "unknown";
            let asPathRule: string | null = null;
            for (const apply of node.applies) {
              const asMatch = /apply\s+as-path\s+(.+?)(?:\s+additive)?$/i.exec(apply.trim());
              if (asMatch) asPathRule = asMatch[1].trim();
            }

            let status: "ok" | "warning" | "critical" = "ok";
            if (state === "unknown" && !protectedGlobal) status = "warning";
            if (parsedComm.valid && parsedComm.circuitId !== circuitId && !protectedGlobal && !isGlobalCommunityNamespace(value)) {
              status = "critical";
            }
            if (protectedGlobal) status = "ok";

            if (localAs && asPathRule && (state === "p1" || state === "p2" || state === "p3" || state === "p4")) {
              const expectedMap: Record<string, number> = { p1: 1, p2: 2, p3: 3, p4: 4 };
              const expected = expectedMap[state] ?? 0;
              const tokens = asPathRule.split(/\s+/);
              if (tokens.some((t) => Number(t) !== localAs)) {
                findings.push({
                  code: "AS_PATH_PREPEND_LOCAL_AS_MISMATCH",
                  severity: "critical",
                  message: `Local-AS ${localAs} esperado, encontrado ${asPathRule}.`,
                });
                status = "critical";
              } else if (tokens.length !== expected) {
                findings.push({
                  code: "AS_PATH_PREPEND_COUNT_MISMATCH",
                  severity: "high",
                  message: `Prepend count esperado ${expected}, encontrado ${tokens.length}.`,
                });
                status = status === "critical" ? "critical" : "warning";
              }
            }

            const filterActionMismatch = filterName.toUpperCase().includes("P3") && actionCode === "08";
            if (filterActionMismatch) {
              findings.push({
                code: "COMMUNITY_FILTER_ACTION_CODE_MISMATCH",
                severity: "high",
                message: `Filter ${filterName} sugere P3 mas community mapeia action_code 08.`,
              });
              status = "critical";
            }

            rules.push({
              actionCode: actionCode ?? "?",
              state,
              label: CELL_STATE_TO_LABEL[state] ?? "?",
              communityFilter: filterName,
              communityValue: value || null,
              asPathRule,
              status,
            });
          }
        }
      }
    }

    if (rules.length === 0) {
      findings.push({
        code: "UPSTREAM_EXPORT_POLICY_MISSING_ACTION",
        severity: "high",
        message: `Export policy C${circuitId} sem regras community-filter auditáveis.`,
      });
    } else if (!rules.some((rule) => rule.actionCode === "67" || rule.state === "off")) {
      findings.push({
        code: "UPSTREAM_EXPORT_POLICY_NO_OFF_RULE",
        severity: "medium",
        message: `Export policy C${circuitId} sem regra explícita Off (action_code 67).`,
      });
    }

    upstreams.push({
      circuitId,
      displayName: circuit.name ?? `C${circuitId}`,
      exportPolicyName: primary.name,
      localAs,
      family,
      findings,
      rules,
    });
    globalFindings.push(...findings);
  }

  for (const usage of collectProtectedGlobalFilterUsage(parsedConfig)) {
    if (!isSharedProtectedGlobalFilter(usage)) continue;
    globalFindings.push({
      code: "PROTECTED_GLOBAL_FILTER_SHARED_OK",
      severity: "info",
      message: `Community-filter global protegido ${usage.filterName} compartilhado por ${usage.policies.length} nodes — dependência global, não conflito.`,
      context: {
        filterName: usage.filterName,
        policies: usage.policies.map((row) => row.policy),
      },
    });
  }

  void graph;
  return {
    deviceId,
    localAs,
    upstreams,
    findings: globalFindings,
    generatedAt: new Date().toISOString(),
  };
}

function inferActionFromFilterName(filterName: string): string | null {
  const u = filterName.toUpperCase();
  if (u.includes("OFF") || u.includes("BLOCK")) return "67";
  if (u.includes("P4")) return "05";
  if (u.includes("P3")) return "04";
  if (u.includes("P2")) return "03";
  if (u.includes("P1")) return "02";
  if (u.includes("ON")) return "01";
  if (u.includes("NO-EXPORT") || u.includes("NOEXPORT")) return "08";
  if (u.includes("BH") || u.includes("BLACKHOLE")) return "66";
  return null;
}
