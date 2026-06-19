import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { access, copyFile, mkdir, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { Response } from "express";
import { and, desc, eq, gt, isNull } from "drizzle-orm";
import { db, pool } from "@workspace/db";
import { systemUpdateBackupsTable, systemUpdateChecksTable, systemUpdateRunsTable, systemUpdateStepsTable, systemVersionsTable, type SystemUpdateBackup, type SystemUpdateCheck, type SystemUpdateRun, type SystemUpdateStep, type SystemVersion } from "@workspace/db/schema";
import { env } from "../../lib/env.js";
import { getRequestContext } from "../../lib/request-context.js";
import { getRequestSourceIp, logAuditEvent, sanitizeAuditMetadata } from "../../lib/audit.js";
import {
  SYSTEM_UPDATE_STEP_NAMES,
  classifyImpactFile,
  estimateRiskLevel,
  findRepoRoot,
  formatVersionLabel,
  parseGitRemoteUrl,
  sanitizeShellOutput,
  type SystemUpdateChannel,
  type SystemUpdateRiskLevel,
  type SystemUpdateStatus,
  type SystemUpdateStepName,
  type SystemUpdateStepStatus,
} from "./system-update.utils.js";

const ACTIVE_LOCK_KEY = 734_118_221;
const activeRuns = new Map<number, RunContext>();
const eventStreams = new Map<number, Set<Response>>();

const repoRoot = findRepoRoot(process.cwd());

function assertSystemUpdateEnabled() {
  if (!env.systemUpdateEnabled) {
    throw new Error("System update module disabled");
  }
}

export type SystemUpdateVersionSnapshot = {
  version: string;
  commit: string;
  branch: string;
  tag: string | null;
  buildId: string | null;
  installedAt: string;
  installedBy: string | null;
  source: string;
  status: string;
  repo: string | null;
};

export type SystemUpdateStatusSnapshot = {
  current: SystemUpdateVersionSnapshot;
  lastCheck: SystemUpdateCheck | null;
  lastRun: SystemUpdateRun | null;
  lastSuccessfulRun: SystemUpdateRun | null;
  lastRollbackRun: SystemUpdateRun | null;
  state:
    | "updated"
    | "update_available"
    | "update_in_progress"
    | "rollback_in_progress"
    | "failed_last_update"
    | "rollback_done";
};

export type SystemUpdateCheckResult = {
  currentVersion: string;
  currentCommit: string;
  currentBranch: string;
  currentTag: string | null;
  remoteVersion: string;
  remoteCommit: string;
  remoteBranch: string;
  updateAvailable: boolean;
  channel: SystemUpdateChannel;
  commitsPending: number;
  changelog: string;
  migrationsPending: string[];
  highImpactFiles: Array<{ path: string; impact: "high" | "medium" | "low" }>;
  riskLevel: SystemUpdateRiskLevel;
  sourceRepo: string | null;
  remoteRef: string;
  metadata: Record<string, unknown>;
};

export type SystemUpdateStepView = {
  id: number;
  runId: number;
  stepName: string;
  stepOrder: number;
  status: SystemUpdateStepStatus;
  startedAt: string | null;
  finishedAt: string | null;
  durationMs: number | null;
  sanitizedOutput: string | null;
  errorMessage: string | null;
  metadataJson: Record<string, unknown> | null;
};

export type SystemUpdateRunView = {
  id: number;
  requestedBy: string | null;
  status: SystemUpdateStatus;
  fromVersion: string;
  fromCommit: string;
  toVersion: string;
  toCommit: string;
  channel: SystemUpdateChannel;
  startedAt: string | null;
  finishedAt: string | null;
  failedAt: string | null;
  failureStage: string | null;
  failureReason: string | null;
  rollbackStartedAt: string | null;
  rollbackFinishedAt: string | null;
  rollbackStatus: string | null;
  backupId: number | null;
  metadataJson: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
  steps: SystemUpdateStepView[];
  backups: Array<{
    id: number;
    runId: number;
    backupType: string;
    path: string;
    checksum: string | null;
    sizeBytes: number | null;
    status: string;
    createdAt: string;
    metadataJson: Record<string, unknown> | null;
  }>;
};

type RunContext = {
  abortController: AbortController;
  status: "running" | "rollback" | "idle";
  lockedClient: AdvisoryLockClient | null;
  child: ReturnType<typeof spawn> | null;
};

type AdvisoryLockClient = {
  query: (text: string, params?: unknown[]) => Promise<{ rows: Array<{ locked?: boolean }> }>;
  release: () => void;
};

function parseJsonRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function toIso(value: Date | null | undefined): string | null {
  return value?.toISOString() ?? null;
}

function shortHash(value: string) {
  return value.slice(0, 12);
}

function buildVersionString(describeValue: string | null, commit: string) {
  const shortCommit = shortHash(commit);
  if (describeValue && describeValue.trim()) {
    return `${describeValue.trim()} (${shortCommit})`;
  }
  return shortCommit;
}

async function runCommand(command: string, args: string[], options: { cwd: string; env?: NodeJS.ProcessEnv; timeoutMs?: number; signal?: AbortSignal; context?: { child: ReturnType<typeof spawn> | null } }) {
  const started = Date.now();
  return await new Promise<{ code: number; stdout: string; stderr: string; durationMs: number }>((resolveResult, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: { ...process.env, ...options.env },
      shell: false,
    });
    if (options.context) {
      options.context.child = child;
    }

    let stdout = "";
    let stderr = "";
    const timeout = options.timeoutMs
      ? setTimeout(() => {
          child.kill("SIGTERM");
          setTimeout(() => child.kill("SIGKILL"), 5_000).unref?.();
        }, options.timeoutMs)
      : null;

    options.signal?.addEventListener("abort", () => {
      child.kill("SIGTERM");
      setTimeout(() => child.kill("SIGKILL"), 5_000).unref?.();
    });

    child.stdout.on("data", (chunk) => {
      stdout += String(chunk);
    });
    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });
    child.on("error", (error) => {
      if (options.context && options.context.child === child) {
        options.context.child = null;
      }
      if (timeout) clearTimeout(timeout);
      reject(error);
    });
    child.on("close", (code) => {
      if (options.context && options.context.child === child) {
        options.context.child = null;
      }
      if (timeout) clearTimeout(timeout);
      if (code === 0) {
        resolveResult({
          code: 0,
          stdout: sanitizeShellOutput(stdout),
          stderr: sanitizeShellOutput(stderr),
          durationMs: Date.now() - started,
        });
        return;
      }
      reject(new Error(sanitizeShellOutput(`${command} ${args.join(" ")} failed (${code ?? "unknown"})\n${stdout}\n${stderr}`)));
    });
  });
}

