import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { useTranslation } from "@/i18n";
import { Database, Info, RefreshCw } from "lucide-react";
import type { BgpPeerDrilldownCacheMeta } from "./types";
import { CacheStatusBadge, ConfigSourceBadge } from "./bgp-drilldown-badges";

interface BgpDrilldownCacheStatusBannerProps {
  cache?: BgpPeerDrilldownCacheMeta;
  configBuildSource?: string;
}

export function BgpDrilldownCacheStatusBanner({ cache, configBuildSource }: BgpDrilldownCacheStatusBannerProps) {
  const { t } = useTranslation();
  if (!cache && !configBuildSource) return null;

  const status = cache?.status ?? "miss";
  const buildSource = cache?.configBuildSource ?? configBuildSource ?? "unknown";

  const helpKey = (
    {
      fresh: "helpFresh",
      expired: "helpExpired",
      miss: "helpMiss",
      recomputed: "helpRecomputed",
    } as const
  )[status as "fresh" | "expired" | "miss" | "recomputed"] ?? "helpUnknown";

  return (
    <Alert className="border-border bg-muted/20">
      <Database className="h-4 w-4" />
      <AlertTitle className="flex flex-wrap items-center gap-2">
        {t("bgpPeerDrilldown.features.cacheUx.bannerTitle")}
        <CacheStatusBadge status={status} />
        <ConfigSourceBadge source={buildSource} />
        {cache?.servedFromCache ? (
          <Badge variant="outline">{t("bgpPeerDrilldown.features.cacheUx.servedFromCache")}</Badge>
        ) : null}
      </AlertTitle>
      <AlertDescription className="space-y-2 text-sm">
        <p>{t(`bgpPeerDrilldown.features.cacheUx.${helpKey}`)}</p>
        <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
          {cache?.rowId ? <span>cacheRowId={cache.rowId}</span> : null}
          {cache?.expiresAt ? <span>expiresAt={new Date(cache.expiresAt).toLocaleString()}</span> : null}
        </div>
      </AlertDescription>
    </Alert>
  );
}

export function BgpDrilldownRecomputeNotice() {
  const { t } = useTranslation();
  return (
    <Alert className="border-cyan-500/30 bg-cyan-500/5">
      <RefreshCw className="h-4 w-4 text-cyan-300" />
      <AlertTitle>{t("bgpPeerDrilldown.features.cacheUx.recomputeTitle")}</AlertTitle>
      <AlertDescription>{t("bgpPeerDrilldown.features.cacheUx.recomputeBody")}</AlertDescription>
    </Alert>
  );
}

export function BgpDrilldownEmptyState({
  kind,
}: {
  kind: "no-query" | "no-history" | "expired-only" | "no-raw-config";
}) {
  const { t } = useTranslation();
  const keyMap = {
    "no-query": { title: "emptyNoQueryTitle", body: "emptyNoQueryBody" },
    "no-history": { title: "emptyNoHistoryTitle", body: "emptyNoHistoryBody" },
    "expired-only": { title: "emptyExpiredOnlyTitle", body: "emptyExpiredOnlyBody" },
    "no-raw-config": { title: "emptyNoRawConfigTitle", body: "emptyNoRawConfigBody" },
  } as const;
  const keys = keyMap[kind];

  return (
    <div className="rounded-md border border-dashed p-8 text-center space-y-2">
      <Info className="mx-auto h-5 w-5 text-muted-foreground" />
      <p className="font-medium">{t(`bgpPeerDrilldown.features.cacheUx.${keys.title}`)}</p>
      <p className="text-sm text-muted-foreground">{t(`bgpPeerDrilldown.features.cacheUx.${keys.body}`)}</p>
    </div>
  );
}
