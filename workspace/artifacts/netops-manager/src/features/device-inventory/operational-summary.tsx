import { useGetNetopsDeviceSummary } from "@workspace/api-client-react";
import type { Device, NetopsDeviceSummary } from "@workspace/api-client-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Server } from "lucide-react";
import { CollectSnmpButton } from "./collect-snmp-button";
import { useTranslation } from "@/i18n";

function SummaryCounters({ summary }: { summary: NetopsDeviceSummary }) {
  const { t } = useTranslation();
  const items = [
    [t("deviceInventory.operationalSummary.counters.interfaces"), summary.counters.interfaces],
    [t("deviceInventory.operationalSummary.counters.bgpPeers"), summary.counters.bgpPeers],
    [t("deviceInventory.operationalSummary.counters.established"), summary.counters.bgpEstablished],
    [t("deviceInventory.operationalSummary.counters.down"), summary.counters.bgpDown],
    [t("deviceInventory.operationalSummary.counters.filters"), summary.counters.filters],
    [t("deviceInventory.operationalSummary.counters.communities"), summary.counters.communities],
  ];

  return (
    <div className="grid gap-3 md:grid-cols-3 lg:grid-cols-6">
      {items.map(([label, value]) => (
        <div key={String(label)} className="rounded-md border bg-muted/20 px-3 py-2">
          <div className="text-xs text-muted-foreground">{label}</div>
          <div className="mt-1 text-lg font-semibold">{value}</div>
        </div>
      ))}
    </div>
  );
}

export function OperationalSummary({ device }: { device: Device }) {
  const { t } = useTranslation();
  const { data: summary, isLoading, isError } = useGetNetopsDeviceSummary(device.id);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-4">
        <CardTitle className="flex items-center gap-2 text-lg">
          <Server className="h-5 w-5" />
          {t("deviceInventory.operationalSummary.title")}
        </CardTitle>
        <CollectSnmpButton device={device} />
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="grid gap-4 text-sm md:grid-cols-2 lg:grid-cols-4">
          <div>
            <div className="mb-1 text-muted-foreground">{t("deviceInventory.operationalSummary.hostname")}</div>
            <div className="font-medium">{device.hostname}</div>
          </div>
          <div>
            <div className="mb-1 text-muted-foreground">{t("deviceInventory.operationalSummary.ip")}</div>
            <div className="font-mono">{device.ipAddress}</div>
          </div>
          <div>
            <div className="mb-1 text-muted-foreground">{t("deviceInventory.operationalSummary.vendorPlatform")}</div>
            <div className="capitalize">{device.vendor} / {device.platform}</div>
          </div>
          <div>
            <div className="mb-1 text-muted-foreground">{t("deviceInventory.operationalSummary.status")}</div>
            <Badge variant={device.status === "active" ? "outline" : "destructive"}>
              {device.status}
            </Badge>
          </div>
        </div>

        {isLoading ? (
          <div className="grid gap-3 md:grid-cols-3 lg:grid-cols-6">
            {Array.from({ length: 6 }).map((_, index) => (
              <Skeleton key={index} className="h-16 w-full" />
            ))}
          </div>
        ) : isError ? (
          <div className="rounded-md border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
            {t("deviceInventory.operationalSummary.loadFailed")}
          </div>
        ) : summary ? (
          <>
            <SummaryCounters summary={summary} />
            <div className="text-xs text-muted-foreground">
              {summary.lastSnapshotAt
                ? t("deviceInventory.operationalSummary.lastSnapshot", {
                    at: new Date(summary.lastSnapshotAt).toLocaleString(),
                  })
                : t("deviceInventory.operationalSummary.noSnapshot")}
            </div>
          </>
        ) : null}
      </CardContent>
    </Card>
  );
}
