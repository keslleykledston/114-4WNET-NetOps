import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Activity, AlertTriangle, CheckCircle2, ServerCrash, Waypoints } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
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
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Waypoints className="h-6 w-6" />
            Dashboard Connectors
          </h1>
          <p className="text-sm text-muted-foreground">Saúde operacional, alertas e fila de jobs dos bastions.</p>
        </div>
        <Link href="/infrastructure/connectors">
          <Button variant="outline">Gerenciar connectors</Button>
        </Link>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Connectors Online</CardTitle>
          </CardHeader>
          <CardContent className="flex items-center gap-2">
            <CheckCircle2 className="h-5 w-5 text-green-600" />
            <span className="text-2xl font-bold">{summary?.healthy ?? "—"}</span>
            <span className="text-xs text-muted-foreground">/ {summary?.total ?? 0} saudáveis</span>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Warning</CardTitle>
          </CardHeader>
          <CardContent className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-amber-500" />
            <span className="text-2xl font-bold">{summary?.warning ?? "—"}</span>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Critical</CardTitle>
          </CardHeader>
          <CardContent className="flex items-center gap-2">
            <Activity className="h-5 w-5 text-orange-600" />
            <span className="text-2xl font-bold">{summary?.critical ?? "—"}</span>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Offline</CardTitle>
          </CardHeader>
          <CardContent className="flex items-center gap-2">
            <ServerCrash className="h-5 w-5 text-destructive" />
            <span className="text-2xl font-bold">{summary?.offline ?? "—"}</span>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Jobs Pendentes</CardTitle>
          </CardHeader>
          <CardContent>
            <span className="text-2xl font-bold">{summary?.jobsPending ?? "—"}</span>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Jobs Falhos 1h</CardTitle>
          </CardHeader>
          <CardContent>
            <span className="text-2xl font-bold">{summary?.jobsFailedLastHour ?? "—"}</span>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Alertas Abertos</CardTitle>
          </CardHeader>
          <CardContent>
            <span className="text-2xl font-bold">{summary?.openAlerts ?? "—"}</span>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Connectors</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Connector</TableHead>
                <TableHead>Tenant</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Health Score</TableHead>
                <TableHead>Último Heartbeat</TableHead>
                <TableHead>Último Handshake WG</TableHead>
                <TableHead>Jobs Pendentes</TableHead>
                <TableHead>Falhas 1h</TableHead>
                <TableHead>Alertas</TableHead>
                <TableHead>Ações</TableHead>
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
                        Ver Connector
                      </Button>
                    </Link>
                    <Link href={`/infrastructure/connectors/${row.connector_id}?tab=alerts`}>
                      <Button variant="ghost" size="sm">
                        Ver Alertas
                      </Button>
                    </Link>
                    <Link href={`/infrastructure/connectors/${row.connector_id}?tab=diagnostics`}>
                      <Button variant="ghost" size="sm">
                        Diagnóstico
                      </Button>
                    </Link>
                  </TableCell>
                </TableRow>
              ))}
              {rows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={10} className="text-center text-muted-foreground py-8">
                    Nenhum connector cadastrado.
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
