import { useMemo, useState } from "react";
import type { Device, NetopsBgpPeer } from "@workspace/api-client-react";
import { useListNetopsDeviceBgpPeers } from "@workspace/api-client-react";
import {
  Building2,
  ChevronDown,
  ChevronRight,
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
import { useTranslation } from "@/i18n";
import type { NetopsTreeSelection, NetopsTreeView } from "./types";

interface NetopsTreeProps {
  devices: Device[];
  selected: NetopsTreeSelection | null;
  onSelect: (selection: NetopsTreeSelection) => void;
}

interface BgpCategoryItem {
  key: NetopsTreeView;
  labelKey: string;
  icon: LucideIcon;
  roleFilter?: string;
}

function useDeviceViews() {
  const { t } = useTranslation();
  return useMemo(
    () => [
      { key: "device" as const, label: t("netopsTree.views.summary"), icon: Server },
      { key: "interfaces" as const, label: t("netopsTree.views.interfaces"), icon: GitBranch },
      { key: "bgp" as const, label: t("netopsTree.views.bgp"), icon: Network },
      { key: "filters" as const, label: t("netopsTree.views.filters"), icon: Filter },
      { key: "communities" as const, label: t("netopsTree.views.communities"), icon: Tags },
    ],
    [t],
  );
}

function useBgpCategories(): BgpCategoryItem[] {
  const { t } = useTranslation();
  return useMemo(
    () => [
      { key: "bgp-providers", labelKey: "netopsTree.bgpCategories.providers", icon: RadioTower, roleFilter: "provider" },
      { key: "bgp-customers", labelKey: "netopsTree.bgpCategories.customers", icon: Users, roleFilter: "customer" },
      { key: "bgp-cdn", labelKey: "netopsTree.bgpCategories.cdn", icon: Cloud, roleFilter: "cdn" },
      { key: "bgp-ix", labelKey: "netopsTree.bgpCategories.ix", icon: Share2, roleFilter: "ix" },
      { key: "bgp-cdn-ix", labelKey: "netopsTree.bgpCategories.cdnIx", icon: Network, roleFilter: "cdn_ix" },
      { key: "bgp-ibgp", labelKey: "netopsTree.bgpCategories.ibgp", icon: Link2, roleFilter: "ibgp" },
    ],
    [t],
  );
}

function groupLabel(device: Device, noCustomerLabel: string): string {
  return device.site?.trim() || noCustomerLabel;
}

function groupDevices(devices: Device[], noCustomerLabel: string): Array<[string, Device[]]> {
  const grouped = new Map<string, Device[]>();

  for (const device of devices) {
    const label = groupLabel(device, noCustomerLabel);
    grouped.set(label, [...(grouped.get(label) ?? []), device]);
  }

  return [...grouped.entries()]
    .map(([label, group]) => [
      label,
      group.sort((left, right) => left.hostname.localeCompare(right.hostname, "pt", { sensitivity: "base" })),
    ] as [string, Device[]])
    .sort(([left], [right]) => {
      if (left === noCustomerLabel) return 1;
      if (right === noCustomerLabel) return -1;
      return left.localeCompare(right, "pt", { sensitivity: "base" });
    });
}

function BgpCategoryTree({
  device,
  peers,
  category,
  selected,
  onSelect,
  label,
}: {
  device: Device;
  peers: NetopsBgpPeer[] | undefined;
  category: BgpCategoryItem;
  selected: NetopsTreeSelection | null;
  onSelect: (selection: NetopsTreeSelection) => void;
  label: string;
}) {
  const filteredPeers = useMemo(
    () => (peers ?? []).filter((p) => p.role === category.roleFilter),
    [peers, category.roleFilter],
  );

  const Icon = category.icon;
  const isActive = selected?.device.id === device.id && selected?.view === category.key;

  return (
    <button
      type="button"
      onClick={() => onSelect({ device, view: category.key })}
      className={cn(
        "flex w-full items-center gap-2 rounded-md py-1.5 pl-8 pr-2 text-xs transition-colors",
        isActive
          ? "border border-primary/20 bg-primary/10 text-primary"
          : "text-muted-foreground hover:bg-muted/50 hover:text-foreground",
      )}
    >
      <Icon className="h-3 w-3 shrink-0" />
      <span className="flex-1 text-left">{label}</span>
      <Badge variant="outline" className="h-4 px-1 text-[9px]">
        {filteredPeers.length}
      </Badge>
    </button>
  );
}

function DeviceTreeNode({
  device,
  selected,
  onSelect,
  treeItemClass,
  expanded,
  onToggleDevice,
  bgpOpen,
  onToggleBgp,
  deviceViews,
  bgpCategories,
  t,
}: {
  device: Device;
  selected: NetopsTreeSelection | null;
  onSelect: (selection: NetopsTreeSelection) => void;
  treeItemClass: (active: boolean, depth: "device" | "view" | "child") => string;
  expanded: boolean;
  onToggleDevice: () => void;
  bgpOpen: boolean;
  onToggleBgp: () => void;
  deviceViews: ReturnType<typeof useDeviceViews>;
  bgpCategories: BgpCategoryItem[];
  t: (key: string) => string;
}) {
  const { data: peers } = useListNetopsDeviceBgpPeers(device.id);
  const activeDevice = selected?.device.id === device.id;

  return (
    <div key={device.id}>
      <div className={treeItemClass(activeDevice && selected?.view === "device", "device")}>
        <button
          type="button"
          className="-ml-1 rounded p-0.5 hover:bg-muted"
          onClick={onToggleDevice}
          aria-label={expanded ? t("netopsTree.collapseDevice") : t("netopsTree.expandDevice")}
        >
          {expanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
        </button>
        <button
          type="button"
          className="flex min-w-0 flex-1 items-center gap-2 text-left"
          onClick={() => onSelect({ device, view: "device" })}
        >
          <Server className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate">{device.hostname}</span>
        </button>
      </div>

      {expanded && (
        <div className="space-y-0.5">
          {deviceViews.map(({ key, label: itemLabel, icon: Icon }) => {
            if (key === "bgp") {
              return (
                <div key={key}>
                  <div className={treeItemClass(activeDevice && selected?.view === key, "view")}>
                    <button
                      type="button"
                      className="-ml-1 rounded p-0.5 hover:bg-muted"
                      onClick={onToggleBgp}
                      aria-label={bgpOpen ? t("netopsTree.collapseBgp") : t("netopsTree.expandBgp")}
                    >
                      {bgpOpen ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                    </button>
                    <button
                      type="button"
                      className="flex min-w-0 flex-1 items-center gap-2 text-left"
                      onClick={() => onSelect({ device, view: key })}
                    >
                      <Icon className="h-3.5 w-3.5 shrink-0" />
                      <span>{itemLabel}</span>
                    </button>
                  </div>

                  {bgpOpen &&
                    bgpCategories.map((category) => (
                      <BgpCategoryTree
                        key={category.key}
                        device={device}
                        peers={peers}
                        category={category}
                        selected={selected}
                        onSelect={onSelect}
                        label={t(category.labelKey)}
                      />
                    ))}
                </div>
              );
            }

            return (
              <button
                key={key}
                type="button"
                className={treeItemClass(activeDevice && selected?.view === key, "view")}
                onClick={() => onSelect({ device, view: key })}
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
}

export function NetopsTree({ devices, selected, onSelect }: NetopsTreeProps) {
  const { t } = useTranslation();
  const deviceViews = useDeviceViews();
  const bgpCategories = useBgpCategories();
  const noCustomerLabel = t("netopsTree.noCustomer");
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});
  const [expandedDevices, setExpandedDevices] = useState<Record<number, boolean>>({});
  const [expandedBgp, setExpandedBgp] = useState<Record<number, boolean>>({});

  const groups = useMemo(() => groupDevices(devices, noCustomerLabel), [devices, noCustomerLabel]);

  function isGroupOpen(label: string): boolean {
    return expandedGroups[label] ?? true;
  }

  function isDeviceOpen(id: number): boolean {
    return expandedDevices[id] ?? selected?.device.id === id;
  }

  function isBgpOpen(id: number): boolean {
    return expandedBgp[id] ?? true;
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
        <p className="text-sm">{t("netopsTree.noDevices")}</p>
      </div>
    );
  }

  return (
    <div className="space-y-1">
      {groups.map(([label, groupDevicesList]) => {
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
                {groupDevicesList.length}
              </Badge>
            </button>

            {groupOpen && (
              <div className="ml-3 space-y-0.5 border-l border-border/70 pl-2">
                {groupDevicesList.map((device) => {
                  const deviceOpen = isDeviceOpen(device.id);
                  const bgpOpen = isBgpOpen(device.id);

                  return (
                    <DeviceTreeNode
                      key={device.id}
                      device={device}
                      selected={selected}
                      onSelect={onSelect}
                      treeItemClass={treeItemClass}
                      expanded={deviceOpen}
                      onToggleDevice={() => setExpandedDevices((current) => ({ ...current, [device.id]: !deviceOpen }))}
                      bgpOpen={bgpOpen}
                      onToggleBgp={() => setExpandedBgp((current) => ({ ...current, [device.id]: !bgpOpen }))}
                      deviceViews={deviceViews}
                      bgpCategories={bgpCategories}
                      t={t}
                    />
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