async function git(args: string[], opts?: { timeoutMs?: number; signal?: AbortSignal }) {
  return await runCommand("git", args, { cwd: repoRoot, timeoutMs: opts?.timeoutMs ?? env.systemUpdateStepTimeoutSeconds * 1000, signal: opts?.signal });
}

async function gitOutput(args: string[], opts?: { timeoutMs?: number; signal?: AbortSignal }) {
  const result = await runCommand("git", args, { cwd: repoRoot, timeoutMs: opts?.timeoutMs ?? env.systemUpdateStepTimeoutSeconds * 1000, signal: opts?.signal });
  return result.stdout.trim();
}

async function detectGitInfo(signal?: AbortSignal) {
  const [commit, branch, tag, status, remoteUrl] = await Promise.all([
    gitOutput(["rev-parse", "HEAD"], { signal }),
    gitOutput(["branch", "--show-current"], { signal }).catch(() => "HEAD"),
    gitOutput(["describe", "--tags", "--abbrev=0"], { signal }).catch(() => null),
    gitOutput(["status", "--short"], { signal }).catch(() => ""),
    gitOutput(["remote", "get-url", env.systemUpdateGitRemote], { signal }).catch(() => null),
  ]);

  return {
    commit,
    branch: branch || "HEAD",
    tag: tag || null,
    status,
    remoteUrl,
    sourceRepo: env.systemUpdateGithubRepo || parseGitRemoteUrl(remoteUrl),
  };
}

async function ensureCurrentVersionRecorded(snapshot: { version: string; commit: string; branch: string; tag: string | null; sourceRepo: string | null }) {
  const [latest] = await db.select().from(systemVersionsTable).orderBy(desc(systemVersionsTable.installedAt)).limit(1);
  if (latest && latest.gitCommit === snapshot.commit) {
    return latest;
  }
  const now = new Date();
  const [record] = await db.insert(systemVersionsTable).values({
    version: snapshot.version,
    gitCommit: snapshot.commit,
    gitBranch: snapshot.branch,
    gitTag: snapshot.tag,
    buildId: process.env["BUILD_ID"] ?? null,
    installedAt: now,
    installedBy: getRequestContext()?.user?.email ?? "system",
    source: snapshot.sourceRepo ?? "local_git",
    status: "installed",
    metadataJson: {
      repoRoot,
    },
    createdAt: now,
  }).returning();
  return record;
}

async function readLatestCheck() {
  const [check] = await db.select().from(systemUpdateChecksTable).orderBy(desc(systemUpdateChecksTable.createdAt)).limit(1);
  return check ?? null;
}

async function readLatestRun() {
  const [run] = await db.select().from(systemUpdateRunsTable).orderBy(desc(systemUpdateRunsTable.createdAt)).limit(1);
  return run ?? null;
}

async function readLatestSuccessfulRun() {
  const [run] = await db.select().from(systemUpdateRunsTable).where(eq(systemUpdateRunsTable.status, "success")).orderBy(desc(systemUpdateRunsTable.createdAt)).limit(1);
  return run ?? null;
}

async function readLatestRollbackRun() {
  const [run] = await db.select().from(systemUpdateRunsTable).where(eq(systemUpdateRunsTable.status, "rolled_back")).orderBy(desc(systemUpdateRunsTable.createdAt)).limit(1);
  return run ?? null;
}

async function listStepsForRun(runId: number) {
  const rows = await db.select().from(systemUpdateStepsTable).where(eq(systemUpdateStepsTable.runId, runId)).orderBy(systemUpdateStepsTable.stepOrder);
  return rows.map(serializeStep);
}

async function listBackupsForRun(runId: number) {
  const rows = await db.select().from(systemUpdateBackupsTable).where(eq(systemUpdateBackupsTable.runId, runId)).orderBy(desc(systemUpdateBackupsTable.createdAt));
  return rows.map((row) => ({
    id: row.id,
    runId: row.runId,
    backupType: row.backupType,
    path: row.path,
    checksum: row.checksum,
    sizeBytes: row.sizeBytes ?? null,
    status: row.status,
    createdAt: row.createdAt.toISOString(),
    metadataJson: parseJsonRecord(row.metadataJson),
  }));
}

function serializeStep(step: SystemUpdateStep): SystemUpdateStepView {
  return {
    id: step.id,
    runId: step.runId,
    stepName: step.stepName,
    stepOrder: step.stepOrder,
    status: step.status as SystemUpdateStepStatus,
    startedAt: toIso(step.startedAt),
    finishedAt: toIso(step.finishedAt),
    durationMs: step.durationMs ?? null,
    sanitizedOutput: step.sanitizedOutput ?? null,
    errorMessage: step.errorMessage ?? null,
    metadataJson: parseJsonRecord(step.metadataJson),
  };
}

