import { createHash } from "node:crypto";
import { and, desc, eq, lt, ne, or, sql } from "drizzle-orm";
import { collectedConfigsTable, configDiffsTable, db, devicesTable } from "@workspace/db";
import { logAuditEvent } from "../../lib/audit.js";

export type ConfigHistoryItem = {
  id: number;
  device_id: number;
  device_hostname: string | null;
  source: string | null;
  size_bytes: number;
  hash: string;
  parser_status: string | null;
  parser_error: string | null;
  collected_at: string;
  diff_id: number | null;
  previous_config_id: number | null;
};

export type ConfigDetailView = ConfigHistoryItem & {
  raw_config: string | null;
  connector_id: number | null;
  connector_job_id: number | null;
  parsed_summary_json: Record<string, unknown> | null;
};

export type ConfigDiffView = {
  id: number;
  device_id: number;
  previous_config_id: number | null;
  current_config_id: number;
  diff_summary: string | null;
  diff_text: string | null;
  created_at: string;
};

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function sizeBytes(value: string): number {
  return Buffer.byteLength(value, "utf8");
}

function lineDiff(previous: string, current: string): { text: string; added: number; removed: number; unchanged: number } {
  const a = previous.split(/\r?\n/);
  const b = current.split(/\r?\n/);
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));

  for (let i = m - 1; i >= 0; i -= 1) {
    for (let j = n - 1; j >= 0; j -= 1) {
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }

  const lines: string[] = [];
  let added = 0;
  let removed = 0;
  let unchanged = 0;
  let i = 0;
  let j = 0;
  while (i < m && j < n) {
    if (a[i] === b[j]) {
      lines.push(` ${a[i]}`);
      unchanged += 1;
      i += 1;
      j += 1;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      lines.push(`-${a[i]}`);
      removed += 1;
      i += 1;
    } else {
      lines.push(`+${b[j]}`);
      added += 1;
      j += 1;
    }
  }
  while (i < m) {
    lines.push(`-${a[i]}`);
    removed += 1;
    i += 1;
  }
  while (j < n) {
    lines.push(`+${b[j]}`);
    added += 1;
    j += 1;
  }

  return { text: lines.join("\n"), added, removed, unchanged };
}

function diffSummary(input: { previousId: number | null; added: number; removed: number; unchanged: number; previousHash?: string; currentHash: string }) {
  if (!input.previousId) {
    return `initial snapshot: ${input.added} lines, hash ${input.currentHash.slice(0, 12)}`;
  }
  if (input.previousHash === input.currentHash) {
    return `no changes: ${input.unchanged} unchanged lines`;
  }
  return `+${input.added} -${input.removed} unchanged ${input.unchanged}`;
}

function historyItem(row: {
  config: typeof collectedConfigsTable.$inferSelect;
  deviceHostname?: string | null;
  diffId?: number | null;
  previousConfigId?: number | null;
}): ConfigHistoryItem {
  const raw = row.config.rawConfig ?? "";
  return {
    id: row.config.id,
    device_id: row.config.deviceId,
    device_hostname: row.deviceHostname ?? null,
    source: row.config.source,
    size_bytes: sizeBytes(raw),
    hash: sha256(raw),
    parser_status: row.config.parserStatus,
    parser_error: row.config.parserError,
    collected_at: row.config.collectedAt.toISOString(),
    diff_id: row.diffId ?? null,
    previous_config_id: row.previousConfigId ?? null,
  };
}

