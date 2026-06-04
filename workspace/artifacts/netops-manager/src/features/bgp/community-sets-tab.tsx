import { useEffect, useMemo, useState } from "react";
import { AlertCircle, Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  useCommunitySets,
  type CommunitySet,
} from "@/features/device-discovery/community-api";

interface CommunitySetsTabProps {
  deviceId: number;
}

function isImportedOrigin(origin: string) {
  return origin === "discovered" || origin === "discovered_running_config" || origin === "discovered_live";
}

function statusVariant(status: string) {
  if (status === "applied") return "bg-emerald-500/10 text-emerald-300";
  if (status === "ready") return "bg-sky-500/10 text-sky-300";
  if (status === "draft") return "bg-slate-500/10 text-slate-300";
  return "bg-violet-500/10 text-violet-300";
}

function SetMemberRow({ member }: { member: CommunitySet["members"][number] }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-border bg-background/50 px-3 py-2">
      <div className="min-w-0">
        <div className="font-mono text-xs text-foreground">{member.communityValue}</div>
        {member.valueDescription ? (
          <div className="mt-1 truncate text-[11px] text-muted-foreground">{member.valueDescription}</div>
        ) : null}
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {member.linkedFilterName ? (
          <Badge variant="secondary" className="bg-sky-500/10 text-sky-300">
            {member.linkedFilterName}
          </Badge>
        ) : null}
        {member.missingInLibrary ? (
          <Badge variant="secondary" className="bg-amber-500/10 text-amber-300">
            missing
          </Badge>
        ) : (
          <Badge variant="secondary" className="bg-emerald-500/10 text-emerald-300">
            linked
          </Badge>
        )}
      </div>
    </div>
  );
}

export function CommunitySetsTab({ deviceId }: CommunitySetsTabProps) {
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const setsQuery = useCommunitySets(deviceId);

  useEffect(() => {
    const firstId = setsQuery.data?.[0]?.id ?? null;
    if (selectedId === null && firstId !== null) {
      setSelectedId(firstId);
    }
  }, [selectedId, setsQuery.data]);

  const filteredSets = useMemo(() => {
    const q = search.trim().toLowerCase();
    const sets = setsQuery.data ?? [];
    if (!q) return sets;
    return sets.filter((set) => {
      const blob = [
        set.name,
        set.slug,
        set.vrpObjectName,
        set.origin,
        set.status,
        set.description,
        ...(set.discoveredMembersJson ?? []),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return blob.includes(q);
    });
  }, [search, setsQuery.data]);

  const selectedSet = filteredSets.find((set) => set.id === selectedId) ?? filteredSets[0] ?? null;

  useEffect(() => {
    if (selectedSet && selectedSet.id !== selectedId) {
      setSelectedId(selectedSet.id);
    }
  }, [selectedId, selectedSet]);

  const importedCount = (setsQuery.data ?? []).filter((set) => isImportedOrigin(set.origin)).length;

  if (setsQuery.error) {
    return (
      <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive flex items-start gap-2">
        <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
        <span>Erro ao carregar community sets.</span>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-border bg-card/80 p-4 shadow-sm">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-semibold text-foreground">Community sets</h3>
              <Badge variant="secondary" className="text-[10px]">
                {setsQuery.data?.length ?? 0} sets · {importedCount} importados
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground">
              Sets importados a partir do running-config ou SSH live aparecem como somente leitura. Os detalhes mostram members, origem e estado.
            </p>
          </div>

          <div className="relative w-full max-w-md">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Buscar set..."
              className="pl-9"
            />
          </div>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[340px_minmax(0,1fr)]">
        <div className="rounded-xl border border-border bg-card">
          <div className="border-b border-border px-4 py-3 text-xs uppercase tracking-wide text-muted-foreground">
            Lista de sets
          </div>
          <ScrollArea className="h-[540px]">
            <div className="space-y-2 p-3">
              {setsQuery.isLoading ? (
                <div className="rounded-lg border border-dashed border-border px-4 py-10 text-center text-sm text-muted-foreground">
                  Carregando community sets...
                </div>
              ) : filteredSets.length === 0 ? (
                <div className="rounded-lg border border-dashed border-border px-4 py-10 text-center text-sm text-muted-foreground">
                  Nenhum set encontrado.
                </div>
              ) : (
                filteredSets.map((set) => {
                  const active = selectedSet?.id === set.id;
                  return (
                    <button
                      key={set.id}
                      type="button"
                      onClick={() => setSelectedId(set.id)}
                      className={[
                        "w-full rounded-lg border p-3 text-left transition-colors",
                        active
                          ? "border-primary/40 bg-primary/5"
                          : "border-border bg-background/40 hover:bg-muted/40",
                      ].join(" ")}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="truncate text-sm font-medium text-foreground">{set.name}</div>
                          <div className="mt-1 font-mono text-[11px] text-muted-foreground">{set.vrpObjectName}</div>
                        </div>
                        <Badge variant="secondary" className={statusVariant(set.status)}>
                          {set.status}
                        </Badge>
                      </div>
                      <div className="mt-3 flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
                        <span className="font-mono">{set.origin}</span>
                        <span>{set.membersTotal} members</span>
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </ScrollArea>
        </div>

        <div className="rounded-xl border border-border bg-card">
          <div className="border-b border-border px-4 py-3 text-xs uppercase tracking-wide text-muted-foreground">
            Detalhes do set
          </div>

          {!selectedSet ? (
            <div className="px-4 py-10 text-center text-sm text-muted-foreground">
              Selecione um set para ver members, origem e estado.
            </div>
          ) : (
            <div className="space-y-4 p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h4 className="text-lg font-semibold text-foreground">{selectedSet.name}</h4>
                    <Badge variant="secondary" className={statusVariant(selectedSet.status)}>
                      {selectedSet.status}
                    </Badge>
                    <Badge variant="secondary" className="bg-slate-500/10 text-slate-300">
                      {selectedSet.origin}
                    </Badge>
                  </div>
                  <div className="font-mono text-xs text-muted-foreground">{selectedSet.vrpObjectName}</div>
                  {selectedSet.description ? (
                    <p className="max-w-3xl text-sm text-muted-foreground">{selectedSet.description}</p>
                  ) : null}
                </div>
                <div className="rounded-lg border border-border bg-background/50 px-3 py-2 text-xs text-muted-foreground">
                  <div>{selectedSet.membersTotal} members</div>
                  <div>{selectedSet.membersResolved} resolvidos</div>
                  <div>{selectedSet.membersMissing} faltando na biblioteca</div>
                </div>
              </div>

              {isImportedOrigin(selectedSet.origin) ? (
                <div className="rounded-lg border border-amber-500/20 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
                  Set importado: leitura apenas. O sync atualiza este conjunto a partir do running-config ou do SSH live.
                </div>
              ) : null}

              <div className="space-y-2">
                <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Members
                </div>
                {selectedSet.members.length === 0 ? (
                  <div className="rounded-lg border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
                    Este set não possui members.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {selectedSet.members.map((member) => (
                      <SetMemberRow key={`${selectedSet.id}-${member.position}-${member.communityValue}`} member={member} />
                    ))}
                  </div>
                )}
              </div>

              {selectedSet.impliedConfigPreview ? (
                <div className="space-y-2">
                  <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Preview implícito
                  </div>
                  <pre className="overflow-auto rounded-lg border border-border bg-muted/40 p-3 text-xs leading-5 text-foreground">
                    {selectedSet.impliedConfigPreview}
                  </pre>
                </div>
              ) : null}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
