import { Buffer } from "node:buffer";
import { and, desc, eq } from "drizzle-orm";
import { env } from "../../lib/env.js";
import { getRequestContext } from "../../lib/request-context.js";
import type {
  AnnouncementApprovalRecord,
  AnnouncementApprovalStatus,
  AnnouncementChangePlanRecord,
  AnnouncementChangePlanStatus,
  AnnouncementExecutionLockRecord,
  AnnouncementExecutionMode,
  AnnouncementExecutionRecord,
  AnnouncementExecutionStatus,
  AnnouncementFinding,
  AnnouncementMatrixPayload,
  AnnouncementPostcheckRecord,
  AnnouncementPostcheckStatus,
  AnnouncementRealExecutionProvider,
  AnnouncementPreviewCommand,
  AnnouncementPreviewResult,
  AnnouncementRollbackMode,
  AnnouncementRollbackRecord,
  AnnouncementRollbackStatus,
} from "./bgp-announcements.types.js";

const ACTIVE_CHANGE_PLAN_STATUSES = new Set<AnnouncementChangePlanStatus>(["pending_approval", "approved", "dry_run_ready", "dry_run_running"]);
const APPROVAL_STATUS_VALUES = new Set<AnnouncementApprovalStatus>(["pending", "approved", "rejected", "cancelled"]);
const EXECUTION_STATUS_VALUES = new Set<AnnouncementExecutionStatus>(["queued", "running", "succeeded", "failed", "blocked", "cancelled"]);
const EXECUTION_LOCK_STATUS_VALUES = new Set<AnnouncementExecutionLockRecord["status"]>(["active", "released", "expired", "failed"]);
const POSTCHECK_STATUS_VALUES = new Set<AnnouncementPostcheckStatus>(["pending", "running", "succeeded", "failed", "inconclusive", "skipped"]);
const EXECUTION_PROVIDER_VALUES = new Set<AnnouncementRealExecutionProvider>(["disabled", "dry_run", "mock", "connector_scaffold"]);
const ROLLBACK_STATUS_VALUES = new Set<AnnouncementRollbackStatus>([
  "draft",
  "pending_approval",
  "approved",
  "dry_run_running",
  "dry_run_succeeded",
  "dry_run_failed",
  "real_blocked",
  "real_running",
  "real_succeeded",
  "real_failed",
  "postcheck_pending",
  "postcheck_succeeded",
  "postcheck_failed",
  "postcheck_inconclusive",
  "cancelled",
]);
const ROLLBACK_MODE_VALUES = new Set<AnnouncementRollbackMode>(["dry_run", "mock", "real_blocked", "real"]);

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function parseJsonArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? value as T[] : [];
}

function normalizeText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export function canTransitionAnnouncementChangePlanStatus(
  current: AnnouncementChangePlanStatus | string,
  next: AnnouncementChangePlanStatus | string,
): boolean {
  const allowed: Record<AnnouncementChangePlanStatus | string, AnnouncementChangePlanStatus[]> = {
    draft: ["pending_approval", "cancelled"],
    pending_approval: ["approved", "rejected"],
    approved: ["dry_run_ready", "cancelled", "execution_blocked"],
    dry_run_ready: ["dry_run_running"],
    dry_run_running: ["dry_run_succeeded", "dry_run_failed"],
    dry_run_succeeded: [],
    dry_run_failed: [],
    rejected: [],
    cancelled: [],
    expired: [],
    superseded: [],
    execution_blocked: [],
  };
  return (allowed[current] ?? []).includes(next as AnnouncementChangePlanStatus);
}

export function isAnnouncementChangePlanActiveStatus(status: AnnouncementChangePlanStatus | string): boolean {
  return ACTIVE_CHANGE_PLAN_STATUSES.has(status as AnnouncementChangePlanStatus);
}

export function isAnnouncementApprovalStatus(status: unknown): status is AnnouncementApprovalStatus {
  return typeof status === "string" && APPROVAL_STATUS_VALUES.has(status as AnnouncementApprovalStatus);
}

export function isAnnouncementExecutionStatus(status: unknown): status is AnnouncementExecutionStatus {
  return typeof status === "string" && EXECUTION_STATUS_VALUES.has(status as AnnouncementExecutionStatus);
}

export function isAnnouncementExecutionMode(mode: unknown): mode is AnnouncementExecutionMode {
  return mode === "dry_run" || mode === "mock" || mode === "real_blocked";
}

export function isAnnouncementExecutionLockStatus(status: unknown): status is AnnouncementExecutionLockRecord["status"] {
  return typeof status === "string" && EXECUTION_LOCK_STATUS_VALUES.has(status as AnnouncementExecutionLockRecord["status"]);
}

export function isAnnouncementPostcheckStatus(status: unknown): status is AnnouncementPostcheckStatus {
  return typeof status === "string" && POSTCHECK_STATUS_VALUES.has(status as AnnouncementPostcheckStatus);
}

export function isAnnouncementRealExecutionProvider(provider: unknown): provider is AnnouncementRealExecutionProvider {
  return typeof provider === "string" && EXECUTION_PROVIDER_VALUES.has(provider as AnnouncementRealExecutionProvider);
}

export function isAnnouncementRollbackStatus(status: unknown): status is AnnouncementRollbackStatus {
  return typeof status === "string" && ROLLBACK_STATUS_VALUES.has(status as AnnouncementRollbackStatus);
}

export function isAnnouncementRollbackMode(mode: unknown): mode is AnnouncementRollbackMode {
  return typeof mode === "string" && ROLLBACK_MODE_VALUES.has(mode as AnnouncementRollbackMode);
}

export function buildAnnouncementApprovalRequestFindings(input: {
  changePlan?: Pick<AnnouncementChangePlanRecord, "id" | "deviceId" | "status" | "targetType" | "riskLevel" | "baseSnapshotId" | "targetPolicyName" | "upstreamCircuitId" | "node" | "proposedCommands" | "rollbackCommands" | "preview"> | null;
  latestSnapshotId?: number | null;
  refreshInProgress?: boolean;
  activeConflict?: boolean;
}): { blocked: boolean; findings: AnnouncementFinding[] } {
  const findings: AnnouncementFinding[] = [];
  const plan = input.changePlan ?? null;
  const isCritical = plan?.riskLevel === "critical";
  const hasCommands = Boolean(plan && plan.proposedCommands.length > 0 && plan.rollbackCommands.length > 0);
  const targetType = plan?.targetType ?? "unknown";

  if (!plan) {
    findings.push({
      code: "CHANGE_PLAN_NOT_FOUND",
      severity: "error",
      scope: "snapshot",
      message: "Change-plan não encontrado.",
    });
  } else {
    if (plan.status !== "draft") {
      findings.push({
        code: "CHANGE_PLAN_INVALID_STATUS",
        severity: "error",
        scope: "snapshot",
        targetPolicyName: plan.targetPolicyName,
        node: plan.node,
        upstreamCircuitId: plan.upstreamCircuitId,
        message: `Status atual ${plan.status} não permite request de aprovação.`,
      });
    }
    if (input.latestSnapshotId == null) {
      findings.push({
        code: "CHANGE_PLAN_BASE_SNAPSHOT_MISSING",
        severity: "error",
        scope: "snapshot",
        targetPolicyName: plan.targetPolicyName,
        node: plan.node,
        upstreamCircuitId: plan.upstreamCircuitId,
        message: "Base snapshot não existe mais.",
      });
    } else if (input.latestSnapshotId !== plan.baseSnapshotId) {
      findings.push({
        code: "SNAPSHOT_NOT_LATEST",
        severity: "error",
        scope: "snapshot",
        targetPolicyName: plan.targetPolicyName,
        node: plan.node,
        upstreamCircuitId: plan.upstreamCircuitId,
        message: "Base snapshot não é o latest atual.",
      });
    }
    if (plan.targetType === "customer_export" || plan.targetType === "upstream_export_audit" || plan.targetType === "upstream_import_audit" || plan.targetType === "internal_mesh" || plan.targetType === "unknown") {
      findings.push({
        code: targetType === "customer_export" ? "TARGET_IS_EXPORT_POLICY" : "TARGET_NOT_MODIFIABLE",
        severity: "error",
        scope: "target",
        targetPolicyName: plan.targetPolicyName,
        node: plan.node,
        upstreamCircuitId: plan.upstreamCircuitId,
        message: "Target não é modifiable para approval.",
      });
    }
    if (!hasCommands) {
      findings.push({
        code: "CHANGE_PLAN_COMMANDS_MISSING",
        severity: "error",
        scope: "snapshot",
        targetPolicyName: plan.targetPolicyName,
        node: plan.node,
        upstreamCircuitId: plan.upstreamCircuitId,
        message: "Commands propostas ou rollback faltando.",
      });
      findings.push({
        code: "CHANGE_PLAN_ROLLBACK_MISSING",
        severity: "error",
        scope: "snapshot",
        targetPolicyName: plan.targetPolicyName,
        node: plan.node,
        upstreamCircuitId: plan.upstreamCircuitId,
        message: "Rollback não pode ficar vazio.",
      });
    }
    if (isCritical) {
      findings.push({
        code: "CHANGE_PLAN_HAS_CRITICAL_RISK",
        severity: "error",
        scope: "snapshot",
        targetPolicyName: plan.targetPolicyName,
        node: plan.node,
        upstreamCircuitId: plan.upstreamCircuitId,
        message: "Risco crítico bloqueia aprovação.",
      });
    }
    if (input.refreshInProgress) {
      findings.push({
        code: "REFRESH_IN_PROGRESS",
        severity: "error",
        scope: "snapshot",
        targetPolicyName: plan.targetPolicyName,
        node: plan.node,
        upstreamCircuitId: plan.upstreamCircuitId,
        message: "Refresh em andamento para o device.",
      });
    }
    if (input.activeConflict) {
      findings.push({
        code: "CHANGE_PLAN_CONFLICT_ACTIVE",
        severity: "error",
        scope: "snapshot",
        targetPolicyName: plan.targetPolicyName,
        node: plan.node,
        upstreamCircuitId: plan.upstreamCircuitId,
        message: "Já existe change-plan ativo para o mesmo alvo.",
      });
    }
  }

  return {
    blocked: findings.some((finding) => finding.severity === "error"),
    findings,
  };
}

export function buildAnnouncementDryRunGateFindings(input: {
  dryRunEnabled: boolean;
  executionEnabled: boolean;
  planStatus: AnnouncementChangePlanStatus | string;
  approvalApproved: boolean;
}): { blocked: boolean; findings: AnnouncementFinding[]; code?: string } {
  const findings: AnnouncementFinding[] = [];
  if (!input.dryRunEnabled) {
    findings.push({
      code: "DRY_RUN_DISABLED",
      severity: "error",
      scope: "snapshot",
      message: "Dry-run disabled by feature flag.",
    });
  }
  if (input.executionEnabled) {
    findings.push({
      code: "REAL_EXECUTION_ENABLED",
      severity: "error",
      scope: "snapshot",
      message: "Real execution is enabled; dry-run scaffold not active.",
    });
  }
  if (!["approved", "dry_run_ready"].includes(input.planStatus)) {
    findings.push({
      code: "CHANGE_PLAN_INVALID_STATUS",
      severity: "error",
      scope: "snapshot",
      message: "Change-plan status invalid for dry-run.",
    });
  }
  if (!input.approvalApproved) {
    findings.push({
      code: "NO_APPROVAL",
      severity: "error",
      scope: "snapshot",
      message: "Approved approval not found.",
    });
  }
  const blocked = findings.some((finding) => finding.severity === "error");
  return {
    blocked,
    findings,
    code: blocked ? findings[0]?.code : undefined,
  };
}

export function isAnnouncementRealExecutionBlocked(executionEnabled = env.bgpAnnouncementExecutionEnabled): boolean {
  return executionEnabled !== true;
}

export function isAnnouncementRollbackRealExecutionBlocked(rollbackEnabled = env.bgpAnnouncementRollbackEnabled): boolean {
  return rollbackEnabled !== true;
}

export function buildAnnouncementDryRunExecutionLog(input: {
  proposedCommands: AnnouncementPreviewCommand[];
  rollbackCommands: AnnouncementPreviewCommand[];
}): Array<{ step: number; type: "command" | "result" | "note"; command?: string; status: string; message?: string }> {
  const log: Array<{ step: number; type: "command" | "result" | "note"; command?: string; status: string; message?: string }> = [];
  let step = 1;
  for (const command of input.proposedCommands) {
    log.push({
      step,
      type: "command",
      command: command.command,
      status: "would_execute",
    });
    step += 1;
  }
  for (const command of input.rollbackCommands) {
    log.push({
      step,
      type: "command",
      command: command.command,
      status: "would_execute",
    });
    step += 1;
  }
  log.push({
    step,
    type: "note",
    status: "postcheck_required",
    message: "Execução real ainda está desabilitada; postcheck obrigatório após ação real futura.",
  });
  return log;
}

