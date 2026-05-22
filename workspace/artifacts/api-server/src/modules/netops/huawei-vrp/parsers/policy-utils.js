export function normalizePolicyObjectName(name) {
  const raw = String(name ?? "").trim();
  if (!raw) return "";
  const quoted = raw.match(/^['\"](.*)['\"]$/);
  return (quoted?.[1] ?? raw).trim();
}

export function normalizePolicyLookupKey(name) {
  return normalizePolicyObjectName(name).toUpperCase();
}

