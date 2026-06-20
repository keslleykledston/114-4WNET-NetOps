import {
  copilotFeedbackTable,
  copilotMessagesTable,
  copilotSessionsTable,
  copilotToolRunsTable,
  db,
} from "@workspace/db";
import { and, desc, eq } from "drizzle-orm";
import type { CopilotToolRunRecord } from "./copilot.tools.types.js";
import type { CopilotEvidence, CopilotIntent } from "./copilot.types.js";

export async function getOrCreateCopilotSession(input: {
  sessionId?: number;
  tenantId: number;
  userId: number;
  anchorDeviceId?: number;
  title?: string;
}) {
  if (input.sessionId) {
    const [existing] = await db
      .select()
      .from(copilotSessionsTable)
      .where(eq(copilotSessionsTable.id, input.sessionId))
      .limit(1);
    if (existing && existing.userId === input.userId) return existing;
  }

  const [created] = await db
    .insert(copilotSessionsTable)
    .values({
      tenantId: input.tenantId,
      userId: input.userId,
      anchorDeviceId: input.anchorDeviceId ?? null,
      title: input.title ?? null,
      updatedAt: new Date(),
    })
    .returning();

  return created!;
}

export async function appendCopilotMessage(input: {
  sessionId: number;
  role: "user" | "assistant" | "system";
  content: string;
  metadata?: Record<string, unknown>;
}) {
  const [message] = await db
    .insert(copilotMessagesTable)
    .values({
      sessionId: input.sessionId,
      role: input.role,
      content: input.content,
      metadata: input.metadata ?? null,
    })
    .returning();

  await db
    .update(copilotSessionsTable)
    .set({ updatedAt: new Date() })
    .where(eq(copilotSessionsTable.id, input.sessionId));

  return message!;
}

export async function persistToolRuns(input: {
  sessionId: number;
  messageId: number;
  toolRuns: CopilotToolRunRecord[];
}) {
  if (input.toolRuns.length === 0) return;

  await db.insert(copilotToolRunsTable).values(
    input.toolRuns.map((run) => ({
      sessionId: input.sessionId,
      messageId: input.messageId,
      toolName: run.toolName,
      inputJson: run.input,
      outputJson: run.output as Record<string, unknown>,
      status: run.status,
      durationMs: run.durationMs,
      sourceType: run.source?.type ?? null,
      sourceRef: run.source?.ref ?? null,
    })),
  );
}

export async function listCopilotSessionsForUser(userId: number, tenantId: number, limit = 20) {
  return db
    .select()
    .from(copilotSessionsTable)
    .where(and(
      eq(copilotSessionsTable.userId, userId),
      eq(copilotSessionsTable.tenantId, tenantId),
    ))
    .orderBy(desc(copilotSessionsTable.updatedAt))
    .limit(limit);
}

export async function getCopilotMessageById(messageId: number) {
  const [message] = await db
    .select()
    .from(copilotMessagesTable)
    .where(eq(copilotMessagesTable.id, messageId))
    .limit(1);
  return message ?? null;
}

export async function saveCopilotFeedback(input: {
  messageId: number;
  userId: number;
  rating: "useful" | "incorrect" | "teach";
  comment?: string;
}) {
  const [row] = await db
    .insert(copilotFeedbackTable)
    .values({
      messageId: input.messageId,
      userId: input.userId,
      rating: input.rating,
      comment: input.comment ?? null,
    })
    .returning();
  return row!;
}

export function buildMessageMetadata(input: {
  intent: CopilotIntent;
  confidence: "high" | "medium" | "low";
  evidence: CopilotEvidence;
}) {
  return {
    intent: input.intent,
    confidence: input.confidence,
    scope: input.evidence.scope,
    skillsUsed: input.evidence.skillsUsed,
    toolsUsed: input.evidence.toolRuns.map((run) => run.toolName),
    peerCount: input.evidence.peers.length,
    circuitCount: input.evidence.circuits.length,
    nlu: input.evidence.nlu,
    sshLive: input.evidence.toolRuns.some((run) => run.toolName === "bgp_route_ssh_live" && run.status === "ok"),
    inventoryRefresh: input.evidence.toolRuns.some((run) => run.toolName === "netops_inventory_refresh" && run.status === "ok"),
    netbox: input.evidence.toolRuns.some((run) => run.toolName === "netbox_inventory_query" && run.status === "ok"),
  };
}
