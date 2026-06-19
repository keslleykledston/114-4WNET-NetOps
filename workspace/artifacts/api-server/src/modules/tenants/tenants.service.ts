import { count, eq } from "drizzle-orm";
import { db } from "@workspace/db";
import {
  connectorsTable,
  tenantsTable,
  userAccessProfilesTable,
  usersTable,
} from "@workspace/db";
import { ConflictError, isUniqueViolation } from "../../lib/db-errors.js";

export type TenantStatus = "active" | "inactive";

export type TenantView = {
  id: number;
  name: string;
  slug: string;
  status: TenantStatus;
  created_at: string;
  updated_at: string;
};

export type TenantDetailView = TenantView & {
  connector_count: number;
  user_count: number;
  profile_count: number;
};

function slugify(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64) || "tenant";
}

function mapTenant(row: typeof tenantsTable.$inferSelect): TenantView {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    status: row.status === "inactive" ? "inactive" : "active",
    created_at: row.createdAt.toISOString(),
    updated_at: row.updatedAt.toISOString(),
  };
}

async function countForTenant(tenantId: number) {
  const [[connectors], [users], [profiles]] = await Promise.all([
    db.select({ value: count() }).from(connectorsTable).where(eq(connectorsTable.tenantId, tenantId)),
    db.select({ value: count() }).from(usersTable).where(eq(usersTable.tenantId, tenantId)),
    db.select({ value: count() }).from(userAccessProfilesTable).where(eq(userAccessProfilesTable.tenantId, tenantId)),
  ]);
  return {
    connector_count: Number(connectors?.value ?? 0),
    user_count: Number(users?.value ?? 0),
    profile_count: Number(profiles?.value ?? 0),
  };
}

export async function listTenants(): Promise<TenantView[]> {
  const rows = await db.select().from(tenantsTable).orderBy(tenantsTable.name);
  return rows.map(mapTenant);
}

export async function listTenantsWithStats(): Promise<TenantDetailView[]> {
  const rows = await db.select().from(tenantsTable).orderBy(tenantsTable.name);
  const result: TenantDetailView[] = [];
  for (const row of rows) {
    const stats = await countForTenant(row.id);
    result.push({ ...mapTenant(row), ...stats });
  }
  return result;
}

export async function getTenantById(id: number): Promise<TenantDetailView | null> {
  const [row] = await db.select().from(tenantsTable).where(eq(tenantsTable.id, id)).limit(1);
  if (!row) return null;
  const stats = await countForTenant(row.id);
  return { ...mapTenant(row), ...stats };
}

export async function createTenant(input: { name: string; slug?: string; status?: TenantStatus }) {
  const name = input.name.trim();
  if (!name) {
    throw new Error("name is required");
  }
  const slug = input.slug?.trim() ? slugify(input.slug) : slugify(name);
  const status = input.status === "inactive" ? "inactive" : "active";

  const [existing] = await db.select().from(tenantsTable).where(eq(tenantsTable.slug, slug)).limit(1);
  if (existing) {
    throw new ConflictError(`Tenant com slug "${slug}" já existe (${existing.name}).`);
  }

  try {
    const [tenant] = await db
      .insert(tenantsTable)
      .values({ name, slug, status, updatedAt: new Date() })
      .returning();
    return mapTenant(tenant);
  } catch (error) {
    if (isUniqueViolation(error, "tenants_slug_key")) {
      throw new ConflictError(`Tenant com slug "${slug}" já existe.`);
    }
    throw error;
  }
}

export async function updateTenant(
  id: number,
  input: { name?: string; slug?: string; status?: TenantStatus },
): Promise<TenantDetailView | null> {
  const [existing] = await db.select().from(tenantsTable).where(eq(tenantsTable.id, id)).limit(1);
  if (!existing) return null;

  const name = input.name !== undefined ? input.name.trim() : existing.name;
  const slug = input.slug !== undefined ? slugify(input.slug) : existing.slug;
  const status = input.status === "inactive" ? "inactive" : input.status === "active" ? "active" : existing.status;

  if (!name) {
    throw new Error("name is required");
  }

  if (slug !== existing.slug) {
    const [slugConflict] = await db
      .select()
      .from(tenantsTable)
      .where(eq(tenantsTable.slug, slug))
      .limit(1);
    if (slugConflict && slugConflict.id !== id) {
      throw new ConflictError(`Tenant com slug "${slug}" já existe (${slugConflict.name}).`);
    }
  }

  try {
    const [updated] = await db
      .update(tenantsTable)
      .set({ name, slug, status, updatedAt: new Date() })
      .where(eq(tenantsTable.id, id))
      .returning();
    const stats = await countForTenant(updated.id);
    return { ...mapTenant(updated), ...stats };
  } catch (error) {
    if (isUniqueViolation(error, "tenants_slug_key")) {
      throw new ConflictError(`Tenant com slug "${slug}" já existe.`);
    }
    throw error;
  }
}

export async function deleteTenant(id: number): Promise<TenantView | null> {
  const [existing] = await db.select().from(tenantsTable).where(eq(tenantsTable.id, id)).limit(1);
  if (!existing) return null;

  const stats = await countForTenant(id);
  if (stats.connector_count > 0) {
    throw new ConflictError(
      `Não é possível excluir tenant com ${stats.connector_count} connector(s). Remova ou migre os connectors primeiro.`,
    );
  }

  const [deleted] = await db.delete(tenantsTable).where(eq(tenantsTable.id, id)).returning();
  return mapTenant(deleted);
}
