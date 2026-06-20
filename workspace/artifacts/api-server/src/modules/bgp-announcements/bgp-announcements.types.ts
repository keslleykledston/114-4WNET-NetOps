export type AnnouncementSnapshotStatus = "pending" | "completed" | "failed" | "superseded";
export type AnnouncementSnapshotSource = "foundation" | "discovery_snapshot" | "policy_graph" | "policy_graph_community_resolver";
export type AnnouncementFamilyScope = "all" | "ipv4" | "ipv6" | "mixed";
export type AnnouncementMatrixFeatureStatus = "foundation" | "target_classification" | "community_cells" | "partial" | "complete";
export type AnnouncementFindingSeverity = "info" | "warning" | "error";
export type AnnouncementFindingScope =
  | "target"
  | "cell"
  | "upstream"
  | "community_set"
  | "prefix_scope"
  | "protected_global_filter"
  | "snapshot";

export interface AnnouncementFinding {
  code: string;
  severity: AnnouncementFindingSeverity;
  scope: AnnouncementFindingScope;
  targetPolicyName?: string | null;
  node?: number | null;
  upstreamCircuitId?: string | null;
  upstreamName?: string | null;
  community?: string | null;
  communityFilter?: string | null;
  communityList?: string | null;
  prefixList?: string | null;
  message: string;
  evidence?: unknown;
  recommendation?: string | null;
}

export type AnnouncementMatrixTargetType =
  | "origin_target"
  | "customer_import_target"
  | "customer_export"
  | "upstream_export_audit"
  | "upstream_import_audit"
  | "internal_mesh"
  | "unknown";

export interface AnnouncementMatrixCell {
  circuitId: string;
  upstreamName: string;
  state: string;
  label?: string;
  communities?: string[];
  community: string | null;
  actionCode: string | null;
  communitySourceType?: "direct" | "community_list" | "unknown";
  communitySourceName?: string | null;
  note?: string | null;
  findings?: AnnouncementFinding[];
}

export interface AnnouncementMatrixColumn {
  key: string;
  label: string;
  upstreamCircuitId: string;
  upstreamName: string;
  role?: string | null;
  source?: AnnouncementSnapshotSource;
}

export interface AnnouncementExpandedPrefix {
  index: number | null;
  action: string | null;
  prefix: string;
  ge?: number | null;
  le?: number | null;
  raw: string;
}

export interface AnnouncementMatrixPrefixScope {
  type: "network" | "ip_prefix" | "ipv6_prefix" | "unknown";
  name: string;
  expandedPrefixes: AnnouncementExpandedPrefix[];
  affectedPrefixCount: number;
  shared: boolean | null;
}

export interface AnnouncementMatrixRow {
  targetPolicyName: string;
  routePolicyName: string;
  targetType: string;
  family: string;
  prefixScope: AnnouncementMatrixPrefixScope;
  affectedPrefixes: string[];
  source?: AnnouncementSnapshotSource;
  confidence?: "high" | "medium" | "low";
  matrixState?: Record<string, unknown>;
  findings?: AnnouncementFinding[];
  riskLevel?: string;
  cells: Record<string, AnnouncementMatrixCell>;
  risk: string;
  node?: number | null;
}

export interface AnnouncementMatrixPayload {
  columns: AnnouncementMatrixColumn[];
  rows: AnnouncementMatrixRow[];
  generatedFrom: AnnouncementSnapshotSource;
  featureStatus: AnnouncementMatrixFeatureStatus;
  upstreamAudit?: AnnouncementUpstreamAuditPayload;
}

export interface AnnouncementCommunitySet {
  name: string;
  communities: string[];
  normalizedCommunities: string[];
  normalizedHash: string;
  semanticSummary: string;
  usageCount: number;
  usedByPolicies: string[];
  isShared: boolean;
  findings: AnnouncementFinding[];
}

export interface AnnouncementCommunitySetExactMatch {
  matched: boolean;
  matchType: "exact" | "none";
  communityListName?: string | null;
  normalizedHash?: string | null;
  communities: string[];
  desiredCommunities?: string[];
  nearestMatches?: Array<{ name: string; normalizedHash: string; overlap: number }>;
}

export interface AnnouncementUpstreamAuditCircuit {
  circuitId: string;
  upstreamName: string;
  localAs: number | null;
  exportPolicy: string | null;
  findings: AnnouncementFinding[];
  maxSeverity: AnnouncementFindingSeverity | null;
  actions: Record<string, { actionLabel: string; actionCode: string | null; community: string | null; sourceType: string; sourceName: string | null } | null>;
}

export interface AnnouncementUpstreamAuditPayload {
  findings: AnnouncementFinding[];
  byCircuit: Record<string, AnnouncementUpstreamAuditCircuit>;
  totalUpstreamsAudited: number;
  totalAuditFindings: number;
  totalCriticalAuditFindings: number;
  localAsUnknownCount: number;
  prependMismatchCount: number;
}

