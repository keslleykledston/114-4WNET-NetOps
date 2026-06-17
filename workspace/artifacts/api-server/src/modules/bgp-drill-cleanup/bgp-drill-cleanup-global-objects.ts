/** Global / library objects preserved by operational design — never SHARED, never in removal script. */
export function isGlobalCleanupObject(name: string): boolean {
  const trimmed = (name || "").trim();
  if (!trimmed) return false;

  const upper = trimmed.toUpperCase();

  if (upper === "DEFAULT") return true;
  if (upper === "FULL-ROUTE-ALL") return true;
  if (/^GLOBAL-/i.test(trimmed)) return true;
  if (/^IXBR-/i.test(trimmed)) return true;
  if (/^C\d{2}-.*RECEIVED/i.test(trimmed)) return true;
  if (/^C\d{2}[-_].*RECEIVED/i.test(trimmed)) return true;

  return false;
}

export const GLOBAL_CLEANUP_OBJECT_REASON =
  "Dependência global preservada por desenho operacional.";
