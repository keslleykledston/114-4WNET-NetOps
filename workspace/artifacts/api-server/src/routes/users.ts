import { Router } from "express";
import { eq } from "drizzle-orm";
import { db } from "@workspace/db";
import { tenantsTable, userAccessProfilesTable, usersTable } from "@workspace/db";
import { getRequestSourceIp, logAuditEvent } from "../lib/audit.js";
import { hashPassword, serializeUser, type UserPermissions } from "../lib/auth.js";

const router = Router();

function toPublicUser(user: {
  id: number;
  tenantId: number | null;
  tenantName?: string | null;
  profileId: number | null;
  profileName?: string | null;
  profileDescription?: string | null;
  profilePermissionsJson?: UserPermissions | null;
  name: string;
  email: string;
  role: string;
  enabled: boolean;
  permissionsJson?: UserPermissions | null;
  lastLoginAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}) {
  return serializeUser(user);
}

router.get("/users", async (_req, res) => {
  const rows = await db
    .select({
      id: usersTable.id,
      tenantId: usersTable.tenantId,
      tenantName: tenantsTable.name,
      profileId: usersTable.profileId,
      profileName: userAccessProfilesTable.name,
      profileDescription: userAccessProfilesTable.description,
      profilePermissionsJson: userAccessProfilesTable.permissionsJson,
      name: usersTable.name,
      email: usersTable.email,
      role: usersTable.role,
      enabled: usersTable.enabled,
      permissionsJson: usersTable.permissionsJson,
      lastLoginAt: usersTable.lastLoginAt,
      createdAt: usersTable.createdAt,
      updatedAt: usersTable.updatedAt,
    })
    .from(usersTable)
    .leftJoin(tenantsTable, eq(usersTable.tenantId, tenantsTable.id))
    .leftJoin(userAccessProfilesTable, eq(usersTable.profileId, userAccessProfilesTable.id))
    .orderBy(usersTable.createdAt);
  res.json({ items: rows.map(toPublicUser) });
});

router.post("/users", async (req, res) => {
  const body = req.body && typeof req.body === "object" ? req.body as Record<string, unknown> : {};
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const password = typeof body.password === "string" ? body.password : "";
  const role = body.role === "admin" || body.role === "operator" ? body.role : "viewer";
  const parsedTenantId = Number(body.tenantId);
  const tenantId = Number.isInteger(parsedTenantId) && parsedTenantId > 0 ? parsedTenantId : null;
  const parsedProfileId = Number(body.profileId);
  const profileId = Number.isInteger(parsedProfileId) && parsedProfileId > 0 ? parsedProfileId : null;
  const enabled = typeof body.enabled === "boolean" ? body.enabled : true;
  const permissionsJson = body.permissionsJson && typeof body.permissionsJson === "object" ? body.permissionsJson as UserPermissions : null;

  if (!name || !email || !password) {
    res.status(400).json({ error: "Name, email and password are required" });
    return;
  }

  if (profileId != null) {
    const [profile] = await db.select().from(userAccessProfilesTable).where(eq(userAccessProfilesTable.id, profileId));
    if (!profile) {
      res.status(400).json({ error: "Invalid profileId" });
      return;
    }
    if (tenantId != null && profile.tenantId != null && profile.tenantId !== tenantId) {
      res.status(400).json({ error: "Profile tenant mismatch" });
      return;
    }
  }

  const [created] = await db.insert(usersTable).values({
    name,
    email,
    passwordHash: hashPassword(password),
    role,
    tenantId,
    profileId,
    enabled,
    permissionsJson,
    updatedAt: new Date(),
  }).returning();

  await logAuditEvent({
    action: "user_create",
    objectType: "user",
    objectId: String(created.id),
    metadata: { name: created.name, email: created.email, role: created.role, enabled: created.enabled },
    sourceIp: getRequestSourceIp(req),
  });

  res.status(201).json(toPublicUser(created));
});

