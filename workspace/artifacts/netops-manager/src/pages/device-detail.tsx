import { useState } from "react";
import { useRoute } from "wouter";
import {
  useGetDevice, getGetDeviceQueryKey, getListDevicesQueryKey,
  useListComplianceJobs,
  useListProvisioningJobs,
  useUpdateDevice,
} from "@workspace/api-client-react";
import type { DeviceUpdate } from "@workspace/api-client-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { Server, Activity, ShieldCheck, Rocket, History, ChevronRight, Pencil, Network } from "lucide-react";
import { Link } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { useTranslation } from "@/i18n";
import { DeviceFormDialog, type DeviceFormValues } from "@/components/device-form-dialog";
import { appendSnmpToDevicePayload, buildDeviceAccessPayload } from "@/features/devices/device-connector-utils";
import { DiscoveryPanel } from "@/features/device-discovery/discovery-panel";
import { CommunityLibraryTab } from "@/features/bgp/community-library-tab";
import { CommunitySetsTab } from "@/features/bgp/community-sets-tab";
import { ConfigHistoryPanel } from "@/features/config-history/config-history-panel";
import {
  fetchDeviceCompliance,
  fetchDeviceDrifts,
  triggerComplianceRun,
} from "@/features/compliance/compliance-api";

export default function DeviceDetail() {
  const [, params] = useRoute("/devices/:id");
  const deviceId = params?.id ? parseInt(params.id) : 0;
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { t } = useTranslation();
  const [isEditOpen, setIsEditOpen] = useState(false);
  const updateDevice = useUpdateDevice();

  const { data: device, isLoading: deviceLoading } = useGetDevice(deviceId, { 
    query: { enabled: !!deviceId, queryKey: getGetDeviceQueryKey(deviceId) } 
  });
  
  const { data: complianceJobs } = useListComplianceJobs({ deviceId });

  const { data: deviceCompliance } = useQuery({
    queryKey: ["device-compliance", deviceId],
    queryFn: () => fetchDeviceCompliance(deviceId),
    enabled: !!deviceId,
  });

  const { data: deviceDrifts } = useQuery({
    queryKey: ["device-drifts", deviceId],
    queryFn: () => fetchDeviceDrifts(deviceId),
    enabled: !!deviceId,
  });
  const { data: provisioningJobs } = useListProvisioningJobs({ deviceId });
  const collectionStatusQuery = useQuery({
    queryKey: ["device-collection-status", deviceId],
    queryFn: async () => {
      const res = await fetch(`/api/devices/${deviceId}/collection-status`);
      if (!res.ok) return null;
      return res.json() as Promise<{
        lastSshBundleAt: string | null;
        parserStatus: string | null;
        parserError: string | null;
        bgpPeerCount: number;
        l2CircuitCount: number;
        snmpConfigured: boolean;
        connectorName: string | null;
        accessMode: string;
      }>;
    },
    enabled: !!deviceId,
    refetchInterval: 15000,
  });

  if (deviceLoading) {
    return <div className="space-y-6"><Skeleton className="h-12 w-1/3" /><Skeleton className="h-64 w-full" /></div>;
  }

  if (!device) {
    return <div>{t("deviceDetail.notFound")}</div>;
  }

  const extendedDevice = device as typeof device & {
    connectorId?: number | null;
    connectorGroupId?: number | null;
    connectorName?: string | null;
    connectorGroupName?: string | null;
    connectorGroupStrategy?: string | null;
    tenantId?: number | null;
    tenantName?: string | null;
    accessMode?: "connector_group" | "connector" | "direct";
    snmpConfigured?: boolean;
  };
  const accessLabel =
    extendedDevice.accessMode === "connector_group" && extendedDevice.connectorGroupName
      ? t("deviceDetail.accessVia", { name: extendedDevice.connectorGroupName })
      : extendedDevice.accessMode === "connector" && extendedDevice.connectorName
      ? t("deviceDetail.accessVia", { name: extendedDevice.connectorName })
      : t("deviceDetail.accessDirect");
  const tenantLabel = extendedDevice.tenantName ?? (extendedDevice.tenantId ? t("deviceDetail.tenantFallback", { id: extendedDevice.tenantId }) : null);

  const handleUpdate = (values: DeviceFormValues) => {
    const payload: DeviceUpdate = {
      hostname: values.hostname,
      ipAddress: values.ipAddress,
      vendor: values.vendor,
      platform: values.platform,
      username: values.username,
      site: values.site,
      sshPort: values.sshPort,
      role: values.role || "",
      ...buildDeviceAccessPayload(values),
    };

    appendSnmpToDevicePayload(payload, values.snmpCommunity, "edit");

    if (values.password.trim().length > 0) {
      payload.password = values.password;
    }

    updateDevice.mutate({ id: device.id, data: payload as DeviceUpdate }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetDeviceQueryKey(device.id) });
        queryClient.invalidateQueries({ queryKey: getListDevicesQueryKey() });
        setIsEditOpen(false);
        toast({ title: t("deviceDetail.toasts.updated") });
      },
      onError: (err: any) => {
        toast({ title: t("deviceDetail.toasts.updateError"), description: err.message, variant: "destructive" });
      },
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2 text-sm text-muted-foreground mb-2">
        <Link href="/devices" className="hover:text-foreground transition-colors">{t("deviceDetail.breadcrumb")}</Link>
        <ChevronRight className="h-4 w-4" />
        <span className="text-foreground">{device.hostname}</span>
      </div>

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-3">
            <Server className="h-8 w-8 text-primary" />
            {device.hostname}
          </h1>
          <div className="flex items-center gap-3 mt-2">
            <Badge variant={device.status === 'active' ? 'default' : 'destructive'} 
              className={device.status === 'active' ? 'bg-green-500/10 text-green-500' : ''}>
              {device.status}
            </Badge>
            <span className="text-sm font-mono bg-muted px-2 py-0.5 rounded">{device.ipAddress}</span>
            <span className="text-sm text-muted-foreground capitalize">{device.vendor} {device.platform}</span>
            {tenantLabel ? <Badge variant="secondary">{t("deviceDetail.tenantLabel", { name: tenantLabel })}</Badge> : null}
            <Badge variant="outline">{t("deviceDetail.accessLabel", { label: accessLabel })}</Badge>
          </div>
        </div>

        <DeviceFormDialog
          mode="edit"
          open={isEditOpen}
          onOpenChange={setIsEditOpen}
          onSubmit={handleUpdate}
          isPending={updateDevice.isPending}
          device={device}
          trigger={
            <Button variant="outline">
              <Pencil className="mr-2 h-4 w-4" />
              {t("common.edit")}
            </Button>
          }
        />
      </div>

      <Tabs defaultValue="overview" className="w-full">
        <TabsList className="grid w-full grid-cols-6 lg:w-[600px]">
          <TabsTrigger value="overview">{t("deviceDetail.tabs.overview")}</TabsTrigger>
          <TabsTrigger value="config">{t("deviceDetail.tabs.config")}</TabsTrigger>
          <TabsTrigger value="communities">{t("deviceDetail.tabs.communities")}</TabsTrigger>
          <TabsTrigger value="filters">{t("deviceDetail.tabs.filters")}</TabsTrigger>
          <TabsTrigger value="compliance">{t("deviceDetail.tabs.compliance")}</TabsTrigger>
          <TabsTrigger value="provisioning">{t("deviceDetail.tabs.provisioning")}</TabsTrigger>
        </TabsList>
        
        <TabsContent value="overview" className="space-y-6 mt-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">{t("deviceDetail.systemInformation")}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <div className="text-muted-foreground mb-1">{t("devices.hostname")}</div>
                    <div className="font-medium">{device.hostname}</div>
                  </div>
                  <div>
                    <div className="text-muted-foreground mb-1">{t("deviceDetail.ipAddress")}</div>
                    <div className="font-mono">{device.ipAddress}</div>
                  </div>
                  <div>
                    <div className="text-muted-foreground mb-1">{t("devices.vendor")}</div>
                    <div className="capitalize">{device.vendor}</div>
                  </div>
                  <div>
                    <div className="text-muted-foreground mb-1">{t("deviceDetail.platform")}</div>
                    <div className="uppercase">{device.platform}</div>
                  </div>
                  <div>
                    <div className="text-muted-foreground mb-1">{t("devices.site")}</div>
                    <div>{device.site}</div>
                  </div>
                  <div>
                    <div className="text-muted-foreground mb-1">{t("devices.role")}</div>
                    <div className="uppercase">{device.role || t("deviceDetail.na")}</div>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg">{t("deviceDetail.connectionDetails")}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <div className="text-muted-foreground mb-1">{t("deviceDetail.sshPort")}</div>
                    <div>{device.sshPort}</div>
                  </div>
                  <div>
                    <div className="text-muted-foreground mb-1">{t("deviceDetail.username")}</div>
                    <div>{device.username}</div>
                  </div>
                  <div>
                    <div className="text-muted-foreground mb-1">{t("deviceDetail.lastSeen")}</div>
                    <div>{device.lastSeen ? new Date(device.lastSeen).toLocaleString() : t("common.never")}</div>
                  </div>
                  <div>
                    <div className="text-muted-foreground mb-1">{t("deviceDetail.snmpCommunity")}</div>
                    <div>
                      {extendedDevice.snmpConfigured ? (
                        <Badge variant="outline" className="text-green-600 border-green-600/40">{t("deviceDetail.snmpConfigured")}</Badge>
                      ) : (
                        <span className="text-muted-foreground">{t("deviceDetail.snmpNotConfigured")}</span>
                      )}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg">{t("deviceDetail.connectorCollection")}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <div className="text-muted-foreground mb-1">{t("deviceDetail.accessMode")}</div>
                    <div>{collectionStatusQuery.data?.connectorName ? `Via ${collectionStatusQuery.data.connectorName}` : accessLabel}</div>
                  </div>
                  <div>
                    <div className="text-muted-foreground mb-1">{t("deviceDetail.lastSshBundle")}</div>
                    <div>{collectionStatusQuery.data?.lastSshBundleAt ? new Date(collectionStatusQuery.data.lastSshBundleAt).toLocaleString() : t("common.never")}</div>
                  </div>
                  <div>
                    <div className="text-muted-foreground mb-1">{t("deviceDetail.parseStatus")}</div>
                    <Badge variant="outline">{collectionStatusQuery.data?.parserStatus ?? "PENDING"}</Badge>
                  </div>
                  <div>
                    <div className="text-muted-foreground mb-1">{t("deviceDetail.snmpConfiguredShort")}</div>
                    <div>{collectionStatusQuery.data?.snmpConfigured ? t("common.yes") : t("common.no")}</div>
                  </div>
                  <div>
                    <div className="text-muted-foreground mb-1">{t("deviceDetail.parsedBgpPeers")}</div>
                    <div>{collectionStatusQuery.data?.bgpPeerCount ?? 0}</div>
                  </div>
                  <div>
                    <div className="text-muted-foreground mb-1">{t("deviceDetail.parsedL2Circuits")}</div>
                    <div>{collectionStatusQuery.data?.l2CircuitCount ?? 0}</div>
                  </div>
                </div>
                {collectionStatusQuery.data?.parserError && (
                  <p className="text-destructive text-xs">{collectionStatusQuery.data.parserError}</p>
                )}
              </CardContent>
            </Card>
          </div>
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">{t("deviceDetail.diagnosticsTitle", { label: accessLabel })}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <Button
                variant="outline"
                onClick={async () => {
                  try {
                    const response = await fetch(`/api/devices/${device.id}/diagnostics`, { method: "POST", credentials: "include" });
                    const data = await response.json();
                    if (!response.ok) throw new Error(data.error ?? t("deviceDetail.toasts.diagnosticsFailed"));
                    toast({
                      title: t("deviceDetail.toasts.diagnosticsTitle", { mode: data.mode }),
                      description: t("deviceDetail.toasts.diagnosticsDescription", { ssh: data.ssh?.success ? t("deviceDetail.toasts.ok") : t("deviceDetail.toasts.fail"), snmp: data.snmp?.success ? t("deviceDetail.toasts.ok") : t("deviceDetail.toasts.fail"), ping: data.ping?.success ? t("deviceDetail.toasts.ok") : data.ping?.message ?? "—" }),
                    });
                  } catch (error) {
                    toast({
                      title: t("deviceDetail.toasts.diagnosticsError"),
                      description: error instanceof Error ? error.message : t("deviceDetail.toasts.diagnosticsFailed"),
                      variant: "destructive",
                    });
                  }
                }}
              >
                {t("deviceDetail.runDiagnostics")}
              </Button>
            </CardContent>
          </Card>
          <DiscoveryPanel device={device} />
        </TabsContent>

        <TabsContent value="config" className="mt-6">
          <ConfigHistoryPanel deviceId={device.id} hostname={device.hostname} />
        </TabsContent>

        <TabsContent value="communities" className="mt-6">
          <Card className="border-border">
            <CardHeader className="border-b bg-muted/30">
              <CardTitle className="text-lg flex items-center gap-2">
                <Network className="h-5 w-5" />
                {t("deviceDetail.communitySets")}
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <CommunitySetsTab deviceId={device.id} />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="filters" className="mt-6">
          <Card className="border-border">
            <CardHeader className="border-b bg-muted/30">
              <CardTitle className="text-lg flex items-center gap-2">
                <Network className="h-5 w-5" />
                {t("deviceDetail.communityFiltersLibrary")}
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <CommunityLibraryTab deviceId={device.id} />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="compliance" className="mt-6 space-y-4">
          {deviceCompliance && (
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <ShieldCheck className="h-5 w-5" />
                    <div>
                      <CardTitle className="text-lg">{t("deviceDetail.complianceScore")}</CardTitle>
                      <div className="text-2xl font-bold mt-1">
                        {deviceCompliance.score}
                        <Badge className="ml-2" variant={
                          deviceCompliance.scoreCategory === 'PASS' ? 'default' :
                          deviceCompliance.scoreCategory === 'WARNING' ? 'secondary' : 'destructive'
                        }>
                          {deviceCompliance.scoreCategory}
                        </Badge>
                      </div>
                    </div>
                  </div>
                  <Button onClick={() => triggerComplianceRun(deviceId)}>{t("deviceDetail.runNow")}</Button>
                </div>
              </CardHeader>
              <CardContent className="text-xs text-muted-foreground">
                {t("deviceDetail.lastRun")}: {deviceCompliance.completedAt ? new Date(deviceCompliance.completedAt).toLocaleString() : t("common.never")}
              </CardContent>
            </Card>
          )}

          {deviceCompliance?.remediations && deviceCompliance.remediations.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">{t("deviceDetail.failingChecks")}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2 text-sm">
                  {deviceCompliance.remediations.slice(0, 10).map((item: any, idx: number) => (
                    <div key={idx} className="p-2 border rounded bg-muted/50">
                      <div className="font-mono text-xs">{item.remediation?.ruleId || 'unknown'}</div>
                      <div className="mt-1">{item.remediation?.cliSuggestion || t("deviceDetail.noSuggestion")}</div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {deviceDrifts && deviceDrifts.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">{t("deviceDetail.latestDrift")}</CardTitle>
              </CardHeader>
              <CardContent className="text-sm">
                <pre className="text-xs bg-muted p-2 rounded max-h-40 overflow-auto">
                  {deviceDrifts[0].driftSummary || t("deviceDetail.noDrift")}
                </pre>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle className="text-base">{t("deviceDetail.recentJobs")}</CardTitle>
            </CardHeader>
            <CardContent>
              {complianceJobs?.length ? (
                <div className="space-y-2">
                  {complianceJobs.slice(0, 5).map(job => (
                    <div key={job.id} className="text-xs p-2 border rounded flex justify-between">
                      <div>{t("deviceDetail.jobLabel", { id: job.id })} <Badge variant="outline" className="ml-1">{job.status}</Badge></div>
                      <div className="text-muted-foreground">{job.passCount}P / {job.failCount}F</div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-muted-foreground text-xs">{t("deviceDetail.noJobs")}</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="provisioning" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Rocket className="h-5 w-5" />
                {t("deviceDetail.provisioningHistory")}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {provisioningJobs?.length ? provisioningJobs.map(job => (
                  <div key={job.id} className="flex items-center justify-between p-4 border rounded-lg">
                    <div>
                      <div className="font-medium">{job.name}</div>
                      <div className="text-xs text-muted-foreground mt-1 uppercase tracking-wider">{job.type}</div>
                    </div>
                    <div className="text-right">
                      <Badge variant="outline">{job.status}</Badge>
                      <div className="text-xs text-muted-foreground mt-1">
                        {job.createdAt ? new Date(job.createdAt).toLocaleString() : ''}
                      </div>
                    </div>
                  </div>
                )) : <p className="text-muted-foreground text-sm">{t("deviceDetail.noProvisioningJobs")}</p>}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
