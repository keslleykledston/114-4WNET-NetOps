import { Router } from "express";
import { getRequestSourceIp, logAuditEvent } from "../lib/audit.js";
import { getSessionUserFromRequest } from "../lib/auth.js";
import {
  createUserProfile,
  deleteUserProfile,
  getNavModuleCatalog,
  listUserProfiles,
  updateUserProfile,
} from "../modules/user-profiles/user-profiles.service.js";
import { sanitizeModulesMap } from "../lib/nav-modules.js";

const router = Router();

async function requireAdmin(req: import("express").Request, res: import("express").Response): Promise<boolean> {
  const user = await getSessionUserFromRequest(req);
  if (!user) {
    res.status(401).json({ error: "Authentication required" });
    return false;
  }
  if (user.role !== "admin") {
    res.status(403).json({ error: "Forbidden" });
    return false;
  }
  return true;
}

router.get("/user-profiles/catalog", async (req, res) => {
  if (!(await requireAdmin(req, res))) return;
  res.json({ items: getNavModuleCatalog() });
});

router.get("/user-profiles", async (req, res) => {
  if (!(await requireAdmin(req, res))) return;
  const items = await listUserProfiles();
  res.json({ items });
});

router.post("/user-profiles", async (req, res) => {
  if (!(await requireAdmin(req, res))) return;
  const body = req.body && typeof req.body === "object" ? req.body as Record<string, unknown> : {};
  const name = typeof body.name === "string" ? body.name : "";
  const description = typeof body.description === "string" ? body.description : undefined;
  const modules = sanitizeModulesMap(body.modules);

  try {
    const created = await createUserProfile({ name, description, modules });
    await logAuditEvent({
      action: "user_profile_create",
      objectType: "user_profile",
      objectId: String(created.id),
      metadata: { name: created.name, slug: created.slug },
      sourceIp: getRequestSourceIp(req),
    });
    res.status(201).json(created);
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : "Failed to create profile" });
  }
});

router.patch("/user-profiles/:id", async (req, res) => {
  if (!(await requireAdmin(req, res))) return;
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    res.status(400).json({ error: "Invalid ID" });
    return;
  }

  const body = req.body && typeof req.body === "object" ? req.body as Record<string, unknown> : {};
  try {
    const updated = await updateUserProfile(id, {
      name: typeof body.name === "string" ? body.name : undefined,
      description: typeof body.description === "string" ? body.description : undefined,
      modules: body.modules !== undefined ? sanitizeModulesMap(body.modules) : undefined,
    });
    await logAuditEvent({
      action: "user_profile_update",
      objectType: "user_profile",
      objectId: String(updated.id),
      metadata: { name: updated.name, slug: updated.slug },
      sourceIp: getRequestSourceIp(req),
    });
    res.json(updated);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to update profile";
    const status = message.includes("not found") ? 404 : 400;
    res.status(status).json({ error: message });
  }
});

router.delete("/user-profiles/:id", async (req, res) => {
  if (!(await requireAdmin(req, res))) return;
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    res.status(400).json({ error: "Invalid ID" });
    return;
  }

  try {
    await deleteUserProfile(id);
    await logAuditEvent({
      action: "user_profile_delete",
      objectType: "user_profile",
      objectId: String(id),
      metadata: {},
      sourceIp: getRequestSourceIp(req),
    });
    res.status(204).end();
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to delete profile";
    const status = message.includes("not found") ? 404 : 400;
    res.status(status).json({ error: message });
  }
});

export default router;
