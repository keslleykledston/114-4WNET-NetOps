import { createHash } from "node:crypto";
import { normalizeCommunityValues } from "../parsers/community-circuit.parser.js";

export function hashCommunitySet(communities: string[]): string {
  const normalized = normalizeCommunityValues(communities);
  return createHash("sha256").update(normalized.join("|"), "utf8").digest("hex");
}

export interface CommunitySetRecord {
  name: string;
  communities: string[];
  normalizedHash: string;
  isShared: boolean;
}

export function findExactCommunitySetMatch(
  desiredCommunities: string[],
  catalog: CommunitySetRecord[],
): CommunitySetRecord | null {
  const hash = hashCommunitySet(desiredCommunities);
  return catalog.find((row) => row.normalizedHash === hash) ?? null;
}

export function resolveNodeCommunities(
  directCommunities: string[],
  communityListName: string | null,
  communityLists: Map<string, string[]>,
): { communities: string[]; viaList: string | null } {
  if (communityListName) {
    const members = communityLists.get(communityListName) ?? [];
    return { communities: normalizeCommunityValues(members), viaList: communityListName };
  }
  return { communities: normalizeCommunityValues(directCommunities), viaList: null };
}

export function applyCircuitStateChange(
  currentCommunities: string[],
  circuitId: string,
  newActionCode: string | null,
  baseAsn = 64777,
): { communities: string[]; removed: string[]; added: string[] } {
  const cid = circuitId.padStart(2, "0").slice(-2);
  const managed: string[] = [];
  const preserved: string[] = [];

  for (const comm of currentCommunities) {
    const match = /^(\d+):5(\d{2})(\d{2})$/.exec(comm);
    if (match && match[2] === cid) {
      managed.push(comm);
    } else {
      preserved.push(comm);
    }
  }

  const removed = [...managed];
  const added: string[] = [];
  const next = [...preserved];

  if (newActionCode) {
    const newComm = `${baseAsn}:5${cid}${newActionCode.padStart(2, "0").slice(-2)}`;
    added.push(newComm);
    next.push(newComm);
  }

  return { communities: normalizeCommunityValues(next), removed, added };
}
