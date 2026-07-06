import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  Activity,
  ArrowDownLeft,
  ArrowUpRight,
  AlertCircle,
  Cpu,
  Pencil,
  Wifi,
  X,
} from "lucide-react";
import { EditMapDeviceDialog } from "@/components/network-map/EditMapDeviceDialog";
import { useListNetopsDeviceInterfaces, useGetNetopsDeviceSummary, getListNetopsDeviceInterfacesQueryKey, getGetNetopsDeviceSummaryQueryKey } from "@workspace/api-client-react";
import type { DeviceData } from "@/lib/network-map/types";
import { parseInventoryNodeId } from "@/lib/network-map/inventory-bridge";
import { useLiveInterfaceTraffic } from "@/features/network-map/operational-interfaces-api";
import {
  buildLivePortMap,
  buildStencil,
  physicalIfNamesFromInterfaces,
  PORT_STATUS_COLOR,
  type PortSpec,
} from "./stencils";
import { DeviceStencil } from "./DeviceStencil";
import { PortMiniChart } from "./PortMiniChart";
import { useTranslation } from "@/i18n";

interface Props {
  device: DeviceData | null;
  onOpenChange: (open: boolean) => void;
  mapEditMode?: boolean;
  mapDevices?: DeviceData[];
  onReplaceDevice?: (oldDevice: DeviceData, newDevice: DeviceData) => void;
  onDeleteDevice?: (device: DeviceData) => void;
}