export interface AnnouncementMatrixSummaryPayload {
  totalTargets: number;
  totalOriginTargets?: number;
  totalCustomerImportTargets?: number;
  totalExcludedCustomerExports?: number;
  totalExcludedUpstreamPolicies?: number;
  totalExcludedInternalPolicies?: number;
  totalUnknownPolicies?: number;
  totalOn?: number;
  totalP1?: number;
  totalP2?: number;
  totalP3?: number;
  totalP4?: number;
  totalOff?: number;
  totalUnmarked?: number;
  totalConflict?: number;
  totalUnknown?: number;
  totalExpandedPrefixes?: number;
  totalPrefixScopeUnknown?: number;
  totalUpstreams: number;
  totalCells: number;
  totalFindings: number;
  totalCriticalFindings: number;
  note: string;
  debugFindings?: AnnouncementFinding[];
  upstreamAudit?: {
    totalUpstreamsAudited: number;
    totalAuditFindings: number;
    totalCriticalAuditFindings: number;
    localAsUnknownCount: number;
    prependMismatchCount: number;
  };
}

export interface AnnouncementMatrixDiffSummary {
  added: number;
  removed: number;
  changed: number;
}

export interface AnnouncementMatrixDiffDetail {
  previousSnapshotId: number;
  currentSnapshotId: number;
  deviceId: number;
  diffHash: string;
  added: unknown[];
  removed: unknown[];
  changed: unknown[];
  summary: AnnouncementMatrixDiffSummary | null;
}

export interface AnnouncementHistoryEvent {
  id: number;
  deviceId: number;
  targetPolicyName: string;
  family: string;
  prefix: string | null;
  upstreamCircuitId: string | null;
  upstreamName: string | null;
  eventType: string;
  oldState: string | null;
  newState: string | null;
  oldCommunity: string | null;
  newCommunity: string | null;
  snapshotId: number;
  detectedAt: string;
  createdAt: string;
}

export interface AnnouncementMatrixLatestResponse {
  empty?: boolean;
  message?: string;
  can_refresh?: boolean;
  snapshot_id?: number;
  generated_at?: string;
  collection_id?: number | null;
  is_stale?: boolean;
  matrix?: AnnouncementMatrixPayload;
  summary?: AnnouncementMatrixSummaryPayload;
  diff_summary?: AnnouncementMatrixDiffSummary | null;
  run_id?: number | null;
  status?: AnnouncementSnapshotStatus;
}

export interface AnnouncementMatrixRefreshResponse {
  run_id: number;
  snapshot_id: number;
  generated_at: string;
  collection_id: number | null;
  matrix: AnnouncementMatrixPayload;
  summary: AnnouncementMatrixSummaryPayload;
  diff_summary: AnnouncementMatrixDiffSummary | null;
}

export type AnnouncementPreviewDesiredState = "On" | "P1" | "P2" | "P3" | "P4" | "Off" | "NE" | "BH" | "Def" | "Clear";

export interface AnnouncementPreviewInput {
  baseSnapshotId: number;
  deviceId: number;
  targetPolicyName: string;
  node: number;
  upstreamCircuitId: string;
  desiredState: AnnouncementPreviewDesiredState;
  requestedBy?: number | null;
  note?: string | null;
}

export interface AnnouncementPreviewDiff {
  removedCommunities: string[];
  addedCommunities: string[];
  preservedCommunities: string[];
  oldState: string;
  newState: string;
}

export interface AnnouncementPreviewCommand {
  command: string;
  confidence: "high" | "medium" | "low";
  note?: string | null;
}

export interface AnnouncementPreviewResult {
  previewId: string;
  baseSnapshotId: number;
  deviceId: number;
  collectionId: number | null;
  targetPolicyName: string;
  targetType: AnnouncementMatrixTargetType;
  node: number;
  upstreamCircuitId: string;
  upstreamName: string;
  prefixScope: AnnouncementMatrixPrefixScope;
  currentState: string;
  desiredState: AnnouncementPreviewDesiredState;
  currentCommunity: string | null;
  desiredCommunity: string | null;
  currentCommunitySourceType: "direct" | "community_list" | "unknown";
  currentCommunitySourceName: string | null;
  currentCommunities: string[];
  desiredCommunities: string[];
  communitySetMatch: AnnouncementCommunitySetExactMatch;
  diff: AnnouncementPreviewDiff;
  proposedCommands: AnnouncementPreviewCommand[];
  rollbackCommands: AnnouncementPreviewCommand[];
  rollbackDiff: AnnouncementPreviewDiff;
  rollbackSource: number;
  riskLevel: "low" | "medium" | "high" | "critical";
  findings: AnnouncementFinding[];
  status: "preview_only";
  commandConfidence: "high" | "medium" | "low";
  note: string | null;
}

export type AnnouncementChangePlanStatus =
  | "draft"
  | "pending_approval"
  | "approved"
  | "rejected"
  | "cancelled"
  | "expired"
  | "dry_run_ready"
  | "dry_run_running"
  | "dry_run_succeeded"
  | "dry_run_failed"
  | "execution_blocked"
  | "superseded";
