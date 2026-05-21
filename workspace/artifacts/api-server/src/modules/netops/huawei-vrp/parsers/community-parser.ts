import type { NetopsCommunity } from "../../types.js";

export function parseHuaweiCommunities(output: string): NetopsCommunity[] {
  const communities: NetopsCommunity[] = [];

  for (const line of output.split(/\r?\n/)) {
    const trimmed = line.trim();
    const communityFilter = trimmed.match(/^ip community-filter\s+(?:basic|advanced)?\s*(\S+)(?:\s+index\s+(\d+))?\s+(permit|deny)?\s*(.*)$/i);
    if (communityFilter) {
      communities.push({
        name: communityFilter[1],
        type: "community-filter",
        entries: [{
          index: communityFilter[2] ? Number(communityFilter[2]) : null,
          action: communityFilter[3]?.toLowerCase() ?? null,
          value: communityFilter[4]?.trim() || null,
          line: trimmed,
        }],
        source: "ssh",
      });
      continue;
    }

    const communityList = trimmed.match(/^ip community-list\s+(\S+)(?:\s+index\s+(\d+))?\s+(permit|deny)?\s*(.*)$/i);
    if (communityList) {
      communities.push({
        name: communityList[1],
        type: "community-list",
        entries: [{
          index: communityList[2] ? Number(communityList[2]) : null,
          action: communityList[3]?.toLowerCase() ?? null,
          value: communityList[4]?.trim() || null,
          line: trimmed,
        }],
        source: "ssh",
      });
    }
  }

  return communities;
}
