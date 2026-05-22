export interface SnmpCollectedInterface {
  ifIndex: number;
  name: string;
  description: string | null;
  alias: string | null;
  rawDescr: string | null;
  adminStatus: string;
  operStatus: string;
  type: number | null;
  mtu: number | null;
  speed: number | null;
  mac: string | null;
  inOctets: number | null;
  outOctets: number | null;
  source: "snmp";
}

export interface SnmpCollectedBgpPeer {
  peerIp: string;
  remoteAs: number | null;
  state: string;
  uptimeSecs: number | null;
  // SNMP BGP counters used as prefix counts in the inventory layer.
  inUpdates: number | null;
  // SNMP BGP counters used as prefix counts in the inventory layer.
  outUpdates: number | null;
  addressFamily: "ipv4" | "ipv6" | "unknown";
  source: "snmp";
}

export interface OidDiagnostic {
  oid: string;
  status: "ok" | "empty" | "timeout" | "noSuchObject" | "noSuchName" | "authFailure" | "accessDenied" | "unsupported" | "error";
  count: number;
  message?: string;
}

export interface SnmpReadonlyCollectPayload {
  success: boolean;
  errorMessage: string | null;
  errors: string[];
  warnings?: string[];
  interfaces: SnmpCollectedInterface[];
  bgpPeers: SnmpCollectedBgpPeer[];
  collectedAt: string;
  source: "snmp";
  oidDiagnostics?: Record<string, OidDiagnostic>;
}
