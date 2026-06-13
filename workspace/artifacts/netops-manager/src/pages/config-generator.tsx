import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { useListDevices } from "@workspace/api-client-react";
import {
  fetchConfigGeneratorRun,
  fetchConfigGeneratorRunArtifacts,
  diffConfigGenerator,
  diffConfigGeneratorRun,
  renderConfigGenerator,
  saveConfigGeneratorRun,
  useConfigGeneratorFeature,
  useConfigGeneratorSuggestionDeviceContext,
  useConfigGeneratorSuggestionDevices,
  useConfigGeneratorSuggestionScope,
  useConfigGeneratorSuggestionServiceContext,
  useConfigGeneratorSuggestionTemplates,
  useConfigGeneratorRuns,
  useConfigGeneratorTemplateSchema,
  useConfigGeneratorTemplates,
  validateConfigGenerator,
  type ConfigGeneratorArtifactResponse,
  type ConfigGeneratorBlockSchema,
  type ConfigGeneratorDiffResponse,
  type ConfigGeneratorFieldSchema,
  type ConfigGeneratorFieldOrigins,
  type ConfigGeneratorRenderResponse,
  type ConfigGeneratorRunDetail,
  type ConfigGeneratorRunListItem,
  type ConfigGeneratorTemplateSchemaResponse,
  type ConfigGeneratorValidationSummary,
} from "@/features/config-generator/config-generator-api";
import { ConfigGeneratorIdAllocatorPanel } from "@/features/config-generator/id-allocator-panel";
import { AlertTriangle, Download, Eye, Loader2, Copy, ShieldAlert, FileText } from "lucide-react";

type FormState = Record<string, string>;
type OriginState = ConfigGeneratorFieldOrigins;
type ConfigGeneratorRequest = {
  tenantId: number;
  deviceId: number;
  templateId: number;
  templateVersionId?: number | null;
  input: FormState;
  fieldOrigins: OriginState;
};
type DeviceOption = {
  id: number;
  hostname: string;
  tenantId: number | null;
  tenantName: string | null;
  vendor: string;
  platform: string;
  status: string;
};

function copyText(text: string) {
  void navigator.clipboard.writeText(text);
}

function downloadText(filename: string, content: string) {
  const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
  const href = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = href;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(href);
}

function defaultFormValue(field: ConfigGeneratorFieldSchema): string {
  if (Array.isArray(field.defaultValue)) return field.defaultValue.join("\n");
  if (field.defaultValue == null) return "";
  return String(field.defaultValue);
}

function blockBadgeVariant(classification: ConfigGeneratorBlockSchema["classification"]) {
  return classification === "global" ? "secondary" : "outline";
}

function blockStatusVariant(status?: string) {
  switch (status) {
    case "existing":
      return "default";
    case "missing":
      return "secondary";
    case "new":
      return "outline";
    case "conflict":
      return "destructive";
    case "suggested":
      return "secondary";
    default:
      return "outline";
  }
}

function diffStatusVariant(status?: string) {
  switch (status) {
    case "already_present":
    case "global_existing":
      return "default";
    case "new_candidate":
      return "outline";
    case "partial_match":
    case "manual_review":
      return "secondary";
    case "missing_dependency":
    case "global_missing":
      return "secondary";
    case "conflict":
      return "destructive";
    case "unknown_no_baseline":
      return "outline";
    default:
      return "outline";
  }
}

function diffStatusLabel(status?: string) {
  const labels: Record<string, string> = {
    already_present: "já existe",
    new_candidate: "novo",
    partial_match: "parcial",
    conflict: "conflito",
    missing_dependency: "falta baseline",
    global_existing: "global existente",
    global_missing: "global ausente",
    manual_review: "revisão manual",
    unknown_no_baseline: "sem baseline",
  };
  return labels[status ?? ""] ?? (status ?? "desconhecido");
}

function diffBlockSummaryLabel(status?: string) {
  if (status === "global_existing") return "GLOBAL / já existente";
  if (status === "global_missing") return "GLOBAL / ausente";
  if (status === "conflict") return "CIRCUIT / conflito";
  if (status === "partial_match") return "CIRCUIT / revisão";
  if (status === "manual_review") return "MANUAL / revisão";
  if (status === "unknown_no_baseline") return "SEM BASELINE";
  return "CIRCUIT / novo";
}

function validationBadgeVariant(status: ConfigGeneratorValidationSummary["status"]) {
  if (status === "passed") return "default";
  if (status === "warning") return "secondary";
  return "destructive";
}

function originLabel(origin?: string) {
  const labels: Record<string, string> = {
    device_context: "inventory",
    inventory: "inventory",
    bgp_peer: "BGP discovery",
    l2_circuit: "circuito L2",
    service_catalog: "service catalog",
    announcement_matrix: "matriz de anúncios",
    discovery: "discovery",
    id_allocator: "alocador de IDs",
    manual: "manual",
  };
  return labels[origin ?? "manual"] ?? "manual";
}

function originBadgeText(origin?: string) {
  return origin ? `sugerido por ${originLabel(origin)}` : "informado manualmente";
}

