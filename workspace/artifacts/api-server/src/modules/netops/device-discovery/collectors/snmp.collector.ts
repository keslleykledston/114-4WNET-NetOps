import type { Device } from "@workspace/db";
import { snmpReadonlyAdapter } from "../../adapters/snmp-readonly-adapter.js";
import { normalizeBgpPeer } from "../../bgp/bgp-normalizer.js";
import type { NetopsInterface } from "../../types.js";
import type { CollectorOutput } from "../discovery.types.js";
import { emptyL2vpnSummary } from "../normalizers/l2vpn.normalizer.js";

export async function collectDiscoverySnmp(device: Device): Promise<CollectorOutput> {
  const result = await snmpReadonlyAdapter.collect({ device });
  const payload = "payload" in result ? result.payload : undefined;

  return {
    source: "snmp",
    evidenceSource: "snmp",
    success: Boolean(result.executed && payload?.success),
    rawOutputs: [{
      oidGroup: "if-mib,bgp4-mib",
      output: JSON.stringify({
        interfaces: payload?.interfaces.length ?? 0,
        bgpPeers: payload?.bgpPeers.length ?? 0,
        diagnostics: payload?.oidDiagnostics ?? {},
      }),
      error: payload?.errorMessage ?? undefined,
    }],
    interfaces: (payload?.interfaces ?? []).map((item): NetopsInterface => ({
      name: item.name,
      description: item.description,
      alias: item.alias,
      rawDescr: item.rawDescr,
      adminStatus: item.adminStatus === "up" || item.adminStatus === "down" ? item.adminStatus : "unknown",
      operStatus: item.operStatus === "up" || item.operStatus === "down" ? item.operStatus : "unknown",
      ipv4: [],
      ipv6: [],
      vlan: null,
      vrf: null,
      source: "snmp",
      ifIndex: item.ifIndex,
    })),
    bgpPeers: (payload?.bgpPeers ?? []).map((item) => normalizeBgpPeer({
      peerIp: item.peerIp,
      remoteAs: item.remoteAs,
      state: item.state,
      // `inUpdates`/`outUpdates` são contadores de mensagens BGP, não de prefixos.
      // Os contadores de rotas devem vir do verbose via SSH.
      receivedPrefixes: null,
      advertisedPrefixes: null,
      uptime: item.uptimeSecs != null ? String(item.uptimeSecs) : null,
      source: "snmp",
    })),
    filters: [],
    communities: [],
    vrfs: [],
    l2vpn: emptyL2vpnSummary,
    warnings: [
      ...(payload?.warnings ?? []).map((message) => ({ level: "warning" as const, source: "snmp" as const, message })),
      ...(payload?.errors ?? []).map((message) => ({ level: "error" as const, source: "snmp" as const, message })),
      ...(!result.executed ? [{ level: "warning" as const, source: "snmp" as const, message: result.message }] : []),
    ],
  };
}
