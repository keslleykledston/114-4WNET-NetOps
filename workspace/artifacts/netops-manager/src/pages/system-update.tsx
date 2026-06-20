import { useEffect, useMemo, useState } from "react";
import {
  cancelSystemUpdateRun,
  checkSystemUpdate,
  getSystemUpdateRunSteps,
  getSystemUpdateStatus,
  listSystemUpdateRuns,
  rollbackSystemUpdateRun,
  runSystemUpdate,
  type SystemUpdateRun,
  type SystemUpdateRunStep,
  type SystemUpdateStatusSnapshot,
} from "@/lib/system-update-api";
import { useAuth } from "@/components/auth-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import {
  AlertTriangle,
  ArrowUpDown,
  CheckCircle2,
  ClipboardCopy,
  Clock3,
  CircleAlert,
  History,
  Loader2,
  PlayCircle,
  RefreshCw,
  RotateCcw,
  ShieldAlert,
  ShieldCheck,
  Slash,
} from "lucide-react";

const CHANNEL_LABELS: Record<string, string> = {
  stable: "Stable",
  staging: "Staging",
  nightly: "Nightly",
};

const STEP_LABELS: Record<string, string> = {
  precheck: "Pré-check",
  backup: "Backup",
  git_fetch: "Git fetch",
  checkout_target: "Checkout",
  build_backend: "Build backend",
  build_frontend: "Build frontend",
  tests: "Testes",
  migrations: "Migrations",
  restart: "Restart",
  healthcheck: "Healthcheck",
  validation: "Validação",
  finalize: "Concluir",
};

function shortCommit(value?: string | null) {
  if (!value) return "-";
  return value.slice(0, 8);
}

