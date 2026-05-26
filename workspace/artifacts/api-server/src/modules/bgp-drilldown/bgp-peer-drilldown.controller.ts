import type { Request, Response } from "express";
import type { BgpPeerDrilldownQuery } from "./bgp-peer-drilldown.types.js";
import { parseDrilldownQueryParams } from "./bgp-peer-drilldown-query.js";
import { getBgpPeerDrilldown, getBgpPeerDrilldownHistory, compareBgpPeerDrilldownHistory } from "./bgp-peer-drilldown.service.js";
import { parseSshDetailRequest } from "./bgp-peer-drilldown-ssh-detail.js";
import { BGP_DRILLDOWN_SSH_DETAIL_DISABLED, getBgpPeerSshDetail } from "./bgp-peer-drilldown-ssh-detail.service.js";

function queryOne(value: unknown): string | undefined {
  if (Array.isArray(value)) return value[0];
  if (value === undefined || value === null) return undefined;
  return String(value);
}

function parseDeviceId(value: unknown): number | null {
  const parsed = Number(queryOne(value));
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function parsePeer(value: unknown): string | null {
  const decoded = decodeURIComponent(queryOne(value) ?? "").trim();
  if (!decoded || decoded.length > 128) return null;
  return decoded;
}

function parseLimit(value: unknown): number {
  const parsed = Number(queryOne(value));
  return Number.isInteger(parsed) && parsed > 0 ? Math.min(parsed, 100) : 20;
}

function parseOptionalId(value: unknown): number | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  const parsed = Number(queryOne(value));
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
}

export function buildDrilldownQuery(req: Request): BgpPeerDrilldownQuery | "invalid_source" | "invalid_id" {
  return parseDrilldownQueryParams(req.query as Record<string, unknown>);
}

export async function getBgpPeerDrilldownHandler(req: Request, res: Response): Promise<void> {
  const deviceId = parseDeviceId(req.params.deviceId as unknown);
  const peer = parsePeer(req.params.peer as unknown);
  if (!deviceId) {
    res.status(400).json({ error: "Invalid device ID" });
    return;
  }
  if (!peer) {
    res.status(400).json({ error: "Invalid peer address or name" });
    return;
  }

  const query = buildDrilldownQuery(req);
  if (query === "invalid_source") {
    res.status(400).json({ error: "Only source=snapshot is supported in this version" });
    return;
  }
  if (query === "invalid_id") {
    res.status(400).json({ error: "Invalid snapshot_id or job_id" });
    return;
  }

  const result = await getBgpPeerDrilldown(deviceId, peer, query);
  if (result === "device_not_found") {
    res.status(404).json({ error: "Device not found" });
    return;
  }
  if (result === "no_config") {
    res.status(422).json({ error: "No snapshot or collected config available for device" });
    return;
  }

  res.json(result);
}

export async function getBgpPeerDrilldownHistoryHandler(req: Request, res: Response): Promise<void> {
  const deviceId = parseDeviceId(req.params.deviceId as unknown);
  const peer = parsePeer(req.params.peer as unknown);
  if (!deviceId) {
    res.status(400).json({ error: "Invalid device ID" });
    return;
  }
  if (!peer) {
    res.status(400).json({ error: "Invalid peer address or name" });
    return;
  }

  const result = await getBgpPeerDrilldownHistory(deviceId, peer, parseLimit(req.query.limit));
  if (result === "device_not_found") {
    res.status(404).json({ error: "Device not found" });
    return;
  }

  res.json({ deviceId, peer, items: result });
}

export async function getBgpPeerDrilldownHistoryCompareHandler(req: Request, res: Response): Promise<void> {
  const deviceId = parseDeviceId(req.params.deviceId as unknown);
  const peer = parsePeer(req.params.peer as unknown);
  if (!deviceId) {
    res.status(400).json({ error: "Invalid device ID" });
    return;
  }
  if (!peer) {
    res.status(400).json({ error: "Invalid peer address or name" });
    return;
  }

  const leftId = parseOptionalId(req.query.left ?? req.query.left_id ?? req.query.leftId);
  const rightId = parseOptionalId(req.query.right ?? req.query.right_id ?? req.query.rightId);
  if (!leftId || !rightId) {
    res.status(400).json({ error: "Query params left and right (snapshot row ids) are required" });
    return;
  }

  const result = await compareBgpPeerDrilldownHistory(deviceId, peer, leftId, rightId);
  if (result === "device_not_found") {
    res.status(404).json({ error: "Device not found" });
    return;
  }
  if (result === "same_snapshot") {
    res.status(400).json({ error: "left and right must be different snapshot ids" });
    return;
  }
  if (result === "snapshot_not_found") {
    res.status(404).json({ error: "One or both history snapshots not found for this peer" });
    return;
  }

  res.json({ deviceId, peer, compare: result });
}

export async function postBgpPeerDrilldownDetailHandler(req: Request, res: Response): Promise<void> {
  const deviceId = parseDeviceId(req.params.deviceId as unknown);
  const peer = parsePeer(req.params.peer as unknown);
  if (!deviceId) {
    res.status(400).json({ error: "Invalid device ID" });
    return;
  }
  if (!peer) {
    res.status(400).json({ error: "Invalid peer address or name" });
    return;
  }

  const body = parseSshDetailRequest(req.body);
  if (!body) {
    res.status(400).json({ error: "Invalid SSH detail request body" });
    return;
  }

  const result = await getBgpPeerSshDetail(deviceId, peer, body);
  if (result === "disabled") {
    res.status(503).json({
      error: BGP_DRILLDOWN_SSH_DETAIL_DISABLED,
      message: "BGP SSH detail is disabled. Set BGP_DRILLDOWN_SSH_DETAIL_ENABLED=true to enable read-only light detail.",
    });
    return;
  }
  if (result === "device_not_found") {
    res.status(404).json({ error: "Device not found" });
    return;
  }
  if (result === "no_config") {
    res.status(422).json({ error: "No snapshot or collected config available for device" });
    return;
  }
  if (result === "no_commands") {
    res.status(422).json({ error: "No allowed SSH detail commands for peer" });
    return;
  }

  res.json(result);
}
