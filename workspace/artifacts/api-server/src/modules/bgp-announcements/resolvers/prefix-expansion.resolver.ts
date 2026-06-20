export function expandPrefixList(
  listName: string,
  _family: "ipv4" | "ipv6",
  catalogs?: Record<string, Record<string, unknown>>,
): string[] {
  const catalog = catalogs?.[listName];
  if (!catalog) return [];
  const entries = Array.isArray(catalog.entries) ? catalog.entries as Array<Record<string, unknown>> : [];
  return entries
    .map((entry) => String(entry.prefix ?? entry.value ?? entry.network ?? "").trim())
    .filter(Boolean);
}

