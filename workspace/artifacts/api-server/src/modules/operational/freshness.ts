export type FreshnessStatus = "fresh" | "stale" | "expired" | "unknown";

function freshWindowMs(): number {
  const minutes = Number(process.env["SNMP_FAST_INTERFACE_FRESH_MINUTES"] ?? 5);
  return (Number.isFinite(minutes) && minutes > 0 ? minutes : 5) * 60 * 1000;
}

function staleWindowMs(): number {
  const hours = Number(process.env["SNMP_FAST_INTERFACE_STALE_HOURS"] ?? 1);
  return (Number.isFinite(hours) && hours > 0 ? hours : 1) * 60 * 60 * 1000;
}

export function computeFreshnessStatus(collectedAt: Date | null | undefined, now = new Date()): FreshnessStatus {
  if (!collectedAt) return "unknown";
  const ageMs = now.getTime() - collectedAt.getTime();
  if (ageMs < 0) return "fresh";
  if (ageMs < freshWindowMs()) return "fresh";
  if (ageMs < staleWindowMs()) return "stale";
  return "expired";
}

export function freshnessExpiresAt(collectedAt: Date): Date {
  return new Date(collectedAt.getTime() + freshWindowMs());
}
