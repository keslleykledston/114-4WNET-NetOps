import type { NetopsFilter } from "../../types.js";

export function parseHuaweiPolicies(output: string): NetopsFilter[] {
  const filters: NetopsFilter[] = [];
  let currentPolicy: { name: string; nodes: Array<{ sequence: number | null; action: string | null; matches: string[]; applies: string[]; ipPrefixes: string[]; communities: string[] }> } | null = null;
  let currentNode: { sequence: number | null; action: string | null; matches: string[]; applies: string[]; ipPrefixes: string[]; communities: string[] } | null = null;

  for (const line of output.split(/\r?\n/)) {
    const trimmed = line.trim();
    const routePolicy = trimmed.match(/^route-policy\s+(\S+)(?:\s+permit\s+node\s+(\d+)|\s+deny\s+node\s+(\d+))?/i);
    if (routePolicy) {
      currentPolicy = { name: routePolicy[1], nodes: [] };
      filters.push({ name: routePolicy[1], type: "route-policy", entries: currentPolicy.nodes, source: "ssh" });
      currentNode = null;
      const action = / deny /i.test(trimmed) ? "deny" : / permit /i.test(trimmed) ? "permit" : null;
      const seq = Number(routePolicy[2] ?? routePolicy[3]);
      if (Number.isFinite(seq)) {
        currentNode = { sequence: seq, action, matches: [], applies: [], ipPrefixes: [], communities: [] };
        currentPolicy.nodes.push(currentNode);
      }
      continue;
    }

    const node = trimmed.match(/^node\s+(\d+)\s+(permit|deny)/i);
    if (node && currentPolicy) {
      currentNode = { sequence: Number(node[1]), action: node[2].toLowerCase(), matches: [], applies: [], ipPrefixes: [], communities: [] };
      currentPolicy.nodes.push(currentNode);
      continue;
    }

    if (currentNode && /^if-match\b/i.test(trimmed)) {
      currentNode.matches.push(trimmed);
      const ipPrefixRef = trimmed.match(/\b(?:ip-prefix|prefix-list)\s+(\S+)/i);
      if (ipPrefixRef) currentNode.ipPrefixes.push(ipPrefixRef[1]);
      const communityRef = trimmed.match(/\bcommunity-(?:filter|list)\s+(\S+)/i);
      if (communityRef) currentNode.communities.push(communityRef[1]);
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
  }

  return filters;
}
