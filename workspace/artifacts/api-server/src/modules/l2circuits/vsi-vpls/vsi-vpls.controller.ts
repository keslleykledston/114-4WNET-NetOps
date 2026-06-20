import type { Request, Response } from "express";
import {
  getVsiVplsServiceAlarms,
  getVsiVplsServiceConfigs,
  getVsiVplsServiceDetail,
  getVsiVplsServiceHistory,
  getVsiVplsServiceMembers,
  listVsiVplsServices,
  runVsiVplsDiscoverySnapshot,
} from "./vsi-vpls.service.js";
import type { VsiVplsListFilter } from "./vsi-vpls.types.js";

function parseNumber(value: unknown): number | undefined {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
}

function parseBoolean(value: unknown): boolean | undefined {
  if (value === undefined) return undefined;
  if (value === "true" || value === true) return true;
  if (value === "false" || value === false) return false;
  return undefined;
}

function parseDateString(value: unknown): string | undefined {
  if (typeof value !== "string" || !value.trim()) return undefined;
  return value;
}

export async function listVsiVplsHandler(req: Request, res: Response) {
  const filters: VsiVplsListFilter = {
    tenantId: parseNumber(req.query.tenant_id),
    vsId: typeof req.query.vs_id === "string" ? req.query.vs_id : undefined,
    name: typeof req.query.name === "string" ? req.query.name : undefined,
    site: typeof req.query.site_id === "string" ? req.query.site_id : undefined,
    deviceId: parseNumber(req.query.device_id),
    status: typeof req.query.status === "string" ? (req.query.status as VsiVplsListFilter["status"]) : undefined,
    hasAlarm: parseBoolean(req.query.has_alarm),
    hasDivergence: parseBoolean(req.query.has_divergence),
    lastCollectedFrom: parseDateString(req.query.last_collected_from),
    lastCollectedTo: parseDateString(req.query.last_collected_to),
  };

  try {
    const result = await listVsiVplsServices(filters);
    res.json(result);
  } catch (error) {
    console.error("VSI/VPLS list error:", error instanceof Error ? error.message : error);
    res.status(500).json({ error: error instanceof Error ? error.message : "Unknown error" });
  }
}

export async function getVsiVplsDetailHandler(req: Request, res: Response) {
  const id = typeof req.params.id === "string" ? req.params.id.trim() : "";
  if (!id) {
    res.status(400).json({ error: "Missing id" });
    return;
  }

  try {
    const detail = await getVsiVplsServiceDetail(id);
    if (!detail) {
      res.status(404).json({ error: "VSI/VPLS not found" });
      return;
    }
    res.json(detail);
  } catch (error) {
    console.error("VSI/VPLS detail error:", error instanceof Error ? error.message : error);
    res.status(500).json({ error: error instanceof Error ? error.message : "Unknown error" });
  }
}

export async function getVsiVplsMembersHandler(req: Request, res: Response) {
  const id = typeof req.params.id === "string" ? req.params.id.trim() : "";
  const members = await getVsiVplsServiceMembers(id);
  res.json({ members });
}

export async function getVsiVplsConfigsHandler(req: Request, res: Response) {
  const id = typeof req.params.id === "string" ? req.params.id.trim() : "";
  const configs = await getVsiVplsServiceConfigs(id);
  res.json({ configs_metadata: configs });
}

export async function getVsiVplsAlarmsHandler(req: Request, res: Response) {
  const id = typeof req.params.id === "string" ? req.params.id.trim() : "";
  const alarms = await getVsiVplsServiceAlarms(id);
  res.json({ alarms });
}

export async function getVsiVplsHistoryHandler(req: Request, res: Response) {
  const id = typeof req.params.id === "string" ? req.params.id.trim() : "";
  const history = await getVsiVplsServiceHistory(id);
  res.json({ history_summary: history });
}

export async function runVsiVplsDiscoveryHandler(req: Request, res: Response) {
  const filters: VsiVplsListFilter = {
    tenantId: parseNumber(req.body?.tenant_id ?? req.query.tenant_id),
    vsId: typeof req.body?.vs_id === "string" ? req.body.vs_id : typeof req.query.vs_id === "string" ? req.query.vs_id : undefined,
    name: typeof req.body?.name === "string" ? req.body.name : typeof req.query.name === "string" ? req.query.name : undefined,
    site: typeof req.body?.site_id === "string" ? req.body.site_id : typeof req.query.site_id === "string" ? req.query.site_id : undefined,
    deviceId: parseNumber(req.body?.device_id ?? req.query.device_id),
    status: typeof req.body?.status === "string" ? (req.body.status as VsiVplsListFilter["status"]) : typeof req.query.status === "string" ? (req.query.status as VsiVplsListFilter["status"]) : undefined,
    hasAlarm: parseBoolean(req.body?.has_alarm ?? req.query.has_alarm),
    hasDivergence: parseBoolean(req.body?.has_divergence ?? req.query.has_divergence),
    lastCollectedFrom: parseDateString(req.body?.last_collected_from ?? req.query.last_collected_from),
    lastCollectedTo: parseDateString(req.body?.last_collected_to ?? req.query.last_collected_to),
  };

  try {
    const result = await runVsiVplsDiscoverySnapshot(filters);
    res.status(202).json({
      status: "ok",
      services: result.services.length,
      total: result.total,
      snapshot: result,
    });
  } catch (error) {
    console.error("VSI/VPLS discovery error:", error instanceof Error ? error.message : error);
    res.status(500).json({ error: error instanceof Error ? error.message : "Unknown error" });
  }
}
