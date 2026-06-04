import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { BgpPeerCleanupRisk } from "@/features/bgp-cleanup-types";

export function dependencyRiskBadgeClass(risk: BgpPeerCleanupRisk): string {
  if (risk === "low") return "border-emerald-500/30 bg-emerald-500/10 text-emerald-200";
  if (risk === "medium") return "border-amber-500/30 bg-amber-500/10 text-amber-200";
  return "border-red-500/30 bg-red-500/10 text-red-200";
}

export function DependencyRiskBadge({ risk }: { risk: BgpPeerCleanupRisk }) {
  const label = risk === "low" ? "Baixo" : risk === "medium" ? "Médio" : "Alto";
  return (
    <Badge variant="outline" className={cn("font-medium", dependencyRiskBadgeClass(risk))}>
      {label}
    </Badge>
  );
}
