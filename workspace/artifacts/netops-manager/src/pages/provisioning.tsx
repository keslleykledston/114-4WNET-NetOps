import { useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
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
  createStructuredProvisioningJob,
  precheckStructuredProvisioningJob,
  previewStructuredProvisioningJob,
  approveStructuredProvisioningJob,
  applyStructuredProvisioningJob,
  reportStructuredProvisioningJob,
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
import { useTranslation } from "@/i18n";
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  FileText,
  Loader2,
  Rocket,
  ShieldAlert,
} from "lucide-react";

const SERVICE_TYPE_CODES = [
  "l2vpn",
  "l3vpn",
  "l2vpn_vpws",
  "l2vpn_vpls",
  "l3vpn_vrf",
  "bgp_peer_customer",
  "bgp_peer_provider",
] as const;

function getServiceTypeLabel(
  serviceType: string,
  t: (key: string) => string,
  fallback?: string,
): string {
  if ((SERVICE_TYPE_CODES as readonly string[]).includes(serviceType)) {
    return t(`provisioning.serviceTypes.${serviceType}`);
  }
  return fallback ?? serviceType;
}

function statusBadgeVariant(status: string) {
  if (status === "approved" || status === "completed") return "default";
  if (status === "pending_approval" || status === "validated") return "secondary";
  if (status === "blocked" || status === "failed" || status === "cancelled") return "destructive";
  return "outline";
}

function isStructuredServiceType(serviceType?: string | null) {
  return serviceType === "l2vpn" || serviceType === "l3vpn";
}

function parseStructuredTargets(values: Record<string, string>): number[] {
  const targets = [values.deviceA, values.deviceB, values.deviceId]
    .map((value) => Number(value))
    .filter((value) => Number.isInteger(value) && value > 0);
  return Array.from(new Set(targets));
}

