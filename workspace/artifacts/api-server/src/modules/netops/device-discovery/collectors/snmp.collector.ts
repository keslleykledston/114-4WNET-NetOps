import type { Device } from "@workspace/db";
import { deviceUsesConnector } from "../../../connectors/connector-execution.service.js";
import { collectSnmpReadonlyViaConnector } from "../../../connectors/connector-snmp-collect.js";
import { snmpReadonlyAdapter } from "../../adapters/snmp-readonly-adapter.js";
import { collectSnmpReadonly, isNetopsSnmpRealEnabled } from "../../snmp/collect.js";
import { normalizeBgpPeer } from "../../bgp/bgp-normalizer.js";
import type { NetopsInterface } from "../../types.js";
import type { CollectorOutput } from "../discovery.types.js";
import { emptyL2vpnSummary } from "../normalizers/l2vpn.normalizer.js";

export async function collectDiscoverySnmp(device: Device): Promise<CollectorOutput> {
  const community = device.snmpCommunity?.trim();
  if (!community) {
    return {
      source: "snmp",
      evidenceSource: "snmp",
      success: false,
      rawOutputs: [{ oidGroup: "if-mib,bgp4-mib", output: "", error: "snmpCommunity not configured" }],
      interfaces: [],
      bgpPeers: [],
      filters: [],
      communities: [],
      vrfs: [],
      l2vpn: emptyL2vpnSummary,
      warnings: [{ level: "warning", source: "snmp", message: "snmpCommunity ausente no cadastro do dispositivo" }],
    };
  }

  let payload;
  if (deviceUsesConnector(device)) {
    payload = await collectSnmpReadonlyViaConnector(device, community);
  } else if (!isNetopsSnmpRealEnabled()) {
    const blocked = await snmpReadonlyAdapter.collect({ device });
    return {
      source: "snmp",
      evidenceSource: "snmp",
      success: false,
      rawOutputs: [{ oidGroup: "if-mib,bgp4-mib", output: "", error: blocked.message }],
      interfaces: [],
      bgpPeers: [],
      filters: [],
      communities: [],
      vrfs: [],
      l2vpn: emptyL2vpnSummary,
      warnings: [{ level: "warning", source: "snmp", message: blocked.message }],
    };
  } else {
    payload = await collectSnmpReadonly(device, community);
  }

  return {
    source: "snmp",
    evidenceSource: "snmp",
    success: Boolean(payload.success),
    rawOutputs: [{
      oidGroup: "if-mib,bgp4-mib",
      output: JSON.stringify({
        interfaces: payload.interfaces.length,
        bgpPeers: payload.bgpPeers.length,
        diagnostics: payload.oidDiagnostics ?? {},
        mode: deviceUsesConnector(device) ? "connector" : "direct",
      }),
      error: payload.errorMessage ?? undefined,
    }],
    interfaces: payload.interfaces.map((item): NetopsInterface => ({
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
    bgpPeers: payload.bgpPeers.map((item) => normalizeBgpPeer({
      peerIp: item.peerIp,
      remoteAs: item.remoteAs,
      state: item.state,
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
      ...(payload.warnings ?? []).map((message) => ({ level: "warning" as const, source: "snmp" as const, message })),
      ...(payload.errors ?? []).map((message) => ({ level: "error" as const, source: "snmp" as const, message })),
    ],
  };
}
