import type { Request, Response } from "express";
import { db, devicesTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { discoverL2Circuits, getL2DiscoveryJob, listL2Circuits, getL2Circuit } from "./l2circuits.service.js";
import type { DiscoverL2CircuitsRequest, L2CircuitListFilter } from "./l2circuits.types.js";

function parseDeviceId(value: string | undefined): number | null {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

export async function discoverL2CircuitsHandler(req: Request, res: Response) {
  const body = req.body as unknown;

  if (!body || typeof body !== "object" || !("device_id" in body)) {
    res.status(400).json({ error: "Missing or invalid device_id in request body" });
    return;
  }

  const deviceId = typeof body.device_id === "number" ? body.device_id : parseDeviceId(String(body.device_id));
  if (!deviceId) {
    res.status(400).json({ error: "Invalid device_id" });
    return;
  }

  try {
    // Check if device exists
    const [device] = await db.select().from(devicesTable).where(eq(devicesTable.id, deviceId));
    if (!device) {
      res.status(404).json({ error: "Device not found" });
      return;
    }

    // Start discovery in background (fire and forget for MVP)
    const sshConfig = {
      host: device.hostname || "",
      port: 22,
      username: "admin",
      password: "",
    };

    const jobPromise = discoverL2Circuits(deviceId, sshConfig);

    // Return job info immediately (async)
    const now = new Date();
    res.status(202).json({
      run_id: `disc-l2-${deviceId}-${Date.now()}`,
      device_id: deviceId,
      status: "running",
      started_at: now.toISOString(),
    });

    // Await in background
    jobPromise.catch((error) => {
      console.error(`L2 circuit discovery failed for device ${deviceId}:`, error);
    });
  } catch (error) {
    console.error("Discovery error:", error);
    res.status(500).json({
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
}

export async function getL2DiscoveryJobHandler(req: Request, res: Response) {
  let runId: string | undefined;
  const paramValue = req.params.runId;
  if (Array.isArray(paramValue)) {
    runId = paramValue[0];
  } else if (paramValue) {
    runId = paramValue;
  }
  runId = runId?.trim();

  if (!runId) {
    res.status(400).json({ error: "Missing runId" });
    return;
  }

  try {
    const job = await getL2DiscoveryJob(runId);
    if (!job) {
      res.status(404).json({ error: "Job not found" });
      return;
    }

    res.json({
      run_id: job.runId,
      device_id: job.deviceId,
      status: job.status,
      started_at: job.startedAt.toISOString(),
      finished_at: job.finishedAt ? job.finishedAt.toISOString() : null,
      circuit_count: job.circuitCount,
      findings_count: job.findingsCount,
      error_message: job.errorMessage,
    });
  } catch (error) {
    console.error("Job lookup error:", error);
    res.status(500).json({
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
}

export async function listL2CircuitsHandler(req: Request, res: Response) {
  try {
    const filter: L2CircuitListFilter = {};

    if (req.query.device_id) {
      const deviceId = parseDeviceId(String(req.query.device_id));
      if (deviceId) filter.deviceId = deviceId;
    }

    if (req.query.circuit_type) {
      filter.circuitType = String(req.query.circuit_type) as any;
    }

    if (req.query.vc_id) {
      filter.vcId = String(req.query.vc_id);
    }

    if (req.query.vsi_name) {
      filter.vsiName = String(req.query.vsi_name);
    }

    const circuits = await listL2Circuits(filter);
    res.json({
      circuits,
      total: circuits.length,
    });
  } catch (error) {
    console.error("List error:", error);
    res.status(500).json({
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
}

export async function getL2CircuitHandler(req: Request, res: Response) {
  let paramId: string | undefined;
  const paramValue = req.params.id;
  if (Array.isArray(paramValue)) {
    paramId = paramValue[0];
  } else {
    paramId = paramValue;
  }

  const circuitId = parseDeviceId(paramId);
  if (!circuitId) {
    res.status(400).json({ error: "Invalid circuit ID" });
    return;
  }

  try {
    const circuit = await getL2Circuit(circuitId);
    if (!circuit) {
      res.status(404).json({ error: "Circuit not found" });
      return;
    }

    res.json(circuit);
  } catch (error) {
    console.error("Get circuit error:", error);
    res.status(500).json({
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
}
