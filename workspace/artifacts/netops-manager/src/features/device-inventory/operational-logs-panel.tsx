import { useListNetopsDeviceLogs } from "@workspace/api-client-react";
import type { Device } from "@workspace/api-client-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Activity } from "lucide-react";
import { useTranslation } from "@/i18n";

export function OperationalLogsPanel({ device }: { device: Device }) {
  const { t } = useTranslation();
  const { data: logs, isLoading, isError } = useListNetopsDeviceLogs(device.id);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <Activity className="h-5 w-5" />
          {t("deviceInventory.operationalLogs.title")}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Skeleton className="h-28 w-full" />
        ) : isError ? (
          <div className="rounded-md border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
            {t("deviceInventory.operationalLogs.loadFailed")}
          </div>
        ) : !logs?.length ? (
          <div className="rounded-md border border-dashed border-border p-6 text-sm text-muted-foreground">
            {t("deviceInventory.operationalLogs.noLogs", { hostname: device.hostname })}
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("deviceInventory.operationalLogs.columns.time")}</TableHead>
                <TableHead>{t("deviceInventory.operationalLogs.columns.level")}</TableHead>
                <TableHead>{t("deviceInventory.operationalLogs.columns.scope")}</TableHead>
                <TableHead>{t("deviceInventory.operationalLogs.columns.message")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {logs.map((log) => (
                <TableRow key={`${log.timestamp}-${log.scope}-${log.message}`}>
                  <TableCell className="whitespace-nowrap text-muted-foreground">
                    {new Date(log.timestamp).toLocaleString()}
                  </TableCell>
                  <TableCell><Badge variant="outline">{log.level}</Badge></TableCell>
                  <TableCell>{log.scope}</TableCell>
                  <TableCell>{log.message}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
