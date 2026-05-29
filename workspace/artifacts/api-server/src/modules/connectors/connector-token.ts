import { createHash, randomBytes } from "node:crypto";

export function generateConnectorToken(): string {
  return `nc_${randomBytes(32).toString("base64url")}`;
}

export function hashConnectorToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function maskConnectorToken(token: string): string {
  if (token.length <= 12) return "nc_****";
  return `${token.slice(0, 8)}…${token.slice(-4)}`;
}
