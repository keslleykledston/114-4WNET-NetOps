import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { BgpAfiSafi, DependencyStatus } from "./types";

export function dependencyStatusClass(status: DependencyStatus | string) {
  switch (status) {
    case "FOUND":
      return "bg-green-500/10 text-green-400 border-green-500/20";
    case "MISSING":
      return "bg-red-500/10 text-red-400 border-red-500/20";
    case "UNKNOWN":
      return "bg-amber-500/10 text-amber-300 border-amber-500/20";
    default:
      return "bg-slate-500/10 text-slate-300 border-slate-500/20";
  }
}

export function DependencyStatusBadge({ status }: { status: DependencyStatus | string }) {
  return (
    <Badge variant="outline" className={cn("font-mono text-[10px]", dependencyStatusClass(status))}>
      {status}
    </Badge>
  );
}

export function afiSafiLabel(afi: BgpAfiSafi | string) {
  switch (afi) {
    case "ipv4_unicast":
      return "IPv4 Unicast";
    case "ipv6_unicast":
      return "IPv6 Unicast";
    case "vpnv4":
      return "VPNv4";
    case "vpnv6":
      return "VPNv6";
    case "ipv4_vrf":
      return "IPv4 VRF";
    case "ipv6_vrf":
      return "IPv6 VRF";
    default:
      return afi;
  }
}

export function afiSafiClass(afi: BgpAfiSafi | string) {
  if (afi === "ipv4_unicast" || afi === "ipv4_vrf") {
    return "bg-sky-500/10 text-sky-300 border-sky-500/20";
  }
  if (afi === "ipv6_unicast" || afi === "ipv6_vrf") {
    return "bg-violet-500/10 text-violet-300 border-violet-500/20";
  }
  if (afi === "vpnv4" || afi === "vpnv6") {
    return "bg-indigo-500/10 text-indigo-300 border-indigo-500/20";
  }
  return "bg-slate-500/10 text-slate-300 border-slate-500/20";
}

export function AfiSafiBadge({ afi }: { afi: BgpAfiSafi | string }) {
  return (
    <Badge variant="outline" className={cn("text-[10px]", afiSafiClass(afi))}>
      {afiSafiLabel(afi)}
    </Badge>
  );
}

export function PolicySourceBadge({ source, inherited }: { source: "peer" | "peer_group"; inherited?: boolean }) {
  if (inherited || source === "peer_group") {
    return (
      <Badge variant="outline" className="bg-purple-500/10 text-purple-300 border-purple-500/20 text-[10px]">
        inherited
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="bg-cyan-500/10 text-cyan-300 border-cyan-500/20 text-[10px]">
      direct
    </Badge>
  );
}

export function ConfigSourceBadge({ source }: { source: string }) {
  return (
    <Badge variant="outline" className="bg-slate-500/10 text-slate-200 border-slate-500/20 font-mono text-[10px]">
      {source}
    </Badge>
  );
}

export function cacheStatusClass(status: string) {
  switch (status) {
    case "fresh":
      return "bg-green-500/10 text-green-300 border-green-500/20";
    case "stale":
      return "bg-amber-500/10 text-amber-300 border-amber-500/20";
    case "expired":
      return "bg-orange-500/10 text-orange-300 border-orange-500/20";
    case "miss":
      return "bg-sky-500/10 text-sky-300 border-sky-500/20";
    case "recomputed":
      return "bg-cyan-500/10 text-cyan-300 border-cyan-500/20";
    default:
      return "bg-slate-500/10 text-slate-300 border-slate-500/20";
  }
}

export function CacheStatusBadge({ status }: { status: string }) {
  return (
    <Badge variant="outline" className={cn("font-mono text-[10px]", cacheStatusClass(status))}>
      cache {status}
    </Badge>
  );
}

export function HistoryFreshnessBadge({ status }: { status: string }) {
  return (
    <Badge variant="outline" className={cn("font-mono text-[10px]", cacheStatusClass(status))}>
      {status}
    </Badge>
  );
}