function valueToFormValue(value: unknown) {
  if (value == null) return "";
  if (Array.isArray(value)) return value.map((item) => String(item)).join("\n");
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function fieldOriginTitle(origin?: string) {
  const label = originBadgeText(origin);
  return origin ? `${label}.` : "informado manualmente.";
}

function errorMessage(error: unknown) {
  const code = error && typeof error === "object"
    ? String((error as { data?: { code?: string } }).data?.code ?? "")
    : "";
  const details = error && typeof error === "object"
    ? (error as { data?: { error?: string; reason?: string } }).data
    : null;
  const map: Record<string, string> = {
    CONFIG_GENERATOR_DISABLED: "Config Generator disabled by feature flag.",
    CONFIG_WRITE_DISABLED: "Execução em dispositivo bloqueada neste MVP.",
    RBAC_FORBIDDEN: "Seu perfil não tem acesso a esta ação.",
    TENANT_DEVICE_MISMATCH: "Device não pertence ao tenant selecionado.",
    TEMPLATE_VENDOR_MISMATCH: "Template incompatível com o vendor/platform do device.",
    VALIDATION_FAILED: "Entrada inválida ou incompleta.",
    RUN_NOT_FOUND: "Histórico não encontrado.",
    ARTIFACT_NOT_FOUND: "Artefato não encontrado.",
    SECRET_NOT_PERSISTED: "Campo sensível não é persistido.",
  };
  if (code && map[code]) return map[code];
  return details?.error ?? details?.reason ?? (error instanceof Error ? error.message : "Unknown error");
}

function toTenantOptions(devices: Array<{ tenantId?: number | null; tenantName?: string | null }>) {
  const seen = new Map<number, string>();
  for (const device of devices) {
    if (device.tenantId == null) continue;
    if (!seen.has(device.tenantId)) seen.set(device.tenantId, device.tenantName ?? `Tenant ${device.tenantId}`);
  }
  return [...seen.entries()].map(([tenantId, tenantName]) => ({ tenantId, tenantName }));
}

function renderField(field: ConfigGeneratorFieldSchema, value: string, onChange: (next: string) => void) {
  if (field.type === "select") {
    return (
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger>
          <SelectValue placeholder={field.placeholder ?? field.label} />
        </SelectTrigger>
        <SelectContent>
          {(field.options ?? []).map((option) => <SelectItem key={option} value={option}>{option}</SelectItem>)}
        </SelectContent>
      </Select>
    );
  }
  if (field.type === "array") {
    return (
      <Textarea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={field.placeholder ?? "value1\nvalue2"}
        className="min-h-24 font-mono"
      />
    );
  }
  if (field.type === "secret") {
    return <Input type="password" value={value} onChange={(event) => onChange(event.target.value)} placeholder={field.placeholder} />;
  }
  if (field.type === "number") {
    return <Input type="number" value={value} onChange={(event) => onChange(event.target.value)} placeholder={field.placeholder} />;
  }
  return <Input value={value} onChange={(event) => onChange(event.target.value)} placeholder={field.placeholder} />;
}

export default function ConfigGeneratorPage() {
  const { toast } = useToast();
  const featureQuery = useConfigGeneratorFeature();
  const featureEnabled = featureQuery.data ?? false;
  const templatesQuery = useConfigGeneratorTemplates(featureEnabled);
  const scopeQuery = useConfigGeneratorSuggestionScope(featureEnabled);
  const [tenantId, setTenantId] = useState<string>("");
  const deviceSuggestionsQuery = useConfigGeneratorSuggestionDevices(tenantId ? Number(tenantId) : null, featureEnabled);
  const [deviceId, setDeviceId] = useState<string>("");
  const [templateId, setTemplateId] = useState<string>("");
  const [form, setForm] = useState<FormState>({});
  const [fieldOrigins, setFieldOrigins] = useState<OriginState>({});
  const [dirtyFields, setDirtyFields] = useState<Record<string, boolean>>({});
  const [preview, setPreview] = useState<ConfigGeneratorRenderResponse | null>(null);
  const [diff, setDiff] = useState<ConfigGeneratorDiffResponse | null>(null);
  const [validation, setValidation] = useState<ConfigGeneratorValidationSummary | null>(null);
  const [selectedRun, setSelectedRun] = useState<ConfigGeneratorRunDetail | null>(null);
  const [selectedArtifacts, setSelectedArtifacts] = useState<ConfigGeneratorArtifactResponse[]>([]);
  const suggestionTemplatesQuery = useConfigGeneratorSuggestionTemplates(
    tenantId ? Number(tenantId) : null,
    deviceId ? Number(deviceId) : null,
    null,
  );
  const selectedTemplateBase = useMemo(() => {
    const templatePool = suggestionTemplatesQuery.data?.templates?.length
      ? suggestionTemplatesQuery.data.templates
      : templatesQuery.data ?? [];
    return templatePool.find((template) => String(template.id) === templateId) ?? null;
  }, [suggestionTemplatesQuery.data?.templates, templatesQuery.data, templateId]);
  const selectedTemplate = selectedTemplateBase;
  const schemaQuery = useConfigGeneratorTemplateSchema(selectedTemplate?.latestVersionId ?? null);
  const deviceContextQuery = useConfigGeneratorSuggestionDeviceContext(
    tenantId ? Number(tenantId) : null,
    deviceId ? Number(deviceId) : null,
    featureEnabled,
  );
  const serviceContextQuery = useConfigGeneratorSuggestionServiceContext(
    tenantId ? Number(tenantId) : null,
    deviceId ? Number(deviceId) : null,
    selectedTemplate?.serviceType ?? null,
    deviceContextQuery.data?.l2Circuits[0]?.circuitId ?? deviceContextQuery.data?.tenantName ?? null,
    featureEnabled,
  );
  const runsQuery = useConfigGeneratorRuns(tenantId ? Number(tenantId) : null, deviceId ? Number(deviceId) : null, featureEnabled);
  const legacyDevicesQuery = useListDevices(undefined, { query: { enabled: featureEnabled, queryKey: ["config-generator", "devices", "fallback"] } });
  const pageError = featureQuery.error
    ?? templatesQuery.error
    ?? scopeQuery.error
    ?? deviceSuggestionsQuery.error
    ?? legacyDevicesQuery.error
    ?? schemaQuery.error
    ?? runsQuery.error
    ?? deviceContextQuery.error
    ?? serviceContextQuery.error;

  const tenantOptions = useMemo(() => {
    const scopeTenants = scopeQuery.data?.tenants ?? [];
    if (scopeTenants.length > 0) {
      return scopeTenants.map((tenant) => ({ tenantId: tenant.tenantId, tenantName: tenant.tenantName }));
    }
    const devices = (legacyDevicesQuery.data ?? []) as Array<{ tenantId?: number | null; tenantName?: string | null }>;
    return toTenantOptions(devices);
  }, [legacyDevicesQuery.data, scopeQuery.data?.tenants]);
  const deviceOptions = useMemo<DeviceOption[]>(() => {
    const scopedDevices = deviceSuggestionsQuery.data?.devices ?? [];
    if (scopedDevices.length > 0) {
      return scopedDevices.map((device) => ({
        id: device.deviceId,
        hostname: device.deviceName,
        tenantId: device.tenantId,
        tenantName: device.tenantName,
        vendor: device.vendor,
        platform: device.platform,
        status: device.status,
      }));
    }
    const devices = (legacyDevicesQuery.data ?? []) as Array<{
      id: number;
      hostname: string;
      vendor?: string | null;
      tenantId?: number | null;
      tenantName?: string | null;
    }>;
    return devices.filter((device) => !tenantId || String(device.tenantId ?? "") === tenantId).map((device) => ({
      id: device.id,
      hostname: device.hostname,
      tenantId: device.tenantId ?? null,
      tenantName: device.tenantName ?? null,
      vendor: device.vendor ?? "",
      platform: "",
      status: "unknown",
    }));
  }, [deviceSuggestionsQuery.data?.devices, legacyDevicesQuery.data, tenantId]);

  useEffect(() => {
    if (!selectedTemplate?.latestVersionId) return;
    setPreview(null);
    setDiff(null);
    setValidation(null);
  }, [selectedTemplate?.latestVersionId]);

  useEffect(() => {
    if (!schemaQuery.data?.version.schemaJson.fields) return;
    const next: FormState = {};
    const origins: OriginState = {};
    for (const field of schemaQuery.data.version.schemaJson.fields) {
      next[field.key] = defaultFormValue(field);
      origins[field.key] = "manual";
    }
    setForm(next);
    setFieldOrigins(origins);
    setDirtyFields({});
  }, [schemaQuery.data?.version.id]);

  useEffect(() => {
    if (tenantId && deviceOptions.length > 0 && !deviceOptions.some((device) => String(device.id) === deviceId)) {
      setDeviceId(String(deviceOptions[0]?.id ?? ""));
    }
  }, [deviceOptions, deviceId, tenantId]);

  useEffect(() => {
    setForm({});
    setFieldOrigins({});
    setDirtyFields({});
    setTemplateId("");
    setPreview(null);
    setDiff(null);
    setValidation(null);
  }, [tenantId, deviceId]);

  useEffect(() => {
    const templatePool = suggestionTemplatesQuery.data?.templates?.length ? suggestionTemplatesQuery.data.templates : templatesQuery.data ?? [];
    if (!templateId && templatePool.length) {
      setTemplateId(String(templatePool[0].id));
      return;
    }
    if (templateId && templatePool.length && !templatePool.some((template) => String(template.id) === templateId)) {
      setTemplateId(String(templatePool[0].id));
    }
  }, [suggestionTemplatesQuery.data?.templates, templateId, templatesQuery.data]);

  useEffect(() => {
    if (!schemaQuery.data?.version.schemaJson.fields) return;
    const contextSources = [deviceContextQuery.data, serviceContextQuery.data];
    if (contextSources.every((source) => !source)) return;
    setForm((current) => {
      const next = { ...current };
      for (const source of contextSources) {
        if (!source) continue;
        for (const [key, value] of Object.entries(source.suggestedInput ?? {})) {
          if (dirtyFields[key]) continue;
          if (value == null || value === "") continue;
          next[key] = valueToFormValue(value);
        }
      }
      return next;
    });
    setFieldOrigins((current) => {
      const next = { ...current };
      for (const source of contextSources) {
        if (!source) continue;
        for (const [key, value] of Object.entries(source.suggestedInput ?? {})) {
          if (dirtyFields[key]) continue;
          if (value == null || value === "") continue;
          next[key] = source.fieldOrigins?.[key] ?? current[key] ?? "manual";
        }
      }
      return next;
    });
  }, [deviceContextQuery.data, dirtyFields, schemaQuery.data, serviceContextQuery.data]);

  useEffect(() => {
    if (!deviceContextQuery.data) return;
    const suggestedTemplate = (suggestionTemplatesQuery.data?.templates ?? templatesQuery.data ?? []).find((template) => template.serviceType === deviceContextQuery.data?.l2Circuits[0]?.circuitType);
    if (suggestedTemplate && String(suggestedTemplate.id) !== templateId) {
      setTemplateId(String(suggestedTemplate.id));
    }
  }, [deviceContextQuery.data, suggestionTemplatesQuery.data?.templates, templateId, templatesQuery.data]);

  const contextConflicts = [...(deviceContextQuery.data?.conflicts ?? []), ...(serviceContextQuery.data?.conflicts ?? [])];
  const blockingConflicts = contextConflicts.filter((item) => item.severity === "error");
  const templatePool = suggestionTemplatesQuery.data?.templates?.length ? suggestionTemplatesQuery.data.templates : templatesQuery.data ?? [];

  const payload = useMemo(() => {
    const tenant = tenantId ? Number(tenantId) : null;
    const device = deviceId ? Number(deviceId) : null;
    const template = selectedTemplate?.id ?? null;
    const version = selectedTemplate?.latestVersionId ?? null;
    if (!tenant || !device || !template) return null;
    return {
      tenantId: tenant,
      deviceId: device,
      templateId: template,
      templateVersionId: version,
      input: form,
      fieldOrigins,
    };
  }, [deviceId, fieldOrigins, form, selectedTemplate?.id, selectedTemplate?.latestVersionId, tenantId]);

  const validateMutation = useMutation({
    mutationFn: (payload: ConfigGeneratorRequest) => validateConfigGenerator(payload),
    onSuccess: (data) => {
      setValidation(data.validation);
      toast({ title: "Validação pronta", description: data.validation.status === "failed" ? "Erros encontrados" : "Sem bloqueios" });
    },
    onError: (error: Error) => toast({ title: "Erro", description: error.message, variant: "destructive" }),
  });

  const renderMutation = useMutation({
    mutationFn: (payload: ConfigGeneratorRequest) => renderConfigGenerator(payload),
    onSuccess: (data, variables) => {
      setPreview(data);
      setValidation(data.validation);
      void diffMutation.mutateAsync(variables).then(setDiff).catch(() => undefined);
      toast({ title: "Preview gerado" });
    },
    onError: (error: Error) => toast({ title: "Erro", description: error.message, variant: "destructive" }),
  });

  const saveMutation = useMutation({
    mutationFn: (payload: ConfigGeneratorRequest) => saveConfigGeneratorRun(payload),
    onSuccess: (data) => {
      setPreview({
        ok: true,
        runPreviewId: data.runId,
        validation: data.validation,
        blocks: data.blocks,
        renderedConfig: data.renderedConfig,
        postcheckCommands: data.postcheckCommands,
        rollbackPlaceholder: data.rollbackPlaceholder,
      });
      setValidation(data.validation);
      void runsQuery.refetch();
      void diffRunMutation.mutateAsync(data.runId).then(setDiff).catch(() => undefined);
      toast({ title: "Geração salva" });
    },
    onError: (error: Error) => toast({ title: "Erro", description: error.message, variant: "destructive" }),
  });

  const diffMutation = useMutation({
    mutationFn: (payload: ConfigGeneratorRequest) => diffConfigGenerator(payload),
    onError: (error: Error) => toast({ title: "Erro", description: error.message, variant: "destructive" }),
  });

  const diffRunMutation = useMutation({
    mutationFn: (runId: number) => diffConfigGeneratorRun(runId),
    onError: (error: Error) => toast({ title: "Erro", description: error.message, variant: "destructive" }),
  });

  const loadRunMutation = useMutation({
    mutationFn: async (runId: number) => {
      const [detail, artifacts] = await Promise.all([fetchConfigGeneratorRun(runId), fetchConfigGeneratorRunArtifacts(runId)]);
      return { detail, artifacts };
    },
    onSuccess: (data) => {
      setSelectedRun(data.detail);
      setSelectedArtifacts(data.artifacts);
      setPreview({
        ok: true,
        runPreviewId: data.detail.id,
        validation: data.detail.validationSummary,
        blocks: data.artifacts
          .filter((artifact) => ["candidate_config", "postcheck_commands", "rollback_placeholder"].includes(artifact.artifactType))
          .map((artifact) => ({
            key: artifact.artifactType,
            title: artifact.artifactType.replace(/_/g, " "),
            classification: artifact.artifactType === "candidate_config" ? "circuit" : "global",
            status: artifact.artifactType === "candidate_config" ? "new" : "manual",
            content: artifact.content,
          })),
        renderedConfig: data.detail.renderedConfig,
        postcheckCommands: data.artifacts.find((artifact) => artifact.artifactType === "postcheck_commands")?.content ?? "",
        rollbackPlaceholder: data.artifacts.find((artifact) => artifact.artifactType === "rollback_placeholder")?.content ?? "",
      });
      setValidation(data.detail.validationSummary);
      void diffRunMutation.mutateAsync(data.detail.id).then(setDiff).catch(() => undefined);
    },
    onError: (error: Error) => toast({ title: "Erro", description: error.message, variant: "destructive" }),
  });

  const validationErrorMessage = errorMessage(validateMutation.error);
  const renderErrorMessage = errorMessage(renderMutation.error);
  const saveErrorMessage = errorMessage(saveMutation.error);
  const diffErrorMessage = errorMessage(diffMutation.error ?? diffRunMutation.error);
  const runsErrorMessage = errorMessage(runsQuery.error);
  const currentFieldOrigins = fieldOrigins;
  const hasBlockingValidation = Boolean(validation?.errors.length);
  const hasBlockingDiff = Boolean(diff?.blocking);

  if (featureQuery.isLoading) {
    return <div className="p-6"><Skeleton className="h-80 w-full" /></div>;
  }

  if (pageError) {
    return (
      <div className="space-y-6">
        <Alert variant="destructive">
          <ShieldAlert className="h-4 w-4" />
          <AlertTitle>Config Generator indisponível</AlertTitle>
          <AlertDescription>
            Falha ao carregar dados do módulo. Nenhum comando será enviado ao dispositivo neste MVP.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  if (!featureEnabled) {
    return (
      <div className="space-y-6">
        <Card className="border-dashed">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ShieldAlert className="h-5 w-5" />
              Config Generator
            </CardTitle>
            <CardDescription>Module disabled by feature flag.</CardDescription>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            CONFIG_GENERATOR_ENABLED=false. Module only appears when flag is on.
          </CardContent>
        </Card>
      </div>
    );
  }

  const schemaFields = schemaQuery.data?.version.schemaJson.fields ?? [];
  const blocks = preview?.blocks ?? [];

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <FileText className="h-6 w-6" />
          <h1 className="text-2xl font-bold tracking-tight">Provisioning</h1>
        </div>
        <p className="text-sm text-muted-foreground max-w-3xl">
          Config Generator engine. Preview-only. No device apply in this MVP.
        </p>
      </div>

      <Alert>
        <AlertTriangle className="h-4 w-4" />
        <AlertTitle>Execution disabled</AlertTitle>
        <AlertDescription>Execução em dispositivo não habilitada neste MVP. Este módulo gera apenas preview e artefatos.</AlertDescription>
      </Alert>
      <p className="text-xs text-muted-foreground">
        O script deve ser revisado por um operador antes de qualquer aplicação manual. Secrets não são persistidos no histórico.
      </p>

      <div className="grid gap-6 xl:grid-cols-[420px_1fr]">
        <Card className="border-border">
          <CardHeader>
            <CardTitle>Context</CardTitle>
            <CardDescription>Tenant, device, template, schema.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {tenantOptions.length === 0 || templatePool.length === 0 ? (
              <Alert>
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle>Dados insuficientes</AlertTitle>
                <AlertDescription>
                  É preciso ter tenants, devices e templates ativos para gerar preview.
                </AlertDescription>
              </Alert>
            ) : null}
            <div className="space-y-2">
              <Label>Tenant</Label>
              <Select value={tenantId} onValueChange={(value) => { setTenantId(value); setDeviceId(""); }}>
                <SelectTrigger><SelectValue placeholder="Select tenant" /></SelectTrigger>
                <SelectContent>
                  {tenantOptions.map((tenant) => <SelectItem key={tenant.tenantId} value={String(tenant.tenantId)}>{tenant.tenantName}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Device</Label>
              <Select value={deviceId} onValueChange={setDeviceId}>
                <SelectTrigger><SelectValue placeholder="Select device" /></SelectTrigger>
                <SelectContent>
                  {deviceOptions.map((device) => (
                    <SelectItem key={device.id} value={String(device.id)}>
                      {device.hostname} {device.vendor ? `· ${device.vendor}` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">Device comes from inventory/discovery data.</p>
            </div>

            <div className="space-y-2">
              <Label>Template</Label>
              <Select value={templateId} onValueChange={setTemplateId}>
                <SelectTrigger><SelectValue placeholder="Select template" /></SelectTrigger>
                <SelectContent>
                  {templatePool.map((template) => (
                    <SelectItem key={template.id} value={String(template.id)}>
                      {template.name} · {template.vendor}/{template.platform}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Template schema</Label>
                {schemaQuery.data?.version ? <Badge variant="outline">v{schemaQuery.data.version.version}</Badge> : null}
              </div>
              <div className="rounded-lg border bg-muted/20 p-3 text-xs text-muted-foreground">
                  {schemaQuery.data ? (
                    <pre className="whitespace-pre-wrap font-mono">{JSON.stringify(schemaQuery.data.version.schemaJson, null, 2)}</pre>
                  ) : schemaQuery.isFetching ? (
                    <Skeleton className="h-24 w-full" />
                  ) : (
                    "Choose template to load schema."
                  )}
              </div>
            </div>

            {deviceContextQuery.data ? (
              <Card className="border-dashed bg-muted/20">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm">Sugestões do inventory</CardTitle>
                  <CardDescription>{deviceContextQuery.data.vendor}/{deviceContextQuery.data.platform} · {deviceContextQuery.data.deviceName}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-2 text-xs">
                  <p>{deviceContextQuery.data.interfaces.length} interfaces descobertas</p>
                  <p>{deviceContextQuery.data.bgp.peers.length} peers BGP sugeridos</p>
                  <p>{deviceContextQuery.data.globalDependencies.filter((item) => item.classification === "global").length} dependências globais</p>
                  {deviceContextQuery.data.conflicts.length > 0 ? (
                    <div className="space-y-1">
                      {deviceContextQuery.data.conflicts.map((item) => (
                        <div key={item.code} className={item.severity === "error" ? "text-red-400" : "text-amber-300"}>
                          {item.message}
                        </div>
                      ))}
                    </div>
                  ) : null}
                </CardContent>
              </Card>
            ) : null}

            {serviceContextQuery.data ? (
              <Card className="border-dashed bg-muted/20">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm">Sugestões do serviço</CardTitle>
                  <CardDescription>{serviceContextQuery.data.serviceType} · {serviceContextQuery.data.ref ?? "sem ref"}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-2 text-xs">
                  {serviceContextQuery.data.notes.map((note) => <p key={note}>{note}</p>)}
                  {serviceContextQuery.data.conflicts.length > 0 ? (
                    <div className="space-y-1">
                      {serviceContextQuery.data.conflicts.map((item) => (
                        <div key={item.code} className={item.severity === "error" ? "text-red-400" : "text-amber-300"}>
                          {item.message}
                        </div>
                      ))}
                    </div>
                  ) : null}
                </CardContent>
              </Card>
            ) : null}

            {tenantId && deviceId ? (
              <ConfigGeneratorIdAllocatorPanel
                tenantId={Number(tenantId)}
                deviceId={Number(deviceId)}
                serviceType={selectedTemplate?.serviceType ?? null}
                fieldOrigins={fieldOrigins}
                canRefresh
                onApplySuggestion={(field, value) => {
                  setForm((current) => ({ ...current, [field]: String(value) }));
                  setFieldOrigins((current) => ({ ...current, [field]: "id_allocator" }));
                  setDirtyFields((current) => ({ ...current, [field]: false }));
                }}
              />
            ) : null}

            <Separator />
            <div className="space-y-2">
              <p className="text-sm font-medium">Manual input</p>
              <p className="text-xs text-muted-foreground">Fields below are rendered from schema_json.</p>
            </div>

            <div className="space-y-4">
              {schemaFields.map((field) => (
                <div key={field.key} className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label>{field.label}{field.required ? " *" : ""}</Label>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="text-[10px] uppercase">{field.type}</Badge>
                      <Badge variant={currentFieldOrigins[field.key] && currentFieldOrigins[field.key] !== "manual" ? "secondary" : "outline"} className="text-[10px]">
                        {fieldOriginTitle(currentFieldOrigins[field.key])}
                      </Badge>
                    </div>
                  </div>
                  {renderField(field, form[field.key] ?? "", (value) => {
                    setForm((current) => ({ ...current, [field.key]: value }));
                    setFieldOrigins((current) => ({ ...current, [field.key]: "manual" }));
                    setDirtyFields((current) => ({ ...current, [field.key]: true }));
                  })}
                  {field.description ? <p className="text-xs text-muted-foreground">{field.description}</p> : null}
                </div>
              ))}
            </div>

            <div className="flex flex-wrap gap-2 pt-2">
                <Button
                  onClick={() => payload && validateMutation.mutate(payload)}
                  disabled={!payload || validateMutation.isPending}
                  variant="outline"
                >
                {validateMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Validar
              </Button>
              <Button
                  onClick={() => payload && renderMutation.mutate(payload)}
                  disabled={!payload || renderMutation.isPending || blockingConflicts.length > 0 || hasBlockingValidation}
                >
                {renderMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Gerar Preview
              </Button>
              <Button
                  onClick={() => payload && saveMutation.mutate(payload)}
                  disabled={!payload || saveMutation.isPending || blockingConflicts.length > 0 || hasBlockingValidation || hasBlockingDiff}
                  variant="secondary"
                >
                {saveMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Salvar Artefato
              </Button>
            </div>
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between gap-4">
                <span>Validation</span>
                {validation ? <Badge variant={validationBadgeVariant(validation.status)}>{validation.status}</Badge> : null}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {blockingConflicts.length > 0 ? (
                <Alert variant="destructive">
                  <AlertTriangle className="h-4 w-4" />
                  <AlertTitle>Conflito bloqueante</AlertTitle>
                  <AlertDescription>
                    {blockingConflicts.map((item) => item.message).join(" ")}
                  </AlertDescription>
                </Alert>
              ) : null}
              {validateMutation.error ? (
                <Alert variant="destructive">
                  <AlertTriangle className="h-4 w-4" />
                  <AlertTitle>Erro de validação</AlertTitle>
                  <AlertDescription>{validationErrorMessage}</AlertDescription>
                </Alert>
              ) : null}
              {!validation ? (
                <p className="text-sm text-muted-foreground">Run validation to see warnings and errors.</p>
              ) : (
                <>
                  {validation.errors.length > 0 ? (
                    <div className="space-y-2">
                      <p className="text-sm font-semibold text-red-400">Errors</p>
                      {validation.errors.map((item) => (
                        <div key={`${item.code}-${item.message}`} className="rounded-md border border-red-900/40 bg-red-950/20 p-3 text-sm">
                          <p className="font-medium">{item.message}</p>
                          <p className="text-xs text-muted-foreground">{item.code}</p>
                        </div>
                      ))}
                    </div>
                  ) : null}
                  {validation.warnings.length > 0 ? (
                    <div className="space-y-2">
                      <p className="text-sm font-semibold text-amber-300">Warnings</p>
                      {validation.warnings.map((item) => (
                        <div key={`${item.code}-${item.message}`} className="rounded-md border border-amber-900/40 bg-amber-950/20 p-3 text-sm">
                          <p className="font-medium">{item.message}</p>
                          <p className="text-xs text-muted-foreground">{item.code}</p>
                        </div>
                      ))}
                    </div>
                  ) : null}
                </>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between gap-4">
                <span>Pré-check / Diff com configuração atual</span>
                {diff ? <Badge variant={diff.blocking ? "destructive" : "secondary"}>{diff.blocking ? "blocking" : "preview"}</Badge> : null}
              </CardTitle>
              <CardDescription>Baseline coletado, diff textual e diff semântico. Nenhum objeto global vira remoção automática.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {diffMutation.isPending || diffRunMutation.isPending ? (
                <Skeleton className="h-24 w-full" />
              ) : null}
              {diffErrorMessage && (diffMutation.error || diffRunMutation.error) ? (
                <Alert variant="destructive">
                  <AlertTriangle className="h-4 w-4" />
                  <AlertTitle>Erro no pré-check</AlertTitle>
                  <AlertDescription>{diffErrorMessage}</AlertDescription>
                </Alert>
              ) : null}
              {!preview ? (
                <p className="text-sm text-muted-foreground">Generate preview first to calculate diff.</p>
              ) : diff ? (
                <>
                  <div className="flex flex-wrap gap-2">
                    <Badge variant="outline">source: {diff.baseline.source}</Badge>
                    <Badge variant="outline">collected: {diff.baseline.collectedAt ? new Date(diff.baseline.collectedAt).toLocaleString() : "n/a"}</Badge>
                    <Badge variant="outline">already {diff.summary.alreadyPresent}</Badge>
                    <Badge variant="outline">new {diff.summary.newCandidate}</Badge>
                    <Badge variant="destructive">conflicts {diff.summary.conflicts}</Badge>
                    <Badge variant="secondary">manual {diff.summary.manualReview}</Badge>
                    <Badge variant="secondary">global existing {diff.summary.globalExisting}</Badge>
                    <Badge variant="secondary">global missing {diff.summary.globalMissing}</Badge>
                    {diff.blocking ? <Badge variant="destructive">blocking</Badge> : null}
                  </div>
                  {diff.baseline.source === "none" ? (
                    <Alert>
                      <AlertTriangle className="h-4 w-4" />
                      <AlertTitle>Sem baseline recente</AlertTitle>
                      <AlertDescription>Não há configuração coletada recente para este device. Diff semântico não pôde ser calculado.</AlertDescription>
                    </Alert>
                  ) : null}
                  {diff.warnings.length > 0 ? (
                    <div className="space-y-2">
                      {diff.warnings.map((item) => (
                        <Alert key={`${item.code}-${item.message}`}>
                          <AlertTriangle className="h-4 w-4" />
                          <AlertTitle>{item.code}</AlertTitle>
                          <AlertDescription>{item.message}</AlertDescription>
                        </Alert>
                      ))}
                    </div>
                  ) : null}
                  {diff.errors.length > 0 ? (
                    <div className="space-y-2">
                      {diff.errors.map((item) => (
                        <Alert key={`${item.code}-${item.message}`} variant="destructive">
                          <AlertTriangle className="h-4 w-4" />
                          <AlertTitle>{item.code}</AlertTitle>
                          <AlertDescription>{item.message}</AlertDescription>
                        </Alert>
                      ))}
                    </div>
                  ) : null}
                  <div className="space-y-3">
                    {diff.blocks.map((block) => (
                      <div key={block.key} className="rounded-lg border p-3 space-y-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge variant={block.classification === "global" ? "secondary" : "outline"}>{diffBlockSummaryLabel(block.status)}</Badge>
                          <span className="font-medium">{block.title}</span>
                          <Badge variant={diffStatusVariant(block.status)} className="text-[10px] uppercase">
                            {diffStatusLabel(block.status)}
                          </Badge>
                        </div>
                        <div className="space-y-2">
                          {block.items.map((item) => (
                            <div key={`${block.key}-${item.line}`} className="flex flex-col gap-1 rounded-md border bg-muted/10 p-2 text-xs">
                              <div className="flex flex-wrap items-center gap-2">
                                <Badge variant={diffStatusVariant(item.status)} className="text-[10px] uppercase">
                                  {diffStatusLabel(item.status)}
                                </Badge>
                                <span className="font-mono">{item.line}</span>
                              </div>
                              {item.details ? <p className="text-muted-foreground">{item.details}</p> : null}
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <p className="text-sm text-muted-foreground">Generate preview first to calculate diff.</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between gap-4">
                <span>Preview</span>
                {preview ? <Badge variant="outline">run #{preview.runPreviewId}</Badge> : null}
              </CardTitle>
              <CardDescription>Global deps, circuit deps, postcheck and rollback placeholders.</CardDescription>
            </CardHeader>
            <CardContent>
              {renderMutation.error ? (
                <Alert variant="destructive" className="mb-4">
                  <AlertTriangle className="h-4 w-4" />
                  <AlertTitle>Erro de preview</AlertTitle>
                  <AlertDescription>{renderErrorMessage}</AlertDescription>
                </Alert>
              ) : null}
              {!preview ? (
                <p className="text-sm text-muted-foreground">Generate preview first.</p>
              ) : (
                <Accordion type="multiple" className="w-full">
                  {blocks.map((block) => (
                    <AccordionItem key={block.key} value={block.key}>
                      <AccordionTrigger>
                        <div className="flex items-center gap-2 text-left">
                          <span>{block.title}</span>
                          <Badge variant={blockBadgeVariant(block.classification)} className="text-[10px] uppercase">
                            {block.classification}
                          </Badge>
                          <Badge variant={blockStatusVariant(block.status)} className="text-[10px] uppercase">
                            {block.status}
                          </Badge>
                        </div>
                      </AccordionTrigger>
                      <AccordionContent>
                        <pre className="overflow-x-auto rounded-md bg-black/80 p-3 text-xs font-mono text-green-300 whitespace-pre-wrap">
                          {block.content}
                        </pre>
                      </AccordionContent>
                    </AccordionItem>
                  ))}
                </Accordion>
              )}
              {preview ? (
                <div className="mt-4 flex flex-wrap gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => copyText(preview.renderedConfig)}
                  >
                    <Copy className="mr-2 h-4 w-4" />
                    Copiar
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => downloadText(`config-generator-${preview.runPreviewId}.txt`, preview.renderedConfig)}
                  >
                    <Download className="mr-2 h-4 w-4" />
                    Baixar TXT
                  </Button>
                </div>
              ) : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Rendered config</CardTitle>
            </CardHeader>
          <CardContent>
            {saveMutation.error ? (
              <Alert variant="destructive" className="mb-4">
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle>Erro ao salvar</AlertTitle>
                <AlertDescription>{saveErrorMessage}</AlertDescription>
              </Alert>
            ) : null}
            <Textarea readOnly value={preview?.renderedConfig ?? ""} className="min-h-72 font-mono text-xs" />
          </CardContent>
        </Card>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>History</CardTitle>
          <CardDescription>Últimas gerações para tenant/device selecionado.</CardDescription>
        </CardHeader>
        <CardContent>
          {runsQuery.error ? (
            <Alert variant="destructive" className="mb-4">
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>Erro no histórico</AlertTitle>
              <AlertDescription>{runsErrorMessage}</AlertDescription>
            </Alert>
          ) : null}
          {runsQuery.isLoading ? (
            <Skeleton className="h-32 w-full" />
          ) : (
            <div className="space-y-3">
              {(runsQuery.data ?? []).map((run) => (
                <div key={run.id} className="flex flex-col gap-3 rounded-lg border p-4 xl:flex-row xl:items-center xl:justify-between">
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="outline">#{run.id}</Badge>
                      <Badge variant={run.status === "saved" ? "default" : "secondary"}>{run.status}</Badge>
                      <Badge variant="secondary">{run.riskLevel}</Badge>
                    </div>
                    <p className="text-sm font-medium">{run.templateName ?? "Template"}</p>
                    <p className="text-xs text-muted-foreground">
                      {run.deviceHostname ?? `device ${run.deviceId}`} · {new Date(run.createdAt).toLocaleString()}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" variant="outline" onClick={() => loadRunMutation.mutate(run.id)}>
                      <Eye className="mr-2 h-4 w-4" />
                      Load
                    </Button>
                  </div>
                </div>
              ))}
              {(runsQuery.data ?? []).length === 0 ? (
                <p className="text-sm text-muted-foreground">No generations yet.</p>
              ) : null}
            </div>
          )}
        </CardContent>
      </Card>

      {selectedRun ? (
        <Card>
          <CardHeader>
            <CardTitle>Loaded run #{selectedRun.id}</CardTitle>
            <CardDescription>{selectedRun.templateName} · {selectedRun.deviceHostname}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <pre className="rounded-lg bg-muted/20 p-4 text-xs font-mono overflow-x-auto">{JSON.stringify(selectedRun.inputJson, null, 2)}</pre>
            <div className="flex flex-wrap gap-2">
              {selectedArtifacts.map((artifact) => (
                <Badge key={artifact.id} variant="outline">{artifact.artifactType}</Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
