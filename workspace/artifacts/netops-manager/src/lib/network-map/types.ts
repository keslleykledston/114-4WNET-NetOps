export type DeviceType =
  | "router"
  | "switch"
  | "olt"
  | "dwdm"
  | "firewall"
  | "server"
  | "customer"
  | "bgp"
  | "site";

export type NodeStatus = "UP" | "DOWN" | "PARTIAL" | "UNKNOWN" | "PLANNED";
export type EdgeType =
  | "physical"
  | "lag"
  | "bgp"
  | "service"
  | "optical"
  | "planned"
  | "manual";
export type LinkOrigin =
  | "discovered"
  | "manual"
  | "planned"
  | "netbox"
  | "zabbix"
  | "database";

export interface DeviceData {
  id: string;
  name: string;
  type: DeviceType;
  vendor: string;
  model?: string;
  role: string;
  site: string;
  tenant: string;
  status: NodeStatus;
  mgmtIp?: string;
  uptime?: string;
  interfaces?: number;
  alarms?: number;
}

export interface LinkWaypoint {
  x: number;
  y: number;
}

export interface LinkData {
  id: string;
  source: string;
  target: string;
  /** React Flow handle id on source node (top | bottom | left | right). */
  sourceHandle?: string;
  /** React Flow handle id on target node. */
  targetHandle?: string;
  /** User-placed bend points for manual edge routing (edit mode). */
  waypoints?: LinkWaypoint[];
  edgeType: EdgeType;
  intfA: string;
  intfB: string;
  capacity: string;
  status: NodeStatus;
  origin: LinkOrigin;
  confidence: number;
  lastSeen?: string;
  label?: string;
  /** 0–100 bandwidth utilization from SNMP_FAST samples */
  utilizationPct?: number | null;
}