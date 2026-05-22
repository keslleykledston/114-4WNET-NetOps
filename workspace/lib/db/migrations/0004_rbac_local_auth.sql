CREATE TABLE IF NOT EXISTS "users" (
  "id" serial PRIMARY KEY,
  "name" text NOT NULL,
  "email" text NOT NULL,
  "password_hash" text NOT NULL,
  "role" text NOT NULL DEFAULT 'viewer',
  "enabled" boolean NOT NULL DEFAULT true,
  "last_login_at" timestamp,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "users_email_uq" ON "users" ("email");
CREATE INDEX IF NOT EXISTS "users_role_idx" ON "users" ("role");

CREATE TABLE IF NOT EXISTS "user_sessions" (
  "id" serial PRIMARY KEY,
  "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "token_hash" text NOT NULL,
  "expires_at" timestamp NOT NULL,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "revoked_at" timestamp
);

CREATE UNIQUE INDEX IF NOT EXISTS "user_sessions_token_hash_uq" ON "user_sessions" ("token_hash");
CREATE INDEX IF NOT EXISTS "user_sessions_user_id_idx" ON "user_sessions" ("user_id");
CREATE INDEX IF NOT EXISTS "user_sessions_expires_at_idx" ON "user_sessions" ("expires_at");
