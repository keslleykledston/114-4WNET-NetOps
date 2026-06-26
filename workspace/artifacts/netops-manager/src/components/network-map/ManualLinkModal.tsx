import { useEffect, useMemo, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useListDevices, useListNetopsDeviceInterfaces, getListNetopsDeviceInterfacesQueryKey } from "@workspace/api-client-react";
import type { EdgeType, LinkData, NodeStatus } from "@/lib/network-map/types";
import {
  inventoryNodeId,
  isInterfaceInUse,
  parseInventoryNodeId,
  physicalInterfaces,
} from "@/lib/network-map/inventory-bridge";

export interface ManualLinkValues {
  source: string;
  target: string;
  intfA: string;
  intfB: string;
  edgeType: EdgeType;
  capacity: string;
  status: NodeStatus;
  reason: string;
}

export function InterfaceSelect({
  label,
  deviceNodeId,
  value,
  onChange,
  links,
  side,
}: {
  label: string;
  deviceNodeId: string;
  value: string;
  onChange: (v: string) => void;
  links: LinkData[];
  side: "source" | "target";
}) {
  const deviceId = parseInventoryNodeId(deviceNodeId);
  const { data: interfaces, isLoading, isError } = useListNetopsDeviceInterfaces(deviceId ?? 0, {
    query: {
      enabled: deviceId != null,
      queryKey: deviceId != null ? getListNetopsDeviceInterfacesQueryKey(deviceId) : ["netops-interfaces-disabled"],
    },
  });
  const physical = useMemo(() => physicalInterfaces(interfaces), [interfaces]);

  if (deviceId == null) {
    return (
      <div className="space-y-1">
        <Label>{label}</Label>
        <Select disabled>
          <SelectTrigger className="border-zinc-800 bg-zinc-900">
            <SelectValue placeholder="Selecione o device primeiro" />
          </SelectTrigger>
        </Select>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="space-y-1">
        <Label>{label}</Label>
        <Select disabled>
          <SelectTrigger className="border-zinc-800 bg-zinc-900">
            <SelectValue placeholder="Carregando interfaces..." />
          </SelectTrigger>
        </Select>
      </div>
    );
  }

  if (isError || physical.length === 0) {
    return (
      <div className="space-y-1">
        <Label>{label}</Label>
        <Input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="100GE0/1/0"
          className="border-zinc-800 bg-zinc-900"
        />
        <p className="text-[10px] text-zinc-500">
          {isError ? "Falha ao carregar interfaces." : "Nenhuma interface física coletada — informe manualmente."}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-1">
      <Label>{label}</Label>
      <Select value={value || undefined} onValueChange={onChange}>
        <SelectTrigger className="border-zinc-800 bg-zinc-900">
          <SelectValue placeholder="Selecionar interface" />
        </SelectTrigger>
        <SelectContent>
          {physical.map((iface) => {
            const inUse = isInterfaceInUse(links, deviceNodeId, iface.name, side);
            return (
              <SelectItem
                key={iface.name}
                value={iface.name}
                disabled={inUse}
                className={inUse ? "opacity-40 data-[disabled]:opacity-40" : undefined}
              >
                {iface.name}
                {iface.operStatus ? ` (${iface.operStatus})` : ""}
                {inUse ? " — em uso" : ""}
              </SelectItem>
            );
          })}
        </SelectContent>
      </Select>
    </div>
  );
}

export function ManualLinkModal({
  open,
  onOpenChange,
  links,
  planned,
  onConfirm,
  initialSource,
  initialTarget,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  links: LinkData[];
  planned?: boolean;
  onConfirm: (v: ManualLinkValues) => void;
  initialSource?: string;
  initialTarget?: string;
}) {
  const { data: inventoryDevices = [], isLoading: loadingDevices } = useListDevices();
  const [v, setV] = useState<ManualLinkValues>({
    source: initialSource ?? "",
    target: initialTarget ?? "",
    intfA: "",
    intfB: "",
    edgeType: planned ? "planned" : "physical",
    capacity: "10G",
    status: planned ? "PLANNED" : "UP",
    reason: "",
  });

  useEffect(() => {
    if (!open) return;
    setV({
      source: initialSource ?? "",
      target: initialTarget ?? "",
      intfA: "",
      intfB: "",
      edgeType: planned ? "planned" : "physical",
      capacity: "10G",
      status: planned ? "PLANNED" : "UP",
      reason: "",
    });
  }, [open, initialSource, initialTarget, planned]);

  const update = <K extends keyof ManualLinkValues>(k: K, val: ManualLinkValues[K]) =>
    setV((p) => ({ ...p, [k]: val }));

  const sortedInventory = useMemo(
    () => [...inventoryDevices].sort((a, b) => a.hostname.localeCompare(b.hostname)),
    [inventoryDevices],
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="border-zinc-800 bg-zinc-950 text-zinc-100 sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{planned ? "Criar link planejado" : "Criar link manual"}</DialogTitle>
          <DialogDescription className="text-zinc-400">
            Devices do inventário NetOps. Interfaces físicas das coletas SNMP/SSH.
          </DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-1 space-y-1">
            <Label>Device origem</Label>
            <Select
              value={v.source}
              onValueChange={(x) => setV((p) => ({ ...p, source: x, intfA: "" }))}
            >
              <SelectTrigger className="border-zinc-800 bg-zinc-900">
                <SelectValue placeholder={loadingDevices ? "Carregando..." : "Selecionar"} />
              </SelectTrigger>
              <SelectContent>
                {sortedInventory.map((d) => (
                  <SelectItem key={d.id} value={inventoryNodeId(d.id)}>
                    {d.hostname}
                    <span className="ml-1 text-zinc-500">({d.site})</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="col-span-1 space-y-1">
            <Label>Device destino</Label>
            <Select
              value={v.target}
              onValueChange={(x) => setV((p) => ({ ...p, target: x, intfB: "" }))}
            >
              <SelectTrigger className="border-zinc-800 bg-zinc-900">
                <SelectValue placeholder={loadingDevices ? "Carregando..." : "Selecionar"} />
              </SelectTrigger>
              <SelectContent>
                {sortedInventory.map((d) => (
                  <SelectItem key={d.id} value={inventoryNodeId(d.id)} disabled={inventoryNodeId(d.id) === v.source}>
                    {d.hostname}
                    <span className="ml-1 text-zinc-500">({d.site})</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <InterfaceSelect
            label="Interface origem"
            deviceNodeId={v.source}
            value={v.intfA}
            onChange={(intfA) => update("intfA", intfA)}
            links={links}
            side="source"
          />
          <InterfaceSelect
            label="Interface destino"
            deviceNodeId={v.target}
            value={v.intfB}
            onChange={(intfB) => update("intfB", intfB)}
            links={links}
            side="target"
          />
          <div className="space-y-1">
            <Label>Tipo</Label>
            <Select value={v.edgeType} onValueChange={(x) => update("edgeType", x as EdgeType)}>
              <SelectTrigger className="border-zinc-800 bg-zinc-900"><SelectValue /></SelectTrigger>
              <SelectContent>
                {["physical", "lag", "bgp", "service", "optical", "planned", "manual"].map((t) => (
                  <SelectItem key={t} value={t}>{t}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>Capacidade</Label>
            <Input value={v.capacity} onChange={(e) => update("capacity", e.target.value)} className="border-zinc-800 bg-zinc-900" />
          </div>
          <div className="space-y-1">
            <Label>Status</Label>
            <Select value={v.status} onValueChange={(x) => update("status", x as NodeStatus)}>
              <SelectTrigger className="border-zinc-800 bg-zinc-900"><SelectValue /></SelectTrigger>
              <SelectContent>
                {["UP", "DOWN", "PARTIAL", "UNKNOWN", "PLANNED"].map((t) => (
                  <SelectItem key={t} value={t}>{t}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="col-span-2 space-y-1">
            <Label>Motivo</Label>
            <Input
              value={v.reason}
              onChange={(e) => update("reason", e.target.value)}
              placeholder="Documentação de capacidade futura..."
              className="border-zinc-800 bg-zinc-900"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button
            disabled={!v.source || !v.target || v.source === v.target}
            onClick={() => { onConfirm(v); onOpenChange(false); }}
          >
            Criar link
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
