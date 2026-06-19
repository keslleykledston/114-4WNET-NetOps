import { useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  getGetDeviceDiscoverySnapshotQueryKey,
  getGetNetopsDeviceSummaryQueryKey,
  getGetDeviceQueryKey,
  getListDeviceBgpPeersQueryKey,
  getListDevicesQueryKey,
  getListNetopsDeviceBgpPeersQueryKey,
  getListNetopsDeviceCommunitiesQueryKey,
  getListNetopsDeviceFiltersQueryKey,
  getListNetopsDeviceInterfacesQueryKey,
  getListNetopsDeviceLogsQueryKey,
  useCreateDevice,
  useDeleteDevice,
  useListDevices,
  useTestDeviceConnection,
  useUpdateDevice,
  type ConnectionTestResult,
  type Device,
  type DeviceInput,
  type DeviceUpdate,
} from "@workspace/api-client-react";
import { BgpPanel } from "@/features/bgp/bgp-panel";
import { FiltersPanel } from "@/features/bgp/filters-panel";
import { CommunitiesPanel } from "@/features/communities/communities-placeholder-panel";
import { InterfacesPanel } from "@/features/device-inventory/interfaces-panel";
import { OperationalLogsPanel } from "@/features/device-inventory/operational-logs-panel";
import { OperationalSummary } from "@/features/device-inventory/operational-summary";
import { DeviceImportModal } from "@/features/devices/device-import-modal";
import { DeviceFormDialog, type DeviceFormValues } from "@/components/device-form-dialog";
import { NetopsTree, type NetopsTreeSelection, viewLabel } from "@/features/netops-tree";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { Activity, ChevronLeft, ChevronRight, Download, Pencil, Plus, Search, Trash2 } from "lucide-react";

type ConnectionTestResponse = ConnectionTestResult;

