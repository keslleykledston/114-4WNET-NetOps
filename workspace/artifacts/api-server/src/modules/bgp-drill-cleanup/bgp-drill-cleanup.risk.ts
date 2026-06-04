import type { BgpPeerCleanupRecommendation, BgpPeerCleanupRisk } from "./bgp-drill-cleanup.types.js";

export function computeCleanupRisk(recommendation: BgpPeerCleanupRecommendation, hasShared: boolean, hasAmbiguous: boolean): BgpPeerCleanupRisk {
  if (recommendation === "skip") return "high";
  if (hasAmbiguous) return "high";
  if (hasShared) return "medium";
  return recommendation === "full" ? "low" : "medium";
}
