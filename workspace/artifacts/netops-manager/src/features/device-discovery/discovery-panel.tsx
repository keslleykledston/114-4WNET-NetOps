import type { Device } from "@workspace/api-client-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { useTranslation } from "@/i18n";
import { Radar, RefreshCw, ShieldAlert } from "lucide-react";
import { useDiscoverySnapshot, useRunDiscovery } from "./discovery-api";

export function DiscoveryPanel({ device }: { device: Device }) {
  const { toast } = useToast();
  const { t } = useTranslation();
  const { data: snapshot, isLoading, isError } = useDiscoverySnapshot(device.id);
  const runDiscovery = useRunDiscovery(device.id);

  function execute() {
    runDiscovery.mutate(undefined, {
      onSuccess: (result) =>
        toast({
          title: t("discovery.panel.toastCompleted"),
          description: t("discovery.panel.toastStatus", { status: result.status }),
        }),
      onError: (error) =>
        toast({
          title: t("discovery.panel.toastFailed"),
          description: error instanceof Error ? error.message : t("discovery.panel.unknownError"),
          variant: "destructive",
        }),
    });
  }

  const needsWarning =
    snapshot?.status === "failed" ||
    snapshot?.sourceStatus.ssh === "failed" ||
    snapshot?.sourceStatus.cachedConfig === "missing";

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-4">
        <CardTitle className="flex items-center gap-2 text-lg">
          <Radar className="h-5 w-5" />
          {t("discovery.title")}
        </CardTitle>
        <Button type="button" variant="outline" size="sm" onClick={execute} disabled={runDiscovery.isPending}>
          <RefreshCw className={`mr-2 h-4 w-4 ${runDiscovery.isPending ? "animate-spin" : ""}`} />
          {runDiscovery.isPending ? t("discovery.panel.runViaConnector") : t("discovery.panel.executeDiscovery")}
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading ? (
          <Skeleton className="h-24 w-full" />
        ) : snapshot ? (
          <>
            <div className="grid gap-3 text-sm md:grid-cols-4">
              <StatusItem label={t("discovery.panel.status")} value={snapshot.status} />
              <StatusItem label={t("discovery.panel.ssh")} value={snapshot.sourceStatus.ssh} />
              <StatusItem label={t("discovery.panel.snmp")} value={snapshot.sourceStatus.snmp} />
              <StatusItem label={t("discovery.panel.cache")} value={snapshot.sourceStatus.cachedConfig} />
            </div>
            <div className="flex flex-wrap gap-2">
              {snapshot.contexts.map((context) => (
                <Badge key={context} variant="outline">
                  {context}
                </Badge>
              ))}
            </div>
            <div className="text-xs text-muted-foreground">
              {t("discovery.panel.lastDiscovery", {
                at: new Date(snapshot.finishedAt).toLocaleString(),
                interfaces: snapshot.interfaces.length,
                peers: snapshot.bgpPeers.length,
                vrfs: snapshot.vrfs.length,
                l2vpn: snapshot.l2vpn.l2vcs.length + snapshot.l2vpn.vsis.length,
                policies: snapshot.policies.length,
              })}
            </div>
            {snapshot.cachedFromPersistedSnapshot && (
              <Alert>
                <ShieldAlert className="h-4 w-4" />
                <AlertTitle>{t("discovery.panel.snapshotFromDbTitle")}</AlertTitle>
                <AlertDescription>{t("discovery.panel.snapshotFromDbDesc")}</AlertDescription>
              </Alert>
            )}
            {needsWarning && (
              <Alert>
                <ShieldAlert className="h-4 w-4" />
                <AlertTitle>{t("discovery.panel.lowTrustTitle")}</AlertTitle>
                <AlertDescription>{t("discovery.panel.lowTrustDesc")}</AlertDescription>
              </Alert>
            )}
          </>
        ) : isError ? (
          <div className="rounded-md border border-dashed border-border p-4 text-sm text-muted-foreground">
            {t("discovery.panel.noSnapshot", { hostname: device.hostname })}
          </div>
        ) : (
          <div className="rounded-md border border-dashed border-border p-4 text-sm text-muted-foreground">
            {t("discovery.panel.noDiscoveryYet", { hostname: device.hostname })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function StatusItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border bg-muted/20 px-3 py-2">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 font-medium">{value}</div>
    </div>
  );
}
