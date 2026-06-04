import { createHash } from "node:crypto";
import { and, desc, eq } from "drizzle-orm";
import { collectedConfigsTable, communityChangeAuditTable, communitySetMembersTable, communitySetsTable, db, type Device } from "@workspace/db";
import { decrypt } from "../../../lib/crypto.js";
import { env } from "../../../lib/env.js";
import { runSSHCommands } from "../../../lib/ssh.js";
import { createConfigDiffForCollectedConfig } from "../../config-history/config-history.service.js";
import { logAuditEvent } from "../../../lib/audit.js";
import { communityListNamesInConfig, formatPhase1CommunityListBlock } from "../huawei-vrp/parsers/community-parser.js";
import { IMPORTED_COMMUNITY_SET_ORIGINS, latestRunningConfigText } from "./community-sync.service.js";

type CommunitySetMemberForApply = {
  position: number;
  communityValue: string | null;
  missingInLibrary: boolean | null;
};

type CommunitySetWithMembers = typeof communitySetsTable.$inferSelect & {
  members: Array<CommunitySetMemberForApply>;
};
type ImportedCommunitySetOrigin = (typeof IMPORTED_COMMUNITY_SET_ORIGINS)[number];
const IMPORTED_COMMUNITY_SET_ORIGIN_SET = new Set<string>(IMPORTED_COMMUNITY_SET_ORIGINS);

