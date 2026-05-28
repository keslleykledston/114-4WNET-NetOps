import type { Request, Response } from "express";
import { db, devicesTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import {
  createL2DiscoveryRunId,
  getL2DiscoveryJob,
  getL2Circuit,
  listL2Circuits,
  runL2DiscoveryJob,
  startL2DiscoveryJob,
} from "./l2circuits.service.js";
import {
  L2_OPERATIONAL_REFRESH_DISABLED,
  L2_OPERATIONAL_SNMP_DISABLED,
  L2OperationalRefreshDisabledError,
  L2OperationalSnmpDisabledError,
  OperationalPilotError,
  SnmpCredentialsNotConfiguredError,
  getL2DeviceOperationalMeta,
  runL2OperationalRefresh,
} from "./operational-refresh/l2-operational-refresh.service.js";
import {
  DEVICE_CREDENTIALS_NOT_CONFIGURED,
  L2DeviceCredentialsError,
  resolveDeviceSshConfig,
} from "./device-ssh-config.js";
import type { L2CircuitListFilter } from "./l2circuits.types.js";

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
    const [device] = await db.select().from(devicesTable).where(eq(devicesTable.id, deviceId));
    if (!device) {
      res.status(404).json({ error: "Device not found" });
      return;
    }

    let sshConfig;
    try {
      sshConfig = resolveDeviceSshConfig(device);
    } catch (error) {
      if (error instanceof L2DeviceCredentialsError) {
        res.status(422).json({
          error: DEVICE_CREDENTIALS_NOT_CONFIGURED,
          message: error.message,
        });
        return;
      }
      throw error;
    }

    const runId = createL2DiscoveryRunId(deviceId);
    const { startedAt } = await startL2DiscoveryJob(deviceId, runId);

    res.status(202).json({
      run_id: runId,
      device_id: deviceId,
      status: "running",
      started_at: startedAt.toISOString(),
    });

    runL2DiscoveryJob(deviceId, runId, sshConfig).catch((error) => {
      console.error(`L2 circuit discovery failed for device ${deviceId} run ${runId}:`, error instanceof Error ? error.message : error);
    });
  } catch (error) {
    console.error("Discovery error:", error instanceof Error ? error.message : error);
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
    console.error("Job lookup error:", error instanceof Error ? error.message : error);
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
      filter.circuitType = String(req.query.circuit_type) as L2CircuitListFilter["circuitType"];
    }

    if (req.query.vc_id) {
      filter.vcId = String(req.query.vc_id);
    }

    if (req.query.vsi_name) {
      filter.vsiName = String(req.query.vsi_name);
    }

    const circuits = await listL2Circuits(filter);
    const payload: {
      circuits: typeof circuits;
      total: number;
      operational?: Awaited<ReturnType<typeof getL2DeviceOperationalMeta>>;
    } = {
      circuits,
      total: circuits.length,
    };
    if (filter.deviceId) {
      payload.operational = (await getL2DeviceOperationalMeta(filter.deviceId)) ?? undefined;
    }
    res.json(payload);
  } catch (error) {
    console.error("List error:", error instanceof Error ? error.message : error);
    res.status(500).json({
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
}

export async function refreshL2CircuitsHandler(req: Request, res: Response) {
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
    const result = await runL2OperationalRefresh(deviceId);
    res.json(result);
  } catch (error) {
    if (error instanceof L2OperationalRefreshDisabledError) {
      res.status(503).json({ error: error.message, code: L2_OPERATIONAL_REFRESH_DISABLED });
      return;
    }
    if (error instanceof L2OperationalSnmpDisabledError) {
      res.status(503).json({ error: error.message, code: L2_OPERATIONAL_SNMP_DISABLED });
      return;
    }
    if (error instanceof OperationalPilotError) {
      res.status(403).json({ error: error.message });
      return;
    }
    if (error instanceof SnmpCredentialsNotConfiguredError) {
      res.status(422).json({ error: error.message });
      return;
    }
    if (error instanceof L2DeviceCredentialsError) {
      res.status(422).json({ error: DEVICE_CREDENTIALS_NOT_CONFIGURED, message: error.message });
      return;
    }
    if (error instanceof Error && error.message === "Device not found") {
      res.status(404).json({ error: error.message });
      return;
    }
    if (error instanceof Error && error.message.includes("No L2 circuits stored")) {
      res.status(404).json({ error: error.message });
      return;
    }
    console.error("L2 operational refresh error:", error instanceof Error ? error.message : error);
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
    console.error("Get circuit error:", error instanceof Error ? error.message : error);
    res.status(500).json({
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
}
