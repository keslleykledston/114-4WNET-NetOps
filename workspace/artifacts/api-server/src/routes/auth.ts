import { Router } from "express";
import { eq } from "drizzle-orm";
import { db } from "@workspace/db";
import { usersTable } from "@workspace/db";
import { getRequestSourceIp, logAuditEvent } from "../lib/audit.js";
import {
  AUTH_COOKIE_NAME,
  clearAuthCookie,
  createSessionForUser,
  findUserByEmail,
  publicAuthUser,
  requireAuth,
  getSessionUserFromRequest,
  revokeSessionToken,
  serializeUser,
  setAuthCookie,
  verifyPassword,
} from "../lib/auth.js";

const router = Router();

router.post("/auth/login", async (req, res) => {
  const body = req.body && typeof req.body === "object" ? req.body as Record<string, unknown> : {};
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const password = typeof body.password === "string" ? body.password : "";

  if (!email || !password) {
    res.status(400).json({ error: "Email and password are required" });
    return;
  }

  const user = await findUserByEmail(email);
  if (!user || !user.enabled || !verifyPassword(password, user.passwordHash)) {
    await logAuditEvent({
      action: "auth_login_failed",
      objectType: "auth",
      objectId: email,
      metadata: { email, success: false },
      sourceIp: getRequestSourceIp(req),
    });
    res.status(401).json({ error: "Invalid credentials" });
    return;
  }

  const { token, expiresAt } = await createSessionForUser(user.id);
  await db.update(usersTable).set({
    lastLoginAt: new Date(),
    updatedAt: new Date(),
  }).where(eq(usersTable.id, user.id));
  setAuthCookie(res, token, expiresAt);

  const publicUser = publicAuthUser(serializeUser(user));
  await logAuditEvent({
    actorId: user.id,
    action: "auth_login",
    objectType: "auth",
    objectId: String(user.id),
    metadata: { email: user.email, role: user.role, success: true },
    sourceIp: getRequestSourceIp(req),
  });

  res.json({ user: publicUser, token });
});

router.get("/auth/me", requireAuth, async (req, res) => {
  const user = await getSessionUserFromRequest(req);
  if (!user) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }
  res.json({ user });
});

router.post("/auth/logout", requireAuth, async (req, res) => {
  const token = typeof req.cookies?.[AUTH_COOKIE_NAME] === "string"
    ? String(req.cookies[AUTH_COOKIE_NAME])
    : req.headers.authorization?.startsWith("Bearer ")
      ? req.headers.authorization.slice("Bearer ".length).trim()
      : null;

  if (token) {
    await revokeSessionToken(token);
  }

  clearAuthCookie(res);

  await logAuditEvent({
    actorId: (await getSessionUserFromRequest(req))?.id ?? null,
    action: "auth_logout",
    objectType: "auth",
    objectId: String((await getSessionUserFromRequest(req))?.id ?? "unknown"),
    metadata: { email: (await getSessionUserFromRequest(req))?.email ?? null, role: (await getSessionUserFromRequest(req))?.role ?? null },
    sourceIp: getRequestSourceIp(req),
  });

  res.status(204).end();
});

export default router;