async function serializeRun(run: SystemUpdateRun): Promise<SystemUpdateRunView> {
  const [steps, backups] = await Promise.all([listStepsForRun(run.id), listBackupsForRun(run.id)]);
  return {
    id: run.id,
    requestedBy: run.requestedBy,
    status: run.status as SystemUpdateStatus,
    fromVersion: run.fromVersion,
    fromCommit: run.fromCommit,
    toVersion: run.toVersion,
    toCommit: run.toCommit,
    channel: run.channel as SystemUpdateChannel,
    startedAt: toIso(run.startedAt),
    finishedAt: toIso(run.finishedAt),
    failedAt: toIso(run.failedAt),
    failureStage: run.failureStage ?? null,
    failureReason: run.failureReason ?? null,
    rollbackStartedAt: toIso(run.rollbackStartedAt),
    rollbackFinishedAt: toIso(run.rollbackFinishedAt),
    rollbackStatus: run.rollbackStatus ?? null,
    backupId: run.backupId ?? null,
    metadataJson: parseJsonRecord(run.metadataJson),
    createdAt: run.createdAt.toISOString(),
    updatedAt: run.updatedAt.toISOString(),
    steps,
    backups,
  };
}

async function upsertStep(runId: number, stepName: SystemUpdateStepName, stepOrder: number, values: Partial<SystemUpdateStep> & { status: SystemUpdateStepStatus }) {
  const [existing] = await db.select().from(systemUpdateStepsTable).where(and(eq(systemUpdateStepsTable.runId, runId), eq(systemUpdateStepsTable.stepName, stepName))).limit(1);
  const now = new Date();
  if (existing) {
    await db.update(systemUpdateStepsTable).set({
      status: values.status,
      startedAt: values.startedAt ?? existing.startedAt,
      finishedAt: values.finishedAt ?? existing.finishedAt,
      durationMs: values.durationMs ?? existing.durationMs,
      sanitizedOutput: values.sanitizedOutput ?? existing.sanitizedOutput,
      errorMessage: values.errorMessage ?? existing.errorMessage,
      metadataJson: values.metadataJson ?? existing.metadataJson,
    }).where(eq(systemUpdateStepsTable.id, existing.id));
    return existing.id;
  }
  const [inserted] = await db.insert(systemUpdateStepsTable).values({
    runId,
    stepName,
    stepOrder,
    status: values.status,
    startedAt: values.startedAt ?? now,
    finishedAt: values.finishedAt ?? null,
    durationMs: values.durationMs ?? null,
    sanitizedOutput: values.sanitizedOutput ?? null,
    errorMessage: values.errorMessage ?? null,
    metadataJson: values.metadataJson ?? null,
  }).returning();
  return inserted.id;
}

async function updateRun(runId: number, patch: Partial<SystemUpdateRun>) {
  await db.update(systemUpdateRunsTable).set({
    ...patch,
    updatedAt: new Date(),
  }).where(eq(systemUpdateRunsTable.id, runId));
}

function getRunContext(runId: number): RunContext | undefined {
  return activeRuns.get(runId);
}

function ensureRunContext(runId: number): RunContext {
  const existing = activeRuns.get(runId);
  if (existing) return existing;
  const context: RunContext = {
    abortController: new AbortController(),
    status: "idle",
    lockedClient: null,
    child: null,
  };
  activeRuns.set(runId, context);
  return context;
}

function emitRunEvent(runId: number, payload: Record<string, unknown>) {
  const streams = eventStreams.get(runId);
  if (!streams) return;
  const body = `event: update\ndata: ${JSON.stringify({ runId, ...payload })}\n\n`;
  for (const response of streams) {
    response.write(body);
  }
}

export function subscribeRunEvents(runId: number, res: Response) {
  const listeners = eventStreams.get(runId) ?? new Set<Response>();
  listeners.add(res);
  eventStreams.set(runId, listeners);
  res.write(`event: update\ndata: ${JSON.stringify({ runId, type: "connected" })}\n\n`);
  const heartbeat = setInterval(() => {
    res.write(`event: ping\ndata: ${JSON.stringify({ runId, ts: new Date().toISOString() })}\n\n`);
  }, 15_000);
  const cleanup = () => {
    clearInterval(heartbeat);
    const current = eventStreams.get(runId);
    current?.delete(res);
    if (current && current.size === 0) eventStreams.delete(runId);
  };
  res.on("close", cleanup);
  res.on("finish", cleanup);
}

async function writeTextFile(pathname: string, content: string) {
  await mkdir(resolve(pathname, ".."), { recursive: true });
  await writeFile(pathname, content, "utf8");
}

async function copyTrackedFile(sourcePath: string, targetPath: string) {
  await mkdir(resolve(targetPath, ".."), { recursive: true });
  await copyFile(sourcePath, targetPath);
}

async function fileChecksum(pathname: string) {
  const content = await readFile(pathname);
  return createHash("sha256").update(content).digest("hex");
}

