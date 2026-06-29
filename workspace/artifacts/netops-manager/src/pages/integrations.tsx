import { useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { getListIntegrationsQueryKey, useListIntegrations, useUpdateIntegration, type IntegrationSetting } from "@workspace/api-client-react";
import { useAuth } from "@/components/auth-provider";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { useTranslation } from "@/i18n";
import { Globe2, Webhook, Activity, Save, RefreshCw, ShieldCheck, Database, PlayCircle, ListTree } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

type IntegrationCardName = "netbox" | "future_webhook" | "future_zabbix";

type IntegrationCard = {
  name: IntegrationCardName;
  icon: typeof Globe2;
};

type NetBoxStatus = {
  enabled: boolean;
  baseUrl: string | null;
  tokenConfigured: boolean;
  skipTlsVerify: boolean;
  timeoutMs: number;
  pageSize: number;
  readiness: "disabled" | "partial" | "ready";
  lastConnectionStatus: string | null;
  lastConnectionAt: string | null;
  baseUrlConfigured: boolean;
};

type NetBoxPreviewItem = {
  netboxDeviceId: number;
  hostname: string;
  ipAddress: string | null;
  site: string | null;
  role: string | null;
  vendor: string | null;
  platform: string | null;
  action: "create" | "update" | "skip";
  matchedLocalDeviceId: number | null;
  warnings: string[];
};

type NetBoxPreview = {
  summary: {
    totalFromNetBox: number;
    matchedByNetboxId: number;
    matchedByHostname: number;
    toCreate: number;
    toUpdate: number;
    toSkip: number;
    warnings: number;
  };
  items: NetBoxPreviewItem[];
};

const INTEGRATION_CARDS: IntegrationCard[] = [
  { name: "netbox", icon: Globe2 },
  { name: "future_webhook", icon: Webhook },
  { name: "future_zabbix", icon: Activity },
];

async function apiJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers || {}),
    },
    ...init,
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(data?.error ?? "Request failed");
  }
  return data as T;
}