export function DeviceStencilModal({
  device,
  onOpenChange,
  mapEditMode = false,
  mapDevices = [],
  onReplaceDevice,
  onDeleteDevice,
}: Props) {
  const { t } = useTranslation();
  const open = !!device;
  const deviceId = device ? parseInventoryNodeId(device.id) : null;
  const { data: summary } = useGetNetopsDeviceSummary(deviceId ?? 0, {
    query: {
      enabled: deviceId != null,
      queryKey: deviceId != null ? getGetNetopsDeviceSummaryQueryKey(deviceId) : ["netops-summary-disabled"],
    },
  });
  const { data: interfaces, refetch: refetchInterfaces } = useListNetopsDeviceInterfaces(deviceId ?? 0, {
    query: {
      enabled: deviceId != null,
      queryKey: deviceId != null ? getListNetopsDeviceInterfacesQueryKey(deviceId) : ["netops-interfaces-disabled"],
      refetchInterval: open ? 5000 : false,
    },
  });
  const { livePorts: polledPorts, loading: trafficLoading, error: trafficError } = useLiveInterfaceTraffic(
    deviceId,
    open,
  );

  useEffect(() => {
    if (open && deviceId != null) void refetchInterfaces();
  }, [open, deviceId, refetchInterfaces]);

  const snmpHints = useMemo(
    () => ({
      platform: summary?.device.platform ?? device?.model ?? null,
      physicalIfNames: physicalIfNamesFromInterfaces(interfaces ?? []),
    }),
    [summary?.device.platform, device?.model, interfaces],
  );

  const inventoryLivePorts = useMemo(
    () => buildLivePortMap(interfaces ?? []),
    [interfaces],
  );

  const livePorts = useMemo(() => {
    const merged = new Map(inventoryLivePorts);
    for (const [name, metrics] of polledPorts) {
      const existing = merged.get(name);
      merged.set(name, {
        ...existing,
        ...metrics,
        utilPct: metrics.utilPct ?? existing?.utilPct ?? null,
        operStatus: metrics.operStatus ?? existing?.operStatus,
        adminStatus: metrics.adminStatus ?? existing?.adminStatus,
        speedMbps: metrics.speedMbps ?? existing?.speedMbps ?? null,
      });
    }
    return merged;
  }, [inventoryLivePorts, polledPorts]);

  const spec = useMemo(
    () => (device ? buildStencil(device, livePorts, snmpHints) : null),
    [device, livePorts, snmpHints],
  );

  const [selected, setSelected] = useState<{
    port: PortSpec;
    anchor: { x: number; y: number };
  } | null>(null);
  const [editOpen, setEditOpen] = useState(false);

  useEffect(() => {
    if (!open) {
      setSelected(null);
      setEditOpen(false);
    }
  }, [open]);

  if (!device || !spec) return null;

  const counts = spec.ports.reduce(
    (acc, p) => {
      acc[p.status] = (acc[p.status] ?? 0) + 1;
      return acc;
    },
    {} as Record<string, number>,
  );

  const hasLiveData = (interfaces?.length ?? 0) > 0 || polledPorts.size > 0;
  const downPorts = counts.down ?? 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[1100px] border-zinc-800 bg-zinc-950 p-0 text-zinc-100">
        <DialogHeader className="border-b border-zinc-800 px-5 py-3">
          <div className="flex items-start justify-between gap-4">
            <div>
              <DialogTitle className="flex items-center gap-2 text-sm font-semibold tracking-tight">
                <Cpu className="h-4 w-4 text-sky-400" />
                {device.name}
              </DialogTitle>
              <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-zinc-400">
                <span>{spec.vendor} · {spec.model}</span>
                <span>·</span>
                <span>{device.site}</span>
                <span>·</span>
                <span>{device.role}</span>
                {device.mgmtIp && (
                  <>
                    <span>·</span>
                    <span className="font-mono">{device.mgmtIp}</span>
                  </>
                )}
                <span>·</span>
                <Badge variant="outline"
                  className={`border-0 px-1.5 py-0 text-[10px] ${
                    device.status === "UP" ? "bg-emerald-500/15 text-emerald-400" :
                    device.status === "DOWN" ? "bg-red-500/15 text-red-400" :
                    device.status === "PARTIAL" ? "bg-amber-500/15 text-amber-400" :
                    "bg-zinc-700/40 text-zinc-300"
                  }`}>
                  {device.status}
                </Badge>
                {downPorts > 0 && (
                  <Badge variant="outline" className="border-0 bg-red-500/15 px-1.5 py-0 text-[10px] text-red-400">
                    {downPorts > 1
                      ? t("networkMap.stencilModal.portsDownPlural", { count: downPorts })
                      : t("networkMap.stencilModal.portsDown", { count: downPorts })}
                  </Badge>
                )}
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-1.5 text-[10px]">
              {(Object.keys(PORT_STATUS_COLOR) as (keyof typeof PORT_STATUS_COLOR)[]).map((k) => (
                <span key={k} className="flex items-center gap-1 rounded border border-zinc-800 bg-zinc-900 px-1.5 py-0.5 text-zinc-300">
                  <span className="h-2 w-2 rounded-sm" style={{ background: PORT_STATUS_COLOR[k].fill }} />
                  {PORT_STATUS_COLOR[k].label}
                  <span className="text-zinc-500">{counts[k] ?? 0}</span>
                </span>
              ))}
            </div>
          </div>
        </DialogHeader>

        <div className="relative px-5 py-5">
          <DeviceStencil
            spec={spec}
            selectedPortId={selected?.port.id ?? null}
            onSelectPort={(port, anchor) => setSelected({ port, anchor })}
          />

          <div className="mt-3 flex items-center gap-2 text-[11px] text-zinc-500">
            <Activity className="h-3 w-3 text-sky-400" />
            {hasLiveData
              ? trafficLoading
                ? t("networkMap.stencilModal.collectingSnmp")
                : trafficError
                  ? trafficError
                  : t("networkMap.stencilModal.liveFaceplate")
              : t("networkMap.stencilModal.modelFaceplate")}
          </div>

          {selected && (
            <PortPopover
              port={selected.port}
              onClose={() => setSelected(null)}
            />
          )}
        </div>

        <Separator className="bg-zinc-800" />
        <div className="flex items-center justify-between gap-3 px-5 py-2 text-[10px] text-zinc-500">
          <span>
            {t("networkMap.stencilModal.library", {
              model: spec.model,
              info: hasLiveData
                ? t("networkMap.stencilModal.interfacesCount", { count: interfaces?.length ?? polledPorts.size })
                : t("networkMap.stencilModal.noCollection"),
            })}
          </span>
          <div className="flex items-center gap-2">
            {mapEditMode && onReplaceDevice && onDeleteDevice && (
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-7 border-zinc-700 bg-zinc-900 text-[11px] text-zinc-200 hover:bg-zinc-800"
                onClick={() => setEditOpen(true)}
              >
                <Pencil className="mr-1 h-3 w-3" />
                {t("networkMap.stencilModal.editDevice")}
              </Button>
            )}
            <span>{t("networkMap.stencilModal.portsSummary", { count: spec.ports.length, rackUnits: spec.rackUnits })}</span>
          </div>
        </div>
      </DialogContent>
      {mapEditMode && onReplaceDevice && onDeleteDevice && (
        <EditMapDeviceDialog
          open={editOpen}
          onOpenChange={setEditOpen}
          device={device}
          mapDevices={mapDevices}
          onReplace={(oldDevice, newDevice) => {
            onReplaceDevice(oldDevice, newDevice);
            onOpenChange(false);
          }}
          onDelete={(d) => {
            onDeleteDevice(d);
            onOpenChange(false);
          }}
        />
      )}
    </Dialog>
  );
}