export type AnnouncementApprovalStatus = "pending" | "approved" | "rejected" | "cancelled";
export type AnnouncementExecutionMode = "dry_run" | "mock" | "real_blocked";
export type AnnouncementExecutionStatus = "queued" | "running" | "succeeded" | "failed" | "blocked" | "cancelled";
export type AnnouncementExecutionLockStatus = "active" | "released" | "expired" | "failed";
export type AnnouncementPostcheckStatus = "pending" | "running" | "succeeded" | "failed" | "inconclusive" | "skipped";
export type AnnouncementRealExecutionProvider = "disabled" | "dry_run" | "mock" | "connector_scaffold";
export type AnnouncementRollbackStatus =
  | "draft"
  | "pending_approval"
  | "approved"
  | "dry_run_running"
  | "dry_run_succeeded"
  | "dry_run_failed"
  | "real_blocked"
  | "real_running"
  | "real_succeeded"
  | "real_failed"
  | "postcheck_pending"
  | "postcheck_succeeded"
  | "postcheck_failed"
  | "postcheck_inconclusive"
  | "cancelled";
export type AnnouncementRollbackMode = "dry_run" | "mock" | "real_blocked" | "real";

export interface AnnouncementRollbackRecord {
  id: number;
  changePlanId: number;
  executionId: number | null;
  approvalId: number | null;
  deviceId: number;
  baseSnapshotId: number;
  rollbackToSnapshotId: number;
  currentSnapshotId: number | null;
  status: AnnouncementRollbackStatus;
  mode: AnnouncementRollbackMode;
  requestedBy: number | null;
  requestedAt: string;
  approvedBy: number | null;
  approvedAt: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  rollbackCommands: AnnouncementPreviewCommand[];
  rollbackDiff: AnnouncementPreviewDiff | Record<string, unknown>;
  rollbackLog: Array<{ step: number; type: string; command?: string; status: string; message?: string }>;
  postcheckId: number | null;
  errorMessage: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AnnouncementExecutionLockRecord {
  id: number;
  deviceId: number;
  targetPolicyName: string;
  node: number | null;
  upstreamCircuitId: string;
  changePlanId: number;
  executionId: number | null;
  status: AnnouncementExecutionLockStatus;
  lockedBy: number | null;
  lockedAt: string;
  expiresAt: string;
  releasedAt: string | null;
  releaseReason: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AnnouncementPostcheckRecord {
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
  status: AnnouncementPostcheckStatus;
  diff: Record<string, unknown>;
  findings: AnnouncementFinding[];
  startedAt: string;
  finishedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AnnouncementApprovalRecord {
  id: number;
  changePlanId: number;
  deviceId: number;
  baseSnapshotId: number;
  requestedBy: number | null;
  requestedAt: string;
  reviewedBy: number | null;
  reviewedAt: string | null;
  status: AnnouncementApprovalStatus;
  reason: string | null;
  riskLevel: "low" | "medium" | "high" | "critical";
  findings: AnnouncementFinding[];
  diff: AnnouncementPreviewDiff;
  proposedCommands: AnnouncementPreviewCommand[];
  rollbackCommands: AnnouncementPreviewCommand[];
  createdAt: string;
  updatedAt: string;
  changePlan?: AnnouncementChangePlanRecord | null;
}

export interface AnnouncementExecutionRecord {
  id: number;
  changePlanId: number;
  approvalId: number | null;
  deviceId: number;
  mode: AnnouncementExecutionMode;
  status: AnnouncementExecutionStatus;
  startedBy: number | null;
  startedAt: string;
  finishedAt: string | null;
  baseSnapshotId: number;
  collectionId: number | null;
  proposedCommands: AnnouncementPreviewCommand[];
  rollbackCommands: AnnouncementPreviewCommand[];
  executionLog: Array<{ step: number; type: string; command?: string; status: string; message?: string }>;
  result: Record<string, unknown>;
  errorMessage: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AnnouncementChangePlanRecord {
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
  diff: AnnouncementPreviewDiff;
  proposedCommands: AnnouncementPreviewCommand[];
  rollbackCommands: AnnouncementPreviewCommand[];
  findings: AnnouncementFinding[];
  riskLevel: "low" | "medium" | "high" | "critical";
  status: AnnouncementChangePlanStatus;
  note: string | null;
  preview: AnnouncementPreviewResult;
  createdBy: number | null;
  createdAt: string;
  updatedAt: string;
  postcheckRequired?: boolean;
  postcheckStatus?: string | null;
  latestPostcheck?: AnnouncementPostcheckRecord | null;
  approval?: AnnouncementApprovalRecord | null;
  executions?: AnnouncementExecutionRecord[];
  latestExecution?: AnnouncementExecutionRecord | null;
  latestRollback?: AnnouncementRollbackRecord | null;
  rollbacks?: AnnouncementRollbackRecord[];
}
