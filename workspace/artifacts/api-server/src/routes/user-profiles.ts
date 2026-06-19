import { Router } from "express";
import { eq, isNull } from "drizzle-orm";
import { db, tenantsTable, userAccessProfilesTable, usersTable } from "@workspace/db";
import { getRequestSourceIp, logAuditEvent } from "../lib/audit.js";
import type { UserPermissions } from "../lib/auth.js";

const router = Router();

function parsePermissionsJson(value: unknown): UserPermissions | null {
  return value && typeof value === "object" ? (value as UserPermissions) : null;
}

router.get("/user-profiles", async (req, res) => {
  const tenantIdRaw = req.query.tenant_id;
  const tenantId = tenantIdRaw == null ? null : Number(tenantIdRaw);

  const rows = await db
    .select({
      id: userAccessProfilesTable.id,
      tenantId: userAccessProfilesTable.tenantId,
      tenantName: tenantsTable.name,
      name: userAccessProfilesTable.name,
      description: userAccessProfilesTable.description,
      permissionsJson: userAccessProfilesTable.permissionsJson,
      isDefault: userAccessProfilesTable.isDefault,
      createdAt: userAccessProfilesTable.createdAt,
      updatedAt: userAccessProfilesTable.updatedAt,
    })
    .from(userAccessProfilesTable)
    .leftJoin(tenantsTable, eq(userAccessProfilesTable.tenantId, tenantsTable.id))
    .orderBy(userAccessProfilesTable.tenantId, userAccessProfilesTable.name);

  const filteredRows = tenantId !== null && tenantId > 0
    ? rows.filter((row) => row.tenantId === tenantId)
    : rows;

  res.json({
    items: filteredRows.map((row) => ({
      ...row,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    })),
  });
});

router.post("/user-profiles", async (req, res) => {
  const body = req.body && typeof req.body === "object" ? req.body as Record<string, unknown> : {};
  const tenantIdRaw = Number(body.tenantId);
  const tenantId = Number.isInteger(tenantIdRaw) && tenantIdRaw > 0 ? tenantIdRaw : null;
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const description = typeof body.description === "string" ? body.description.trim() : null;
  const permissionsJson = parsePermissionsJson(body.permissionsJson);
  const isDefault = body.isDefault === true;

  if (!name || !permissionsJson) {
    res.status(400).json({ error: "name and permissionsJson are required" });
    return;
  }

  if (isDefault) {
    await db.update(userAccessProfilesTable)
      .set({ isDefault: false, updatedAt: new Date() })
      .where(tenantId === null ? isNull(userAccessProfilesTable.tenantId) : eq(userAccessProfilesTable.tenantId, tenantId));
  }

  const [created] = await db.insert(userAccessProfilesTable).values({
    tenantId,
    name,
    description,
    permissionsJson,
    isDefault,
    updatedAt: new Date(),
  }).returning();

  await logAuditEvent({
    action: "user_profile_create",
    objectType: "user_access_profile",
    objectId: String(created.id),
    metadata: { tenant_id: tenantId, name: created.name, is_default: created.isDefault },
    sourceIp: getRequestSourceIp(req),
  });

  res.status(201).json({
    ...created,
    createdAt: created.createdAt.toISOString(),
    updatedAt: created.updatedAt.toISOString(),
  });
});

router.patch("/user-profiles/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    res.status(400).json({ error: "Invalid ID" });
    return;
  }

  const body = req.body && typeof req.body === "object" ? req.body as Record<string, unknown> : {};
  const updateData: Record<string, unknown> = { updatedAt: new Date() };
  if (typeof body.name === "string") updateData.name = body.name.trim();
  if (typeof body.description === "string") updateData.description = body.description.trim();
  if (body.description === null) updateData.description = null;
  if (parsePermissionsJson(body.permissionsJson)) updateData.permissionsJson = body.permissionsJson as UserPermissions;
  if (body.isDefault === true || body.isDefault === false) updateData.isDefault = body.isDefault;
  if (body.tenantId === null) updateData.tenantId = null;
  const tenantIdRaw = Number(body.tenantId);
  if (Number.isInteger(tenantIdRaw) && tenantIdRaw > 0) updateData.tenantId = tenantIdRaw;

  const [existing] = await db.select().from(userAccessProfilesTable).where(eq(userAccessProfilesTable.id, id)).limit(1);
  if (!existing) {
    res.status(404).json({ error: "Not found" });
    return;
  }

  if (updateData.isDefault === true) {
    const targetTenantId = updateData.tenantId === undefined ? existing.tenantId : updateData.tenantId;
    await db.update(userAccessProfilesTable)
      .set({ isDefault: false, updatedAt: new Date() })
      .where(targetTenantId == null ? isNull(userAccessProfilesTable.tenantId) : eq(userAccessProfilesTable.tenantId, Number(targetTenantId)));
  }

  const [updated] = await db.update(userAccessProfilesTable).set(updateData).where(eq(userAccessProfilesTable.id, id)).returning();

  await logAuditEvent({
    action: "user_profile_update",
    objectType: "user_access_profile",
    objectId: String(updated.id),
    metadata: { tenant_id: updated.tenantId, name: updated.name, is_default: updated.isDefault },
    sourceIp: getRequestSourceIp(req),
  });

  res.json({
    ...updated,
    createdAt: updated.createdAt.toISOString(),
    updatedAt: updated.updatedAt.toISOString(),
  });
});

router.delete("/user-profiles/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    res.status(400).json({ error: "Invalid ID" });
    return;
  }

  const [existing] = await db.select().from(userAccessProfilesTable).where(eq(userAccessProfilesTable.id, id)).limit(1);
  if (!existing) {
    res.status(404).json({ error: "Not found" });
    return;
  }

  await db.update(usersTable).set({ profileId: null, updatedAt: new Date() }).where(eq(usersTable.profileId, id));
  await db.delete(userAccessProfilesTable).where(eq(userAccessProfilesTable.id, id));

  await logAuditEvent({
    action: "user_profile_delete",
    objectType: "user_access_profile",
    objectId: String(id),
    metadata: { tenant_id: existing.tenantId, name: existing.name },
    sourceIp: getRequestSourceIp(req),
  });

  res.status(204).end();
});

export default router;