function hasRealExecutionDisabled(): boolean {
  return env.bgpAnnouncementExecutionEnabled !== true;
}

function buildExecutionResult(
  changePlan: AnnouncementChangePlanRecord,
  approval: AnnouncementApprovalRecord,
  executionId: number,
  logs: ReturnType<typeof buildAnnouncementDryRunExecutionLog>,
) {
  return {
    executionId,
    mode: "dry_run" as const,
    status: "succeeded" as const,
    logs,
    result: {
      wouldExecute: true,
      postcheckRequired: true,
      realExecutionEnabled: env.bgpAnnouncementExecutionEnabled,
      commands: changePlan.proposedCommands,
      rollbackCommands: changePlan.rollbackCommands,
      approvalId: approval.id,
      changePlanId: changePlan.id,
    },
  };
}

async function loadBgpAnnouncementTables() {
  return import("@workspace/db");
}

function isTerminalRollbackStatus(status: AnnouncementRollbackStatus): boolean {
  return ["dry_run_succeeded", "dry_run_failed", "real_blocked", "real_succeeded", "real_failed", "postcheck_succeeded", "postcheck_failed", "postcheck_inconclusive", "cancelled"].includes(status);
}

function serializeApproval(row: unknown): AnnouncementApprovalRecord {
  const typed = row as {
    id: number;
    changePlanId: number;
    deviceId: number;
    baseSnapshotId: number;
    requestedBy: number | null;
    requestedAt: Date;
    reviewedBy: number | null;
    reviewedAt: Date | null;
    status: string;
    reason: string | null;
    riskLevel: string;
    findingsJson: unknown;
    diffJson: unknown;
    proposedCommandsJson: unknown;
    rollbackCommandsJson: unknown;
    createdAt: Date;
    updatedAt: Date;
  };
  return {
    id: typed.id,
    changePlanId: typed.changePlanId,
    deviceId: typed.deviceId,
    baseSnapshotId: typed.baseSnapshotId,
    requestedBy: typed.requestedBy,
    requestedAt: typed.requestedAt.toISOString(),
    reviewedBy: typed.reviewedBy,
    reviewedAt: typed.reviewedAt ? typed.reviewedAt.toISOString() : null,
    status: typed.status as AnnouncementApprovalStatus,
    reason: typed.reason,
    riskLevel: typed.riskLevel as AnnouncementChangePlanRecord["riskLevel"],
    findings: parseJsonArray<AnnouncementFinding>(typed.findingsJson),
    diff: typed.diffJson as AnnouncementChangePlanRecord["diff"],
    proposedCommands: parseJsonArray<AnnouncementPreviewCommand>(typed.proposedCommandsJson),
    rollbackCommands: parseJsonArray<AnnouncementPreviewCommand>(typed.rollbackCommandsJson),
    createdAt: typed.createdAt.toISOString(),
    updatedAt: typed.updatedAt.toISOString(),
  } as AnnouncementApprovalRecord;
}

function serializeExecution(row: unknown): AnnouncementExecutionRecord {
  const typed = row as {
    id: number;
    changePlanId: number;
    approvalId: number | null;
    deviceId: number;
    mode: string;
    status: string;
    startedBy: number | null;
    startedAt: Date;
    finishedAt: Date | null;
    baseSnapshotId: number;
    collectionId: number | null;
    proposedCommandsJson: unknown;
    rollbackCommandsJson: unknown;
    executionLogJson: unknown;
    resultJson: unknown;
    errorMessage: string | null;
    createdAt: Date;
    updatedAt: Date;
  };
  return {
    id: typed.id,
    changePlanId: typed.changePlanId,
    approvalId: typed.approvalId,
    deviceId: typed.deviceId,
    mode: typed.mode as AnnouncementExecutionMode,
    status: typed.status as AnnouncementExecutionStatus,
    startedBy: typed.startedBy,
    startedAt: typed.startedAt.toISOString(),
    finishedAt: typed.finishedAt ? typed.finishedAt.toISOString() : null,
    baseSnapshotId: typed.baseSnapshotId,
    collectionId: typed.collectionId,
    proposedCommands: parseJsonArray<AnnouncementPreviewCommand>(typed.proposedCommandsJson),
    rollbackCommands: parseJsonArray<AnnouncementPreviewCommand>(typed.rollbackCommandsJson),
    executionLog: parseJsonArray<{ step: number; type: string; command?: string; status: string; message?: string }>(typed.executionLogJson),
    result: isObject(typed.resultJson) ? typed.resultJson : { value: typed.resultJson },
    errorMessage: typed.errorMessage,
    createdAt: typed.createdAt.toISOString(),
    updatedAt: typed.updatedAt.toISOString(),
  };
}

function serializeRollback(row: unknown): AnnouncementRollbackRecord {
  const typed = row as {
    id: number;
    changePlanId: number;
    executionId: number | null;
    approvalId: number | null;
    deviceId: number;
    baseSnapshotId: number;
    rollbackToSnapshotId: number;
    currentSnapshotId: number | null;
    status: string;
    mode: string;
    requestedBy: number | null;
    requestedAt: Date;
    approvedBy: number | null;
    approvedAt: Date | null;
    startedAt: Date | null;
    finishedAt: Date | null;
    rollbackCommandsJson: unknown;
    rollbackDiffJson: unknown;
    rollbackLogJson: unknown;
    postcheckId: number | null;
    errorMessage: string | null;
    createdAt: Date;
    updatedAt: Date;
  };
  return {
    id: typed.id,
    changePlanId: typed.changePlanId,
    executionId: typed.executionId,
    approvalId: typed.approvalId,
    deviceId: typed.deviceId,
    baseSnapshotId: typed.baseSnapshotId,
    rollbackToSnapshotId: typed.rollbackToSnapshotId,
    currentSnapshotId: typed.currentSnapshotId,
    status: isAnnouncementRollbackStatus(typed.status) ? typed.status : "draft",
    mode: isAnnouncementRollbackMode(typed.mode) ? typed.mode : "mock",
    requestedBy: typed.requestedBy,
    requestedAt: typed.requestedAt.toISOString(),
    approvedBy: typed.approvedBy,
    approvedAt: typed.approvedAt ? typed.approvedAt.toISOString() : null,
    startedAt: typed.startedAt ? typed.startedAt.toISOString() : null,
    finishedAt: typed.finishedAt ? typed.finishedAt.toISOString() : null,
    rollbackCommands: parseJsonArray<AnnouncementPreviewCommand>(typed.rollbackCommandsJson),
    rollbackDiff: isObject(typed.rollbackDiffJson) ? typed.rollbackDiffJson : { value: typed.rollbackDiffJson },
    rollbackLog: parseJsonArray<{ step: number; type: string; command?: string; status: string; message?: string }>(typed.rollbackLogJson),
    postcheckId: typed.postcheckId,
    errorMessage: typed.errorMessage,
    createdAt: typed.createdAt.toISOString(),
    updatedAt: typed.updatedAt.toISOString(),
  };
}

function serializeAnnouncementPostcheck(row: unknown): AnnouncementPostcheckRecord {
  const typed = row as {
    id: number;
    changePlanId: number;
    executionId: number | null;
    deviceId: number;
    expectedSnapshotId: number | null;
    observedSnapshotId: number | null;
    expectedState: string;
    observedState: string;
    expectedCommunity: string | null;
    observedCommunity: string | null;
    status: string;
    diffJson: unknown;
    findingsJson: unknown;
    startedAt: Date;
    finishedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
  };
  return {
    id: typed.id,
    changePlanId: typed.changePlanId,
    executionId: typed.executionId,
    deviceId: typed.deviceId,
    expectedSnapshotId: typed.expectedSnapshotId,
    observedSnapshotId: typed.observedSnapshotId,
    expectedState: typed.expectedState,
    observedState: typed.observedState,
    expectedCommunity: typed.expectedCommunity,
    observedCommunity: typed.observedCommunity,
    status: isAnnouncementPostcheckStatus(typed.status) ? typed.status : "pending",
    diff: isObject(typed.diffJson) ? typed.diffJson : { value: typed.diffJson },
    findings: parseJsonArray(typed.findingsJson),
    startedAt: typed.startedAt.toISOString(),
    finishedAt: typed.finishedAt ? typed.finishedAt.toISOString() : null,
    createdAt: typed.createdAt.toISOString(),
    updatedAt: typed.updatedAt.toISOString(),
  };
}

function serializeChangePlan(row: unknown, relation?: {
  approval?: AnnouncementApprovalRecord | null;
  executions?: AnnouncementExecutionRecord[];
  latestPostcheck?: AnnouncementPostcheckRecord | null;
  rollbacks?: AnnouncementRollbackRecord[];
}): AnnouncementChangePlanRecord {
  const typed = row as {
    id: number;
    deviceId: number;
    baseSnapshotId: number;
    collectionId: number | null;
    previewId: string;
    targetPolicyName: string;
    targetType: string;
    node: number | null;
    upstreamCircuitId: string;
    upstreamName: string;
    currentState: string;
    desiredState: string;
    currentCommunity: string | null;
    desiredCommunity: string | null;
    diffJson: unknown;
    proposedCommandsJson: unknown;
    rollbackCommandsJson: unknown;
    findingsJson: unknown;
    riskLevel: string;
    status: string;
    note: string | null;
    postcheckRequired: boolean | null;
    postcheckStatus: string | null;
    previewJson: unknown;
    createdBy: number | null;
    createdAt: Date;
    updatedAt: Date;
  };
  return {
    id: typed.id,
    deviceId: typed.deviceId,
    baseSnapshotId: typed.baseSnapshotId,
    collectionId: typed.collectionId,
    previewId: typed.previewId,
    targetPolicyName: typed.targetPolicyName,
    targetType: typed.targetType,
    node: typed.node,
    upstreamCircuitId: typed.upstreamCircuitId,
    upstreamName: typed.upstreamName,
    currentState: typed.currentState,
    desiredState: typed.desiredState,
    currentCommunity: typed.currentCommunity,
    desiredCommunity: typed.desiredCommunity,
    diff: typed.diffJson as AnnouncementChangePlanRecord["diff"],
    proposedCommands: parseJsonArray<AnnouncementPreviewCommand>(typed.proposedCommandsJson),
    rollbackCommands: parseJsonArray<AnnouncementPreviewCommand>(typed.rollbackCommandsJson),
    findings: parseJsonArray<AnnouncementFinding>(typed.findingsJson),
    riskLevel: typed.riskLevel as AnnouncementChangePlanRecord["riskLevel"],
    status: typed.status as AnnouncementChangePlanStatus,
    note: typed.note,
    preview: { previewId: typed.previewId, ...(typed.previewJson as Record<string, unknown>) } as AnnouncementPreviewResult,
    createdBy: typed.createdBy,
    createdAt: typed.createdAt.toISOString(),
    updatedAt: typed.updatedAt.toISOString(),
    postcheckRequired: typed.postcheckRequired ?? true,
    postcheckStatus: typed.postcheckStatus ?? "pending",
    latestPostcheck: relation?.latestPostcheck ?? null,
    approval: relation?.approval ?? null,
    executions: relation?.executions ?? [],
    latestExecution: relation?.executions?.[0] ?? null,
    latestRollback: relation?.rollbacks?.[0] ?? null,
    rollbacks: relation?.rollbacks ?? [],
  } as AnnouncementChangePlanRecord;
}

async function loadPlanWithRelations(changePlanId: number): Promise<AnnouncementChangePlanRecord | null> {
  const { bgpAnnouncementApprovalsTable, bgpAnnouncementChangePlansTable, bgpAnnouncementExecutionsTable, bgpAnnouncementPostchecksTable, bgpAnnouncementRollbacksTable, db } = await loadBgpAnnouncementTables();
  const [row] = await db.select().from(bgpAnnouncementChangePlansTable).where(eq(bgpAnnouncementChangePlansTable.id, changePlanId)).limit(1);
  if (!row) return null;

  const approvals = await db
    .select()
    .from(bgpAnnouncementApprovalsTable)
    .where(eq(bgpAnnouncementApprovalsTable.changePlanId, changePlanId))
    .orderBy(desc(bgpAnnouncementApprovalsTable.requestedAt));
  const executions = await db
    .select()
    .from(bgpAnnouncementExecutionsTable)
    .where(eq(bgpAnnouncementExecutionsTable.changePlanId, changePlanId))
    .orderBy(desc(bgpAnnouncementExecutionsTable.startedAt));
  const postchecks = await db
    .select()
    .from(bgpAnnouncementPostchecksTable)
    .where(eq(bgpAnnouncementPostchecksTable.changePlanId, changePlanId))
    .orderBy(desc(bgpAnnouncementPostchecksTable.startedAt))
    .limit(1);
  const rollbacks = await db
    .select()
    .from(bgpAnnouncementRollbacksTable)
    .where(eq(bgpAnnouncementRollbacksTable.changePlanId, changePlanId))
    .orderBy(desc(bgpAnnouncementRollbacksTable.requestedAt));

  return serializeChangePlan(row, {
    approval: approvals[0] ? serializeApproval(approvals[0]) : null,
    executions: executions.map((item) => serializeExecution(item)),
    latestPostcheck: postchecks[0] ? serializeAnnouncementPostcheck(postchecks[0]) : null,
    rollbacks: rollbacks.map((item) => serializeRollback(item)),
  });
}

