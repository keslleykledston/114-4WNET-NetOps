import type { NextFunction, Request, Response } from "express";
import { createHash, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { and, eq, gt, isNull } from "drizzle-orm";
import { db } from "@workspace/db";
import { userSessionsTable, usersTable, type UserRole } from "@workspace/db";
import { env } from "./env.js";
import { setRequestUser } from "./request-context.js";

export const AUTH_COOKIE_NAME = "netops_session";
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 30;

export type AuthUser = {
  id: number;
  name: string;
  email: string;
  role: UserRole;
};

export type PublicUser = AuthUser & {
  enabled: boolean;
  lastLoginAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export function serializeUser(user: {
  id: number;
  name: string;
  email: string;
  role: string;
  enabled: boolean;
  lastLoginAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}): PublicUser {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role as UserRole,
    enabled: user.enabled,
    lastLoginAt: user.lastLoginAt?.toISOString() ?? null,
    createdAt: user.createdAt.toISOString(),
    updatedAt: user.updatedAt.toISOString(),
  };
}

export function publicAuthUser(user: PublicUser): AuthUser {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
  };
}

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const derived = scryptSync(password, salt, 64).toString("hex");
  return `scrypt$${salt}$${derived}`;
}

export function verifyPassword(password: string, hash: string): boolean {
  const [scheme, salt, expected] = hash.split("$");
  if (scheme !== "scrypt" || !salt || !expected) return false;
  const actual = scryptSync(password, salt, 64).toString("hex");
  const actualBuffer = Buffer.from(actual, "hex");
  const expectedBuffer = Buffer.from(expected, "hex");
  if (actualBuffer.length !== expectedBuffer.length) return false;
  return timingSafeEqual(actualBuffer, expectedBuffer);
}

export function createSessionToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashSessionToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function authCookieOptions(expiresAt: Date) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: expiresAt,
  };
}

export function setAuthCookie(res: Response, token: string, expiresAt: Date) {
  res.cookie(AUTH_COOKIE_NAME, token, authCookieOptions(expiresAt));
}

export function clearAuthCookie(res: Response) {
  res.clearCookie(AUTH_COOKIE_NAME, { path: "/" });
}

export async function createSessionForUser(userId: number) {
  const token = createSessionToken();
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  const tokenHash = hashSessionToken(token);

  await db.insert(userSessionsTable).values({
    userId,
    tokenHash,
    expiresAt,
  });

  return { token, expiresAt };
}

export async function revokeSessionToken(token: string) {
  const tokenHash = hashSessionToken(token);
  await db.update(userSessionsTable)
    .set({ revokedAt: new Date() })
    .where(eq(userSessionsTable.tokenHash, tokenHash));
}

export async function findSessionUserByToken(token: string) {
  const tokenHash = hashSessionToken(token);
  const [session] = await db.select({
    sessionId: userSessionsTable.id,
    sessionUserId: userSessionsTable.userId,
    expiresAt: userSessionsTable.expiresAt,
    revokedAt: userSessionsTable.revokedAt,
    tokenHash: userSessionsTable.tokenHash,
    userId: usersTable.id,
    name: usersTable.name,
    email: usersTable.email,
    passwordHash: usersTable.passwordHash,
    role: usersTable.role,
    enabled: usersTable.enabled,
    lastLoginAt: usersTable.lastLoginAt,
    createdAt: usersTable.createdAt,
    updatedAt: usersTable.updatedAt,
  }).from(userSessionsTable).innerJoin(usersTable, eq(userSessionsTable.userId, usersTable.id)).where(
    and(
      eq(userSessionsTable.tokenHash, tokenHash),
      isNull(userSessionsTable.revokedAt),
      gt(userSessionsTable.expiresAt, new Date()),
      eq(usersTable.enabled, true),
    ),
  );

  return session ?? null;
}

