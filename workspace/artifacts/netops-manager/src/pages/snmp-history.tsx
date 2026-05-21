import { useMemo, useState } from "react";
import { useListDevices, useListSnmpSnapshots } from "@workspace/api-client-react";
import type { SnmpSnapshot } from "@workspace/api-client-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Activity, Network, Router, Server } from "lucide-react";

type ParsedCountKey = "interfacesJson" | "bgpPeersJson" | "vrfsJson";

function countJsonArray(snapshot: SnmpSnapshot, key: ParsedCountKey): number {
  const value = snapshot[key];
  if (!value) return 0;

  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.length : 0;
  } catch {
    return 0;
  }
}

function formatDate(value: string): string {
  return new Date(value).toLocaleString();
}

export default function SnmpHistory() {
  const [deviceId, setDeviceId] = useState("all");
  const [status, setStatus] = useState("all");

  const params = useMemo(() => ({
    deviceId: deviceId === "all" ? undefined : Number(deviceId),
    success: status === "all" ? undefined : status === "success",
    limit: 200,
  }), [deviceId, status]);

  const { data: devices } = useListDevices();
  const { data: snapshots, isLoading } = useListSnmpSnapshots(params);

  const latestSnapshot = snapshots?.[0];
  const failedCount = snapshots?.filter((snapshot) => !snapshot.success).length ?? 0;
  const successCount = snapshots?.filter((snapshot) => snapshot.success).length ?? 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">SNMP History</h1>
          <p className="text-muted-foreground mt-1">Persisted interface, BGP and VRF polling snapshots</p>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Latest Poll</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-lg font-semibold">
              {latestSnapshot ? formatDate(latestSnapshot.collectedAt) : "No snapshots"}
            </div>
            <p className="text-xs text-muted-foreground mt-1">{latestSnapshot?.deviceHostname ?? "Awaiting SNMP data"}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Successful Polls</CardTitle>
            <Network className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-500">{successCount}</div>
            <p className="text-xs text-muted-foreground mt-1">Within current filters</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Failed Polls</CardTitle>
            <Router className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-500">{failedCount}</div>
            <p className="text-xs text-muted-foreground mt-1">Within current filters</p>
          </CardContent>
        </Card>
      </div>

      <Card className="bg-muted/30">
        <CardContent className="p-6">
          <div className="grid gap-4 md:grid-cols-[minmax(220px,360px)_minmax(180px,240px)]">
            <div className="space-y-2">
              <label className="text-sm font-medium">Device</label>
              <Select value={deviceId} onValueChange={setDeviceId}>
                <SelectTrigger className="bg-background">
                  <SelectValue placeholder="All devices" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All devices</SelectItem>
                  {devices?.map((device) => (
                    <SelectItem key={device.id} value={device.id.toString()}>
                      {device.hostname} ({device.ipAddress})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Result</label>
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger className="bg-background">
                  <SelectValue placeholder="All results" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All results</SelectItem>
                  <SelectItem value="success">Success</SelectItem>
                  <SelectItem value="failed">Failed</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Snapshots</CardTitle>
        </CardHeader>
        <div className="border-t">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Device</TableHead>
                <TableHead>Collected At</TableHead>
                <TableHead>Result</TableHead>
                <TableHead className="text-right">Interfaces</TableHead>
                <TableHead className="text-right">BGP Peers</TableHead>
                <TableHead className="text-right">VRFs</TableHead>
                <TableHead>Error</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-8">Loading...</TableCell>
                </TableRow>
              ) : snapshots?.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                    No SNMP snapshots found.
                  </TableCell>
                </TableRow>
              ) : (
                snapshots?.map((snapshot) => (
                  <TableRow key={snapshot.id}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Server className="h-4 w-4 text-muted-foreground" />
                        <span className="font-medium">{snapshot.deviceHostname ?? `Device #${snapshot.deviceId}`}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                      {formatDate(snapshot.collectedAt)}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={snapshot.success ? "outline" : "destructive"}
                        className={snapshot.success ? "text-green-500 border-green-500/50" : ""}
                      >
                        {snapshot.success ? "success" : "failed"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right font-mono">{countJsonArray(snapshot, "interfacesJson")}</TableCell>
                    <TableCell className="text-right font-mono">{countJsonArray(snapshot, "bgpPeersJson")}</TableCell>
                    <TableCell className="text-right font-mono">{countJsonArray(snapshot, "vrfsJson")}</TableCell>
                    <TableCell className="max-w-[320px] truncate text-sm text-muted-foreground">
                      {snapshot.errorMessage ?? "-"}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </Card>
    </div>
  );
}
