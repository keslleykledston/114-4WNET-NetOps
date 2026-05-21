import type { Device } from "@workspace/db";
import {
  parseRunningConfigCommunities,
  usageCountsForLibraryNames,
  type CommunityFilterEntry,
  type CommunityListEntry,
} from "../../huawei-vrp/parsers/community-parser.js";

export interface DiscoveryCommunityFilter {
  filterName: string;
  communityValue: string;
  matchType: "basic" | "advanced";
  action: "permit" | "deny";
  indexOrder: number;
  origin: "discovered_running_config";
  usageCount: number;
}

export interface DiscoveryCommunityListMember {
  communityValue: string;
  valueDescription?: string | null;
}

export interface DiscoveryCommunityList {
  listName: string;
  members: DiscoveryCommunityListMember[];
  origin: "discovered_running_config";
}

export interface DiscoveryCommunitySnapshot {
  filters: DiscoveryCommunityFilter[];
  lists: DiscoveryCommunityList[];
  totalFilterCount: number;
  totalListCount: number;
  totalMemberCount: number;
}

export function queryDiscoveryCommunities(
  _device: Device,
  runningConfig: string
): DiscoveryCommunitySnapshot {
  const parsed = parseRunningConfigCommunities(runningConfig);
  const usageCounts = usageCountsForLibraryNames(parsed);

  // Convert filters
  const filters: DiscoveryCommunityFilter[] = parsed.communityFilters.map(
    (f: CommunityFilterEntry) => ({
      filterName: f.name,
      communityValue: f.value,
      matchType: f.matchType,
      action: f.action,
      indexOrder: f.index,
      origin: "discovered_running_config" as const,
      usageCount: usageCounts[f.name] || 0,
    })
  );

  // Group community-list members by name
  const listsByName: Record<string, DiscoveryCommunityListMember[]> = {};
  for (const entry of parsed.communityLists) {
    if (!listsByName[entry.listName]) {
      listsByName[entry.listName] = [];
    }
    listsByName[entry.listName].push({
      communityValue: entry.value,
      valueDescription: entry.valueDescription,
    });
  }

  // Convert lists
  const lists: DiscoveryCommunityList[] = Object.entries(listsByName).map(([listName, members]) => ({
    listName,
    members,
    origin: "discovered_running_config" as const,
  }));

  const totalMemberCount = lists.reduce((acc, list) => acc + list.members.length, 0);

  return {
    filters,
    lists,
    totalFilterCount: filters.length,
    totalListCount: lists.length,
    totalMemberCount,
  };
}
