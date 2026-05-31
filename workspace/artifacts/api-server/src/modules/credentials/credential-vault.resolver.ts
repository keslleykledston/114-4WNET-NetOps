import { and, asc, eq, inArray } from "drizzle-orm";
import {
  credentialAssignmentsTable,
  credentialAuditLogsTable,
  credentialProfilesTable,
  db,
  type Device,
} from "@workspace/db";
import { decrypt } from "../../lib/crypto.js";
import { logAuditEvent, sanitizeAuditMetadata } from "../../lib/audit.js";
import { getRequestContext } from "../../lib/request-context.js";
import type { CredentialPublicView, CredentialType } from "./credential-vault.service.js";

export type CredentialSecret = {
  password?: string;
  community?: string;
  token?: string;
  auth_password?: string;
  priv_password?: string;
  [key: string]: unknown;
};

function decodeSecret(encryptedSecret: string): CredentialSecret {
  const plain = decrypt(encryptedSecret);
  try {
    const parsed = JSON.parse(plain) as CredentialSecret;
    return parsed && typeof parsed === "object" ? parsed : { password: plain };
  } catch {
    return { password: plain };
  }
}

export function toCredentialPublic(row: typeof credentialProfilesTable.$inferSelect, tenantName?: string): CredentialPublicView {
  return {
    id: row.id,
    tenant_id: row.tenantId,
    tenant_name: tenantName,
    name: row.name,
    type: row.type as CredentialType,
    vendor: row.vendor,
    username: row.username,
    is_active: row.isActive,
    secret_configured: Boolean(row.encryptedSecret),
    created_at: row.createdAt.toISOString(),
    updated_at: row.updatedAt.toISOString(),
  };
}

export async function logCredentialAudit(input: {
  profileId?: string | null;
  deviceId?: number | null;
  action: string;
  metadata?: Record<string, unknown>;
}) {
  const userId = getRequestContext()?.user?.id ?? null;
  const metadata = sanitizeAuditMetadata(input.metadata);
  await db.insert(credentialAuditLogsTable).values({
    credentialProfileId: input.profileId ?? null,
    deviceId: input.deviceId ?? null,
    actorId: userId,
    action: input.action,
    metadataJson: metadata,
  });
  await logAuditEvent({
    actorId: userId,
    action: input.action,
    objectType: "credential_profile",
    objectId: input.profileId ?? "assignment",
    metadata: input.metadata,
  });
}

export async function resolveCredentialById(profileId: string): Promise<(CredentialPublicView & { secret: CredentialSecret }) | null> {
  const [profile] = await db
    .select()
    .from(credentialProfilesTable)
    .where(and(eq(credentialProfilesTable.id, profileId), eq(credentialProfilesTable.isActive, true)))
    .limit(1);
  if (!profile) return null;
  await logCredentialAudit({ profileId, action: "credential_resolved" });
  return { ...toCredentialPublic(profile), secret: decodeSecret(profile.encryptedSecret) };
}

export async function resolveDeviceCredential(deviceId: number, types: CredentialType[]): Promise<{
  profile: CredentialPublicView;
  secret: CredentialSecret;
} | null> {
  const rows = await db
    .select({ profile: credentialProfilesTable })
    .from(credentialAssignmentsTable)
    .innerJoin(credentialProfilesTable, eq(credentialAssignmentsTable.credentialProfileId, credentialProfilesTable.id))
    .where(
      and(
        eq(credentialAssignmentsTable.deviceId, deviceId),
        eq(credentialProfilesTable.isActive, true),
        inArray(credentialProfilesTable.type, types),
      ),
    )
    .orderBy(asc(credentialAssignmentsTable.priority))
    .limit(1);
  const row = rows[0];
  if (!row) return null;
  await logCredentialAudit({ profileId: row.profile.id, deviceId, action: "credential_resolved" });
  return { profile: toCredentialPublic(row.profile), secret: decodeSecret(row.profile.encryptedSecret) };
}

export async function buildConnectorPayloadWithCredential(input: {
  payload: Record<string, unknown>;
  jobType: string;
  deviceId?: number | null;
}): Promise<Record<string, unknown>> {
  let credentialId = typeof input.payload.credential_id === "string" ? input.payload.credential_id.trim() : "";
  const types: CredentialType[] =
    input.jobType === "SSH_COMMAND" || input.jobType === "SSH_CONFIG_BUNDLE" || input.jobType.startsWith("NETCONF")
      ? ["SSH", "NETCONF"]
      : input.jobType === "SNMP_GET" || input.jobType === "SNMP_WALK"
        ? ["SNMP_V2", "SNMP_V3"]
        : [];
  if (!credentialId && input.deviceId && types.length > 0) {
    const resolved = await resolveDeviceCredential(input.deviceId, types);
    credentialId = resolved?.profile.id ?? "";
  }
  if (!credentialId) return input.payload;
  const resolved = await resolveCredentialById(credentialId);
  if (!resolved) throw new Error(`Credential not found or inactive: ${credentialId}`);
  const payload: Record<string, unknown> = { ...input.payload, credential_id: credentialId };
  if (input.jobType === "SSH_COMMAND" || input.jobType === "SSH_CONFIG_BUNDLE") {
    payload.username = resolved.username;
    payload.password = resolved.secret.password;
  }
  if (input.jobType.startsWith("NETCONF")) {
    payload.username = resolved.username;
    payload.password = resolved.secret.password;
    if (payload.port === undefined) {
      payload.port = 830;
    }
  }
  if (input.jobType === "SNMP_GET" || input.jobType === "SNMP_WALK") {
    payload.community = resolved.secret.community ?? resolved.secret.password;
    payload.version = resolved.type === "SNMP_V2" ? "2c" : input.payload.version;
  }
  return payload;
}

export async function resolveLegacyDeviceCredentialContext(device: Device): Promise<{
  sshCredentialId: string | null;
  snmpCredentialId: string | null;
  username: string;
  password: string;
  community: string | null;
}> {
  const [ssh, snmp] = await Promise.all([
    resolveDeviceCredential(device.id, ["SSH", "NETCONF"]),
    resolveDeviceCredential(device.id, ["SNMP_V2", "SNMP_V3"]),
  ]);
  return {
    sshCredentialId: ssh?.profile.id ?? null,
    snmpCredentialId: snmp?.profile.id ?? null,
    username: ssh?.profile.username ?? device.username,
    password: ssh?.secret.password ?? decrypt(device.passwordEncrypted),
    community: (snmp?.secret.community ?? snmp?.secret.password ?? device.snmpCommunity)?.trim() || null,
  };
}
