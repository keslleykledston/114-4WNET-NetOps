import type { ParsedPolicyDependencyConfig, PolicyCatalogEntry } from "../../netops/huawei-vrp/parsers/policy-dependency-pipeline.js";
import { normalizePolicyLookupKey } from "../../netops/huawei-vrp/parsers/policy-utils.js";
import type { AnnouncementFamily } from "../bgp-announcement.types.js";

export function expandPrefixList(
  listName: string,
  family: AnnouncementFamily,
  catalogs: ParsedPolicyDependencyConfig["catalogs"],
): string[] {
  const key = normalizePolicyLookupKey(listName);
  const catalog: Record<string, PolicyCatalogEntry> =
    family === "ipv6" ? catalogs.ipv6_prefixes : catalogs.ip_prefixes;

  const entry = catalog[key];
  if (!entry?.entries?.length) return [];

  const prefixes: string[] = [];
  for (const row of entry.entries) {
    const expression = String(row.expression ?? row.line ?? "").trim();
    if (!expression) continue;
    // ip-prefix NAME index N permit A.B.C.D LEN
    const v4 = /permit\s+(\d{1,3}(?:\.\d{1,3}){3})\s+(\d{1,2})/i.exec(expression)
      ?? /(\d{1,3}(?:\.\d{1,3}){3})\s+(\d{1,2})/.exec(expression);
    if (v4) {
      prefixes.push(`${v4[1]}/${v4[2]}`);
      continue;
    }
    // ipv6-prefix NAME index N permit PREFIX LEN
    const v6 = /permit\s+([0-9a-fA-F:/]+)\s+(\d{1,3})/i.exec(expression);
    if (v6) {
      prefixes.push(`${v6[1]}/${v6[2]}`);
      continue;
    }
    const cidr = /([0-9a-fA-F:/]+)(?:\/(\d{1,3}))?/.exec(expression);
    if (cidr) prefixes.push(cidr[2] ? `${cidr[1]}/${cidr[2]}` : `${cidr[1]}/128`);
  }

  return [...new Set(prefixes)].sort();
}

export function findPrefixListForNode(
  matches: string[],
  family: AnnouncementFamily,
): { listName: string | null; matchType: string | null } {
  for (const match of matches) {
    if (family === "ipv4") {
      const m = /if-match\s+ip-prefix\s+(\S+)/i.exec(match);
      if (m) return { listName: m[1], matchType: "ip-prefix" };
    }
    const m6 = /if-match\s+ipv6\s+address\s+prefix-list\s+(\S+)/i.exec(match);
    if (m6) return { listName: m6[1], matchType: "ipv6-prefix-list" };
  }
  return { listName: null, matchType: null };
}

export function countPoliciesUsingPrefixList(
  parsedConfig: ParsedPolicyDependencyConfig,
  listName: string,
): number {
  const key = normalizePolicyLookupKey(listName);
  let count = 0;
  for (const dep of parsedConfig.dependency_graph.route_policy_dependencies) {
    if (
      (dep.dependencyType === "ip-prefix" || dep.dependencyType === "ipv6-prefix")
      && normalizePolicyLookupKey(dep.dependencyName) === key
    ) {
      count += 1;
    }
  }
  return count;
}
