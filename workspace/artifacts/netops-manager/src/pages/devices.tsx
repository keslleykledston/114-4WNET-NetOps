import { useState } from "react";
import { useListDevices, useCreateDevice, useUpdateDevice, getListDevicesQueryKey, getGetDeviceQueryKey, useTestDeviceConnection, useDeleteDevice } from "@workspace/api-client-react";
import type { Device, DeviceInput, DeviceUpdate } from "@workspace/api-client-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { listConnectors } from "@/features/connectors/connectors-api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Server, Plus, Search, Trash2, Activity, TerminalSquare, SearchX, Pencil, Download } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Link } from "wouter";
import { DeviceFormDialog, type DeviceFormValues } from "@/components/device-form-dialog";
import { DeviceImportModal } from "@/features/devices/device-import-modal";

type ConnectionTestResponse = {
  success: boolean;
  message: string;
  latencyMs?: number | null;
  hostname?: string | null;
  configCollect?: {
    correlationId?: string;
    sshConfigBundle?: { status: "queued" | "failed"; jobId?: number; message?: string };
    snmpFast?: { status: "queued" | "skipped" | "failed"; message?: string };
  };
};

export default function Devices() {
  const [search, setSearch] = useState("");
  const { data: devices, isLoading } = useListDevices();
  const connectorsQuery = useQuery({ queryKey: ["connectors"], queryFn: listConnectors });
  const queryClient = useQueryClient();

  type DeviceRow = Device & {
    connectorId?: number | null;
    connectorName?: string | null;
    tenantId?: number | null;
    tenantName?: string | null;
    accessMode?: "connector" | "direct";
  };
  const { toast } = useToast();

  const createDevice = useCreateDevice();
  const updateDevice = useUpdateDevice();
  const deleteDevice = useDeleteDevice();
  const testConnection = useTestDeviceConnection();

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [editingDeviceId, setEditingDeviceId] = useState<number | null>(null);
  const editingDevice = devices?.find((device) => device.id === editingDeviceId) ?? null;

  const handleCreate = (values: DeviceFormValues) => {
    const payload: DeviceInput & { connectorId?: number | null } = {
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
      connectorId: values.connectorId ? Number(values.connectorId) : null,
    };

    createDevice.mutate({ data: payload as DeviceInput }, {
      onSuccess: async (newDevice: any) => {
        toast({ title: "Testando conectividade..." });

        try {
          const testResponse = await fetch(`/api/devices/${newDevice.id}/test-connectivity`, {
            method: "POST",
            headers: { "Content-Type": "application/json" }
          });
          const testResult = await testResponse.json();

          queryClient.invalidateQueries({ queryKey: getListDevicesQueryKey() });
          setIsCreateOpen(false);

          if (testResult.status === "active") {
            toast({ title: "Dispositivo adicionado — SSH e SNMP OK" });
          } else if (testResult.ssh?.success && testResult.configCollect?.sshConfigBundle?.status === "queued") {
            toast({
              title: "Dispositivo adicionado — SSH OK — coleta completa enfileirada",
              description: testResult.ssh.message,
            });
          } else if (testResult.ssh?.success && testResult.configCollect?.sshConfigBundle?.status === "failed") {
            toast({
              title: "SSH acessível, porém backup/coleta falhou",
              description: testResult.configCollect.sshConfigBundle.message ?? testResult.ssh.message,
              variant: "destructive",
            });
          } else if (testResult.status === "pending") {
            const working = testResult.ssh?.success ? "SSH" : "SNMP";
            const failing = testResult.ssh?.success ? "SNMP" : "SSH";
            toast({
              title: "Dispositivo adicionado — Status pendente",
              description: `${working} OK, ${failing} falhou. Verifique as credenciais.`
            });
          } else {
            toast({
              title: "Dispositivo adicionado — Falha em testes",
              description: "Nem SSH nem SNMP responderam. Verifique IP e credenciais.",
              variant: "destructive"
            });
          }
        } catch (err) {
          toast({ title: "Dispositivo adicionado", description: "Testes não puderam ser executados" });
          queryClient.invalidateQueries({ queryKey: getListDevicesQueryKey() });
          setIsCreateOpen(false);
        }
      },
      onError: (err: any) => {
        toast({ title: "Erro ao adicionar dispositivo", description: err.message, variant: "destructive" });
      }
    });
  };

  const handleUpdate = (values: DeviceFormValues) => {
    if (!editingDevice) return;

    const payload: DeviceUpdate & { connectorId?: number | null } = {
      hostname: values.hostname,
      ipAddress: values.ipAddress,
      vendor: values.vendor,
      platform: values.platform,
      username: values.username,
      site: values.site,
      sshPort: values.sshPort,
      role: values.role || "",
      snmpCommunity: values.snmpCommunity,
      connectorId: values.connectorId ? Number(values.connectorId) : null,
    };

    if (values.password.trim().length > 0) {
      payload.password = values.password;
    }

    updateDevice.mutate({ id: editingDevice.id, data: payload as DeviceUpdate }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListDevicesQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetDeviceQueryKey(editingDevice.id) });
        setEditingDeviceId(null);
        toast({ title: "Dispositivo atualizado" });
      },
      onError: (err: any) => {
        toast({ title: "Erro ao atualizar dispositivo", description: err.message, variant: "destructive" });
      },
    });
  };

  const handleDelete = (id: number) => {
    if (confirm("Are you sure you want to delete this device?")) {
      deleteDevice.mutate({ id }, {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListDevicesQueryKey() });
        toast({ title: "Dispositivo removido" });
        }
      });
    }
  };

  const handleTestConnection = (id: number) => {
    toast({ title: "Validando conexão SSH..." });
    testConnection.mutate({ id }, {
      onSuccess: (res: ConnectionTestResponse) => {
        if (res.success && res.configCollect?.sshConfigBundle?.status === "queued") {
          toast({
            title: "SSH OK — coleta completa enfileirada",
            description: res.configCollect.snmpFast?.status === "queued"
              ? "SNMP_FAST enfileirado"
              : res.message,
          });
          return;
        }
        if (res.success && res.configCollect?.sshConfigBundle?.status === "failed") {
          toast({
            title: "SSH acessível, porém backup/coleta falhou",
            description: res.configCollect.sshConfigBundle.message ?? res.message,
            variant: "destructive",
          });
          return;
        }
        toast({
          title: res.success ? "Conexão SSH OK" : "Falha na conexão SSH",
          description: res.message,
          variant: res.success ? "default" : "destructive",
        });
      }
    });
  };

  const filteredDevices = devices?.filter(d => 
    d.hostname.toLowerCase().includes(search.toLowerCase()) || 
    d.ipAddress.includes(search)
  ) || [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Devices</h1>
          <p className="text-muted-foreground mt-1">Manage network infrastructure inventory</p>
        </div>

        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={() => setIsImportOpen(true)}
          >
            <Download className="mr-2 h-4 w-4" />
            Import
          </Button>
          <DeviceFormDialog
            mode="create"
            open={isCreateOpen}
            onOpenChange={setIsCreateOpen}
            onSubmit={handleCreate}
            isPending={createDevice.isPending}
            trigger={
              <Button>
                <Plus className="mr-2 h-4 w-4" />
                Add Device
              </Button>
            }
          />
        </div>
      </div>

      <DeviceImportModal
        isOpen={isImportOpen}
        onClose={() => setIsImportOpen(false)}
        onSuccess={() => {
          toast({ title: "Importação concluída com sucesso" });
          queryClient.invalidateQueries({ queryKey: getListDevicesQueryKey() });
          setIsImportOpen(false);
        }}
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

      <Card>
        <CardHeader className="py-4">
          <div className="flex items-center space-x-2">
            <Search className="h-4 w-4 text-muted-foreground" />
            <Input 
              placeholder="Search hostname or IP..." 
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="max-w-sm border-0 shadow-none focus-visible:ring-0 px-0"
            />
          </div>
        </CardHeader>
        <div className="border-t">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Hostname</TableHead>
                <TableHead>IP Address</TableHead>
                <TableHead>Vendor / OS</TableHead>
                <TableHead>Site</TableHead>
                <TableHead>Tenant / Acesso</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-8">Loading devices...</TableCell>
                </TableRow>
              ) : filteredDevices.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-12 text-muted-foreground">
                    <SearchX className="h-8 w-8 mx-auto mb-2 opacity-50" />
                    No devices found matching your search.
                  </TableCell>
                </TableRow>
              ) : (
                filteredDevices.map((device) => {
                  const row = device as DeviceRow;
                  const tenantLabel =
                    row.tenantName ??
                    (row.connectorId
                      ? connectorsQuery.data?.find((c) => c.id === row.connectorId)?.tenant_name
                      : null);
                  const accessLabel =
                    row.accessMode === "connector"
                      ? row.connectorName
                        ? `Via ${row.connectorName}`
                        : "Via connector"
                      : "Direto";

                  return (
                    <TableRow key={device.id}>
                      <TableCell className="font-medium">
                        <Link href={`/devices/${device.id}`} className="hover:underline text-primary">
                          {device.hostname}
                        </Link>
                      </TableCell>
                      <TableCell className="font-mono text-sm">{device.ipAddress}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <span className="capitalize">{device.vendor}</span>
                          <Badge variant="outline" className="text-[10px] uppercase">{device.platform}</Badge>
                        </div>
                      </TableCell>
                      <TableCell>{device.site}</TableCell>
                      <TableCell>
                        <div className="flex flex-col gap-1">
                          {tenantLabel ? (
                            <span className="text-sm font-medium">{tenantLabel}</span>
                          ) : (
                            <span className="text-sm text-muted-foreground">—</span>
                          )}
                          <Badge variant="outline" className="w-fit text-[10px]">
                            {accessLabel}
                          </Badge>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant={device.status === 'active' ? 'default' : device.status === 'unreachable' ? 'destructive' : 'secondary'}
                          className={device.status === 'active' ? 'bg-green-500/10 text-green-500 hover:bg-green-500/20' : ''}
                        >
                          {device.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right space-x-2">
                        <Button variant="ghost" size="icon" onClick={() => handleTestConnection(device.id)} title="Test Connection">
                          <Activity className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => setEditingDeviceId(device.id)} title="Edit Device">
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Link href={`/devices/${device.id}`}>
                          <Button variant="ghost" size="icon" title="View Details">
                            <TerminalSquare className="h-4 w-4" />
                          </Button>
                        </Link>
                        <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive" onClick={() => handleDelete(device.id)} title="Delete">
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
      </Card>
    </div>
  );
}
