import type { L2vpnSummary } from "../discovery.types.js";

export const emptyL2vpnSummary: L2vpnSummary = {
  l2vcs: [],
  vsis: [],
  source: "local_db",
  confidence: "low",
};
