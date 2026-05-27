import type { BgpFreshnessStatus } from "./operational-bgp.types.js";

function freshWindowMs(): number {
  const minutes = Number(process.env["SNMP_FAST_BGP_FRESH_MINUTES"] ?? 15);
  return (Number.isFinite(minutes) && minutes > 0 ? minutes : 15) * 60 * 1000;
}

function staleWindowMs(): number {
  const hours = Number(process.env["SNMP_FAST_BGP_STALE_HOURS"] ?? 24);
  return (Number.isFinite(hours) && hours > 0 ? hours : 24) * 60 * 60 * 1000;
}

export function computeBgpFreshnessStatus(collectedAt: Date | null | undefined, now = new Date()): BgpFreshnessStatus {
  if (!collectedAt) return "unknown";
  const ageMs = now.getTime() - collectedAt.getTime();
  if (ageMs < 0) return "fresh";
  if (ageMs < freshWindowMs()) return "fresh";
  if (ageMs < staleWindowMs()) return "stale";
  return "expired";
}
