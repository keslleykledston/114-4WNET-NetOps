import { useEffect, useMemo, useState } from "react";
import { AlertCircle, RefreshCw, Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  useCommunityLibraryItems,
  useResyncCommunityLibrary,
  type CommunityResyncResult,
} from "@/features/device-discovery/community-api";
import { useToast } from "@/hooks/use-toast";
import { useTranslation } from "@/i18n";
import type { TranslationParams } from "@/i18n/types";

interface CommunityLibraryTabProps {
  deviceId: number;
}

type TranslateFn = (key: string, params?: TranslationParams) => string;

function formatSyncSummary(result: CommunityResyncResult, t: TranslateFn) {
  const sourceLabel =
    result.source === "live_ssh"
      ? t("communities.panel.syncSource.liveSsh")
      : t("communities.panel.syncSource.backup");
  const parts = [
    t("communities.toasts.syncSummary.source", { source: sourceLabel }),
    t("communities.toasts.syncSummary.newFilters", { count: result.libraryInserted }),
    t("communities.toasts.syncSummary.updatedFilters", { count: result.libraryUpdated }),
    t("communities.toasts.syncSummary.importedSets", { count: result.setsInserted }),
    t("communities.toasts.syncSummary.members", { count: result.setMembersInserted }),
  ];
  if (result.setMembersMissingLibrary > 0) {
    parts.push(t("communities.toasts.syncSummary.missingLibrary", { count: result.setMembersMissingLibrary }));
  }
  return parts.join(" · ");
}

export function CommunityLibraryTab({ deviceId }: CommunityLibraryTabProps) {
  const { t } = useTranslation();
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const { toast } = useToast();
  const libraryQuery = useCommunityLibraryItems(deviceId, debouncedSearch);
  const resyncMutation = useResyncCommunityLibrary();

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => window.clearTimeout(timer);
  }, [search]);

  const summary = useMemo(() => {
    const items = libraryQuery.data ?? [];
    const active = items.filter((item) => item.isActive).length;
    return `${t("communities.panel.badges.entries", { count: items.length })} · ${t("communities.panel.badges.active", { count: active })}`;
  }, [libraryQuery.data, t]);

  async function handleResync(source: "backup" | "live") {
    try {
      const result = await resyncMutation.mutateAsync({ deviceId, source });
      toast({
        title: source === "backup" ? t("communities.toasts.syncBackupDone") : t("communities.toasts.syncLiveDone"),
        description: formatSyncSummary(result, t),
      });
    } catch (error) {
      toast({
        title: source === "backup" ? t("communities.toasts.syncBackupFailed") : t("communities.toasts.syncLiveFailed"),
        description: error instanceof Error ? error.message : t("communities.toasts.deviceUnreachable"),
        variant: "destructive",
      });
    }
  }

  const items = libraryQuery.data ?? [];
  const isLoading = libraryQuery.isLoading || libraryQuery.isFetching || resyncMutation.isPending;

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-border bg-card/80 p-4 shadow-sm">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-semibold text-foreground">{t("communities.panel.library.title")}</h3>
              <Badge variant="secondary" className="text-[10px]">
                {summary}
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground">{t("communities.panel.description")}</p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => void handleResync("backup")}
              disabled={resyncMutation.isPending}
            >
              <RefreshCw className={`mr-2 h-4 w-4 ${resyncMutation.isPending ? "animate-spin" : ""}`} />
              {t("communities.panel.syncBackup")}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => void handleResync("live")}
              disabled={resyncMutation.isPending}
            >
              <RefreshCw className={`mr-2 h-4 w-4 ${resyncMutation.isPending ? "animate-spin" : ""}`} />
              {t("communities.panel.syncLiveSsh")}
            </Button>
          </div>
        </div>

        <div className="mt-4 flex items-center gap-2">
          <div className="relative w-full max-w-md">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder={t("communities.panel.searchPlaceholder")}
              className="pl-9"
            />
          </div>
        </div>
      </div>

      {libraryQuery.error ? (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive flex items-start gap-2">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{t("communities.panel.loadError")}</span>
        </div>
      ) : null}

      <div className="overflow-hidden rounded-xl border border-border bg-card">
        <div className="border-b border-border px-4 py-3 text-xs uppercase tracking-wide text-muted-foreground">
          {t("communities.panel.library.discoveredFilters")}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-3 font-medium">{t("communities.panel.library.table.filter")}</th>
                <th className="px-4 py-3 font-medium">{t("communities.panel.library.table.value")}</th>
                <th className="px-4 py-3 font-medium">{t("communities.panel.library.table.description")}</th>
                <th className="px-4 py-3 font-medium">{t("communities.panel.library.table.type")}</th>
                <th className="px-4 py-3 font-medium">{t("communities.panel.library.table.action")}</th>
                <th className="px-4 py-3 font-medium">{t("communities.panel.library.table.origin")}</th>
                <th className="px-4 py-3 font-medium">{t("communities.panel.library.table.state")}</th>
                <th className="px-4 py-3 font-medium text-right">{t("communities.panel.library.table.usageRp")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {isLoading ? (
                <tr>
                  <td colSpan={8} className="px-4 py-10 text-center text-sm text-muted-foreground">
                    {t("communities.panel.library.loading")}
                  </td>
                </tr>
              ) : items.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-10 text-center text-sm text-muted-foreground">
                    {t("communities.panel.library.empty")}
                  </td>
                </tr>
              ) : (
                items.map((item) => (
                  <tr key={item.id} className="hover:bg-muted/30">
                    <td className="px-4 py-3 font-mono text-xs text-foreground">{item.filterName}</td>
                    <td className="px-4 py-3 font-mono text-xs text-primary">{item.communityValue}</td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">
                      <span className="block max-w-[320px] truncate" title={item.description ?? ""}>
                        {item.description || "—"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">{item.matchType}</td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">{item.action}</td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">{item.origin}</td>
                    <td className="px-4 py-3 text-xs">
                      {item.isActive ? (
                        <Badge variant="secondary" className="bg-emerald-500/10 text-emerald-300">
                          {t("communities.panel.library.active")}
                        </Badge>
                      ) : (
                        <Badge variant="secondary" className="bg-amber-500/10 text-amber-300">
                          {t("communities.panel.library.inactive")}
                        </Badge>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right text-xs text-muted-foreground">{item.usageCount ?? 0}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
