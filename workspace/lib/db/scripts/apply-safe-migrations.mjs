import pg from "pg";

const { Pool } = pg;

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error("DATABASE_URL is required");
}

const pool = new Pool({ connectionString: databaseUrl });

const statements = [
  `ALTER TABLE collected_configs ADD COLUMN IF NOT EXISTS connector_id integer REFERENCES connectors(id) ON DELETE SET NULL`,
  `ALTER TABLE collected_configs ADD COLUMN IF NOT EXISTS source text`,
  `ALTER TABLE collected_configs ADD COLUMN IF NOT EXISTS connector_job_id integer`,
  `ALTER TABLE collected_configs ADD COLUMN IF NOT EXISTS parser_status text`,
  `ALTER TABLE collected_configs ADD COLUMN IF NOT EXISTS parser_error text`,
  `ALTER TABLE collected_configs ADD COLUMN IF NOT EXISTS parsed_summary_json jsonb`,
  `CREATE INDEX IF NOT EXISTS collected_configs_device_collected_idx ON collected_configs (device_id, collected_at DESC)`,
];

try {
  for (const statement of statements) {
    await pool.query(statement);
  }
  console.log(`Applied ${statements.length} safe migration statements`);
} finally {
  await pool.end();
}