export async function createConfigDiffForCollectedConfig(configId: number): Promise<ConfigDiffView | null> {
  const [current] = await db.select().from(collectedConfigsTable).where(eq(collectedConfigsTable.id, configId)).limit(1);
  if (!current) return null;

  const [existing] = await db
    .select()
    .from(configDiffsTable)
    .where(eq(configDiffsTable.currentConfigId, configId))
    .limit(1);
  if (existing) return toDiffView(existing);

  const [previous] = await db
    .select()
    .from(collectedConfigsTable)
    .where(
      and(
        eq(collectedConfigsTable.deviceId, current.deviceId),
        ne(collectedConfigsTable.id, current.id),
        or(
          lt(collectedConfigsTable.collectedAt, current.collectedAt),
          and(eq(collectedConfigsTable.collectedAt, current.collectedAt), lt(collectedConfigsTable.id, current.id)),
        ),
      ),
    )
    .orderBy(desc(collectedConfigsTable.collectedAt), desc(collectedConfigsTable.id))
    .limit(1);

  const currentRaw = current.rawConfig ?? "";
  const previousRaw = previous?.rawConfig ?? "";
  const generated = previous ? lineDiff(previousRaw, currentRaw) : {
    text: currentRaw.split(/\r?\n/).map((line) => `+${line}`).join("\n"),
    added: currentRaw ? currentRaw.split(/\r?\n/).length : 0,
    removed: 0,
    unchanged: 0,
  };
  const currentHash = sha256(currentRaw);
  const previousHash = previous ? sha256(previousRaw) : undefined;
  const summary = diffSummary({
    previousId: previous?.id ?? null,
    added: generated.added,
    removed: generated.removed,
    unchanged: generated.unchanged,
    previousHash,
    currentHash,
  });

  const [created] = await db
    .insert(configDiffsTable)
    .values({
      deviceId: current.deviceId,
      previousConfigId: previous?.id ?? null,
      currentConfigId: current.id,
      diffSummary: summary,
      diffText: generated.text,
    })
    .onConflictDoNothing({ target: configDiffsTable.currentConfigId })
    .returning();

  if (!created) {
    const [race] = await db
      .select()
      .from(configDiffsTable)
      .where(eq(configDiffsTable.currentConfigId, current.id))
      .limit(1);
    return race ? toDiffView(race) : null;
  }

  await logAuditEvent({
    action: "config_diff_created",
    objectType: "collected_config",
    objectId: String(current.id),
    metadata: {
      device_id: current.deviceId,
      previous_config_id: previous?.id ?? null,
      current_config_id: current.id,
      summary,
    },
  });

  return toDiffView(created);
}

function toDiffView(row: typeof configDiffsTable.$inferSelect): ConfigDiffView {
  return {
    id: row.id,
    device_id: row.deviceId,
    previous_config_id: row.previousConfigId,
    current_config_id: row.currentConfigId,
    diff_summary: row.diffSummary,
    diff_text: row.diffText,
    created_at: row.createdAt.toISOString(),
  };
}

export async function listDeviceConfigHistory(deviceId: number): Promise<ConfigHistoryItem[]> {
  const rows = await db
    .select({
      config: collectedConfigsTable,
      deviceHostname: devicesTable.hostname,
      diffId: configDiffsTable.id,
      previousConfigId: configDiffsTable.previousConfigId,
    })
    .from(collectedConfigsTable)
    .innerJoin(devicesTable, eq(collectedConfigsTable.deviceId, devicesTable.id))
    .leftJoin(configDiffsTable, eq(configDiffsTable.currentConfigId, collectedConfigsTable.id))
    .where(eq(collectedConfigsTable.deviceId, deviceId))
    .orderBy(desc(collectedConfigsTable.collectedAt), desc(collectedConfigsTable.id))
    .limit(200);
  return rows.map((row) => historyItem(row));
}

export async function getConfigById(configId: number): Promise<ConfigDetailView | null> {
  const [row] = await db
    .select({
      config: collectedConfigsTable,
      deviceHostname: devicesTable.hostname,
      diffId: configDiffsTable.id,
      previousConfigId: configDiffsTable.previousConfigId,
    })
    .from(collectedConfigsTable)
    .innerJoin(devicesTable, eq(collectedConfigsTable.deviceId, devicesTable.id))
    .leftJoin(configDiffsTable, eq(configDiffsTable.currentConfigId, collectedConfigsTable.id))
    .where(eq(collectedConfigsTable.id, configId))
    .limit(1);
  if (!row) return null;
  return {
    ...historyItem(row),
    raw_config: row.config.rawConfig,
    connector_id: row.config.connectorId,
    connector_job_id: row.config.connectorJobId,
    parsed_summary_json: (row.config.parsedSummaryJson as Record<string, unknown> | null) ?? null,
  };
}

export async function getConfigDiff(configId: number): Promise<ConfigDiffView | null> {
  const created = await createConfigDiffForCollectedConfig(configId);
  if (created) return created;
  const [row] = await db
    .select()
    .from(configDiffsTable)
    .where(eq(configDiffsTable.currentConfigId, configId))
    .limit(1);
  return row ? toDiffView(row) : null;
}

export async function backfillMissingConfigDiffs(limit = 500): Promise<number> {
  const rows = await db
    .select({ id: collectedConfigsTable.id })
    .from(collectedConfigsTable)
    .leftJoin(configDiffsTable, eq(configDiffsTable.currentConfigId, collectedConfigsTable.id))
    .where(sql`${configDiffsTable.id} IS NULL`)
    .orderBy(collectedConfigsTable.collectedAt, collectedConfigsTable.id)
    .limit(limit);
  let count = 0;
  for (const row of rows) {
    const diff = await createConfigDiffForCollectedConfig(row.id);
    if (diff) count += 1;
  }
  return count;
}
