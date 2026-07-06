import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Activity,
  ArrowDownLeft,
  ArrowUpRight,
  Cable,
  Pencil,
  Save,
} from "lucide-react";
import { useGetDeviceDiscoverySnapshot, useListNetopsDeviceInterfaces, getListNetopsDeviceInterfacesQueryKey, getGetDeviceDiscoverySnapshotQueryKey } from "@workspace/api-client-react";
import type { Device } from "@workspace/api-client-react";
import type { DeviceData, LinkData } from "@/lib/network-map/types";
import { parseInventoryNodeId } from "@/lib/network-map/inventory-bridge";
import { topologyService } from "@/lib/network-map/topologyService";
import {
  ApiHttpError,
  capacityMbpsFromInterface,
  computeTrafficMbps,
  counterSample,
  ensureSnmpFastCollect,
  fetchOperationalInterfaces,
  findOperationalInterface,
  SNMP_FAST_POLL_MS,
} from "@/features/network-map/network-map-api";
import {
  buildLivePortMap,
  buildStencil,
  physicalIfNamesFromInterfaces,
  type PortSpec,
} from "./device-stencils/stencils";
import type { SnmpStencilHints } from "./device-stencils/device-stencil-library";
import { useLiveInterfaceTraffic } from "@/features/network-map/operational-interfaces-api";
import { DeviceStencil } from "./device-stencils/DeviceStencil";
import { PortMiniChart } from "./device-stencils/PortMiniChart";
import { InterfaceSelect } from "./ManualLinkModal";
import { useTranslation } from "@/i18n";

const CHART_POINTS = 40;

type TrafficState = {
  txMbps: number;
  rxMbps: number;
  utilPct: number;
  series: { tx: number[]; rx: number[] };
  capacityMbps: number;
  loading: boolean;
  error: string | null;
};

function emptyTraffic(): TrafficState {
  return {
    txMbps: 0,
    rxMbps: 0,
    utilPct: 0,
    series: { tx: [], rx: [] },
    capacityMbps: 1000,
    loading: true,
    error: null,
  };
}

function pushSeries(prev: { tx: number[]; rx: number[] }, txMbps: number, rxMbps: number) {
  const tx = [...prev.tx, txMbps].slice(-CHART_POINTS);
  const rx = [...prev.rx, rxMbps].slice(-CHART_POINTS);
  return { tx, rx };
}

function utilPctFromTraffic(txMbps: number, rxMbps: number, capacityMbps: number): number {
  if (capacityMbps <= 0) return 0;
  return Math.min(100, Math.round((Math.max(txMbps, rxMbps) / capacityMbps) * 100));
}

function findStencilPort(spec: ReturnType<typeof buildStencil>, ifName: string): PortSpec | null {
  const target = ifName.trim().toLowerCase();
  return spec.ports.find((p) => p.ifname.toLowerCase() === target) ?? null;
}

function extractSysDescrFromDiscovery(audit: Array<{ message?: string }> | undefined): string | null {
  if (!audit?.length) return null;
  for (const item of audit) {
    const msg = item.message ?? "";
    const match = msg.match(/sysDescr[:\s]+(.+)/i);
    if (match?.[1]) return match[1].trim();
  }
  return null;
}

