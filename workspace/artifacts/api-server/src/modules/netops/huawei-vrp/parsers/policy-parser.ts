import type { NetopsFilter } from "../../types.js";
import { splitHuaweiConfigBlocks } from "./config-blocks.js";
import { extractRoutePolicyIfMatchDependencies, normalizePolicyObjectName } from "./policy-utils.js";

export interface RoutePolicyMatchDetail {
  type: "community-filter" | "community-list" | "ip-prefix" | "ipv6-prefix" | "as-path-filter" | "extcommunity-filter" | "acl" | "unknown";
  name: string;
  raw: string;
  qualifier?: "basic" | "advanced" | "whole-match" | null;
}

export function parseHuaweiPolicies(output: string): NetopsFilter[] {
  const filters: NetopsFilter[] = [];
  const blocks = splitHuaweiConfigBlocks(output);

  for (const block of blocks.length > 0 ? blocks : [{ type: "unknown" as const, header: "", lines: output.split(/\r?\n/), raw: output, startLine: 1, endLine: output.split(/\r?\n/).length }]) {
    let currentPolicy: { name: string; nodes: Array<{ sequence: number | null; action: string | null; matches: string[]; matchDetails: RoutePolicyMatchDetail[]; applies: string[]; ipPrefixes: string[]; communities: string[] }> } | null = null;
    let currentNode: { sequence: number | null; action: string | null; matches: string[]; matchDetails: RoutePolicyMatchDetail[]; applies: string[]; ipPrefixes: string[]; communities: string[] } | null = null;

    for (const line of block.lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      const routePolicy = trimmed.match(/^route-policy\s+(\S+)(?:\s+permit\s+node\s+(\d+)|\s+deny\s+node\s+(\d+))?/i);
      if (routePolicy) {
        currentPolicy = { name: routePolicy[1], nodes: [] };
        filters.push({ name: routePolicy[1], type: "route-policy", entries: currentPolicy.nodes, source: "ssh" });
        currentNode = null;
        const action = / deny /i.test(trimmed) ? "deny" : / permit /i.test(trimmed) ? "permit" : null;
        const seq = Number(routePolicy[2] ?? routePolicy[3]);
        if (Number.isFinite(seq)) {
          currentNode = { sequence: seq, action, matches: [], matchDetails: [], applies: [], ipPrefixes: [], communities: [] };
          currentPolicy.nodes.push(currentNode);
        }
        continue;
      }

      const node = trimmed.match(/^node\s+(\d+)\s+(permit|deny)/i);
      if (node && currentPolicy) {
        currentNode = { sequence: Number(node[1]), action: node[2].toLowerCase(), matches: [], matchDetails: [], applies: [], ipPrefixes: [], communities: [] };
        currentPolicy.nodes.push(currentNode);
        continue;
      }

      if (currentNode && /^if-match\b/i.test(trimmed)) {
        currentNode.matches.push(trimmed);
        const structuredRefs = extractRoutePolicyIfMatchDependencies(trimmed);
        if (structuredRefs.length > 0) {
          for (const ref of structuredRefs) {
            if (ref.type === "ip-prefix" || ref.type === "ipv6-prefix") {
              currentNode.ipPrefixes.push(ref.name);
            }
            if (ref.type === "community-filter") {
              currentNode.communities.push(ref.name);
            }
            currentNode.matchDetails.push({ type: ref.type, name: ref.name, raw: trimmed });
          }
          continue;
        }

        const communityFilterRef = trimmed.match(/^if-match\s+community-filter\s+(?:(basic|advanced)\s+)?(\S+)(?:\s+(whole-match))?\s*$/i);
        if (communityFilterRef) {
          const qualifier = (communityFilterRef[1] ?? communityFilterRef[3] ?? null)?.toLowerCase() as RoutePolicyMatchDetail["qualifier"];
          const name = normalizePolicyObjectName(communityFilterRef[2]);
          currentNode.communities.push(name);
          currentNode.matchDetails.push({ type: "community-filter", name, qualifier, raw: trimmed });
          continue;
        }

        const communityListRef = trimmed.match(/^if-match\s+community-list\s+(\S+)\s*$/i);
        if (communityListRef) {
          const name = normalizePolicyObjectName(communityListRef[1]);
          currentNode.communities.push(name);
          currentNode.matchDetails.push({ type: "community-list", name, raw: trimmed });
          continue;
        }

        const communityRef = trimmed.match(/\bcommunity-(?:filter|list)\s+(\S+)/i);
        if (communityRef) currentNode.communities.push(normalizePolicyObjectName(communityRef[1]));

        const asPathFilterRef = trimmed.match(/^if-match\s+as-path-filter\s+(\S+)/i);
        if (asPathFilterRef) {
          currentNode.matchDetails.push({ type: "as-path-filter", name: normalizePolicyObjectName(asPathFilterRef[1]), raw: trimmed });
          continue;
        }

        const extcommunityFilterRef = trimmed.match(/^if-match\s+extcommunity-filter\s+(?:(basic|advanced)\s+)?(\S+)/i);
        if (extcommunityFilterRef) {
          const qualifier = (extcommunityFilterRef[1] ?? null)?.toLowerCase() as RoutePolicyMatchDetail["qualifier"];
          currentNode.matchDetails.push({ type: "extcommunity-filter", name: normalizePolicyObjectName(extcommunityFilterRef[2]), qualifier, raw: trimmed });
          continue;
        }

        const aclRef = trimmed.match(/^if-match\s+acl\s+(\S+)/i);
        if (aclRef) {
          currentNode.matchDetails.push({ type: "acl", name: normalizePolicyObjectName(aclRef[1]), raw: trimmed });
          continue;
        }
        continue;
      }

      if (currentNode && /^apply\b/i.test(trimmed)) {
        currentNode.applies.push(trimmed);
        continue;
      }

      const ipPrefix = trimmed.match(/^ip ip-prefix\s+(\S+)(?:\s+index\s+(\d+))?\s*(.*)$/i);
      if (ipPrefix) {
        filters.push({
          name: ipPrefix[1],
          type: "ip-prefix",
          entries: [{ index: ipPrefix[2] ? Number(ipPrefix[2]) : null, line: trimmed, expression: ipPrefix[3] ?? "" }],
          source: "ssh",
        });
      }

      const ipv6Prefix = trimmed.match(/^ip ipv6-prefix\s+(\S+)(?:\s+index\s+(\d+))?\s*(.*)$/i);
      if (ipv6Prefix) {
        filters.push({
          name: ipv6Prefix[1],
          type: "ipv6-prefix",
          entries: [{ index: ipv6Prefix[2] ? Number(ipv6Prefix[2]) : null, line: trimmed, expression: ipv6Prefix[3] ?? "" }],
          source: "ssh",
        });
      }

      const asPath = trimmed.match(/^ip as-path-filter\s+(\S+)(?:\s+index\s+(\d+))?\s+(permit|deny)\s+(.+)$/i);
      if (asPath) {
        filters.push({
          name: asPath[1],
          type: "as-path-filter",
          entries: [{ index: asPath[2] ? Number(asPath[2]) : null, action: asPath[3].toLowerCase(), expression: asPath[4] ?? "", line: trimmed }],
          source: "ssh",
        });
      }

      const extcommunity = trimmed.match(/^ip extcommunity-filter\s+(basic|advanced)\s+(\S+)(?:\s+index\s+(\d+))?\s+(permit|deny)\s+(.+)$/i);
      if (extcommunity) {
        filters.push({
          name: extcommunity[2],
          type: "extcommunity-filter",
          entries: [{ type: extcommunity[1].toLowerCase(), index: extcommunity[3] ? Number(extcommunity[3]) : null, action: extcommunity[4].toLowerCase(), expression: extcommunity[5] ?? "", line: trimmed }],
          source: "ssh",
        });
      }

      const acl = trimmed.match(/^(?:acl\s+(?:name\s+)?(\S+)|acl\s+number\s+(\S+))$/i);
      if (acl) {
        filters.push({
          name: acl[1] ?? acl[2],
          type: "acl",
          entries: [{ line: trimmed }],
          source: "ssh",
        });
      }
    }
  }

  return filters;
}
