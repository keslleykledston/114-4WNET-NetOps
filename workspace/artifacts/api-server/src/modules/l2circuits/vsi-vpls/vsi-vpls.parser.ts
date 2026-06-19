import { parseHuaweiL2Circuits } from "../parsers/huawei-vrp-l2.js";
import type { ParsedL2Circuit } from "../l2circuits.types.js";

export interface VsiVplsParseContext {
  tenantId?: number | null;
  site?: string | null;
  deviceId?: number | null;
  deviceName?: string | null;
}

export interface VsiVplsParsedItem {
  vsi_name: string;
  vs_id: string | null;
  signaling: string | null;
  peers: ParsedL2Circuit["peers"];
  peer_ip: string | null;
  pw_id: string | null;
  pw_status: string | null;
  interface_ac: string | null;
  vlan_id: number | null;
  qinq_outer_vlan: number | null;
  qinq_inner_vlan: number | null;
  mtu: number | null;
  raw_config_block: string;
  device_id: number | null;
  site_id: string | null;
  tenant_id: number | null;
}

export function parseHuaweiVsiVpls(rawOutputs: Record<string, string | undefined>, context: VsiVplsParseContext = {}): VsiVplsParsedItem[] {
  const circuits = parseHuaweiL2Circuits(rawOutputs);
  return circuits
    .filter((circuit) => circuit.circuitType === "vsi" || circuit.circuitType === "vpls")
    .map((circuit) => ({
      vsi_name: circuit.vsiName ?? circuit.name ?? "unknown",
      vs_id: circuit.vsiId ?? null,
      signaling: circuit.classification ?? circuit.l2Transport ?? null,
      peers: circuit.peers ?? undefined,
      peer_ip: circuit.primaryPeerIp ?? circuit.peerIp ?? null,
      pw_id: circuit.vcId ?? null,
      pw_status: circuit.pwStatus ?? null,
      interface_ac: circuit.localInterface ?? null,
      vlan_id: circuit.outerVlan ?? null,
      qinq_outer_vlan: circuit.outerVlan ?? null,
      qinq_inner_vlan: circuit.innerVlan ?? null,
      mtu: null,
      raw_config_block: circuit.rawEvidence,
      device_id: context.deviceId ?? null,
      site_id: context.site ?? null,
      tenant_id: context.tenantId ?? null,
    }));
}
