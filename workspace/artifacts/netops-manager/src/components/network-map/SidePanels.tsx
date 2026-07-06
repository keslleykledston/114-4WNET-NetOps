import {
  AlertTriangle,
  CircleDot,
  Cable,
  Server,
  History,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { DeviceData, LinkData } from "@/lib/network-map/types";
import { RECENT_CHANGES } from "@/lib/network-map/mock-data";
import { CollectSnmpButton } from "@/features/device-inventory/collect-snmp-button";
import { useTranslation } from "@/i18n";

function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2 py-1 text-xs">
      <span className="text-zinc-400">{k}</span>
      <span className="truncate text-right text-zinc-100">{v}</span>
    </div>
  );
}

function StatusBadge({ s }: { s: string }) {
  const map: Record<string, string> = {
    UP: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
    DOWN: "bg-red-500/15 text-red-400 border-red-500/30",
    PARTIAL: "bg-amber-500/15 text-amber-400 border-amber-500/30",
    UNKNOWN: "bg-zinc-500/15 text-zinc-400 border-zinc-500/30",
    PLANNED: "bg-sky-500/15 text-sky-400 border-sky-500/30",
  };
  return (
    <span className={`rounded border px-1.5 py-0.5 text-[10px] font-medium ${map[s] ?? map.UNKNOWN}`}>
      {s}
    </span>
  );
}

