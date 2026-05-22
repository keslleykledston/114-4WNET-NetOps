import type { Request, Response } from "express";
import { getRequestSourceIp } from "../../lib/audit.js";
import {
  getNetBoxStatus,
  listDevices,
  listSimple,
  logNetBoxSyncStarted,
  logNetBoxTestConnection,
  previewDeviceSync,
  syncDevicesReadOnly,
} from "./netbox.service.js";

export async function getStatus(_req: Request, res: Response) {
  res.json(await getNetBoxStatus());
}

export async function postTestConnection(req: Request, res: Response) {
  const result = await logNetBoxTestConnection(getRequestSourceIp(req) ?? "unknown");
  res.json(result);
}

export async function getDevices(_req: Request, res: Response) {
  res.json(await listDevices());
}

export async function getSites(_req: Request, res: Response) {
  res.json(await listSimple("/api/dcim/sites/"));
}

export async function getTenants(_req: Request, res: Response) {
  res.json(await listSimple("/api/tenancy/tenants/"));
}

export async function getDeviceRoles(_req: Request, res: Response) {
  res.json(await listSimple("/api/dcim/device-roles/"));
}

export async function getManufacturers(_req: Request, res: Response) {
  res.json(await listSimple("/api/dcim/manufacturers/"));
}

export async function getPlatforms(_req: Request, res: Response) {
  res.json(await listSimple("/api/dcim/platforms/"));
}

export async function postPreviewSync(_req: Request, res: Response) {
  res.json(await previewDeviceSync());
}

export async function postSyncLocal(req: Request, res: Response) {
  await logNetBoxSyncStarted(getRequestSourceIp(req) ?? "unknown");
  res.json(await syncDevicesReadOnly());
}
