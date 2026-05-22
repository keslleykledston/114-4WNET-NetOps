import { AsyncLocalStorage } from "node:async_hooks";
import type { Request, Response, NextFunction } from "express";
import type { UserRole } from "@workspace/db";

export type RequestContext = {
  actorId: number | null;
  actorName: string | null;
  actorEmail: string | null;
  actorRole: UserRole | null;
  sourceIp: string | null;
  user: {
    id: number;
    name: string;
    email: string;
    role: UserRole;
  } | null;
};

const storage = new AsyncLocalStorage<RequestContext>();

export function requestContextMiddleware(req: Request, _res: Response, next: NextFunction) {
  const forwarded = req.headers["x-forwarded-for"];
  const sourceIp =
    typeof forwarded === "string" && forwarded.trim()
      ? forwarded.split(",")[0]?.trim() ?? req.ip ?? null
      : req.ip ?? null;

  storage.run(
    {
      actorId: null,
      actorName: null,
      actorEmail: null,
      actorRole: null,
      sourceIp,
      user: null,
    },
    () => next(),
  );
}

export function getRequestContext(): RequestContext | null {
  return storage.getStore() ?? null;
}

export function setRequestUser(user: RequestContext["user"]) {
  const context = storage.getStore();
  if (!context) return;
  context.user = user;
  context.actorId = user?.id ?? null;
  context.actorName = user?.name ?? null;
  context.actorEmail = user?.email ?? null;
  context.actorRole = user?.role ?? null;
}
