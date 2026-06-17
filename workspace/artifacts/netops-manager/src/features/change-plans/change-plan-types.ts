export type ChangePlanStatus = "draft" | "valid" | "invalid" | "exported" | "closed";

export type ChangePlanWorkflowStatus =
  | "draft"
  | "ready_for_review"
  | "needs_changes"
  | "rejected"
  | "approved_for_manual_implementation"
  | "archived";

export type ChangePlanClassification = "exclusive" | "shared" | "global" | "ambiguous";
export type ChangeDiffStatus = "ADDED" | "REMOVED" | "CHANGED" | "UNCHANGED";

export interface ChangePlanItemUser {
  peerIp?: string;
  state?: string;
  vrf?: string | null;
  afi?: string;
  safi?: string;
  label?: string;
}

export interface ChangePlanItemRecord {
  id?: number;
  itemType: string;
  itemName: string;
  classification: ChangePlanClassification;
  usageCount: number;
  willBeRemoved: boolean;
  reason?: string | null;
  users: ChangePlanItemUser[];
  metadata?: Record<string, unknown>;
}

export interface ChangePlanRollbackDocument {
  valid: boolean;
  script: string[];
  steps: Array<{ order: number; action: string; target: string; note?: string }>;
  dependencies: Array<{ type: string; name: string }>;
  warnings: string[];
}

export interface ChangeDiffItem {
  key: string;
  type: string;
  name: string;
  status: ChangeDiffStatus;
  before?: unknown;
  after?: unknown;
  details?: string;
}

export interface ChangeDiffResult {
  added: ChangeDiffItem[];
  removed: ChangeDiffItem[];
  changed: ChangeDiffItem[];
  unchanged: ChangeDiffItem[];
  summary: {
    added: number;
    removed: number;
    changed: number;
    unchanged: number;
  };
}

export interface ChangePlanReviewEvent {
  id: number;
  changePlanId: number;
  actor: string | null;
  previousStatus: ChangePlanWorkflowStatus;
  nextStatus: ChangePlanWorkflowStatus;
  note: string | null;
  createdAt: string;
}

export interface ChangePlanSnapshotPayload {
  deviceId: number;
  hostname: string | null;
  peerIp?: string | null;
  peerGroup?: string | null;
  vrf?: string | null;
  family?: string | null;
  timestamp: string;
  routePolicies: Array<{ name: string; direction?: string | null }>;
  prefixLists: Array<{ name: string }>;
  ipv6PrefixLists: Array<{ name: string }>;
  communityFilters: Array<{ name: string }>;
  communityLists: Array<{ name: string }>;
  asPathFilters: Array<{ name: string }>;
  extcommunityFilters: Array<{ name: string }>;
  globalPreserved: Array<{ type: string; name: string; reason?: string | null }>;
  suggestedScript: string[];
  proposedCommands?: Array<Record<string, unknown>>;
  proposedCommandsWarnings?: string[];
  suggestedRollback: ChangePlanRollbackDocument;
  validations: { before: string[]; after: string[] };
  findings: string[];
  impact: {
    recommendation: string;
    riskLevel: string;
    blockedReasons: string[];
    warnings: string[];
  };
  sourceModule: string;
  sourceAnalysisId?: number | null;
}

export interface ChangePlanSummary {
  id: number;
  module: string;
  changeType: string;
  deviceId: number;
  hostname: string | null;
  status: ChangePlanStatus;
  workflowStatus?: ChangePlanWorkflowStatus | null;
  createdBy: string | null;
  ticketRef: string | null;
  sourceObjectType: string | null;
  sourceObjectId: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
  peerIp?: string | null;
  recommendation?: string | null;
  riskLevel?: string | null;
  ticketMarkdown?: string | null;
  logicalDiff?: string[];
  proposedCommands?: Array<Record<string, unknown>>;
  proposedCommandsWarnings?: string[];
  reviewedBy?: string | null;
  reviewedAt?: string | null;
}

export interface ChangePlanDetail extends ChangePlanSummary {
  snapshot: ChangePlanSnapshotPayload;
  items: ChangePlanItemRecord[];
  diff: ChangeDiffResult;
  rollback: ChangePlanRollbackDocument;
  reviewHistory?: ChangePlanReviewEvent[];
}

export interface ChangePlanExportResponse {
  changePlanId: number;
  format: "markdown" | "json";
  content: string;
  exportedAt: string;
  status: ChangePlanStatus;
}

export type ReviewAction =
  | "submit-review"
  | "request-changes"
  | "reject"
  | "approve-manual"
  | "archive";
