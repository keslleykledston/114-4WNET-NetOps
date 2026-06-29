import { useMemo, useState } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { useTranslation } from "@/i18n";
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
  const { t } = useTranslation();
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
    return <p className="text-sm text-muted-foreground">{t("bgpPeerDrilldown.features.history.loading")}</p>;
  }

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertTitle>{t("bgpPeerDrilldown.features.history.loadError")}</AlertTitle>
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
            {t("bgpPeerDrilldown.features.history.title", { count: sorted.length })}
          </CardTitle>
          <CardDescription>{t("bgpPeerDrilldown.features.history.description")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="overflow-x-auto rounded-md border border-border">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-muted-foreground">
                <tr>
                  <th className="px-2 py-2 text-left font-medium w-10">{t("bgpPeerDrilldown.features.history.colCompare")}</th>
                  <th className="px-3 py-2 text-left font-medium">{t("bgpPeerDrilldown.features.history.colCollected")}</th>
                  <th className="px-3 py-2 text-left font-medium">{t("bgpPeerDrilldown.features.history.colSource")}</th>
                  <th className="px-3 py-2 text-left font-medium">{t("bgpPeerDrilldown.features.history.colConfigSource")}</th>
                  <th className="px-3 py-2 text-left font-medium">{t("bgpPeerDrilldown.features.history.colFreshness")}</th>
                  <th className="px-3 py-2 text-left font-medium">{t("bgpPeerDrilldown.features.history.colWarnings")}</th>
                  <th className="px-3 py-2 text-left font-medium">{t("bgpPeerDrilldown.features.history.colExpires")}</th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((item) => (
                  <tr key={item.id} className="border-t border-border align-top">
                    <td className="px-2 py-2">
                      <Checkbox
                        checked={selected.includes(item.id)}
                        onCheckedChange={() => toggle(item.id)}
                        aria-label={t("bgpPeerDrilldown.features.history.selectAria", { id: item.id })}
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
              {t("bgpPeerDrilldown.features.history.compareSelected")}
            </Button>
            <Badge variant="outline">{t("bgpPeerDrilldown.features.history.selectedCount", { count: selected.length })}</Badge>
          </div>
        </CardContent>
      </Card>

      {selected.length === 2 && compareQuery.data?.compare ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("bgpPeerDrilldown.features.history.compareTitle")}</CardTitle>
            <CardDescription>
              {t("bgpPeerDrilldown.features.history.compareVs", {
                leftId: compareQuery.data.compare.left.id,
                leftDate: formatDt(compareQuery.data.compare.left.collectedAt),
                rightId: compareQuery.data.compare.right.id,
                rightDate: formatDt(compareQuery.data.compare.right.collectedAt),
              })}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            <CompareSection
              title={t("bgpPeerDrilldown.features.history.sectionImportPolicy")}
              rows={compareQuery.data.compare.importPolicyChanges.map((r) => (
                `${r.afiSafi}${r.vrf ? `/${r.vrf}` : ""}: ${r.left ?? "—"} → ${r.right ?? "—"}`
              ))}
              noDiffLabel={t("bgpPeerDrilldown.features.history.noDiff")}
            />
            <CompareSection
              title={t("bgpPeerDrilldown.features.history.sectionExportPolicy")}
              rows={compareQuery.data.compare.exportPolicyChanges.map((r) => (
                `${r.afiSafi}${r.vrf ? `/${r.vrf}` : ""}: ${r.left ?? "—"} → ${r.right ?? "—"}`
              ))}
              noDiffLabel={t("bgpPeerDrilldown.features.history.noDiff")}
            />
            <CompareSection
              title={t("bgpPeerDrilldown.features.history.sectionAfiEnabled")}
              rows={compareQuery.data.compare.enabledFamilyChanges.map((r) => (
                `${r.afiSafi}${r.vrf ? `/${r.vrf}` : ""}: ${r.left ? t("bgpPeerDrilldown.features.history.enabled") : t("bgpPeerDrilldown.features.history.disabled")} → ${r.right ? t("bgpPeerDrilldown.features.history.enabled") : t("bgpPeerDrilldown.features.history.disabled")}`
              ))}
              noDiffLabel={t("bgpPeerDrilldown.features.history.noDiff")}
            />
            <CompareSection
              title={t("bgpPeerDrilldown.features.history.sectionWarningsAdded")}
              rows={compareQuery.data.compare.warningsAdded}
              noDiffLabel={t("bgpPeerDrilldown.features.history.noDiff")}
            />
            <CompareSection
              title={t("bgpPeerDrilldown.features.history.sectionWarningsRemoved")}
              rows={compareQuery.data.compare.warningsRemoved}
              noDiffLabel={t("bgpPeerDrilldown.features.history.noDiff")}
            />
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}

function CompareSection({ title, rows, noDiffLabel }: { title: string; rows: string[]; noDiffLabel: string }) {
  return (
    <div>
      <div className="font-medium mb-1">{title}</div>
      {rows.length ? (
        <ul className="list-disc pl-5 text-muted-foreground space-y-1">
          {rows.map((row) => <li key={row}>{row}</li>)}
        </ul>
      ) : (
        <p className="text-muted-foreground">{noDiffLabel}</p>
      )}
    </div>
  );
}