async function buildConfigBackup(runId: number, backupDir: string) {
  await mkdir(backupDir, { recursive: true });
  const snapshotDir = join(backupDir, "config");
  await mkdir(snapshotDir, { recursive: true });
  const trackedFiles = ["docker-compose.yml", ".env.example"];
  const metadata: Record<string, unknown> = { files: [] as Array<{ path: string; checksum: string; sizeBytes: number }> };

  for (const relativePath of trackedFiles) {
    const source = resolve(repoRoot, relativePath);
    try {
      await access(source);
    } catch {
      continue;
    }
    const target = join(snapshotDir, relativePath.replaceAll("/", "__"));
    await copyTrackedFile(source, target);
    const checksum = await fileChecksum(source);
    const sizeBytes = (await stat(source)).size;
    (metadata.files as Array<{ path: string; checksum: string; sizeBytes: number }>).push({ path: relativePath, checksum, sizeBytes });
  }

  const envPath = resolve(repoRoot, ".env");
  try {
    const envContent = await readFile(envPath, "utf8");
    const sanitized = envContent
      .split("\n")
      .map((line) => {
        const idx = line.indexOf("=");
        if (idx <= 0) return line;
        const key = line.slice(0, idx).trim();
        return /password|secret|token|key|cookie|auth/i.test(key) ? `${key}=[redacted]` : `${key}=[redacted]`;
      })
      .join("\n");
    await writeTextFile(join(snapshotDir, "env.sanitized"), sanitized);
    (metadata.files as Array<{ path: string; checksum: string; sizeBytes: number }>).push({
      path: ".env.sanitized",
      checksum: createHash("sha256").update(sanitized).digest("hex"),
      sizeBytes: Buffer.byteLength(sanitized),
    });
  } catch {
    // Ignore missing .env in local checkout.
  }

  const manifest = JSON.stringify(metadata, null, 2);
  await writeTextFile(join(snapshotDir, "manifest.json"), manifest);
  const checksum = createHash("sha256").update(manifest).digest("hex");
  const sizeBytes = Buffer.byteLength(manifest);
  const [backup] = await db.insert(systemUpdateBackupsTable).values({
    runId,
    backupType: "config_bundle",
    path: snapshotDir,
    checksum,
    sizeBytes,
    status: "created",
    metadataJson: metadata,
  }).returning();
  return backup;
}

async function buildDatabaseBackup(runId: number, backupDir: string) {
  const databaseUrl = process.env["DATABASE_URL"]?.trim();
  if (!databaseUrl) {
    throw new Error("DATABASE_URL missing");
  }
  const dumpPath = join(backupDir, `database-${runId}.dump`);
  const result = await runCommand("pg_dump", ["--format=custom", "--file", dumpPath, databaseUrl], {
    cwd: repoRoot,
    timeoutMs: env.systemUpdateStepTimeoutSeconds * 1000,
  });
  const checksum = await fileChecksum(dumpPath);
  const sizeBytes = (await stat(dumpPath)).size;
  const [backup] = await db.insert(systemUpdateBackupsTable).values({
    runId,
    backupType: "database",
    path: dumpPath,
    checksum,
    sizeBytes,
    status: "created",
    metadataJson: {
      stdout: result.stdout,
      stderr: result.stderr,
    },
  }).returning();
  return backup;
}

async function restoreDatabaseBackup(backupPath: string, signal?: AbortSignal) {
  const databaseUrl = process.env["DATABASE_URL"]?.trim();
  if (!databaseUrl) {
    throw new Error("DATABASE_URL missing");
  }
  await runCommand("pg_restore", ["--clean", "--if-exists", "--no-owner", "--dbname", databaseUrl, backupPath], {
    cwd: repoRoot,
    timeoutMs: env.systemUpdateStepTimeoutSeconds * 1000,
    signal,
  });
}

async function runHealthcheck(url: string, timeoutSeconds: number) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutSeconds * 1000);
  try {
    const response = await fetch(url, { signal: controller.signal, credentials: "omit" });
    if (!response.ok) {
      throw new Error(`Healthcheck failed: ${response.status}`);
    }
    return await response.text();
  } finally {
    clearTimeout(timeout);
  }
}

async function resolveTargetCommit(signal?: AbortSignal) {
  const remoteBranch = env.systemUpdateGitBranch;
  await git(["fetch", env.systemUpdateGitRemote, "--tags", "--prune"], { signal });
  const commit = await gitOutput(["rev-parse", `${env.systemUpdateGitRemote}/${remoteBranch}`], { signal });
  const tag = await gitOutput(["describe", "--tags", "--abbrev=0", commit], { signal }).catch(() => null);
  const version = buildVersionString(tag, commit);
  return { remoteBranch, remoteCommit: commit, remoteTag: tag, remoteVersion: version };
}

async function buildChangeSummary(currentCommit: string, remoteCommit: string) {
  const [log, changedFiles] = await Promise.all([
    gitOutput(["log", "--oneline", "--no-merges", "--max-count=50", `${currentCommit}..${remoteCommit}`]).catch(() => ""),
    gitOutput(["diff", "--name-only", `${currentCommit}..${remoteCommit}`]).catch(() => ""),
  ]);
  const files = changedFiles.split("\n").map((item) => item.trim()).filter(Boolean);
  return {
    commitsPending: log ? log.split("\n").filter(Boolean).length : 0,
    changelog: log,
    files,
    migrationsPending: files.filter((file) => file.includes("/migrations/") || file.startsWith("workspace/lib/db/migrations/")),
    highImpactFiles: files.filter((file) => classifyImpactFile(file) !== "low"),
    riskLevel: estimateRiskLevel(files),
  };
}

async function tryAcquireGlobalLock(client: AdvisoryLockClient) {
  const result = await client.query("SELECT pg_try_advisory_lock($1) AS locked", [ACTIVE_LOCK_KEY]);
  return Boolean(result.rows[0]?.locked);
}

async function releaseGlobalLock(client: AdvisoryLockClient) {
  try {
    await client.query("SELECT pg_advisory_unlock($1)", [ACTIVE_LOCK_KEY]);
  } catch {
    // ignore
  }
}