function useInterfaceTrafficPoll(
  deviceId: number | null,
  ifName: string,
  enabled: boolean,
): TrafficState {
  const { t } = useTranslation();
  const [state, setState] = useState<TrafficState>(emptyTraffic);
  const prevRef = useRef<{ inOctets: bigint; outOctets: bigint; at: number } | null>(null);

  useEffect(() => {
    if (!enabled || deviceId == null || !ifName || ifName === "—") {
      prevRef.current = null;
      setState(emptyTraffic());
      return;
    }

    let cancelled = false;
    prevRef.current = null;

    const tick = async () => {
      try {
        await ensureSnmpFastCollect(deviceId);

        const payload = await fetchOperationalInterfaces(deviceId);
        if (cancelled) return;

        const iface = findOperationalInterface(payload, ifName);
        if (!iface?.hcInOctets || !iface.hcOutOctets) {
          setState((s) => ({
            ...s,
            loading: false,
            error: t("networkMap.linkInterface.noSnmpCounters"),
          }));
          return;
        }

        const sample = counterSample(iface);
        const { txMbps, rxMbps } = computeTrafficMbps(prevRef.current, sample);
        const capacityMbps = capacityMbpsFromInterface(iface);
        const utilPct = utilPctFromTraffic(txMbps, rxMbps, capacityMbps);

        prevRef.current = sample;
        setState((s) => ({
          txMbps,
          rxMbps,
          utilPct,
          capacityMbps,
          loading: false,
          error: null,
          series: pushSeries(s.series, txMbps, rxMbps),
        }));
      } catch (error) {
        if (cancelled) return;
        const message = error instanceof ApiHttpError && (error.status === 502 || error.status === 503)
          ? error.message
          : error instanceof Error
            ? error.message
            : t("networkMap.linkInterface.snmpCollectFailed");
        setState((s) => ({
          ...s,
          loading: false,
          error: message,
        }));
      }
    };

    void tick();
    const timer = window.setInterval(() => void tick(), SNMP_FAST_POLL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [deviceId, ifName, enabled, t]);

  return state;
}

function LinkSidePanel({
  device,
  inventoryDevice,
  ifName,
  side,
  links,
  linkId,
  editing,
  draftIf,
  onDraftChange,
  enabled,
}: {
  device: DeviceData;
  inventoryDevice?: Device;
  ifName: string;
  side: "source" | "target";
  links: LinkData[];
  linkId: string;
  editing: boolean;
  draftIf: string;
  onDraftChange: (v: string) => void;
  enabled: boolean;
}) {
  const { t } = useTranslation();
  const deviceId = parseInventoryNodeId(device.id);
  const traffic = useInterfaceTrafficPoll(deviceId, draftIf || ifName, enabled);
  const { livePorts: allPortTraffic } = useLiveInterfaceTraffic(deviceId, enabled);
  const { data: discovery } = useGetDeviceDiscoverySnapshot(deviceId ?? 0, {
    query: {
      enabled: enabled && deviceId != null,
      queryKey: deviceId != null ? getGetDeviceDiscoverySnapshotQueryKey(deviceId) : ["discovery-disabled"],
    },
  });
  const { data: interfaces } = useListNetopsDeviceInterfaces(deviceId ?? 0, {
    query: {
      enabled: deviceId != null,
      queryKey: deviceId != null ? getListNetopsDeviceInterfacesQueryKey(deviceId) : ["netops-interfaces-disabled"],
    },
  });

  const snmpHints = useMemo((): SnmpStencilHints => ({
    platform: inventoryDevice?.platform ?? device.model ?? null,
    sysDescr: extractSysDescrFromDiscovery(discovery?.audit),
    physicalIfNames: physicalIfNamesFromInterfaces(interfaces ?? []),
  }), [inventoryDevice?.platform, device.model, discovery?.audit, interfaces]);

  const inventoryLivePorts = useMemo(() => buildLivePortMap(interfaces ?? []), [interfaces]);

  const livePorts = useMemo(() => {
    const merged = new Map(inventoryLivePorts);
    for (const [name, metrics] of allPortTraffic) {
      const existing = merged.get(name);
      merged.set(name, {
        ...existing,
        ...metrics,
        utilPct: metrics.utilPct ?? existing?.utilPct ?? null,
        operStatus: metrics.operStatus ?? existing?.operStatus,
        adminStatus: metrics.adminStatus ?? existing?.adminStatus,
      });
    }
    const activeIf = draftIf || ifName;
    if (activeIf && traffic.utilPct > 0) {
      const cur = merged.get(activeIf) ?? {};
      merged.set(activeIf, { ...cur, utilPct: traffic.utilPct });
    }
    return merged;
  }, [inventoryLivePorts, allPortTraffic, draftIf, ifName, traffic.utilPct]);

  const spec = useMemo(() => buildStencil(device, livePorts, snmpHints), [device, livePorts, snmpHints]);
  const activeIf = draftIf || ifName;
  const selectedPort = findStencilPort(spec, activeIf);

  return (
    <div className="flex min-w-0 flex-1 flex-col gap-3 rounded-md border border-zinc-800 bg-zinc-900/40 p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold text-zinc-100">{device.name}</div>
          <div className="truncate text-[11px] text-zinc-400">
            {spec.vendor} · {spec.model}
            {device.mgmtIp ? ` · ${device.mgmtIp}` : ""}
          </div>
        </div>
        <Badge variant="outline" className="shrink-0 border-zinc-700 bg-zinc-950 text-[10px] text-zinc-300">
          {side === "source" ? t("networkMap.linkInterface.sideA") : t("networkMap.linkInterface.sideB")}
        </Badge>
      </div>

      {editing ? (
        <InterfaceSelect
          label={t("networkMap.linkInterface.interface")}
          deviceNodeId={device.id}
          value={draftIf}
          onChange={onDraftChange}
          links={links.filter((l) => l.id !== linkId)}
          side={side}
        />
      ) : (
        <div className="rounded border border-zinc-800 bg-zinc-950 px-2 py-1.5 font-mono text-xs text-sky-200">
          {activeIf || "—"}
        </div>
      )}

      <div className="overflow-x-auto">
        <DeviceStencil
          spec={spec}
          selectedPortId={selectedPort?.id ?? null}
          onSelectPort={() => undefined}
        />
      </div>

      <div className="grid grid-cols-2 gap-2 text-[10px]">
        <TrafficPill icon={<ArrowUpRight className="h-3 w-3 text-sky-400" />} label="TX" value={fmtMbps(traffic.txMbps)} />
        <TrafficPill icon={<ArrowDownLeft className="h-3 w-3 text-emerald-400" />} label="RX" value={fmtMbps(traffic.rxMbps)} />
      </div>

      <div className="rounded border border-zinc-800 bg-zinc-950 p-2">
        {traffic.series.tx.length > 0 ? (
          <PortMiniChart
            seed={device.id.length}
            baselineMbps={Math.max(traffic.txMbps, traffic.rxMbps, 1)}
            capacityMbps={traffic.capacityMbps}
            liveSeries={traffic.series}
          />
        ) : (
          <div className="flex h-[72px] items-center justify-center text-[11px] text-zinc-500">
            {traffic.loading ? t("networkMap.linkInterface.collectingSnmp") : (traffic.error ?? t("networkMap.linkInterface.waitingSamples"))}
          </div>
        )}
      </div>

      <div className="flex items-center gap-1.5 text-[10px] text-zinc-500">
        <Activity className="h-3 w-3 text-sky-400" />
        {traffic.loading
          ? t("networkMap.linkInterface.snmpFastHint")
          : traffic.error
            ? traffic.error
            : t("networkMap.linkInterface.usageCapacity", {
                util: traffic.utilPct,
                capacity: fmtMbps(traffic.capacityMbps),
              })}
      </div>
    </div>
  );
}

export function LinkInterfaceModal({
  link,
  devices,
  inventoryDevices,
  links,
  onOpenChange,
  onLinkUpdated,
  onLinkDeleted,
}: {
  link: LinkData | null;
  devices: DeviceData[];
  inventoryDevices: Device[];
  links: LinkData[];
  onOpenChange: (open: boolean) => void;
  onLinkUpdated: (link: LinkData) => void;
  onLinkDeleted: (linkId: string) => void;
}) {
  const { t } = useTranslation();
  const open = !!link;
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [draftA, setDraftA] = useState("");
  const [draftB, setDraftB] = useState("");

  useEffect(() => {
    if (!open || !link) return;
    setEditing(false);
    setDraftA(link.intfA);
    setDraftB(link.intfB);
  }, [open, link]);

  const src = link ? devices.find((d) => d.id === link.source) : null;
  const dst = link ? devices.find((d) => d.id === link.target) : null;
  const srcInv = src ? inventoryDevices.find((d) => d.id === parseInventoryNodeId(src.id)!) : undefined;
  const dstInv = dst ? inventoryDevices.find((d) => d.id === parseInventoryNodeId(dst.id)!) : undefined;

  const handleSave = useCallback(async () => {
    if (!link) return;
    setSaving(true);
    try {
      const updated = await topologyService.updateLink(link, {
        linkId: link.id,
        intfA: draftA || link.intfA,
        intfB: draftB || link.intfB,
      });
      onLinkUpdated(updated);
      setEditing(false);
    } finally {
      setSaving(false);
    }
  }, [link, draftA, draftB, onLinkUpdated]);

  if (!link || !src || !dst) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl border-zinc-800 bg-zinc-950 text-zinc-100">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-sm font-semibold">
            <Cable className="h-4 w-4 text-sky-400" />
            {t("networkMap.linkInterface.title", { source: src.name, target: dst.name })}
          </DialogTitle>
          <DialogDescription className="text-zinc-400">
            {link.capacity} · {link.edgeType} · {t("networkMap.linkInterface.origin")} {link.origin}
            {link.utilizationPct != null ? ` · ${t("networkMap.linkInterface.usage")} ${link.utilizationPct}%` : ""}
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-3 lg:flex-row">
          <LinkSidePanel
            device={src}
            inventoryDevice={srcInv}
            ifName={link.intfA}
            side="source"
            links={links}
            linkId={link.id}
            editing={editing}
            draftIf={draftA}
            onDraftChange={setDraftA}
            enabled={open}
          />
          <LinkSidePanel
            device={dst}
            inventoryDevice={dstInv}
            ifName={link.intfB}
            side="target"
            links={links}
            linkId={link.id}
            editing={editing}
            draftIf={draftB}
            onDraftChange={setDraftB}
            enabled={open}
          />
        </div>

        <Separator className="bg-zinc-800" />

        <DialogFooter className="gap-2 sm:justify-between">
          <div className="text-[10px] text-zinc-500">
            {t("networkMap.linkInterface.footerHint")}
          </div>
          <div className="flex gap-2">
            <Button
              variant="destructive"
              onClick={() => {
                if (!link) return;
                onLinkDeleted(link.id);
                onOpenChange(false);
              }}
            >
              {t("networkMap.linkInterface.removeLink")}
            </Button>
            {editing ? (
              <>
                <Button variant="ghost" onClick={() => { setEditing(false); setDraftA(link.intfA); setDraftB(link.intfB); }}>
                  {t("common.cancel")}
                </Button>
                <Button onClick={() => void handleSave()} disabled={saving}>
                  <Save className="mr-1.5 h-3.5 w-3.5" />
                  {saving ? t("networkMap.linkInterface.saving") : t("networkMap.linkInterface.saveInterfaces")}
                </Button>
              </>
            ) : (
              <Button variant="outline" className="border-zinc-700 bg-zinc-900" onClick={() => setEditing(true)}>
                <Pencil className="mr-1.5 h-3.5 w-3.5" />
                {t("networkMap.linkInterface.editInterfaces")}
              </Button>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function TrafficPill({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-center justify-between rounded border border-zinc-800 bg-zinc-950 px-2 py-1.5">
      <span className="flex items-center gap-1 text-zinc-400">{icon}{label}</span>
      <span className="font-mono text-zinc-100">{value}</span>
    </div>
  );
}

function fmtMbps(mbps: number) {
  if (mbps >= 1000) return `${(mbps / 1000).toFixed(2)} Gbps`;
  if (mbps <= 0) return "—";
  return `${mbps.toFixed(1)} Mbps`;
}
