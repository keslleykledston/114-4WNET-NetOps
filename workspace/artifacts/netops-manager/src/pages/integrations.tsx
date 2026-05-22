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
import { Globe2, Webhook, Activity, Save, RefreshCw, ShieldCheck, Database, PlayCircle, ListTree } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

type IntegrationCard = {
  name: "netbox" | "future_webhook" | "future_zabbix";
  title: string;
  description: string;
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

const cards: IntegrationCard[] = [
  {
    name: "netbox",
    title: "NetBox",
    description: "Read-only sync. No write back to NetBox.",
    icon: Globe2,
  },
  {
    name: "future_webhook",
    title: "Webhook",
    description: "Prepared for future event delivery.",
    icon: Webhook,
  },
  {
    name: "future_zabbix",
    title: "Zabbix",
    description: "Prepared for future monitoring integration.",
    icon: Activity,
  },
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
          notes: draft.notes || "Integração preparada para fase futura",
          readiness: "future",
          skipTlsVerify: draft.skipTlsVerify,
          tokenConfigured: false,
        },
      },
    }, {
      onSuccess: async () => {
        await queryClient.invalidateQueries({ queryKey: getListIntegrationsQueryKey() });
        toast({ title: "Integração salva" });
      },
      onError: () => toast({ title: "Falha ao salvar integração", variant: "destructive" }),
    });
  };

  const refreshNetBoxStatus = async () => {
    setNetboxLoading(true);
    try {
      const status = await apiJson<NetBoxStatus>("/api/netbox/status");
      setNetboxStatus(status);
    } catch (error) {
      toast({ title: "Falha ao carregar NetBox", description: error instanceof Error ? error.message : "Erro", variant: "destructive" });
    } finally {
      setNetboxLoading(false);
    }
  };

  const testNetBox = async () => {
    setNetboxLoading(true);
    try {
      const result = await apiJson<Record<string, unknown>>("/api/netbox/test-connection", { method: "POST" });
      toast({ title: "NetBox test", description: String(result.message ?? "OK") });
      await refreshNetBoxStatus();
    } catch (error) {
      toast({ title: "Falha no teste NetBox", description: error instanceof Error ? error.message : "Erro", variant: "destructive" });
    } finally {
      setNetboxLoading(false);
    }
  };

  const loadNetBoxDevices = async () => {
    setNetboxLoading(true);
    try {
      const result = await apiJson<{ count: number; items: Array<Record<string, unknown>> }>("/api/netbox/devices");
      setNetboxDevices(result.items);
      toast({ title: "NetBox devices carregados", description: `${result.count} itens` });
    } catch (error) {
      toast({ title: "Falha ao listar NetBox", description: error instanceof Error ? error.message : "Erro", variant: "destructive" });
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
      toast({ title: "Falha ao listar sites", description: error instanceof Error ? error.message : "Erro", variant: "destructive" });
    } finally {
      setNetboxLoading(false);
    }
  };

  const previewNetBoxSync = async () => {
    setNetboxLoading(true);
    try {
      const result = await apiJson<NetBoxPreview>("/api/netbox/devices/preview-sync", { method: "POST" });
      setNetboxPreview(result);
      toast({ title: "Preview NetBox pronto", description: `Create ${result.summary.toCreate}, Update ${result.summary.toUpdate}` });
    } catch (error) {
      toast({ title: "Falha no preview", description: error instanceof Error ? error.message : "Erro", variant: "destructive" });
    } finally {
      setNetboxLoading(false);
    }
  };

  const syncNetBoxLocal = async () => {
    setNetboxLoading(true);
    try {
      const result = await apiJson<Record<string, unknown>>("/api/netbox/devices/sync-local", { method: "POST" });
      toast({ title: "Sync local feito", description: `Created ${result.created ?? 0}, Updated ${result.updated ?? 0}` });
      await refreshNetBoxStatus();
    } catch (error) {
      toast({ title: "Falha no sync local", description: error instanceof Error ? error.message : "Erro", variant: "destructive" });
    } finally {
      setNetboxLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Integrations</h1>
        <p className="mt-1 text-muted-foreground">Readiness only. NetBox mode is read-only.</p>
      </div>

      <Card className="border-primary/30 bg-primary/5">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <ShieldCheck className="h-4 w-4" />
            NetBox read-only sync
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Modo somente leitura. Nenhuma alteração será feita no NetBox.
          </p>

          <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-6">
            <div className="rounded-md border bg-muted/20 p-3">
              <div className="text-xs uppercase tracking-wide text-muted-foreground">Enabled</div>
              <div className="mt-1 text-sm font-semibold">{netboxStatus?.enabled ? "Yes" : "No"}</div>
            </div>
            <div className="rounded-md border bg-muted/20 p-3">
              <div className="text-xs uppercase tracking-wide text-muted-foreground">Base URL</div>
              <div className="mt-1 text-sm font-semibold">{netboxStatus?.baseUrlConfigured ? "Configured" : "Missing"}</div>
            </div>
            <div className="rounded-md border bg-muted/20 p-3">
              <div className="text-xs uppercase tracking-wide text-muted-foreground">Token</div>
              <div className="mt-1 text-sm font-semibold">{netboxStatus?.tokenConfigured ? "Configured" : "Missing"}</div>
            </div>
            <div className="rounded-md border bg-muted/20 p-3">
              <div className="text-xs uppercase tracking-wide text-muted-foreground">TLS skip</div>
              <div className="mt-1 text-sm font-semibold">{netboxStatus?.skipTlsVerify ? "Yes" : "No"}</div>
            </div>
            <div className="rounded-md border bg-muted/20 p-3">
              <div className="text-xs uppercase tracking-wide text-muted-foreground">Last test</div>
              <div className="mt-1 text-sm font-semibold">{netboxStatus?.lastConnectionStatus ?? "N/A"}</div>
            </div>
            <div className="rounded-md border bg-muted/20 p-3">
              <div className="text-xs uppercase tracking-wide text-muted-foreground">Readiness</div>
              <div className="mt-1 text-sm font-semibold">{netboxStatus?.readiness ?? "disabled"}</div>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button onClick={refreshNetBoxStatus} disabled={netboxLoading}>
              <RefreshCw className="mr-2 h-4 w-4" />
              Refresh
            </Button>
            {isOperator && (
              <>
                <Button variant="secondary" onClick={testNetBox} disabled={netboxLoading}>
                  <PlayCircle className="mr-2 h-4 w-4" />
                  Test connection
                </Button>
                <Button variant="secondary" onClick={loadNetBoxDevices} disabled={netboxLoading}>
                  <ListTree className="mr-2 h-4 w-4" />
                  List devices
                </Button>
                <Button variant="secondary" onClick={loadNetBoxSites} disabled={netboxLoading}>
                  <Database className="mr-2 h-4 w-4" />
                  List sites
                </Button>
                <Button variant="secondary" onClick={previewNetBoxSync} disabled={netboxLoading}>
                  Preview sync
                </Button>
              </>
            )}
            {isAdmin && (
              <Button onClick={syncNetBoxLocal} disabled={netboxLoading}>
                Sync local
              </Button>
            )}
          </div>

          {netboxStatus?.lastConnectionAt && (
            <div className="text-xs text-muted-foreground">
              Last test at {netboxStatus.lastConnectionAt}
            </div>
          )}
        </CardContent>
      </Card>

      {netboxPreview && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Preview sync</CardTitle>
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
                    <TableHead>Hostname</TableHead>
                    <TableHead>IP</TableHead>
                    <TableHead>Site</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Action</TableHead>
                    <TableHead>Warnings</TableHead>
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
            <CardTitle className="text-base">NetBox devices preview</CardTitle>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>IP</TableHead>
                  <TableHead>Site</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Vendor</TableHead>
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
            <CardTitle className="text-base">NetBox sites preview</CardTitle>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Slug</TableHead>
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
        {cards.map((card) => {
          const integration = byName.get(card.name);
          const draft = getDraft(card.name);
          const Icon = card.icon;

          return (
            <Card key={card.name}>
              <CardHeader>
                <CardTitle className="flex items-center justify-between gap-3 text-base">
                  <span className="flex items-center gap-2">
                    <Icon className="h-4 w-4" />
                    {card.title}
                  </span>
                  <Badge variant={draft.enabled ? "default" : "outline"}>
                    {draft.enabled ? "Enabled" : "Disabled"}
                  </Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-sm text-muted-foreground">{card.description}</p>

                {card.name === "netbox" && (
                  <>
                    <div className="grid gap-2 md:grid-cols-2">
                      <div className="space-y-2">
                        <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Base URL</div>
                        <Input
                          value={draft.baseUrl}
                          onChange={(event) => setDrafts((current) => ({
                            ...current,
                            [card.name]: { ...draft, baseUrl: event.target.value },
                          }))}
                          placeholder="https://netbox.example.com"
                          disabled={!isAdmin}
                        />
                      </div>
                      <div className="space-y-2">
                        <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Skip TLS</div>
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
                  <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Notes</div>
                  <Input
                    value={draft.notes}
                    onChange={(event) => setDrafts((current) => ({
                      ...current,
                      [card.name]: { ...draft, notes: event.target.value },
                    }))}
                    placeholder="Integração preparada para fase futura"
                    disabled={!isAdmin}
                  />
                </div>

                <div className="flex items-center justify-between rounded-md border bg-muted/20 px-3 py-2">
                  <div>
                    <div className="text-sm font-medium">Enabled</div>
                    <div className="text-xs text-muted-foreground">Readiness only. No token storage.</div>
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
                    return readiness ? `Readiness: ${readiness}` : "Readiness: future";
                  })()}
                </div>

                <Button className="w-full" onClick={() => saveIntegration(card.name)} disabled={updateIntegration.isPending || isLoading || !isAdmin}>
                  <Save className="mr-2 h-4 w-4" />
                  Save readiness
                </Button>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
