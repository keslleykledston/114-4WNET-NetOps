import { and, asc, desc, eq } from "drizzle-orm";
import {
  credentialAssignmentsTable,
  credentialProfilesTable,
  db,
  devicesTable,
  tenantsTable,
} from "@workspace/db";
import { encrypt } from "../../lib/crypto.js";
import { executeSnmpGet, executeSshCommand, resolveDeviceConnectorContext } from "../connectors/connector-execution.service.js";
import {
  logCredentialAudit,
  resolveCredentialById,
  toCredentialPublic,
} from "./credential-vault.resolver.js";
import { getSshVersionCommand, normalizeVendorKey } from "../netops/vendor-registry.js";

export const CREDENTIAL_TYPES = ["SSH", "SNMP_V2", "SNMP_V3", "NETCONF", "API_TOKEN"] as const;
export type CredentialType = (typeof CREDENTIAL_TYPES)[number];

export type CredentialPublicView = {
  id: string;
  tenant_id: number;
  tenant_name?: string;
  name: string;
  type: CredentialType;
  vendor: string | null;
  username: string | null;
  is_active: boolean;
  secret_configured: boolean;
  created_at: string;
  updated_at: string;
};

export type CredentialAssignmentView = {
  device_id: number;
  device_hostname?: string;
  credential_profile_id: string;
  credential_name?: string;
  credential_type?: string;
  priority: number;
  created_at: string;
};

function assertCredentialType(type: string): asserts type is CredentialType {
  if (!CREDENTIAL_TYPES.includes(type as CredentialType)) {
    throw new Error(`Unsupported credential type: ${type}`);
  }
}

