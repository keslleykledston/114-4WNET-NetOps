import { useMemo, useState } from "react";
import { useListDevices, useListSnmpSnapshots } from "@workspace/api-client-react";
import type { SnmpSnapshot } from "@workspace/api-client-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Activity, Network, Router, Server } from "lucide-react";
import { useTranslation } from "@/i18n";

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
  const { t } = useTranslation();
  const [deviceId, setDeviceId] = useState("all");
  const [status, setStatus] = useState("all");

  const params = useMemo(
    () => ({
      deviceId: deviceId === "all" ? undefined : Number(deviceId),
      success: status === "all" ? undefined : status === "success",
      limit: 200,
    }),
    [deviceId, status],
  );

  const { data: devices } = useListDevices();
  const { data: snapshots, isLoading } = useListSnmpSnapshots(params);

  const latestSnapshot = snapshots?.[0];
  const failedCount = snapshots?.filter((snapshot) => !snapshot.success).length ?? 0;
  const successCount = snapshots?.filter((snapshot) => snapshot.success).length ?? 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{t("snmpHistory.title")}</h1>
          <p className="text-muted-foreground mt-1">{t("snmpHistory.subtitle")}</p>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t("snmpHistory.latestPoll")}</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-lg font-semibold">
              {latestSnapshot ? formatDate(latestSnapshot.collectedAt) : t("snmpHistory.noSnapshots")}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {latestSnapshot?.deviceHostname ?? t("snmpHistory.awaitingSnmpData")}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t("snmpHistory.successfulPolls")}</CardTitle>
            <Network className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-500">{successCount}</div>
            <p className="text-xs text-muted-foreground mt-1">{t("snmpHistory.withinCurrentFilters")}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t("snmpHistory.failedPolls")}</CardTitle>
            <Router className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-500">{failedCount}</div>
            <p className="text-xs text-muted-foreground mt-1">{t("snmpHistory.withinCurrentFilters")}</p>
          </CardContent>
        </Card>
      </div>

      <Card className="bg-muted/30">
        <CardContent className="p-6">
          <div className="grid gap-4 md:grid-cols-[minmax(220px,360px)_minmax(180px,240px)]">
            <div className="space-y-2">
              <label className="text-sm font-medium">{t("snmpHistory.device")}</label>
              <Select value={deviceId} onValueChange={setDeviceId}>
                <SelectTrigger className="bg-background">
                  <SelectValue placeholder={t("snmpHistory.allDevices")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t("snmpHistory.allDevices")}</SelectItem>
                  {devices?.map((device) => (
                    <SelectItem key={device.id} value={device.id.toString()}>
                      {device.hostname} ({device.ipAddress})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">{t("snmpHistory.result")}</label>
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger className="bg-background">
                  <SelectValue placeholder={t("snmpHistory.allResults")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t("snmpHistory.allResults")}</SelectItem>
                  <SelectItem value="success">{t("common.success")}</SelectItem>
                  <SelectItem value="failed">{t("common.failed")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("snmpHistory.snapshots")}</CardTitle>
        </CardHeader>
        <div className="border-t">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("snmpHistory.device")}</TableHead>
                <TableHead>{t("configCollection.collectedAt")}</TableHead>
                <TableHead>{t("snmpHistory.result")}</TableHead>
                <TableHead className="text-right">{t("snmpHistory.interfaces")}</TableHead>
                <TableHead className="text-right">{t("snmpHistory.bgpPeers")}</TableHead>
                <TableHead className="text-right">{t("snmpHistory.vrfs")}</TableHead>
                <TableHead>{t("snmpHistory.error")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-8">
                    {t("common.loading")}...
                  </TableCell>
                </TableRow>
              ) : snapshots?.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                    {t("snmpHistory.noHistory")}
                  </TableCell>
                </TableRow>
              ) : (
                snapshots?.map((snapshot) => (
                  <TableRow key={snapshot.id}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Server className="h-4 w-4 text-muted-foreground" />
                        <span className="font-medium">
                          {snapshot.deviceHostname ?? `Device #${snapshot.deviceId}`}
                        </span>
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
                        {snapshot.success ? t("common.success").toLowerCase() : t("common.failed").toLowerCase()}
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
