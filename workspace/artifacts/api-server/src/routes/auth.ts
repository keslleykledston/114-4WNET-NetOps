import { Router } from "express";
import { eq } from "drizzle-orm";
import { db } from "@workspace/db";
import { usersTable, userSessionsTable } from "@workspace/db";
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
  getDefaultPermissions,
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

router.get("/auth/sessions", requireAuth, async (req, res) => {
  const user = await getSessionUserFromRequest(req);
  if (!user) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }

  const sessions = await db.select().from(userSessionsTable).where(eq(userSessionsTable.userId, user.id));
  const now = new Date();
  const activeSessions = sessions.filter((s) => s.expiresAt > now && !s.revokedAt).map((s) => ({
    id: s.id,
    userId: s.userId,
    expiresAt: s.expiresAt.toISOString(),
    createdAt: s.createdAt.toISOString(),
    revokedAt: s.revokedAt?.toISOString() ?? null,
  }));

  res.json({ sessions: activeSessions });
});

router.delete("/auth/sessions/:id", requireAuth, async (req, res) => {
  const sessionId = Number(req.params.id);
  if (!Number.isInteger(sessionId)) {
    res.status(400).json({ error: "Invalid session ID" });
    return;
  }

  const user = await getSessionUserFromRequest(req);
  if (!user) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }

  const [session] = await db.select().from(userSessionsTable).where(eq(userSessionsTable.id, sessionId));
  if (!session) {
    res.status(404).json({ error: "Session not found" });
    return;
  }

  // Allow user to revoke own sessions or admin to revoke any session
  if (session.userId !== user.id && user.role !== "admin") {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  await db.update(userSessionsTable).set({ revokedAt: new Date() }).where(eq(userSessionsTable.id, sessionId));

  await logAuditEvent({
    actorId: user.id,
    action: "session_revoke",
    objectType: "session",
    objectId: String(sessionId),
    metadata: { revokedSessionUserId: session.userId },
    sourceIp: getRequestSourceIp(req),
  });

  res.status(204).end();
});

router.get("/auth/me/permissions", requireAuth, async (req, res) => {
  const user = await getSessionUserFromRequest(req);
  if (!user) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }

  // Fetch full user with permissionsJson
  const [fullUser] = await db.select().from(usersTable).where(eq(usersTable.id, user.id));
  if (!fullUser) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  const effectivePermissions = (fullUser as any).permissionsJson ?? getDefaultPermissions(user.role as any);
  res.json({ effectivePermissions });
});

export default router;
