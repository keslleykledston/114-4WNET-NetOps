import type { Request, Response } from "express";
import {
  createBgpAuthorizedPrefix,
  createBgpCustomer,
  createBgpCustomerConnection,
  createBgpExitCommunityAction,
  createBgpExitPoint,
  deleteBgpAuthorizedPrefix,
  deleteBgpCustomer,
  deleteBgpCustomerConnection,
  deleteBgpExitCommunityAction,
  deleteBgpExitPoint,
  getCustomerAnnouncementState,
  reconcileBgpCustomer,
  previewBgpCustomer,
  listBgpAuthorizedPrefixes,
  listBgpCustomerConnections,
  listBgpCustomers,
  listBgpExitCommunityActions,
  listBgpExitPoints,
  listBgpRegistryAuditLog,
  updateBgpAuthorizedPrefix,
  updateBgpCustomer,
  updateBgpCustomerConnection,
  updateBgpExitCommunityAction,
  updateBgpExitPoint,
} from "./bgp-registry.service.js";

function parseId(value: unknown): number | null {
  const parsed = Number(Array.isArray(value) ? value[0] : value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function body(req: Request): Record<string, unknown> {
  return req.body && typeof req.body === "object" ? (req.body as Record<string, unknown>) : {};
}

async function handleList(create: (q?: number | null) => Promise<unknown[]>, req: Request, res: Response, key: string) {
  const q = parseId(req.query[key]);
  res.json(await create(q));
}

async function handleCreate(create: (b: Record<string, unknown>) => Promise<unknown>, req: Request, res: Response) {
  try {
    const created = await create(body(req));
    res.status(201).json(created);
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : "Failed" });
  }
}

async function handleUpdate(update: (id: number, b: Record<string, unknown>) => Promise<unknown | null>, req: Request, res: Response) {
  const id = parseId(req.params.id);
  if (!id) return void res.status(400).json({ error: "Invalid id" });
  try {
    const updated = await update(id, body(req));
    if (!updated) return void res.status(404).json({ error: "Not found" });
    res.json(updated);
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : "Failed" });
  }
}

async function handleDelete(del: (id: number) => Promise<boolean>, req: Request, res: Response) {
  const id = parseId(req.params.id);
  if (!id) return void res.status(400).json({ error: "Invalid id" });
  const ok = await del(id);
  if (!ok) return void res.status(404).json({ error: "Not found" });
  res.status(204).end();
}

export async function getBgpCustomersHandler(_req: Request, res: Response) {
  res.json(await listBgpCustomers());
}
export async function postBgpCustomersHandler(req: Request, res: Response) { return handleCreate(createBgpCustomer, req, res); }
export async function patchBgpCustomersHandler(req: Request, res: Response) { return handleUpdate(updateBgpCustomer, req, res); }
export async function deleteBgpCustomersHandler(req: Request, res: Response) { return handleDelete(deleteBgpCustomer, req, res); }

export async function getBgpCustomerConnectionsHandler(req: Request, res: Response) { return handleList(listBgpCustomerConnections, req, res, "customerId"); }
export async function postBgpCustomerConnectionsHandler(req: Request, res: Response) { return handleCreate(createBgpCustomerConnection, req, res); }
export async function patchBgpCustomerConnectionsHandler(req: Request, res: Response) { return handleUpdate(updateBgpCustomerConnection, req, res); }
export async function deleteBgpCustomerConnectionsHandler(req: Request, res: Response) { return handleDelete(deleteBgpCustomerConnection, req, res); }

export async function getBgpAuthorizedPrefixesHandler(req: Request, res: Response) { return handleList(listBgpAuthorizedPrefixes, req, res, "customerId"); }
export async function postBgpAuthorizedPrefixesHandler(req: Request, res: Response) { return handleCreate(createBgpAuthorizedPrefix, req, res); }
export async function patchBgpAuthorizedPrefixesHandler(req: Request, res: Response) { return handleUpdate(updateBgpAuthorizedPrefix, req, res); }
export async function deleteBgpAuthorizedPrefixesHandler(req: Request, res: Response) { return handleDelete(deleteBgpAuthorizedPrefix, req, res); }

export async function getBgpExitPointsHandler(_req: Request, res: Response) { res.json(await listBgpExitPoints()); }
export async function postBgpExitPointsHandler(req: Request, res: Response) { return handleCreate(createBgpExitPoint, req, res); }
export async function patchBgpExitPointsHandler(req: Request, res: Response) { return handleUpdate(updateBgpExitPoint, req, res); }
export async function deleteBgpExitPointsHandler(req: Request, res: Response) { return handleDelete(deleteBgpExitPoint, req, res); }

export async function getBgpExitCommunityActionsHandler(req: Request, res: Response) { return handleList(listBgpExitCommunityActions, req, res, "exitPointId"); }
export async function postBgpExitCommunityActionsHandler(req: Request, res: Response) { return handleCreate(createBgpExitCommunityAction, req, res); }
export async function patchBgpExitCommunityActionsHandler(req: Request, res: Response) { return handleUpdate(updateBgpExitCommunityAction, req, res); }
export async function deleteBgpExitCommunityActionsHandler(req: Request, res: Response) { return handleDelete(deleteBgpExitCommunityAction, req, res); }

export async function getBgpRegistryAuditLogHandler(req: Request, res: Response) {
  const limit = Math.min(Math.max(Number(req.query.limit ?? 100) || 100, 1), 500);
  res.json(await listBgpRegistryAuditLog(limit));
}

export async function getBgpCustomerAnnouncementStateHandler(req: Request, res: Response) {
  const customerId = parseId(req.params.id);
  if (!customerId) return void res.status(400).json({ error: "Invalid customer id" });
  const state = await getCustomerAnnouncementState(customerId);
  if (!state) return void res.status(404).json({ error: "Customer not found" });
  res.json(state);
}

export async function getBgpCustomerReconcileHandler(req: Request, res: Response) {
  const customerId = parseId(req.params.id);
  if (!customerId) return void res.status(400).json({ error: "Invalid customer id" });
  const state = await reconcileBgpCustomer(customerId);
  if (!state) return void res.status(404).json({ error: "Customer not found" });
  res.json(state);
}

export async function postBgpCustomerPreviewHandler(req: Request, res: Response) {
  const customerId = parseId(req.params.id);
  if (!customerId) return void res.status(400).json({ error: "Invalid customer id" });
  const deviceId = Number.isInteger(Number(req.body?.deviceId)) ? Number(req.body.deviceId) : null;
  const desiredState = typeof req.body?.desiredState === "string" ? req.body.desiredState : "P2";
  const rowIndex = Number.isInteger(Number(req.body?.rowIndex)) ? Number(req.body.rowIndex) : null;
  const exitIndex = Number.isInteger(Number(req.body?.exitIndex)) ? Number(req.body.exitIndex) : null;
  const result = await previewBgpCustomer(customerId, { deviceId, desiredState, rowIndex, exitIndex });
  if (!result) return void res.status(404).json({ error: "Customer not found" });
  if ("error" in result) return void res.status(result.status).json({ error: result.error });
  res.json(result);
}
