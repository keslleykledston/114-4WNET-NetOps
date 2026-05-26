import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Database, Info, RefreshCw } from "lucide-react";
import type { BgpPeerDrilldownCacheMeta } from "./types";
import { CacheStatusBadge, ConfigSourceBadge } from "./bgp-drilldown-badges";

interface BgpDrilldownCacheStatusBannerProps {
  cache?: BgpPeerDrilldownCacheMeta;
  configBuildSource?: string;
}

function cacheHelp(status: string): string {
  switch (status) {
    case "fresh":
      return "Resposta servida do cache TTL ainda válido. Nenhum reparse executado nesta consulta.";
    case "expired":
      return "Cache anterior expirou. Drilldown recalculado a partir do raw_config salvo (sem rede).";
    case "miss":
      return "Sem cache fresh. Drilldown calculado e persistido a partir do snapshot/raw_config local.";
    case "recomputed":
      return "Recálculo forçado a partir do raw_config salvo. Não executa comandos no equipamento.";
    default:
      return "Status de cache desconhecido.";
  }
}

export function BgpDrilldownCacheStatusBanner({ cache, configBuildSource }: BgpDrilldownCacheStatusBannerProps) {
  if (!cache && !configBuildSource) return null;

  const status = cache?.status ?? "miss";
  const buildSource = cache?.configBuildSource ?? configBuildSource ?? "unknown";

  return (
    <Alert className="border-border bg-muted/20">
      <Database className="h-4 w-4" />
      <AlertTitle className="flex flex-wrap items-center gap-2">
        Cache / origem da config
        <CacheStatusBadge status={status} />
        <ConfigSourceBadge source={buildSource} />
        {cache?.servedFromCache ? <Badge variant="outline">servedFromCache</Badge> : null}
      </AlertTitle>
      <AlertDescription className="space-y-2 text-sm">
        <p>{cacheHelp(status)}</p>
        <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
          {cache?.rowId ? <span>cacheRowId={cache.rowId}</span> : null}
          {cache?.expiresAt ? <span>expiresAt={new Date(cache.expiresAt).toLocaleString()}</span> : null}
        </div>
      </AlertDescription>
    </Alert>
  );
}

export function BgpDrilldownRecomputeNotice() {
  return (
    <Alert className="border-cyan-500/30 bg-cyan-500/5">
      <RefreshCw className="h-4 w-4 text-cyan-300" />
      <AlertTitle>Recalcular a partir do snapshot</AlertTitle>
      <AlertDescription>
        Reprocessa apenas o raw_config já salvo no banco. Não executa SSH, SNMP, discovery nem comandos no equipamento.
      </AlertDescription>
    </Alert>
  );
}

export function BgpDrilldownEmptyState({
  kind,
}: {
  kind: "no-query" | "no-history" | "expired-only" | "no-raw-config";
}) {
  const copy = {
    "no-query": {
      title: "Consulte um peer",
      body: "Selecione device + peer e clique em Consultar para carregar drilldown e histórico.",
    },
    "no-history": {
      title: "Sem histórico persistido",
      body: "Nenhum snapshot de drilldown foi salvo ainda para este peer. Use Consultar para gerar a primeira entrada.",
    },
    "expired-only": {
      title: "Cache expirado",
      body: "Existem entradas antigas no histórico, mas nenhuma cache fresh. Consulte novamente ou use Recalcular.",
    },
    "no-raw-config": {
      title: "Snapshot sem raw_config",
      body: "Não há raw_config salvo para reparse local. Coleta SSH/config precisa existir no banco (fora desta tela).",
    },
  }[kind];

  return (
    <div className="rounded-md border border-dashed p-8 text-center space-y-2">
      <Info className="mx-auto h-5 w-5 text-muted-foreground" />
      <p className="font-medium">{copy.title}</p>
      <p className="text-sm text-muted-foreground">{copy.body}</p>
    </div>
  );
}
