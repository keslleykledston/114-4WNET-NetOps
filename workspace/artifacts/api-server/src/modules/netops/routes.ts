import { Router } from "express";
import {
  collectNetopsReadOnly,
  getNetopsBgpCommunities,
  getNetopsBgpDiagnostics,
  getNetopsBgpPeer,
  getNetopsBgpPolicies,
  getLatestNetopsSnmpSnapshot,
  getNetopsCollectionStatus,
  getNetopsSummary,
  listNetopsBgpPeerRoleOverrides,
  listNetopsBgpAdvertisedPrefixes,
  listNetopsBgpPeers,
  listNetopsBgpReceivedPrefixes,
  listNetopsCommunities,
  listNetopsFilters,
  listNetopsInterfaces,
  listNetopsLogs,
  upsertNetopsBgpPeerRoleOverride,
} from "./service.js";
import type { NetopsAddressFamily, NetopsAddressFamilyFilter, NetopsBgpRole, NetopsBgpStateFilter } from "./types.js";

const router = Router();

function parseDeviceId(value: string | undefined): number | null {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function isRole(value: unknown): value is NetopsBgpRole {
  return (
    value === "provider" ||
    value === "customer" ||
    value === "cdn" ||
    value === "ix" ||
    value === "cdn_ix" ||
    value === "ibgp" ||
    value === "unknown"
  );
}

function parseRole(value: unknown): NetopsBgpRole | undefined | null {
  if (value === undefined) return undefined;
  if (isRole(value)) return value;
  return null;
}

function isAddressFamily(value: unknown): value is NetopsAddressFamily {
  return value === "ipv4" || value === "ipv6" || value === "unknown";
}

function parseAddressFamily(value: unknown): NetopsAddressFamilyFilter | undefined | null {
  if (value === undefined) return undefined;
  if (value === "ipv4" || value === "ipv6") return value;
  return null;
}

function parseState(value: unknown): NetopsBgpStateFilter | undefined | null {
  if (value === undefined) return undefined;
  if (
    value === "Established" ||
    value === "Active" ||
    value === "Idle" ||
    value === "Connect" ||
    value === "Unknown" ||
    value === "Down"
  ) return value;
  return null;
}

function parsePeerIp(value: string | undefined): string | null {
  const decoded = decodeURIComponent(value ?? "").trim();
  if (!decoded || decoded.length > 128) return null;
  return decoded;
}

router.get("/netops/devices/:id/summary", async (req, res) => {
  const deviceId = parseDeviceId(req.params.id);
  if (!deviceId) { res.status(400).json({ error: "Invalid device ID" }); return; }

  const summary = await getNetopsSummary(deviceId);
  if (!summary) { res.status(404).json({ error: "Device not found" }); return; }

  res.json(summary);
});

router.get("/netops/devices/:id/interfaces", async (req, res) => {
  const deviceId = parseDeviceId(req.params.id);
  if (!deviceId) { res.status(400).json({ error: "Invalid device ID" }); return; }

  const interfaces = await listNetopsInterfaces(deviceId);
  if (!interfaces) { res.status(404).json({ error: "Device not found" }); return; }

  res.json(interfaces);
});

router.get("/netops/devices/:id/bgp-peers", async (req, res) => {
  const deviceId = parseDeviceId(req.params.id);
  if (!deviceId) { res.status(400).json({ error: "Invalid device ID" }); return; }

  const role = parseRole(req.query.role);
  if (role === null) { res.status(400).json({ error: "Invalid BGP role" }); return; }

  const af = parseAddressFamily(req.query.af);
  if (af === null) { res.status(400).json({ error: "Invalid address family" }); return; }

  const state = parseState(req.query.state);
  if (state === null) { res.status(400).json({ error: "Invalid BGP state" }); return; }

  const peers = await listNetopsBgpPeers(deviceId, { role, af, state });
  if (!peers) { res.status(404).json({ error: "Device not found" }); return; }

  res.json(peers);
});

router.get("/netops/devices/:id/bgp-peer-role-overrides", async (req, res) => {
  const deviceId = parseDeviceId(req.params.id);
  if (!deviceId) { res.status(400).json({ error: "Invalid device ID" }); return; }

  const overrides = await listNetopsBgpPeerRoleOverrides(deviceId);
  if (!overrides) { res.status(404).json({ error: "Device not found" }); return; }

  res.json(overrides);
});

router.post("/netops/devices/:id/collect/read-only", async (req, res) => {
  const deviceId = parseDeviceId(req.params.id);
  if (!deviceId) { res.status(400).json({ error: "Invalid device ID" }); return; }

  const result = await collectNetopsReadOnly(deviceId);
  if (!result) { res.status(404).json({ error: "Device not found" }); return; }

  res.status(202).json(result);
});

router.get("/netops/devices/:id/collection-status", async (req, res) => {
  const deviceId = parseDeviceId(req.params.id);
  if (!deviceId) { res.status(400).json({ error: "Invalid device ID" }); return; }

  const status = await getNetopsCollectionStatus(deviceId);
  if (!status) { res.status(404).json({ error: "Device not found" }); return; }

  res.json(status);
});

router.get("/netops/devices/:id/bgp-peers/:peerIp", async (req, res) => {
  const deviceId = parseDeviceId(req.params.id);
  const peerIp = parsePeerIp(req.params.peerIp);
  if (!deviceId || !peerIp) { res.status(400).json({ error: "Invalid device ID or peer IP" }); return; }

  const peer = await getNetopsBgpPeer(deviceId, peerIp);
  if (peer === null) { res.status(404).json({ error: "Device not found" }); return; }
  if (!peer) { res.status(404).json({ error: "BGP peer not found" }); return; }

  res.json(peer);
});

router.put("/netops/devices/:id/bgp-peers/:peerIp/role", async (req, res) => {
  const deviceId = parseDeviceId(req.params.id);
  const peerIp = parsePeerIp(req.params.peerIp);
  if (!deviceId || !peerIp) { res.status(400).json({ error: "Invalid device ID or peer IP" }); return; }

  const body = req.body as Record<string, unknown>;
  if (!isAddressFamily(body.addressFamily)) {
    res.status(400).json({ error: "Invalid addressFamily" });
    return;
  }
  if (!isRole(body.role)) {
    res.status(400).json({ error: "Invalid role" });
    return;
  }

  const remoteAs = body.remoteAs === null || body.remoteAs === undefined ? null : Number(body.remoteAs);
  if (remoteAs !== null && (!Number.isInteger(remoteAs) || remoteAs < 0)) {
    res.status(400).json({ error: "Invalid remoteAs" });
    return;
  }

  const result = await upsertNetopsBgpPeerRoleOverride(deviceId, peerIp, {
    addressFamily: body.addressFamily,
    remoteAs,
    role: body.role,
    label: typeof body.label === "string" ? body.label : null,
    notes: typeof body.notes === "string" ? body.notes : null,
  });
  if (!result) { res.status(404).json({ error: "Device not found" }); return; }

  res.json(result);
});

router.get("/netops/devices/:id/bgp-peers/:peerIp/received-prefixes", async (req, res) => {
  const deviceId = parseDeviceId(req.params.id);
  const peerIp = parsePeerIp(req.params.peerIp);
  if (!deviceId || !peerIp) { res.status(400).json({ error: "Invalid device ID or peer IP" }); return; }

  const prefixes = await listNetopsBgpReceivedPrefixes(deviceId, peerIp);
  if (!prefixes) { res.status(404).json({ error: "Device not found" }); return; }
  res.json(prefixes);
});

router.get("/netops/devices/:id/bgp-peers/:peerIp/advertised-prefixes", async (req, res) => {
  const deviceId = parseDeviceId(req.params.id);
  const peerIp = parsePeerIp(req.params.peerIp);
  if (!deviceId || !peerIp) { res.status(400).json({ error: "Invalid device ID or peer IP" }); return; }

  const prefixes = await listNetopsBgpAdvertisedPrefixes(deviceId, peerIp);
  if (!prefixes) { res.status(404).json({ error: "Device not found" }); return; }
  res.json(prefixes);
});

router.get("/netops/devices/:id/bgp-peers/:peerIp/policies", async (req, res) => {
  const deviceId = parseDeviceId(req.params.id);
  const peerIp = parsePeerIp(req.params.peerIp);
  if (!deviceId || !peerIp) { res.status(400).json({ error: "Invalid device ID or peer IP" }); return; }

  const policies = await getNetopsBgpPolicies(deviceId, peerIp);
  if (!policies) { res.status(404).json({ error: "Device not found" }); return; }
  res.json(policies);
});

router.get("/netops/devices/:id/bgp-peers/:peerIp/communities", async (req, res) => {
  const deviceId = parseDeviceId(req.params.id);
  const peerIp = parsePeerIp(req.params.peerIp);
  if (!deviceId || !peerIp) { res.status(400).json({ error: "Invalid device ID or peer IP" }); return; }

  const communities = await getNetopsBgpCommunities(deviceId, peerIp);
  if (!communities) { res.status(404).json({ error: "Device not found" }); return; }
  res.json(communities);
});

router.get("/netops/devices/:id/bgp-peers/:peerIp/diagnostics", async (req, res) => {
  const deviceId = parseDeviceId(req.params.id);
  const peerIp = parsePeerIp(req.params.peerIp);
  if (!deviceId || !peerIp) { res.status(400).json({ error: "Invalid device ID or peer IP" }); return; }

  const diagnostics = await getNetopsBgpDiagnostics(deviceId, peerIp);
  if (!diagnostics) { res.status(404).json({ error: "Device not found" }); return; }
  res.json(diagnostics);
});

router.get("/netops/devices/:id/filters", async (req, res) => {
  const deviceId = parseDeviceId(req.params.id);
  if (!deviceId) { res.status(400).json({ error: "Invalid device ID" }); return; }

  const filters = await listNetopsFilters(deviceId);
  if (!filters) { res.status(404).json({ error: "Device not found" }); return; }

  res.json(filters);
});

router.get("/netops/devices/:id/communities", async (req, res) => {
  const deviceId = parseDeviceId(req.params.id);
  if (!deviceId) { res.status(400).json({ error: "Invalid device ID" }); return; }

  const communities = await listNetopsCommunities(deviceId);
  if (!communities) { res.status(404).json({ error: "Device not found" }); return; }

  res.json(communities);
});

router.get("/netops/devices/:id/logs", async (req, res) => {
  const deviceId = parseDeviceId(req.params.id);
  if (!deviceId) { res.status(400).json({ error: "Invalid device ID" }); return; }

  const logs = await listNetopsLogs(deviceId);
  if (!logs) { res.status(404).json({ error: "Device not found" }); return; }

  res.json(logs);
});

router.get("/netops/devices/:id/snmp-snapshots/latest", async (req, res) => {
  const deviceId = parseDeviceId(req.params.id);
  if (!deviceId) { res.status(400).json({ error: "Invalid device ID" }); return; }

  const latestSnapshot = await getLatestNetopsSnmpSnapshot(deviceId);
  if (!latestSnapshot) { res.status(404).json({ error: "Device not found" }); return; }

  res.json(latestSnapshot);
});

router.get("/netops/devices/:id/bgp-peers/:peerIp/modal-detail", async (req, res) => {
  const deviceId = parseDeviceId(req.params.id);
  const peerIp = parsePeerIp(req.params.peerIp);
  if (!deviceId || !peerIp) { res.status(400).json({ error: "Invalid device ID or peer IP" }); return; }

  try {
    const peer = await getNetopsBgpPeer(deviceId, peerIp);
    if (!peer) { res.status(404).json({ error: "Peer not found" }); return; }

    res.json({
      layer1: {
        peerIp: peer.peerIp,
        remoteAs: peer.remoteAs,
        description: peer.name || peer.description,
        role: peer.role,
        addressFamily: peer.addressFamily,
        vrf: peer.vrf,
        state: peer.state,
        sessionType: peer.sessionType,
        importPolicy: peer.importPolicy,
        exportPolicy: peer.exportPolicy,
        receivedPrefixes: peer.receivedPrefixes,
        advertisedPrefixes: peer.advertisedPrefixes,
        lastCollected: peer.source === "snapshot" ? new Date().toISOString() : null,
        volumeWarning:
          (peer.receivedPrefixes && peer.receivedPrefixes > 5000) ||
          (peer.advertisedPrefixes && peer.advertisedPrefixes > 5000)
      }
    });
  } catch (err) {
    res.status(500).json({ error: "Failed to load peer details" });
  }
});

export default router;
