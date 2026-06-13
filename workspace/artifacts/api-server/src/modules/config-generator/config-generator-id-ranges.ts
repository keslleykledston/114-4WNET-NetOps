export type ConfigGeneratorIdType = "vlan" | "subinterface" | "l2vc" | "vsi";

export interface ConfigGeneratorIdRangeDefinition {
  key: string;
  type: ConfigGeneratorIdType;
  rangeStart: number;
  rangeEnd: number;
  serviceTypes: string[];
  reserved?: boolean;
  blocking?: boolean;
  untaggedRequired?: boolean;
  label: string;
}

/** K3G VLAN padronização rev. 2026.05 — catálogo interno versionado. */
export const CONFIG_GENERATOR_BUILTIN_VLAN_RANGES: ConfigGeneratorIdRangeDefinition[] = [
  {
    key: "vlan_factory_default",
    type: "vlan",
    rangeStart: 1,
    rangeEnd: 1,
    serviceTypes: [],
    reserved: true,
    blocking: true,
    label: "VLAN 1 - remover/nunca usar",
  },
  {
    key: "intra_site",
    type: "vlan",
    rangeStart: 2,
    rangeEnd: 98,
    serviceTypes: ["intra_site_link"],
    reserved: false,
    label: "Enlaces intra-site",
  },
  {
    key: "oob_management",
    type: "vlan",
    rangeStart: 99,
    rangeEnd: 99,
    serviceTypes: ["oob_management"],
    reserved: true,
    blocking: true,
    label: "Gerência OOB do site",
  },
  {
    key: "inter_site",
    type: "vlan",
    rangeStart: 100,
    rangeEnd: 199,
    serviceTypes: ["inter_site_link"],
    reserved: false,
    untaggedRequired: true,
    label: "Enlaces inter-site",
  },
  {
    key: "internal_services",
    type: "vlan",
    rangeStart: 200,
    rangeEnd: 299,
    serviceTypes: ["internal_service"],
    reserved: false,
    label: "Serviços internos",
  },
  {
    key: "ce_management",
    type: "vlan",
    rangeStart: 300,
    rangeEnd: 499,
    serviceTypes: ["ce_management"],
    reserved: false,
    label: "Gerência de CE",
  },
  {
    key: "l2vpn",
    type: "vlan",
    rangeStart: 600,
    rangeEnd: 799,
    serviceTypes: ["l2vpn_vlan", "l2vpn_ptp", "l2vpn_ptmp", "vpws", "vpls", "l2vpn"],
    reserved: false,
    label: "Serviço L2VPN",
  },
  {
    key: "l3vpn",
    type: "vlan",
    rangeStart: 800,
    rangeEnd: 999,
    serviceTypes: ["l3vpn", "internet_customer", "bgp_customer", "bgp_customer_community"],
    reserved: false,
    label: "Serviço L3VPN / Internet cliente",
  },
  {
    key: "datacenter",
    type: "vlan",
    rangeStart: 1000,
    rangeEnd: 1200,
    serviceTypes: ["datacenter", "server"],
    reserved: false,
    label: "Datacenter / servidores",
  },
  {
    key: "general_use",
    type: "vlan",
    rangeStart: 1201,
    rangeEnd: 4000,
    serviceTypes: ["general", "neutral_network", "cdn"],
    reserved: false,
    label: "Uso geral",
  },
  {
    key: "ieee_reserved",
    type: "vlan",
    rangeStart: 4001,
    rangeEnd: 4094,
    serviceTypes: [],
    reserved: true,
    blocking: true,
    label: "Reservado IEEE / não usar",
  },
];

export const CONFIG_GENERATOR_ID_RANGES_VERSION = "2026.05";

const SERVICE_TYPE_VLAN_RANGE: Record<string, string> = {
  intra_site_link: "intra_site",
  inter_site_link: "inter_site",
  internal_service: "internal_services",
  ce_management: "ce_management",
  oob_management: "oob_management",
  l2vpn_vlan: "l2vpn",
  l2vpn_ptp: "l2vpn",
  l2vpn_ptmp: "l2vpn",
  l2vpn: "l2vpn",
  vpws: "l2vpn",
  vpls: "l2vpn",
  l3vpn: "l3vpn",
  internet_customer: "l3vpn",
  bgp_customer: "l3vpn",
  bgp_customer_community: "l3vpn",
  datacenter: "datacenter",
  server: "datacenter",
  general: "general_use",
  neutral_network: "general_use",
  cdn: "general_use",
};

export function resolveVlanRangeKeyForServiceType(serviceType: string): string | null {
  const normalized = serviceType.trim().toLowerCase();
  const key = SERVICE_TYPE_VLAN_RANGE[normalized];
  if (key) return key;
  if (normalized.includes("l2vpn") || normalized.includes("vpws") || normalized.includes("vpls")) return "l2vpn";
  if (normalized.includes("bgp") || normalized.includes("l3vpn") || normalized.includes("internet")) return "l3vpn";
  if (normalized.includes("datacenter") || normalized.includes("server")) return "datacenter";
  return "general_use";
}

export function getVlanRangeByKey(rangeKey: string): ConfigGeneratorIdRangeDefinition | null {
  return CONFIG_GENERATOR_BUILTIN_VLAN_RANGES.find((item) => item.key === rangeKey) ?? null;
}

export function getVlanRangeForServiceType(serviceType: string): ConfigGeneratorIdRangeDefinition | null {
  const key = resolveVlanRangeKeyForServiceType(serviceType);
  return key ? getVlanRangeByKey(key) : null;
}

export function findVlanRangeForValue(vlan: number): ConfigGeneratorIdRangeDefinition | null {
  return CONFIG_GENERATOR_BUILTIN_VLAN_RANGES.find(
    (item) => item.type === "vlan" && vlan >= item.rangeStart && vlan <= item.rangeEnd,
  ) ?? null;
}

export function isVlanGloballyBlocked(vlan: number, serviceType?: string | null): boolean {
  if (vlan === 1) return true;
  if (vlan >= 4001 && vlan <= 4094) return true;
  if (vlan === 99) return serviceType !== "oob_management";
  const range = findVlanRangeForValue(vlan);
  return Boolean(range?.blocking);
}

export function isVlanOutsidePreferredRange(vlan: number, serviceType: string): boolean {
  const preferred = getVlanRangeForServiceType(serviceType);
  if (!preferred) return false;
  return vlan < preferred.rangeStart || vlan > preferred.rangeEnd;
}

export function listBuiltinIdRanges(type?: ConfigGeneratorIdType): ConfigGeneratorIdRangeDefinition[] {
  if (!type) return [...CONFIG_GENERATOR_BUILTIN_VLAN_RANGES];
  return CONFIG_GENERATOR_BUILTIN_VLAN_RANGES.filter((item) => item.type === type);
}
