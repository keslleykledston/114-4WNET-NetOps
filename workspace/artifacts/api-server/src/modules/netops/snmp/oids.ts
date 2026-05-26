/** IF-MIB + IF-MIB extensions + BGP4-MIB (RFC 1657) — read-only GET/WALK only. */
export const SNMP_OIDS = {
  ifDescr: "1.3.6.1.2.1.2.2.1.2",
  ifType: "1.3.6.1.2.1.2.2.1.3",
  ifMtu: "1.3.6.1.2.1.2.2.1.4",
  ifSpeed: "1.3.6.1.2.1.2.2.1.5",
  ifPhysAddress: "1.3.6.1.2.1.2.2.1.6",
  ifAdminStatus: "1.3.6.1.2.1.2.2.1.7",
  ifOperStatus: "1.3.6.1.2.1.2.2.1.8",
  ifLastChange: "1.3.6.1.2.1.2.2.1.9",
  ifName: "1.3.6.1.2.1.31.1.1.1.1",
  ifHCInOctets: "1.3.6.1.2.1.31.1.1.1.6",
  ifHCOutOctets: "1.3.6.1.2.1.31.1.1.1.10",
  ifHighSpeed: "1.3.6.1.2.1.31.1.1.1.15",
  ifAlias: "1.3.6.1.2.1.31.1.1.1.18",
  bgpPeerState: "1.3.6.1.2.1.15.3.1.2",
  bgpPeerRemoteAddr: "1.3.6.1.2.1.15.3.1.7",
  bgpPeerRemoteAs: "1.3.6.1.2.1.15.3.1.9",
  bgpPeerInUpdates: "1.3.6.1.2.1.15.3.1.10",
  bgpPeerOutUpdates: "1.3.6.1.2.1.15.3.1.11",
  bgpPeerFsmEstablishedTime: "1.3.6.1.2.1.15.3.1.16",
} as const;

export const BGP_STATE_BY_CODE: Record<string, string> = {
  "1": "idle",
  "2": "connect",
  "3": "active",
  "4": "opensent",
  "5": "openconfirm",
  "6": "established",
};

export const IF_ADMIN_STATUS: Record<string, string> = {
  "1": "up",
  "2": "down",
  "3": "testing",
};

export const IF_OPER_STATUS: Record<string, string> = {
  "1": "up",
  "2": "down",
  "3": "testing",
  "4": "unknown",
  "5": "dormant",
  "6": "notPresent",
  "7": "lowerLayerDown",
};
