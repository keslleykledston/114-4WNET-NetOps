import type { Request, Response } from "express";
import type { BgpPeerDrilldownQuery } from "./bgp-peer-drilldown.types.js";
import { getBgpPeerDrilldown } from "./bgp-peer-drilldown.service.js";

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

function parseBool(value: unknown, defaultValue: boolean): boolean {
  if (value === undefined || value === null || value === "") return defaultValue;
  const raw = String(value).toLowerCase();
  if (raw === "true" || raw === "1") return true;
  if (raw === "false" || raw === "0") return false;
  return defaultValue;
}

function parseOptionalId(value: unknown): number | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
}

export function buildDrilldownQuery(req: Request): BgpPeerDrilldownQuery | "invalid_source" | "invalid_id" {
  const source = req.query.source === undefined ? "snapshot" : String(req.query.source);
  if (source !== "snapshot") return "invalid_source";

  const snapshotId = parseOptionalId(req.query.snapshot_id ?? req.query.snapshotId);
  const jobId = parseOptionalId(req.query.job_id ?? req.query.jobId);
  if (
    (req.query.snapshot_id !== undefined || req.query.snapshotId !== undefined) && snapshotId === undefined
  ) return "invalid_id";
  if ((req.query.job_id !== undefined || req.query.jobId !== undefined) && jobId === undefined) return "invalid_id";

  return {
    source: "snapshot",
    includePolicies: parseBool(req.query.include_policies ?? req.query.includePolicies, true),
    includePolicyObjects: parseBool(req.query.include_policy_objects ?? req.query.includePolicyObjects, true),
    snapshotId,
    jobId,
  };
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
