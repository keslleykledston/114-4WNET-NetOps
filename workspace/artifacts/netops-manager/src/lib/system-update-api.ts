export type SystemUpdateChannel = "stable" | "staging" | "nightly";

export interface SystemUpdateVersionSnapshot {
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
}

export interface SystemUpdateStatusSnapshot {
  current: SystemUpdateVersionSnapshot;
  lastCheck: Record<string, unknown> | null;
  lastRun: SystemUpdateRun | null;
  lastSuccessfulRun: SystemUpdateRun | null;
  lastRollbackRun: SystemUpdateRun | null;
  state: string;
}

export interface SystemUpdateCheckResult {
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
  riskLevel: "low" | "medium" | "high";
  sourceRepo: string | null;
  remoteRef: string;
  metadata: Record<string, unknown>;
}

export interface SystemUpdateRunStep {
  id: number;
  runId: number;
  stepName: string;
  stepOrder: number;
  status: "pending" | "running" | "success" | "failed" | "skipped";
  startedAt: string | null;
  finishedAt: string | null;
  durationMs: number | null;
  sanitizedOutput: string | null;
  errorMessage: string | null;
  metadataJson: Record<string, unknown> | null;
}

export interface SystemUpdateRun {
  id: number;
  requestedBy: string | null;
  status: "pending" | "running" | "success" | "failed" | "rolled_back" | "rollback_failed" | "aborted";
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
  steps: SystemUpdateRunStep[];
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
}

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
    credentials: "include",
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({})) as { error?: string };
    throw new Error(body.error ?? `HTTP ${response.status}`);
  }
  return response.json() as Promise<T>;
}

export function getSystemUpdateStatus() {
  return apiFetch<SystemUpdateStatusSnapshot>("/api/system/update/status");
}

export function getSystemVersion() {
  return apiFetch<SystemUpdateStatusSnapshot>("/api/system/version");
}

export function checkSystemUpdate(channel: SystemUpdateChannel) {
  return apiFetch<SystemUpdateCheckResult>("/api/system/update/check", {
    method: "POST",
    body: JSON.stringify({ channel }),
  });
}

export function listSystemUpdateChecks() {
  return apiFetch<Record<string, unknown>[]>("/api/system/update/checks");
}

export function runSystemUpdate(channel: SystemUpdateChannel) {
  return apiFetch<{ run: SystemUpdateRun; check: SystemUpdateCheckResult; started: boolean }>("/api/system/update/run", {
    method: "POST",
    body: JSON.stringify({ channel }),
  });
}

export function listSystemUpdateRuns() {
  return apiFetch<SystemUpdateRun[]>("/api/system/update/runs");
}

export function getSystemUpdateRun(runId: number) {
  return apiFetch<SystemUpdateRun>(`/api/system/update/runs/${runId}`);
}

export function getSystemUpdateRunSteps(runId: number) {
  return apiFetch<SystemUpdateRunStep[]>(`/api/system/update/runs/${runId}/steps`);
}

export function cancelSystemUpdateRun(runId: number) {
  return apiFetch<SystemUpdateRun>(`/api/system/update/runs/${runId}/cancel`, { method: "POST" });
}

export function rollbackSystemUpdateRun(runId: number) {
  return apiFetch<SystemUpdateRun>(`/api/system/update/runs/${runId}/rollback`, { method: "POST" });
}