async function runStep(runId: number, stepName: SystemUpdateStepName, stepOrder: number, fn: () => Promise<{ output?: string; metadata?: Record<string, unknown> }>) {
  const startedAt = new Date();
  await upsertStep(runId, stepName, stepOrder, { status: "running", startedAt, metadataJson: { startedAt: startedAt.toISOString() } });
  emitRunEvent(runId, { type: "step", stepName, status: "running" });
  try {
    const result = await fn();
    const finishedAt = new Date();
    await upsertStep(runId, stepName, stepOrder, {
      status: "success",
      startedAt,
      finishedAt,
      durationMs: finishedAt.getTime() - startedAt.getTime(),
      sanitizedOutput: result.output ? sanitizeShellOutput(result.output) : null,
      metadataJson: result.metadata ?? null,
    });
    emitRunEvent(runId, { type: "step", stepName, status: "success" });
    return result;
  } catch (error) {
    const finishedAt = new Date();
    const message = error instanceof Error ? error.message : String(error);
    await upsertStep(runId, stepName, stepOrder, {
      status: "failed",
      startedAt,
      finishedAt,
      durationMs: finishedAt.getTime() - startedAt.getTime(),
      errorMessage: sanitizeShellOutput(message),
    });
    emitRunEvent(runId, { type: "step", stepName, status: "failed", error: sanitizeShellOutput(message) });
    throw error;
  }
}

async function rollbackRun(runId: number, reason: string, sourceRun: Pick<SystemUpdateRun, "fromCommit" | "fromVersion" | "backupId" | "toCommit">, signal?: AbortSignal, context?: RunContext) {
  await updateRun(runId, {
    status: "rollback_in_progress",
    rollbackStartedAt: new Date(),
    rollbackStatus: "running",
    failureReason: reason,
  } as Partial<SystemUpdateRun>);
  emitRunEvent(runId, { type: "rollback", status: "running", reason });

  const targetCommit = sourceRun.fromCommit;
  const backup = sourceRun.backupId
    ? await db.select().from(systemUpdateBackupsTable).where(eq(systemUpdateBackupsTable.id, sourceRun.backupId)).limit(1).then((rows) => rows[0] ?? null)
    : null;

  try {
    if (backup?.backupType === "database") {
      await restoreDatabaseBackup(backup.path, signal);
    }
    await git(["reset", "--hard", targetCommit], { signal });
    await git(["clean", "-fd"], { signal });
    await runCommand("docker", ["compose", "up", "-d", "--build", "api", "web", "migrate"], { cwd: repoRoot, timeoutMs: env.systemUpdateStepTimeoutSeconds * 1000, signal, context });
    await runHealthcheck("http://127.0.0.1:8080/api/healthz", env.systemUpdateHealthcheckTimeoutSeconds);
    await updateRun(runId, {
      status: "rolled_back",
      rollbackFinishedAt: new Date(),
      rollbackStatus: "success",
      finishedAt: new Date(),
    } as Partial<SystemUpdateRun>);
    emitRunEvent(runId, { type: "rollback", status: "success" });
  } catch (error) {
    const reasonText = error instanceof Error ? error.message : String(error);
    await updateRun(runId, {
      status: "rollback_failed",
      rollbackFinishedAt: new Date(),
      rollbackStatus: "failed",
      failureReason: sanitizeShellOutput(reasonText),
      finishedAt: new Date(),
    } as Partial<SystemUpdateRun>);
    emitRunEvent(runId, { type: "rollback", status: "failed", error: sanitizeShellOutput(reasonText) });
    throw error;
  }
}

