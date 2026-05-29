import type { NextFunction, Request, Response } from "express";
import { findConnectorByToken } from "./connectors.service.js";
import type { Connector } from "@workspace/db/schema/connectors.js";

export type ConnectorAuthedRequest = Request & {
  connector?: Connector;
};

function extractBearerToken(req: Request): string | null {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) return null;
  return header.slice("Bearer ".length).trim() || null;
}

export function requireConnectorAuth(req: ConnectorAuthedRequest, res: Response, next: NextFunction) {
  void (async () => {
    const token = extractBearerToken(req);
    if (!token) {
      res.status(401).json({ error: "Connector token required", code: "CONNECTOR_AUTH_REQUIRED" });
      return;
    }
    const connector = await findConnectorByToken(token);
    if (!connector) {
      res.status(401).json({ error: "Invalid or revoked connector token", code: "CONNECTOR_AUTH_INVALID" });
      return;
    }
    req.connector = connector;
    next();
  })().catch((error) => {
    res.status(500).json({ error: error instanceof Error ? error.message : "Connector auth failed" });
  });
}
