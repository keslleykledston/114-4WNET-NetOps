import { useQuery } from "@tanstack/react-query";
import type { Device } from "@workspace/api-client-react";
import { useState } from "react";
import { RefreshCw } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useRunDiscovery } from "@/features/device-discovery/discovery-api";
import { AnnouncementMatrixTable } from "@/features/bgp-announcements/AnnouncementMatrixTable";
import { AnnouncementEditModal } from "@/features/bgp-announcements/AnnouncementEditModal";
import { AnnouncementEvidencePanel } from "@/features/bgp-announcements/AnnouncementEvidencePanel";
import {
  createChangePlan,
  fetchAnnouncementMatrix,
  fetchChangePlans,
  fetchCommunitySets,
  fetchTargetEvidence,
  fetchUpstreamAudit,
  previewAnnouncementChange,
  syncCommunitySets,
} from "@/features/bgp-announcements/announcement-api";
import type { MatrixRow, PreviewChangeResponse } from "@/features/bgp-announcements/announcement-types";

interface AnnouncementPanelProps {
  device: Device;
}

export function AnnouncementPanel({ device }: AnnouncementPanelProps) {
  const { toast } = useToast();
  const deviceId = device.id;
  const runDiscovery = useRunDiscovery(deviceId);
  const [search, setSearch] = useState("");
  const [family, setFamily] = useState("");
  const [targetType, setTargetType] = useState("");
  const [editRow, setEditRow] = useState<MatrixRow | null>(null);
  const [editCircuitId, setEditCircuitId] = useState<string | null>(null);
  const [selectedCell, setSelectedCell] = useState<{ targetKey: string; circuitId: string } | null>(null);

  const matrixQuery = useQuery({
    queryKey: ["bgp-announcement-matrix", deviceId, search, family, targetType],
    queryFn: () => fetchAnnouncementMatrix(deviceId, {
      search: search || undefined,
      family: family || undefined,
      targetType: targetType || undefined,
    }),
  });

  const evidenceQuery = useQuery({
    queryKey: ["bgp-announcement-evidence", deviceId, selectedCell?.targetKey, selectedCell?.circuitId],
    queryFn: () => fetchTargetEvidence(deviceId, selectedCell!.targetKey, selectedCell!.circuitId),
    enabled: selectedCell != null,
  });

  const auditQuery = useQuery({
    queryKey: ["bgp-upstream-audit", deviceId],
    queryFn: () => fetchUpstreamAudit(deviceId),
  });

  const setsQuery = useQuery({
    queryKey: ["bgp-community-sets", deviceId],
    queryFn: () => fetchCommunitySets(deviceId),
  });

  const plansQuery = useQuery({
    queryKey: ["bgp-change-plans", deviceId],
    queryFn: () => fetchChangePlans(deviceId),
  });

  const visibleRows = matrixQuery.data?.rows.filter((row) => {
    if (/export/i.test(row.routePolicyName)) return false;
    return row.targetType === "origin" || row.targetType === "customer";
  }) ?? [];

  const upstreamName = matrixQuery.data?.upstreams.find((u) => u.circuitId === editCircuitId)?.displayName ?? null;

  function handleCellSelect(row: MatrixRow, circuitId: string) {
    setSelectedCell({ targetKey: row.targetKey, circuitId });
    setEditRow(row);
    setEditCircuitId(circuitId);
  }

  function handleRefresh() {
    runDiscovery.mutate(undefined, {
      onSuccess: async (result) => {
        const sshOk = result.sourceStatus?.ssh === "success";
        await Promise.all([
          matrixQuery.refetch(),
          evidenceQuery.refetch(),
          auditQuery.refetch(),
        ]);
        try {
          await syncCommunitySets(deviceId);
          await setsQuery.refetch();
        } catch {
          // community set sync is best-effort after collection
        }

        toast({
          title: sshOk ? "Coleta concluída" : "Coleta com avisos",
          description: sshOk
            ? "Discovery SSH read-only finalizado. Matriz atualizada."
            : "Discovery terminou com falha ou aviso em SSH. Verifique conectividade e credenciais.",
          variant: sshOk ? "default" : "destructive",
        });
      },
      onError: (error) => {
        toast({
          title: "Falha na coleta",
          description: error instanceof Error ? error.message : "Não foi possível executar discovery no dispositivo.",
          variant: "destructive",
        });
      },
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold text-foreground">Anúncios (matriz)</h3>
          <p className="text-[12px] text-muted-foreground">
            Modo read-only — observação, evidência e simulação. Nesta matriz entram só policies de ORIGIN e import de cliente.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select
            className="h-8 rounded-md border border-border bg-background px-2 text-[12px]"
            value={family}
            onChange={(e) => setFamily(e.target.value)}
          >
            <option value="">Família: todas</option>
            <option value="ipv4">IPv4</option>
            <option value="ipv6">IPv6</option>
          </select>
          <select
            className="h-8 rounded-md border border-border bg-background px-2 text-[12px]"
            value={targetType}
            onChange={(e) => setTargetType(e.target.value)}
          >
            <option value="">Target: todos</option>
            <option value="origin">Origin</option>
            <option value="customer">Import cliente</option>
          </select>
          <Input
            placeholder="Buscar policy, prefixo, community…"
            className="h-8 w-56 text-[12px]"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <Button
            size="sm"
            variant="outline"
            onClick={handleRefresh}
            disabled={runDiscovery.isPending}
          >
            <RefreshCw className={`mr-2 h-3.5 w-3.5 ${runDiscovery.isPending ? "animate-spin" : ""}`} />
            {runDiscovery.isPending ? "Coletando…" : "Atualizar"}
          </Button>
        </div>
      </div>

      {matrixQuery.data?.meta ? (
        <div className="flex flex-wrap gap-2 text-[11px]">
          <Badge variant="outline" className="bg-sky-500/10 text-sky-200">Read-only</Badge>
          <Badge variant="secondary">Fonte: {matrixQuery.data.meta.source}</Badge>
          {matrixQuery.data.meta.collectionAgeMinutes != null ? (
            <Badge variant={matrixQuery.data.meta.collectionAgeMinutes > 30 ? "destructive" : "outline"}>
              Coleta: {matrixQuery.data.meta.collectionAgeMinutes} min atrás
            </Badge>
          ) : null}
        </div>
      ) : null}

      <Tabs defaultValue="matrix">
        <TabsList className="h-8">
          <TabsTrigger value="matrix" className="text-[12px]">Matriz</TabsTrigger>
          <TabsTrigger value="audit" className="text-[12px]">Auditoria Upstreams</TabsTrigger>
          <TabsTrigger value="sets" className="text-[12px]">Community Sets</TabsTrigger>
          <TabsTrigger value="plans" className="text-[12px]">Change Plans</TabsTrigger>
        </TabsList>

        <TabsContent value="matrix" className="mt-3 space-y-3">
          {matrixQuery.isLoading ? (
            <div className="text-sm text-muted-foreground">Carregando matriz…</div>
          ) : matrixQuery.isError ? (
            <div className="rounded-md border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-200">
              {String(matrixQuery.error)}
              <p className="mt-2 text-[11px] text-red-200/80">
                Execute discovery ou config collection no device para popular snapshots.
              </p>
            </div>
          ) : matrixQuery.data ? (
            <>
              <AnnouncementMatrixTable
                rows={visibleRows}
                upstreams={matrixQuery.data.upstreams}
                onCellClick={handleCellSelect}
              />
              <AnnouncementEvidencePanel
                evidence={evidenceQuery.data ?? null}
                loading={evidenceQuery.isLoading}
              />
            </>
          ) : null}
        </TabsContent>

        <TabsContent value="audit" className="mt-3 space-y-3">
          {auditQuery.isLoading ? (
            <div className="text-sm text-muted-foreground">Carregando auditoria…</div>
          ) : auditQuery.data ? (
            <div className="grid gap-3">
              <div className="text-[12px] text-muted-foreground">
                Local-AS detectado: {auditQuery.data.localAs ?? "—"}
              </div>
              {auditQuery.data.upstreams.map((up) => (
                <Card key={up.circuitId} className="border-border bg-card/50">
                  <CardHeader className="py-3">
                    <CardTitle className="text-[13px]">
                      {up.displayName}
                      <span className="ml-2 font-mono text-[11px] text-muted-foreground">C{up.circuitId}</span>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2 pb-3 text-[11px]">
                    <div className="text-muted-foreground">Export: {up.exportPolicyName ?? "—"}</div>
                    {up.rules.map((rule, idx) => (
                      <div key={idx} className="flex flex-wrap items-center gap-2">
                        <Badge variant="outline">{rule.label}</Badge>
                        <span className="font-mono text-muted-foreground">{rule.communityValue}</span>
                        <span className={rule.status === "critical" ? "text-red-300" : rule.status === "warning" ? "text-amber-200" : "text-emerald-300"}>
                          {rule.status}
                        </span>
                      </div>
                    ))}
                    {up.findings.map((f) => (
                      <div key={f.code} className="text-amber-200/90">[{f.severity}] {f.message}</div>
                    ))}
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : null}
        </TabsContent>

        <TabsContent value="sets" className="mt-3 space-y-3">
          <div className="flex justify-end">
            <Button
              size="sm"
              variant="outline"
              onClick={() => void syncCommunitySets(deviceId).then(() => setsQuery.refetch())}
            >
              Reindexar do discovery
            </Button>
          </div>
          <div className="overflow-auto rounded-lg border border-border">
            <table className="w-full text-left text-[12px]">
              <thead className="bg-muted/30 text-[11px] uppercase text-muted-foreground">
                <tr>
                  <th className="px-3 py-2">Nome</th>
                  <th className="px-3 py-2">Communities</th>
                  <th className="px-3 py-2">Hash</th>
                </tr>
              </thead>
              <tbody>
                {(setsQuery.data ?? []).map((set) => (
                  <tr key={set.id} className="border-t border-border/60">
                    <td className="px-3 py-2 font-mono">{set.name}</td>
                    <td className="px-3 py-2 font-mono text-[10px] text-muted-foreground">
                      {(set.communitiesJson ?? []).join(" ")}
                    </td>
                    <td className="px-3 py-2 font-mono text-[10px]">{set.normalizedHash.slice(0, 12)}…</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </TabsContent>

        <TabsContent value="plans" className="mt-3">
          <div className="overflow-auto rounded-lg border border-border">
            <table className="w-full text-left text-[12px]">
              <thead className="bg-muted/30 text-[11px] uppercase text-muted-foreground">
                <tr>
                  <th className="px-3 py-2">ID</th>
                  <th className="px-3 py-2">Target</th>
                  <th className="px-3 py-2">Upstream</th>
                  <th className="px-3 py-2">Mudança</th>
                  <th className="px-3 py-2">Risco</th>
                  <th className="px-3 py-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {(plansQuery.data ?? []).map((plan) => (
                  <tr key={plan.id} className="border-t border-border/60">
                    <td className="px-3 py-2">{plan.id}</td>
                    <td className="px-3 py-2 font-mono text-[11px]">{plan.targetPolicyName} #{plan.node}</td>
                    <td className="px-3 py-2">{plan.upstreamName ?? plan.upstreamCircuitId}</td>
                    <td className="px-3 py-2">{plan.oldState ?? "—"} → {plan.newState}</td>
                    <td className="px-3 py-2 capitalize">{plan.riskLevel}</td>
                    <td className="px-3 py-2">
                      <Badge variant="outline">{plan.status}</Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {(plansQuery.data ?? []).length === 0 ? (
              <div className="p-4 text-center text-[12px] text-muted-foreground">
                Nenhum plano draft. Gere preview na matriz e clique em &quot;Criar plano&quot;.
              </div>
            ) : null}
          </div>
        </TabsContent>
      </Tabs>

      <AnnouncementEditModal
        open={Boolean(editRow && editCircuitId)}
        onOpenChange={(open) => {
          if (!open) {
            setEditRow(null);
            setEditCircuitId(null);
          }
        }}
        row={editRow}
        circuitId={editCircuitId}
        upstreamName={upstreamName}
        onPreview={(newState) =>
          previewAnnouncementChange({
            deviceId,
            targetPolicyName: editRow!.routePolicyName,
            node: editRow!.node,
            family: editRow!.family,
            upstreamCircuitId: editCircuitId!,
            newState,
          })
        }
        onSavePlan={async (preview: PreviewChangeResponse, newState: string) => {
          await createChangePlan({
            deviceId,
            preview,
            upstreamCircuitId: editCircuitId!,
            upstreamName: upstreamName ?? editCircuitId!,
            targetType: editRow!.targetType,
            family: editRow!.family,
            newState,
          });
          toast({ title: "Plano draft salvo", description: "Sem execução no equipamento." });
          void plansQuery.refetch();
        }}
      />
    </div>
  );
}
