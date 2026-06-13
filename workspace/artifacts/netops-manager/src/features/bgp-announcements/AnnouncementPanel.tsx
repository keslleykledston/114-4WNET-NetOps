import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Device } from "@workspace/api-client-react";
import { useState } from "react";
import { Database, RefreshCw } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useToast } from "@/hooks/use-toast";
import { AnnouncementMatrixTable } from "@/features/bgp-announcements/AnnouncementMatrixTable";
import { ChangePreviewModal } from "@/features/bgp-announcements/ChangePreviewModal";
import { AnnouncementEvidencePanel } from "@/features/bgp-announcements/AnnouncementEvidencePanel";
import { SnapshotHistoryPanel } from "@/features/bgp-announcements/SnapshotHistoryPanel";
import { SnapshotDiffSummaryCard } from "@/features/bgp-announcements/SnapshotDiffPanel";
import { GlobalDependenciesPanel } from "@/features/bgp-announcements/GlobalDependenciesPanel";
import { ConflictsPanel } from "@/features/bgp-announcements/ConflictsPanel";
import {
  createAnnouncementChangePreview,
  createChangePlanFromPreview,
  fetchAnnouncementFeature,
  fetchAnnouncementMatrix,
  fetchMatrixSnapshots,
  fetchSnapshotDiff,
  fetchTargetEvidence,
  fetchUpstreamAudit,
  refreshMatrixSnapshot,
} from "@/features/bgp-announcements/announcement-api";
import type { MatrixRow, SnapshotDiffFilter } from "@/features/bgp-announcements/announcement-types";

interface AnnouncementPanelProps {
  device: Device;
}

function isNoSnapshotError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  return /no matrix snapshot|no snapshot|insufficient persisted|404/i.test(error.message);
}

function isFeatureDisabledError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  return /disabled|503/i.test(error.message);
}

function formatSnapshotTime(iso: string | undefined | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("pt-BR");
  } catch {
    return iso;
  }
}