export default function IntegrationsPage() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { data: integrations, isLoading } = useListIntegrations();
  const updateIntegration = useUpdateIntegration();
  const [drafts, setDrafts] = useState<Record<string, { enabled: boolean; baseUrl: string; notes: string; skipTlsVerify: boolean }>>({});
  const [netboxStatus, setNetboxStatus] = useState<NetBoxStatus | null>(null);
  const [netboxLoading, setNetboxLoading] = useState(false);
  const [netboxPreview, setNetboxPreview] = useState<NetBoxPreview | null>(null);
  const [netboxDevices, setNetboxDevices] = useState<Array<Record<string, unknown>> | null>(null);
  const [netboxSites, setNetboxSites] = useState<Array<Record<string, unknown>> | null>(null);

  const isOperator = user?.role === "operator" || user?.role === "admin";
  const isAdmin = user?.role === "admin";

  const byName = useMemo(() => {
    const map = new Map<string, IntegrationSetting>();
    integrations?.forEach((item) => map.set(item.name, item));
    return map;
  }, [integrations]);

  useEffect(() => {
    void (async () => {
      try {
        const status = await apiJson<NetBoxStatus>("/api/netbox/status");
        setNetboxStatus(status);
      } catch (error) {
        setNetboxStatus(null);
      }
    })();
  }, []);

  const getDraft = (name: string) => {
    const existing = byName.get(name);
    if (!existing) return { enabled: false, baseUrl: "", notes: "", skipTlsVerify: false };
    const config = existing.configJson as Record<string, unknown> | null | undefined;
    return drafts[name] ?? {
      enabled: existing.enabled,
      baseUrl: typeof config?.baseUrl === "string" ? config.baseUrl : "",
      notes: typeof config?.notes === "string" ? config.notes : "",
      skipTlsVerify: Boolean(config?.skipTlsVerify),
    };
  };

  const saveIntegration = (name: string) => {
    const draft = getDraft(name);
    updateIntegration.mutate({
      name,
      data: {
        enabled: draft.enabled,
        configJson: {
          baseUrl: draft.baseUrl || null,
          notes: draft.notes || t("integrations.futureNotesDefault"),
          readiness: "future",
          skipTlsVerify: draft.skipTlsVerify,
          tokenConfigured: false,
        },
      },
    }, {
      onSuccess: async () => {
        await queryClient.invalidateQueries({ queryKey: getListIntegrationsQueryKey() });
        toast({ title: t("integrations.toast.saved") });
      },
      onError: () => toast({ title: t("integrations.toast.saveFailed"), variant: "destructive" }),
    });
  };

  const refreshNetBoxStatus = async () => {
    setNetboxLoading(true);
    try {
      const status = await apiJson<NetBoxStatus>("/api/netbox/status");
      setNetboxStatus(status);
    } catch (error) {
      toast({
        title: t("integrations.toast.loadNetboxFailed"),
        description: error instanceof Error ? error.message : t("common.error"),
        variant: "destructive",
      });
    } finally {
      setNetboxLoading(false);
    }
  };

  const testNetBox = async () => {
    setNetboxLoading(true);
    try {
      const result = await apiJson<Record<string, unknown>>("/api/netbox/test-connection", { method: "POST" });
      toast({ title: t("integrations.toast.netboxTest"), description: String(result.message ?? "OK") });
      await refreshNetBoxStatus();
    } catch (error) {
      toast({
        title: t("integrations.toast.netboxTestFailed"),
        description: error instanceof Error ? error.message : t("common.error"),
        variant: "destructive",
      });
    } finally {
      setNetboxLoading(false);
    }
  };

  const loadNetBoxDevices = async () => {
    setNetboxLoading(true);
    try {
      const result = await apiJson<{ count: number; items: Array<Record<string, unknown>> }>("/api/netbox/devices");
      setNetboxDevices(result.items);
      toast({
        title: t("integrations.toast.devicesLoaded"),
        description: t("integrations.toast.itemsCount", { count: result.count }),
      });
    } catch (error) {
      toast({
        title: t("integrations.toast.listDevicesFailed"),
        description: error instanceof Error ? error.message : t("common.error"),
        variant: "destructive",
      });
    } finally {
      setNetboxLoading(false);
    }
  };

  const loadNetBoxSites = async () => {
    setNetboxLoading(true);
    try {
      const result = await apiJson<{ count: number; items: Array<Record<string, unknown>> }>("/api/netbox/sites");
      setNetboxSites(result.items);
    } catch (error) {
      toast({
        title: t("integrations.toast.listSitesFailed"),
        description: error instanceof Error ? error.message : t("common.error"),
        variant: "destructive",
      });
    } finally {
      setNetboxLoading(false);
    }
  };

  const previewNetBoxSync = async () => {
    setNetboxLoading(true);
    try {
      const result = await apiJson<NetBoxPreview>("/api/netbox/devices/preview-sync", { method: "POST" });
      setNetboxPreview(result);
      toast({
        title: t("integrations.toast.previewReady"),
        description: t("integrations.toast.previewSummary", {
          create: result.summary.toCreate,
          update: result.summary.toUpdate,
        }),
      });
    } catch (error) {
      toast({
        title: t("integrations.toast.previewFailed"),
        description: error instanceof Error ? error.message : t("common.error"),
        variant: "destructive",
      });
    } finally {
      setNetboxLoading(false);
    }
  };

  const syncNetBoxLocal = async () => {
    setNetboxLoading(true);
    try {
      const result = await apiJson<Record<string, unknown>>("/api/netbox/devices/sync-local", { method: "POST" });
      toast({
        title: t("integrations.toast.syncDone"),
        description: t("integrations.toast.syncSummary", {
          created: Number(result.created ?? 0),
          updated: Number(result.updated ?? 0),
        }),
      });
      await refreshNetBoxStatus();
    } catch (error) {
      toast({
        title: t("integrations.toast.syncFailed"),
        description: error instanceof Error ? error.message : t("common.error"),
        variant: "destructive",
      });
    } finally {
      setNetboxLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{t("integrations.title")}</h1>
        <p className="mt-1 text-muted-foreground">{t("integrations.pageSubtitle")}</p>
      </div>

      <Card className="border-primary/30 bg-primary/5">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <ShieldCheck className="h-4 w-4" />
            {t("integrations.netboxReadOnlySync")}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            {t("integrations.netboxReadOnlyDesc")}
          </p>

          <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-6">
            <div className="rounded-md border bg-muted/20 p-3">
              <div className="text-xs uppercase tracking-wide text-muted-foreground">{t("common.enabled")}</div>
              <div className="mt-1 text-sm font-semibold">{netboxStatus?.enabled ? t("common.yes") : t("common.no")}</div>
            </div>
            <div className="rounded-md border bg-muted/20 p-3">
              <div className="text-xs uppercase tracking-wide text-muted-foreground">{t("integrations.baseUrl")}</div>
              <div className="mt-1 text-sm font-semibold">
                {netboxStatus?.baseUrlConfigured ? t("integrations.configured") : t("integrations.missing")}
              </div>
            </div>
            <div className="rounded-md border bg-muted/20 p-3">
              <div className="text-xs uppercase tracking-wide text-muted-foreground">{t("integrations.token")}</div>
              <div className="mt-1 text-sm font-semibold">
                {netboxStatus?.tokenConfigured ? t("integrations.configured") : t("integrations.missing")}
              </div>
            </div>
            <div className="rounded-md border bg-muted/20 p-3">
              <div className="text-xs uppercase tracking-wide text-muted-foreground">{t("integrations.tlsSkip")}</div>
              <div className="mt-1 text-sm font-semibold">{netboxStatus?.skipTlsVerify ? t("common.yes") : t("common.no")}</div>
            </div>
            <div className="rounded-md border bg-muted/20 p-3">
              <div className="text-xs uppercase tracking-wide text-muted-foreground">{t("integrations.lastTest")}</div>
              <div className="mt-1 text-sm font-semibold">{netboxStatus?.lastConnectionStatus ?? t("integrations.na")}</div>
            </div>
            <div className="rounded-md border bg-muted/20 p-3">
              <div className="text-xs uppercase tracking-wide text-muted-foreground">{t("integrations.readiness")}</div>
              <div className="mt-1 text-sm font-semibold">{netboxStatus?.readiness ?? "disabled"}</div>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button onClick={refreshNetBoxStatus} disabled={netboxLoading}>
              <RefreshCw className="mr-2 h-4 w-4" />
              {t("common.refresh")}
            </Button>
            {isOperator && (
              <>
                <Button variant="secondary" onClick={testNetBox} disabled={netboxLoading}>
                  <PlayCircle className="mr-2 h-4 w-4" />
                  {t("integrations.testConnection")}
                </Button>
                <Button variant="secondary" onClick={loadNetBoxDevices} disabled={netboxLoading}>
                  <ListTree className="mr-2 h-4 w-4" />
                  {t("integrations.listDevices")}
                </Button>
                <Button variant="secondary" onClick={loadNetBoxSites} disabled={netboxLoading}>
                  <Database className="mr-2 h-4 w-4" />
                  {t("integrations.listSites")}
                </Button>
                <Button variant="secondary" onClick={previewNetBoxSync} disabled={netboxLoading}>
                  {t("integrations.previewSync")}
                </Button>
              </>
            )}
            {isAdmin && (
              <Button onClick={syncNetBoxLocal} disabled={netboxLoading}>
                {t("integrations.syncLocal")}
              </Button>
            )}
          </div>

          {netboxStatus?.lastConnectionAt && (
            <div className="text-xs text-muted-foreground">
              {t("integrations.lastTestAt", { at: netboxStatus.lastConnectionAt })}
            </div>
          )}
        </CardContent>
      </Card>

      {netboxPreview && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("integrations.previewSync")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-6">
              {Object.entries(netboxPreview.summary).map(([key, value]) => (
                <div key={key} className="rounded-md border bg-muted/20 p-3">
                  <div className="text-xs uppercase tracking-wide text-muted-foreground">{key}</div>
                  <div className="mt-1 text-sm font-semibold">{String(value)}</div>
                </div>
              ))}
            </div>
            <div className="overflow-x-auto rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("integrations.table.hostname")}</TableHead>
                    <TableHead>{t("integrations.table.ip")}</TableHead>
                    <TableHead>{t("integrations.table.site")}</TableHead>
                    <TableHead>{t("integrations.table.role")}</TableHead>
                    <TableHead>{t("integrations.table.action")}</TableHead>
                    <TableHead>{t("integrations.table.warnings")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {netboxPreview.items.map((item) => (
                    <TableRow key={`${item.netboxDeviceId}-${item.hostname}`}>
                      <TableCell className="font-medium">{item.hostname}</TableCell>
                      <TableCell>{item.ipAddress ?? "-"}</TableCell>
                      <TableCell>{item.site ?? "-"}</TableCell>
                      <TableCell>{item.role ?? "-"}</TableCell>
                      <TableCell>
                        <Badge variant={item.action === "create" ? "default" : item.action === "update" ? "secondary" : "outline"}>
                          {item.action}
                        </Badge>
                      </TableCell>
                      <TableCell className="max-w-[28rem] text-xs text-muted-foreground">
                        {item.warnings.length > 0 ? item.warnings.join(" | ") : "-"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      {netboxDevices && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("integrations.devicesPreview")}</CardTitle>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("integrations.table.name")}</TableHead>
                  <TableHead>{t("integrations.table.ip")}</TableHead>
                  <TableHead>{t("integrations.table.site")}</TableHead>
                  <TableHead>{t("integrations.table.role")}</TableHead>
                  <TableHead>{t("integrations.table.vendor")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {netboxDevices.slice(0, 20).map((item) => (
                  <TableRow key={String(item.id)}>
                    <TableCell className="font-medium">{String(item.name ?? item.displayName ?? item.id)}</TableCell>
                    <TableCell>{String(item.ipAddress ?? "-")}</TableCell>
                    <TableCell>{String(item.siteName ?? "-")}</TableCell>
                    <TableCell>{String(item.roleName ?? "-")}</TableCell>
                    <TableCell>{String(item.vendor ?? "-")}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {netboxSites && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("integrations.sitesPreview")}</CardTitle>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("integrations.table.name")}</TableHead>
                  <TableHead>{t("integrations.table.slug")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {netboxSites.slice(0, 20).map((item) => (
                  <TableRow key={String(item.id)}>
                    <TableCell className="font-medium">{String(item.name ?? item.displayName ?? item.id)}</TableCell>
                    <TableCell>{String(item.slug ?? "-")}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 xl:grid-cols-3">
        {INTEGRATION_CARDS.map((card) => {
          const integration = byName.get(card.name);
          const draft = getDraft(card.name);
          const Icon = card.icon;

          return (
            <Card key={card.name}>
              <CardHeader>
                <CardTitle className="flex items-center justify-between gap-3 text-base">
                  <span className="flex items-center gap-2">
                    <Icon className="h-4 w-4" />
                    {t(`integrations.cards.${card.name}.title`)}
                  </span>
                  <Badge variant={draft.enabled ? "default" : "outline"}>
                    {draft.enabled ? t("common.enabled") : t("common.disabled")}
                  </Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-sm text-muted-foreground">{t(`integrations.cards.${card.name}.description`)}</p>

                {card.name === "netbox" && (
                  <>
                    <div className="grid gap-2 md:grid-cols-2">
                      <div className="space-y-2">
                        <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t("integrations.baseUrl")}</div>
                        <Input
                          value={draft.baseUrl}
                          onChange={(event) => setDrafts((current) => ({
                            ...current,
                            [card.name]: { ...draft, baseUrl: event.target.value },
                          }))}
                          placeholder={t("integrations.netboxUrlPlaceholder")}
                          disabled={!isAdmin}
                        />
                      </div>
                      <div className="space-y-2">
                        <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t("integrations.skipTls")}</div>
                        <div className="flex items-center justify-between rounded-md border bg-muted/20 px-3 py-2">
                          <div className="text-sm font-medium">NETBOX_SKIP_TLS_VERIFY</div>
                          <Switch
                            checked={draft.skipTlsVerify}
                            disabled={!isAdmin}
                            onCheckedChange={(checked) => setDrafts((current) => ({
                              ...current,
                              [card.name]: { ...draft, skipTlsVerify: checked },
                            }))}
                          />
                        </div>
                      </div>
                    </div>
                  </>
                )}

                <div className="space-y-2">
                  <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t("integrations.notes")}</div>
                  <Input
                    value={draft.notes}
                    onChange={(event) => setDrafts((current) => ({
                      ...current,
                      [card.name]: { ...draft, notes: event.target.value },
                    }))}
                    placeholder={t("integrations.futureNotesPlaceholder")}
                    disabled={!isAdmin}
                  />
                </div>

                <div className="flex items-center justify-between rounded-md border bg-muted/20 px-3 py-2">
                  <div>
                    <div className="text-sm font-medium">{t("common.enabled")}</div>
                    <div className="text-xs text-muted-foreground">{t("integrations.enabledHint")}</div>
                  </div>
                  <Switch
                    checked={draft.enabled}
                    disabled={!isAdmin}
                    onCheckedChange={(checked) => setDrafts((current) => ({
                      ...current,
                      [card.name]: { ...draft, enabled: checked },
                    }))}
                  />
                </div>

                <div className="text-xs text-muted-foreground">
                  {(() => {
                    const readiness = (integration as unknown as { readiness?: string } | undefined)?.readiness;
                    return t("integrations.readinessLabel", { value: readiness ?? "future" });
                  })()}
                </div>

                <Button className="w-full" onClick={() => saveIntegration(card.name)} disabled={updateIntegration.isPending || isLoading || !isAdmin}>
                  <Save className="mr-2 h-4 w-4" />
                  {t("integrations.saveReadiness")}
                </Button>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
