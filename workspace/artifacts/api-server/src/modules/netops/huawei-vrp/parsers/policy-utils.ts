export function normalizePolicyObjectName(name: string | null | undefined): string {
  const raw = String(name ?? "").trim();
  if (!raw) return "";
  const quoted = raw.match(/^['\"](.*)['\"]$/);
  return (quoted?.[1] ?? raw).trim();
}

export function normalizePolicyLookupKey(name: string | null | undefined): string {
  return normalizePolicyObjectName(name).toUpperCase();
}

