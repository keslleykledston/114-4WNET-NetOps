export interface SnmpCollectedInterface {
  ifIndex: number;
  name: string;
  description: string | null;
  alias: string | null;
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
  inUpdates: number | null;
  outUpdates: number | null;
  addressFamily: "ipv4" | "ipv6" | "unknown";
  source: "snmp";
}

export interface SnmpReadonlyCollectPayload {
  success: boolean;
  errorMessage: string | null;
  errors: string[];
  interfaces: SnmpCollectedInterface[];
  bgpPeers: SnmpCollectedBgpPeer[];
  collectedAt: string;
  source: "snmp";
}
