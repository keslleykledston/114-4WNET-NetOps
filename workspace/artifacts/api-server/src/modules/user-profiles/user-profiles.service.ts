import { eq } from "drizzle-orm";
import { db, userProfilesTable, usersTable, type NavModulesMap, type UserRole } from "@workspace/db";
import {
  NAV_MODULE_DEFINITIONS,
  allModulesEnabledMap,
  defaultOperatorModulesMap,
  defaultViewerModulesMap,
  sanitizeModulesMap,
} from "../../lib/nav-modules.js";

export type UserProfileRecord = {
  id: number;
  name: string;
  slug: string;
  description: string | null;
  modules: NavModulesMap;
  isSystem: boolean;
  createdAt: string;
  updatedAt: string;
};

function formatProfile(row: typeof userProfilesTable.$inferSelect): UserProfileRecord {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    description: row.description ?? null,
    modules: sanitizeModulesMap(row.modulesJson ?? {}),
    isSystem: row.isSystem,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function slugifyName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64) || "profile";
}

export async function ensureDefaultUserProfiles(): Promise<void> {
  const defaults: Array<{ slug: string; name: string; description: string; modules: NavModulesMap }> = [
    { slug: "admin", name: "Administrador", description: "Acesso total — todos os módulos habilitados.", modules: allModulesEnabledMap() },
    { slug: "operator", name: "Operador", description: "Perfil operacional padrão.", modules: defaultOperatorModulesMap() },
    { slug: "viewer", name: "Visualizador", description: "Perfil read-only padrão.", modules: defaultViewerModulesMap() },
  ];

  for (const item of defaults) {
    const [existing] = await db.select().from(userProfilesTable).where(eq(userProfilesTable.slug, item.slug)).limit(1);
    if (existing) continue;
    const now = new Date();
    await db.insert(userProfilesTable).values({
      name: item.name,
      slug: item.slug,
      description: item.description,
      modulesJson: item.modules,
      isSystem: true,
      createdAt: now,
      updatedAt: now,
    });
  }
}

export async function listUserProfiles(): Promise<UserProfileRecord[]> {
  const rows = await db.select().from(userProfilesTable).orderBy(userProfilesTable.name);
  return rows.map(formatProfile);
}

export async function getUserProfileById(id: number): Promise<UserProfileRecord | null> {
  const [row] = await db.select().from(userProfilesTable).where(eq(userProfilesTable.id, id)).limit(1);
  return row ? formatProfile(row) : null;
}

export async function getUserProfileBySlug(slug: string): Promise<UserProfileRecord | null> {
  const [row] = await db.select().from(userProfilesTable).where(eq(userProfilesTable.slug, slug)).limit(1);
  return row ? formatProfile(row) : null;
}

export async function createUserProfile(input: {
  name: string;
  description?: string;
  modules: NavModulesMap;
}): Promise<UserProfileRecord> {
  const name = input.name.trim();
  if (!name) throw new Error("Profile name is required");

  let slug = slugifyName(name);
  const [collision] = await db.select().from(userProfilesTable).where(eq(userProfilesTable.slug, slug)).limit(1);
  if (collision) slug = `${slug}-${Date.now()}`;

  const now = new Date();
  const [created] = await db.insert(userProfilesTable).values({
    name,
    slug,
    description: input.description?.trim() || null,
    modulesJson: sanitizeModulesMap(input.modules),
    isSystem: false,
    createdAt: now,
    updatedAt: now,
  }).returning();

  if (!created) throw new Error("Failed to create profile");
  return formatProfile(created);
}

export async function updateUserProfile(
  id: number,
  input: { name?: string; description?: string; modules?: NavModulesMap },
): Promise<UserProfileRecord> {
  const [existing] = await db.select().from(userProfilesTable).where(eq(userProfilesTable.id, id)).limit(1);
  if (!existing) throw new Error("Profile not found");

  if (existing.slug === "admin" && input.modules) {
    throw new Error("Admin profile always has all modules enabled");
  }

  const updateData: Partial<typeof userProfilesTable.$inferInsert> = { updatedAt: new Date() };
  if (typeof input.name === "string" && input.name.trim()) updateData.name = input.name.trim();
  if (typeof input.description === "string") updateData.description = input.description.trim() || null;
  if (input.modules) updateData.modulesJson = sanitizeModulesMap(input.modules);

  const [updated] = await db.update(userProfilesTable).set(updateData).where(eq(userProfilesTable.id, id)).returning();
  if (!updated) throw new Error("Profile not found");
  return formatProfile(updated);
}

export async function deleteUserProfile(id: number): Promise<void> {
  const [existing] = await db.select().from(userProfilesTable).where(eq(userProfilesTable.id, id)).limit(1);
  if (!existing) throw new Error("Profile not found");
  if (existing.isSystem) throw new Error("System profiles cannot be deleted");

  const assigned = await db.select({ id: usersTable.id }).from(usersTable).where(eq(usersTable.profileId, id)).limit(1);
  if (assigned.length > 0) throw new Error("Profile is assigned to users");

  await db.delete(userProfilesTable).where(eq(userProfilesTable.id, id));
}

export async function resolveUserNavModules(user: {
  role: UserRole;
  profileId: number | null;
}): Promise<{ modules: NavModulesMap; profileId: number | null; profileName: string | null; isAdminBypass: boolean }> {
  if (user.role === "admin") {
    return {
      modules: allModulesEnabledMap(),
      profileId: user.profileId,
      profileName: "Administrador",
      isAdminBypass: true,
    };
  }

  let profile = user.profileId ? await getUserProfileById(user.profileId) : null;
  if (!profile) {
    profile = await getUserProfileBySlug(user.role);
  }

  return {
    modules: profile?.modules ?? defaultViewerModulesMap(),
    profileId: profile?.id ?? null,
    profileName: profile?.name ?? null,
    isAdminBypass: false,
  };
}

export function getNavModuleCatalog() {
  return NAV_MODULE_DEFINITIONS;
}
