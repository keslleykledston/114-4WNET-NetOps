import { Router, type Request, type Response } from "express";
import { requirePermission } from "../../lib/auth.js";
import { getRequestSourceIp, logAuditEvent } from "../../lib/audit.js";
import { getRequestContext } from "../../lib/request-context.js";
import { OperationalPilotError } from "./pilot.js";
import {
  collectSnmpFastInterfaces,
  getOperationalInterfaces,
  SnmpCredentialsNotConfiguredError,
  SnmpFastNotEnabledError,
  SnmpFastRateLimitError,
} from "./snmp-fast-interfaces.service.js";

const router = Router();

function parseDeviceId(value: unknown): number | null {
  const id = Number(value);
  return Number.isFinite(id) && id > 0 ? id : null;
}

async function handleSnmpFastCollect(req: Request, res: Response): Promise<void> {
  const deviceId = parseDeviceId(req.body?.deviceId ?? req.body?.device_id ?? req.query.device_id);
  if (!deviceId) {
    res.status(400).json({ error: "device_id required" });
    return;
  }

  const user = getRequestContext()?.user;
  const createdBy = user ? `user:${user.id}` : "api";

  try {
    const result = await collectSnmpFastInterfaces(deviceId, createdBy);
    await logAuditEvent({
      action: "operational_snmp_fast_collect",
      objectType: "device",
      objectId: String(deviceId),
      metadata: {
        jobId: result.jobId,
        interfaceCount: result.interfaceCount,
        status: result.status,
      },
      sourceIp: getRequestSourceIp(req),
    });
    res.status(202).json(result);
  } catch (error) {
    if (error instanceof OperationalPilotError) {
      res.status(error.statusCode).json({ error: error.message, code: "PILOT_DEVICE_NOT_ALLOWED" });
      return;
    }
    if (error instanceof SnmpFastRateLimitError) {
      res.status(429).json({ error: error.message, code: "SNMP_FAST_RATE_LIMIT", retryAfterSec: error.retryAfterSec });
      return;
    }
    if (error instanceof SnmpFastNotEnabledError) {
      res.status(503).json({ error: error.message, code: "SNMP_FAST_DISABLED" });
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
    res.status(500).json({ error: error instanceof Error ? error.message : "SNMP_FAST collection failed" });
  }
}

router.get("/operational/interfaces", requirePermission("devices.read"), async (req, res) => {
  const deviceId = parseDeviceId(req.query.device_id ?? req.query.deviceId);
  if (!deviceId) {
    res.status(400).json({ error: "device_id query parameter required" });
    return;
  }

  try {
    const payload = await getOperationalInterfaces(deviceId);
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
    res.status(500).json({ error: error instanceof Error ? error.message : "Failed to load operational interfaces" });
  }
});

/** Pilot manual collect — spec path */
router.post("/operational/interfaces/collect", requirePermission("devices.read"), handleSnmpFastCollect);

/** Alias kept for H2.1 early implementers */
router.post("/operational/collection/snmp-fast", requirePermission("devices.read"), handleSnmpFastCollect);

export default router;
