import { useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  getListProvisioningJobsQueryKey,
  useCreateProvisioningJob,
  useCreateProvisioningReport,
  useExecuteProvisioningJob,
  useListDevices,
  useListProvisioningJobs,
  useValidateProvisioningJob,
} from "@workspace/api-client-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import {
  listProvisioningServiceTemplates,
  previewProvisioningConfig,
  previewProvisioningJobMarkdown,
  requestProvisioningApproval,
  cancelProvisioningJob,
  approveProvisioningJob,
  executeProvisioningJob,
  postcheckProvisioningJob,
  getRollbackPreview,
  rollbackProvisioningJob,
  type ProvisioningPreviewResult,
  type ProvisioningServiceTemplate,
  type ProvisioningJob,
} from "@/lib/provisioning-api";
import { ApprovalStatusCard } from "@/features/provisioning/approval-status-card";
import { ExecutionPlanCard } from "@/features/provisioning/execution-plan-card";
import { ExecutionResultTimeline } from "@/features/provisioning/execution-result-timeline";
import { PostcheckResultCard } from "@/features/provisioning/postcheck-result-card";
import { RollbackPreviewCard } from "@/features/provisioning/rollback-preview-card";
import { useAuth } from "@/components/auth-provider";
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  FileText,
  Loader2,
  Rocket,
  ShieldAlert,
} from "lucide-react";

const SERVICE_LABELS: Record<string, string> = {
  l2vpn_vpws: "L2VPN VPWS",
  l2vpn_vpls: "L2VPN VPLS/VSI",
  l3vpn_vrf: "L3VPN / VRF",
  bgp_peer_customer: "BGP — Cliente",
  bgp_peer_provider: "BGP — Operadora",
};

function statusBadgeVariant(status: string) {
  if (status === "approved" || status === "completed") return "default";
  if (status === "pending_approval" || status === "validated") return "secondary";
  if (status === "blocked" || status === "failed" || status === "cancelled") return "destructive";
  return "outline";
}

