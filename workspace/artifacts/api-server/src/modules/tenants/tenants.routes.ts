import { Router } from "express";
import { requireRole } from "../../lib/auth.js";
import { getRequestSourceIp, logAuditEvent } from "../../lib/audit.js";
import { ConflictError } from "../../lib/db-errors.js";
import {
  createTenant,
  deleteTenant,
  getTenantById,
  listTenantsWithStats,
  updateTenant,
  type TenantStatus,
} from "./tenants.service.js";

const router = Router();

function sendRouteError(res: import("express").Response, error: unknown, fallback: string) {
  if (error instanceof ConflictError) {
    res.status(409).json({ error: error.message });
    return;
  }
  if (error instanceof Error && error.message === "name is required") {
    res.status(400).json({ error: error.message });
    return;
  }
  res.status(500).json({ error: error instanceof Error ? error.message : fallback });
}

function parseStatus(value: unknown): TenantStatus | undefined {
  if (value === "active" || value === "inactive") return value;
  return undefined;
}

router.get("/tenants", requireRole(["admin"]), async (_req, res) => {
  const items = await listTenantsWithStats();
  res.json({ items });
});

router.get("/tenants/:id", requireRole(["admin"]), async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id < 1) {
    res.status(400).json({ error: "Invalid tenant id" });
    return;
  }
  const tenant = await getTenantById(id);
  if (!tenant) {
    res.status(404).json({ error: "Tenant not found" });
    return;
  }
  res.json(tenant);
});

router.post("/tenants", requireRole(["admin"]), async (req, res) => {
  try {
    const body = req.body as Record<string, unknown>;
    const name = typeof body.name === "string" ? body.name : "";
    const slug = typeof body.slug === "string" ? body.slug : undefined;
    const status = parseStatus(body.status);
    const tenant = await createTenant({ name, slug, status });
    await logAuditEvent({
      action: "tenant_create",
      objectType: "tenant",
      objectId: String(tenant.id),
      metadata: { name: tenant.name, slug: tenant.slug, status: tenant.status },
      sourceIp: getRequestSourceIp(req),
    });
    res.status(201).json(tenant);
  } catch (error) {
    sendRouteError(res, error, "Failed to create tenant");
  }
});

router.patch("/tenants/:id", requireRole(["admin"]), async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id < 1) {
      res.status(400).json({ error: "Invalid tenant id" });
      return;
    }
    const body = req.body as Record<string, unknown>;
    const tenant = await updateTenant(id, {
      name: typeof body.name === "string" ? body.name : undefined,
      slug: typeof body.slug === "string" ? body.slug : undefined,
      status: parseStatus(body.status),
    });
    if (!tenant) {
      res.status(404).json({ error: "Tenant not found" });
      return;
    }
    await logAuditEvent({
      action: "tenant_update",
      objectType: "tenant",
      objectId: String(tenant.id),
      metadata: { name: tenant.name, slug: tenant.slug, status: tenant.status },
      sourceIp: getRequestSourceIp(req),
    });
    res.json(tenant);
  } catch (error) {
    sendRouteError(res, error, "Failed to update tenant");
  }
});

router.delete("/tenants/:id", requireRole(["admin"]), async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id < 1) {
      res.status(400).json({ error: "Invalid tenant id" });
      return;
    }
    const deleted = await deleteTenant(id);
    if (!deleted) {
      res.status(404).json({ error: "Tenant not found" });
      return;
    }
    await logAuditEvent({
      action: "tenant_delete",
      objectType: "tenant",
      objectId: String(deleted.id),
      metadata: { name: deleted.name, slug: deleted.slug },
      sourceIp: getRequestSourceIp(req),
    });
    res.status(204).send();
  } catch (error) {
    sendRouteError(res, error, "Failed to delete tenant");
  }
});

export default router;
