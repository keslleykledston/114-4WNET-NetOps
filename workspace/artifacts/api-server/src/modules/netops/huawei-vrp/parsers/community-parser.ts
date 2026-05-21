// Extract community-filter and community-list definitions from Huawei VRP running-config

import type { NetopsCommunity } from "../../types.js";

export interface CommunityFilterEntry {
  matchType: "basic" | "advanced";
  name: string;
  index: number;
  action: "permit" | "deny";
  value: string;
}

export interface CommunityListEntry {
  listName: string;
  value: string;
  lineOrder: number;
  valueDescription?: string | null;
}

export interface RoutePolicyCommunityFilterRef {
  routePolicy: string;
  node: string;
  filterName: string;
}

export interface RoutePolicyApplyCommunity {
  routePolicy: string;
  node: string;
  communities: string[];
}

export interface ParsedRunningConfigCommunities {
  communityFilters: CommunityFilterEntry[];
  communityLists: CommunityListEntry[];
  routePolicyIfMatch: RoutePolicyCommunityFilterRef[];
  routePolicyApplyCommunity: RoutePolicyApplyCommunity[];
}

const RE_FILTER = /^\s*ip\s+community-filter\s+(basic|advanced)\s+(\S+)\s+index\s+(\d+)\s+(permit|deny)\s+(.+?)\s*$/i;
const RE_LIST_HEADER = /^\s*ip\s+community-list\s+(\S+)\s*$/i;
const RE_LIST_LINE = /^\s*community\s+(\S+)(?:\s+(.*))?$/i;
const RE_RP_HEADER = /^\s*route-policy\s+(\S+)\s+(permit|deny)\s+node\s+(\d+)\s*$/i;
const RE_IF_MATCH_CF = /^\s*if-match\s+community-filter\s+(\S+)\s*$/i;
const RE_APPLY_COMM = /^\s*apply\s+community\s+(.+?)\s*$/i;

const LIST_HEADER_EMPTY_VALUE = "[lista-sem-members-no-backup]";