export default function Provisioning() {
  const { data: jobs, isLoading: jobsLoading } = useListProvisioningJobs();
  const { data: devices } = useListDevices();
  const createJob = useCreateProvisioningJob();
  const validateJob = useValidateProvisioningJob();
  const executeJob = useExecuteProvisioningJob();
  const createReport = useCreateProvisioningReport();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { user } = useAuth();

  const [templates, setTemplates] = useState<ProvisioningServiceTemplate[]>([]);
  const [deviceId, setDeviceId] = useState<string>("");
  const [serviceType, setServiceType] = useState<string>("l3vpn_vrf");
  const [paramValues, setParamValues] = useState<Record<string, string>>({});
  const [maintenanceStart, setMaintenanceStart] = useState("");
  const [maintenanceEnd, setMaintenanceEnd] = useState("");
  const [rollbackPlan, setRollbackPlan] = useState("");
  const [jobName, setJobName] = useState("");
  const [preview, setPreview] = useState<ProvisioningPreviewResult | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [activeJobId, setActiveJobId] = useState<number | null>(null);
  const [exportMarkdown, setExportMarkdown] = useState("");

  const [jobDetail, setJobDetail] = useState<ProvisioningJob | null>(null);
  const [rollbackPreview, setRollbackPreview] = useState<string | null>(null);
  const [approveLoading, setApproveLoading] = useState(false);
  const [executeLoading, setExecuteLoading] = useState(false);
  const [postcheckLoading, setPostcheckLoading] = useState(false);
  const [rollbackLoading, setRollbackLoading] = useState(false);
  const [previewRollbackLoading, setPreviewRollbackLoading] = useState(false);
  const [executeEnabled, setExecuteEnabled] = useState(true);

  const selectedTemplate = useMemo(
    () => templates.find((item) => item.serviceType === serviceType),
    [templates, serviceType],
  );

  useEffect(() => {
    listProvisioningServiceTemplates()
      .then(setTemplates)
      .catch(() => toast({ title: "Falha ao carregar templates", variant: "destructive" }));
  }, [toast]);

  useEffect(() => {
    if (!selectedTemplate) return;
    const next: Record<string, string> = {};
    for (const key of [...selectedTemplate.requiredParameters, ...selectedTemplate.optionalParameters]) {
      next[key] = paramValues[key] ?? "";
    }
    setParamValues(next);
  }, [selectedTemplate?.serviceType]);

  useEffect(() => {
    if (!activeJobId || !jobs) return;
    const job = jobs.find((j) => j.id === activeJobId);
    setJobDetail(job || null);
  }, [activeJobId, jobs]);

  async function runPreview() {
    if (!deviceId) {
      toast({ title: "Selecione um device", variant: "destructive" });
      return;
    }
    if (!selectedTemplate) {
      toast({ title: "Selecione um template", variant: "destructive" });
      return;
    }
    setPreviewLoading(true);
    try {
      const result = await previewProvisioningConfig({
        deviceId: Number(deviceId),
        templateId: selectedTemplate.id,
        parameters: paramValues,
        maintenanceWindowStart: maintenanceStart || undefined,
        maintenanceWindowEnd: maintenanceEnd || undefined,
        rollbackPlan: rollbackPlan || undefined,
      });
      setPreview(result);
      toast({ title: "Preview gerado" });
    } catch (err) {
      toast({
        title: "Erro no preview",
        description: err instanceof Error ? err.message : "Falha",
        variant: "destructive",
      });
    } finally {
      setPreviewLoading(false);
    }
  }

  function buildJobParametersJson() {
    return JSON.stringify({
      serviceType,
      serviceParams: paramValues,
      maintenanceWindowStart: maintenanceStart || null,
      maintenanceWindowEnd: maintenanceEnd || null,
      rollbackPlan: rollbackPlan || null,
    });
  }

  async function saveDraft() {
    if (!jobName.trim() || !deviceId) {
      toast({ title: "Nome e device obrigatórios", variant: "destructive" });
      return;
    }
    const created = await createJob.mutateAsync({
      data: {
        name: jobName,
        type: serviceType,
        deviceIds: [Number(deviceId)],
        parameters: buildJobParametersJson(),
      },
    });
    setActiveJobId(created.id);
    await queryClient.invalidateQueries({ queryKey: getListProvisioningJobsQueryKey() });
    toast({ title: `Rascunho #${created.id} criado` });
  }

  async function validateActiveJob() {
    if (!activeJobId) {
      toast({ title: "Salve um rascunho primeiro", variant: "destructive" });
      return;
    }
    const result = await validateJob.mutateAsync({ id: activeJobId });
    if (result.valid) {
      toast({ title: "Job validado" });
    } else {
      toast({ title: "Validação falhou", variant: "destructive" });
    }
    await queryClient.invalidateQueries({ queryKey: getListProvisioningJobsQueryKey() });
  }

  async function requestApproval() {
    if (!activeJobId) return;
    try {
      await requestProvisioningApproval(activeJobId);
      toast({ title: "Aprovação solicitada", description: "Status: pending_approval" });
      await queryClient.invalidateQueries({ queryKey: getListProvisioningJobsQueryKey() });
    } catch (err) {
      toast({ title: "Erro", description: err instanceof Error ? err.message : "", variant: "destructive" });
    }
  }

  async function approveJob() {
    if (!activeJobId) return;
    try {
      const res = await fetch(`/api/provisioning-jobs/${activeJobId}/approve`, {
        method: "POST",
        credentials: "include",
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({})) as { error?: string }).error ?? res.statusText);
      toast({ title: "Job aprovado", description: "Apply real continua bloqueado por padrão." });
      await queryClient.invalidateQueries({ queryKey: getListProvisioningJobsQueryKey() });
    } catch (err) {
      toast({ title: "Erro ao aprovar", description: err instanceof Error ? err.message : "", variant: "destructive" });
    }
  }

  async function exportPlan() {
    if (!activeJobId) {
      if (preview) {
        const md = [
          "# Plano de provisionamento (preview)",
          "",
          "## Config preview",
          "```",
          preview.configPreview,
          "```",
          "",
          "## Rollback",
          "```",
          preview.rollbackPlan ?? preview.rollbackPreview,
          "```",
        ].join("\n");
        setExportMarkdown(md);
        downloadMarkdown(md, "provisioning-preview.md");
        return;
      }
      toast({ title: "Gere preview ou salve rascunho", variant: "destructive" });
      return;
    }
    try {
      const data = await previewProvisioningJobMarkdown(activeJobId);
      const md = data.previewMarkdown ?? JSON.stringify(data, null, 2);
      setExportMarkdown(md);
      downloadMarkdown(md, `provisioning-job-${activeJobId}.md`);
      await createReport.mutateAsync({ id: activeJobId });
      toast({ title: "Plano exportado e report salvo" });
    } catch (err) {
      toast({ title: "Export falhou", description: err instanceof Error ? err.message : "", variant: "destructive" });
    }
  }

  async function tryExecuteBlocked() {
    if (!activeJobId) return;
    try {
      await executeJob.mutateAsync({ id: activeJobId });
      toast({
        title: "Execute chamado",
        description: "Deve retornar blocked com CONFIG_APPLY_ENABLED=false",
      });
      await queryClient.invalidateQueries({ queryKey: getListProvisioningJobsQueryKey() });
    } catch (err) {
      toast({ title: "Execute erro", description: err instanceof Error ? err.message : "", variant: "destructive" });
    }
  }

  async function cancelActiveJob() {
    if (!activeJobId) return;
    try {
      await cancelProvisioningJob(activeJobId);
      toast({ title: "Job cancelado" });
      setActiveJobId(null);
      await queryClient.invalidateQueries({ queryKey: getListProvisioningJobsQueryKey() });
    } catch (err) {
      toast({ title: "Cancel falhou", description: err instanceof Error ? err.message : "", variant: "destructive" });
    }
  }

  async function handleApproveJob() {
    if (!activeJobId) return;
    setApproveLoading(true);
    try {
      await approveProvisioningJob(activeJobId);
      toast({ title: "Job aprovado" });
      await queryClient.invalidateQueries({ queryKey: getListProvisioningJobsQueryKey() });
    } catch (err) {
      toast({ title: "Erro ao aprovar", description: err instanceof Error ? err.message : "", variant: "destructive" });
    } finally {
      setApproveLoading(false);
    }
  }

  async function handleExecuteJob() {
    if (!activeJobId) return;
    setExecuteLoading(true);
    try {
      await executeProvisioningJob(activeJobId);
      toast({ title: "Execução iniciada" });
      await queryClient.invalidateQueries({ queryKey: getListProvisioningJobsQueryKey() });
    } catch (err) {
      const message = err instanceof Error ? err.message : "";
      if (message.includes("PROVISIONING_EXECUTE_ENABLED=false")) {
        setExecuteEnabled(false);
      }
      toast({ title: "Erro na execução", description: message, variant: "destructive" });
    } finally {
      setExecuteLoading(false);
    }
  }

  async function handleRunPostcheck() {
    if (!activeJobId) return;
    setPostcheckLoading(true);
    try {
      await postcheckProvisioningJob(activeJobId);
      toast({ title: "Post-check executado" });
      await queryClient.invalidateQueries({ queryKey: getListProvisioningJobsQueryKey() });
    } catch (err) {
      toast({ title: "Erro no post-check", description: err instanceof Error ? err.message : "", variant: "destructive" });
    } finally {
      setPostcheckLoading(false);
    }
  }

  async function handleLoadRollbackPreview() {
    if (!activeJobId) return;
    setPreviewRollbackLoading(true);
    try {
      const result = await getRollbackPreview(activeJobId);
      setRollbackPreview(result.rollbackPlan);
      toast({ title: "Rollback preview carregado" });
    } catch (err) {
      toast({ title: "Erro ao carregar preview", description: err instanceof Error ? err.message : "", variant: "destructive" });
    } finally {
      setPreviewRollbackLoading(false);
    }
  }

  async function handleRollback() {
    if (!activeJobId) return;
    setRollbackLoading(true);
    try {
      await rollbackProvisioningJob(activeJobId);
      toast({ title: "Rollback iniciado" });
      await queryClient.invalidateQueries({ queryKey: getListProvisioningJobsQueryKey() });
    } catch (err) {
      toast({ title: "Erro no rollback", description: err instanceof Error ? err.message : "", variant: "destructive" });
    } finally {
      setRollbackLoading(false);
    }
  }

  const canApprove = user?.role === "admin" || user?.role === "operator";

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <Rocket className="h-8 w-8" />
            Provisioning
          </h1>
          <p className="text-muted-foreground mt-1">
            v0.6.1 — preview via connector, sem apply real
          </p>
        </div>
        {preview?.applyBlocked && (
          <Badge variant="outline" className="gap-1 border-amber-500/50 text-amber-600">
            <ShieldAlert className="h-3.5 w-3.5" />
            Apply bloqueado
          </Badge>
        )}
      </div>

      <Tabs defaultValue="wizard">
        <TabsList>
          <TabsTrigger value="wizard">Preview</TabsTrigger>
          <TabsTrigger value="jobs">Jobs</TabsTrigger>
          <TabsTrigger value="execution" disabled={!activeJobId}>
            Execução {activeJobId ? `#${activeJobId}` : ""}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="wizard" className="space-y-4 mt-4">
          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>1. Device e template</CardTitle>
                <CardDescription>Escolha alvo e template de provisionamento</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <Input placeholder="Nome do job" value={jobName} onChange={(e) => setJobName(e.target.value)} />
                <Select value={deviceId} onValueChange={setDeviceId}>
                  <SelectTrigger><SelectValue placeholder="Device" /></SelectTrigger>
                  <SelectContent>
                    {devices?.map((d) => (
                      <SelectItem key={d.id} value={String(d.id)}>{d.hostname}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={serviceType} onValueChange={setServiceType}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {templates.map((t) => (
                      <SelectItem key={t.serviceType} value={t.serviceType}>
                        {SERVICE_LABELS[t.serviceType] ?? t.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>2. Parâmetros</CardTitle>
                <CardDescription>{selectedTemplate?.description}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2 max-h-72 overflow-y-auto">
                {selectedTemplate?.requiredParameters.map((key) => (
                  <div key={key}>
                    <label className="text-xs text-muted-foreground">{key} *</label>
                    <Input
                      value={paramValues[key] ?? ""}
                      onChange={(e) => setParamValues((c) => ({ ...c, [key]: e.target.value }))}
                    />
                  </div>
                ))}
                {selectedTemplate?.optionalParameters.map((key) => (
                  <div key={key}>
                    <label className="text-xs text-muted-foreground">{key}</label>
                    <Input
                      value={paramValues[key] ?? ""}
                      onChange={(e) => setParamValues((c) => ({ ...c, [key]: e.target.value }))}
                    />
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>3. Janela e rollback</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <Input type="datetime-local" value={maintenanceStart} onChange={(e) => setMaintenanceStart(e.target.value)} />
                <Input type="datetime-local" value={maintenanceEnd} onChange={(e) => setMaintenanceEnd(e.target.value)} />
                <Textarea
                  placeholder="Plano de rollback textual (opcional)"
                  value={rollbackPlan}
                  onChange={(e) => setRollbackPlan(e.target.value)}
                  rows={4}
                />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Ações</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-wrap gap-2">
                <Button onClick={runPreview} disabled={previewLoading}>
                  {previewLoading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                  Preview
                </Button>
                <Button variant="outline" onClick={exportPlan}>
                  <Download className="h-4 w-4 mr-1" />
                  Exportar plano
                </Button>
              </CardContent>
            </Card>
          </div>

          {preview && (
            <div className="grid gap-4 lg:grid-cols-2">
              <Card>
                <CardHeader><CardTitle>Comandos gerados</CardTitle></CardHeader>
                <CardContent>
                  <pre className="text-xs bg-muted/30 p-3 rounded-md overflow-auto max-h-64">{preview.commandsGenerated.join("\n")}</pre>
                </CardContent>
              </Card>
              <Card>
                <CardHeader><CardTitle>Warnings</CardTitle></CardHeader>
                <CardContent>
                  {preview.warnings.length > 0 ? (
                    <ul className="space-y-2 text-sm">
                      {preview.warnings.map((warning) => (
                        <li key={warning} className="flex items-start gap-2">
                          <AlertTriangle className="mt-0.5 h-4 w-4 text-amber-500" />
                          <span>{warning}</span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-sm text-muted-foreground">Sem warnings.</p>
                  )}
                </CardContent>
              </Card>
              <Card className="lg:col-span-2">
                <CardHeader><CardTitle>Conflicts e missing resources</CardTitle></CardHeader>
                <CardContent className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <p className="text-sm font-medium">Conflicts</p>
                    {preview.conflicts.length > 0 ? (
                      <ul className="list-disc pl-5 text-sm text-muted-foreground">
                        {preview.conflicts.map((item) => <li key={item}>{item}</li>)}
                      </ul>
                    ) : (
                      <p className="text-sm text-muted-foreground">Nenhum conflito.</p>
                    )}
                  </div>
                  <div className="space-y-2">
                    <p className="text-sm font-medium">Missing resources</p>
                    {preview.missingResources.length > 0 ? (
                      <ul className="list-disc pl-5 text-sm text-muted-foreground">
                        {preview.missingResources.map((item) => <li key={item}>{item}</li>)}
                      </ul>
                    ) : (
                      <p className="text-sm text-muted-foreground">Nenhum recurso faltante.</p>
                    )}
                  </div>
                  <div className="md:col-span-2">
                    <p className="text-sm font-medium mb-2">Validações</p>
                    <div className="space-y-2">
                      {preview.validations.map((v) => (
                        <div key={v.name} className="flex items-center gap-2 text-sm">
                          {v.passed ? <CheckCircle2 className="h-4 w-4 text-green-500" /> : <AlertTriangle className="h-4 w-4 text-amber-500" />}
                          <span className="font-medium">{v.name}:</span>
                          <span className="text-muted-foreground">{v.message}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          {exportMarkdown && (
            <Card>
              <CardHeader className="flex flex-row items-center gap-2">
                <FileText className="h-5 w-5" />
                <CardTitle>Último export</CardTitle>
              </CardHeader>
              <CardContent>
                <pre className="text-xs max-h-40 overflow-auto">{exportMarkdown.slice(0, 2000)}{exportMarkdown.length > 2000 ? "…" : ""}</pre>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="jobs" className="mt-4">
          <Card>
            <CardHeader><CardTitle>Provisioning jobs</CardTitle></CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>ID</TableHead>
                    <TableHead>Nome</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Criado</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {jobsLoading ? (
                    <TableRow><TableCell colSpan={5}>Carregando…</TableCell></TableRow>
                  ) : jobs?.length === 0 ? (
                    <TableRow><TableCell colSpan={5} className="text-muted-foreground">Nenhum job</TableCell></TableRow>
                  ) : (
                    jobs?.map((job) => (
                      <TableRow
                        key={job.id}
                        className={activeJobId === job.id ? "bg-muted/40" : ""}
                        onClick={() => setActiveJobId(job.id)}
                      >
                        <TableCell>#{job.id}</TableCell>
                        <TableCell>{job.name}</TableCell>
                        <TableCell><Badge variant="outline">{job.type}</Badge></TableCell>
                        <TableCell><Badge variant={statusBadgeVariant(job.status)}>{job.status}</Badge></TableCell>
                        <TableCell className="text-xs">{new Date(job.createdAt).toLocaleString()}</TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="execution" className="mt-4 space-y-4">
          {!executeEnabled && (
            <Card className="border-amber-200 bg-amber-50">
              <CardContent className="pt-6">
                <p className="text-sm text-amber-700">
                  <strong>Execução desabilitada:</strong> PROVISIONING_EXECUTE_ENABLED=false (padrão).
                  Configure no servidor para habilitar.
                </p>
              </CardContent>
            </Card>
          )}

          {jobDetail && (
            <>
              <ApprovalStatusCard
                job={jobDetail}
                onApprove={handleApproveJob}
                onRequestApproval={requestApproval}
                canApprove={canApprove}
                canRequestApproval={canApprove}
                isApproving={approveLoading}
                executeEnabled={executeEnabled}
              />

              <ExecutionPlanCard executionPlanJson={jobDetail.executionPlanJson} />

              {jobDetail.status === "approved" && (
                <Card>
                  <CardHeader>
                    <CardTitle>Ações de Execução</CardTitle>
                  </CardHeader>
                  <CardContent className="flex gap-2">
                    <Button
                      onClick={handleExecuteJob}
                      disabled={!executeEnabled || executeLoading}
                      className="bg-green-600 hover:bg-green-700"
                    >
                      {executeLoading ? (
                        <>
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          Executando...
                        </>
                      ) : (
                        "Executar"
                      )}
                    </Button>
                  </CardContent>
                </Card>
              )}

              <ExecutionResultTimeline steps={[]} />

              <PostcheckResultCard
                job={jobDetail}
                onRunPostcheck={handleRunPostcheck}
                isRunning={postcheckLoading}
                canRun={canApprove}
              />

              <RollbackPreviewCard
                jobId={jobDetail.id}
                onLoadPreview={handleLoadRollbackPreview}
                rollbackPreview={rollbackPreview}
                onRollback={handleRollback}
                canRollback={canApprove}
                isLoadingPreview={previewRollbackLoading}
                isRollingBack={rollbackLoading}
              />
            </>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

function downloadMarkdown(content: string, filename: string) {
  const blob = new Blob([content], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}