export async function getSessionUserFromRequest(req: Request): Promise<PublicUser | null> {
  const bearer = req.headers.authorization?.startsWith("Bearer ")
    ? req.headers.authorization.slice("Bearer ".length).trim()
    : null;
  const cookieToken = typeof req.cookies?.[AUTH_COOKIE_NAME] === "string" ? String(req.cookies[AUTH_COOKIE_NAME]) : null;
  const token = bearer || cookieToken;
  if (!token) return null;
  const session = await findSessionUserByToken(token);
  if (!session) return null;
  const user = serializeUser({
    id: session.userId,
    name: session.name,
    email: session.email,
    role: session.role,
    enabled: session.enabled,
    lastLoginAt: session.lastLoginAt,
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
  });
  setRequestUser(publicAuthUser(user));
  return user;
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  void (async () => {
    const user = await getSessionUserFromRequest(req);
    if (!user) {
      res.status(401).json({ error: "Authentication required" });
      return;
    }
    setRequestUser(publicAuthUser(user));
    next();
  })().catch((error) => {
    res.status(500).json({ error: error instanceof Error ? error.message : "Authentication failed" });
  });
}

const ROLE_ORDER: UserRole[] = ["viewer", "operator", "admin"];

function roleRank(role: UserRole): number {
  return ROLE_ORDER.indexOf(role);
}

export function requireRole(allowed: UserRole[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    void (async () => {
      const user = await getSessionUserFromRequest(req);
      if (!user) {
        res.status(401).json({ error: "Authentication required" });
        return;
      }
      const allowedRank = Math.min(...allowed.map((role) => roleRank(role)));
      if (roleRank(user.role) < allowedRank) {
        res.status(403).json({ error: "Forbidden" });
        return;
      }
      setRequestUser(publicAuthUser(user));
      next();
    })().catch((error) => {
      res.status(500).json({ error: error instanceof Error ? error.message : "Authorization failed" });
    });
  };
}

export function isAuthPublicPath(pathname: string, method: string): boolean {
  if (pathname === "/healthz") return true;
  if (pathname === "/auth/login") return true;
  return false;
}

export function isAdminOnlyPath(pathname: string, method: string): boolean {
  if (pathname.startsWith("/auth")) return false;
  if (pathname.startsWith("/users")) return true;
  if (pathname.startsWith("/integrations") && method !== "GET") return true;
  if (pathname.startsWith("/provisioning-jobs") && pathname.includes("/approve")) return true;
  return false;
}

export function isAuthenticatedPath(pathname: string, method: string): boolean {
  return !isAuthPublicPath(pathname, method);
}

export function isWriteMethod(method: string): boolean {
  return ["POST", "PUT", "PATCH", "DELETE"].includes(method.toUpperCase());
}

export function authorizeRequest(req: Request, res: Response, next: NextFunction) {
  void (async () => {
    const user = await getSessionUserFromRequest(req);
    if (!user) {
      res.status(401).json({ error: "Authentication required" });
      return;
    }

    if (isAdminOnlyPath(req.path, req.method) && user.role !== "admin") {
      res.status(403).json({ error: "Forbidden" });
      return;
    }

    if (isWriteMethod(req.method) && user.role === "viewer") {
      res.status(403).json({ error: "Forbidden" });
      return;
    }

    next();
  })().catch((error) => {
    res.status(500).json({ error: error instanceof Error ? error.message : "Authorization failed" });
  });
}

export async function ensureLocalAdminUser() {
  if (!env.adminEmail || !env.adminPassword) return;
  const email = env.adminEmail.toLowerCase();
  const [existing] = await db.select().from(usersTable).where(eq(usersTable.email, email));
  if (existing) return;
  const now = new Date();
  await db.insert(usersTable).values({
    name: env.adminName ?? "Admin",
    email,
    passwordHash: hashPassword(env.adminPassword),
    role: "admin",
    enabled: true,
    createdAt: now,
    updatedAt: now,
  });
}

export async function findUserByEmail(email: string) {
  const normalized = email.trim().toLowerCase();
  const [user] = await db.select().from(usersTable).where(eq(usersTable.email, normalized));
  return user ?? null;
}
