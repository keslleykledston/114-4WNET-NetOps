import type { CommunityFilter, CommunityList, PrefixList, RoutePolicySummary } from "../discovery.types.js";
import { sourceConfidence } from "../source-priority.js";
import type { NetopsCommunity, NetopsFilter } from "../../types.js";

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

export function normalizeDiscoveryPolicies(filters: NetopsFilter[]): {
  policies: RoutePolicySummary[];
  prefixLists: PrefixList[];
} {
  const policies: RoutePolicySummary[] = [];
  const prefixLists: PrefixList[] = [];

  for (const filter of filters) {
    if (filter.type === "route-policy") {
      policies.push({
        name: filter.name,
        nodes: filter.entries.length ? filter.entries.map((entry) => {
          const row = asRecord(entry);
          return {
            sequence: typeof row.sequence === "number" ? row.sequence : null,
            action: typeof row.action === "string" ? row.action : null,
            matches: Array.isArray(row.matches) ? row.matches.filter((item): item is string => typeof item === "string") : [],
            applies: Array.isArray(row.applies) ? row.applies.filter((item): item is string => typeof item === "string") : [],
            evidence: { source: "ssh_running_config" as const, confidence: sourceConfidence("ssh_running_config"), evidence: `route-policy ${filter.name}` },
          };
        }) : [{
          sequence: null,
          action: null,
          matches: [],
          applies: [],
          evidence: { source: "ssh_running_config" as const, confidence: sourceConfidence("ssh_running_config"), evidence: `route-policy ${filter.name}` },
        }],
        source: filter.source === "ssh" ? "ssh_running_config" : "local_db",
        confidence: filter.source === "ssh" ? "high" : "low",
        evidence: `route-policy ${filter.name}`,
      });
    }

    if (filter.type === "ip-prefix" || filter.type === "prefix-list") {
      prefixLists.push({
        name: filter.name,
        entries: filter.entries,
        source: filter.source === "ssh" ? "ssh_running_config" : "local_db",
        confidence: filter.source === "ssh" ? "high" : "low",
        evidence: `${filter.type} ${filter.name}`,
      });
    }
  }

  return { policies, prefixLists };
}

export function normalizeDiscoveryCommunities(communities: NetopsCommunity[]): {
  communityFilters: CommunityFilter[];
  communityLists: CommunityList[];
} {
  const communityFilters: CommunityFilter[] = [];
  const communityLists: CommunityList[] = [];

  for (const community of communities) {
    const item = {
      name: community.name,
      entries: community.entries,
      source: community.source === "ssh" ? "ssh_running_config" as const : "local_db" as const,
      confidence: community.source === "ssh" ? "high" as const : "low" as const,
      evidence: `${community.type} ${community.name}`,
    };
    if (community.type === "community-list") communityLists.push(item);
    else communityFilters.push(item);
  }

  return { communityFilters, communityLists };
}