function fmtDate(value?: string | null) {
  if (!value) return "-";
  return new Date(value).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

function statusTone(status?: string | null) {
  if (!status) return "outline";
  if (["success", "updated", "installed", "rolled_back"].includes(status)) return "default";
  if (["running", "pending", "update_available", "update_in_progress", "rollback_in_progress"].includes(status)) return "secondary";
  return "destructive";
}

function stepTone(status?: string | null) {
  if (status === "success") return "default";
  if (status === "running" || status === "pending") return "secondary";
  if (status === "skipped") return "outline";
  return "destructive";
}

function buildTicketSummary(status: SystemUpdateStatusSnapshot | null, lastRun: SystemUpdateRun | null, selectedRun: SystemUpdateRun | null) {
  return [
    `Sistema: ${status?.current.version ?? "-"}`,
    `Commit atual: ${shortCommit(status?.current.commit)}`,
    `Último update: ${lastRun?.status ?? "-"}`,
    `Run selecionado: #${selectedRun?.id ?? "-"}`,
    `Canal: ${lastRun?.channel ?? status?.lastCheck?.channel ?? "-"}`,
  ].join("\n");
}

export default function SystemUpdatePage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [status, setStatus] = useState<SystemUpdateStatusSnapshot | null>(null);
  const [runs, setRuns] = useState<SystemUpdateRun[]>([]);
  const [selectedRunId, setSelectedRunId] = useState<number | null>(null);
  const [selectedRunSteps, setSelectedRunSteps] = useState<SystemUpdateRunStep[]>([]);
  const [loading, setLoading] = useState(true);
  const [checking, setChecking] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [rollbacking, setRollbacking] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmAccepted, setConfirmAccepted] = useState(false);
  const [channel, setChannel] = useState<"stable" | "staging" | "nightly">("stable");
  const [detailRun, setDetailRun] = useState<SystemUpdateRun | null>(null);

  const selectedRun = useMemo(() => runs.find((run) => run.id === selectedRunId) ?? runs[0] ?? null, [runs, selectedRunId]);
  const latestCheck = status?.lastCheck as any;
  const updateAvailable = Boolean(latestCheck?.updateAvailable);
  const latestRunningRun = runs.find((run) => run.status === "running" || run.status === "pending") ?? null;

  async function refreshAll() {
    const [nextStatus, nextRuns] = await Promise.all([getSystemUpdateStatus(), listSystemUpdateRuns()]);
    setStatus(nextStatus);
    setRuns(nextRuns);
    if (!selectedRunId && nextRuns.length > 0) {
      setSelectedRunId(nextRuns[0].id);
    }
    setLoading(false);
  }

  async function refreshSelectedRun(runId: number) {
    const steps = await getSystemUpdateRunSteps(runId);
    setSelectedRunSteps(steps);
  }

  useEffect(() => {
    void refreshAll().catch((error) => {
      toast({
        title: "Falha ao carregar update",
        description: error instanceof Error ? error.message : "Erro inesperado",
        variant: "destructive",
      });
      setLoading(false);
    });
  }, [toast]);

  useEffect(() => {
    if (!selectedRun?.id) return;
    void refreshSelectedRun(selectedRun.id).catch(() => setSelectedRunSteps([]));
  }, [selectedRun?.id]);

  useEffect(() => {
    if (!latestRunningRun?.id || typeof window === "undefined" || !window.EventSource) return;
    const source = new EventSource(`/api/system/update/events/${latestRunningRun.id}`);
    source.addEventListener("update", () => {
      void refreshAll().catch(() => undefined);
      void refreshSelectedRun(latestRunningRun.id).catch(() => undefined);
    });
    source.onerror = () => {
      source.close();
    };
    return () => source.close();
  }, [latestRunningRun?.id]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      void refreshAll().catch(() => undefined);
      if (selectedRun?.id) {
        void refreshSelectedRun(selectedRun.id).catch(() => undefined);
      }
    }, 30_000);
    return () => window.clearInterval(timer);
  }, [selectedRun?.id]);

  async function handleCheck() {
    setChecking(true);
    try {
      await checkSystemUpdate(channel);
      await refreshAll();
      toast({ title: "Checagem concluída" });
    } catch (error) {
      toast({
        title: "Falha na checagem",
        description: error instanceof Error ? error.message : "Erro inesperado",
        variant: "destructive",
      });
    } finally {
      setChecking(false);
    }
  }

  async function handleRun() {
    setUpdating(true);
    try {
      const result = await runSystemUpdate(channel);
      setSelectedRunId(result.run.id);
      await refreshAll();
      await refreshSelectedRun(result.run.id);
      toast({
        title: result.started ? "Update iniciado" : "Update abortado",
        description: result.started ? `Run #${result.run.id}` : result.run.failureReason ?? "Sem update disponível",
      });
    } catch (error) {
      toast({
        title: "Falha no update",
        description: error instanceof Error ? error.message : "Erro inesperado",
        variant: "destructive",
      });
    } finally {
      setUpdating(false);
      setConfirmOpen(false);
      setConfirmAccepted(false);
    }
  }

  async function handleRollback(runId: number) {
    setRollbacking(true);
    try {
      const result = await rollbackSystemUpdateRun(runId);
      setSelectedRunId(result.id);
      await refreshAll();
      await refreshSelectedRun(result.id);
      toast({ title: "Rollback executado" });
    } catch (error) {
      toast({
        title: "Falha no rollback",
        description: error instanceof Error ? error.message : "Erro inesperado",
        variant: "destructive",
      });
    } finally {
      setRollbacking(false);
    }
  }

  async function handleCancel(runId: number) {
    try {
      await cancelSystemUpdateRun(runId);
      await refreshAll();
      await refreshSelectedRun(runId);
      toast({ title: "Update cancelado" });
    } catch (error) {
      toast({
        title: "Falha ao cancelar",
        description: error instanceof Error ? error.message : "Erro inesperado",
        variant: "destructive",
      });
    }
  }

  async function copyTicketSummary() {
    const summary = buildTicketSummary(status, status?.lastRun ?? null, selectedRun);
    await navigator.clipboard.writeText(summary);
    toast({ title: "Resumo copiado" });
  }

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center text-sm text-muted-foreground">
        Carregando atualização...
      </div>
    );
  }

  const current = status?.current;
  const lastRun = status?.lastRun ?? runs[0] ?? null;
  const lastRollback = status?.lastRollbackRun ?? runs.find((run) => run.status === "rolled_back") ?? null;
  const currentSteps = selectedRunSteps.length > 0 ? selectedRunSteps : selectedRun?.steps ?? [];
  const hasBlockingState = Boolean(latestRunningRun);
  const canStartUpdate = Boolean(user?.role === "admin" && updateAvailable && !hasBlockingState);
  const canRollbackSelectedRun = Boolean(user?.role === "admin" && selectedRun && ["success", "failed", "rollback_failed", "rolled_back"].includes(selectedRun.status));
  const summaryChangelog = latestCheck?.changelog ? latestCheck.changelog.split("\n").slice(0, 8).join("\n") : "Sem changelog retornado.";

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-xs uppercase tracking-[0.24em] text-muted-foreground">
            <ShieldCheck className="h-4 w-4" />
            Administração
          </div>
          <h1 className="text-3xl font-bold tracking-tight">Atualização do Sistema</h1>
          <p className="max-w-2xl text-sm text-muted-foreground">
            Gerencie versionamento, atualização e rollback do 4WNET_NETOPS com segurança.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => void refreshAll()} disabled={checking || updating}>
            <RefreshCw className="mr-2 h-4 w-4" />
            Atualizar visão
          </Button>
          <Button variant="outline" onClick={() => void handleCheck()} disabled={checking || updating}>
            {checking ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ArrowUpDown className="mr-2 h-4 w-4" />}
            Verificar nova versão
          </Button>
          <Button onClick={() => setConfirmOpen(true)} disabled={!canStartUpdate}>
            <PlayCircle className="mr-2 h-4 w-4" />
            Atualizar agora
          </Button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <Card>
          <CardHeader className="pb-3">
            <CardDescription>Versão instalada</CardDescription>
            <CardTitle className="text-xl">{current?.version ?? "-"}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-muted-foreground">
            <div>Commit: {shortCommit(current?.commit)}</div>
            <div>Branch: {current?.branch ?? "-"}</div>
            <div>Tag: {current?.tag ?? "-"}</div>
            <div>Ambiente: {current?.source ?? "-"}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardDescription>Última versão disponível</CardDescription>
            <CardTitle className="text-xl">{latestCheck?.remoteVersion ?? current?.version ?? "-"}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-muted-foreground">
            <div>Commit remoto: {shortCommit(latestCheck?.remoteCommit as string | undefined)}</div>
            <div>Canal: {CHANNEL_LABELS[latestCheck?.channel ?? channel] ?? latestCheck?.channel ?? channel}</div>
            <div>Risco: <Badge variant={statusTone(latestCheck?.riskLevel)}>{latestCheck?.riskLevel ?? "n/a"}</Badge></div>
            <div>Atualização: <Badge variant={statusTone(lastRun?.status)}>{status?.state ?? lastRun?.status ?? "n/a"}</Badge></div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardDescription>Status do sistema</CardDescription>
            <CardTitle className="text-xl">{status?.state ?? "unknown"}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-muted-foreground">
            <div>Última checagem: {fmtDate(status?.lastCheck?.createdAt as string | undefined)}</div>
            <div>Último update: {fmtDate(lastRun?.finishedAt ?? lastRun?.startedAt)}</div>
            <div>Último rollback: {fmtDate(lastRollback?.rollbackFinishedAt ?? lastRollback?.finishedAt)}</div>
            <div>Canal configurado: {CHANNEL_LABELS[channel] ?? channel}</div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.5fr_1fr]">
        <Card>
          <CardHeader>
            <CardTitle>Fluxo atual</CardTitle>
            <CardDescription>Versão atual, changelog e impacto principal antes de atualizar.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-lg border border-border bg-muted/20 p-4 text-sm">
              <div className="mb-2 font-medium">Resumo da nova versão</div>
              <pre className="whitespace-pre-wrap text-xs text-muted-foreground">{summaryChangelog}</pre>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <div className="rounded-lg border p-3">
                <div className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Migrations pendentes</div>
                <div className="mt-2 text-sm">{latestCheck?.migrationsPending?.length ? latestCheck.migrationsPending.join(", ") : "Nenhuma detectada"}</div>
              </div>
              <div className="rounded-lg border p-3">
                <div className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Arquivos de impacto</div>
                <div className="mt-2 text-sm">
                  {latestCheck?.highImpactFiles?.length
                    ? latestCheck.highImpactFiles.map((file: { path: string; impact: string }) => `${file.path} (${file.impact})`).join("\n")
                    : "Nenhum arquivo crítico detectado"}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-3 rounded-lg border p-3">
              <Progress value={updateAvailable ? 100 : 0} className="h-2 flex-1" />
              <span className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
                {updateAvailable ? "update disponível" : "sistema atualizado"}
              </span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Ações</CardTitle>
            <CardDescription>Executa verificação, update e rollback com lock global.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex flex-col gap-2">
              <Button className="justify-start" variant="outline" onClick={() => void handleCheck()} disabled={checking || updating}>
                {checking ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ArrowUpDown className="mr-2 h-4 w-4" />}
                Verificar nova versão
              </Button>
              <Button className="justify-start" onClick={() => setConfirmOpen(true)} disabled={!canStartUpdate}>
                <PlayCircle className="mr-2 h-4 w-4" />
                Atualizar agora
              </Button>
              <Button className="justify-start" variant="secondary" onClick={() => void copyTicketSummary()}>
                <ClipboardCopy className="mr-2 h-4 w-4" />
                Copiar resumo para ticket
              </Button>
              {canRollbackSelectedRun ? (
                <Button className="justify-start" variant="outline" onClick={() => selectedRun?.id ? void handleRollback(selectedRun.id) : undefined} disabled={!selectedRun || rollbacking}>
                  {rollbacking ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RotateCcw className="mr-2 h-4 w-4" />}
                  Rollback manual
                </Button>
              ) : null}
            </div>
            <Separator />
            <div className="space-y-2 text-sm text-muted-foreground">
              <div>Usuário: {user?.name ?? "-"}</div>
              <div>Permissão: {user?.role ?? "-"}</div>
              <div>Lock: {latestRunningRun ? `ativo (#${latestRunningRun.id})` : "livre"}</div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Progresso da execução</CardTitle>
          <CardDescription>Timeline do run selecionado ou do último update em andamento.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap gap-2">
            {currentSteps.map((step) => (
              <Badge key={step.id} variant={stepTone(step.status)} className="px-3 py-1 text-xs">
                {STEP_LABELS[step.stepName] ?? step.stepName}
                <span className="ml-2 opacity-70">{step.status}</span>
              </Badge>
            ))}
            {currentSteps.length === 0 ? <div className="text-sm text-muted-foreground">Sem etapas ainda.</div> : null}
          </div>
          <div className="space-y-3">
            {currentSteps.map((step) => (
              <div key={step.id} className="rounded-lg border p-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="font-medium">{STEP_LABELS[step.stepName] ?? step.stepName}</div>
                  <Badge variant={stepTone(step.status)}>{step.status}</Badge>
                </div>
                <div className="mt-2 grid gap-2 text-xs text-muted-foreground md:grid-cols-3">
                  <div>Início: {fmtDate(step.startedAt)}</div>
                  <div>Fim: {fmtDate(step.finishedAt)}</div>
                  <div>Duração: {step.durationMs != null ? `${step.durationMs} ms` : "-"}</div>
                </div>
                {step.errorMessage ? <div className="mt-2 text-sm text-destructive">{step.errorMessage}</div> : null}
                {step.sanitizedOutput ? <pre className="mt-2 whitespace-pre-wrap rounded bg-muted p-2 text-xs">{step.sanitizedOutput}</pre> : null}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <History className="h-4 w-4" />
            Histórico
          </CardTitle>
          <CardDescription>Execuções anteriores, com rollback e motivo de falha.</CardDescription>
        </CardHeader>
        <CardContent>
          <ScrollArea className="h-[360px] pr-4">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Data</TableHead>
                  <TableHead>Usuário</TableHead>
                  <TableHead>Versão</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Duração</TableHead>
                  <TableHead>Rollback</TableHead>
                  <TableHead>Falha</TableHead>
                  <TableHead>Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {runs.map((run) => (
                  <TableRow key={run.id} className="cursor-pointer" onClick={() => setSelectedRunId(run.id)}>
                    <TableCell>{fmtDate(run.createdAt)}</TableCell>
                    <TableCell>{run.requestedBy ?? "-"}</TableCell>
                    <TableCell>
                      <div className="text-sm font-medium">{shortCommit(run.fromCommit)} → {shortCommit(run.toCommit)}</div>
                      <div className="text-xs text-muted-foreground">{run.fromVersion} → {run.toVersion}</div>
                    </TableCell>
                    <TableCell><Badge variant={statusTone(run.status)}>{run.status}</Badge></TableCell>
                    <TableCell>{run.startedAt && run.finishedAt ? `${Math.max(0, new Date(run.finishedAt).getTime() - new Date(run.startedAt).getTime())} ms` : "-"}</TableCell>
                    <TableCell>{run.rollbackStatus ?? "-"}</TableCell>
                    <TableCell>{run.failureReason ?? "-"}</TableCell>
                    <TableCell>
                      <Button variant="ghost" size="sm" onClick={() => setDetailRun(run)}>
                        Detalhes
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
                {runs.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center text-muted-foreground">Nenhum run registrado.</TableCell>
                  </TableRow>
                ) : null}
              </TableBody>
            </Table>
          </ScrollArea>
        </CardContent>
      </Card>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Confirmar update</DialogTitle>
            <DialogDescription>
              {current?.version ?? "-"} → {latestCheck?.remoteVersion ?? "-"}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 text-sm">
            <div className="rounded-lg border p-3">
              <div className="font-medium">Impacto esperado</div>
              <div className="mt-1 text-muted-foreground">
                {latestCheck?.riskLevel ? `Risco ${latestCheck.riskLevel}` : "Risco não calculado."}
              </div>
            </div>
            <div className="rounded-lg border p-3">
              <div className="font-medium">Plano de rollback</div>
              <div className="mt-1 text-muted-foreground">
                Rollback automático via checkout do commit anterior, restauração de backup e healthcheck final.
              </div>
            </div>
            <div className="flex items-start gap-3 rounded-lg border border-destructive/30 bg-destructive/5 p-3">
              <Checkbox checked={confirmAccepted} onCheckedChange={(checked) => setConfirmAccepted(Boolean(checked))} />
              <div className="text-sm">
                Entendo que o sistema poderá reiniciar serviços e que rollback automático será executado em caso de falha.
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmOpen(false)}>Cancelar</Button>
            <Button onClick={() => void handleRun()} disabled={!confirmAccepted || updating}>
              {updating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <PlayCircle className="mr-2 h-4 w-4" />}
              Executar update
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(detailRun)} onOpenChange={(open) => !open && setDetailRun(null)}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Detalhes técnicos do run #{detailRun?.id ?? "-"}</DialogTitle>
            <DialogDescription>
              Commit anterior {shortCommit(detailRun?.fromCommit)} → commit novo {shortCommit(detailRun?.toCommit)}
            </DialogDescription>
          </DialogHeader>
          <ScrollArea className="max-h-[60vh] pr-4">
            <div className="space-y-4 text-sm">
              <div className="grid gap-3 md:grid-cols-2">
                <div className="rounded-lg border p-3">
                  <div className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Status</div>
                  <div className="mt-1 font-medium">{detailRun?.status}</div>
                </div>
                <div className="rounded-lg border p-3">
                  <div className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Backup</div>
                  <div className="mt-1 font-medium">{detailRun?.backups[0]?.path ?? "-"}</div>
                </div>
              </div>
              <div className="rounded-lg border p-3">
                <div className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Logs sanitizados</div>
                <pre className="mt-2 whitespace-pre-wrap text-xs text-muted-foreground">
                  {detailRun?.steps.map((step) => `${STEP_LABELS[step.stepName] ?? step.stepName}: ${step.sanitizedOutput ?? step.errorMessage ?? "-"}`).join("\n\n") ?? "-"}
                </pre>
              </div>
            </div>
          </ScrollArea>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDetailRun(null)}>Fechar</Button>
            <Button onClick={() => void copyTicketSummary()} variant="secondary">
              <ClipboardCopy className="mr-2 h-4 w-4" />
              Copiar resumo para ticket
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