router.patch("/users/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    res.status(400).json({ error: "Invalid ID" });
    return;
  }

  const body = req.body && typeof req.body === "object" ? req.body as Record<string, unknown> : {};
  const updateData: Record<string, unknown> = { updatedAt: new Date() };
  if (typeof body.name === "string") updateData.name = body.name.trim();
  if (typeof body.email === "string") updateData.email = body.email.trim().toLowerCase();
  if (typeof body.password === "string" && body.password.trim()) updateData.passwordHash = hashPassword(body.password);
  if (body.role === "admin" || body.role === "operator" || body.role === "viewer") updateData.role = body.role;
  const parsedUpdateTenantId = Number(body.tenantId);
  if (body.tenantId === null) updateData.tenantId = null;
  if (Number.isInteger(parsedUpdateTenantId) && parsedUpdateTenantId > 0) updateData.tenantId = parsedUpdateTenantId;
  const parsedUpdateProfileId = Number(body.profileId);
  if (body.profileId === null) updateData.profileId = null;
  if (Number.isInteger(parsedUpdateProfileId) && parsedUpdateProfileId > 0) updateData.profileId = parsedUpdateProfileId;
  if (typeof body.enabled === "boolean") updateData.enabled = body.enabled;
  if (body.permissionsJson && typeof body.permissionsJson === "object") updateData.permissionsJson = body.permissionsJson as UserPermissions;
  if (body.permissionsJson === null) updateData.permissionsJson = null;

  if (updateData.profileId != null) {
    const [profile] = await db.select().from(userAccessProfilesTable).where(eq(userAccessProfilesTable.id, Number(updateData.profileId)));
    if (!profile) {
      res.status(400).json({ error: "Invalid profileId" });
      return;
    }
    if (updateData.tenantId != null && profile.tenantId != null && profile.tenantId !== Number(updateData.tenantId)) {
      res.status(400).json({ error: "Profile tenant mismatch" });
      return;
    }
  }

  const [updated] = await db.update(usersTable).set(updateData).where(eq(usersTable.id, id)).returning();
  if (!updated) {
    res.status(404).json({ error: "Not found" });
    return;
  }

  await logAuditEvent({
    action: "user_update",
    objectType: "user",
    objectId: String(updated.id),
    metadata: { name: updated.name, email: updated.email, role: updated.role, enabled: updated.enabled },
    sourceIp: getRequestSourceIp(req),
  });

  res.json(toPublicUser(updated));
});

router.get("/users/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    res.status(400).json({ error: "Invalid ID" });
    return;
  }

  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, id));
  if (!user) {
    res.status(404).json({ error: "Not found" });
    return;
  }

  res.json(toPublicUser(user));
});

router.post("/users/:id/disable", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    res.status(400).json({ error: "Invalid ID" });
    return;
  }

  const [updated] = await db.update(usersTable).set({ enabled: false, updatedAt: new Date() }).where(eq(usersTable.id, id)).returning();
  if (!updated) {
    res.status(404).json({ error: "Not found" });
    return;
  }

  await logAuditEvent({
    action: "user_disable",
    objectType: "user",
    objectId: String(id),
    metadata: { name: updated.name, email: updated.email },
    sourceIp: getRequestSourceIp(req),
  });

  res.json({ message: "User disabled" });
});

router.post("/users/:id/enable", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    res.status(400).json({ error: "Invalid ID" });
    return;
  }

  const [updated] = await db.update(usersTable).set({ enabled: true, updatedAt: new Date() }).where(eq(usersTable.id, id)).returning();
  if (!updated) {
    res.status(404).json({ error: "Not found" });
    return;
  }

  await logAuditEvent({
    action: "user_enable",
    objectType: "user",
    objectId: String(id),
    metadata: { name: updated.name, email: updated.email },
    sourceIp: getRequestSourceIp(req),
  });

  res.json(toPublicUser(updated));
});

router.post("/users/:id/reset-password", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    res.status(400).json({ error: "Invalid ID" });
    return;
  }

  const body = req.body && typeof req.body === "object" ? req.body as Record<string, unknown> : {};
  const newPassword = typeof body.password === "string" ? body.password.trim() : "";

  if (!newPassword || newPassword.length < 8) {
    res.status(400).json({ error: "Password must be at least 8 characters" });
    return;
  }

  const [updated] = await db.update(usersTable).set({ passwordHash: hashPassword(newPassword), updatedAt: new Date() }).where(eq(usersTable.id, id)).returning();
  if (!updated) {
    res.status(404).json({ error: "Not found" });
    return;
  }

  await logAuditEvent({
    action: "user_password_reset",
    objectType: "user",
    objectId: String(id),
    metadata: { email: updated.email },
    sourceIp: getRequestSourceIp(req),
  });

  res.json({ message: "Password reset successfully. User can login with new password." });
});

router.delete("/users/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    res.status(400).json({ error: "Invalid ID" });
    return;
  }

  const [deleted] = await db.select().from(usersTable).where(eq(usersTable.id, id));
  if (!deleted) {
    res.status(404).json({ error: "Not found" });
    return;
  }

  await db.delete(usersTable).where(eq(usersTable.id, id));
  await logAuditEvent({
    action: "user_delete",
    objectType: "user",
    objectId: String(id),
    metadata: { name: deleted.name, email: deleted.email, role: deleted.role },
    sourceIp: getRequestSourceIp(req),
  });

  res.status(204).end();
});

export default router;
