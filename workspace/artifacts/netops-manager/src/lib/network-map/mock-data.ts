import type { DeviceData, LinkData } from "./types";

export const TENANTS = ["4WNET", "SpeedNetworks", "InforrNet", "K3G Solutions"];
export const SITES = ["Manaus", "Boa Vista", "Ariquemes", "Machadinho", "Cujubim"];
export const LAYERS = ["Física", "L2", "BGP", "DWDM", "Serviço"];
export const STATUSES = ["UP", "DOWN", "PARTIAL", "UNKNOWN", "PLANNED"];
export const ORIGINS = ["Descoberto", "Manual", "Planejado", "NetBox", "Zabbix", "Banco interno"];
export const DEVICE_TYPES = ["router", "switch", "olt", "dwdm", "firewall", "server", "customer", "bgp", "site"];

export const MOCK_DEVICES: DeviceData[] = [
  { id: "d1", name: "4WNET-MNS-RA-NE8000", type: "router", vendor: "Huawei", model: "NE8000", role: "Core", site: "Manaus", tenant: "4WNET", status: "UP", mgmtIp: "10.0.0.1", uptime: "184d", interfaces: 48, alarms: 0 },
  { id: "d2", name: "4WNET-MNS-RB-NE8000", type: "router", vendor: "Huawei", model: "NE8000", role: "Backbone", site: "Manaus", tenant: "4WNET", status: "UP", mgmtIp: "10.0.0.2", uptime: "120d", interfaces: 42, alarms: 0 },
  { id: "d3", name: "4WNET-BVA-RA-S6730", type: "switch", vendor: "Huawei", model: "S6730", role: "Agregação", site: "Boa Vista", tenant: "4WNET", status: "UP", mgmtIp: "10.1.0.1", uptime: "90d", interfaces: 24, alarms: 0 },
  { id: "d4", name: "4WNET-BVA-RB-S6730", type: "switch", vendor: "Huawei", model: "S6730", role: "Agregação", site: "Boa Vista", tenant: "4WNET", status: "PARTIAL", mgmtIp: "10.1.0.2", uptime: "60d", interfaces: 24, alarms: 2 },
  { id: "d5", name: "4WNET-MCH-RA-S6730", type: "switch", vendor: "Huawei", model: "S6730", role: "POP", site: "Machadinho", tenant: "4WNET", status: "UP", mgmtIp: "10.2.0.1", uptime: "45d", interfaces: 16, alarms: 0 },
  { id: "d6", name: "4WNET-CJB-RA-S6730", type: "switch", vendor: "Huawei", model: "S6730", role: "POP", site: "Cujubim", tenant: "4WNET", status: "DOWN", mgmtIp: "10.3.0.1", uptime: "-", interfaces: 0, alarms: 5 },
  { id: "d7", name: "IX-MANAUS", type: "bgp", vendor: "IX.br", role: "IX", site: "Manaus", tenant: "4WNET", status: "UP", interfaces: 1 },
  { id: "d8", name: "GOOGLE-CDN", type: "bgp", vendor: "Google", role: "CDN", site: "Manaus", tenant: "4WNET", status: "UP", interfaces: 1 },
  { id: "d9", name: "UPSTREAM-01", type: "bgp", vendor: "Provider", role: "Upstream", site: "Manaus", tenant: "4WNET", status: "UP", interfaces: 1 },
  { id: "d10", name: "CLIENTE-SPEEDNETWORKS", type: "customer", vendor: "Cliente", role: "Cliente BGP", site: "Boa Vista", tenant: "SpeedNetworks", status: "UP", interfaces: 1 },
  { id: "d11", name: "DWDM-MNS-01", type: "dwdm", vendor: "Padtec", role: "Optical", site: "Manaus", tenant: "4WNET", status: "UP", interfaces: 8 },
  { id: "d12", name: "DWDM-BVA-01", type: "dwdm", vendor: "Padtec", role: "Optical", site: "Boa Vista", tenant: "4WNET", status: "PARTIAL", interfaces: 8, alarms: 1 },
];

export const MOCK_LINKS: LinkData[] = [
  { id: "l1", source: "d1", target: "d2", edgeType: "physical", intfA: "100GE0/1/0", intfB: "100GE0/1/1", capacity: "100G", status: "UP", origin: "discovered", confidence: 100 },
  { id: "l2", source: "d2", target: "d3", edgeType: "physical", intfA: "Eth-Trunk2.650", intfB: "100GE1/0/32", capacity: "100G", status: "PARTIAL", origin: "discovered", confidence: 85 },
  { id: "l3", source: "d3", target: "d4", edgeType: "lag", intfA: "Eth-Trunk12", intfB: "Eth-Trunk12", capacity: "20G", status: "PARTIAL", origin: "database", confidence: 80 },
  { id: "l4", source: "d1", target: "d7", edgeType: "bgp", intfA: "Vlanif900", intfB: "Peer", capacity: "10G", status: "UP", origin: "database", confidence: 90 },
  { id: "l5", source: "d1", target: "d8", edgeType: "bgp", intfA: "Vlanif910", intfB: "Peer", capacity: "20G", status: "UP", origin: "database", confidence: 90 },
  { id: "l6", source: "d1", target: "d9", edgeType: "bgp", intfA: "100GE0/2/0", intfB: "Provider", capacity: "100G", status: "UP", origin: "database", confidence: 90 },
  { id: "l7", source: "d3", target: "d10", edgeType: "service", intfA: "XGE0/0/12.1201", intfB: "Cliente", capacity: "1G", status: "UP", origin: "manual", confidence: 70 },
  { id: "l8", source: "d11", target: "d12", edgeType: "optical", intfA: "LINE-1", intfB: "LINE-1", capacity: "100G", status: "PARTIAL", origin: "zabbix", confidence: 85 },
  { id: "l9", source: "d2", target: "d5", edgeType: "physical", intfA: "10GE0/3/1", intfB: "10GE0/0/1", capacity: "10G", status: "UP", origin: "discovered", confidence: 95 },
  { id: "l10", source: "d2", target: "d6", edgeType: "physical", intfA: "10GE0/3/2", intfB: "10GE0/0/1", capacity: "10G", status: "DOWN", origin: "discovered", confidence: 70 },
];

export const RECENT_CHANGES = [
  { id: "c1", at: "há 2 min", text: "Novo link detectado: MNS-RB → MCH-RA" },
  { id: "c2", at: "há 5 min", text: "Link parcial identificado: BVA-RA ↔ BVA-RB" },
  { id: "c3", at: "há 8 min", text: "Device 4WNET-CJB-RA-S6730 está DOWN" },
];