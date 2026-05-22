import type { Request } from "express";
import { auditLogsTable, db } from "@workspace/db";
import { getRequestContext } from "./request-context.js";

type Metadata = Record<string, unknown> | undefined;

const SENSITIVE_KEY_PATTERN = /(password|secret|token|community|communitystring|snmpcommunity|authorization|credential|cookie)/i;
const LARGE_VALUE_KEY_PATTERN = /(output|command|config|payload|body|script|template)/i;
const MAX_STRING_LENGTH = 240;
const MAX_ARRAY_LENGTH = 20;
const MAX_DEPTH = 4;

function sanitizeValue(value: unknown, key: string | undefined, depth: number): unknown {
  if (value === null || value === undefined) return value;
  if (depth > MAX_DEPTH) return "[truncated]";
  if (typeof value === "string") {
    if (key && SENSITIVE_KEY_PATTERN.test(key)) return "[redacted]";
    if (key && LARGE_VALUE_KEY_PATTERN.test(key) && value.length > MAX_STRING_LENGTH) {
      return { length: value.length, preview: value.slice(0, MAX_STRING_LENGTH) };
    }
    return value.length > MAX_STRING_LENGTH ? `${value.slice(0, MAX_STRING_LENGTH)}…` : value;
  }
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (Array.isArray(value)) {
    const items = value.slice(0, MAX_ARRAY_LENGTH).map((item) => sanitizeValue(item, key, depth + 1));
    return value.length > MAX_ARRAY_LENGTH ? { total: value.length, items } : items;
  }
  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).map(([entryKey, entryValue]) => {
      if (SENSITIVE_KEY_PATTERN.test(entryKey)) return [entryKey, "[redacted]"];
      return [entryKey, sanitizeValue(entryValue, entryKey, depth + 1)];
    });
    return Object.fromEntries(entries);
  }
  return String(value);
}

export function sanitizeAuditMetadata(metadata: Metadata): Record<string, unknown> | null {
  if (!metadata) return null;
  const sanitized = sanitizeValue(metadata, undefined, 0);
  return sanitized && typeof sanitized === "object" && !Array.isArray(sanitized) ? sanitized as Record<string, unknown> : { value: sanitized };
}

export async function logAuditEvent(input: {
  actorId?: number | null;
  action: string;
  objectType: string;
  objectId: string;
  metadata?: Metadata;
  sourceIp?: string | null;
}) {
  try {
    const context = getRequestContext();
    await db.insert(auditLogsTable).values({
      actorId: input.actorId ?? context?.actorId ?? null,
      action: input.action,
      objectType: input.objectType,
      objectId: input.objectId,
      metadataJson: sanitizeAuditMetadata(input.metadata),
      sourceIp: input.sourceIp ?? null,
    });
  } catch {
    // Audit must never block the primary request path.
  }
}

export function getRequestSourceIp(req: Request): string | null {
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string" && forwarded.trim()) {
    return forwarded.split(",")[0]?.trim() ?? null;
  }
  return req.ip || null;
}