export function AnnouncementPanel({ device }: AnnouncementPanelProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const deviceId = device.id;
  const [search, setSearch] = useState("");
  const [family, setFamily] = useState("");
  const [targetType, setTargetType] = useState("");
  const [selectedSnapshotId, setSelectedSnapshotId] = useState<number | null>(null);
  const [previewRow, setPreviewRow] = useState<MatrixRow | null>(null);
  const [editCircuitId, setEditCircuitId] = useState<string | null>(null);
  const [selectedCell, setSelectedCell] = useState<{ targetKey: string; circuitId: string } | null>(null);
  const [diffFilter, setDiffFilter] = useState<SnapshotDiffFilter>("all");
  const [compareBaseId, setCompareBaseId] = useState<number | null>(null);
  const [compareTargetId, setCompareTargetId] = useState<number | null>(null);
  const [activeTab, setActiveTab] = useState("editable");

  const featureQuery = useQuery({
    queryKey: ["bgp-announcement-feature"],
    queryFn: fetchAnnouncementFeature,
  });

  const matrixEnabled = featureQuery.data?.enabled !== false;

  const snapshotsQuery = useQuery({
    queryKey: ["bgp-announcement-snapshots", deviceId],
    queryFn: () => fetchMatrixSnapshots(deviceId),
    enabled: matrixEnabled,
  });

  const activeSnapshotId = selectedSnapshotId ?? snapshotsQuery.data?.snapshots[0]?.id ?? null;

  const snapshotList = snapshotsQuery.data?.snapshots ?? [];
  const latestPairBase = snapshotList.length >= 2 ? snapshotList[1]?.id : null;
  const latestPairCompare = snapshotList.length >= 2 ? snapshotList[0]?.id : null;

  const latestDiffQuery = useQuery({
    queryKey: ["bgp-announcement-snapshot-diff-latest-pair", latestPairBase, latestPairCompare],
    queryFn: () => fetchSnapshotDiff(latestPairBase!, latestPairCompare!),
    enabled: matrixEnabled && latestPairBase != null && latestPairCompare != null,
  });

  const manualDiffQuery = useQuery({
    queryKey: ["bgp-announcement-snapshot-diff", compareBaseId, compareTargetId],
    queryFn: () => fetchSnapshotDiff(compareBaseId!, compareTargetId!),
    enabled: matrixEnabled && compareBaseId != null && compareTargetId != null,
  });

  const matrixQuery = useQuery({
    queryKey: ["bgp-announcement-matrix", deviceId, search, family, targetType, activeSnapshotId],
    queryFn: () => fetchAnnouncementMatrix(deviceId, {
      search: search || undefined,
      family: family || undefined,
      targetType: targetType || undefined,
      snapshotId: activeSnapshotId ?? undefined,
    }),
    enabled: matrixEnabled,
    retry: false,
  });

  const refreshMutation = useMutation({
    mutationFn: () => refreshMatrixSnapshot(deviceId),
    onSuccess: async (result) => {
      setSelectedSnapshotId(result.snapshotId);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["bgp-announcement-snapshots", deviceId] }),
        queryClient.invalidateQueries({ queryKey: ["bgp-announcement-matrix", deviceId] }),
        queryClient.invalidateQueries({ queryKey: ["bgp-community-sets", deviceId] }),
      ]);
      toast({
        title: "Matriz atualizada",
        description: `Snapshot #${result.snapshotId} gerado a partir dos dados persistidos (${result.status}).`,
        variant: result.status === "ok" ? "default" : "destructive",
      });
    },
    onError: (error) => {
      toast({
        title: "Falha ao atualizar matriz",
        description: error instanceof Error ? error.message : "Não foi possível gerar snapshot.",
        variant: "destructive",
      });
    },
  });

  const evidenceQuery = useQuery({
    queryKey: ["bgp-announcement-evidence", deviceId, selectedCell?.targetKey, selectedCell?.circuitId],
    queryFn: () => fetchTargetEvidence(deviceId, selectedCell!.targetKey, selectedCell!.circuitId),
    enabled: matrixEnabled && selectedCell != null,
  });

  const auditQuery = useQuery({
    queryKey: ["bgp-upstream-audit", deviceId],
    queryFn: () => fetchUpstreamAudit(deviceId),
    enabled: matrixEnabled && featureQuery.data?.upstreamAuditEnabled !== false,
  });

  const previewEnabled = featureQuery.data?.previewEnabled !== false;

  const semanticView = matrixQuery.data?.semanticView;
  const editableRows = matrixQuery.data?.rows.filter((row) => {
    if (row.targetEditMode && row.targetEditMode !== "editable_future") return false;
    if (/export/i.test(row.routePolicyName)) return false;
    return row.targetType === "origin" || row.targetType === "customer";
  }) ?? [];

  const noSnapshot = matrixQuery.isError && isNoSnapshotError(matrixQuery.error);
  const meta = matrixQuery.data?.meta;
  const counters = meta?.counters;

  function handleCellSelect(row: MatrixRow, circuitId: string) {
    setSelectedCell({ targetKey: row.targetKey, circuitId });
    setEditCircuitId(circuitId);
    setPreviewRow(row);
  }

  async function handleReloadData() {
    await Promise.all([
      matrixQuery.refetch(),
      snapshotsQuery.refetch(),
      evidenceQuery.refetch(),
      auditQuery.refetch(),
    ]);
    toast({
      title: "Recarregado",
      description: "Refetch do snapshot atual — sem recompilação.",
    });
  }

  if (featureQuery.isLoading) {
    return <div className="text-sm text-muted-foreground">Verificando feature flag…</div>;
  }

  if (!matrixEnabled || (matrixQuery.isError && isFeatureDisabledError(matrixQuery.error))) {
    return (
      <Alert variant="destructive" className="border-amber-500/40 bg-amber-500/10">
        <AlertTitle>BGP Announcement Matrix desabilitado</AlertTitle>
        <AlertDescription>
          O módulo está off via <code className="text-[11px]">BGP_ANNOUNCEMENT_MATRIX_ENABLED=false</code>.
          Nenhuma coleta ou execução será disparada nesta fase.
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold text-foreground">Anúncios (matriz)</h3>
          <p className="text-[12px] text-muted-foreground">
            Read-only — origin/cliente para edição futura; upstreams só em auditoria. Sem SSH/SNMP neste painel.
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
            onClick={() => void handleReloadData()}
            disabled={matrixQuery.isFetching}
          >
            <RefreshCw className={`mr-2 h-3.5 w-3.5 ${matrixQuery.isFetching ? "animate-spin" : ""}`} />
            Recarregar
          </Button>
          <Button
            size="sm"
            onClick={() => refreshMutation.mutate()}
            disabled={refreshMutation.isPending}
          >
            <Database className={`mr-2 h-3.5 w-3.5 ${refreshMutation.isPending ? "animate-spin" : ""}`} />
            {refreshMutation.isPending ? "Atualizando…" : "Atualizar matriz"}
          </Button>
        </div>
      </div>

      {meta ? (
        <Card className="border-border bg-card/40">
          <CardContent className="space-y-3 py-4">
            <div className="flex flex-wrap gap-2 text-[11px]">
              <Badge variant="outline" className="bg-sky-500/10 text-sky-200">Read-only</Badge>
              <Badge variant="secondary">Origem: dados persistidos</Badge>
              <Badge variant="outline">Fonte base: {meta.dataSource ?? meta.source}</Badge>
              {meta.snapshotId ? (
                <Badge variant="outline">Snapshot #{meta.snapshotId}</Badge>
              ) : null}
              {meta.status ? (
                <Badge variant={meta.status === "ok" ? "outline" : "destructive"} className="capitalize">
                  {meta.status}
                </Badge>
              ) : null}
            </div>
            <div className="grid gap-2 text-[12px] text-muted-foreground sm:grid-cols-2 lg:grid-cols-4">
              <div>Timestamp: <span className="text-foreground">{formatSnapshotTime(meta.snapshotCreatedAt ?? matrixQuery.data?.generatedAt)}</span></div>
              {counters ? (
                <>
                  <div>Origin: <span className="text-foreground">{counters.originTargets}</span></div>
                  <div>Clientes: <span className="text-foreground">{counters.customerTargets}</span></div>
                  <div>Upstreams: <span className="text-foreground">{counters.upstreamCount}</span></div>
                  <div>Community sets: <span className="text-foreground">{counters.communitySetCount}</span></div>
                  <div>Policies: <span className="text-foreground">{counters.policyCount}</span></div>
                  <div>Conflitos: <span className="text-foreground">{counters.conflictCount}</span></div>
                </>
              ) : null}
              {semanticView ? (
                <>
                  <div>Editáveis (futuro): <span className="text-foreground">{semanticView.editableRowCount}</span></div>
                  <div>Globais protegidos: <span className="text-foreground">{semanticView.protectedGlobals.length}</span></div>
                  <div>Conflitos reais: <span className="text-foreground">{semanticView.realConflicts.length}</span></div>
                </>
              ) : null}
            </div>
            {(meta.warnings ?? []).length > 0 ? (
              <div className="space-y-1 rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-[11px] text-amber-100">
                {(meta.warnings ?? []).map((warning, index) => (
                  <div key={`${warning}-${index}`}>{warning}</div>
                ))}
              </div>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      {latestDiffQuery.data && latestDiffQuery.data.changes.length > 0 ? (
        <SnapshotDiffSummaryCard
          diff={latestDiffQuery.data}
          onOpenHistory={() => setActiveTab("history")}
        />
      ) : null}

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="h-8 flex-wrap">
          <TabsTrigger value="editable" className="text-[12px]">Clientes / ORIGIN</TabsTrigger>
          <TabsTrigger value="audit" className="text-[12px]">Auditoria Upstreams</TabsTrigger>
          <TabsTrigger value="globals" className="text-[12px]">Dependências Globais</TabsTrigger>
          <TabsTrigger value="conflicts" className="text-[12px]">Conflitos</TabsTrigger>
          <TabsTrigger value="history" className="text-[12px]">Histórico</TabsTrigger>
        </TabsList>

        <TabsContent value="editable" className="mt-3 space-y-3">
          <p className="text-[11px] text-muted-foreground">
            Foco em import policies de Cliente e ORIGIN — candidatas a edição futura. Export policies não entram aqui.
          </p>
          {matrixQuery.isLoading ? (
            <div className="text-sm text-muted-foreground">Carregando matriz…</div>
          ) : noSnapshot ? (
            <div className="rounded-md border border-dashed border-border bg-muted/20 p-8 text-center">
              <p className="text-sm font-medium text-foreground">Nenhum snapshot disponível</p>
              <p className="mt-2 text-[12px] text-muted-foreground">
                Use <strong className="text-foreground">Atualizar matriz</strong> para compilar a partir de discovery snapshot ou collected_config já persistidos.
              </p>
              <Button className="mt-4" size="sm" onClick={() => refreshMutation.mutate()} disabled={refreshMutation.isPending}>
                Atualizar matriz
              </Button>
            </div>
          ) : matrixQuery.isError ? (
            <div className="rounded-md border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-200">
              {String(matrixQuery.error)}
            </div>
          ) : matrixQuery.data ? (
            editableRows.length === 0 ? (
              <div className="rounded-md border border-dashed border-border bg-muted/20 p-8 text-center">
                <p className="text-sm font-medium text-foreground">Nenhum target Cliente/ORIGIN</p>
                <p className="mt-2 text-[12px] text-muted-foreground">
                  Upstreams e export policies estão na aba Auditoria. Objetos globais na aba Dependências Globais.
                </p>
              </div>
            ) : (
              <>
                <AnnouncementMatrixTable
                  rows={editableRows}
                  upstreams={matrixQuery.data.upstreams}
                  previewEnabled={previewEnabled}
                  onPreviewClick={(row) => setPreviewRow(row)}
                  onCellClick={handleCellSelect}
                />
                <AnnouncementEvidencePanel
                  evidence={evidenceQuery.data ?? null}
                  loading={evidenceQuery.isLoading}
                />
              </>
            )
          ) : null}
        </TabsContent>

        <TabsContent value="globals" className="mt-3">
          <GlobalDependenciesPanel semanticView={semanticView} />
        </TabsContent>

        <TabsContent value="conflicts" className="mt-3">
          <ConflictsPanel semanticView={semanticView} />
        </TabsContent>

        <TabsContent value="history" className="mt-3">
          <SnapshotHistoryPanel
            snapshots={snapshotList}
            activeSnapshotId={activeSnapshotId}
            loading={snapshotsQuery.isLoading}
            diff={manualDiffQuery.data ?? null}
            diffLoading={manualDiffQuery.isFetching}
            diffError={manualDiffQuery.error instanceof Error ? manualDiffQuery.error.message : null}
            diffFilter={diffFilter}
            onDiffFilterChange={setDiffFilter}
            onCompare={(baseId, compareId) => {
              setCompareBaseId(baseId);
              setCompareTargetId(compareId);
            }}
            onCloseDiff={() => {
              setCompareBaseId(null);
              setCompareTargetId(null);
            }}
            onOpenSnapshot={(snapshotId) => {
              setSelectedSnapshotId(snapshotId);
              void matrixQuery.refetch();
            }}
          />
        </TabsContent>

        <TabsContent value="audit" className="mt-3 space-y-3">
          <Alert className="border-amber-500/30 bg-amber-500/10">
            <AlertTitle>Auditoria somente</AlertTitle>
            <AlertDescription className="text-[12px]">
              Upstreams, provider, IX e CDN são audit_only — sem botão de preview editável nesta aba.
            </AlertDescription>
          </Alert>
          <p className="text-[11px] text-muted-foreground">
            Upstreams e export policies — somente auditoria read-only; não editável nesta matriz.
          </p>
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
          ) : (
            <div className="text-[12px] text-muted-foreground">Sem dados de auditoria upstream no snapshot.</div>
          )}
        </TabsContent>
      </Tabs>

      {previewEnabled ? (
        <ChangePreviewModal
          open={Boolean(previewRow)}
          onOpenChange={(open) => {
            if (!open) setPreviewRow(null);
          }}
          row={previewRow}
          deviceId={deviceId}
          snapshotId={activeSnapshotId}
          upstreams={matrixQuery.data?.upstreams ?? []}
          defaultCircuitId={editCircuitId}
          onGenerate={async (payload) =>
            createAnnouncementChangePreview({
              deviceId,
              snapshotId: activeSnapshotId ?? undefined,
              targetId: previewRow!.targetKey,
              actionType: payload.actionType,
              upstreamCircuitId: payload.upstreamCircuitId,
              newState: payload.newState,
              community: payload.community,
            })
          }
          planEnabled={previewEnabled}
          onCreatePlan={async (previewId, options) =>
            createChangePlanFromPreview(previewId, options)
          }
        />
      ) : null}
    </div>
  );
}
