export interface ParsedNodeCommunities {
  directCommunities: string[];
  communityListName: string | null;
  rawApplies: string[];
}

const RE_APPLY_COMMUNITY = /^apply\s+community(?:\s+community-list\s+(\S+)|\s+(.+?))(?:\s+additive)?\s*$/i;
const RE_APPLY_LARGE = /^apply\s+large-community\s+(.+?)(?:\s+additive)?\s*$/i;
const RE_UNDO_APPLY_COMM = /^undo\s+apply\s+community/i;
const RE_UNDO_APPLY_LARGE = /^undo\s+apply\s+large-community/i;

function splitCommunityBlob(blob: string): string[] {
  let s = blob.trim();
  s = s.replace(/\sadditive\s*$/i, "").trim();
  if (/^community-list\s+/i.test(s)) return [];
  return s.split(/\s+/).map((v) => v.replace(/,/g, "").trim()).filter(Boolean);
}

export function parseNodeApplies(applies: string[]): ParsedNodeCommunities {
  const directCommunities: string[] = [];
  let communityListName: string | null = null;
  const rawApplies = [...applies];

  for (const raw of applies) {
    const line = raw.trim();
    if (RE_UNDO_APPLY_COMM.test(line) || RE_UNDO_APPLY_LARGE.test(line)) continue;

    const large = RE_APPLY_LARGE.exec(line);
    if (large) {
      directCommunities.push(...splitCommunityBlob(large[1]));
      continue;
    }

    const comm = RE_APPLY_COMMUNITY.exec(line);
    if (comm) {
      if (comm[1]) {
        communityListName = comm[1].trim();
      } else if (comm[2]) {
        directCommunities.push(...splitCommunityBlob(comm[2]));
      }
    }
  }

  return {
    directCommunities: [...new Set(directCommunities)],
    communityListName,
    rawApplies,
  };
}

export function buildApplyCommunityLine(communities: string[], communityListName?: string | null): string {
  if (communityListName) {
    return ` apply community community-list ${communityListName}`;
  }
  if (communities.length === 0) return "";
  return ` apply community ${communities.join(" ")} additive`;
}

export function buildUndoApplyCommunityLine(): string {
  return " undo apply community";
}
