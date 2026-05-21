export type InterfaceKind =
  | "physical"
  | "aggregate"
  | "subinterface"
  | "vlanif"
  | "loopback"
  | "tunnel"
  | "virtual_template"
  | "null"
  | "other";

export interface NormalizedInterface {
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
  kind: InterfaceKind;
  parentInterface?: string;
  vlanId?: number;
  encapsulation?: string;
}
