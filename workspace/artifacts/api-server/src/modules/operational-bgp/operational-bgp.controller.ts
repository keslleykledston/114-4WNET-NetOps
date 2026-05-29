import type { Request, Response } from "express";
import { getRequestSourceIp, logAuditEvent } from "../../lib/audit.js";
import { getRequestContext } from "../../lib/request-context.js";
import { OperationalBgpPreflightError, SnmpFastBgpDisabledError } from "./operational-bgp.errors.js";
import {
  collectOperationalBgpPeers,
  getOperationalBgpPeers,
  getOperationalBgpSummary,
  OperationalPilotError,
  SnmpCredentialsNotConfiguredError,
} from "./operational-bgp.service.js";

export function parseOperationalBgpDeviceId(value: unknown): number | null {
  const id = Number(value);
  return Number.isFinite(id) && id > 0 ? id : null;
}

export async function postOperationalBgpCollectHandler(req: Request, res: Response): Promise<void> {
  const deviceId = parseOperationalBgpDeviceId(req.body?.deviceId ?? req.body?.device_id ?? req.query.device_id);
  if (!deviceId) {
    res.status(400).json({ error: "device_id required" });
    return;
  }

  const user = getRequestContext()?.user;
  const createdBy = user ? `user:${user.id}` : "api";

  try {
    const result = await collectOperationalBgpPeers(deviceId, createdBy);
    await logAuditEvent({
      action: "operational_snmp_fast_bgp_collect",
      objectType: "device",
      objectId: String(deviceId),
      metadata: {
        jobId: result.jobId,
        peerCount: result.peerCount,
        status: result.status,
        stub: result.stub,
      },
      sourceIp: getRequestSourceIp(req),
    });
    res.status(202).json(result);
  } catch (error) {
    if (error instanceof OperationalPilotError) {
      res.status(error.statusCode).json({ error: error.message, code: "PILOT_DEVICE_NOT_ALLOWED" });
      return;
    }
    if (error instanceof SnmpFastBgpDisabledError) {
      res.status(503).json({ error: error.code, message: error.message });
      return;
    }
    if (error instanceof SnmpCredentialsNotConfiguredError) {
      res.status(error.statusCode).json({
        error: SnmpCredentialsNotConfiguredError.code,
        message: error.message,
      });
      return;
    }
    if (error instanceof Error && error.message === "Device not found") {
      res.status(404).json({ error: error.message });
      return;
    }
    res.status(500).json({ error: error instanceof Error ? error.message : "SNMP_FAST BGP collection failed" });
  }
}

export async function getOperationalBgpHandler(req: Request, res: Response): Promise<void> {
  const deviceId = parseOperationalBgpDeviceId(req.query.device_id ?? req.query.deviceId);
  if (!deviceId) {
    res.status(400).json({ error: "device_id query parameter required" });
    return;
  }

  try {
    const payload = await getOperationalBgpPeers(deviceId);
    if (!payload) {
      res.status(404).json({ error: "Device not found" });
      return;
    }
    res.json(payload);
  } catch (error) {
    if (error instanceof OperationalPilotError) {
      res.status(error.statusCode).json({ error: error.message, code: "PILOT_DEVICE_NOT_ALLOWED" });
      return;
    }
    res.status(500).json({ error: error instanceof Error ? error.message : "Failed to load operational BGP peers" });
  }
}

export async function getOperationalBgpSummaryHandler(req: Request, res: Response): Promise<void> {
  const deviceId = parseOperationalBgpDeviceId(req.query.device_id ?? req.query.deviceId);
  if (!deviceId) {
    res.status(400).json({ error: "device_id query parameter required" });
    return;
  }

  try {
    const payload = await getOperationalBgpSummary(deviceId);
    if (!payload) {
      res.status(404).json({ error: "Device not found" });
      return;
    }
    res.json(payload);
  } catch (error) {
    if (error instanceof OperationalPilotError) {
      res.status(error.statusCode).json({ error: error.message, code: "PILOT_DEVICE_NOT_ALLOWED" });
      return;
    }
    res.status(500).json({ error: error instanceof Error ? error.message : "Failed to load operational BGP summary" });
  }
}
