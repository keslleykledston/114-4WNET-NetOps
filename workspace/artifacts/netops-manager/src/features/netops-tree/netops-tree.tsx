import { useMemo, useState } from "react";
import type { Device } from "@workspace/api-client-react";
import {
  Building2,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  Cloud,
  Filter,
  GitBranch,
  Link2,
  Network,
  RadioTower,
  Server,
  Share2,
  Tags,
  Users,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { NetopsTreeSelection, NetopsTreeView } from "./types";

interface NetopsTreeProps {
  devices: Device[];
  selected: NetopsTreeSelection | null;
  onSelect: (selection: NetopsTreeSelection) => void;
}

const deviceViews: Array<{ key: NetopsTreeView; label: string; icon: LucideIcon }> = [
  { key: "interfaces", label: "Interfaces", icon: GitBranch },
  { key: "bgp", label: "BGP", icon: Network },
  { key: "filters", label: "Filters", icon: Filter },
  { key: "communities", label: "Communities", icon: Tags },
];

const bgpViews: Array<{ key: NetopsTreeView; label: string; icon: LucideIcon }> = [
  { key: "bgp-providers", label: "Operadoras", icon: RadioTower },
  { key: "bgp-customers", label: "Clientes", icon: Users },
  { key: "bgp-cdn", label: "CDN", icon: Cloud },
  { key: "bgp-ix", label: "IX", icon: Share2 },
  { key: "bgp-cdn-ix", label: "CDN/IX", icon: Network },
  { key: "bgp-ibgp", label: "iBGP", icon: Link2 },
  { key: "bgp-unknown", label: "Unknown", icon: CircleHelp },
];

function groupLabel(device: Device): string {
  return device.site?.trim() || "Sem cliente";
}

function groupDevices(devices: Device[]): Array<[string, Device[]]> {
  const grouped = new Map<string, Device[]>();

  for (const device of devices) {
    const label = groupLabel(device);
    grouped.set(label, [...(grouped.get(label) ?? []), device]);
  }

  return [...grouped.entries()]
    .map(([label, group]) => [
      label,
      group.sort((left, right) => left.hostname.localeCompare(right.hostname, "pt", { sensitivity: "base" })),
    ] as [string, Device[]])
    .sort(([left], [right]) => {
      if (left === "Sem cliente") return 1;
      if (right === "Sem cliente") return -1;
      return left.localeCompare(right, "pt", { sensitivity: "base" });
    });
}

export function NetopsTree({ devices, selected, onSelect }: NetopsTreeProps) {
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});
  const [expandedDevices, setExpandedDevices] = useState<Record<number, boolean>>({});
  const [expandedBgp, setExpandedBgp] = useState<Record<number, boolean>>({});

  const groups = useMemo(() => groupDevices(devices), [devices]);

  function isGroupOpen(label: string): boolean {
    return expandedGroups[label] ?? true;
  }

  function isDeviceOpen(id: number): boolean {
    return expandedDevices[id] ?? selected?.device.id === id;
  }

  function isBgpOpen(id: number): boolean {
    return expandedBgp[id] ?? true;
  }

  function selectDevice(device: Device, view: NetopsTreeView = "device") {
    setExpandedDevices((current) => ({ ...current, [device.id]: true }));
    onSelect({ device, view });
  }

  function treeItemClass(active: boolean, depth: "device" | "view" | "child") {
    return cn(
      "flex w-full items-center gap-2 rounded-md text-left transition-colors",
      depth === "device" && "px-2 py-1.5 text-sm",
      depth === "view" && "py-1.5 pl-8 pr-2 text-xs",
      depth === "child" && "py-1.5 pl-12 pr-2 text-xs",
      active
        ? "border border-primary/20 bg-primary/10 text-primary"
        : "text-muted-foreground hover:bg-muted/50 hover:text-foreground",
    );
  }

  if (groups.length === 0) {
    return (
      <div className="flex min-h-[320px] flex-col items-center justify-center gap-2 text-center text-muted-foreground">
        <Server className="h-8 w-8 opacity-50" />
        <p className="text-sm">No devices found.</p>
      </div>
    );
  }

  return (
    <div className="space-y-1">
      {groups.map(([label, groupDevices]) => {
        const groupOpen = isGroupOpen(label);

        return (
          <div key={label}>
            <button
              type="button"
              className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground hover:bg-muted/50 hover:text-foreground"
              onClick={() => setExpandedGroups((current) => ({ ...current, [label]: !groupOpen }))}
            >
              {groupOpen ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
              <Building2 className="h-3.5 w-3.5" />
              <span className="min-w-0 flex-1 truncate">{label}</span>
              <Badge variant="outline" className="h-5 px-1.5 text-[10px]">
                {groupDevices.length}
              </Badge>
            </button>

            {groupOpen && (
              <div className="ml-3 space-y-0.5 border-l border-border/70 pl-2">
                {groupDevices.map((device) => {
                  const deviceOpen = isDeviceOpen(device.id);
                  const activeDevice = selected?.device.id === device.id;

                  return (
                    <div key={device.id}>
                      <div className={treeItemClass(activeDevice && selected?.view === "device", "device")}>
                        <button
                          type="button"
                          className="-ml-1 rounded p-0.5 hover:bg-muted"
                          onClick={() => setExpandedDevices((current) => ({ ...current, [device.id]: !deviceOpen }))}
                          aria-label={deviceOpen ? "Collapse device" : "Expand device"}
                        >
                          {deviceOpen ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                        </button>
                        <button
                          type="button"
                          className="flex min-w-0 flex-1 items-center gap-2 text-left"
                          onClick={() => selectDevice(device)}
                        >
                          <Server className="h-3.5 w-3.5 shrink-0" />
                          <span className="truncate">{device.hostname}</span>
                        </button>
                      </div>

                      {deviceOpen && (
                        <div className="space-y-0.5">
                          {deviceViews.map(({ key, label: itemLabel, icon: Icon }) => {
                            if (key === "bgp") {
                              const bgpOpen = isBgpOpen(device.id);

                              return (
                                <div key={key}>
                                  <div className={treeItemClass(activeDevice && selected?.view === key, "view")}>
                                    <button
                                      type="button"
                                      className="-ml-1 rounded p-0.5 hover:bg-muted"
                                      onClick={() => setExpandedBgp((current) => ({ ...current, [device.id]: !bgpOpen }))}
                                      aria-label={bgpOpen ? "Collapse BGP" : "Expand BGP"}
                                    >
                                      {bgpOpen ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                                    </button>
                                    <button
                                      type="button"
                                      className="flex min-w-0 flex-1 items-center gap-2 text-left"
                                      onClick={() => selectDevice(device, key)}
                                    >
                                      <Icon className="h-3.5 w-3.5 shrink-0" />
                                      <span>{itemLabel}</span>
                                    </button>
                                  </div>

                                  {bgpOpen && bgpViews.map(({ key: childKey, label: childLabel, icon: ChildIcon }) => (
                                    <button
                                      key={childKey}
                                      type="button"
                                      className={treeItemClass(activeDevice && selected?.view === childKey, "child")}
                                      onClick={() => selectDevice(device, childKey)}
                                    >
                                      <ChildIcon className="h-3 w-3 shrink-0" />
                                      <span>{childLabel}</span>
                                    </button>
                                  ))}
                                </div>
                              );
                            }

                            return (
                              <button
                                key={key}
                                type="button"
                                className={treeItemClass(activeDevice && selected?.view === key, "view")}
                                onClick={() => selectDevice(device, key)}
                              >
                                <Icon className="h-3.5 w-3.5 shrink-0" />
                                <span>{itemLabel}</span>
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
