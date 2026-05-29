import { useMemo, useState } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { GitCompare, History } from "lucide-react";
import {
  ConfigSourceBadge,
  HistoryFreshnessBadge,
} from "./bgp-drilldown-badges";
import { BgpDrilldownEmptyState } from "./bgp-drilldown-cache-ux";
import { useBgpPeerDrilldownHistoryCompare } from "./bgp-drilldown-api";
import type { BgpPeerDrilldownHistoryItem } from "./types";

interface BgpDrilldownHistoryPanelProps {
  deviceId: number;
  peer: string;
  items?: BgpPeerDrilldownHistoryItem[];
  loading?: boolean;
  error?: Error | null;
  hasSubmitted?: boolean;
}

function formatDt(value: string) {
  return new Date(value).toLocaleString();
}

export function BgpDrilldownHistoryPanel({
  deviceId,
  peer,
  items = [],
  loading,
  error,
  hasSubmitted,
}: BgpDrilldownHistoryPanelProps) {
  const [selected, setSelected] = useState<number[]>([]);

  const sorted = useMemo(
    () => [...items].sort((a, b) => new Date(b.collectedAt).getTime() - new Date(a.collectedAt).getTime()),
    [items],
  );

  const leftId = selected[0] ?? 0;
  const rightId = selected[1] ?? 0;
  const compareQuery = useBgpPeerDrilldownHistoryCompare({
    deviceId,
    peer,
    leftId,
    rightId,
    enabled: selected.length === 2,
  });

  const onlyExpired = sorted.length > 0 && sorted.every((item) => item.freshnessStatus === "expired");

  function toggle(id: number) {
    setSelected((prev) => {
      if (prev.includes(id)) return prev.filter((v) => v !== id);
      if (prev.length >= 2) return [prev[1], id];
      return [...prev, id];
    });
  }

  if (!hasSubmitted) {
    return <BgpDrilldownEmptyState kind="no-query" />;
  }

  if (loading) {
    return <p className="text-sm text-muted-foreground">Carregando histórico...</p>;
  }

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertTitle>Erro ao carregar histórico</AlertTitle>
        <AlertDescription>{error.message}</AlertDescription>
      </Alert>
    );
  }

  if (!sorted.length) {
    return <BgpDrilldownEmptyState kind="no-history" />;
  }

  return (
    <div className="space-y-4">
      {onlyExpired ? <BgpDrilldownEmptyState kind="expired-only" /> : null}

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <History className="h-4 w-4" />
            Histórico ({sorted.length})
          </CardTitle>
          <CardDescription>
            Ordenado por collected_at desc. Selecione 2 linhas para comparar policies/AFI/warnings (sem raw evidence).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="overflow-x-auto rounded-md border border-border">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-muted-foreground">
                <tr>
                  <th className="px-2 py-2 text-left font-medium w-10">Cmp</th>
                  <th className="px-3 py-2 text-left font-medium">Collected</th>
                  <th className="px-3 py-2 text-left font-medium">Source</th>
                  <th className="px-3 py-2 text-left font-medium">Config source</th>
                  <th className="px-3 py-2 text-left font-medium">Freshness</th>
                  <th className="px-3 py-2 text-left font-medium">Warnings</th>
                  <th className="px-3 py-2 text-left font-medium">Expires</th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((item) => (
                  <tr key={item.id} className="border-t border-border align-top">
                    <td className="px-2 py-2">
                      <Checkbox
                        checked={selected.includes(item.id)}
                        onCheckedChange={() => toggle(item.id)}
                        aria-label={`Selecionar histórico ${item.id}`}
                      />
                    </td>
                    <td className="px-3 py-2 font-mono text-xs">{formatDt(item.collectedAt)}</td>
                    <td className="px-3 py-2"><Badge variant="outline">{item.source}</Badge></td>
                    <td className="px-3 py-2"><ConfigSourceBadge source={item.configBuildSource} /></td>
                    <td className="px-3 py-2"><HistoryFreshnessBadge status={item.freshnessStatus} /></td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">
                      {item.warningsCount > 0 ? `${item.warningsCount}: ${item.warnings.slice(0, 2).join("; ")}${item.warningsCount > 2 ? "…" : ""}` : "0"}
                    </td>
                    <td className="px-3 py-2 font-mono text-xs">{formatDt(item.expiresAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" variant="outline" size="sm" disabled={selected.length !== 2} onClick={() => void compareQuery.refetch()}>
              <GitCompare className="h-4 w-4 mr-2" />
              Comparar selecionados
            </Button>
            <Badge variant="outline">{selected.length}/2 selecionados</Badge>
          </div>
        </CardContent>
      </Card>

      {selected.length === 2 && compareQuery.data?.compare ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Comparação simples</CardTitle>
            <CardDescription>
              #{compareQuery.data.compare.left.id} ({formatDt(compareQuery.data.compare.left.collectedAt)}) vs
              {" "}
              #{compareQuery.data.compare.right.id} ({formatDt(compareQuery.data.compare.right.collectedAt)})
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            <CompareSection title="Import policy changes" rows={compareQuery.data.compare.importPolicyChanges.map((r) => (
              `${r.afiSafi}${r.vrf ? `/${r.vrf}` : ""}: ${r.left ?? "—"} → ${r.right ?? "—"}`
            ))} />
            <CompareSection title="Export policy changes" rows={compareQuery.data.compare.exportPolicyChanges.map((r) => (
              `${r.afiSafi}${r.vrf ? `/${r.vrf}` : ""}: ${r.left ?? "—"} → ${r.right ?? "—"}`
            ))} />
            <CompareSection title="AFI/SAFI enabled changes" rows={compareQuery.data.compare.enabledFamilyChanges.map((r) => (
              `${r.afiSafi}${r.vrf ? `/${r.vrf}` : ""}: ${r.left ? "enabled" : "disabled"} → ${r.right ? "enabled" : "disabled"}`
            ))} />
            <CompareSection title="Warnings added" rows={compareQuery.data.compare.warningsAdded} />
            <CompareSection title="Warnings removed" rows={compareQuery.data.compare.warningsRemoved} />
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}

function CompareSection({ title, rows }: { title: string; rows: string[] }) {
  return (
    <div>
      <div className="font-medium mb-1">{title}</div>
      {rows.length ? (
        <ul className="list-disc pl-5 text-muted-foreground space-y-1">
          {rows.map((row) => <li key={row}>{row}</li>)}
        </ul>
      ) : (
        <p className="text-muted-foreground">Sem diferenças.</p>
      )}
    </div>
  );
}
