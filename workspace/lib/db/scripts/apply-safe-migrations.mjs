import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const { Pool } = pg;

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error("DATABASE_URL is required");
}

const __dirname = dirname(fileURLToPath(import.meta.url));
const migrationsDir = process.env["MIGRATIONS_DIR"]?.trim() || join(__dirname, "..", "migrations");
const migrationTable = "schema_migrations";
const migrationLockKey = 587213469;

function checksum(content) {
  return createHash("sha256").update(content).digest("hex");
}

async function ensureMigrationTable(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS ${migrationTable} (
      version text PRIMARY KEY,
      checksum text NOT NULL,
      applied_at timestamptz NOT NULL DEFAULT now()
    )
  `);
}

async function loadAppliedMigrations(client) {
  const { rows } = await client.query(`SELECT version, checksum FROM ${migrationTable} ORDER BY version`);
  return new Map(rows.map((row) => [row.version, row.checksum]));
}

async function main() {
  const pool = new Pool({ connectionString: databaseUrl });
  const client = await pool.connect();

  try {
    await client.query(`SELECT pg_advisory_lock(${migrationLockKey})`);
    await ensureMigrationTable(client);
    const applied = await loadAppliedMigrations(client);
    const files = (await readdir(migrationsDir))
      .filter((file) => file.endsWith(".sql"))
      .sort();

    let appliedCount = 0;
    for (const file of files) {
      const version = file;
      const fullPath = join(migrationsDir, file);
      const sql = await readFile(fullPath, "utf8");
      const hash = checksum(sql);
      const existing = applied.get(version);

      if (existing) {
        if (existing !== hash) {
          throw new Error(
            `Migration checksum mismatch for ${version}. Expected ${existing}, got ${hash}. Refusing to continue.`,
          );
        }
        continue;
      }

      await client.query("BEGIN");
      try {
        await client.query(sql);
        await client.query(
          `INSERT INTO ${migrationTable} (version, checksum, applied_at) VALUES ($1, $2, now())`,
          [version, hash],
        );
        await client.query("COMMIT");
        appliedCount += 1;
        console.log(`Applied migration ${version}`);
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      }
    }

    console.log(`Migration check complete. Applied ${appliedCount} pending migration(s).`);
  } finally {
    try {
      await client.query(`SELECT pg_advisory_unlock(${migrationLockKey})`);
    } catch {
      // ignore unlock errors during shutdown
    }
    client.release();
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : String(error));
  process.exit(1);
});