export function slugifyDisplayName(name: string): string {
  return (name || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase()
    .slice(0, 80) || "community-set";
}

function sha256Text(value: string): string {
  return createHash("sha256").update(value || "", "utf8").digest("hex");
}

async function loadCommunitySet(deviceId: number, communitySetId: number): Promise<CommunitySetWithMembers | null> {
  const [set] = await db
    .select()
    .from(communitySetsTable)
    .where(and(eq(communitySetsTable.id, communitySetId), eq(communitySetsTable.deviceId, deviceId)))
    .limit(1);
  if (!set) return null;

  const members = await db
    .select()
    .from(communitySetMembersTable)
    .where(eq(communitySetMembersTable.communitySetId, set.id))
    .orderBy(communitySetMembersTable.position);

  return { ...set, members };
}

async function latestPreviewAudit(communitySetId: number) {
  const [row] = await db
    .select()
    .from(communityChangeAuditTable)
    .where(
      and(
        eq(communityChangeAuditTable.communitySetId, communitySetId),
        eq(communityChangeAuditTable.action, "preview"),
        eq(communityChangeAuditTable.status, "success"),
      ),
    )
    .orderBy(desc(communityChangeAuditTable.id))
    .limit(1);
  return row ?? null;
}

async function recordCommunityAudit(input: {
  deviceId: number;
  communitySetId: number | null;
  userId: number | null;
  action: "preview" | "apply" | "rollback";
  candidateConfigText: string;
  commandSentText?: string | null;
  deviceResponseText?: string | null;
  status: "success" | "error" | "pending";
}) {
  await db.insert(communityChangeAuditTable).values({
    deviceId: input.deviceId,
    communitySetId: input.communitySetId,
    userId: input.userId,
    action: input.action,
    candidateConfigText: input.candidateConfigText,
    commandSentText: input.commandSentText ?? null,
    deviceResponseText: input.deviceResponseText ?? null,
    status: input.status,
  });
}

function buildCandidateConfigText(communitySet: CommunitySetWithMembers): string {
  const origin = (communitySet.origin || "app_created").trim() || "app_created";
  if (IMPORTED_COMMUNITY_SET_ORIGIN_SET.has(origin as ImportedCommunitySetOrigin) && communitySet.members.length === 0) {
    const values = Array.isArray(communitySet.discoveredMembersJson)
      ? communitySet.discoveredMembersJson.map((item) => String(item || "").trim()).filter(Boolean)
      : [];
    return formatPhase1CommunityListBlock(communitySet.vrpObjectName, values);
  }

  const values: string[] = [];
  const seen = new Set<string>();
  for (const member of [...communitySet.members].sort((left, right) => left.position - right.position)) {
    const value = (member.communityValue || "").trim();
    if (!value) continue;
    const key = value.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    values.push(value);
  }
  return formatPhase1CommunityListBlock(communitySet.vrpObjectName, values);
}

async function collectCurrentConfigAfterApply(device: Device): Promise<string | null> {
  const results = await runSSHCommands(
    {
      host: device.ipAddress,
      port: device.sshPort ?? 22,
      username: device.username,
      password: decrypt(device.passwordEncrypted),
    },
    ["display current-configuration"],
    {
      sessionTimeoutMs: 300_000,
      commandTimeoutMs: 180_000,
      setupTimeoutMs: 15_000,
    },
  );
  return results[0]?.output?.trim() || null;
}

export async function recordCommunitySetPreview(input: {
  device: Device;
  communitySet: CommunitySetWithMembers;
  userId: number | null;
}): Promise<{ candidateConfigText: string; candidateSha256: string; warnings: string[]; membersMissingLibrary: number; missingCommunityValues: string[] }> {
  const candidateConfigText = buildCandidateConfigText(input.communitySet);
  const candidateSha256 = sha256Text(candidateConfigText);
  const missingCommunityValues = input.communitySet.members
    .filter((member) => member.missingInLibrary)
    .map((member) => (member.communityValue || "").trim())
    .filter(Boolean);
  const warnings: string[] = [];

  if (missingCommunityValues.length > 0) {
    warnings.push(
      `Existem ${missingCommunityValues.length} values sem community-filter correspondente na biblioteca.`,
    );
  }

  const runningConfig = (await latestRunningConfigText(input.communitySet.deviceId)) || "";
  if (communityListNamesInConfig(runningConfig).has(input.communitySet.vrpObjectName)) {
    warnings.push(
      `Já existe ip community-list ${input.communitySet.vrpObjectName} no último running-config salvo.`,
    );
  }

  await recordCommunityAudit({
    deviceId: input.device.id,
    communitySetId: input.communitySet.id,
    userId: input.userId,
    action: "preview",
    candidateConfigText,
    status: "success",
  });

  await db
    .update(communitySetsTable)
    .set({
      status: "ready",
      updatedBy: input.userId,
      updatedAt: new Date(),
    })
    .where(eq(communitySetsTable.id, input.communitySet.id));

  await logAuditEvent({
    actorId: input.userId,
    action: "community_set_preview",
    objectType: "community_set",
    objectId: String(input.communitySet.id),
    metadata: {
      device_id: input.device.id,
      community_set_id: input.communitySet.id,
      candidate_sha256: candidateSha256,
      warnings_count: warnings.length,
    },
  });

  return {
    candidateConfigText,
    candidateSha256,
    warnings,
    membersMissingLibrary: missingCommunityValues.length,
    missingCommunityValues,
  };
}

export async function applyCommunitySet(input: {
  device: Device;
  communitySetId: number;
  userId: number | null;
  confirm: boolean;
  expectedCandidateSha256: string | null;
  acknowledgeMissingLibraryRefs: boolean;
}): Promise<
  | { ok: true; status: "success"; message: string; deviceResponseExcerpt: string | null }
  | { error: string; status: number }
> {
  if (!input.confirm) {
    return { error: "Confirmação obrigatória para aplicar no roteador.", status: 400 };
  }

  if (env.configApplyEnabled !== true) {
    return { error: "CONFIG_APPLY_ENABLED=false. Execução bloqueada.", status: 503 };
  }

  const communitySet = await loadCommunitySet(input.device.id, input.communitySetId);
  if (!communitySet) {
    return { error: "Community set não encontrado.", status: 404 };
  }

  if (IMPORTED_COMMUNITY_SET_ORIGIN_SET.has((communitySet.origin || "app_created") as ImportedCommunitySetOrigin)) {
    return { error: "Sets importados do equipamento não podem ser aplicados pela app.", status: 400 };
  }

  const candidateConfigText = buildCandidateConfigText(communitySet);
  const candidateSha256 = sha256Text(candidateConfigText);

  if (communitySet.members.some((member) => member.missingInLibrary) && !input.acknowledgeMissingLibraryRefs) {
    return {
      error: "Existem valores no set sem community-filter na biblioteca. Confirme o risco e reenviar acknowledgeMissingLibraryRefs=true.",
      status: 400,
    };
  }

  const previousPreview = await latestPreviewAudit(communitySet.id);
  if (!previousPreview) {
    return { error: "É necessário gerar um preview com sucesso antes de aplicar.", status: 409 };
  }

  if ((previousPreview.candidateConfigText || "").trim() !== candidateConfigText.trim()) {
    return { error: "O set foi alterado após o último preview. Gere um novo preview.", status: 409 };
  }

  const expected = (input.expectedCandidateSha256 || "").trim().toLowerCase();
  if (!expected || expected !== candidateSha256.toLowerCase()) {
    return { error: "Hash do candidato inválido ou desatualizado — gere um novo preview.", status: 409 };
  }

  const commandLines = [
    "system-view",
    ...candidateConfigText.split(/\r?\n/).filter((line) => line.trim().length > 0),
    "quit",
    "commit",
    "quit",
  ];
  const script = commandLines.join("\n");

  try {
    const results: Array<{ command: string; output: string; error?: string }> = await runSSHCommands(
      {
        host: input.device.ipAddress,
        port: input.device.sshPort ?? 22,
        username: input.device.username,
        password: decrypt(input.device.passwordEncrypted),
      },
      commandLines,
      {
        sessionTimeoutMs: 300_000,
        commandTimeoutMs: 180_000,
        setupTimeoutMs: 15_000,
      },
    );

    const responseText = results.map((result: { output: string; error?: string }) => result.output || result.error || "").filter(Boolean).join("\n");
    const postConfig = await collectCurrentConfigAfterApply(input.device);
    let collectedConfigId: number | null = null;

    if (postConfig) {
      const [inserted] = await db
        .insert(collectedConfigsTable)
        .values({
          deviceId: input.device.id,
          source: "ssh_community_set_apply",
          rawConfig: postConfig,
          parserStatus: "PENDING",
        })
        .returning({ id: collectedConfigsTable.id });
      collectedConfigId = inserted?.id ?? null;
      if (collectedConfigId) {
        await createConfigDiffForCollectedConfig(collectedConfigId);
      }
    }

    await recordCommunityAudit({
      deviceId: input.device.id,
      communitySetId: communitySet.id,
      userId: input.userId,
      action: "apply",
      candidateConfigText,
      commandSentText: script,
      deviceResponseText: responseText,
      status: "success",
    });

    await db
      .update(communitySetsTable)
      .set({
        status: "applied",
        updatedBy: input.userId,
        updatedAt: new Date(),
      })
      .where(eq(communitySetsTable.id, communitySet.id));

    await logAuditEvent({
      actorId: input.userId,
      action: "community_set_apply",
      objectType: "community_set",
      objectId: String(communitySet.id),
      metadata: {
        device_id: input.device.id,
        community_set_id: communitySet.id,
        collected_config_id: collectedConfigId,
        response_excerpt: responseText.slice(0, 2000),
      },
    });

    return {
      ok: true,
      status: "success",
      message: "Configuração aplicada e commit enviado.",
      deviceResponseExcerpt: responseText.slice(0, 2000) || null,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await recordCommunityAudit({
      deviceId: input.device.id,
      communitySetId: communitySet.id,
      userId: input.userId,
      action: "apply",
      candidateConfigText,
      commandSentText: script,
      deviceResponseText: message,
      status: "error",
    });
    await db
      .update(communitySetsTable)
      .set({
        status: "draft",
        updatedBy: input.userId,
        updatedAt: new Date(),
      })
      .where(eq(communitySetsTable.id, communitySet.id));

    return { error: message, status: 502 };
  }
}
