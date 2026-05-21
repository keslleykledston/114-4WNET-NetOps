import type { SnmpSnapshot } from "@workspace/db";
import { normalizeBgpPeer, normalizeBgpState } from "../bgp/bgp-normalizer.js";
import {
  emptyBgpPeers,
  emptyCommunities,
  emptyFilters,
  emptyInterfaces,
} from "./mock-adapter.js";
import type {
  NetopsBgpPeer,
  NetopsCommunity,
  NetopsFilter,
  NetopsInterface,
  NetopsSnapshotData,
} from "../types.js";

function parseJsonArray(value: string | null): unknown[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function text(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function decodeHexAscii(value: string): string {
  if (!/^[0-9a-f]+$/i.test(value) || value.length % 2 !== 0) return value;

  const decoded = Buffer.from(value, "hex").toString("utf8").replace(/\0/g, "").trim();
  if (!decoded || /[^\x20-\x7e]/.test(decoded)) return value;
  if (!decoded.includes(".") && !decoded.includes(":")) return value;

  return decoded;
}

function numberValue(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function stringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => text(item)).filter((item): item is string => Boolean(item));
}

function normalizeStatus(value: unknown): "up" | "down" | "unknown" {
  const normalized = text(value)?.toLowerCase();
  if (normalized === "up") return "up";
  if (normalized === "down") return "down";
  return "unknown";
}

function extractVlan(name: string): number | null {
  const match = name.match(/\.(\d{1,4})$/);
  return match ? Number(match[1]) : null;
}

function normalizeInterfaces(snapshot: SnmpSnapshot): NetopsInterface[] {
  return parseJsonArray(snapshot.interfacesJson).map((item) => {
    const row = asRecord(item);
    const name = text(row["name"]) ?? text(row["description"]) ?? text(row["index"]) ?? "unknown";
    const rowSource = text(row["source"]);
    const source = rowSource === "snmp" ? "snmp" : "snapshot";

    return {
      name,
      description: text(row["description"]) ?? text(row["alias"]),
      adminStatus: normalizeStatus(row["adminStatus"] ?? row["admin_status"]),
      operStatus: normalizeStatus(row["operStatus"] ?? row["oper_status"] ?? row["status"]),
      ipv4: stringArray(row["ipv4"] ?? row["ipv4Addresses"] ?? row["ip_addresses"]),
      ipv6: stringArray(row["ipv6"] ?? row["ipv6Addresses"] ?? row["ipv6_addresses"]),
      vlan: numberValue(row["vlan"]) ?? numberValue(row["ifIndex"]) ?? extractVlan(name),
      vrf: text(row["vrf"]) ?? text(row["vrfName"]) ?? text(row["vrf_name"]),
      source,
    };
  });
}

function normalizeBgpPeers(snapshot: SnmpSnapshot): NetopsBgpPeer[] {
  return parseJsonArray(snapshot.bgpPeersJson).map((item) => {
    const row = asRecord(item);
    const rawPeerIp = text(row["peerIp"]) ?? text(row["peer_ip"]) ?? text(row["remoteAddress"]) ?? text(row["remote_address"]) ?? text(row["peerKey"]) ?? "unknown";
    const peerIp = decodeHexAscii(rawPeerIp);
    const remoteAs = numberValue(row["remoteAs"] ?? row["remote_as"] ?? row["peer_as"] ?? row["asn"]);
    const description = text(row["description"]) ?? text(row["name"]) ?? text(row["peerName"]) ?? text(row["peer_name"]);
    const name = text(row["name"]) ?? text(row["peerName"]) ?? text(row["peer_name"]);
    const importPolicy = text(row["importPolicy"]) ?? text(row["route_policy_import"]);
    const exportPolicy = text(row["exportPolicy"]) ?? text(row["route_policy_export"]);

    const rowSource = text(row["source"]);
    const source = rowSource === "snmp" ? "snmp" : "snapshot";
    const uptimeSecs = numberValue(row["uptimeSecs"] ?? row["uptime_secs"]);

    return normalizeBgpPeer({
      peerIp,
      remoteAs,
      description,
      name,
      localAs: numberValue(row["localAs"] ?? row["local_as"]),
      state: normalizeBgpState(text(row["state"] ?? row["status"])),
      vrf: text(row["vrf"]) ?? text(row["vrfName"]) ?? text(row["vrf_name"]),
      importPolicy,
      exportPolicy,
      receivedPrefixes: numberValue(row["receivedPrefixes"] ?? row["received_prefixes"] ?? row["inUpdates"]),
      advertisedPrefixes: numberValue(row["advertisedPrefixes"] ?? row["advertised_prefixes"] ?? row["outUpdates"]),
      activePrefixes: numberValue(row["activePrefixes"] ?? row["active_prefixes"]),
      uptime: text(row["uptime"]) ?? (uptimeSecs != null ? String(uptimeSecs) : null),
      source,
    });
  });
}

export function snapshotToNetopsData(snapshot: SnmpSnapshot | null): NetopsSnapshotData {
  if (!snapshot) {
    return {
      snapshot: null,
      interfaces: emptyInterfaces(),
      bgpPeers: emptyBgpPeers(),
      filters: emptyFilters(),
      communities: emptyCommunities(),
    };
  }

  const filters: NetopsFilter[] = emptyFilters();
  const communities: NetopsCommunity[] = emptyCommunities();

  return {
    snapshot,
    interfaces: normalizeInterfaces(snapshot),
    bgpPeers: normalizeBgpPeers(snapshot),
    filters,
    communities,
  };
}