async function executeRun(runId: number) {
  const context = ensureRunContext(runId);
  context.status = "running";
  const lockedClient = (await pool.connect()) as unknown as AdvisoryLockClient;
  context.lockedClient = lockedClient;
  const run = await db.select().from(systemUpdateRunsTable).where(eq(systemUpdateRunsTable.id, runId)).limit(1).then((rows) => rows[0] ?? null);
  if (!run) {
    await releaseGlobalLock(lockedClient);
    lockedClient.release();
    return;
  }

  try {
    if (!(await tryAcquireGlobalLock(lockedClient))) {
      throw new Error("System update lock already held");
    }

    await updateRun(runId, { status: "running", startedAt: new Date(), failureStage: null, failureReason: null } as Partial<SystemUpdateRun>);
    emitRunEvent(runId, { type: "run", status: "running" });

    const backupDir = join(env.systemUpdateBackupDir, `run-${runId}-${Date.now()}`);

    await runStep(runId, "precheck", 1, async () => {
      const gitInfo = await detectGitInfo(context.abortController.signal);
      if (env.systemUpdateRequireCleanTree && gitInfo.status.trim()) {
        throw new Error(`Working tree not clean: ${gitInfo.status}`);
      }
      const target = await resolveTargetCommit(context.abortController.signal);
      await updateRun(runId, {
        metadataJson: {
          ...(run.metadataJson as Record<string, unknown> | null),
          targetCommit: target.remoteCommit,
          targetVersion: target.remoteVersion,
          targetBranch: target.remoteBranch,
        },
      } as Partial<SystemUpdateRun>);
      return { output: `Current commit ${gitInfo.commit}; target ${target.remoteCommit}` };
    });

    let configBackup: SystemUpdateBackup | null = null;
    let databaseBackup: SystemUpdateBackup | null = null;

    await runStep(runId, "backup", 2, async () => {
      await mkdir(backupDir, { recursive: true });
      configBackup = await buildConfigBackup(runId, backupDir);
      try {
        databaseBackup = await buildDatabaseBackup(runId, backupDir);
      } catch (error) {
        throw new Error(`Database backup failed: ${error instanceof Error ? error.message : String(error)}`);
      }
      const backupId = (databaseBackup as { id?: number } | null)?.id ?? (configBackup as { id?: number } | null)?.id ?? null;
      await updateRun(runId, { backupId } as Partial<SystemUpdateRun>);
      return { output: `Backups created in ${backupDir}`, metadata: { backupDir } };
    });

    const target = await resolveTargetCommit(context.abortController.signal);
    const current = await detectGitInfo(context.abortController.signal);

    await runStep(runId, "git_fetch", 3, async () => {
      const result = await git(["fetch", env.systemUpdateGitRemote, "--tags", "--prune"], { signal: context.abortController.signal });
      return { output: result.stdout || "fetch complete" };
    });

    await runStep(runId, "checkout_target", 4, async () => {
      await git(["checkout", target.remoteCommit], { signal: context.abortController.signal });
      return { output: `Checked out ${target.remoteCommit}` };
    });

    await runStep(runId, "build_backend", 5, async () => {
      const result = await runCommand("pnpm", ["--filter", "@workspace/api-server", "run", "build"], {
        cwd: repoRoot,
        timeoutMs: env.systemUpdateStepTimeoutSeconds * 1000,
        signal: context.abortController.signal,
        context,
      });
      return { output: result.stdout };
    });

    await runStep(runId, "build_frontend", 6, async () => {
      const result = await runCommand("pnpm", ["--filter", "@workspace/netops-manager", "run", "build"], {
        cwd: repoRoot,
        env: {
          BASE_PATH: process.env["BASE_PATH"]?.trim() || "/",
          PORT: process.env["PORT"]?.trim() || "3000",
        },
        timeoutMs: env.systemUpdateStepTimeoutSeconds * 1000,
        signal: context.abortController.signal,
        context,
      });
      return { output: result.stdout };
    });

    await runStep(runId, "tests", 7, async () => {
      const result = await runCommand("pnpm", ["--filter", "@workspace/api-server", "run", "typecheck:system-update"], {
        cwd: resolve(repoRoot, "workspace"),
        timeoutMs: env.systemUpdateStepTimeoutSeconds * 1000,
        signal: context.abortController.signal,
        context,
      });
      const frontend = await runCommand("pnpm", ["--filter", "@workspace/netops-manager", "run", "typecheck:system-update"], {
        cwd: resolve(repoRoot, "workspace"),
        timeoutMs: env.systemUpdateStepTimeoutSeconds * 1000,
        signal: context.abortController.signal,
        context,
      });
      const selftest = await runCommand("node", ["tools/system-update-selftest.mjs"], {
        cwd: repoRoot,
        timeoutMs: env.systemUpdateStepTimeoutSeconds * 1000,
        signal: context.abortController.signal,
        context,
      });
      return { output: [result.stdout, frontend.stdout, selftest.stdout].filter(Boolean).join("\n") };
    });

    await runStep(runId, "migrations", 8, async () => {
      const result = await runCommand("pnpm", ["--filter", "@workspace/db", "run", "migrate:safe"], {
        cwd: resolve(repoRoot, "workspace"),
        timeoutMs: env.systemUpdateStepTimeoutSeconds * 1000,
        signal: context.abortController.signal,
        context,
      });
      return { output: result.stdout };
    });

    await runStep(runId, "restart", 9, async () => {
      const result = await runCommand("docker", ["compose", "up", "-d", "--build", "api", "web", "migrate"], {
        cwd: repoRoot,
        timeoutMs: env.systemUpdateStepTimeoutSeconds * 1000,
        signal: context.abortController.signal,
        context,
      });
      return { output: result.stdout };
    });

    await runStep(runId, "healthcheck", 10, async () => {
      await runHealthcheck("http://127.0.0.1:8080/api/healthz", env.systemUpdateHealthcheckTimeoutSeconds);
      await runHealthcheck("http://127.0.0.1:3000/", env.systemUpdateHealthcheckTimeoutSeconds);
      return { output: "API and frontend healthchecks passed" };
    });

    await runStep(runId, "validation", 11, async () => {
      const gitInfo = await detectGitInfo(context.abortController.signal);
      if (gitInfo.commit !== target.remoteCommit) {
        throw new Error(`Expected ${target.remoteCommit}, got ${gitInfo.commit}`);
      }
      return { output: `Current commit ${gitInfo.commit}` };
    });

    const installedVersion = buildVersionString(target.remoteTag, target.remoteCommit);
    await db.insert(systemVersionsTable).values({
      version: installedVersion,
      gitCommit: target.remoteCommit,
      gitBranch: target.remoteBranch,
      gitTag: target.remoteTag,
      buildId: process.env["BUILD_ID"] ?? null,
      installedAt: new Date(),
      installedBy: run.requestedBy ?? "system",
      source: env.systemUpdateGithubRepo || "local_git",
      status: "installed",
      metadataJson: {
        runId,
        previousCommit: current.commit,
        backupId: (databaseBackup as { id?: number } | null)?.id ?? (configBackup as { id?: number } | null)?.id ?? null,
      },
      createdAt: new Date(),
    });

    await updateRun(runId, {
      status: "success",
      finishedAt: new Date(),
      rollbackStatus: "not_required",
      metadataJson: {
        ...(run.metadataJson as Record<string, unknown> | null),
        installedVersion,
        installedCommit: target.remoteCommit,
      },
    } as Partial<SystemUpdateRun>);
    emitRunEvent(runId, { type: "run", status: "success" });
    await logAuditEvent({
      action: "system_update_success",
      objectType: "system_update_run",
      objectId: String(runId),
      metadata: sanitizeAuditMetadata({ toCommit: target.remoteCommit, channel: run.channel, backupId: (databaseBackup as { id?: number } | null)?.id ?? (configBackup as { id?: number } | null)?.id ?? null }) ?? undefined,
      sourceIp: null,
    });
  } catch (error) {
    const failureReason = error instanceof Error ? error.message : String(error);
    const stage = await db.select().from(systemUpdateStepsTable).where(eq(systemUpdateStepsTable.runId, runId)).orderBy(desc(systemUpdateStepsTable.stepOrder)).limit(1).then((rows) => rows[0]?.stepName ?? "precheck");
    await updateRun(runId, {
      status: "failed",
      failedAt: new Date(),
      finishedAt: new Date(),
      failureStage: stage,
      failureReason: sanitizeShellOutput(failureReason),
    } as Partial<SystemUpdateRun>);
    emitRunEvent(runId, { type: "run", status: "failed", failureStage: stage, failureReason: sanitizeShellOutput(failureReason) });
    await logAuditEvent({
      action: "system_update_failed",
      objectType: "system_update_run",
      objectId: String(runId),
      metadata: sanitizeAuditMetadata({ stage, reason: sanitizeShellOutput(failureReason) }) ?? undefined,
      sourceIp: null,
    });
    try {
      await rollbackRun(runId, failureReason, run, context.abortController.signal, context);
    } catch (rollbackError) {
      await updateRun(runId, {
        status: "rollback_failed",
        rollbackFinishedAt: new Date(),
        rollbackStatus: "failed",
        failureReason: sanitizeShellOutput(rollbackError instanceof Error ? rollbackError.message : String(rollbackError)),
      } as Partial<SystemUpdateRun>);
    }
  } finally {
    await releaseGlobalLock(lockedClient);
    lockedClient.release();
    activeRuns.delete(runId);
    context.status = "idle";
    emitRunEvent(runId, { type: "run", status: "finished" });
  }
}