function normalizeId(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function encodeSecret(input: Record<string, unknown>, type: CredentialType): string {
  const secret: Record<string, unknown> = {};
  if (typeof input.secret === "string" && input.secret.length > 0) {
    if (type === "SNMP_V2") secret.community = input.secret;
    else if (type === "API_TOKEN") secret.token = input.secret;
    else secret.password = input.secret;
  }
  for (const key of ["password", "community", "token", "auth_password", "priv_password"]) {
    if (typeof input[key] === "string" && String(input[key]).length > 0) {
      secret[key] = input[key];
    }
  }
  if (Object.keys(secret).length === 0) {
    throw new Error("secret is required");
  }
  return encrypt(JSON.stringify(secret));
}

export async function listCredentialProfiles(): Promise<CredentialPublicView[]> {
  const rows = await db
    .select({ profile: credentialProfilesTable, tenant: tenantsTable })
    .from(credentialProfilesTable)
    .innerJoin(tenantsTable, eq(credentialProfilesTable.tenantId, tenantsTable.id))
    .orderBy(desc(credentialProfilesTable.updatedAt));
  return rows.map((row) => toCredentialPublic(row.profile, row.tenant.name));
}

export async function getCredentialProfile(id: string): Promise<CredentialPublicView | null> {
  const [row] = await db
    .select({ profile: credentialProfilesTable, tenant: tenantsTable })
    .from(credentialProfilesTable)
    .innerJoin(tenantsTable, eq(credentialProfilesTable.tenantId, tenantsTable.id))
    .where(eq(credentialProfilesTable.id, id))
    .limit(1);
  return row ? toCredentialPublic(row.profile, row.tenant.name) : null;
}

export async function createCredentialProfile(input: Record<string, unknown>): Promise<CredentialPublicView> {
  const tenantId = Number(input.tenant_id);
  const name = typeof input.name === "string" ? input.name.trim() : "";
  const type = typeof input.type === "string" ? input.type : "";
  assertCredentialType(type);
  if (!Number.isInteger(tenantId) || tenantId < 1 || !name) {
    throw new Error("tenant_id, name and type are required");
  }
  const id = normalizeId(typeof input.id === "string" && input.id.trim() ? input.id : `cred-${name}`);
  if (!id) throw new Error("id is required");

  const [created] = await db
    .insert(credentialProfilesTable)
    .values({
      id,
      tenantId,
      name,
      type,
      vendor: typeof input.vendor === "string" && input.vendor.trim() ? input.vendor.trim() : null,
      username: typeof input.username === "string" && input.username.trim() ? input.username.trim() : null,
      encryptedSecret: encodeSecret(input, type),
      isActive: input.is_active === false ? false : true,
    })
    .returning();
  await logCredentialAudit({ profileId: created.id, action: "credential_profile_created", metadata: { type, tenant_id: tenantId } });
  return toCredentialPublic(created);
}

export async function updateCredentialProfile(id: string, input: Record<string, unknown>): Promise<CredentialPublicView | null> {
  const [existing] = await db.select().from(credentialProfilesTable).where(eq(credentialProfilesTable.id, id)).limit(1);
  if (!existing) return null;
  const type = typeof input.type === "string" ? input.type : existing.type;
  assertCredentialType(type);
  const patch: Partial<typeof credentialProfilesTable.$inferInsert> = {
    name: typeof input.name === "string" && input.name.trim() ? input.name.trim() : existing.name,
    type,
    vendor: typeof input.vendor === "string" ? input.vendor.trim() || null : existing.vendor,
    username: typeof input.username === "string" ? input.username.trim() || null : existing.username,
    isActive: typeof input.is_active === "boolean" ? input.is_active : existing.isActive,
    updatedAt: new Date(),
  };
  const hasSecret = ["secret", "password", "community", "token", "auth_password", "priv_password"].some(
    (key) => typeof input[key] === "string" && String(input[key]).length > 0,
  );
  if (hasSecret) {
    patch.encryptedSecret = encodeSecret(input, type);
  }
  const [updated] = await db
    .update(credentialProfilesTable)
    .set(patch)
    .where(eq(credentialProfilesTable.id, id))
    .returning();
  await logCredentialAudit({
    profileId: id,
    action: hasSecret ? "credential_profile_rotated" : "credential_profile_updated",
    metadata: { type, secret_rotated: hasSecret },
  });
  return updated ? toCredentialPublic(updated) : null;
}

export async function deleteCredentialProfile(id: string): Promise<boolean> {
  const [existing] = await db.select().from(credentialProfilesTable).where(eq(credentialProfilesTable.id, id)).limit(1);
  if (!existing) return false;
  await db.delete(credentialProfilesTable).where(eq(credentialProfilesTable.id, id));
  await logCredentialAudit({ profileId: id, action: "credential_profile_deleted", metadata: { type: existing.type } });
  return true;
}

export async function rotateCredentialProfile(id: string, input: Record<string, unknown>): Promise<CredentialPublicView | null> {
  const [existing] = await db.select().from(credentialProfilesTable).where(eq(credentialProfilesTable.id, id)).limit(1);
  if (!existing) return null;
  const [updated] = await db
    .update(credentialProfilesTable)
    .set({ encryptedSecret: encodeSecret(input, existing.type as CredentialType), updatedAt: new Date() })
    .where(eq(credentialProfilesTable.id, id))
    .returning();
  await logCredentialAudit({ profileId: id, action: "credential_profile_rotated", metadata: { type: existing.type } });
  return updated ? toCredentialPublic(updated) : null;
}

export async function listCredentialAssignments(deviceId?: number): Promise<CredentialAssignmentView[]> {
  const conditions = deviceId ? eq(credentialAssignmentsTable.deviceId, deviceId) : undefined;
  const rows = await db
    .select({ assignment: credentialAssignmentsTable, device: devicesTable, profile: credentialProfilesTable })
    .from(credentialAssignmentsTable)
    .innerJoin(devicesTable, eq(credentialAssignmentsTable.deviceId, devicesTable.id))
    .innerJoin(credentialProfilesTable, eq(credentialAssignmentsTable.credentialProfileId, credentialProfilesTable.id))
    .where(conditions)
    .orderBy(asc(credentialAssignmentsTable.deviceId), asc(credentialAssignmentsTable.priority));
  return rows.map((row) => ({
    device_id: row.assignment.deviceId,
    device_hostname: row.device.hostname,
    credential_profile_id: row.assignment.credentialProfileId,
    credential_name: row.profile.name,
    credential_type: row.profile.type,
    priority: row.assignment.priority,
    created_at: row.assignment.createdAt.toISOString(),
  }));
}

export async function assignCredentialToDevice(input: Record<string, unknown>): Promise<CredentialAssignmentView> {
  const deviceId = Number(input.device_id);
  const profileId = typeof input.credential_profile_id === "string" ? input.credential_profile_id.trim() : "";
  const priority = Number.isInteger(input.priority) ? Number(input.priority) : 100;
  if (!Number.isInteger(deviceId) || deviceId < 1 || !profileId) {
    throw new Error("device_id and credential_profile_id are required");
  }
  await db
    .insert(credentialAssignmentsTable)
    .values({ deviceId, credentialProfileId: profileId, priority })
    .onConflictDoUpdate({
      target: [credentialAssignmentsTable.deviceId, credentialAssignmentsTable.credentialProfileId],
      set: { priority },
    });
  await logCredentialAudit({
    profileId,
    deviceId,
    action: "credential_assigned",
    metadata: { priority },
  });
  const [assignment] = await listCredentialAssignments(deviceId);
  const exact = (await listCredentialAssignments(deviceId)).find((row) => row.credential_profile_id === profileId);
  return exact ?? assignment;
}

export async function removeCredentialAssignment(deviceId: number, profileId: string): Promise<boolean> {
  await db
    .delete(credentialAssignmentsTable)
    .where(
      and(
        eq(credentialAssignmentsTable.deviceId, deviceId),
        eq(credentialAssignmentsTable.credentialProfileId, profileId),
      ),
    );
  await logCredentialAudit({ profileId, deviceId, action: "credential_unassigned" });
  return true;
}

export async function testCredentialProfile(id: string, input: Record<string, unknown>) {
  const deviceId = Number(input.device_id);
  if (!Number.isInteger(deviceId) || deviceId < 1) throw new Error("device_id is required");
  const [device] = await db.select().from(devicesTable).where(eq(devicesTable.id, deviceId)).limit(1);
  if (!device) throw new Error("Device not found");
  const { connectorId } = await resolveDeviceConnectorContext(deviceId);
  if (!connectorId) throw new Error("Device has no connector");
  const credential = await resolveCredentialById(id);
  if (!credential) throw new Error("Credential not found or inactive");
  let result;
  if (credential.type === "SSH" || credential.type === "NETCONF") {
    const command = getSshVersionCommand(normalizeVendorKey(device.vendor, device.platform));
    result = await executeSshCommand({
      deviceId,
      connectorId,
      targetIp: device.ipAddress,
      credentialId: id,
      command,
      vendor: device.vendor,
      port: device.sshPort,
    });
  } else if (credential.type === "SNMP_V2" || credential.type === "SNMP_V3") {
    result = await executeSnmpGet({
      deviceId,
      connectorId,
      targetIp: device.ipAddress,
      oid: "1.3.6.1.2.1.1.5.0",
      credentialId: id,
    });
  } else {
    throw new Error(`Credential test is not implemented for ${credential.type}`);
  }
  await logCredentialAudit({ profileId: id, deviceId, action: "credential_tested", metadata: { success: result.success } });
  return {
    success: result.success,
    status: result.status,
    job_id: result.jobId,
    message: result.success ? "Credential test OK" : result.stderr || "Credential test failed",
  };
}
