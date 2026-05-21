import type { Device } from "@workspace/db";
import {
  collectSnmpReadonly,
  isNetopsSnmpRealEnabled,
} from "../snmp/collect.js";
import type { SnmpReadonlyCollectPayload } from "../snmp/types.js";
import {
  emptyBgpPeers,
  emptyCommunities,
  emptyFilters,
  emptyInterfaces,
} from "./mock-adapter.js";
import type { ReadonlyAdapterContext, ReadonlyCollectionResult, ReadonlySnmpAdapter } from "./adapter-types.js";
import { normalizeBgpPeer } from "../bgp/bgp-normalizer.js";
import type { NetopsBgpPeer, NetopsInterface } from "../types.js";

const FLAG_DISABLED_MESSAGE =
  "Coleta SNMP real desabilitada (NETOPS_SNMP_REAL_ENABLED=false). Ative a flag no ambiente da API para executar GET/WALK read-only.";

function hasSnmpCommunity(device: Device): boolean {
  return Boolean(device.snmpCommunity?.trim());
}

function payloadToInterfaces(payload: SnmpReadonlyCollectPayload): NetopsInterface[] {
  return payload.interfaces.map((iface) => ({
    name: iface.name,
    description: iface.description ?? iface.alias,
    alias: iface.alias,
    rawDescr: iface.rawDescr,
    adminStatus: iface.adminStatus === "up" ? "up" : iface.adminStatus === "down" ? "down" : "unknown",
    operStatus: iface.operStatus === "up" ? "up" : iface.operStatus === "down" ? "down" : "unknown",
    ipv4: [],
    ipv6: [],
    vlan: null,
    vrf: null,
    source: "snmp",
    ifIndex: iface.ifIndex,
  }));
}

function payloadToBgpPeers(payload: SnmpReadonlyCollectPayload): NetopsBgpPeer[] {
  return payload.bgpPeers.map((peer) => normalizeBgpPeer({
    peerIp: peer.peerIp,
    remoteAs: peer.remoteAs,
    state: peer.state,
    uptime: peer.uptimeSecs != null ? String(peer.uptimeSecs) : null,
    source: "snmp",
  }));
}

export class SnmpReadonlyAdapter implements ReadonlySnmpAdapter {
  async collect(context: ReadonlyAdapterContext): Promise<ReadonlyCollectionResult & { payload?: SnmpReadonlyCollectPayload }> {
    const { device } = context;

    if (!isNetopsSnmpRealEnabled()) {
      return {
        deviceId: device.id,
        status: "blocked",
        executed: false,
        message: FLAG_DISABLED_MESSAGE,
        commandChecks: [],
        data: {
          interfaces: emptyInterfaces(),
          bgpPeers: emptyBgpPeers(),
          filters: emptyFilters(),
          communities: emptyCommunities(),
          logs: [{
            level: "INFO",
            scope: "SNMP",
            message: FLAG_DISABLED_MESSAGE,
          }],
        },
      };
    }

    if (!hasSnmpCommunity(device)) {
      return {
        deviceId: device.id,
        status: "blocked",
        executed: false,
        message: "Dispositivo sem comunidade SNMP configurada. Cadastre snmpCommunity antes de coletar.",
        commandChecks: [],
        data: {
          interfaces: emptyInterfaces(),
          bgpPeers: emptyBgpPeers(),
          filters: emptyFilters(),
          communities: emptyCommunities(),
          logs: [{
            level: "WARN",
            scope: "SNMP",
            message: "snmpCommunity ausente no cadastro do dispositivo.",
          }],
        },
      };
    }

    const payload = await collectSnmpReadonly(device, device.snmpCommunity!.trim());
    const status = payload.success ? "ready" : "error";
    const message = payload.success
      ? `SNMP read-only OK: ${payload.interfaces.length} interfaces, ${payload.bgpPeers.length} BGP peers (IPv4 BGP4-MIB).`
      : payload.errorMessage ?? "SNMP read-only finished with errors.";

    return {
      deviceId: device.id,
      status,
      executed: true,
      message,
      commandChecks: [],
      payload,
      data: {
        interfaces: payloadToInterfaces(payload),
        bgpPeers: payloadToBgpPeers(payload),
        filters: emptyFilters(),
        communities: emptyCommunities(),
        logs: [
          {
            level: payload.success ? "SUCCESS" : "ERROR",
            scope: "SNMP",
            message,
          },
          ...payload.errors.map((entry) => ({
            level: "WARN" as const,
            scope: "SNMP" as const,
            message: entry,
          })),
        ],
      },
    };
  }
}

export const snmpReadonlyAdapter = new SnmpReadonlyAdapter();