function normLines(text: string): string[] {
  const t = (text || "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  return t.split("\n");
}

function stripInlineComment(line: string): string {
  const s = line.trim();
  if (s.includes("#")) {
    return s.split("#", 1)[0].trim();
  }
  return s;
}

function dedupeFilters(items: CommunityFilterEntry[]): CommunityFilterEntry[] {
  const seen = new Set<string>();
  const out: CommunityFilterEntry[] = [];
  for (const it of items) {
    const key = [
      it.matchType,
      it.name.toLowerCase(),
      it.value.trim(),
      it.index,
      it.action.toLowerCase(),
    ].join("|");
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(it);
  }
  return out;
}

function dedupeLists(items: CommunityListEntry[]): CommunityListEntry[] {
  const seen = new Set<string>();
  const out: CommunityListEntry[] = [];
  for (const it of items) {
    const key = [it.listName.toLowerCase(), it.value.trim().toLowerCase()].join("|");
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(it);
  }
  return out;
}

function splitApplyValues(blob: string): string[] {
  let s = stripInlineComment(blob).trim();
  if (/\sadditive\s*$/i.test(s)) {
    s = s.replace(/\sadditive\s*$/i, "").trim();
  }
  const parts = s.split(/\s+/);
  const vals: string[] = [];
  for (const p of parts) {
    const cleaned = p.trim().replace(/,/g, "").trim();
    if (!cleaned || cleaned.toLowerCase() === "additive") continue;
    vals.push(cleaned);
  }
  return vals;
}

export function parseRunningConfigCommunities(configText: string): ParsedRunningConfigCommunities {
  const lines = normLines(configText);
  const out: ParsedRunningConfigCommunities = {
    communityFilters: [],
    communityLists: [],
    routePolicyIfMatch: [],
    routePolicyApplyCommunity: [],
  };

  let currentList: string | null = null;
  let listOrder = 0;
  const listHeaderOrder: string[] = [];

  let rpName: string | null = null;
  let rpNode: string | null = null;

  for (const raw of lines) {
    const isIndented = raw && (raw[0] === " " || raw[0] === "\t");
    const line = stripInlineComment(raw);
    if (!line) continue;

    // Match community-filter
    const mF = RE_FILTER.exec(line);
    if (mF) {
      const [, mt, name, idxS, act, val] = mF;
      const idx = parseInt(idxS, 10);
      if (!name || !val) continue;
      const mtL = (mt || "").toLowerCase();
      const matchType: "basic" | "advanced" = mtL === "advanced" ? "advanced" : "basic";
      out.communityFilters.push({
        matchType,
        name: name.trim(),
        index: idx,
        action: act.toLowerCase() as "permit" | "deny",
        value: (val || "").trim(),
      });
      currentList = null;
      continue;
    }

    // Match community-list header
    const mLh = RE_LIST_HEADER.exec(line);
    if (mLh) {
      currentList = mLh[1].trim();
      listOrder = 0;
      if (currentList) {
        listHeaderOrder.push(currentList);
      }
      continue;
    }

    // Match community list members
    if (currentList) {
      const mLl = RE_LIST_LINE.exec(line);
      if (mLl) {
        const val = (mLl[1] || "").trim();
        const extra = (mLl[2] || "").trim();
        const desc = extra || null;
        if (val) {
          listOrder += 1;
          out.communityLists.push({
            listName: currentList,
            value: val,
            lineOrder: listOrder,
            valueDescription: desc,
          });
        }
        continue;
      }
      // Exit list on non-indented line
      if (!isIndented) {
        currentList = null;
      }
    }

    // Match route-policy header
    const mRp = RE_RP_HEADER.exec(line);
    if (mRp) {
      rpName = mRp[1];
      rpNode = mRp[3];
      currentList = null;
      continue;
    }

    // Match if-match and apply within route-policy
    if (rpName && rpNode) {
      const mIf = RE_IF_MATCH_CF.exec(line);
      if (mIf) {
        const fn = (mIf[1] || "").trim();
        if (fn) {
          out.routePolicyIfMatch.push({
            routePolicy: rpName,
            node: rpNode,
            filterName: fn,
          });
        }
        continue;
      }

      const mAp = RE_APPLY_COMM.exec(line);
      if (mAp) {
        const vals = splitApplyValues(mAp[1]);
        if (vals.length > 0) {
          out.routePolicyApplyCommunity.push({
            routePolicy: rpName,
            node: rpNode,
            communities: vals,
          });
        }
        continue;
      }
    }

    // Exit route-policy context on non-indented line
    if (rpName && !isIndented && !line.startsWith("#")) {
      rpName = null;
      rpNode = null;
    }
  }

  out.communityFilters = dedupeFilters(out.communityFilters);
  out.communityLists = dedupeLists(out.communityLists);

  // Handle headers without members
  const namesWithMembers = new Set(out.communityLists.map((e) => e.listName));
  const seenPlaceholder = new Set<string>();
  for (const h of listHeaderOrder) {
    if (!h || namesWithMembers.has(h)) continue;
    if (seenPlaceholder.has(h)) continue;
    seenPlaceholder.add(h);
    out.communityLists.push({
      listName: h,
      value: LIST_HEADER_EMPTY_VALUE,
      lineOrder: 0,
    });
  }
  out.communityLists = dedupeLists(out.communityLists);

  return out;
}

export function communityListNamesInConfig(configText: string): Set<string> {
  const names = new Set<string>();
  const parsed = parseRunningConfigCommunities(configText);
  for (const e of parsed.communityLists) {
    names.add(e.listName);
  }
  // Re-scan headers in case list is empty
  for (const line of normLines(configText)) {
    const cleaned = stripInlineComment(line);
    const m = RE_LIST_HEADER.exec(cleaned);
    if (m) {
      names.add(m[1].trim());
    }
  }
  return names;
}

export function usageCountsForLibraryNames(
  parsed: ParsedRunningConfigCommunities
): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const ref of parsed.routePolicyIfMatch) {
    const k = ref.filterName;
    counts[k] = (counts[k] || 0) + 1;
  }
  return counts;
}

export function formatPhase1CommunityListBlock(vrpObjectName: string, communityValues: string[]): string {
  const lines = [`ip community-list ${vrpObjectName}`];
  for (const v of communityValues) {
    const vv = (v || "").trim();
    if (vv && vv !== LIST_HEADER_EMPTY_VALUE) {
      lines.push(` community ${vv}`);
    }
  }
  return lines.join("\n");
}

// Backwards-compatibility wrapper for legacy code
export function parseHuaweiCommunities(output: string): NetopsCommunity[] {
  const parsed = parseRunningConfigCommunities(output);
  const communities: NetopsCommunity[] = [];

  // Convert filters to NetopsCommunity format
  for (const filter of parsed.communityFilters) {
    communities.push({
      name: filter.name,
      type: "community-filter",
      entries: [
        {
          index: filter.index,
          action: filter.action,
          value: filter.value,
          line: `ip community-filter ${filter.matchType} ${filter.name} index ${filter.index} ${filter.action} ${filter.value}`,
        },
      ],
      source: "ssh",
    });
  }

  // Convert lists to NetopsCommunity format
  const listsByName: Record<string, typeof parsed.communityLists> = {};
  for (const item of parsed.communityLists) {
    if (!listsByName[item.listName]) {
      listsByName[item.listName] = [];
    }
    listsByName[item.listName].push(item);
  }

  for (const [listName, items] of Object.entries(listsByName)) {
    communities.push({
      name: listName,
      type: "community-list",
      entries: items.map((item) => ({
        index: item.lineOrder,
        action: null,
        value: item.value,
        line: item.value === LIST_HEADER_EMPTY_VALUE ? `ip community-list ${listName}` : ` community ${item.value}`,
      })),
      source: "ssh",
    });
  }

  return communities;
}
