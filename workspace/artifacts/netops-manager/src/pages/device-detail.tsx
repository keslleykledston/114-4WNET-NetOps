import { useState } from "react";
import { useRoute } from "wouter";
import {
  useGetDevice, getGetDeviceQueryKey, getListDevicesQueryKey,
  useGetDeviceCollectedConfig, getGetDeviceCollectedConfigQueryKey,
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
import { Server, Activity, ShieldCheck, Rocket, Terminal, History, ChevronRight, Pencil, Network } from "lucide-react";
import { Link } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { DeviceFormDialog, type DeviceFormValues } from "@/components/device-form-dialog";
import { DiscoveryPanel } from "@/features/device-discovery/discovery-panel";
import { CommunityLibraryTab } from "@/features/bgp/community-library-tab";
import { CommunitySetsTab } from "@/features/bgp/community-sets-tab";

export default function DeviceDetail() {
  const [, params] = useRoute("/devices/:id");
  const deviceId = params?.id ? parseInt(params.id) : 0;
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [isEditOpen, setIsEditOpen] = useState(false);
  const updateDevice = useUpdateDevice();

  const { data: device, isLoading: deviceLoading } = useGetDevice(deviceId, { 
    query: { enabled: !!deviceId, queryKey: getGetDeviceQueryKey(deviceId) } 
  });
  
  const { data: config, isLoading: configLoading } = useGetDeviceCollectedConfig(deviceId, {
    query: { enabled: !!deviceId, queryKey: getGetDeviceCollectedConfigQueryKey(deviceId) }
  });

  const { data: complianceJobs } = useListComplianceJobs({ deviceId });
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
    return <div>Device not found</div>;
  }

  const extendedDevice = device as typeof device & {
    connectorId?: number | null;
    connectorName?: string | null;
    tenantId?: number | null;
    tenantName?: string | null;
    accessMode?: "connector" | "direct";
  };
  const accessLabel =
    extendedDevice.accessMode === "connector" && extendedDevice.connectorName
      ? `Via ${extendedDevice.connectorName}`
      : "Direto";
  const tenantLabel = extendedDevice.tenantName ?? (extendedDevice.tenantId ? `Tenant #${extendedDevice.tenantId}` : null);

  const handleUpdate = (values: DeviceFormValues) => {
    const payload: DeviceUpdate & { connectorId?: number | null } = {
      hostname: values.hostname,
      ipAddress: values.ipAddress,
      vendor: values.vendor,
      platform: values.platform,
      username: values.username,
      site: values.site,
      sshPort: values.sshPort,
      role: values.role || "",
      connectorId: values.connectorId ? Number(values.connectorId) : null,
    };

    if (values.snmpCommunity.trim().length > 0) {
      payload.snmpCommunity = values.snmpCommunity;
    }

    if (values.password.trim().length > 0) {
      payload.password = values.password;
    }

    updateDevice.mutate({ id: device.id, data: payload as DeviceUpdate }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetDeviceQueryKey(device.id) });
        queryClient.invalidateQueries({ queryKey: getListDevicesQueryKey() });
        setIsEditOpen(false);
        toast({ title: "Dispositivo atualizado" });
      },
      onError: (err: any) => {
        toast({ title: "Erro ao atualizar dispositivo", description: err.message, variant: "destructive" });
      },
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2 text-sm text-muted-foreground mb-2">
        <Link href="/devices" className="hover:text-foreground transition-colors">Devices</Link>
        <ChevronRight className="h-4 w-4" />
        <span className="text-foreground">{device.hostname}</span>
      </div>

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-3">
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
            {tenantLabel ? <Badge variant="secondary">Tenant: {tenantLabel}</Badge> : null}
            <Badge variant="outline">Acesso: {accessLabel}</Badge>
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
              Editar
            </Button>
          }
        />
      </div>

      <Tabs defaultValue="overview" className="w-full">
        <TabsList className="grid w-full grid-cols-6 lg:w-[600px]">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="config">Config</TabsTrigger>
          <TabsTrigger value="communities">Communities</TabsTrigger>
          <TabsTrigger value="filters">Filters</TabsTrigger>
          <TabsTrigger value="compliance">Compliance</TabsTrigger>
          <TabsTrigger value="provisioning">Provisioning</TabsTrigger>
        </TabsList>
        
        <TabsContent value="overview" className="space-y-6 mt-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">System Information</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <div className="text-muted-foreground mb-1">Hostname</div>
                    <div className="font-medium">{device.hostname}</div>
                  </div>
                  <div>
                    <div className="text-muted-foreground mb-1">IP Address</div>
                    <div className="font-mono">{device.ipAddress}</div>
                  </div>
                  <div>
                    <div className="text-muted-foreground mb-1">Vendor</div>
                    <div className="capitalize">{device.vendor}</div>
                  </div>
                  <div>
                    <div className="text-muted-foreground mb-1">Platform</div>
                    <div className="uppercase">{device.platform}</div>
                  </div>
                  <div>
                    <div className="text-muted-foreground mb-1">Site</div>
                    <div>{device.site}</div>
                  </div>
                  <div>
                    <div className="text-muted-foreground mb-1">Role</div>
                    <div className="uppercase">{device.role || 'N/A'}</div>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Connection Details</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <div className="text-muted-foreground mb-1">SSH Port</div>
                    <div>{device.sshPort}</div>
                  </div>
                  <div>
                    <div className="text-muted-foreground mb-1">Username</div>
                    <div>{device.username}</div>
                  </div>
                  <div>
                    <div className="text-muted-foreground mb-1">Last Seen</div>
                    <div>{device.lastSeen ? new Date(device.lastSeen).toLocaleString() : 'Never'}</div>
                  </div>
                  <div>
                    <div className="text-muted-foreground mb-1">SNMP Community</div>
                    <div>Not exposed</div>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Coleta via Connector</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <div className="text-muted-foreground mb-1">Modo de acesso</div>
                    <div>{collectionStatusQuery.data?.connectorName ? `Via ${collectionStatusQuery.data.connectorName}` : accessLabel}</div>
                  </div>
                  <div>
                    <div className="text-muted-foreground mb-1">Último bundle SSH</div>
                    <div>{collectionStatusQuery.data?.lastSshBundleAt ? new Date(collectionStatusQuery.data.lastSshBundleAt).toLocaleString() : "Nunca"}</div>
                  </div>
                  <div>
                    <div className="text-muted-foreground mb-1">Status do parse</div>
                    <Badge variant="outline">{collectionStatusQuery.data?.parserStatus ?? "PENDING"}</Badge>
                  </div>
                  <div>
                    <div className="text-muted-foreground mb-1">SNMP configurado</div>
                    <div>{collectionStatusQuery.data?.snmpConfigured ? "Sim" : "Não"}</div>
                  </div>
                  <div>
                    <div className="text-muted-foreground mb-1">Peers BGP parseados</div>
                    <div>{collectionStatusQuery.data?.bgpPeerCount ?? 0}</div>
                  </div>
                  <div>
                    <div className="text-muted-foreground mb-1">Circuitos L2 parseados</div>
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
              <CardTitle className="text-lg">Diagnóstico via {accessLabel}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <Button
                variant="outline"
                onClick={async () => {
                  try {
                    const response = await fetch(`/api/devices/${device.id}/diagnostics`, { method: "POST", credentials: "include" });
                    const data = await response.json();
                    if (!response.ok) throw new Error(data.error ?? "Falha no diagnóstico");
                    toast({
                      title: `Diagnóstico (${data.mode})`,
                      description: `SSH: ${data.ssh?.success ? "OK" : "fail"} · SNMP: ${data.snmp?.success ? "OK" : "fail"} · Ping: ${data.ping?.success ? "OK" : data.ping?.message ?? "—"}`,
                    });
                  } catch (error) {
                    toast({
                      title: "Erro no diagnóstico",
                      description: error instanceof Error ? error.message : "Falha",
                      variant: "destructive",
                    });
                  }
                }}
              >
                Executar ping / TCP / SNMP / SSH
              </Button>
            </CardContent>
          </Card>
          <DiscoveryPanel device={device} />
        </TabsContent>

        <TabsContent value="config" className="mt-6">
          <Card className="border-border">
            <CardHeader className="border-b bg-muted/30">
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg flex items-center gap-2">
                  <Terminal className="h-5 w-5" />
                  Running Configuration
                </CardTitle>
                {config && <span className="text-xs text-muted-foreground">Collected: {new Date(config.collectedAt).toLocaleString()}</span>}
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {configLoading ? (
                <div className="p-6"><Skeleton className="h-64 w-full" /></div>
              ) : config?.rawConfig ? (
                <pre className="p-4 overflow-x-auto text-xs font-mono text-muted-foreground max-h-[600px]">
                  {config.rawConfig}
                </pre>
              ) : (
                <div className="p-12 text-center text-muted-foreground">
                  <Terminal className="h-8 w-8 mx-auto mb-3 opacity-50" />
                  <p>No configuration collected yet.</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="communities" className="mt-6">
          <Card className="border-border">
            <CardHeader className="border-b bg-muted/30">
              <CardTitle className="text-lg flex items-center gap-2">
                <Network className="h-5 w-5" />
                Community Sets
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
                Community Filters Library
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <CommunityLibraryTab deviceId={device.id} />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="compliance" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <ShieldCheck className="h-5 w-5" />
                Recent Compliance Checks
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {complianceJobs?.length ? complianceJobs.map(job => (
                  <div key={job.id} className="flex items-center justify-between p-4 border rounded-lg">
                    <div>
                      <div className="font-medium flex items-center gap-2">
                        Job #{job.id}
                        <Badge variant="outline" className={
                          job.status === 'passed' ? 'text-green-500 border-green-500/50' : 
                          job.status === 'failed' ? 'text-red-500 border-red-500/50' : ''
                        }>{job.status}</Badge>
                      </div>
                      <div className="text-xs text-muted-foreground mt-1">Contexts: {job.contexts.join(', ')}</div>
                    </div>
                    <div className="text-right">
                      <div className="text-sm">
                        <span className="text-green-500">{job.passCount} passed</span>, 
                        <span className="text-red-500 ml-1">{job.failCount} failed</span>
                      </div>
                      <div className="text-xs text-muted-foreground mt-1">
                        {job.completedAt ? new Date(job.completedAt).toLocaleString() : 'Running...'}
                      </div>
                    </div>
                  </div>
                )) : <p className="text-muted-foreground text-sm">No compliance jobs found for this device.</p>}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
        
        <TabsContent value="provisioning" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Rocket className="h-5 w-5" />
                Provisioning History
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
                )) : <p className="text-muted-foreground text-sm">No provisioning jobs found for this device.</p>}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