export async function listAnnouncementChangePlans(deviceId: number): Promise<AnnouncementChangePlanRecord[]> {
  const { bgpAnnouncementChangePlansTable, db } = await loadBgpAnnouncementTables();
  const rows = await db
    .select()
    .from(bgpAnnouncementChangePlansTable)
    .where(eq(bgpAnnouncementChangePlansTable.deviceId, deviceId))
    .orderBy(desc(bgpAnnouncementChangePlansTable.createdAt))
    .limit(100);
  const plans: AnnouncementChangePlanRecord[] = [];
  for (const row of rows) {
    const plan = await loadPlanWithRelations(row.id);
    if (plan) plans.push(plan);
  }
  return plans;
}

export async function getAnnouncementChangePlan(changePlanId: number): Promise<AnnouncementChangePlanRecord | null> {
  return loadPlanWithRelations(changePlanId);
}

async function loadLatestSnapshotId(deviceId: number): Promise<number | null> {
  const { bgpAnnouncementMatrixSnapshotsTable, db } = await loadBgpAnnouncementTables();
  const [row] = await db
    .select({ id: bgpAnnouncementMatrixSnapshotsTable.id })
    .from(bgpAnnouncementMatrixSnapshotsTable)
    .where(and(eq(bgpAnnouncementMatrixSnapshotsTable.deviceId, deviceId), eq(bgpAnnouncementMatrixSnapshotsTable.isLatest, true)))
    .limit(1);
  return row?.id ?? null;
}

async function hasRefreshInProgress(deviceId: number): Promise<boolean> {
  const { bgpAnnouncementMatrixRunsTable, db } = await loadBgpAnnouncementTables();
  const [row] = await db
    .select({ status: bgpAnnouncementMatrixRunsTable.status })
    .from(bgpAnnouncementMatrixRunsTable)
    .where(eq(bgpAnnouncementMatrixRunsTable.deviceId, deviceId))
    .orderBy(desc(bgpAnnouncementMatrixRunsTable.startedAt))
    .limit(1);
  return row ? ["pending", "running"].includes(String(row.status)) : false;
}

async function hasActiveConflict(plan: AnnouncementChangePlanRecord): Promise<boolean> {
  const { bgpAnnouncementChangePlansTable, db } = await loadBgpAnnouncementTables();
  const rows = await db
    .select({ id: bgpAnnouncementChangePlansTable.id, status: bgpAnnouncementChangePlansTable.status })
    .from(bgpAnnouncementChangePlansTable)
    .where(and(
      eq(bgpAnnouncementChangePlansTable.deviceId, plan.deviceId),
      eq(bgpAnnouncementChangePlansTable.targetPolicyName, plan.targetPolicyName),
      eq(bgpAnnouncementChangePlansTable.upstreamCircuitId, plan.upstreamCircuitId),
    ));
  return rows.some((row) => row.id !== plan.id && isAnnouncementChangePlanActiveStatus(row.status));
}

async function recordAnnouncementAuditEvent(input: {
  action: string;
  changePlan: AnnouncementChangePlanRecord;
  approvalId?: number | null;
  executionId?: number | null;
  summary: string;
}) {
  const { logAuditEvent } = await import("../../lib/audit.js");
  await logAuditEvent({
    actorId: getRequestContext()?.user?.id ?? null,
    action: input.action,
    objectType: "bgp_announcement_change_plan",
    objectId: String(input.changePlan.id),
    metadata: {
      change_plan_id: input.changePlan.id,
      approval_id: input.approvalId ?? null,
      execution_id: input.executionId ?? null,
      device_id: input.changePlan.deviceId,
      risk_level: input.changePlan.riskLevel,
      summary: input.summary,
    },
    sourceIp: null,
  });
}

