import type { DiscoveryContext } from "./device-discovery/discovery.types.js";

export type VendorKey = "huawei" | "raisecom" | "datacom" | "zte" | "cisco" | "juniper" | "nokia" | "unknown";

const HUAWEI_DISCOVERY_COMMANDS: Record<DiscoveryContext, string[]> = {
  interfaces: ["display interface brief", "display interface description"],
  bgp: ["display bgp peer", "display bgp peer verbose", "display bgp ipv6 peer verbose"],
  l2vpn: ["display mpls l2vc", "display vsi"],
  policies: ["display route-policy", "display ip ip-prefix"],
  vrfs: [],
};

const RAISECOM_DISCOVERY_COMMANDS: Record<DiscoveryContext, string[]> = {
  interfaces: ["show interface", "show ip interface brief"],
  bgp: ["show ip bgp summary", "show bgp all summary"],
  l2vpn: ["show mpls l2vc", "show vlan"],
  policies: ["show running-config"],
  vrfs: [],
};

const GENERIC_DISCOVERY_COMMANDS: Record<DiscoveryContext, string[]> = {
  interfaces: ["show interfaces", "show ip interface brief"],
  bgp: ["show ip bgp summary"],
  l2vpn: ["show mpls l2vc", "show vlan"],
  policies: ["show running-config"],
  vrfs: ["show ip vrf"],
};

function normalizeText(value: string | null | undefined): string {
  return String(value ?? "").trim().toLowerCase();
}

export function normalizeVendorKey(vendor: string, platform?: string): VendorKey {
  const vendorText = normalizeText(vendor);
  const platformText = normalizeText(platform);

  if (platformText === "vrp" || vendorText.includes("huawei")) return "huawei";
  if (platformText === "ros" || vendorText.includes("raisecom")) return "raisecom";
  if (platformText === "dmos" || vendorText.includes("datacom")) return "datacom";
  if (platformText === "zxros" || vendorText.includes("zte")) return "zte";
  if (vendorText.includes("cisco")) return "cisco";
  if (vendorText.includes("juniper")) return "juniper";
  if (vendorText.includes("nokia")) return "nokia";
  return "unknown";
}

export function isHuaweiLike(vendorKey: VendorKey): boolean {
  return vendorKey === "huawei" || vendorKey === "raisecom";
}

export function needsLegacySshAlgorithms(vendor: string, platform?: string): boolean {
  const key = normalizeVendorKey(vendor, platform);
  return key === "raisecom" || key === "datacom" || key === "zte";
}

export function getSshVersionCommand(vendorKey: VendorKey): string {
  if (vendorKey === "huawei") return "display version";
  return "show version";
}

export function getRunningConfigCommand(vendorKey: VendorKey): string {
  if (vendorKey === "huawei") return "display current-configuration";
  return "show running-config";
}

export function getConfigBundleCommands(vendorKey: VendorKey): string[] {
  if (vendorKey === "huawei") {
    return [
      "display current-configuration",
      "display bgp peer",
      "display bgp peer verbose",
      "display mpls l2vc verbose",
      "display vsi verbose",
      "display interface description",
      "display interface brief",
    ];
  }
  if (vendorKey === "raisecom") {
    return [
      "show running-config",
      "show ip bgp summary",
      "show bgp all summary",
      "show interface",
      "show ip interface brief",
      "show vlan",
      "show mpls l2vc",
    ];
  }
  return ["show running-config", "show ip bgp summary", "show interfaces", "show ip interface brief"];
}

function commandsForContext(vendorKey: VendorKey, context: DiscoveryContext): string[] {
  if (vendorKey === "huawei") return HUAWEI_DISCOVERY_COMMANDS[context] ?? [];
  if (vendorKey === "raisecom") return RAISECOM_DISCOVERY_COMMANDS[context] ?? [];
  return GENERIC_DISCOVERY_COMMANDS[context] ?? [];
}

export function getDiscoveryCommands(vendorKey: VendorKey, contexts: DiscoveryContext[]): string[] {
  const specificCommands = [...new Set(contexts.flatMap((context) => commandsForContext(vendorKey, context)))];
  return [...new Set([getRunningConfigCommand(vendorKey), ...specificCommands])];
}
