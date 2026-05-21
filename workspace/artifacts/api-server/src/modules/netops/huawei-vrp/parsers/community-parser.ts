import type { NetopsCommunity } from "../../types.js";

export function parseHuaweiCommunities(output: string): NetopsCommunity[] {
  const communities: NetopsCommunity[] = [];

  for (const line of output.split(/\r?\n/)) {
    const communityFilter = line.match(/^\s*ip community-filter\s+(?:basic|advanced)?\s*(\S+)/i);
    if (communityFilter) {
      communities.push({
        name: communityFilter[1],
        type: "community-filter",
        entries: [line.trim()],
        source: "ssh",
      });
    }
  }

  return communities;
}
