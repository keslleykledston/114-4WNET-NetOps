import type { Request, Response } from "express";
import {
  assertDeviceExists,
  enqueueDeviceDiscovery,
  getDiscoveryBgpPeerDetails,
  getDiscoveryRunStatus,
  getLatestDiscoverySnapshot,
  listDiscoveryBgpPeers,
  normalizeDiscoveryRequest,
  queryDiscoveryRoutes,
} from "./discovery.service.js";
import { getRequestSourceIp, logAuditEvent } from "../../../lib/audit.js";

function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function parseDeviceId(value: string | string[] | undefined): number | null {
  const parsed = Number(firstParam(value));
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function peerIp(value: string | string[] | undefined): string {
  return decodeURIComponent(firstParam(value) ?? "").trim();
}

export async function discoverDevice(req: Request, res: Response) {
  const deviceId = parseDeviceId(req.params.id);
  if (!deviceId) { res.status(400).json({ error: "Invalid device ID" }); return; }
  if (!(await assertDeviceExists(deviceId))) { res.status(404).json({ error: "Device not found" }); return; }
  const request = normalizeDiscoveryRequest(req.body);
  enqueueDeviceDiscovery(deviceId, request, { sourceIp: getRequestSourceIp(req) });
  res.status(202).json({
    accepted: true,
    status: "running",
    deviceId,
    message: "Discovery enfileirado. Consulte discovery-status ou aguarde atualização do snapshot.",
  });
}

export async function getDiscoveryStatus(req: Request, res: Response) {
  const deviceId = parseDeviceId(req.params.id);
  if (!deviceId) { res.status(400).json({ error: "Invalid device ID" }); return; }
  res.json(await getDiscoveryRunStatus(deviceId));
}

export async function getDiscoverySnapshot(req: Request, res: Response) {
  const deviceId = parseDeviceId(req.params.id);
  if (!deviceId) { res.status(400).json({ error: "Invalid device ID" }); return; }
  const snapshot = await getLatestDiscoverySnapshot(deviceId);
  if (!snapshot) {
    res.status(404).json({ error: "Nenhum discovery snapshot encontrado. Execute discovery primeiro." });
    return;
  }
  res.json(snapshot);
}

export async function getDiscoveryBgpPeers(req: Request, res: Response) {
  const deviceId = parseDeviceId(req.params.id);
  if (!deviceId) { res.status(400).json({ error: "Invalid device ID" }); return; }
  const peers = await listDiscoveryBgpPeers(deviceId, typeof req.query.category === "string" ? req.query.category : undefined);
  if (!peers) { res.status(404).json({ error: "Nenhum discovery snapshot encontrado. Execute discovery primeiro." }); return; }
  res.json(peers);
}

export async function getDiscoveryPeerDetails(req: Request, res: Response) {
  const deviceId = parseDeviceId(req.params.id);
  if (!deviceId) { res.status(400).json({ error: "Invalid device ID" }); return; }
  const details = await getDiscoveryBgpPeerDetails(deviceId, peerIp(req.params.peerIp));
  if (!details) { res.status(404).json({ error: "BGP peer details not found" }); return; }
  res.json(details);
}

export async function postDiscoveryRouteQuery(req: Request, res: Response) {
  const deviceId = parseDeviceId(req.params.id);
  if (!deviceId) { res.status(400).json({ error: "Invalid device ID" }); return; }
  const result = await queryDiscoveryRoutes(deviceId, peerIp(req.params.peerIp), req.body);
  if (!result) { res.status(404).json({ error: "BGP peer details not found" }); return; }
  await logAuditEvent({
    action: "route_query",
    objectType: "bgp_peer",
    objectId: `${deviceId}:${peerIp(req.params.peerIp)}`,
    metadata: {
      direction: req.body && typeof req.body === "object" ? (req.body as Record<string, unknown>).direction : undefined,
      routesReturned: result.items.length,
      totalRoutes: result.total,
    },
    sourceIp: getRequestSourceIp(req),
  });
  res.json(result);
}
