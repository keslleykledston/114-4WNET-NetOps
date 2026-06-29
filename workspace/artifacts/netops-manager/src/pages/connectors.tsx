import { useState } from "react";
import { Link } from "wouter";
import { LayoutDashboard } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Waypoints, Plus, RefreshCw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/components/auth-provider";
import { useTranslation } from "@/i18n";
import {
  createConnector,
  createTenant,
  downloadBootstrapPackage,
  listConnectors,
  listTenants,
  type ConnectorCreateResult,
} from "@/features/connectors/connectors-api";

function statusVariant(status: string): "default" | "secondary" | "destructive" | "outline" {
  if (status === "ONLINE") return "default";
  if (status === "PENDING") return "secondary";
  if (status === "OFFLINE" || status === "REVOKED") return "destructive";
  return "outline";
}

export default function ConnectorsPage() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const canWrite = user?.role === "admin" || user?.role === "operator";

  const [tenantName, setTenantName] = useState("");
  const [connectorName, setConnectorName] = useState("");
  const [selectedTenantId, setSelectedTenantId] = useState("");
  const [createdConnector, setCreatedConnector] = useState<ConnectorCreateResult | null>(null);
  const [bootstrapDownloaded, setBootstrapDownloaded] = useState(false);

  const connectorsQuery = useQuery({
    queryKey: ["connectors"],
    queryFn: listConnectors,
    refetchInterval: 30_000,
  });

  const tenantsQuery = useQuery({
    queryKey: ["connectors-tenants"],
    queryFn: listTenants,
  });

  const createTenantMutation = useMutation({
    mutationFn: () => createTenant({ name: tenantName }),
    onSuccess: () => {
      setTenantName("");
      void queryClient.invalidateQueries({ queryKey: ["connectors-tenants"] });
      toast({ title: t("connectors.toastTenantCreated") });
    },
    onError: (e: Error) => toast({ title: t("common.error"), description: e.message, variant: "destructive" }),
  });

  const bootstrapDownloadMutation = useMutation({
    mutationFn: (connectorId: number) =>
      downloadBootstrapPackage(connectorId, createdConnector?.name ?? "connector"),
    onSuccess: () => {
      setBootstrapDownloaded(true);
      toast({
        title: t("connectors.toastBootstrapDownloaded"),
        description: t("connectors.toastBootstrapDownloadedDesc"),
      });
    },
    onError: (e: Error) => toast({ title: t("common.error"), description: e.message, variant: "destructive" }),
  });

  const createConnectorMutation = useMutation({
    mutationFn: () =>
      createConnector({
        tenant_id: Number(selectedTenantId),
        name: connectorName.trim(),
      }),
    onSuccess: (data) => {
      setCreatedConnector(data);
      setBootstrapDownloaded(false);
      setConnectorName("");
      void queryClient.invalidateQueries({ queryKey: ["connectors"] });
      toast({
        title: data.reprovisioned ? t("connectors.toastConnectorReprovisioned") : t("connectors.toastConnectorCreated"),
        description: t("connectors.toastConnectorCreatedDesc"),
      });
    },
    onError: (e: Error) => toast({ title: t("common.error"), description: e.message, variant: "destructive" }),
  });

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Waypoints className="h-6 w-6 text-primary" />
            {t("connectors.pageTitle")}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">{t("connectors.pageSubtitle")}</p>
        </div>
        <div className="flex gap-2">
          <Link href="/infrastructure/connectors/dashboard">
            <Button variant="secondary" size="sm">
              <LayoutDashboard className="h-4 w-4 mr-2" />
              {t("connectors.dashboard")}
            </Button>
          </Link>
          <Button variant="outline" size="sm" onClick={() => void connectorsQuery.refetch()}>
            <RefreshCw className="h-4 w-4 mr-2" />
            {t("common.refresh")}
          </Button>
        </div>
      </div>

      {canWrite && (
        <div className="grid gap-4 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">{t("connectors.newTenant")}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <div className="flex gap-2">
                <Input placeholder={t("connectors.tenantPlaceholder")} value={tenantName} onChange={(e) => setTenantName(e.target.value)} />
                <Button disabled={!tenantName.trim() || createTenantMutation.isPending} onClick={() => createTenantMutation.mutate()}>
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
              {(tenantsQuery.data ?? []).length > 0 && (
                <p className="text-xs text-muted-foreground">
                  {t("connectors.tenantsHint", { names: (tenantsQuery.data ?? []).map((tenant) => tenant.name).join(", ") })}
                </p>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">{t("connectors.newConnector")}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <select
                className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm"
                value={selectedTenantId}
                onChange={(e) => setSelectedTenantId(e.target.value)}
              >
                <option value="">{t("connectors.selectTenant")}</option>
                {(tenantsQuery.data ?? []).map((tenant) => (
                  <option key={tenant.id} value={tenant.id}>
                    {tenant.name}
                  </option>
                ))}
              </select>
              <div className="flex gap-2">
                <Input
                  placeholder={t("connectors.connectorPlaceholder")}
                  value={connectorName}
                  onChange={(e) => setConnectorName(e.target.value)}
                />
                <Button
                  disabled={!connectorName.trim() || !selectedTenantId || createConnectorMutation.isPending}
                  onClick={() => createConnectorMutation.mutate()}
                >
                  {t("connectors.create")}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">{t("connectors.reprovisionHint")}</p>
            </CardContent>
          </Card>
        </div>
      )}

      {createdConnector && !bootstrapDownloaded && (
        <Card className="border-amber-500/50 bg-amber-500/5">
          <CardHeader>
            <CardTitle className="text-base text-amber-600 dark:text-amber-400">{t("connectors.pendingBootstrap")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="text-sm text-amber-700 dark:text-amber-300">
              <p className="font-semibold">{t("connectors.bootstrapWarning")}</p>
              <p className="text-xs mt-1">{t("connectors.bootstrapDesc")}</p>
            </div>
            <Button
              onClick={() => void bootstrapDownloadMutation.mutate(createdConnector.id)}
              disabled={bootstrapDownloadMutation.isPending}
              className="w-full"
            >
              {bootstrapDownloadMutation.isPending ? t("connectors.generatingPackage") : t("connectors.downloadBootstrap")}
            </Button>
          </CardContent>
        </Card>
      )}

      {createdConnector && bootstrapDownloaded && (
        <Card className="border-green-500/50 bg-green-500/5">
          <CardHeader>
            <CardTitle className="text-base text-green-600 dark:text-green-400">{t("connectors.packageDownloaded")}</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-green-700 dark:text-green-300">
            {t("connectors.packageDownloadedDesc", { name: createdConnector.name })}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("connectors.title")}</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("connectors.tableName")}</TableHead>
                <TableHead>{t("connectors.tableTenant")}</TableHead>
                <TableHead>{t("connectors.wgIp")}</TableHead>
                <TableHead>{t("common.status")}</TableHead>
                <TableHead>{t("connectors.version")}</TableHead>
                <TableHead>{t("connectors.lastHeartbeat")}</TableHead>
                <TableHead>{t("connectors.jobs")}</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {(connectorsQuery.data ?? []).map((c) => (
                <TableRow key={c.id}>
                  <TableCell className="font-medium">{c.name}</TableCell>
                  <TableCell>{c.tenant_name}</TableCell>
                  <TableCell className="font-mono text-xs">{c.wireguard_ip ?? "—"}</TableCell>
                  <TableCell>
                    <Badge variant={statusVariant(c.status)}>{c.status}</Badge>
                  </TableCell>
                  <TableCell>{c.version ?? "—"}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {c.last_heartbeat ? new Date(c.last_heartbeat).toLocaleString() : t("common.never")}
                  </TableCell>
                  <TableCell>{c.pending_jobs}</TableCell>
                  <TableCell>
                    <Link href={`/infrastructure/connectors/${c.id}`}>
                      <Button variant="ghost" size="sm">
                        {t("connectors.details")}
                      </Button>
                    </Link>
                  </TableCell>
                </TableRow>
              ))}
              {!connectorsQuery.isLoading && (connectorsQuery.data ?? []).length === 0 && (
                <TableRow>
                  <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
                    {t("connectors.noConnectors")}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