export async function requestAnnouncementChangePlanApproval(input: {
  changePlanId: number;
  note?: string | null;
}): Promise<AnnouncementApprovalRecord | { error: string; status: number; code?: string }> {
  const tables = await loadBgpAnnouncementTables();
  const { bgpAnnouncementApprovalsTable, bgpAnnouncementChangePlansTable, db } = tables;
  const plan = await loadPlanWithRelations(input.changePlanId);
  if (!plan) {
    return { error: "Change-plan not found", status: 404, code: "CHANGE_PLAN_NOT_FOUND" };
  }

  const latestSnapshotId = await loadLatestSnapshotId(plan.deviceId);
  const refreshInProgress = await hasRefreshInProgress(plan.deviceId);
  const activeConflict = await hasActiveConflict(plan);
  const gate = buildAnnouncementApprovalRequestFindings({
    changePlan: plan,
    latestSnapshotId,
    refreshInProgress,
    activeConflict,
  });
  if (gate.blocked) {
    const code = gate.findings[0]?.code ?? "CHANGE_PLAN_INVALID_STATUS";
    const status = gate.findings.some((finding) => finding.code === "SNAPSHOT_NOT_LATEST" || finding.code === "CHANGE_PLAN_CONFLICT_ACTIVE") ? 409 : 400;
    return { error: gate.findings[0]?.message ?? "Approval blocked", status, code };
  }

  if (!env.bgpAnnouncementApprovalEnabled) {
    return { error: "Approval gate disabled by feature flag", status: 503, code: "APPROVAL_DISABLED" };
  }

  const [inserted] = await db
    .insert(bgpAnnouncementApprovalsTable)
    .values({
      changePlanId: plan.id,
      deviceId: plan.deviceId,
      baseSnapshotId: plan.baseSnapshotId,
      requestedBy: getRequestContext()?.user?.id ?? null,
      status: "pending",
      reason: normalizeText(input.note) || null,
      riskLevel: plan.riskLevel,
      findingsJson: gate.findings,
      diffJson: plan.diff,
      proposedCommandsJson: plan.proposedCommands,
      rollbackCommandsJson: plan.rollbackCommands,
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    .returning();

  if (!inserted) {
    return { error: "Failed to request approval", status: 500, code: "CHANGE_PLAN_NOT_FOUND" };
  }

  await db
    .update(bgpAnnouncementChangePlansTable)
    .set({ status: "pending_approval", updatedAt: new Date() })
    .where(eq(bgpAnnouncementChangePlansTable.id, plan.id));

  const approval = serializeApproval(inserted);
  await recordAnnouncementAuditEvent({
    action: "CHANGE_PLAN_APPROVAL_REQUESTED",
    changePlan: plan,
    approvalId: approval.id,
    summary: `Approval requested for ${plan.targetPolicyName} / ${plan.upstreamCircuitId}`,
  });
  return approval;
}

export async function reviewAnnouncementChangePlanApproval(input: {
  approvalId: number;
  status: "approved" | "rejected";
  reason?: string | null;
}): Promise<AnnouncementApprovalRecord | { error: string; status: number; code?: string }> {
  const { bgpAnnouncementApprovalsTable, bgpAnnouncementChangePlansTable, db } = await loadBgpAnnouncementTables();
  const [approvalRow] = await db.select().from(bgpAnnouncementApprovalsTable).where(eq(bgpAnnouncementApprovalsTable.id, input.approvalId)).limit(1);
  if (!approvalRow) {
    return { error: "Approval not found", status: 404, code: "APPROVAL_NOT_FOUND" };
  }

  const plan = await loadPlanWithRelations(approvalRow.changePlanId);
  if (!plan) {
    return { error: "Change-plan not found", status: 404, code: "CHANGE_PLAN_NOT_FOUND" };
  }
  if (approvalRow.status !== "pending") {
    return { error: "Approval status invalid", status: 409, code: "APPROVAL_INVALID_STATUS" };
  }
  if (plan.status !== "pending_approval") {
    return { error: "Change-plan status invalid", status: 409, code: "CHANGE_PLAN_INVALID_STATUS" };
  }

  const updatedApproval = await db.transaction(async (tx) => {
    const [row] = await tx
      .update(bgpAnnouncementApprovalsTable)
      .set({
        status: input.status,
        reason: normalizeText(input.reason) || approvalRow.reason,
        reviewedBy: getRequestContext()?.user?.id ?? null,
        reviewedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(bgpAnnouncementApprovalsTable.id, input.approvalId))
      .returning();

    await tx
      .update(bgpAnnouncementChangePlansTable)
      .set({
        status: input.status === "approved" ? "approved" : "rejected",
        updatedAt: new Date(),
      })
      .where(eq(bgpAnnouncementChangePlansTable.id, plan.id));

    return row ?? null;
  });

  if (!updatedApproval) {
    return { error: "Failed to update approval", status: 500, code: "APPROVAL_NOT_FOUND" };
  }

  const approval = serializeApproval(updatedApproval);
  await recordAnnouncementAuditEvent({
    action: input.status === "approved" ? "CHANGE_PLAN_APPROVED" : "CHANGE_PLAN_REJECTED",
    changePlan: plan,
    approvalId: approval.id,
    summary: `${input.status === "approved" ? "Approved" : "Rejected"} ${plan.targetPolicyName} / ${plan.upstreamCircuitId}`,
  });
  return approval;
}

export async function cancelAnnouncementPlanExecution(changePlanId: number): Promise<AnnouncementChangePlanRecord | { error: string; status: number; code?: string }> {
  const { bgpAnnouncementChangePlansTable, bgpAnnouncementApprovalsTable, db } = await loadBgpAnnouncementTables();
  const plan = await loadPlanWithRelations(changePlanId);
  if (!plan) {
    return { error: "Change-plan not found", status: 404, code: "CHANGE_PLAN_NOT_FOUND" };
  }
  if (!["draft", "approved"].includes(plan.status)) {
    return { error: "Change-plan status invalid", status: 409, code: "CHANGE_PLAN_INVALID_STATUS" };
  }
  const [updated] = await db.transaction(async (tx) => {
    await tx
      .update(bgpAnnouncementApprovalsTable)
      .set({ status: "cancelled", updatedAt: new Date() })
      .where(eq(bgpAnnouncementApprovalsTable.changePlanId, plan.id));
    return tx
      .update(bgpAnnouncementChangePlansTable)
      .set({ status: "cancelled", updatedAt: new Date() })
      .where(eq(bgpAnnouncementChangePlansTable.id, plan.id))
      .returning();
  });
  if (!updated) {
    return { error: "Failed to cancel change-plan", status: 500, code: "CHANGE_PLAN_NOT_FOUND" };
  }
  const next = serializeChangePlan(updated, {
    approval: plan.approval,
    executions: plan.executions ?? [],
  });
  await recordAnnouncementAuditEvent({
    action: "CHANGE_PLAN_CANCELLED",
    changePlan: next,
    approvalId: plan.approval?.id ?? null,
    summary: `Cancelled ${plan.targetPolicyName} / ${plan.upstreamCircuitId}`,
  });
  return next;
}

export async function listAnnouncementApprovals(deviceId?: number): Promise<AnnouncementApprovalRecord[]> {
  const { bgpAnnouncementApprovalsTable, db } = await loadBgpAnnouncementTables();
  const query = db.select().from(bgpAnnouncementApprovalsTable);
  const rows = deviceId
    ? await query.where(eq(bgpAnnouncementApprovalsTable.deviceId, deviceId)).orderBy(desc(bgpAnnouncementApprovalsTable.requestedAt))
    : await query.orderBy(desc(bgpAnnouncementApprovalsTable.requestedAt));
  return rows.map((row) => serializeApproval(row));
}

export async function getAnnouncementApproval(approvalId: number): Promise<AnnouncementApprovalRecord | null> {
  const { bgpAnnouncementApprovalsTable, db } = await loadBgpAnnouncementTables();
  const [row] = await db.select().from(bgpAnnouncementApprovalsTable).where(eq(bgpAnnouncementApprovalsTable.id, approvalId)).limit(1);
  return row ? serializeApproval(row) : null;
}

export async function listAnnouncementExecutions(deviceId?: number): Promise<AnnouncementExecutionRecord[]> {
  const { bgpAnnouncementExecutionsTable, db } = await loadBgpAnnouncementTables();
  const rows = deviceId
    ? await db.select().from(bgpAnnouncementExecutionsTable).where(eq(bgpAnnouncementExecutionsTable.deviceId, deviceId)).orderBy(desc(bgpAnnouncementExecutionsTable.startedAt))
    : await db.select().from(bgpAnnouncementExecutionsTable).orderBy(desc(bgpAnnouncementExecutionsTable.startedAt));
  return rows.map((row) => serializeExecution(row));
}

export async function getAnnouncementExecution(executionId: number): Promise<AnnouncementExecutionRecord | null> {
  const { bgpAnnouncementExecutionsTable, db } = await loadBgpAnnouncementTables();
  const [row] = await db.select().from(bgpAnnouncementExecutionsTable).where(eq(bgpAnnouncementExecutionsTable.id, executionId)).limit(1);
  return row ? serializeExecution(row) : null;
}

async function loadLatestRollbackForPlan(changePlanId: number): Promise<AnnouncementRollbackRecord | null> {
  const { bgpAnnouncementRollbacksTable, db } = await loadBgpAnnouncementTables();
  const [row] = await db
    .select()
    .from(bgpAnnouncementRollbacksTable)
    .where(eq(bgpAnnouncementRollbacksTable.changePlanId, changePlanId))
    .orderBy(desc(bgpAnnouncementRollbacksTable.requestedAt))
    .limit(1);
  return row ? serializeRollback(row) : null;
}

async function getAnnouncementRollbackRow(rollbackId: number): Promise<AnnouncementRollbackRecord | null> {
  const { bgpAnnouncementRollbacksTable, db } = await loadBgpAnnouncementTables();
  const [row] = await db.select().from(bgpAnnouncementRollbacksTable).where(eq(bgpAnnouncementRollbacksTable.id, rollbackId)).limit(1);
  return row ? serializeRollback(row) : null;
}

export async function listAnnouncementRollbacks(deviceId?: number): Promise<AnnouncementRollbackRecord[]> {
  const { bgpAnnouncementRollbacksTable, db } = await loadBgpAnnouncementTables();
  const rows = deviceId
    ? await db.select().from(bgpAnnouncementRollbacksTable).where(eq(bgpAnnouncementRollbacksTable.deviceId, deviceId)).orderBy(desc(bgpAnnouncementRollbacksTable.requestedAt))
    : await db.select().from(bgpAnnouncementRollbacksTable).orderBy(desc(bgpAnnouncementRollbacksTable.requestedAt));
  return rows.map((row) => serializeRollback(row));
}

export async function getAnnouncementRollback(rollbackId: number): Promise<AnnouncementRollbackRecord | null> {
  return getAnnouncementRollbackRow(rollbackId);
}

export function buildAnnouncementRollbackExecutionLog(commands: AnnouncementPreviewCommand[], mode: AnnouncementRollbackMode): Array<{ step: number; type: "command" | "result" | "note"; command?: string; status: string; message?: string }> {
  const log: Array<{ step: number; type: "command" | "result" | "note"; command?: string; status: string; message?: string }> = [];
  let step = 1;
  for (const command of commands) {
    log.push({
      step,
      type: "command",
      command: command.command,
      status: mode === "real" ? "would_execute" : "would_execute",
    });
    step += 1;
  }
  log.push({
    step,
    type: "note",
    status: "postcheck_required",
    message: "Rollback postcheck obrigatório.",
  });
  return log;
}

function buildRollbackDiffFromPlan(plan: AnnouncementChangePlanRecord): Record<string, unknown> {
  return {
    changePlanId: plan.id,
    baseSnapshotId: plan.baseSnapshotId,
    targetPolicyName: plan.targetPolicyName,
    upstreamCircuitId: plan.upstreamCircuitId,
    currentState: plan.currentState,
    desiredState: plan.desiredState,
    rollbackToState: plan.currentState,
    rollbackToCommunity: plan.currentCommunity,
    currentCommunity: plan.currentCommunity,
    desiredCommunity: plan.desiredCommunity,
    rollbackCommands: plan.rollbackCommands,
  };
}

export function buildAnnouncementRollbackGateFindings(plan: AnnouncementChangePlanRecord): AnnouncementFinding[] {
  const findings: AnnouncementFinding[] = [];
  if (!plan.rollbackCommands.length) {
    findings.push({
      code: "ROLLBACK_COMMANDS_MISSING",
      severity: "error",
      scope: "snapshot",
      targetPolicyName: plan.targetPolicyName,
      node: plan.node,
      upstreamCircuitId: plan.upstreamCircuitId,
      message: "Rollback commands ausentes.",
    });
  }
  if (plan.riskLevel === "critical") {
    findings.push({
      code: "ROLLBACK_HAS_CRITICAL_RISK",
      severity: "error",
      scope: "snapshot",
      targetPolicyName: plan.targetPolicyName,
      node: plan.node,
      upstreamCircuitId: plan.upstreamCircuitId,
      message: "Rollback crítico bloqueado.",
    });
  }
  return findings;
}

export async function requestAnnouncementRollback(input: {
  changePlanId: number;
  note?: string | null;
}): Promise<AnnouncementRollbackRecord | { error: string; status: number; code?: string }> {
  const plan = await loadPlanWithRelations(input.changePlanId);
  if (!plan) {
    return { error: "Change-plan not found", status: 404, code: "CHANGE_PLAN_NOT_FOUND" };
  }
  const tables = await loadBgpAnnouncementTables();
  const { bgpAnnouncementChangePlansTable, bgpAnnouncementRollbacksTable, db } = tables;
  const latestSnapshotId = await loadLatestSnapshotId(plan.deviceId);
  if (!latestSnapshotId) {
    return { error: "Snapshot latest not found", status: 404, code: "SNAPSHOT_NOT_FOUND" };
  }
  if (!plan.rollbackCommands.length) {
    return { error: "Rollback commands missing", status: 400, code: "ROLLBACK_COMMANDS_MISSING" };
  }
  if (!(plan.latestExecution || plan.latestPostcheck || ["approved", "dry_run_succeeded", "execution_blocked"].includes(plan.status))) {
    return { error: "Rollback not justified yet", status: 409, code: "CHANGE_PLAN_INVALID_STATUS" };
  }

  const existing = await loadLatestRollbackForPlan(plan.id);
  if (existing && !isTerminalRollbackStatus(existing.status)) {
    return { error: "Rollback already active", status: 409, code: "CHANGE_PLAN_CONFLICT_ACTIVE" };
  }

  const now = new Date();
  const [row] = await db
    .insert(bgpAnnouncementRollbacksTable)
    .values({
      changePlanId: plan.id,
      executionId: plan.latestExecution?.id ?? null,
      approvalId: plan.approval?.id ?? null,
      deviceId: plan.deviceId,
      baseSnapshotId: plan.baseSnapshotId,
      rollbackToSnapshotId: plan.baseSnapshotId,
      currentSnapshotId: latestSnapshotId,
      status: "pending_approval",
      mode: "dry_run",
      requestedBy: getRequestContext()?.user?.id ?? null,
      requestedAt: now,
      approvedBy: null,
      approvedAt: null,
      startedAt: null,
      finishedAt: null,
      rollbackCommandsJson: plan.rollbackCommands,
      rollbackDiffJson: buildRollbackDiffFromPlan(plan),
      rollbackLogJson: [],
      postcheckId: null,
      errorMessage: null,
      createdAt: now,
      updatedAt: now,
    })
    .returning();

  if (!row) {
    return { error: "Failed to request rollback", status: 500, code: "ROLLBACK_REQUEST_FAILED" };
  }

  await db
    .update(bgpAnnouncementChangePlansTable)
    .set({ updatedAt: now })
    .where(eq(bgpAnnouncementChangePlansTable.id, plan.id));

  const rollback = serializeRollback(row);
  await recordAnnouncementAuditEvent({
    action: "ROLLBACK_REQUESTED",
    changePlan: plan,
    executionId: plan.latestExecution?.id ?? null,
    summary: `Rollback requested for ${plan.targetPolicyName} / ${plan.upstreamCircuitId}`,
  });
  return rollback;
}

export async function reviewAnnouncementRollback(input: {
  rollbackId: number;
  status: "approved" | "rejected";
  reason?: string | null;
}): Promise<AnnouncementRollbackRecord | { error: string; status: number; code?: string }> {
  const { bgpAnnouncementRollbacksTable, db } = await loadBgpAnnouncementTables();
  const [row] = await db.select().from(bgpAnnouncementRollbacksTable).where(eq(bgpAnnouncementRollbacksTable.id, input.rollbackId)).limit(1);
  if (!row) {
    return { error: "Rollback not found", status: 404, code: "ROLLBACK_NOT_FOUND" };
  }
  const rollback = serializeRollback(row);
  if (rollback.status !== "pending_approval") {
    return { error: "Rollback status invalid", status: 409, code: "ROLLBACK_INVALID_STATUS" };
  }
  const plan = await loadPlanWithRelations(rollback.changePlanId);
  if (!plan) {
    return { error: "Change-plan not found", status: 404, code: "CHANGE_PLAN_NOT_FOUND" };
  }
  const now = new Date();
  const [updated] = await db
    .update(bgpAnnouncementRollbacksTable)
    .set({
      status: input.status === "approved" ? "approved" : "cancelled",
      approvedBy: getRequestContext()?.user?.id ?? null,
      approvedAt: now,
      updatedAt: now,
    })
    .where(eq(bgpAnnouncementRollbacksTable.id, rollback.id))
    .returning();
  if (!updated) {
    return { error: "Failed to update rollback", status: 500, code: "ROLLBACK_NOT_FOUND" };
  }
  const next = serializeRollback(updated);
  await recordAnnouncementAuditEvent({
    action: input.status === "approved" ? "ROLLBACK_APPROVED" : "ROLLBACK_REJECTED",
    changePlan: plan,
    summary: `${input.status === "approved" ? "Approved" : "Rejected"} rollback for ${plan.targetPolicyName} / ${plan.upstreamCircuitId}`,
  });
  return next;
}

export async function executeAnnouncementRollbackDryRun(rollbackId: number): Promise<AnnouncementRollbackRecord | { error: string; status: number; code?: string }> {
  const tables = await loadBgpAnnouncementTables();
  const { bgpAnnouncementChangePlansTable, bgpAnnouncementRollbacksTable, db } = tables;
  const [row] = await db.select().from(bgpAnnouncementRollbacksTable).where(eq(bgpAnnouncementRollbacksTable.id, rollbackId)).limit(1);
  if (!row) {
    return { error: "Rollback not found", status: 404, code: "ROLLBACK_NOT_FOUND" };
  }
  const rollback = serializeRollback(row);
  const plan = await loadPlanWithRelations(rollback.changePlanId);
  if (!plan) {
    return { error: "Change-plan not found", status: 404, code: "CHANGE_PLAN_NOT_FOUND" };
  }
  if (!env.bgpAnnouncementRollbackDryRunEnabled) {
    return { error: "Rollback dry-run disabled", status: 503, code: "ROLLBACK_DRY_RUN_DISABLED" };
  }
  if (!["approved", "dry_run_succeeded", "execution_blocked"].includes(plan.status)) {
    return { error: "Rollback status invalid", status: 409, code: "ROLLBACK_INVALID_STATUS" };
  }
  if (rollback.status !== "approved") {
    return { error: "Rollback approval required", status: 409, code: "ROLLBACK_APPROVAL_REQUIRED" };
  }
  const logs = buildAnnouncementRollbackExecutionLog(rollback.rollbackCommands, rollback.mode);
  const now = new Date();
  await recordAnnouncementAuditEvent({
    action: "ROLLBACK_DRY_RUN_STARTED",
    changePlan: plan,
    summary: `Rollback dry-run started for ${plan.targetPolicyName} / ${plan.upstreamCircuitId}`,
  });
  const [updated] = await db
    .update(bgpAnnouncementRollbacksTable)
    .set({
      status: "dry_run_running",
      mode: "dry_run",
      startedAt: now,
      updatedAt: now,
    })
    .where(eq(bgpAnnouncementRollbacksTable.id, rollback.id))
    .returning();
  if (!updated) {
    return { error: "Failed to start rollback dry-run", status: 500, code: "ROLLBACK_DRY_RUN_FAILED" };
  }

  const [finished] = await db
    .update(bgpAnnouncementRollbacksTable)
    .set({
      status: "dry_run_succeeded",
      mode: "dry_run",
      finishedAt: now,
      rollbackLogJson: logs,
      errorMessage: null,
      updatedAt: now,
    })
    .where(eq(bgpAnnouncementRollbacksTable.id, rollback.id))
    .returning();
  if (!finished) {
    return { error: "Failed to execute rollback dry-run", status: 500, code: "ROLLBACK_DRY_RUN_FAILED" };
  }
  await db
    .update(bgpAnnouncementChangePlansTable)
    .set({ updatedAt: now })
    .where(eq(bgpAnnouncementChangePlansTable.id, plan.id));
  await recordAnnouncementAuditEvent({
    action: "ROLLBACK_DRY_RUN_SUCCEEDED",
    changePlan: plan,
    summary: `Rollback dry-run succeeded for ${plan.targetPolicyName} / ${plan.upstreamCircuitId}`,
  });
  return serializeRollback(finished);
}

export async function blockAnnouncementRollbackExecution(rollbackId: number): Promise<{ blocked: true; reason: string; featureFlag: string } | { error: string; status: number; code?: string }> {
  const rollback = await getAnnouncementRollbackRow(rollbackId);
  if (!rollback) {
    return { error: "Rollback not found", status: 404, code: "ROLLBACK_NOT_FOUND" };
  }
  const plan = await loadPlanWithRelations(rollback.changePlanId);
  if (!plan) {
    return { error: "Change-plan not found", status: 404, code: "CHANGE_PLAN_NOT_FOUND" };
  }
  if (!["approved", "dry_run_succeeded", "execution_blocked"].includes(plan.status)) {
    return { error: "Rollback status invalid", status: 409, code: "ROLLBACK_INVALID_STATUS" };
  }
  if (!["approved", "dry_run_succeeded"].includes(rollback.status)) {
    return { error: "Rollback approval required", status: 409, code: "ROLLBACK_APPROVAL_REQUIRED" };
  }
  const tables = await loadBgpAnnouncementTables();
  const { bgpAnnouncementRollbacksTable, db } = tables;
  const now = new Date();
  await db
    .update(bgpAnnouncementRollbacksTable)
    .set({
      status: "real_blocked",
      mode: "real_blocked",
      finishedAt: now,
      errorMessage: "Rollback real execution disabled by feature flag",
      updatedAt: now,
    })
    .where(eq(bgpAnnouncementRollbacksTable.id, rollback.id));
  await recordAnnouncementAuditEvent({
    action: "ROLLBACK_REAL_BLOCKED",
    changePlan: plan,
    summary: `Rollback real execution blocked for ${plan.targetPolicyName} / ${plan.upstreamCircuitId}`,
  });
  return {
    blocked: true,
    reason: "Rollback real execution is disabled by feature flag",
    featureFlag: "BGP_ANNOUNCEMENT_ROLLBACK_ENABLED",
  };
}

async function loadSnapshotRowForRollback(snapshotId: number, plan: AnnouncementChangePlanRecord) {
  const { loadAnnouncementMatrixSnapshotById } = await import("./bgp-announcements.snapshot.service.js");
  const snapshot = await loadAnnouncementMatrixSnapshotById(snapshotId);
  if (!snapshot) return null;
  const matrix = snapshot.matrixJson;
  const row = matrix.rows.find((item) =>
    (item.targetPolicyName ?? item.routePolicyName ?? "").toLowerCase() === plan.targetPolicyName.toLowerCase()
    && item.targetType === plan.targetType,
  ) ?? null;
  const cell = row?.cells?.[plan.upstreamCircuitId] ?? null;
  return { snapshot, row, cell };
}

export function buildRollbackPostcheckFindings(input: {
  rollback: AnnouncementRollbackRecord;
  plan: AnnouncementChangePlanRecord;
  expected: any;
  observed: any;
}): { status: AnnouncementPostcheckStatus; findings: AnnouncementFinding[]; diff: Record<string, unknown> } {
  const findings: AnnouncementFinding[] = [];
  const expectedCell = input.expected?.cell ?? null;
  const observedCell = input.observed?.cell ?? null;
  if (!input.expected || !input.observed || !input.expected.row || !input.expected.cell || !input.observed.row || !input.observed.cell) {
    findings.push({
      code: "POSTCHECK_INCONCLUSIVE",
      severity: "warning",
      scope: "snapshot",
      targetPolicyName: input.plan.targetPolicyName,
      node: input.plan.node,
      upstreamCircuitId: input.plan.upstreamCircuitId,
      message: "Snapshot esperado/observado não pôde resolver target/upstream.",
    });
    return {
      status: "inconclusive",
      findings,
      diff: {
        rollbackId: input.rollback.id,
        reason: "target_or_upstream_missing",
        expectedSnapshotId: input.rollback.rollbackToSnapshotId,
        observedSnapshotId: input.observed?.snapshot.id ?? null,
      },
    };
  }

  const expectedState = expectedCell?.label ?? expectedCell?.state ?? "—";
  const observedState = observedCell?.label ?? observedCell?.state ?? "—";
  const expectedCommunity = expectedCell?.community ?? null;
  const observedCommunity = observedCell?.community ?? null;

  if (expectedState !== observedState) {
    findings.push({
      code: "POSTCHECK_STATE_MISMATCH",
      severity: "error",
      scope: "cell",
      targetPolicyName: input.plan.targetPolicyName,
      node: input.plan.node,
      upstreamCircuitId: input.plan.upstreamCircuitId,
      message: `Rollback esperado ${expectedState} mas observado ${observedState}.`,
    });
  }
  if ((expectedCommunity ?? null) !== (observedCommunity ?? null)) {
    findings.push({
      code: "POSTCHECK_COMMUNITY_MISMATCH",
      severity: "error",
      scope: "cell",
      targetPolicyName: input.plan.targetPolicyName,
      node: input.plan.node,
      upstreamCircuitId: input.plan.upstreamCircuitId,
      message: `Rollback esperado community ${expectedCommunity ?? "—"} mas observado ${observedCommunity ?? "—"}.`,
    });
  }
  if (observedCell?.findings?.some((finding: AnnouncementFinding) => finding.severity === "error")) {
    findings.push({
      code: "POSTCHECK_CRITICAL_AUDIT_FINDING",
      severity: "error",
      scope: "upstream",
      targetPolicyName: input.plan.targetPolicyName,
      node: input.plan.node,
      upstreamCircuitId: input.plan.upstreamCircuitId,
      message: "Rollback postcheck encontrou finding crítico no snapshot observado.",
    });
  }

  return {
    status: findings.some((finding) => finding.severity === "error") ? "failed" : "succeeded",
    findings,
    diff: {
      rollbackId: input.rollback.id,
      expectedSnapshotId: input.rollback.rollbackToSnapshotId,
      observedSnapshotId: input.observed.snapshot.id,
      expectedState,
      observedState,
      expectedCommunity,
      observedCommunity,
    },
  };
}

export async function executeAnnouncementRollbackControlled(rollbackId: number): Promise<AnnouncementRollbackRecord | { blocked: true; reason: string; featureFlag: string } | { error: string; status: number; code?: string }> {
  if (!env.bgpAnnouncementRollbackEnabled) {
    return blockAnnouncementRollbackExecution(rollbackId);
  }

  const rollback = await getAnnouncementRollbackRow(rollbackId);
  if (!rollback) {
    return { error: "Rollback not found", status: 404, code: "ROLLBACK_NOT_FOUND" };
  }
  const plan = await loadPlanWithRelations(rollback.changePlanId);
  if (!plan) {
    return { error: "Change-plan not found", status: 404, code: "CHANGE_PLAN_NOT_FOUND" };
  }
  const tables = await loadBgpAnnouncementTables();
  const { bgpAnnouncementRollbacksTable, db } = tables;
  const now = new Date();
  const logs = buildAnnouncementRollbackExecutionLog(rollback.rollbackCommands, "real");
  const [updated] = await db
    .update(bgpAnnouncementRollbacksTable)
    .set({
      status: "real_succeeded",
      mode: "real",
      startedAt: now,
      finishedAt: now,
      rollbackLogJson: logs,
      errorMessage: null,
      updatedAt: now,
    })
    .where(eq(bgpAnnouncementRollbacksTable.id, rollback.id))
    .returning();
  if (!updated) {
    return { error: "Failed to execute rollback", status: 500, code: "ROLLBACK_EXECUTION_FAILED" };
  }
  await recordAnnouncementAuditEvent({
    action: "ROLLBACK_REAL_SUCCEEDED",
    changePlan: plan,
    summary: `Rollback real execution simulated for ${plan.targetPolicyName} / ${plan.upstreamCircuitId}`,
  });
  return serializeRollback(updated);
}

export async function runAnnouncementRollbackPostcheck(rollbackId: number): Promise<AnnouncementRollbackRecord | { error: string; status: number; code?: string }> {
  const rollback = await getAnnouncementRollbackRow(rollbackId);
  if (!rollback) {
    return { error: "Rollback not found", status: 404, code: "ROLLBACK_NOT_FOUND" };
  }
  const plan = await loadPlanWithRelations(rollback.changePlanId);
  if (!plan) {
    return { error: "Change-plan not found", status: 404, code: "CHANGE_PLAN_NOT_FOUND" };
  }
  const { refreshAnnouncementMatrixForDevice } = await import("./bgp-announcements.service.js");
  const tables = await loadBgpAnnouncementTables();
  const { bgpAnnouncementRollbacksTable, db } = tables;
  const startedAt = new Date();
  await recordAnnouncementAuditEvent({
    action: "ROLLBACK_POSTCHECK_STARTED",
    changePlan: plan,
    summary: `Rollback postcheck started for ${plan.targetPolicyName} / ${plan.upstreamCircuitId}`,
  });

  try {
    const refreshResult = await refreshAnnouncementMatrixForDevice({
      deviceId: plan.deviceId,
      requestedBy: getRequestContext()?.user?.id ?? null,
      triggerType: "manual",
    });
    if ("error" in refreshResult) {
      const [failed] = await db
        .update(bgpAnnouncementRollbacksTable)
        .set({
          status: "postcheck_inconclusive",
          finishedAt: new Date(),
          errorMessage: refreshResult.error,
          rollbackLogJson: buildAnnouncementRollbackExecutionLog(rollback.rollbackCommands, rollback.mode),
          updatedAt: new Date(),
        })
        .where(eq(bgpAnnouncementRollbacksTable.id, rollback.id))
        .returning();
      await recordAnnouncementAuditEvent({
        action: "ROLLBACK_POSTCHECK_FAILED",
        changePlan: plan,
        summary: `Rollback postcheck inconclusive for ${plan.targetPolicyName} / ${plan.upstreamCircuitId}`,
      });
      return serializeRollback(failed ?? rollback);
    }

    const expected = await loadSnapshotRowForRollback(rollback.rollbackToSnapshotId, plan);
    const observedSnapshot = await loadSnapshotRowForRollback(refreshResult.snapshot_id, plan);
    const result = buildRollbackPostcheckFindings({
      rollback,
      plan,
      expected,
      observed: observedSnapshot,
    });

    const [updated] = await db
      .update(bgpAnnouncementRollbacksTable)
      .set({
        currentSnapshotId: refreshResult.snapshot_id,
        status: result.status === "succeeded" ? "postcheck_succeeded" : "postcheck_failed",
        mode: rollback.mode,
        startedAt,
        finishedAt: new Date(),
        rollbackDiffJson: result.diff,
        rollbackLogJson: buildAnnouncementRollbackExecutionLog(rollback.rollbackCommands, rollback.mode),
        errorMessage: result.status === "succeeded" ? null : "Rollback postcheck failed",
        updatedAt: new Date(),
      })
      .where(eq(bgpAnnouncementRollbacksTable.id, rollback.id))
      .returning();

    await recordAnnouncementAuditEvent({
      action: result.status === "succeeded" ? "ROLLBACK_POSTCHECK_SUCCEEDED" : "ROLLBACK_POSTCHECK_FAILED",
      changePlan: plan,
      summary: `Rollback postcheck ${result.status} for ${plan.targetPolicyName} / ${plan.upstreamCircuitId}`,
    });
    return serializeRollback(updated ?? rollback);
  } catch (error) {
    const [updated] = await db
      .update(bgpAnnouncementRollbacksTable)
      .set({
        status: "postcheck_inconclusive",
        finishedAt: new Date(),
        errorMessage: error instanceof Error ? error.message : "Rollback postcheck failure",
        updatedAt: new Date(),
      })
      .where(eq(bgpAnnouncementRollbacksTable.id, rollback.id))
      .returning();
    await recordAnnouncementAuditEvent({
      action: "ROLLBACK_POSTCHECK_FAILED",
      changePlan: plan,
      summary: `Rollback postcheck failed for ${plan.targetPolicyName} / ${plan.upstreamCircuitId}`,
    });
    return serializeRollback(updated ?? rollback);
  }
}

export async function executeAnnouncementChangePlanDryRun(changePlanId: number): Promise<AnnouncementExecutionRecord | { error: string; status: number; code?: string }> {
  const tables = await loadBgpAnnouncementTables();
  const { bgpAnnouncementApprovalsTable, bgpAnnouncementChangePlansTable, bgpAnnouncementExecutionsTable, db } = tables;
  const plan = await loadPlanWithRelations(changePlanId);
  if (!plan) {
    return { error: "Change-plan not found", status: 404, code: "CHANGE_PLAN_NOT_FOUND" };
  }
  const [approvalRow] = await db
    .select()
    .from(bgpAnnouncementApprovalsTable)
    .where(and(eq(bgpAnnouncementApprovalsTable.changePlanId, plan.id), eq(bgpAnnouncementApprovalsTable.status, "approved")))
    .orderBy(desc(bgpAnnouncementApprovalsTable.reviewedAt))
    .limit(1);

  const dryRunGate = buildAnnouncementDryRunGateFindings({
    dryRunEnabled: env.bgpAnnouncementDryRunEnabled,
    executionEnabled: env.bgpAnnouncementExecutionEnabled,
    planStatus: plan.status,
    approvalApproved: Boolean(approvalRow),
  });
  if (dryRunGate.blocked) {
    const code = dryRunGate.code ?? "CHANGE_PLAN_INVALID_STATUS";
    const status = code === "DRY_RUN_DISABLED" ? 503 : code === "REAL_EXECUTION_ENABLED" ? 409 : 409;
    return { error: dryRunGate.findings[0]?.message ?? "Dry-run blocked", status, code };
  }
  if (!approvalRow) {
    return { error: "Approved approval not found", status: 409, code: "NO_APPROVAL" };
  }

  const logs = buildAnnouncementDryRunExecutionLog({
    proposedCommands: plan.proposedCommands,
    rollbackCommands: plan.rollbackCommands,
  });
  const startedAt = new Date();
  const executionStatus = "succeeded" as const;
  await recordAnnouncementAuditEvent({
    action: "CHANGE_PLAN_DRY_RUN_STARTED",
    changePlan: plan,
    approvalId: approvalRow.id,
    summary: `Dry-run started for ${plan.targetPolicyName} / ${plan.upstreamCircuitId}`,
  });

  try {
    const [executionRow] = await db.transaction(async (tx) => {
      await tx.update(bgpAnnouncementChangePlansTable).set({ status: "dry_run_ready", updatedAt: new Date() }).where(eq(bgpAnnouncementChangePlansTable.id, plan.id));
      await tx.update(bgpAnnouncementChangePlansTable).set({ status: "dry_run_running", updatedAt: new Date() }).where(eq(bgpAnnouncementChangePlansTable.id, plan.id));
      return tx
        .insert(bgpAnnouncementExecutionsTable)
        .values({
          changePlanId: plan.id,
          approvalId: approvalRow.id,
          deviceId: plan.deviceId,
          mode: "dry_run",
          status: executionStatus,
          startedBy: getRequestContext()?.user?.id ?? null,
          startedAt,
          finishedAt: new Date(),
          baseSnapshotId: plan.baseSnapshotId,
          collectionId: plan.collectionId,
          proposedCommandsJson: plan.proposedCommands,
          rollbackCommandsJson: plan.rollbackCommands,
          executionLogJson: logs,
          resultJson: {
            status: executionStatus,
            mode: "dry_run",
            postcheckRequired: true,
            realExecutionEnabled: env.bgpAnnouncementExecutionEnabled,
          },
          errorMessage: null,
          createdAt: startedAt,
          updatedAt: new Date(),
        })
        .returning();
    });

    if (!executionRow) {
      return { error: "Failed to create execution", status: 500, code: "EXECUTION_FAILED" };
    }

    await db
      .update(bgpAnnouncementChangePlansTable)
      .set({
        status: "dry_run_succeeded",
        postcheckRequired: true,
        postcheckStatus: "pending",
        updatedAt: new Date(),
      })
      .where(eq(bgpAnnouncementChangePlansTable.id, plan.id));

    const execution = serializeExecution(executionRow);
    await recordAnnouncementAuditEvent({
      action: "CHANGE_PLAN_DRY_RUN_SUCCEEDED",
      changePlan: plan,
      approvalId: approvalRow.id,
      executionId: execution.id,
      summary: `Dry-run succeeded for ${plan.targetPolicyName} / ${plan.upstreamCircuitId}`,
    });
    return execution;
  } catch (error) {
    await db
      .update(bgpAnnouncementChangePlansTable)
      .set({
        status: "dry_run_failed",
        postcheckRequired: true,
        postcheckStatus: "pending",
        updatedAt: new Date(),
      })
      .where(eq(bgpAnnouncementChangePlansTable.id, plan.id));
    await recordAnnouncementAuditEvent({
      action: "CHANGE_PLAN_DRY_RUN_FAILED",
      changePlan: plan,
      approvalId: approvalRow.id,
      summary: `Dry-run failed for ${plan.targetPolicyName} / ${plan.upstreamCircuitId}`,
    });
    return {
      error: error instanceof Error ? error.message : "Failed to execute dry-run",
      status: 500,
      code: "EXECUTION_FAILED",
    };
  }
}

export async function blockAnnouncementChangePlanExecution(changePlanId: number): Promise<{ blocked: true; reason: string; featureFlag: string } | { error: string; status: number; code?: string }> {
  const plan = await loadPlanWithRelations(changePlanId);
  if (!plan) {
    return { error: "Change-plan not found", status: 404, code: "CHANGE_PLAN_NOT_FOUND" };
  }

  const tables = await loadBgpAnnouncementTables();
  const { bgpAnnouncementExecutionsTable, bgpAnnouncementChangePlansTable, db } = tables;
  const startedAt = new Date();
  const [executionRow] = await db
    .insert(bgpAnnouncementExecutionsTable)
    .values({
      changePlanId: plan.id,
      approvalId: plan.approval?.id ?? null,
      deviceId: plan.deviceId,
      mode: "real_blocked",
      status: "blocked",
      startedBy: getRequestContext()?.user?.id ?? null,
      startedAt,
      finishedAt: new Date(),
      baseSnapshotId: plan.baseSnapshotId,
      collectionId: plan.collectionId,
      proposedCommandsJson: plan.proposedCommands,
      rollbackCommandsJson: plan.rollbackCommands,
      executionLogJson: [{ step: 1, type: "note", status: "blocked", message: "Real execution disabled by feature flag" }],
      resultJson: {
        blocked: true,
        reason: "BGP announcement real execution is disabled by feature flag",
        featureFlag: "BGP_ANNOUNCEMENT_EXECUTION_ENABLED",
      },
      errorMessage: "BGP announcement real execution is disabled by feature flag",
      createdAt: startedAt,
      updatedAt: new Date(),
    })
    .returning();

  await db
    .update(bgpAnnouncementChangePlansTable)
    .set({ status: "execution_blocked", updatedAt: new Date() })
    .where(eq(bgpAnnouncementChangePlansTable.id, plan.id));

  await recordAnnouncementAuditEvent({
    action: "CHANGE_PLAN_REAL_EXECUTION_BLOCKED",
    changePlan: plan,
    executionId: executionRow?.id ?? null,
    summary: `Real execution blocked for ${plan.targetPolicyName} / ${plan.upstreamCircuitId}`,
  });

  return {
    blocked: true,
    reason: "BGP announcement real execution is disabled by feature flag",
    featureFlag: "BGP_ANNOUNCEMENT_EXECUTION_ENABLED",
  };
}

export function buildAnnouncementExecutionLockKey(input: {
  deviceId: number;
  targetPolicyName: string;
  node: number | null;
  upstreamCircuitId: string;
}): string {
  return `${input.deviceId}|${input.targetPolicyName.trim().toLowerCase()}|${input.node ?? "null"}|${input.upstreamCircuitId.trim()}`;
}

export function assessAnnouncementExecutionLockAvailability(input: {
  locks: Array<Pick<AnnouncementExecutionLockRecord, "status" | "expiresAt">>;
  now?: Date;
}): {
  activeLockExists: boolean;
  expiredLockCount: number;
  canAcquire: boolean;
} {
  const now = input.now ?? new Date();
  let activeLockExists = false;
  let expiredLockCount = 0;
  for (const lock of input.locks) {
    const expiresAt = new Date(lock.expiresAt);
    if (lock.status === "active" && expiresAt.getTime() > now.getTime()) {
      activeLockExists = true;
    }
    if (lock.status === "active" && expiresAt.getTime() <= now.getTime()) {
      expiredLockCount += 1;
    }
  }
  return {
    activeLockExists,
    expiredLockCount,
    canAcquire: !activeLockExists,
  };
}

export function buildAnnouncementRealExecutionGuardFindings(input: {
  executionEnabled: boolean;
  approvalApproved: boolean;
  dryRunSucceeded: boolean;
  postcheckRequired: boolean;
  lockAcquired: boolean;
  lockConflict: boolean;
  baseSnapshotFound: boolean;
  baseSnapshotLatest: boolean;
  targetModifiable: boolean;
  targetType: string;
  riskLevel: string;
  refreshInProgress: boolean;
  permissionGranted: boolean;
  provider: AnnouncementRealExecutionProvider;
  maintenanceWindowAllowed: boolean;
  targetChanged: boolean;
  snapshotChanged: boolean;
}): { blocked: boolean; findings: AnnouncementFinding[] } {
  const findings: AnnouncementFinding[] = [];
  if (!input.executionEnabled) {
    findings.push({
      code: "EXECUTION_FLAG_DISABLED",
      severity: "error",
      scope: "snapshot",
      message: "Execução real desabilitada por feature flag.",
    });
  }
  if (!input.permissionGranted) {
    findings.push({
      code: "EXECUTION_PERMISSION_DENIED",
      severity: "error",
      scope: "snapshot",
      message: "Usuário sem permissão para execute.real.",
    });
  }
  if (!input.approvalApproved) {
    findings.push({
      code: "EXECUTION_APPROVAL_REQUIRED",
      severity: "error",
      scope: "snapshot",
      message: "Approval aprovado é obrigatório antes da execução.",
    });
  }
  if (!input.dryRunSucceeded) {
    findings.push({
      code: "EXECUTION_DRY_RUN_REQUIRED",
      severity: "error",
      scope: "snapshot",
      message: "Dry-run aprovado é obrigatório antes da execução.",
    });
  }
  if (!input.postcheckRequired) {
    findings.push({
      code: "EXECUTION_POSTCHECK_REQUIRED",
      severity: "error",
      scope: "snapshot",
      message: "Postcheck é obrigatório.",
    });
  }
  if (input.lockConflict) {
    findings.push({
      code: "EXECUTION_LOCK_ACTIVE",
      severity: "error",
      scope: "snapshot",
      message: "Lock operacional já está ativo para este alvo.",
    });
  } else if (!input.lockAcquired) {
    findings.push({
      code: "EXECUTION_LOCK_REQUIRED",
      severity: "error",
      scope: "snapshot",
      message: "Lock operacional obrigatório antes da execução.",
    });
  }
  if (!input.baseSnapshotFound || !input.baseSnapshotLatest) {
    findings.push({
      code: "EXECUTION_SNAPSHOT_CHANGED",
      severity: "error",
      scope: "snapshot",
      message: "Snapshot base mudou ou não é mais latest.",
    });
  }
  if (!input.targetModifiable) {
    findings.push({
      code: input.targetType === "customer_export" ? "TARGET_IS_EXPORT_POLICY" : input.targetType === "upstream_export_audit" || input.targetType === "upstream_import_audit" ? "TARGET_IS_UPSTREAM_AUDIT_ONLY" : "TARGET_NOT_MODIFIABLE",
      severity: "error",
      scope: "target",
      message: "Target não pode ser executado.",
    });
  }
  if (input.riskLevel === "critical") {
    findings.push({
      code: "EXECUTION_RISK_CRITICAL",
      severity: "error",
      scope: "snapshot",
      message: "Risco crítico bloqueia a execução.",
    });
  }
  if (input.refreshInProgress) {
    findings.push({
      code: "REFRESH_IN_PROGRESS",
      severity: "error",
      scope: "snapshot",
      message: "Refresh em andamento para o device.",
    });
  }
  if (input.provider === "disabled") {
    findings.push({
      code: "EXECUTION_PROVIDER_DISABLED",
      severity: "error",
      scope: "snapshot",
      message: "Provider de execução real está desabilitado.",
    });
  }
  if (!input.maintenanceWindowAllowed) {
    findings.push({
      code: "EXECUTION_MAINTENANCE_WINDOW_REQUIRED",
      severity: "error",
      scope: "snapshot",
      message: "Janela de manutenção obrigatória e indisponível.",
    });
  }
  if (input.targetChanged) {
    findings.push({
      code: "EXECUTION_TARGET_CHANGED",
      severity: "error",
      scope: "snapshot",
      message: "Estado observado do target divergiu do preview/base.",
    });
  }
  if (input.snapshotChanged) {
    findings.push({
      code: "EXECUTION_SNAPSHOT_CHANGED",
      severity: "error",
      scope: "snapshot",
      message: "Snapshot observado divergiu do base_snapshot_id.",
    });
  }
  return {
    blocked: findings.some((finding) => finding.severity === "error"),
    findings,
  };
}

export function buildAnnouncementPostcheckComparison(input: {
  changePlan: Pick<AnnouncementChangePlanRecord, "targetPolicyName" | "targetType" | "node" | "upstreamCircuitId" | "upstreamName" | "currentState" | "desiredState" | "currentCommunity" | "desiredCommunity" | "baseSnapshotId" | "preview" | "postcheckStatus">;
  observedSnapshotId: number | null;
  observedMatrix: Pick<AnnouncementMatrixPayload, "rows" | "upstreamAudit"> | null;
}): {
  status: AnnouncementPostcheckStatus;
  diff: Record<string, unknown>;
  findings: AnnouncementFinding[];
  expectedState: string;
  observedState: string;
  expectedCommunity: string | null;
  observedCommunity: string | null;
} {
  const preview = input.changePlan.preview;
  const targetRow = input.observedMatrix?.rows.find((row) =>
    (row.targetPolicyName ?? "").toLowerCase() === preview.targetPolicyName.toLowerCase()
    && row.targetType === preview.targetType,
  ) ?? null;
  const targetCell = targetRow?.cells[preview.upstreamCircuitId] ?? null;
  const findings: AnnouncementFinding[] = [];
  const expectedState = preview.desiredState;
  const observedState = targetCell?.label ?? targetCell?.state ?? "—";
  const expectedCommunity = preview.desiredCommunity ?? null;
  const observedCommunity = targetCell?.community ?? null;

  if (!input.observedMatrix || !targetRow || !targetCell) {
    findings.push({
      code: "POSTCHECK_INCONCLUSIVE",
      severity: "warning",
      scope: "snapshot",
      targetPolicyName: preview.targetPolicyName,
      node: preview.node,
      upstreamCircuitId: preview.upstreamCircuitId,
      message: "Não foi possível resolver target/upstream no snapshot observado.",
      evidence: { observedSnapshotId: input.observedSnapshotId ?? null },
    });
    return {
      status: "inconclusive",
      diff: {
        expectedState,
        observedState,
        expectedCommunity,
        observedCommunity,
        reason: "target_or_upstream_missing",
      },
      findings,
      expectedState,
      observedState,
      expectedCommunity,
      observedCommunity,
    };
  }

  if (targetCell.state === "!" || targetCell.findings?.some((finding) => finding.code === "MULTIPLE_ACTIONS_FOR_SAME_UPSTREAM")) {
    findings.push({
      code: "POSTCHECK_CONFLICT_PRESENT",
      severity: "error",
      scope: "cell",
      targetPolicyName: preview.targetPolicyName,
      node: preview.node,
      upstreamCircuitId: preview.upstreamCircuitId,
      message: "Conflito de upstream ainda presente no snapshot observado.",
    });
  }

  if (observedState !== expectedState) {
    findings.push({
      code: "POSTCHECK_STATE_MISMATCH",
      severity: "error",
      scope: "cell",
      targetPolicyName: preview.targetPolicyName,
      node: preview.node,
      upstreamCircuitId: preview.upstreamCircuitId,
      message: `Estado observado ${observedState} não bate com ${expectedState}.`,
    });
  }

  if ((observedCommunity ?? null) !== (expectedCommunity ?? null)) {
    findings.push({
      code: "POSTCHECK_COMMUNITY_MISMATCH",
      severity: "error",
      scope: "cell",
      targetPolicyName: preview.targetPolicyName,
      node: preview.node,
      upstreamCircuitId: preview.upstreamCircuitId,
      message: `Community observada ${observedCommunity ?? "—"} não bate com ${expectedCommunity ?? "—"}.`,
    });
  }

  if (input.observedMatrix.upstreamAudit?.findings.some((finding) => finding.severity === "error")) {
    findings.push({
      code: "POSTCHECK_CRITICAL_AUDIT_FINDING",
      severity: "error",
      scope: "upstream",
      targetPolicyName: preview.targetPolicyName,
      node: preview.node,
      upstreamCircuitId: preview.upstreamCircuitId,
      message: "Upstream audit gerou finding crítico no snapshot observado.",
    });
  }

  if (targetRow.prefixScope?.type && preview.prefixScope?.type && targetRow.prefixScope.type !== preview.prefixScope.type) {
    findings.push({
      code: "POSTCHECK_PREFIX_SCOPE_CHANGED",
      severity: "warning",
      scope: "prefix_scope",
      targetPolicyName: preview.targetPolicyName,
      node: preview.node,
      upstreamCircuitId: preview.upstreamCircuitId,
      message: "Prefix scope mudou entre preview e snapshot observado.",
    });
  }

  const status: AnnouncementPostcheckStatus = findings.some((finding) => finding.severity === "error")
    ? "failed"
    : "succeeded";

  return {
    status,
    diff: {
      expectedState,
      observedState,
      expectedCommunity,
      observedCommunity,
      expectedSnapshotId: input.changePlan.baseSnapshotId,
      observedSnapshotId: input.observedSnapshotId,
      targetPolicyName: preview.targetPolicyName,
      upstreamCircuitId: preview.upstreamCircuitId,
    },
    findings,
    expectedState,
    observedState,
    expectedCommunity,
    observedCommunity,
  };
}

async function loadLatestPostcheckForPlan(changePlanId: number): Promise<AnnouncementPostcheckRecord | null> {
  const { bgpAnnouncementPostchecksTable, db } = await loadBgpAnnouncementTables();
  const [row] = await db
    .select()
    .from(bgpAnnouncementPostchecksTable)
    .where(eq(bgpAnnouncementPostchecksTable.changePlanId, changePlanId))
    .orderBy(desc(bgpAnnouncementPostchecksTable.startedAt))
    .limit(1);
  return row ? serializeAnnouncementPostcheck(row) : null;
}

async function loadLatestExecutionLockForPlan(plan: AnnouncementChangePlanRecord): Promise<AnnouncementExecutionLockRecord | null> {
  const { bgpAnnouncementExecutionLocksTable, db } = await loadBgpAnnouncementTables();
  const [row] = await db
    .select()
    .from(bgpAnnouncementExecutionLocksTable)
    .where(and(
      eq(bgpAnnouncementExecutionLocksTable.deviceId, plan.deviceId),
      eq(bgpAnnouncementExecutionLocksTable.targetPolicyName, plan.targetPolicyName),
      eq(bgpAnnouncementExecutionLocksTable.upstreamCircuitId, plan.upstreamCircuitId),
    ))
    .orderBy(desc(bgpAnnouncementExecutionLocksTable.lockedAt))
    .limit(1);
  if (!row) return null;
  return {
    id: row.id,
    deviceId: row.deviceId,
    targetPolicyName: row.targetPolicyName,
    node: row.node,
    upstreamCircuitId: row.upstreamCircuitId,
    changePlanId: row.changePlanId,
    executionId: row.executionId,
    status: isAnnouncementExecutionLockStatus(row.status) ? row.status : "failed",
    lockedBy: row.lockedBy,
    lockedAt: row.lockedAt.toISOString(),
    expiresAt: row.expiresAt.toISOString(),
    releasedAt: row.releasedAt ? row.releasedAt.toISOString() : null,
    releaseReason: row.releaseReason,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

async function acquireAnnouncementExecutionLock(plan: AnnouncementChangePlanRecord, executionId: number | null = null): Promise<AnnouncementExecutionLockRecord | { error: string; status: number; code: string }> {
  const { bgpAnnouncementExecutionLocksTable, db } = await loadBgpAnnouncementTables();
  const now = new Date();
  const existing = await loadLatestExecutionLockForPlan(plan);
  if (existing && existing.status === "active" && new Date(existing.expiresAt).getTime() > now.getTime()) {
    return { error: "Lock already active", status: 409, code: "EXECUTION_LOCK_ACTIVE" };
  }
  if (existing && existing.status === "active" && new Date(existing.expiresAt).getTime() <= now.getTime()) {
    await db
      .update(bgpAnnouncementExecutionLocksTable)
      .set({ status: "expired", updatedAt: now })
      .where(eq(bgpAnnouncementExecutionLocksTable.id, existing.id));
  }

  const [inserted] = await db
    .insert(bgpAnnouncementExecutionLocksTable)
    .values({
      deviceId: plan.deviceId,
      targetPolicyName: plan.targetPolicyName,
      node: plan.node,
      upstreamCircuitId: plan.upstreamCircuitId,
      changePlanId: plan.id,
      executionId,
      status: "active",
      lockedBy: getRequestContext()?.user?.id ?? null,
      lockedAt: now,
      expiresAt: new Date(now.getTime() + 30 * 60 * 1000),
      releasedAt: null,
      releaseReason: null,
      createdAt: now,
      updatedAt: now,
    })
    .returning();

  if (!inserted) {
    return { error: "Failed to acquire lock", status: 500, code: "EXECUTION_LOCK_ACQUIRE_FAILED" };
  }

  const record: AnnouncementExecutionLockRecord = {
    id: inserted.id,
    deviceId: inserted.deviceId,
    targetPolicyName: inserted.targetPolicyName,
    node: inserted.node,
    upstreamCircuitId: inserted.upstreamCircuitId,
    changePlanId: inserted.changePlanId,
    executionId: inserted.executionId,
    status: isAnnouncementExecutionLockStatus(inserted.status) ? inserted.status : "active",
    lockedBy: inserted.lockedBy,
    lockedAt: inserted.lockedAt.toISOString(),
    expiresAt: inserted.expiresAt.toISOString(),
    releasedAt: inserted.releasedAt ? inserted.releasedAt.toISOString() : null,
    releaseReason: inserted.releaseReason,
    createdAt: inserted.createdAt.toISOString(),
    updatedAt: inserted.updatedAt.toISOString(),
  };

  await recordAnnouncementAuditEvent({
    action: "EXECUTION_LOCK_ACQUIRED",
    changePlan: plan,
    executionId,
    summary: `Lock acquired for ${plan.targetPolicyName} / ${plan.upstreamCircuitId}`,
  });

  return record;
}

async function releaseAnnouncementExecutionLock(lockId: number, input: { plan: AnnouncementChangePlanRecord; executionId?: number | null; status: Exclude<AnnouncementExecutionLockRecord["status"], "active">; reason: string }): Promise<void> {
  const { bgpAnnouncementExecutionLocksTable, db } = await loadBgpAnnouncementTables();
  const now = new Date();
  const updated = await db
    .update(bgpAnnouncementExecutionLocksTable)
    .set({
      status: input.status,
      executionId: input.executionId ?? null,
      releasedAt: now,
      releaseReason: input.reason,
      updatedAt: now,
    })
    .where(eq(bgpAnnouncementExecutionLocksTable.id, lockId))
    .returning();
  if (!updated.length) {
    throw new Error("EXECUTION_LOCK_RELEASE_FAILED");
  }
  await recordAnnouncementAuditEvent({
    action: "EXECUTION_LOCK_RELEASED",
    changePlan: input.plan,
    executionId: input.executionId ?? null,
    summary: `${input.reason} for ${input.plan.targetPolicyName} / ${input.plan.upstreamCircuitId}`,
  });
}

export async function runAnnouncementChangePlanPostcheck(changePlanId: number): Promise<AnnouncementPostcheckRecord | { error: string; status: number; code?: string }> {
  const plan = await loadPlanWithRelations(changePlanId);
  if (!plan) {
    return { error: "Change-plan not found", status: 404, code: "CHANGE_PLAN_NOT_FOUND" };
  }
  if (!["approved", "dry_run_succeeded"].includes(plan.status)) {
    return { error: "Change-plan status invalid for postcheck", status: 409, code: "CHANGE_PLAN_INVALID_STATUS" };
  }
  const { refreshAnnouncementMatrixForDevice } = await import("./bgp-announcements.service.js");
  const { loadLatestMatrixSnapshot } = await import("./bgp-announcements.snapshot.service.js");
  const tables = await loadBgpAnnouncementTables();
  const { bgpAnnouncementChangePlansTable, bgpAnnouncementPostchecksTable, db } = tables;
  const startedAt = new Date();
  const [postcheckRow] = await db
    .insert(bgpAnnouncementPostchecksTable)
    .values({
      changePlanId: plan.id,
      executionId: plan.latestExecution?.id ?? null,
      deviceId: plan.deviceId,
      expectedSnapshotId: plan.baseSnapshotId,
      observedSnapshotId: null,
      expectedState: plan.desiredState,
      observedState: "pending",
      expectedCommunity: plan.desiredCommunity,
      observedCommunity: null,
      status: "running",
      diffJson: {},
      findingsJson: [],
      startedAt,
      finishedAt: null,
      createdAt: startedAt,
      updatedAt: startedAt,
    })
    .returning();

  if (!postcheckRow) {
    return { error: "Failed to start postcheck", status: 500, code: "POSTCHECK_FAILED" };
  }

  await recordAnnouncementAuditEvent({
    action: "POSTCHECK_STARTED",
    changePlan: plan,
    executionId: plan.latestExecution?.id ?? null,
    summary: `Postcheck started for ${plan.targetPolicyName} / ${plan.upstreamCircuitId}`,
  });

  try {
    const refreshResult = await refreshAnnouncementMatrixForDevice({
      deviceId: plan.deviceId,
      requestedBy: getRequestContext()?.user?.id ?? null,
      triggerType: "manual",
    });
    if ("error" in refreshResult) {
      const failedRow = await db
        .update(bgpAnnouncementPostchecksTable)
        .set({
          observedState: "pending",
          status: "inconclusive",
          diffJson: { error: refreshResult.error, refreshStatus: refreshResult.status },
          findingsJson: [{
            code: "POSTCHECK_INCONCLUSIVE",
            severity: "warning",
            scope: "snapshot",
            message: refreshResult.error,
          }],
          finishedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(bgpAnnouncementPostchecksTable.id, postcheckRow.id))
        .returning();
      await db.update(bgpAnnouncementChangePlansTable).set({
        postcheckStatus: "inconclusive",
        updatedAt: new Date(),
      }).where(eq(bgpAnnouncementChangePlansTable.id, plan.id));
      await recordAnnouncementAuditEvent({
        action: "POSTCHECK_INCONCLUSIVE",
        changePlan: plan,
        executionId: plan.latestExecution?.id ?? null,
        summary: `Postcheck inconclusive for ${plan.targetPolicyName} / ${plan.upstreamCircuitId}`,
      });
      return serializeAnnouncementPostcheck(failedRow[0] ?? postcheckRow);
    }

    const latestSnapshot = await loadLatestMatrixSnapshot(plan.deviceId);
    const latestMatrix = latestSnapshot?.matrixJson ?? null;
    const latestRows = latestMatrix?.rows as AnnouncementMatrixPayload["rows"] | undefined;
    const observedMatrix = latestRows ? ({
      rows: latestRows.map((row) => ({
        targetPolicyName: row.targetPolicyName,
        routePolicyName: row.routePolicyName,
        targetType: row.targetType,
        family: row.family,
        prefixScope: row.prefixScope,
        affectedPrefixes: row.affectedPrefixes,
        cells: Object.fromEntries(Object.entries(row.cells as Record<string, {
          state: string;
          label?: string | null;
          community?: string | null;
          findings?: AnnouncementFinding[];
        }>).map(([key, cell]) => [key, {
          state: cell.state,
          label: cell.label ?? null,
          community: cell.community ?? null,
          findings: cell.findings ?? [],
        }])),
        findings: row.findings ?? [],
        risk: row.risk,
      })),
      upstreamAudit: latestMatrix?.upstreamAudit ?? null,
    } as unknown as Pick<AnnouncementMatrixPayload, "rows" | "upstreamAudit">) : null;
    const postcheck = buildAnnouncementPostcheckComparison({
      changePlan: plan,
      observedSnapshotId: latestSnapshot?.id ?? refreshResult.snapshot_id ?? null,
      observedMatrix,
    });

    const [updated] = await db
      .update(bgpAnnouncementPostchecksTable)
      .set({
        observedSnapshotId: latestSnapshot?.id ?? refreshResult.snapshot_id ?? null,
        observedState: postcheck.observedState,
        observedCommunity: postcheck.observedCommunity,
        status: postcheck.status,
        diffJson: postcheck.diff,
        findingsJson: postcheck.findings,
        finishedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(bgpAnnouncementPostchecksTable.id, postcheckRow.id))
      .returning();

    await db
      .update(bgpAnnouncementChangePlansTable)
      .set({
        postcheckStatus: postcheck.status,
        updatedAt: new Date(),
      })
      .where(eq(bgpAnnouncementChangePlansTable.id, plan.id));

    await recordAnnouncementAuditEvent({
      action: postcheck.status === "succeeded" ? "POSTCHECK_SUCCEEDED" : "POSTCHECK_FAILED",
      changePlan: plan,
      executionId: plan.latestExecution?.id ?? null,
      summary: `Postcheck ${postcheck.status} for ${plan.targetPolicyName} / ${plan.upstreamCircuitId}`,
    });
    return serializeAnnouncementPostcheck(updated ?? postcheckRow);
  } catch (error) {
    const [updated] = await db
      .update(bgpAnnouncementPostchecksTable)
      .set({
        status: "inconclusive",
        findingsJson: [{
          code: "POSTCHECK_INCONCLUSIVE",
          severity: "warning",
          scope: "snapshot",
          message: error instanceof Error ? error.message : "Postcheck failure",
        }],
        finishedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(bgpAnnouncementPostchecksTable.id, postcheckRow.id))
      .returning();
    await db
      .update(bgpAnnouncementChangePlansTable)
      .set({
        postcheckStatus: "inconclusive",
        updatedAt: new Date(),
      })
      .where(eq(bgpAnnouncementChangePlansTable.id, plan.id));
    await recordAnnouncementAuditEvent({
      action: "POSTCHECK_INCONCLUSIVE",
      changePlan: plan,
      executionId: plan.latestExecution?.id ?? null,
      summary: `Postcheck inconclusive for ${plan.targetPolicyName} / ${plan.upstreamCircuitId}`,
    });
    return serializeAnnouncementPostcheck(updated ?? postcheckRow);
  }
}

export async function executeAnnouncementChangePlanControlled(changePlanId: number): Promise<AnnouncementExecutionRecord | { blocked: true; reason: string; featureFlag: string } | { error: string; status: number; code?: string }> {
  const plan = await loadPlanWithRelations(changePlanId);
  if (!plan) {
    return { error: "Change-plan not found", status: 404, code: "CHANGE_PLAN_NOT_FOUND" };
  }

  if (!env.bgpAnnouncementExecutionEnabled) {
    return blockAnnouncementChangePlanExecution(changePlanId);
  }

  const { loadLatestMatrixSnapshot } = await import("./bgp-announcements.snapshot.service.js");
  const latestSnapshot = await loadLatestMatrixSnapshot(plan.deviceId);
  const latestSnapshotId = await loadLatestSnapshotId(plan.deviceId);
  const refreshInProgress = await hasRefreshInProgress(plan.deviceId);
  const activeConflict = await hasActiveConflict(plan);
  const targetModifiable = plan.targetType === "origin_target" || plan.targetType === "customer_import_target";
  const dryRunSucceeded = plan.status === "dry_run_succeeded" && plan.latestExecution?.mode === "dry_run" && plan.latestExecution?.status === "succeeded";
  const permissionGranted = Boolean(getRequestContext()?.user);
  const latestRow = latestSnapshot?.matrixJson.rows.find((row) =>
    (row.targetPolicyName ?? row.routePolicyName ?? "").toLowerCase() === plan.targetPolicyName.toLowerCase()
    && row.targetType === plan.targetType,
  ) ?? null;
  const latestCell = latestRow?.cells?.[plan.upstreamCircuitId] ?? null;
  const targetChanged = !latestRow || !latestCell
    ? true
    : ((latestCell.label ?? latestCell.state ?? "—") !== plan.currentState || (latestCell.community ?? null) !== (plan.currentCommunity ?? null));
  const guard = buildAnnouncementRealExecutionGuardFindings({
    executionEnabled: env.bgpAnnouncementExecutionEnabled,
    approvalApproved: plan.approval?.status === "approved",
    dryRunSucceeded,
    postcheckRequired: plan.postcheckRequired ?? true,
    lockAcquired: true,
    lockConflict: false,
    baseSnapshotFound: latestSnapshotId !== null,
    baseSnapshotLatest: latestSnapshotId === plan.baseSnapshotId,
    targetModifiable,
    targetType: plan.targetType,
    riskLevel: plan.riskLevel,
    refreshInProgress: refreshInProgress || activeConflict,
    permissionGranted,
    provider: isAnnouncementRealExecutionProvider(env.bgpAnnouncementRealExecutionProvider)
      ? env.bgpAnnouncementRealExecutionProvider
      : "disabled",
    maintenanceWindowAllowed: !env.bgpAnnouncementRequireMaintenanceWindow,
    targetChanged,
    snapshotChanged: latestSnapshotId !== plan.baseSnapshotId,
  });

  if (guard.blocked) {
    await recordAnnouncementAuditEvent({
      action: "REAL_EXECUTION_BLOCKED",
      changePlan: plan,
      summary: `Real execution blocked for ${plan.targetPolicyName} / ${plan.upstreamCircuitId}`,
    });
    return {
      blocked: true,
      reason: guard.findings[0]?.message ?? "Real execution blocked",
      featureFlag: "BGP_ANNOUNCEMENT_EXECUTION_ENABLED",
    } as const;
  }

  const lock = await acquireAnnouncementExecutionLock(plan);
  if ("error" in lock) {
    await recordAnnouncementAuditEvent({
      action: "REAL_EXECUTION_BLOCKED",
      changePlan: plan,
      summary: `Real execution blocked: ${lock.code}`,
    });
    return {
      error: lock.error,
      status: lock.status,
      code: lock.code,
    };
  }

  const executionTables = await loadBgpAnnouncementTables();
  const { bgpAnnouncementChangePlansTable, bgpAnnouncementExecutionsTable, db } = executionTables;
  const executionProvider = env.bgpAnnouncementRealExecutionProvider;
  const startedAt = new Date();
  try {
    const [executionRow] = await db
      .insert(bgpAnnouncementExecutionsTable)
      .values({
        changePlanId: plan.id,
        approvalId: plan.approval?.id ?? null,
        deviceId: plan.deviceId,
        mode: executionProvider === "disabled" ? "real_blocked" : "mock",
        status: "running",
        startedBy: getRequestContext()?.user?.id ?? null,
        startedAt,
        finishedAt: null,
        baseSnapshotId: plan.baseSnapshotId,
        collectionId: plan.collectionId,
        proposedCommandsJson: plan.proposedCommands,
        rollbackCommandsJson: plan.rollbackCommands,
        executionLogJson: [],
        resultJson: { status: "running", provider: executionProvider },
        errorMessage: null,
        createdAt: startedAt,
        updatedAt: startedAt,
      })
      .returning();

    if (!executionRow) {
      throw new Error("Failed to create execution row");
    }

    await recordAnnouncementAuditEvent({
      action: "REAL_EXECUTION_STARTED",
      changePlan: plan,
      executionId: executionRow.id,
      summary: `Real execution started for ${plan.targetPolicyName} / ${plan.upstreamCircuitId}`,
    });

    const log = buildAnnouncementDryRunExecutionLog({
      proposedCommands: plan.proposedCommands,
      rollbackCommands: plan.rollbackCommands,
    });
    const finishedAt = new Date();
    const [updatedExecution] = await db
      .update(bgpAnnouncementExecutionsTable)
      .set({
        status: "succeeded",
        mode: executionProvider === "disabled" ? "real_blocked" : "mock",
        startedAt,
        finishedAt,
        executionLogJson: log,
        resultJson: {
          status: "succeeded",
          provider: executionProvider,
          simulated: executionProvider !== "disabled",
          postcheckRequired: true,
        },
        updatedAt: finishedAt,
      })
      .where(eq(bgpAnnouncementExecutionsTable.id, executionRow.id))
      .returning();

    await db
      .update(bgpAnnouncementChangePlansTable)
      .set({
        postcheckRequired: true,
        postcheckStatus: "pending",
        updatedAt: new Date(),
      })
      .where(eq(bgpAnnouncementChangePlansTable.id, plan.id));

    await releaseAnnouncementExecutionLock(lock.id, { plan, executionId: executionRow.id, status: "released", reason: "Execution completed" }).catch(() => null);

    const execution = serializeExecution(updatedExecution ?? executionRow);
    await recordAnnouncementAuditEvent({
      action: "REAL_EXECUTION_SUCCEEDED",
      changePlan: plan,
      executionId: execution.id,
      summary: `Real execution succeeded for ${plan.targetPolicyName} / ${plan.upstreamCircuitId}`,
    });
    return execution;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Real execution failed";
    await releaseAnnouncementExecutionLock(lock.id, { plan, status: "failed", reason: errorMessage }).catch(() => null);
    await recordAnnouncementAuditEvent({
      action: "REAL_EXECUTION_FAILED",
      changePlan: plan,
      summary: `Real execution failed for ${plan.targetPolicyName} / ${plan.upstreamCircuitId}: ${errorMessage}`,
    });
    return { error: errorMessage, status: 500, code: "EXECUTION_FAILED" };
  }
}

export function encodeAnnouncementApprovalId(payload: Record<string, unknown>): string {
  return `bgp-approval-v1.${Buffer.from(JSON.stringify(payload), "utf8").toString("base64url")}`;
}

export function decodeAnnouncementApprovalId(value: string): Record<string, unknown> | null {
  const [prefix, encoded] = value.split(".", 2);
  if (prefix !== "bgp-approval-v1" || !encoded) return null;
  try {
    return JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as Record<string, unknown>;
  } catch {
    return null;
  }
}
