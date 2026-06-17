import type { ParsedPolicyDependencyConfig } from "../../netops/huawei-vrp/parsers/policy-dependency-pipeline.js";
import { parseCircuitPolicyName } from "../parsers/circuit-policy.parser.js";

const PROTECTED_GLOBAL_FILTER_PATTERNS: RegExp[] = [
  /^GLOBAL-EXPORT-UPSTREAM-/i,
  /^GLOBAL-EXPORT-ALL-/i,
  /^GLOBAL-EXPORT-CDNS-/i,
  /^GLOBAL-EXPORT-PTT-PUBLIC-/i,
  /^IXBR-EXPORT-/i,
  /^FULL-ROUTE-ALL$/i,
];

export function isProtectedGlobalCommunityFilter(name: string): boolean {
  const trimmed = (name || "").trim();
  return PROTECTED_GLOBAL_FILTER_PATTERNS.some((pattern) => pattern.test(trimmed));
}

export interface ProtectedGlobalFilterUsage {
  filterName: string;
  policies: Array<{ policy: string; node: number; circuitId: string | null }>;
}

export function collectProtectedGlobalFilterUsage(
  parsedConfig: ParsedPolicyDependencyConfig,
): ProtectedGlobalFilterUsage[] {
  const byFilter = new Map<string, ProtectedGlobalFilterUsage>();

  for (const policy of Object.values(parsedConfig.consumers.route_policies)) {
    const circuit = parseCircuitPolicyName(policy.name);
    if (!circuit || circuit.function !== "EXPORT") continue;

    for (const node of policy.nodes) {
      for (const match of node.matches) {
        const cf = /if-match\s+community-filter\s+(\S+)/i.exec(match);
        if (!cf || !isProtectedGlobalCommunityFilter(cf[1])) continue;

        const filterName = cf[1];
        const bucket = byFilter.get(filterName) ?? { filterName, policies: [] };
        bucket.policies.push({
          policy: policy.name,
          node: node.sequence ?? 0,
          circuitId: circuit.circuitId,
        });
        byFilter.set(filterName, bucket);
      }
    }
  }

  return [...byFilter.values()].sort((left, right) => left.filterName.localeCompare(right.filterName));
}

export function isSharedProtectedGlobalFilter(usage: ProtectedGlobalFilterUsage): boolean {
  const uniquePolicies = new Set(usage.policies.map((row) => row.policy));
  return uniquePolicies.size > 1;
}
