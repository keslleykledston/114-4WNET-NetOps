import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { BgpPeerCleanupRisk } from "@/features/bgp-cleanup-types";
import { useTranslation } from "@/i18n";

export function dependencyRiskBadgeClass(risk: BgpPeerCleanupRisk): string {
  if (risk === "low") return "border-emerald-500/30 bg-emerald-500/10 text-emerald-200";
  if (risk === "medium") return "border-amber-500/30 bg-amber-500/10 text-amber-200";
  return "border-red-500/30 bg-red-500/10 text-red-200";
}

const riskLabelKeys: Record<BgpPeerCleanupRisk, string> = {
  low: "bgp.dependencyRisk.low",
  medium: "bgp.dependencyRisk.medium",
  high: "bgp.dependencyRisk.high",
};

export function DependencyRiskBadge({ risk }: { risk: BgpPeerCleanupRisk }) {
  const { t } = useTranslation();

  return (
    <Badge variant="outline" className={cn("font-medium", dependencyRiskBadgeClass(risk))}>
      {t(riskLabelKeys[risk])}
    </Badge>
  );
}