function PortPopover({ port, onClose }: { port: PortSpec; onClose: () => void }) {
  const { t } = useTranslation();
  const c = PORT_STATUS_COLOR[port.status];
  const capacityMbps = parseSpeed(port.speed);
  const baseline = Math.max(2, (capacityMbps * port.utilPct) / 100);

  return (
    <div className="pointer-events-auto absolute right-5 top-5 z-40 w-[260px] rounded-md border border-zinc-700 bg-zinc-900/95 p-3 shadow-2xl backdrop-blur">
      <div className="flex items-start justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-sm" style={{ background: c.fill }} />
            <span className="truncate text-xs font-semibold text-zinc-100">{port.ifname}</span>
          </div>
          <div className="mt-0.5 truncate text-[10px] text-zinc-400">
            {port.description ?? "—"}
          </div>
        </div>
        <button
          onClick={onClose}
          className="rounded p-0.5 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-200"
          aria-label={t("networkMap.stencilModal.close")}
        >
          <X className="h-3 w-3" />
        </button>
      </div>

      <div className="mt-2 grid grid-cols-3 gap-1 text-[10px]">
        <Stat label={t("networkMap.stencilModal.statStatus")} value={c.label} valueClass="text-zinc-100" />
        <Stat label={t("networkMap.stencilModal.statSpeed")} value={port.speed} />
        <Stat label={t("networkMap.stencilModal.statUsage")} value={`${port.utilPct}%`} />
      </div>

      <div className="mt-2 rounded border border-zinc-800 bg-zinc-950 p-2">
        <PortMiniChart
          seed={hash(port.id)}
          baselineMbps={baseline}
          capacityMbps={capacityMbps}
        />
      </div>

      <div className="mt-2 grid grid-cols-2 gap-1.5 text-[10px]">
        <Pill icon={<ArrowUpRight className="h-3 w-3 text-sky-400" />} label="TX" value={`${(baseline * 0.95).toFixed(0)} Mb/s`} />
        <Pill icon={<ArrowDownLeft className="h-3 w-3 text-emerald-400" />} label="RX" value={`${(baseline * 0.78).toFixed(0)} Mb/s`} />
        <Pill icon={<AlertCircle className="h-3 w-3 text-amber-400" />} label={t("networkMap.stencilModal.statUtil")} value={`${port.utilPct}%`} />
        <Pill icon={<Wifi className="h-3 w-3 text-zinc-500" />} label={t("networkMap.stencilModal.statPeer")} value={port.neighbor ?? "—"} />
      </div>
    </div>
  );
}

function Stat({ label, value, valueClass }: { label: string; value: string; valueClass?: string }) {
  return (
    <div className="rounded border border-zinc-800 bg-zinc-950 px-1.5 py-1">
      <div className="text-[9px] uppercase tracking-wide text-zinc-500">{label}</div>
      <div className={`text-[11px] font-medium ${valueClass ?? "text-zinc-200"}`}>{value}</div>
    </div>
  );
}

function Pill({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-center justify-between rounded border border-zinc-800 bg-zinc-950 px-2 py-1">
      <span className="flex items-center gap-1 text-zinc-400">{icon}{label}</span>
      <span className="font-mono text-zinc-100">{value}</span>
    </div>
  );
}

function parseSpeed(s: string): number {
  const m = s.match(/(\d+(?:\.\d+)?)\s*(G|M)/i);
  if (!m) return 1000;
  return m[2].toUpperCase() === "G" ? parseFloat(m[1]) * 1000 : parseFloat(m[1]);
}
function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
