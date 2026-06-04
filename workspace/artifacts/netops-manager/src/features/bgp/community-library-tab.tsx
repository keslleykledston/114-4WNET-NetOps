import { useEffect, useMemo, useState } from "react";
import { AlertCircle, RefreshCw, Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  useCommunityLibraryItems,
  useResyncCommunityLibrary,
} from "@/features/device-discovery/community-api";
import { useToast } from "@/hooks/use-toast";

interface CommunityLibraryTabProps {
  deviceId: number;
}

function formatSyncSummary(result: {
  libraryInserted: number;
  libraryUpdated: number;
  setsInserted: number;
  setMembersInserted: number;
}) {
  return [
    `${result.libraryInserted} filtros novos`,
    `${result.libraryUpdated} filtros atualizados`,
    `${result.setsInserted} sets importados`,
    `${result.setMembersInserted} members`,
  ].join(" · ");
}

export function CommunityLibraryTab({ deviceId }: CommunityLibraryTabProps) {
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
    return `${items.length} entradas · ${active} ativas`;
  }, [libraryQuery.data]);

  async function handleResync(source: "backup" | "live") {
    try {
      const result = await resyncMutation.mutateAsync({ deviceId, source });
      toast({
        title: source === "backup" ? "Sync backup concluído" : "Sync live (SSH) concluído",
        description: formatSyncSummary(result),
      });
    } catch (error) {
      toast({
        title: source === "backup" ? "Falha no sync backup" : "Falha no sync live (SSH)",
        description: error instanceof Error ? error.message : "Não foi possível sincronizar communities.",
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
              <h3 className="text-sm font-semibold text-foreground">Biblioteca de communities</h3>
              <Badge variant="secondary" className="text-[10px]">
                {summary}
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground">
              Busca por nome, valor ou descrição. `Sync backup` lê o último running-config salvo; `Sync live (SSH)` consulta o equipamento agora.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => void handleResync("backup")}
              disabled={resyncMutation.isPending}
            >
              <RefreshCw className={`mr-2 h-4 w-4 ${resyncMutation.isPending ? "animate-spin" : ""}`} />
              Sync backup
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => void handleResync("live")}
              disabled={resyncMutation.isPending}
            >
              <RefreshCw className={`mr-2 h-4 w-4 ${resyncMutation.isPending ? "animate-spin" : ""}`} />
              Sync live (SSH)
            </Button>
          </div>
        </div>

        <div className="mt-4 flex items-center gap-2">
          <div className="relative w-full max-w-md">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Buscar community-filter..."
              className="pl-9"
            />
          </div>
        </div>
      </div>

      {libraryQuery.error ? (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive flex items-start gap-2">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>Erro ao carregar biblioteca de communities.</span>
        </div>
      ) : null}

      <div className="overflow-hidden rounded-xl border border-border bg-card">
        <div className="border-b border-border px-4 py-3 text-xs uppercase tracking-wide text-muted-foreground">
          Filtros descobertos
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-3 font-medium">Filter</th>
                <th className="px-4 py-3 font-medium">Valor</th>
                <th className="px-4 py-3 font-medium">Descrição</th>
                <th className="px-4 py-3 font-medium">Tipo</th>
                <th className="px-4 py-3 font-medium">Ação</th>
                <th className="px-4 py-3 font-medium">Origem</th>
                <th className="px-4 py-3 font-medium">Estado</th>
                <th className="px-4 py-3 font-medium text-right">Uso</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {isLoading ? (
                <tr>
                  <td colSpan={8} className="px-4 py-10 text-center text-sm text-muted-foreground">
                    Carregando biblioteca...
                  </td>
                </tr>
              ) : items.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-10 text-center text-sm text-muted-foreground">
                    Nenhum filtro encontrado. Use `Sync backup` ou `Sync live (SSH)`.
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
                          ativo
                        </Badge>
                      ) : (
                        <Badge variant="secondary" className="bg-amber-500/10 text-amber-300">
                          inativo
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