export async function getSystemUpdateStatusSnapshot(): Promise<SystemUpdateStatusSnapshot> {
  assertSystemUpdateEnabled();
  const gitInfo = await detectGitInfo();
  const versionLabel = buildVersionString(gitInfo.tag, gitInfo.commit);
  const current = await ensureCurrentVersionRecorded({
    version: versionLabel,
    commit: gitInfo.commit,
    branch: gitInfo.branch,
    tag: gitInfo.tag,
    sourceRepo: gitInfo.sourceRepo,
  });
  const [lastCheck, lastRun, lastSuccessfulRun, lastRollbackRun] = await Promise.all([
    readLatestCheck(),
    readLatestRun(),
    readLatestSuccessfulRun(),
    readLatestRollbackRun(),
  ]);
  const state = lastRun?.status === "running"
    ? "update_in_progress"
    : lastRun?.status === "rollback_in_progress"
      ? "rollback_in_progress"
      : lastRun?.status === "failed" || lastRun?.status === "rollback_failed"
        ? "failed_last_update"
        : lastRollbackRun
          ? "rollback_done"
          : lastCheck?.updateAvailable
            ? "update_available"
            : "updated";

  return {
    current: {
      version: current.version,
      commit: current.gitCommit,
      branch: current.gitBranch,
      tag: current.gitTag,
      buildId: current.buildId,
      installedAt: current.installedAt.toISOString(),
      installedBy: current.installedBy ?? null,
      source: current.source,
      status: current.status,
      repo: gitInfo.sourceRepo,
    },
    lastCheck,
    lastRun,
    lastSuccessfulRun,
    lastRollbackRun,
    state,
  };
}

export async function performSystemUpdateCheck(requestedBy: string | null, channel: SystemUpdateChannel = env.systemUpdateChannel as SystemUpdateChannel): Promise<SystemUpdateCheckResult> {
  assertSystemUpdateEnabled();
  const gitInfo = await detectGitInfo();
  const currentVersion = buildVersionString(gitInfo.tag, gitInfo.commit);
  const target = await resolveTargetCommit();
  const changeSummary = await buildChangeSummary(gitInfo.commit, target.remoteCommit);

  const check: SystemUpdateCheck = await db.insert(systemUpdateChecksTable).values({
    checkedBy: requestedBy,
    currentVersion,
    currentCommit: gitInfo.commit,
    remoteVersion: target.remoteVersion,
    remoteCommit: target.remoteCommit,
    updateAvailable: gitInfo.commit !== target.remoteCommit,
    channel,
    changelog: changeSummary.changelog,
    riskLevel: changeSummary.riskLevel,
    metadataJson: {
      currentBranch: gitInfo.branch,
      remoteBranch: target.remoteBranch,
      remoteRef: `${env.systemUpdateGitRemote}/${target.remoteBranch}`,
      sourceRepo: gitInfo.sourceRepo,
      commitsPending: changeSummary.commitsPending,
      migrationsPending: changeSummary.migrationsPending,
      highImpactFiles: changeSummary.highImpactFiles,
    },
    createdAt: new Date(),
  }).returning().then((rows) => rows[0]);

  await logAuditEvent({
    action: "system_update_checked",
    objectType: "system_update_check",
    objectId: String(check.id),
    metadata: sanitizeAuditMetadata({
      channel,
      currentCommit: gitInfo.commit,
      remoteCommit: target.remoteCommit,
      updateAvailable: gitInfo.commit !== target.remoteCommit,
    }) ?? undefined,
    sourceIp: null,
  });

  return {
    currentVersion,
    currentCommit: gitInfo.commit,
    currentBranch: gitInfo.branch,
    currentTag: gitInfo.tag,
    remoteVersion: target.remoteVersion,
    remoteCommit: target.remoteCommit,
    remoteBranch: target.remoteBranch,
    updateAvailable: gitInfo.commit !== target.remoteCommit,
    channel,
    commitsPending: changeSummary.commitsPending,
    changelog: changeSummary.changelog,
    migrationsPending: changeSummary.migrationsPending,
    highImpactFiles: changeSummary.highImpactFiles.map((file) => ({ path: file, impact: classifyImpactFile(file) })),
    riskLevel: changeSummary.riskLevel,
    sourceRepo: gitInfo.sourceRepo,
    remoteRef: `${env.systemUpdateGitRemote}/${target.remoteBranch}`,
    metadata: {
      checkId: check.id,
      sourceRepo: gitInfo.sourceRepo,
      remoteTag: target.remoteTag,
    },
  };
}

