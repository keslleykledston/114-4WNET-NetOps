import { boolean, index, integer, json, pgTable, serial, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";

export const userRoleValues = ["viewer", "operator", "admin"] as const;
export type UserRole = (typeof userRoleValues)[number];

export type UserPermissions = {
  devices?: { read?: boolean; write?: boolean; import?: boolean; export?: boolean };
  compliance?: { read?: boolean; run?: boolean; export?: boolean };
  scheduler?: { read?: boolean; write?: boolean };
  integrations?: { read?: boolean; write?: boolean };
  users?: { read?: boolean; write?: boolean };
  audit?: { read?: boolean };
};

export const usersTable = pgTable("users", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull(),
  passwordHash: text("password_hash").notNull(),
  role: text("role").notNull().default("viewer"),
  enabled: boolean("enabled").notNull().default(true),
  permissionsJson: json("permissions_json").$type<UserPermissions>(),
  lastLoginAt: timestamp("last_login_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  emailUq: uniqueIndex("users_email_uq").on(table.email),
  roleIdx: index("users_role_idx").on(table.role),
}));

export const userSessionsTable = pgTable("user_sessions", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  tokenHash: text("token_hash").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  revokedAt: timestamp("revoked_at"),
}, (table) => ({
  tokenHashUq: uniqueIndex("user_sessions_token_hash_uq").on(table.tokenHash),
  userIdx: index("user_sessions_user_id_idx").on(table.userId),
  expiresIdx: index("user_sessions_expires_at_idx").on(table.expiresAt),
}));

export const userPasswordResetTokensTable = pgTable("user_password_reset_tokens", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  tokenHash: text("token_hash").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  usedAt: timestamp("used_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  tokenHashUq: uniqueIndex("user_password_reset_tokens_token_hash_uq").on(table.tokenHash),
  userIdx: index("user_password_reset_tokens_user_id_idx").on(table.userId),
  expiresIdx: index("user_password_reset_tokens_expires_at_idx").on(table.expiresAt),
}));
