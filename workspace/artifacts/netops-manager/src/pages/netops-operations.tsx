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
import { appendSnmpToDevicePayload, buildDeviceAccessPayload } from "@/features/devices/device-connector-utils";
import { DeviceFormDialog, type DeviceFormValues } from "@/components/device-form-dialog";
import { NetopsTree, type NetopsTreeSelection, type NetopsTreeView } from "@/features/netops-tree";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { useTranslation } from "@/i18n";
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
  const { t } = useTranslation();

  const viewLabel = (view: NetopsTreeView) => t(`netopsOperations.views.${view}`);

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
    const payload: DeviceInput = {
      hostname: values.hostname,
      ipAddress: values.ipAddress,
      vendor: values.vendor,
      platform: values.platform,
      username: values.username,
      password: values.password,
      site: values.site,
      sshPort: values.sshPort,
      role: values.role || undefined,
      ...buildDeviceAccessPayload(values),
    };
    appendSnmpToDevicePayload(payload, values.snmpCommunity, "create");

    createDevice.mutate({ data: payload as DeviceInput }, {
      onSuccess: async (newDevice: Device) => {
        toast({ title: t("netopsOperations.toasts.testingConnectivity") });
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
            toast({ title: t("netopsOperations.toasts.deviceAddedCollectQueued"), description: testResult.message });
          } else if (testResult.success && testResult.configCollect?.status === "failed") {
            toast({
              title: t("netopsOperations.toasts.sshOkCollectFailed"),
              description: testResult.configCollect.message ?? testResult.message,
              variant: "destructive",
            });
          } else if (testResult.success) {
            toast({ title: t("netopsOperations.toasts.deviceAddedSshSnmpOk") });
          } else {
            toast({
              title: t("netopsOperations.toasts.deviceAddedTestsFailed"),
              description: t("netopsOperations.toasts.deviceAddedTestsFailedDesc"),
              variant: "destructive",
            });
          }
        } catch {
          toast({ title: t("netopsOperations.toasts.deviceAdded"), description: t("netopsOperations.toasts.testsNotRun") });
          invalidateOperationalQueries(newDevice.id);
          setIsCreateOpen(false);
        }
      },
      onError: (err: any) => {
        toast({ title: t("netopsOperations.toasts.addError"), description: err.message, variant: "destructive" });
      },
    });
  };

  const handleUpdate = (values: DeviceFormValues) => {
    if (!editingDevice) return;

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

    updateDevice.mutate({ id: editingDevice.id, data: payload as DeviceUpdate }, {
      onSuccess: (updated: Device) => {
        invalidateOperationalQueries(updated.id);
        setSelection((current) =>
          current?.device.id === updated.id ? { device: updated, view: current.view } : current,
        );
        setEditingDeviceId(null);
        toast({ title: t("netopsOperations.toasts.updated") });
      },
      onError: (err: any) => {
        toast({ title: t("netopsOperations.toasts.updateError"), description: err.message, variant: "destructive" });
      },
    });
  };

  const handleDelete = (deviceId: number) => {
    if (!confirm(t("netopsOperations.deleteConfirm"))) return;

    deleteDevice.mutate({ id: deviceId }, {
      onSuccess: () => {
        void queryClient.invalidateQueries({ queryKey: getListDevicesQueryKey() });
        setSelection((current) => (current?.device.id === deviceId ? null : current));
        toast({ title: t("netopsOperations.toasts.removed") });
      },
      onError: (err: any) => {
        toast({ title: t("netopsOperations.toasts.removeError"), description: err.message, variant: "destructive" });
      },
    });
  };

  const handleTestConnection = (device: Device) => {
    toast({ title: t("netopsOperations.toasts.validatingSsh") });
    testConnection.mutate({ id: device.id }, {
      onSuccess: (res: ConnectionTestResponse) => {
        invalidateOperationalQueries(device.id);

        if (res.success && res.configCollect?.status === "queued") {
          toast({
            title: t("netopsOperations.toasts.sshOkCollectQueued"),
            description: res.message,
          });
          return;
        }

        if (res.success && res.configCollect?.status === "failed") {
          toast({
            title: t("netopsOperations.toasts.sshOkCollectFailed"),
            description: res.configCollect.message ?? res.message,
            variant: "destructive",
          });
          return;
        }

        toast({
          title: res.success ? t("netopsOperations.toasts.sshOk") : t("netopsOperations.toasts.sshFailed"),
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
      ? t("netopsOperations.accessVia", { name: extendedDevice.connectorGroupName })
      : extendedDevice?.accessMode === "connector" && extendedDevice.connectorName
      ? t("netopsOperations.accessVia", { name: extendedDevice.connectorName })
      : t("netopsOperations.accessDirect");
  const tenantLabel = extendedDevice?.tenantName ?? (extendedDevice?.tenantId ? t("netopsOperations.tenantFallback", { id: extendedDevice.tenantId }) : null);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold tracking-tight">{t("netopsOperations.title")}</h1>
          <p className="text-muted-foreground">{t("netopsOperations.pageSubtitle")}</p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => setIsImportOpen(true)}>
            <Download className="mr-2 h-4 w-4" />
            {t("netopsOperations.import")}
          </Button>
          <Button onClick={() => setIsCreateOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            {t("devices.addDevice")}
          </Button>
        </div>
      </div>

      <DeviceImportModal
        isOpen={isImportOpen}
        onClose={() => setIsImportOpen(false)}
        onSuccess={() => {
          toast({ title: t("netopsOperations.toasts.importSuccess") });
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
                {inventoryCollapsed ? t("netopsOperations.inventoryShort") : t("netopsOperations.inventory")}
              </CardTitle>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={() => setInventoryCollapsed((current) => !current)}
                aria-label={inventoryCollapsed ? t("netopsOperations.expandInventory") : t("netopsOperations.collapseInventory")}
                title={inventoryCollapsed ? t("netopsOperations.expandInventory") : t("netopsOperations.collapseInventory")}
              >
                {inventoryCollapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
              </Button>
            </div>
            {!inventoryCollapsed ? (
              <>
                <div className="flex items-center gap-2 rounded-md border border-border bg-muted/30 px-3 py-2">
                  <Search className="h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder={t("netopsOperations.searchPlaceholder")}
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    className="border-0 bg-transparent p-0 shadow-none focus-visible:ring-0"
                  />
                </div>
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>{t("netopsOperations.deviceCount", { filtered: filteredDevices.length, total: sortedDevices.length })}</span>
                  {activeSelection?.device ? <span>{t("netopsOperations.selectedHostname", { hostname: activeSelection.device.hostname })}</span> : null}
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
                {t("netopsOperations.noDeviceSelected")}
              </CardContent>
            </Card>
          ) : (
            <>
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <div className="text-sm text-muted-foreground">{selectedDevice.site || t("netopsOperations.noCustomer")}</div>
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
                    {tenantLabel ? <Badge variant="secondary">{t("netopsOperations.tenantLabel", { name: tenantLabel })}</Badge> : null}
                    <Badge variant="outline">{t("netopsOperations.accessLabel", { label: accessLabel })}</Badge>
                  </div>
                </div>

                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="outline"
                    onClick={() => handleTestConnection(selectedDevice)}
                    disabled={testConnection.isPending}
                  >
                    <Activity className="mr-2 h-4 w-4" />
                    {testConnection.isPending ? t("netopsOperations.testing") : t("netopsOperations.test")}
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => setEditingDeviceId(selectedDevice.id)}
                  >
                    <Pencil className="mr-2 h-4 w-4" />
                    {t("common.edit")}
                  </Button>
                  <Button
                    variant="destructive"
                    onClick={() => handleDelete(selectedDevice.id)}
                  >
                    <Trash2 className="mr-2 h-4 w-4" />
                    {t("common.delete")}
                  </Button>
                </div>
              </div>

              {activeSelection.view === "device" && <OperationalSummary device={selectedDevice} />}

              {activeSelection.view === "interfaces" && (
                <InterfacesPanel device={selectedDevice} />
              )}

              {activeSelection.view === "bgp" && (
                <BgpPanel device={selectedDevice} title={t("netopsOperations.bgp")} />
              )}

              {activeSelection.view === "bgp-providers" && (
                <BgpPanel device={selectedDevice} title={t("netopsOperations.bgpProviders")} role="provider" />
              )}

              {activeSelection.view === "bgp-customers" && (
                <BgpPanel device={selectedDevice} title={t("netopsOperations.bgpCustomers")} role="customer" />
              )}

              {activeSelection.view === "bgp-cdn" && (
                <BgpPanel device={selectedDevice} title={t("netopsOperations.bgpCdn")} role="cdn" />
              )}

              {activeSelection.view === "bgp-ix" && (
                <BgpPanel device={selectedDevice} title={t("netopsOperations.bgpIx")} role="ix" />
              )}

              {activeSelection.view === "bgp-cdn-ix" && (
                <BgpPanel device={selectedDevice} title={t("netopsOperations.bgpCdnIx")} role="cdn_ix" />
              )}

              {activeSelection.view === "bgp-ibgp" && (
                <BgpPanel device={selectedDevice} title={t("netopsOperations.bgpIbgp")} role="ibgp" />
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