export function EmptySelectionPanel({
  devices,
  links,
}: {
  devices: DeviceData[];
  links: LinkData[];
}) {
  const { t } = useTranslation();
  const up = devices.filter((d) => d.status === "UP").length;
  const down = devices.filter((d) => d.status === "DOWN").length;
  const partial = devices.filter((d) => d.status === "PARTIAL").length;
  const alarms = devices.reduce((a, d) => a + (d.alarms ?? 0), 0);
  const byType = devices.reduce<Record<string, number>>((acc, d) => {
    acc[d.type] = (acc[d.type] ?? 0) + 1;
    return acc;
  }, {});
  const linksByType = links.reduce<Record<string, number>>((acc, l) => {
    acc[l.edgeType] = (acc[l.edgeType] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <div className="flex h-full flex-col gap-4 overflow-y-auto p-4 text-zinc-100">
      <div>
        <h3 className="text-sm font-semibold">{t("networkMap.sidePanels.topologySummary")}</h3>
        <p className="text-xs text-zinc-400">{t("networkMap.sidePanels.noSelection")}</p>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <div className="rounded-md border border-zinc-800 bg-zinc-900/60 p-2">
          <div className="text-[10px] text-zinc-400">UP</div>
          <div className="text-lg font-semibold text-emerald-400">{up}</div>
        </div>
        <div className="rounded-md border border-zinc-800 bg-zinc-900/60 p-2">
          <div className="text-[10px] text-zinc-400">PARTIAL</div>
          <div className="text-lg font-semibold text-amber-400">{partial}</div>
        </div>
        <div className="rounded-md border border-zinc-800 bg-zinc-900/60 p-2">
          <div className="text-[10px] text-zinc-400">DOWN</div>
          <div className="text-lg font-semibold text-red-400">{down}</div>
        </div>
      </div>

      <div>
        <h4 className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-zinc-300">
          <Server className="h-3.5 w-3.5" /> {t("networkMap.sidePanels.nodesByType")}
        </h4>
        <div className="flex flex-wrap gap-1">
          {Object.entries(byType).map(([k, v]) => (
            <Badge key={k} variant="outline" className="border-zinc-700 bg-zinc-900 text-[10px] text-zinc-300">
              {k}: {v}
            </Badge>
          ))}
        </div>
      </div>

      <div>
        <h4 className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-zinc-300">
          <Cable className="h-3.5 w-3.5" /> {t("networkMap.sidePanels.linksByType")}
        </h4>
        <div className="flex flex-wrap gap-1">
          {Object.entries(linksByType).map(([k, v]) => (
            <Badge key={k} variant="outline" className="border-zinc-700 bg-zinc-900 text-[10px] text-zinc-300">
              {k}: {v}
            </Badge>
          ))}
        </div>
      </div>

      <div>
        <h4 className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-zinc-300">
          <AlertTriangle className="h-3.5 w-3.5 text-amber-400" /> {t("networkMap.sidePanels.mainAlerts")}
        </h4>
        <div className="rounded-md border border-zinc-800 bg-zinc-900/60 p-2 text-xs text-zinc-300">
          {t("networkMap.sidePanels.activeAlarms", { count: alarms })}
        </div>
      </div>

      <div>
        <h4 className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-zinc-300">
          <History className="h-3.5 w-3.5" /> {t("networkMap.sidePanels.recentChanges")}
        </h4>
        <ul className="space-y-1">
          {RECENT_CHANGES.map((c) => (
            <li key={c.id} className="rounded-md border border-zinc-800 bg-zinc-900/60 p-2 text-xs">
              <div className="text-zinc-100">{c.text}</div>
              <div className="text-[10px] text-zinc-500">{c.at}</div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

export function NodeDetailsPanel({
  device,
  links,
  devices,
}: {
  device: DeviceData;
  links: LinkData[];
  devices: DeviceData[];
}) {
  const { t } = useTranslation();
  const connected = links.filter((l) => l.source === device.id || l.target === device.id);
  const bgpLinks = connected.filter((l) => l.edgeType === "bgp");
  const serviceLinks = connected.filter((l) => l.edgeType === "service");
  const tabKeys = ["resumo", "interfaces", "circuitos", "bgp", "evid"] as const;
  const tabLabels = [
    t("networkMap.sidePanels.tabs.summary"),
    t("networkMap.sidePanels.tabs.interfaces"),
    t("networkMap.sidePanels.tabs.circuits"),
    t("networkMap.sidePanels.tabs.bgp"),
    t("networkMap.sidePanels.tabs.evidence"),
  ];

  return (
    <div className="flex h-full flex-col gap-3 overflow-y-auto p-4 text-zinc-100">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <CircleDot className="h-4 w-4 text-emerald-400" />
            <h3 className="truncate text-sm font-semibold">{device.name}</h3>
          </div>
          <p className="text-xs text-zinc-400">
            {device.vendor} {device.model ?? ""} • {device.role}
          </p>
        </div>
        <StatusBadge s={device.status} />
      </div>
      <Tabs defaultValue="resumo" className="flex min-h-0 flex-1 flex-col">
        <TabsList className="h-8 w-full justify-start gap-0.5 bg-zinc-900/60 p-0.5">
          {tabKeys.map((tabKey, i) => (
            <TabsTrigger key={tabKey} value={tabKey}
              className="h-7 px-2 text-[11px] data-[state=active]:bg-zinc-800 data-[state=active]:text-zinc-100 text-zinc-400">
              {tabLabels[i]}
            </TabsTrigger>
          ))}
        </TabsList>
        <div className="min-h-0 flex-1 overflow-y-auto pt-3">
        <TabsContent value="resumo" className="m-0 space-y-3">
          <div>
            <Row k={t("networkMap.sidePanels.mgmtIp")} v={device.mgmtIp ?? "—"} />
            <Row k={t("networkMap.sidePanels.site")} v={device.site} />
            <Row k={t("networkMap.sidePanels.tenant")} v={device.tenant} />
            <Row k={t("networkMap.sidePanels.uptime")} v={device.uptime ?? "—"} />
            <Row k={t("networkMap.sidePanels.interfaces")} v={device.interfaces ?? 0} />
            <Row k={t("networkMap.sidePanels.alarms")} v={device.alarms ?? 0} />
            <Row k={t("networkMap.sidePanels.connectedLinks")} v={connected.length} />
          </div>
        </TabsContent>
        <TabsContent value="interfaces" className="m-0">
          <ul className="space-y-1">
            {connected.map((l) => {
              const other = devices.find((d) => d.id === (l.source === device.id ? l.target : l.source));
              const intf = l.source === device.id ? l.intfA : l.intfB;
              return (
                <li key={l.id} className="rounded-md border border-zinc-800 bg-zinc-900/60 p-2 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-zinc-100">{intf}</span>
                    <StatusBadge s={l.status} />
                  </div>
                  <div className="text-[10px] text-zinc-500">→ {other?.name} • {l.capacity}</div>
                </li>
              );
            })}
            {connected.length === 0 && <EmptyMsg>{t("networkMap.sidePanels.noConnectedInterfaces")}</EmptyMsg>}
          </ul>
        </TabsContent>
        <TabsContent value="circuitos" className="m-0">
          <ul className="space-y-1">
            {serviceLinks.map((l) => (
              <li key={l.id} className="rounded-md border border-zinc-800 bg-zinc-900/60 p-2 text-xs">
                <div className="flex items-center justify-between">
                  <span className="text-zinc-100">{t("networkMap.sidePanels.l2vcService", { capacity: l.capacity })}</span>
                  <StatusBadge s={l.status} />
                </div>
                <div className="text-[10px] text-zinc-500">{l.intfA} ↔ {l.intfB}</div>
              </li>
            ))}
            {serviceLinks.length === 0 && <EmptyMsg>{t("networkMap.sidePanels.noCircuits")}</EmptyMsg>}
          </ul>
        </TabsContent>
        <TabsContent value="bgp" className="m-0">
          <ul className="space-y-1">
            {bgpLinks.map((l) => {
              const other = devices.find((d) => d.id === (l.source === device.id ? l.target : l.source));
              return (
                <li key={l.id} className="rounded-md border border-zinc-800 bg-zinc-900/60 p-2 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="text-zinc-100">{other?.name}</span>
                    <StatusBadge s={l.status} />
                  </div>
                  <div className="text-[10px] text-zinc-500">{l.intfA} • {l.capacity}</div>
                </li>
              );
            })}
            {bgpLinks.length === 0 && <EmptyMsg>{t("networkMap.sidePanels.noBgpPeers")}</EmptyMsg>}
          </ul>
        </TabsContent>
        <TabsContent value="evid" className="m-0 space-y-1 text-xs">
          <EvidenceItem text={t("networkMap.sidePanels.evidenceSnmp")} when={t("networkMap.sidePanels.ago5min")} />
          <EvidenceItem text={t("networkMap.sidePanels.evidenceLldp")} when={t("networkMap.sidePanels.ago12min")} />
          <EvidenceItem text={t("networkMap.sidePanels.evidenceZabbix")} when={t("networkMap.sidePanels.ago1min")} />
        </TabsContent>
        </div>
      </Tabs>
      <div className="mt-2 flex gap-2 border-t border-zinc-800 pt-3">
        <CollectSnmpButton
          device={{
            id: Number(device.id.replace(/[^0-9]/g, "")) || 0,
            hostname: device.name,
            site: device.site,
            vendor: device.vendor,
            platform: device.model ?? device.type,
            status: device.status === "DOWN" ? "inactive" : "active",
            ipAddress: device.mgmtIp ?? "",
          } as never}
          variant="outline"
          size="sm"
        />
        <Button size="sm" variant="outline" className="flex-1 border-zinc-700 bg-zinc-900 text-zinc-200 hover:bg-zinc-800">
          {t("networkMap.sidePanels.viewEvidence")}
        </Button>
      </div>
    </div>
  );
}

export function EdgeDetailsPanel({
  link,
  devices,
}: {
  link: LinkData;
  devices: DeviceData[];
}) {
  const { t } = useTranslation();
  const src = devices.find((d) => d.id === link.source);
  const dst = devices.find((d) => d.id === link.target);
  const tabKeys = ["resumo", "deps", "hist", "evid"] as const;
  const tabLabels = [
    t("networkMap.sidePanels.tabs.summary"),
    t("networkMap.sidePanels.tabs.dependencies"),
    t("networkMap.sidePanels.tabs.history"),
    t("networkMap.sidePanels.tabs.evidence"),
  ];

  return (
    <div className="flex h-full flex-col gap-3 overflow-y-auto p-4 text-zinc-100">
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="flex items-center gap-2">
            <Cable className="h-4 w-4 text-sky-400" />
            <h3 className="text-sm font-semibold uppercase">{link.edgeType}</h3>
          </div>
          <p className="text-xs text-zinc-400">{link.capacity} • {t("networkMap.sidePanels.originLabel")} {link.origin}</p>
        </div>
        <StatusBadge s={link.status} />
      </div>
      <Tabs defaultValue="resumo" className="flex min-h-0 flex-1 flex-col">
        <TabsList className="h-8 w-full justify-start gap-0.5 bg-zinc-900/60 p-0.5">
          {tabKeys.map((tabKey, i) => (
            <TabsTrigger key={tabKey} value={tabKey}
              className="h-7 px-2 text-[11px] data-[state=active]:bg-zinc-800 data-[state=active]:text-zinc-100 text-zinc-400">
              {tabLabels[i]}
            </TabsTrigger>
          ))}
        </TabsList>
        <div className="min-h-0 flex-1 overflow-y-auto pt-3">
          <TabsContent value="resumo" className="m-0">
            <Row k={t("networkMap.sidePanels.source")} v={src?.name} />
            <Row k={t("networkMap.sidePanels.destination")} v={dst?.name} />
            <Row k={t("networkMap.sidePanels.interfaceA")} v={<span className="font-mono">{link.intfA}</span>} />
            <Row k={t("networkMap.sidePanels.interfaceB")} v={<span className="font-mono">{link.intfB}</span>} />
            <Row k={t("networkMap.sidePanels.capacity")} v={link.capacity} />
            <Row k={t("networkMap.sidePanels.confidence")} v={`${link.confidence}%`} />
            <Row k={t("networkMap.sidePanels.lastSeen")} v={link.lastSeen ?? t("networkMap.sidePanels.lastSeenDefault")} />
          </TabsContent>
          <TabsContent value="deps" className="m-0 text-xs">
            <EmptyMsg>{t("networkMap.sidePanels.noDependentCircuits")}</EmptyMsg>
          </TabsContent>
          <TabsContent value="hist" className="m-0">
            <ul className="space-y-1 text-xs">
              <li className="rounded-md border border-zinc-800 bg-zinc-900/60 p-2">
                <div>{t("networkMap.sidePanels.historyDiscovery")}</div>
                <div className="text-[10px] text-zinc-500">{t("networkMap.sidePanels.ago5min")}</div>
              </li>
              <li className="rounded-md border border-zinc-800 bg-zinc-900/60 p-2">
                <div>{t("networkMap.sidePanels.historyStatusChanged", { status: link.status })}</div>
                <div className="text-[10px] text-zinc-500">{t("networkMap.sidePanels.ago12min")}</div>
              </li>
              <li className="rounded-md border border-zinc-800 bg-zinc-900/60 p-2">
                <div>{t("networkMap.sidePanels.historyCapacityChanged", { capacity: link.capacity })}</div>
                <div className="text-[10px] text-zinc-500">{t("networkMap.sidePanels.ago1h")}</div>
              </li>
            </ul>
          </TabsContent>
          <TabsContent value="evid" className="m-0 space-y-1 text-xs">
            <EvidenceItem
              text={t("networkMap.sidePanels.evidenceLldpBetween", { source: src?.name ?? "", target: dst?.name ?? "" })}
              when={t("networkMap.sidePanels.ago4min")}
            />
            <EvidenceItem text={t("networkMap.sidePanels.evidenceMacTable")} when={t("networkMap.sidePanels.ago7min")} />
          </TabsContent>
        </div>
      </Tabs>
    </div>
  );
}

function EmptyMsg({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-md border border-dashed border-zinc-800 bg-zinc-900/30 p-3 text-center text-xs text-zinc-500">
      {children}
    </div>
  );
}

function EvidenceItem({ text, when }: { text: string; when: string }) {
  return (
    <div className="rounded-md border border-zinc-800 bg-zinc-900/60 p-2">
      <div className="text-zinc-100">{text}</div>
      <div className="text-[10px] text-zinc-500">{when}</div>
    </div>
  );
}