export default function Provisioning() {
  const { t } = useTranslation();
  const [location] = useLocation();
  const { data: jobs, isLoading: jobsLoading } = useListProvisioningJobs();
  const { data: devices } = useListDevices();
  const createJob = useCreateProvisioningJob();
  const validateJob = useValidateProvisioningJob();
  const executeJob = useExecuteProvisioningJob();
  const createReport = useCreateProvisioningReport();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { user } = useAuth();
  const provisioningJobs = useMemo(() => (jobs ?? []) as ProvisioningJob[], [jobs]);

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

  useEffect(() => {
    const search = location.includes("?") ? location.slice(location.indexOf("?") + 1) : "";
    if (!search) return;
    const params = new URLSearchParams(search);
    const serviceTypeParam = params.get("serviceType");
    if (
      serviceTypeParam &&
      ["l2vpn", "l3vpn", "l2vpn_vpws", "l2vpn_vpls", "l3vpn_vrf", "bgp_peer_customer", "bgp_peer_provider"].includes(serviceTypeParam)
    ) {
      setServiceType(serviceTypeParam);
    }
  }, [location]);

  const selectedTemplate = useMemo(
    () => templates.find((item) => item.serviceType === serviceType),
    [templates, serviceType],
  );

  useEffect(() => {
    listProvisioningServiceTemplates()
      .then(setTemplates)
      .catch(() => toast({ title: t("provisioning.toasts.templatesLoadFailed"), variant: "destructive" }));
  }, [toast, t]);

  useEffect(() => {
    if (!selectedTemplate) return;
    const next: Record<string, string> = {};
    for (const key of [...selectedTemplate.requiredParameters, ...selectedTemplate.optionalParameters]) {
      next[key] = paramValues[key] ?? "";
    }
    setParamValues(next);
  }, [selectedTemplate?.serviceType]);

  useEffect(() => {
    if (!activeJobId || provisioningJobs.length === 0) return;
    const job = provisioningJobs.find((j) => j.id === activeJobId);
    setJobDetail(job || null);
  }, [activeJobId, provisioningJobs]);

  async function runPreview() {
    if (!deviceId) {
      toast({ title: t("provisioning.toasts.selectDevice"), variant: "destructive" });
      return;
    }
    if (!selectedTemplate) {
      toast({ title: t("provisioning.toasts.selectTemplate"), variant: "destructive" });
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
      toast({ title: t("provisioning.toasts.previewGenerated") });
    } catch (err) {
      toast({
        title: t("provisioning.toasts.previewError"),
        description: err instanceof Error ? err.message : t("provisioning.toasts.failure"),
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
      toast({ title: t("provisioning.toasts.nameAndDeviceRequired"), variant: "destructive" });
      return;
    }
    const structured = isStructuredServiceType(selectedTemplate?.serviceType);
    const created = structured
      ? await createStructuredProvisioningJob({
        serviceType,
        customerName: jobName,
        description: paramValues.description || jobName,
        targetDevices: parseStructuredTargets(paramValues),
        parameters: {
          ...paramValues,
          customerName: jobName,
          description: paramValues.description || jobName,
        },
      })
      : await createJob.mutateAsync({
        data: {
          name: jobName,
          type: serviceType,
          deviceIds: [Number(deviceId)],
          parameters: buildJobParametersJson(),
        },
      });
    setActiveJobId(created.id);
    await queryClient.invalidateQueries({ queryKey: getListProvisioningJobsQueryKey() });
    toast({ title: t("provisioning.toasts.draftCreated", { id: created.id }) });
  }

  async function validateActiveJob() {
    if (!activeJobId) {
      toast({ title: t("provisioning.toasts.saveDraftFirst"), variant: "destructive" });
      return;
    }
    const structured = isStructuredServiceType(jobDetail?.serviceType ?? jobDetail?.type);
    if (structured) {
      const result = await precheckStructuredProvisioningJob(activeJobId);
      setJobDetail(result.job);
      setPreview(result.preview);
      toast({
        title: t("provisioning.toasts.precheckExecuted"),
        description: result.preview.findings?.some((finding) => finding.blocking)
          ? t("provisioning.toasts.blocked")
          : t("provisioning.toasts.validated"),
      });
    } else {
      const result = await validateJob.mutateAsync({ id: activeJobId });
      if (result.valid) {
        toast({ title: t("provisioning.toasts.jobValidated") });
      } else {
        toast({ title: t("provisioning.toasts.validationFailed"), variant: "destructive" });
      }
    }
    await queryClient.invalidateQueries({ queryKey: getListProvisioningJobsQueryKey() });
  }

  async function requestApproval() {
    if (!activeJobId) return;
    try {
      const structured = isStructuredServiceType(jobDetail?.serviceType ?? jobDetail?.type);
      if (structured) {
        const result = await precheckStructuredProvisioningJob(activeJobId);
        setJobDetail(result.job);
        setPreview(result.preview);
        toast({
          title: t("provisioning.toasts.precheckExecuted"),
          description: t("provisioning.toasts.useApproveToApprove"),
        });
      } else {
        await requestProvisioningApproval(activeJobId);
        toast({
          title: t("provisioning.toasts.approvalRequested"),
          description: t("provisioning.toasts.approvalRequestedDesc"),
        });
      }
      await queryClient.invalidateQueries({ queryKey: getListProvisioningJobsQueryKey() });
    } catch (err) {
      toast({ title: t("common.error"), description: err instanceof Error ? err.message : "", variant: "destructive" });
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
      toast({
        title: t("provisioning.toasts.jobApproved"),
        description: t("provisioning.toasts.applyStillBlocked"),
      });
      await queryClient.invalidateQueries({ queryKey: getListProvisioningJobsQueryKey() });
    } catch (err) {
      toast({
        title: t("provisioning.toasts.approveError"),
        description: err instanceof Error ? err.message : "",
        variant: "destructive",
      });
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
      toast({ title: t("provisioning.toasts.generatePreviewOrDraft"), variant: "destructive" });
      return;
    }
    try {
      const structured = isStructuredServiceType(jobDetail?.serviceType ?? jobDetail?.type);
      const data = structured ? await reportStructuredProvisioningJob(activeJobId) : await previewProvisioningJobMarkdown(activeJobId);
      const md = ("contentMarkdown" in data
        ? data.contentMarkdown
        : data.previewMarkdown ?? JSON.stringify(data, null, 2)) as string;
      setExportMarkdown(md);
      downloadMarkdown(md, `provisioning-job-${activeJobId}.md`);
      if (!structured) {
        await createReport.mutateAsync({ id: activeJobId });
      }
      toast({ title: t("provisioning.toasts.planExported") });
    } catch (err) {
      toast({
        title: t("provisioning.toasts.exportFailed"),
        description: err instanceof Error ? err.message : "",
        variant: "destructive",
      });
    }
  }

  async function tryExecuteBlocked() {
    if (!activeJobId) return;
    try {
      await executeJob.mutateAsync({ id: activeJobId });
      toast({
        title: t("provisioning.toasts.executeCalled"),
        description: t("provisioning.toasts.executeBlockedDesc"),
      });
      await queryClient.invalidateQueries({ queryKey: getListProvisioningJobsQueryKey() });
    } catch (err) {
      toast({
        title: t("provisioning.toasts.executeError"),
        description: err instanceof Error ? err.message : "",
        variant: "destructive",
      });
    }
  }

  async function cancelActiveJob() {
    if (!activeJobId) return;
    try {
      await cancelProvisioningJob(activeJobId);
      toast({ title: t("provisioning.toasts.jobCancelled") });
      setActiveJobId(null);
      await queryClient.invalidateQueries({ queryKey: getListProvisioningJobsQueryKey() });
    } catch (err) {
      toast({
        title: t("provisioning.toasts.cancelFailed"),
        description: err instanceof Error ? err.message : "",
        variant: "destructive",
      });
    }
  }

  async function handleApproveJob() {
    if (!activeJobId) return;
    setApproveLoading(true);
    try {
      const structured = isStructuredServiceType(jobDetail?.serviceType ?? jobDetail?.type);
      if (structured) {
        const updated = await approveStructuredProvisioningJob(activeJobId);
        setJobDetail(updated);
      } else {
        await approveProvisioningJob(activeJobId);
      }
      toast({ title: t("provisioning.toasts.jobApproved") });
      await queryClient.invalidateQueries({ queryKey: getListProvisioningJobsQueryKey() });
    } catch (err) {
      toast({
        title: t("provisioning.toasts.approveError"),
        description: err instanceof Error ? err.message : "",
        variant: "destructive",
      });
    } finally {
      setApproveLoading(false);
    }
  }

  async function handleExecuteJob() {
    if (!activeJobId) return;
    setExecuteLoading(true);
    try {
      const structured = isStructuredServiceType(jobDetail?.serviceType ?? jobDetail?.type);
      if (structured) {
        await applyStructuredProvisioningJob(activeJobId);
      } else {
        await executeProvisioningJob(activeJobId);
      }
      toast({ title: t("provisioning.toasts.executionStarted") });
      await queryClient.invalidateQueries({ queryKey: getListProvisioningJobsQueryKey() });
    } catch (err) {
      const message = err instanceof Error ? err.message : "";
      if (message.includes("PROVISIONING_EXECUTE_ENABLED=false")) {
        setExecuteEnabled(false);
      }
      toast({
        title: t("provisioning.toasts.executionError"),
        description: message,
        variant: "destructive",
      });
    } finally {
      setExecuteLoading(false);
    }
  }

  async function handleRunPostcheck() {
    if (!activeJobId) return;
    setPostcheckLoading(true);
    try {
      const structured = isStructuredServiceType(jobDetail?.serviceType ?? jobDetail?.type);
      if (structured) {
        const result = await precheckStructuredProvisioningJob(activeJobId);
        setJobDetail(result.job);
        setPreview(result.preview);
      } else {
        await postcheckProvisioningJob(activeJobId);
      }
      toast({ title: t("provisioning.toasts.postcheckExecuted") });
      await queryClient.invalidateQueries({ queryKey: getListProvisioningJobsQueryKey() });
    } catch (err) {
      toast({
        title: t("provisioning.toasts.postcheckError"),
        description: err instanceof Error ? err.message : "",
        variant: "destructive",
      });
    } finally {
      setPostcheckLoading(false);
    }
  }

  async function handleLoadRollbackPreview() {
    if (!activeJobId) return;
    setPreviewRollbackLoading(true);
    try {
      const structured = isStructuredServiceType(jobDetail?.serviceType ?? jobDetail?.type);
      if (structured) {
        const result = await previewStructuredProvisioningJob(activeJobId);
        setJobDetail(result.job);
        setPreview(result.preview);
        setRollbackPreview(result.preview.rollbackPreview);
      } else {
        const result = await getRollbackPreview(activeJobId);
        setRollbackPreview(result.rollbackPlan);
      }
      toast({ title: t("provisioning.toasts.rollbackPreviewLoaded") });
    } catch (err) {
      toast({
        title: t("provisioning.toasts.loadPreviewError"),
        description: err instanceof Error ? err.message : "",
        variant: "destructive",
      });
    } finally {
      setPreviewRollbackLoading(false);
    }
  }

  async function handleRollback() {
    if (!activeJobId) return;
    setRollbackLoading(true);
    try {
      await rollbackProvisioningJob(activeJobId);
      toast({ title: t("provisioning.toasts.rollbackStarted") });
      await queryClient.invalidateQueries({ queryKey: getListProvisioningJobsQueryKey() });
    } catch (err) {
      toast({
        title: t("provisioning.toasts.rollbackError"),
        description: err instanceof Error ? err.message : "",
        variant: "destructive",
      });
    } finally {
      setRollbackLoading(false);
    }
  }

  const canApprove = user?.role === "admin" || user?.role === "operator";

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Rocket className="h-8 w-8" />
            {t("provisioning.title")}
          </h1>
          <p className="text-muted-foreground mt-1">
            {t("provisioning.pageSubtitle")}
          </p>
        </div>
        {preview?.applyBlocked && (
          <Badge variant="outline" className="gap-1 border-amber-500/50 text-amber-600">
            <ShieldAlert className="h-3.5 w-3.5" />
            {t("provisioning.applyBlockedBadge")}
          </Badge>
        )}
      </div>

      <Tabs defaultValue="wizard">
        <TabsList>
          <TabsTrigger value="wizard">{t("provisioning.tabs.preview")}</TabsTrigger>
          <TabsTrigger value="jobs">{t("provisioning.tabs.jobs")}</TabsTrigger>
          <TabsTrigger value="execution" disabled={!activeJobId}>
            {activeJobId
              ? t("provisioning.tabs.executionWithId", { id: activeJobId })
              : t("provisioning.tabs.execution")}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="wizard" className="space-y-4 mt-4">
          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>{t("provisioning.steps.deviceAndTemplate.title")}</CardTitle>
                <CardDescription>{t("provisioning.steps.deviceAndTemplate.description")}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <Input
                  placeholder={t("provisioning.placeholders.jobName")}
                  value={jobName}
                  onChange={(e) => setJobName(e.target.value)}
                />
                <Select value={deviceId} onValueChange={setDeviceId}>
                  <SelectTrigger><SelectValue placeholder={t("provisioning.placeholders.device")} /></SelectTrigger>
                  <SelectContent>
                    {devices?.map((d) => (
                      <SelectItem key={d.id} value={String(d.id)}>{d.hostname}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={serviceType} onValueChange={setServiceType}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {templates.map((template) => (
                      <SelectItem key={template.serviceType} value={template.serviceType}>
                        {getServiceTypeLabel(template.serviceType, t, template.name)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>{t("provisioning.steps.parameters.title")}</CardTitle>
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
                <CardTitle>{t("provisioning.steps.windowAndRollback.title")}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <Input type="datetime-local" value={maintenanceStart} onChange={(e) => setMaintenanceStart(e.target.value)} />
                <Input type="datetime-local" value={maintenanceEnd} onChange={(e) => setMaintenanceEnd(e.target.value)} />
                <Textarea
                  placeholder={t("provisioning.placeholders.rollbackPlan")}
                  value={rollbackPlan}
                  onChange={(e) => setRollbackPlan(e.target.value)}
                  rows={4}
                />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>{t("provisioning.steps.actions")}</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-wrap gap-2">
                <Button onClick={runPreview} disabled={previewLoading}>
                  {previewLoading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                  {t("provisioning.buttons.preview")}
                </Button>
                <Button variant="outline" onClick={exportPlan}>
                  <Download className="h-4 w-4 mr-1" />
                  {t("provisioning.buttons.exportPlan")}
                </Button>
              </CardContent>
            </Card>
          </div>

          {preview && (
            <div className="grid gap-4 lg:grid-cols-2">
              <Card>
                <CardHeader><CardTitle>{t("provisioning.previewPanel.generatedCommands")}</CardTitle></CardHeader>
                <CardContent>
                  <pre className="text-xs bg-muted/30 p-3 rounded-md overflow-auto max-h-64">{preview.commandsGenerated.join("\n")}</pre>
                </CardContent>
              </Card>
              <Card>
                <CardHeader><CardTitle>{t("provisioning.previewPanel.warnings")}</CardTitle></CardHeader>
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
                    <p className="text-sm text-muted-foreground">{t("provisioning.previewPanel.noWarnings")}</p>
                  )}
                </CardContent>
              </Card>
              <Card className="lg:col-span-2">
                <CardHeader><CardTitle>{t("provisioning.previewPanel.conflictsAndMissing")}</CardTitle></CardHeader>
                <CardContent className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <p className="text-sm font-medium">{t("provisioning.previewPanel.conflicts")}</p>
                    {preview.conflicts.length > 0 ? (
                      <ul className="list-disc pl-5 text-sm text-muted-foreground">
                        {preview.conflicts.map((item) => <li key={item}>{item}</li>)}
                      </ul>
                    ) : (
                      <p className="text-sm text-muted-foreground">{t("provisioning.previewPanel.noConflicts")}</p>
                    )}
                  </div>
                  <div className="space-y-2">
                    <p className="text-sm font-medium">{t("provisioning.previewPanel.missingResources")}</p>
                    {preview.missingResources.length > 0 ? (
                      <ul className="list-disc pl-5 text-sm text-muted-foreground">
                        {preview.missingResources.map((item) => <li key={item}>{item}</li>)}
                      </ul>
                    ) : (
                      <p className="text-sm text-muted-foreground">{t("provisioning.previewPanel.noMissingResources")}</p>
                    )}
                  </div>
                  <div className="md:col-span-2">
                    <p className="text-sm font-medium mb-2">{t("provisioning.previewPanel.validations")}</p>
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
                  {preview.findings?.length ? (
                    <div className="md:col-span-2 space-y-2">
                      <p className="text-sm font-medium">{t("provisioning.previewPanel.structuredFindings")}</p>
                      <div className="space-y-2">
                        {preview.findings.map((finding) => (
                          <div key={finding.code} className="rounded-md border p-3 text-sm">
                            <div className="flex items-center justify-between gap-2">
                              <span className="font-medium">{finding.code}</span>
                              <Badge variant={finding.blocking ? "destructive" : "secondary"}>{finding.severity}</Badge>
                            </div>
                            <p className="mt-1 text-muted-foreground">{finding.message}</p>
                            <p className="mt-1 text-xs text-muted-foreground">
                              {t("provisioning.previewPanel.recommendation")} {finding.recommendation}
                            </p>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : null}
                  {preview.renderedValidationJson ? (
                    <div className="md:col-span-2 space-y-2">
                      <p className="text-sm font-medium">{t("provisioning.previewPanel.validationJson")}</p>
                      <pre className="text-xs max-h-48 overflow-auto rounded-md bg-muted/40 p-3">
                        {preview.renderedValidationJson.slice(0, 4000)}
                      </pre>
                    </div>
                  ) : null}
                </CardContent>
              </Card>
            </div>
          )}

          {exportMarkdown && (
            <Card>
              <CardHeader className="flex flex-row items-center gap-2">
                <FileText className="h-5 w-5" />
                <CardTitle>{t("provisioning.export.lastExport")}</CardTitle>
              </CardHeader>
              <CardContent>
                <pre className="text-xs max-h-40 overflow-auto">{exportMarkdown.slice(0, 2000)}{exportMarkdown.length > 2000 ? "…" : ""}</pre>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="jobs" className="mt-4">
          <Card>
            <CardHeader><CardTitle>{t("provisioning.jobs.title")}</CardTitle></CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("provisioning.jobs.columns.id")}</TableHead>
                    <TableHead>{t("provisioning.jobs.columns.name")}</TableHead>
                    <TableHead>{t("provisioning.jobs.columns.type")}</TableHead>
                    <TableHead>{t("provisioning.jobs.columns.status")}</TableHead>
                    <TableHead>{t("provisioning.jobs.columns.created")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {jobsLoading ? (
                    <TableRow><TableCell colSpan={5}>{t("provisioning.jobs.loading")}</TableCell></TableRow>
                  ) : provisioningJobs.length === 0 ? (
                    <TableRow><TableCell colSpan={5} className="text-muted-foreground">{t("provisioning.jobs.empty")}</TableCell></TableRow>
                  ) : (
                    provisioningJobs.map((job) => (
                        <TableRow
                        key={job.id}
                        className={activeJobId === job.id ? "bg-muted/40" : ""}
                        onClick={() => setActiveJobId(job.id)}
                      >
                        <TableCell>#{job.id}</TableCell>
                        <TableCell>{job.name}</TableCell>
                        <TableCell><Badge variant="outline">{getServiceTypeLabel(job.serviceType ?? job.type ?? "", t, job.serviceType ?? job.type ?? "")}</Badge></TableCell>
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
                  <strong>{t("provisioning.execution.disabledTitle")}</strong>{" "}
                  {t("provisioning.execution.disabledMessage")}
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
                    <CardTitle>{t("provisioning.execution.actionsTitle")}</CardTitle>
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
                          {t("provisioning.buttons.executing")}
                        </>
                      ) : (
                        t("provisioning.buttons.execute")
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
