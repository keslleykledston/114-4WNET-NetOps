export type ChangePlanModule =
  | "bgp_cleanup"
  | "bgp_announcements"
  | "provisioning"
  | "l2vpn"
  | "vrf"
  | "interface"
  | "compliance_baseline"
  | "template";

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
  steps: Array<{
    order: number;
    action: string;
    target: string;
    note?: string;
  }>;
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

import type { ProposedCommandSet } from "../bgp-announcements/bgp-announcement.types.js";

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
  proposedCommands?: ProposedCommandSet[];
  proposedCommandsWarnings?: string[];
  suggestedRollback: ChangePlanRollbackDocument;
  validations: {
    before: string[];
    after: string[];
  };
  findings: string[];
  impact: {
    recommendation: string;
    riskLevel: string;
    blockedReasons: string[];
    warnings: string[];
  };
  sourceModule: ChangePlanModule;
  sourceAnalysisId?: number | null;
}

export interface ChangePlanCreateInput {
  module: ChangePlanModule;
  changeType: string;
  deviceId: number;
  hostname?: string | null;
  createdBy?: string | null;
  ticketRef?: string | null;
  sourceObjectType?: string | null;
  sourceObjectId?: string | null;
  metadata?: Record<string, unknown>;
  snapshot: ChangePlanSnapshotPayload;
  items: ChangePlanItemRecord[];
  beforeState: Record<string, unknown[]>;
  afterState: Record<string, unknown[]>;
  rollback: ChangePlanRollbackDocument;
  /** Force persisted status (e.g. draft for BGP preview plans). */
  statusOverride?: ChangePlanStatus;
}

export type BgpAnnouncementWorkflowStatus = ChangePlanWorkflowStatus;

export interface ChangePlanReviewEvent {
  id: number;
  changePlanId: number;
  actor: string | null;
  actorUserId: number | null;
  previousStatus: ChangePlanWorkflowStatus;
  nextStatus: ChangePlanWorkflowStatus;
  note: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
}

export interface BgpPreviewChangePlanLinkSummary {
  changePlanId: number;
  previewId: number;
  deviceId: number;
  snapshotId: number | null;
  targetId: string;
  title: string;
  description: string;
  status: ChangePlanStatus;
  workflowStatus: BgpAnnouncementWorkflowStatus;
  riskLevel: string;
  ticketMarkdown: string;
  logicalDiff: string[];
  proposedCommands?: ProposedCommandSet[];
  proposedCommandsWarnings?: string[];
  warnings: string[];
  createdAt: string;
  createdBy: string | null;
}

export interface ChangePlanSummary {
  id: number;
  module: ChangePlanModule;
  changeType: string;
  deviceId: number;
  hostname: string | null;
  status: ChangePlanStatus;
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
  workflowStatus?: ChangePlanWorkflowStatus | null;
  ticketMarkdown?: string | null;
  logicalDiff?: string[];
  reviewedBy?: string | null;
  reviewedAt?: string | null;
}

export interface ChangePlanDetail extends ChangePlanSummary {
  snapshot: ChangePlanSnapshotPayload;
  items: ChangePlanItemRecord[];
  diff: ChangeDiffResult;
  rollback: ChangePlanRollbackDocument;
  beforeState: Record<string, unknown[]>;
  afterState: Record<string, unknown[]>;
  reviewHistory?: ChangePlanReviewEvent[];
}

export interface ChangePlanExportResponse {
  changePlanId: number;
  format: "markdown" | "json";
  content: string;
  exportedAt: string;
  status: ChangePlanStatus;
}

export interface ChangePlanListQuery {
  module?: ChangePlanModule;
  deviceId?: number;
  peerIp?: string;
  status?: ChangePlanStatus;
  workflowStatus?: ChangePlanWorkflowStatus;
  sourceObjectType?: string;
  sourceObjectId?: string;
  limit?: number;
  offset?: number;
}
