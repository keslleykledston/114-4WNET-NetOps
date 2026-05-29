export function normalizePolicyObjectName(name) {
  const raw = String(name ?? "").trim();
  if (!raw) return "";
  const quoted = raw.match(/^['\"](.*)['\"]$/);
  return (quoted?.[1] ?? raw).trim();
}

export function normalizePolicyLookupKey(name) {
  return normalizePolicyObjectName(name).toUpperCase();
}

/** @param {string} line */
export function extractRoutePolicyIfMatchDependencies(line) {
  const trimmed = line.trim();
  if (!/^if-match\b/i.test(trimmed)) return [];

  /** @type {Array<{ type: string, name: string }>} */
  const deps = [];

  const ipv6 = /^if-match\s+ipv6\s+address\s+prefix-list\s+(\S+)/i.exec(trimmed);
  if (ipv6) deps.push({ type: "ipv6-prefix", name: normalizePolicyObjectName(ipv6[1]) });

  const ip4 = /^if-match\s+ip-prefix\s+(\S+)/i.exec(trimmed);
  if (ip4) deps.push({ type: "ip-prefix", name: normalizePolicyObjectName(ip4[1]) });

  const community = /^if-match\s+community-filter\s+(?:(?:basic|advanced)\s+)?(\S+)/i.exec(trimmed);
  if (community) deps.push({ type: "community-filter", name: normalizePolicyObjectName(community[1]) });

  const asPath = /^if-match\s+as-path-filter\s+(\S+)/i.exec(trimmed);
  if (asPath) deps.push({ type: "as-path-filter", name: normalizePolicyObjectName(asPath[1]) });

  const ext = /^if-match\s+extcommunity-filter\s+(?:(?:basic|advanced)\s+)?(\S+)/i.exec(trimmed);
  if (ext) deps.push({ type: "extcommunity-filter", name: normalizePolicyObjectName(ext[1]) });

  const acl = /^if-match\s+acl\s+(\S+)/i.exec(trimmed);
  if (acl) deps.push({ type: "acl", name: normalizePolicyObjectName(acl[1]) });

  return deps;
}
