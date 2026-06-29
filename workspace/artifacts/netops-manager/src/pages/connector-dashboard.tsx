import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Activity, AlertTriangle, CheckCircle2, ServerCrash, Waypoints } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useTranslation } from "@/i18n";
import {
  getConnectorHealthSummary,
  getConnectorMetrics,
  listConnectors,
  type ConnectorListItem,
} from "@/features/connectors/connectors-api";

function healthBadgeVariant(status: string): "default" | "secondary" | "destructive" | "outline" {
  if (status === "HEALTHY") return "default";
  if (status === "WARNING") return "secondary";
  if (status === "CRITICAL" || status === "OFFLINE") return "destructive";
  return "outline";
}

function formatAge(seconds: number | null | undefined): string {
  if (seconds == null) return "—";
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  return `${Math.floor(seconds / 3600)}h`;
}

export default function ConnectorDashboardPage() {
  const { t } = useTranslation();
  const summaryQuery = useQuery({ queryKey: ["connector-health-summary"], queryFn: getConnectorHealthSummary, refetchInterval: 30_000 });
  const metricsQuery = useQuery({ queryKey: ["connector-metrics"], queryFn: getConnectorMetrics, refetchInterval: 30_000 });
  const connectorsQuery = useQuery({ queryKey: ["connectors"], queryFn: listConnectors, refetchInterval: 30_000 });

  const summary = summaryQuery.data;
  const connectorsById = new Map<number, ConnectorListItem>(
    (connectorsQuery.data ?? []).map((c) => [c.id, c]),
  );

  const rows = (metricsQuery.data?.connectors ?? []).map((m) => {
    const meta = connectorsById.get(m.connector_id);
    return {
      ...m,
      tenant_name: meta?.tenant_name ?? "—",
      connector_status: meta?.status ?? "—",
    };
  });

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Waypoints className="h-6 w-6" />
            {t("connectorDashboard.title")}
          </h1>
          <p className="text-sm text-muted-foreground">{t("connectorDashboard.subtitle")}</p>
        </div>
        <Link href="/infrastructure/connectors">
          <Button variant="outline">{t("connectorDashboard.manageConnectors")}</Button>
        </Link>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">{t("connectorDashboard.connectorsOnline")}</CardTitle>
          </CardHeader>
          <CardContent className="flex items-center gap-2">
            <CheckCircle2 className="h-5 w-5 text-green-600" />
            <span className="text-2xl font-bold">{summary?.healthy ?? "—"}</span>
            <span className="text-xs text-muted-foreground">{t("connectorDashboard.healthyOf", { total: summary?.total ?? 0 })}</span>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">{t("connectorDashboard.warning")}</CardTitle>
          </CardHeader>
          <CardContent className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-amber-500" />
            <span className="text-2xl font-bold">{summary?.warning ?? "—"}</span>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">{t("connectorDashboard.critical")}</CardTitle>
          </CardHeader>
          <CardContent className="flex items-center gap-2">
            <Activity className="h-5 w-5 text-orange-600" />
            <span className="text-2xl font-bold">{summary?.critical ?? "—"}</span>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">{t("connectorDashboard.offline")}</CardTitle>
          </CardHeader>
          <CardContent className="flex items-center gap-2">
            <ServerCrash className="h-5 w-5 text-destructive" />
            <span className="text-2xl font-bold">{summary?.offline ?? "—"}</span>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">{t("connectorDashboard.pendingJobs")}</CardTitle>
          </CardHeader>
          <CardContent>
            <span className="text-2xl font-bold">{summary?.jobsPending ?? "—"}</span>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">{t("connectorDashboard.failedJobs1h")}</CardTitle>
          </CardHeader>
          <CardContent>
            <span className="text-2xl font-bold">{summary?.jobsFailedLastHour ?? "—"}</span>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">{t("connectorDashboard.openAlerts")}</CardTitle>
          </CardHeader>
          <CardContent>
            <span className="text-2xl font-bold">{summary?.openAlerts ?? "—"}</span>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("connectors.title")}</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("connectorDashboard.tableConnector")}</TableHead>
                <TableHead>{t("connectorDashboard.tableTenant")}</TableHead>
                <TableHead>{t("common.status")}</TableHead>
                <TableHead>{t("connectorDashboard.healthScore")}</TableHead>
                <TableHead>{t("connectorDashboard.lastHeartbeat")}</TableHead>
                <TableHead>{t("connectorDashboard.lastWgHandshake")}</TableHead>
                <TableHead>{t("connectorDashboard.pendingJobsCol")}</TableHead>
                <TableHead>{t("connectorDashboard.failures1h")}</TableHead>
                <TableHead>{t("connectorDashboard.alerts")}</TableHead>
                <TableHead>{t("common.actions")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.connector_id}>
                  <TableCell className="font-medium">{row.connector_name}</TableCell>
                  <TableCell>{row.tenant_name}</TableCell>
                  <TableCell>
                    <Badge variant="outline">{row.connector_status}</Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant={healthBadgeVariant(row.connector_health_status)}>
                      {row.connector_health_status} ({row.connector_health_score})
                    </Badge>
                  </TableCell>
                  <TableCell className="text-xs">{formatAge(row.connector_heartbeat_age_seconds)}</TableCell>
                  <TableCell className="text-xs">{formatAge(row.connector_wireguard_handshake_age_seconds)}</TableCell>
                  <TableCell>{row.connector_jobs_pending}</TableCell>
                  <TableCell>{row.connector_jobs_failed_1h}</TableCell>
                  <TableCell>{row.connector_alerts_open}</TableCell>
                  <TableCell className="space-x-1">
                    <Link href={`/infrastructure/connectors/${row.connector_id}`}>
                      <Button variant="ghost" size="sm">
                        {t("connectorDashboard.viewConnector")}
                      </Button>
                    </Link>
                    <Link href={`/infrastructure/connectors/${row.connector_id}?tab=alerts`}>
                      <Button variant="ghost" size="sm">
                        {t("connectorDashboard.viewAlerts")}
                      </Button>
                    </Link>
                    <Link href={`/infrastructure/connectors/${row.connector_id}?tab=diagnostics`}>
                      <Button variant="ghost" size="sm">
                        {t("connectorDashboard.diagnostics")}
                      </Button>
                    </Link>
                  </TableCell>
                </TableRow>
              ))}
              {rows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={10} className="text-center text-muted-foreground py-8">
                    {t("connectorDashboard.noConnectors")}
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