export async function listSystemUpdateChecks() {
  assertSystemUpdateEnabled();
  return await db.select().from(systemUpdateChecksTable).orderBy(desc(systemUpdateChecksTable.createdAt)).limit(100);
}

export async function listSystemUpdateRuns() {
  assertSystemUpdateEnabled();
  const runs = await db.select().from(systemUpdateRunsTable).orderBy(desc(systemUpdateRunsTable.createdAt)).limit(100);
  return await Promise.all(runs.map((run) => serializeRun(run)));
}

export async function getSystemUpdateRun(runId: number) {
  assertSystemUpdateEnabled();
  const [run] = await db.select().from(systemUpdateRunsTable).where(eq(systemUpdateRunsTable.id, runId)).limit(1);
  if (!run) return null;
  return await serializeRun(run);
}

export async function listSystemUpdateRunSteps(runId: number) {
  assertSystemUpdateEnabled();
  return await listStepsForRun(runId);
}

export async function createSystemUpdateRun(requestedBy: string | null, channel: SystemUpdateChannel = env.systemUpdateChannel as SystemUpdateChannel) {
  assertSystemUpdateEnabled();
  const check = await performSystemUpdateCheck(requestedBy, channel);
  if (!check.updateAvailable) {
    const [run] = await db.insert(systemUpdateRunsTable).values({
      requestedBy,
      status: "aborted",
      fromVersion: check.currentVersion,
      fromCommit: check.currentCommit,
      toVersion: check.remoteVersion,
      toCommit: check.remoteCommit,
      channel,
      failureStage: "precheck",
      failureReason: "No update available",
      createdAt: new Date(),
      updatedAt: new Date(),
    }).returning();
    await logAuditEvent({
      action: "system_update_aborted",
      objectType: "system_update_run",
      objectId: String(run.id),
      metadata: sanitizeAuditMetadata({ reason: "No update available" }) ?? undefined,
      sourceIp: null,
    });
    return { run: await serializeRun(run), check, started: false };
  }

  const [run] = await db.insert(systemUpdateRunsTable).values({
    requestedBy,
    status: "pending",
    fromVersion: check.currentVersion,
    fromCommit: check.currentCommit,
    toVersion: check.remoteVersion,
    toCommit: check.remoteCommit,
    channel,
    metadataJson: {
      checkId: check.metadata.checkId,
      riskLevel: check.riskLevel,
      commitsPending: check.commitsPending,
    },
    createdAt: new Date(),
    updatedAt: new Date(),
  }).returning();

  await upsertStep(run.id, "precheck", 1, { status: "pending" });
  for (const [index, stepName] of SYSTEM_UPDATE_STEP_NAMES.entries()) {
    if (index === 0) continue;
    await upsertStep(run.id, stepName, index + 1, { status: "pending" });
  }

  await logAuditEvent({
    action: "system_update_requested",
    objectType: "system_update_run",
    objectId: String(run.id),
    metadata: sanitizeAuditMetadata({ fromCommit: check.currentCommit, toCommit: check.remoteCommit, channel }) ?? undefined,
    sourceIp: null,
  });

  void executeRun(run.id);

  return { run: await serializeRun(run), check, started: true };
}

export async function cancelSystemUpdateRun(runId: number, actor: string | null) {
  assertSystemUpdateEnabled();
  const context = getRunContext(runId);
  if (!context) {
    const [run] = await db.select().from(systemUpdateRunsTable).where(eq(systemUpdateRunsTable.id, runId)).limit(1);
    if (!run) return null;
    return await serializeRun(run);
  }
  context.abortController.abort();
  if (context.child) {
    context.child.kill("SIGTERM");
    setTimeout(() => context.child?.kill("SIGKILL"), 5_000).unref?.();
  }
  await updateRun(runId, {
    status: "aborted",
    finishedAt: new Date(),
    failureReason: "Cancelled by user",
  } as Partial<SystemUpdateRun>);
  await logAuditEvent({
    action: "system_update_cancelled",
    objectType: "system_update_run",
    objectId: String(runId),
    metadata: sanitizeAuditMetadata({ actor, runId }) ?? undefined,
    sourceIp: null,
  });
  const [run] = await db.select().from(systemUpdateRunsTable).where(eq(systemUpdateRunsTable.id, runId)).limit(1);
  return run ? await serializeRun(run) : null;
}

export async function rollbackSystemUpdateRun(runId: number, actor: string | null) {
  assertSystemUpdateEnabled();
  const [run] = await db.select().from(systemUpdateRunsTable).where(eq(systemUpdateRunsTable.id, runId)).limit(1);
  if (!run) return null;
  const context = ensureRunContext(runId);
  context.abortController.abort();
  const rollbackSource = run.status === "success" || run.status === "rolled_back" || run.status === "failed"
    ? run
    : run;
  await rollbackRun(runId, "Manual rollback requested", rollbackSource, context.abortController.signal, context);
  await logAuditEvent({
    action: "system_update_rollback_requested",
    objectType: "system_update_run",
    objectId: String(runId),
    metadata: sanitizeAuditMetadata({ actor, runId }) ?? undefined,
    sourceIp: null,
  });
  const [updated] = await db.select().from(systemUpdateRunsTable).where(eq(systemUpdateRunsTable.id, runId)).limit(1);
  return updated ? await serializeRun(updated) : null;
}

export async function getSystemUpdateVersionSnapshot() {
  assertSystemUpdateEnabled();
  return await getSystemUpdateStatusSnapshot();
}