function useFilteredDevices(devices: Device[] | undefined, search: string) {
  return useMemo(() => {
    const normalized = search.trim().toLowerCase();
    const sorted = [...(devices ?? [])].sort((left, right) =>
      left.hostname.localeCompare(right.hostname, "pt", { sensitivity: "base" }),
    );

    if (!normalized) return sorted;

    return sorted.filter((device) => {
      const haystack = [
        device.hostname,
        device.ipAddress,
        device.site,
        device.vendor,
        device.platform,
        device.role ?? "",
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(normalized);
    });
  }, [devices, search]);
}

export default function NetopsOperations() {
  const { data: devices, isLoading } = useListDevices();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [selection, setSelection] = useState<NetopsTreeSelection | null>(null);
  const [search, setSearch] = useState("");
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [editingDeviceId, setEditingDeviceId] = useState<number | null>(null);
  const [inventoryCollapsed, setInventoryCollapsed] = useState(false);

  const filteredDevices = useFilteredDevices(devices, search);
  const sortedDevices = useMemo(
    () => [...(devices ?? [])].sort((left, right) => left.hostname.localeCompare(right.hostname, "pt", { sensitivity: "base" })),
    [devices],
  );

  const activeSelection = useMemo(() => {
    if (selection) {
      const freshDevice = devices?.find((device) => device.id === selection.device.id) ?? selection.device;
      return { device: freshDevice, view: selection.view };
    }

    if (search.trim().length > 0) {
      return null;
    }

    const fallback = filteredDevices[0] ?? sortedDevices[0] ?? null;
    return fallback ? { device: fallback, view: "device" as const } : null;
  }, [devices, filteredDevices, search, selection, sortedDevices]);

  const editingDevice = useMemo(
    () => devices?.find((device) => device.id === editingDeviceId) ?? null,
    [devices, editingDeviceId],
  );

  const createDevice = useCreateDevice();
  const updateDevice = useUpdateDevice();
  const deleteDevice = useDeleteDevice();
  const testConnection = useTestDeviceConnection();

  const initialDeviceId = useMemo(() => {
    const params = new URLSearchParams(window.location.search);
    const raw = params.get("deviceId") ?? params.get("device_id");
    const parsed = Number(raw);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
  }, []);

  useEffect(() => {
    if (!initialDeviceId || sortedDevices.length === 0) return;
    const device = sortedDevices.find((item) => item.id === initialDeviceId);
    if (!device) return;
    setSelection((current) => (current?.device.id === device.id ? current : { device, view: "device" as const }));
  }, [initialDeviceId, sortedDevices]);

  const invalidateOperationalQueries = (deviceId: number) => {
    void queryClient.invalidateQueries({ queryKey: getListDevicesQueryKey() });
    void queryClient.invalidateQueries({ queryKey: getGetDeviceQueryKey(deviceId) });
    void queryClient.invalidateQueries({ queryKey: getGetNetopsDeviceSummaryQueryKey(deviceId) });
    void queryClient.invalidateQueries({ queryKey: getListNetopsDeviceInterfacesQueryKey(deviceId) });
    void queryClient.invalidateQueries({ queryKey: getListNetopsDeviceBgpPeersQueryKey(deviceId) });
    void queryClient.invalidateQueries({ queryKey: getListNetopsDeviceFiltersQueryKey(deviceId) });
    void queryClient.invalidateQueries({ queryKey: getListNetopsDeviceCommunitiesQueryKey(deviceId) });
    void queryClient.invalidateQueries({ queryKey: getListNetopsDeviceLogsQueryKey(deviceId) });
    void queryClient.invalidateQueries({ queryKey: getGetDeviceDiscoverySnapshotQueryKey(deviceId) });
    void queryClient.invalidateQueries({ queryKey: getListDeviceBgpPeersQueryKey(deviceId) });
  };

  const handleCreate = (values: DeviceFormValues) => {
    const payload = {
      hostname: values.hostname,
      ipAddress: values.ipAddress,
      vendor: values.vendor,
      platform: values.platform,
      username: values.username,
      password: values.password,
      site: values.site,
      sshPort: values.sshPort,
      role: values.role || undefined,
      snmpCommunity: values.snmpCommunity || undefined,
      ...(values.connectorGroupId ? { connectorGroupId: Number(values.connectorGroupId) } : {}),
    } as DeviceInput & { connectorGroupId?: number };

    createDevice.mutate({ data: payload as DeviceInput }, {
      onSuccess: async (newDevice: Device) => {
        toast({ title: "Testando conectividade..." });
        setSelection({ device: newDevice, view: "device" });

        try {
          const testResponse = await fetch(`/api/devices/${newDevice.id}/test-connectivity`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
          });
          const testResult = await testResponse.json() as ConnectionTestResponse;

          invalidateOperationalQueries(newDevice.id);
          setIsCreateOpen(false);

          if (testResult.success && testResult.configCollect?.status === "queued") {
            toast({ title: "Dispositivo adicionado — SSH OK — coleta completa enfileirada", description: testResult.message });
          } else if (testResult.success && testResult.configCollect?.status === "failed") {
            toast({
              title: "SSH acessível, porém backup/coleta falhou",
              description: testResult.configCollect.message ?? testResult.message,
              variant: "destructive",
            });
          } else if (testResult.success) {
            toast({ title: "Dispositivo adicionado — SSH e SNMP OK" });
          } else {
            toast({
              title: "Dispositivo adicionado — Falha em testes",
              description: "Nem SSH nem SNMP responderam. Verifique IP e credenciais.",
              variant: "destructive",
            });
          }
        } catch {
          toast({ title: "Dispositivo adicionado", description: "Testes não puderam ser executados" });
          invalidateOperationalQueries(newDevice.id);
          setIsCreateOpen(false);
        }
      },
      onError: (err: any) => {
        toast({ title: "Erro ao adicionar dispositivo", description: err.message, variant: "destructive" });
      },
    });
  };

  const handleUpdate = (values: DeviceFormValues) => {
    if (!editingDevice) return;

    const payload = {
      hostname: values.hostname,
      ipAddress: values.ipAddress,
      vendor: values.vendor,
      platform: values.platform,
      username: values.username,
      site: values.site,
      sshPort: values.sshPort,
      role: values.role || "",
      snmpCommunity: values.snmpCommunity,
      ...(values.connectorGroupId ? { connectorGroupId: Number(values.connectorGroupId) } : {}),
    } as DeviceUpdate & { connectorGroupId?: number };

    if (values.password.trim().length > 0) {
      payload.password = values.password;
    }

    updateDevice.mutate({ id: editingDevice.id, data: payload as DeviceUpdate }, {
      onSuccess: (updated: Device) => {
        invalidateOperationalQueries(updated.id);
        setSelection((current) =>
          current?.device.id === updated.id ? { device: updated, view: current.view } : current,
        );
        setEditingDeviceId(null);
        toast({ title: "Dispositivo atualizado" });
      },
      onError: (err: any) => {
        toast({ title: "Erro ao atualizar dispositivo", description: err.message, variant: "destructive" });
      },
    });
  };

  const handleDelete = (deviceId: number) => {
    if (!confirm("Excluir este dispositivo?")) return;

    deleteDevice.mutate({ id: deviceId }, {
      onSuccess: () => {
        void queryClient.invalidateQueries({ queryKey: getListDevicesQueryKey() });
        setSelection((current) => (current?.device.id === deviceId ? null : current));
        toast({ title: "Dispositivo removido" });
      },
      onError: (err: any) => {
        toast({ title: "Erro ao remover dispositivo", description: err.message, variant: "destructive" });
      },
    });
  };

  const handleTestConnection = (device: Device) => {
    toast({ title: "Validando conexão SSH..." });
    testConnection.mutate({ id: device.id }, {
      onSuccess: (res: ConnectionTestResponse) => {
        invalidateOperationalQueries(device.id);

        if (res.success && res.configCollect?.status === "queued") {
          toast({
            title: "SSH OK — coleta completa enfileirada",
            description: res.message,
          });
          return;
        }

        if (res.success && res.configCollect?.status === "failed") {
          toast({
            title: "SSH acessível, porém backup/coleta falhou",
            description: res.configCollect.message ?? res.message,
            variant: "destructive",
          });
          return;
        }

        toast({
          title: res.success ? "Conexão SSH OK" : "Falha na conexão SSH",
          description: res.message,
          variant: res.success ? "default" : "destructive",
        });
      },
    });
  };

  const selectedDevice = activeSelection?.device ?? null;
  const extendedDevice = selectedDevice as Device & {
    connectorId?: number | null;
    connectorGroupId?: number | null;
    connectorName?: string | null;
    connectorGroupName?: string | null;
    connectorGroupStrategy?: string | null;
    tenantId?: number | null;
    tenantName?: string | null;
    accessMode?: "connector_group" | "connector" | "direct";
  } | null;

  const accessLabel =
    extendedDevice?.accessMode === "connector_group" && extendedDevice.connectorGroupName
      ? `Via ${extendedDevice.connectorGroupName}`
      : extendedDevice?.accessMode === "connector" && extendedDevice.connectorName
      ? `Via ${extendedDevice.connectorName}`
      : "Direto";
  const tenantLabel = extendedDevice?.tenantName ?? (extendedDevice?.tenantId ? `Tenant #${extendedDevice.tenantId}` : null);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold tracking-tight">NetOps Operations</h1>
          <p className="text-muted-foreground">Arvore operacional, inventario e acoes read-only por device.</p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => setIsImportOpen(true)}>
            <Download className="mr-2 h-4 w-4" />
            Import
          </Button>
          <Button onClick={() => setIsCreateOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Add Device
          </Button>
        </div>
      </div>

      <DeviceImportModal
        isOpen={isImportOpen}
        onClose={() => setIsImportOpen(false)}
        onSuccess={() => {
          toast({ title: "Importação concluída com sucesso" });
          void queryClient.invalidateQueries({ queryKey: getListDevicesQueryKey() });
          setIsImportOpen(false);
        }}
      />

      <DeviceFormDialog
        mode="create"
        open={isCreateOpen}
        onOpenChange={setIsCreateOpen}
        onSubmit={handleCreate}
        isPending={createDevice.isPending}
      />

      <DeviceFormDialog
        mode="edit"
        open={editingDeviceId !== null}
        onOpenChange={(open) => {
          if (!open) setEditingDeviceId(null);
        }}
        onSubmit={handleUpdate}
        isPending={updateDevice.isPending}
        device={editingDevice}
      />

      <div className="grid gap-6 transition-all duration-200 lg:grid-cols-[var(--inventory-width)_minmax(0,1fr)]" style={{ ["--inventory-width" as string]: inventoryCollapsed ? "4.5rem" : "20rem" }}>
        <Card className="h-fit overflow-hidden">
          <CardHeader className="space-y-3 py-4">
            <div className="flex items-center justify-between gap-2">
              <CardTitle className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                {inventoryCollapsed ? "Inv." : "Inventário"}
              </CardTitle>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={() => setInventoryCollapsed((current) => !current)}
                aria-label={inventoryCollapsed ? "Expand inventory" : "Collapse inventory"}
                title={inventoryCollapsed ? "Expand inventory" : "Collapse inventory"}
              >
                {inventoryCollapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
              </Button>
            </div>
            {!inventoryCollapsed ? (
              <>
                <div className="flex items-center gap-2 rounded-md border border-border bg-muted/30 px-3 py-2">
                  <Search className="h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Buscar hostname, IP, site..."
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    className="border-0 bg-transparent p-0 shadow-none focus-visible:ring-0"
                  />
                </div>
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>{filteredDevices.length} de {sortedDevices.length} devices</span>
                  {activeSelection?.device ? <span>Selecionado: {activeSelection.device.hostname}</span> : null}
                </div>
              </>
            ) : null}
          </CardHeader>
          {!inventoryCollapsed ? <Separator /> : null}
          <CardContent className={inventoryCollapsed ? "px-2 pb-3 pt-0" : "p-3"}>
            {inventoryCollapsed ? (
              <div className="flex flex-col items-center gap-2 py-2 text-muted-foreground">
                <span className="text-[10px] uppercase tracking-[0.2em]">Inv</span>
                <span className="text-xs">{filteredDevices.length}</span>
              </div>
            ) : isLoading ? (
              <div className="space-y-2">
                <Skeleton className="h-8 w-full" />
                <Skeleton className="h-8 w-4/5" />
                <Skeleton className="h-8 w-3/5" />
              </div>
            ) : (
              <NetopsTree devices={filteredDevices} selected={activeSelection} onSelect={setSelection} />
            )}
          </CardContent>
        </Card>

        <div className="min-w-0 space-y-6">
          {!activeSelection || !selectedDevice ? (
            <Card>
              <CardContent className="p-12 text-center text-muted-foreground">
                No device selected.
              </CardContent>
            </Card>
          ) : (
            <>
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <div className="text-sm text-muted-foreground">{selectedDevice.site || "Sem cliente"}</div>
                  <h2 className="flex items-center gap-3 text-2xl font-semibold tracking-tight">
                    {selectedDevice.hostname} / {viewLabel(activeSelection.view)}
                  </h2>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <Badge variant={selectedDevice.status === "active" ? "default" : "destructive"}>
                      {selectedDevice.status}
                    </Badge>
                    <span className="rounded-md bg-muted px-2 py-0.5 font-mono text-sm">{selectedDevice.ipAddress}</span>
                    <span className="text-sm text-muted-foreground capitalize">
                      {selectedDevice.vendor} {selectedDevice.platform}
                    </span>
                    {tenantLabel ? <Badge variant="secondary">Tenant: {tenantLabel}</Badge> : null}
                    <Badge variant="outline">Acesso: {accessLabel}</Badge>
                  </div>
                </div>

                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="outline"
                    onClick={() => handleTestConnection(selectedDevice)}
                    disabled={testConnection.isPending}
                  >
                    <Activity className="mr-2 h-4 w-4" />
                    {testConnection.isPending ? "Testando..." : "Testar"}
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => setEditingDeviceId(selectedDevice.id)}
                  >
                    <Pencil className="mr-2 h-4 w-4" />
                    Editar
                  </Button>
                  <Button
                    variant="destructive"
                    onClick={() => handleDelete(selectedDevice.id)}
                  >
                    <Trash2 className="mr-2 h-4 w-4" />
                    Excluir
                  </Button>
                </div>
              </div>

              {activeSelection.view === "device" && <OperationalSummary device={selectedDevice} />}

              {activeSelection.view === "interfaces" && (
                <InterfacesPanel device={selectedDevice} />
              )}

              {activeSelection.view === "bgp" && (
                <BgpPanel device={selectedDevice} title="BGP" />
              )}

              {activeSelection.view === "bgp-providers" && (
                <BgpPanel device={selectedDevice} title="BGP Operadoras" role="provider" />
              )}

              {activeSelection.view === "bgp-customers" && (
                <BgpPanel device={selectedDevice} title="BGP Clientes" role="customer" />
              )}

              {activeSelection.view === "bgp-cdn" && (
                <BgpPanel device={selectedDevice} title="BGP CDN" role="cdn" />
              )}

              {activeSelection.view === "bgp-ix" && (
                <BgpPanel device={selectedDevice} title="BGP IX" role="ix" />
              )}

              {activeSelection.view === "bgp-cdn-ix" && (
                <BgpPanel device={selectedDevice} title="BGP CDN/IX" role="cdn_ix" />
              )}

              {activeSelection.view === "bgp-ibgp" && (
                <BgpPanel device={selectedDevice} title="BGP iBGP" role="ibgp" />
              )}

              {activeSelection.view === "filters" && (
                <FiltersPanel device={selectedDevice} />
              )}

              {activeSelection.view === "communities" && (
                <CommunitiesPanel device={selectedDevice} />
              )}

              <OperationalLogsPanel device={selectedDevice} />
            </>
          )}
        </div>
      </div>
    </div>
  );
}
