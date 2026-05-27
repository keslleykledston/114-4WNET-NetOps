import { useMemo, useState } from "react";
import { useListDevices } from "@workspace/api-client-react";
import { Activity, GitBranch, RefreshCw } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import {
  type BgpFreshnessStatus,
  useOperationalBgpPeers,
  useOperationalBgpSummary,
} from "@/features/operational-bgp/operational-bgp-api";
import { BgpFsmStateBadge, BgpOperStatusBadge } from "@/features/operational-bgp/operational-bgp-state-badge";

function fmtDate(value: string | null): string {
  if (!value) return "-";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "-";
  return parsed.toLocaleString();
}

function freshnessLabel(value: BgpFreshnessStatus): string {
  if (value === "fresh") return "fresh";
  if (value === "stale") return "stale";
  if (value === "expired") return "expired";
  return "unknown";
}

export default function OperationalBgpPage() {
  const { data: devices, isLoading: devicesLoading } = useListDevices();
  const sortedDevices = useMemo(
    () => [...(devices ?? [])].sort((left, right) => left.hostname.localeCompare(right.hostname, "pt", { sensitivity: "base" })),
    [devices],
  );

  const [deviceId, setDeviceId] = useState<number | null>(null);
  const effectiveDeviceId = deviceId ?? sortedDevices[0]?.id ?? null;

  const peersQuery = useOperationalBgpPeers(effectiveDeviceId);
  const summaryQuery = useOperationalBgpSummary(effectiveDeviceId);

  const peers = peersQuery.data?.peers ?? [];
  const summary = summaryQuery.data;
  const isLoading = peersQuery.isLoading || summaryQuery.isLoading;

  const activeConnect = (summary?.counts.active ?? 0) + peers.filter((peer) => peer.fsmState === "connect").length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <GitBranch className="h-6 w-6 text-primary" />
          BGP Operations
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Esta tela mostra estado operacional via SNMP. Nao valida configuracao/policies.
        </p>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Device selector</CardTitle>
          <CardDescription>Somente leitura por GET de peers e summary.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-3">
          <Select
            value={effectiveDeviceId != null ? String(effectiveDeviceId) : ""}
            onValueChange={(value) => setDeviceId(Number(value))}
            disabled={devicesLoading || sortedDevices.length === 0}
          >
            <SelectTrigger className="w-full sm:w-[360px]">
              <SelectValue placeholder="Selecione o device" />
            </SelectTrigger>
            <SelectContent>
              {sortedDevices.map((device) => (
                <SelectItem key={device.id} value={String(device.id)}>
                  #{device.id} {device.hostname}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Button variant="outline" onClick={() => { void peersQuery.refetch(); void summaryQuery.refetch(); }}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Atualizar
          </Button>
        </CardContent>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-6">
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">total peers</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold">{summary?.total ?? 0}</div></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">established</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold text-emerald-400">{summary?.counts.up ?? 0}</div></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">idle</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold text-yellow-400">{summary?.counts.idle ?? 0}</div></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">active/connect</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold text-red-400">{activeConnect}</div></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">down/unknown</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold">{(summary?.counts.down ?? 0) + (summary?.counts.unknown ?? 0)}</div></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">freshness</CardTitle></CardHeader><CardContent><div className="text-lg font-semibold">{freshnessLabel(summary?.freshness ?? "unknown")}</div></CardContent></Card>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Activity className="h-4 w-4" />
            BGP peers operacional
          </CardTitle>
          <CardDescription>
            Fonte: GET `/api/operational/bgp` e GET `/api/operational/bgp/summary` (read-only).
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading && (
            <div className="space-y-3">
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-8 w-4/5" />
              <Skeleton className="h-8 w-3/5" />
            </div>
          )}

          {!isLoading && (peersQuery.isError || summaryQuery.isError) && (
            <p className="text-sm text-destructive">
              {peersQuery.error instanceof Error ? peersQuery.error.message : summaryQuery.error instanceof Error ? summaryQuery.error.message : "Falha ao carregar BGP operacional"}
            </p>
          )}

          {!isLoading && !peersQuery.isError && !summaryQuery.isError && peers.length === 0 && (
            <div className="rounded-md border border-dashed p-8 text-center space-y-2">
              <p className="font-medium">Sem coleta operacional disponivel</p>
              <p className="text-sm text-muted-foreground">
                Coleta SNMP BGP ainda nao executada ou expirada.
              </p>
            </div>
          )}

          {!isLoading && !peersQuery.isError && !summaryQuery.isError && peers.length > 0 && (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>peer_ip</TableHead>
                  <TableHead>peer_as</TableHead>
                  <TableHead>fsm_state</TableHead>
                  <TableHead>oper_status</TableHead>
                  <TableHead>uptime_seconds</TableHead>
                  <TableHead>collected_at</TableHead>
                  <TableHead>freshness</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {peers.map((peer) => (
                  <TableRow key={`${peer.peerIp}-${peer.afi}-${peer.safi}`}>
                    <TableCell className="font-mono text-xs">{peer.peerIp}</TableCell>
                    <TableCell>{peer.peerAs ?? "-"}</TableCell>
                    <TableCell><BgpFsmStateBadge state={peer.fsmState} /></TableCell>
                    <TableCell><BgpOperStatusBadge status={peer.operStatus} /></TableCell>
                    <TableCell>{peer.uptimeSeconds ?? "-"}</TableCell>
                    <TableCell>{fmtDate(peer.collectedAt)}</TableCell>
                    <TableCell>{freshnessLabel(summary?.freshness ?? "unknown")}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
