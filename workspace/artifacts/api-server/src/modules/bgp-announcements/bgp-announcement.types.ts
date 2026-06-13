/** Core types for BGP Announcement Matrix module. */

export type AnnouncementFamily = "ipv4" | "ipv6";

export type PolicyClass =
  | "origin_target"
  | "customer_import_target"
  | "customer_export"
  | "upstream_export_audit"
  | "upstream_import_audit"
  | "internal_mesh"
  | "unknown";

export type CellState =
  | "on"
  | "p1"
  | "p2"
  | "p3"
  | "p4"
  | "off"
  | "bh"
  | "no_export"
  | "default"
  | "none"
  | "unknown"
  | "conflict";

export type CellStateLabel = "On" | "P1" | "P2" | "P3" | "P4" | "Off" | "BH" | "NE" | "Def" | "—" | "?" | "!";

export type TargetType = "origin" | "customer" | "unknown";

export type TargetRole =
  | "customer"
  | "origin"
  | "provider"
  | "upstream"
  | "ix"
  | "cdn"
  | "ibgp"
  | "unknown";

export type TargetEditMode =
  | "editable_future"
  | "audit_only"
  | "hidden"
  | "unknown";

export type DependencyScope =
  | "circuit_specific"
  | "customer_specific"
  | "global_shared"
  | "system"
  | "unknown";

export type DependencyProtection =
  | "removable_candidate"
  | "protected_global"
  | "protected_system"
  | "shared_requires_review"
  | "unknown";

export type RiskLevel = "low" | "medium" | "high" | "critical";

export type FindingSeverity = "critical" | "high" | "medium" | "low" | "info";

export interface AnnouncementFinding {
  code: string;
  severity: FindingSeverity;
  message: string;
  context?: Record<string, unknown>;
}

export interface ParsedCircuitPolicy {
  circuitId: string;
  function: "IMPORT" | "EXPORT";
  family: AnnouncementFamily | null;
  asn: number | null;
  name: string | null;
  rawName: string;
  format: "simple" | "full" | "variant";
}

export interface ParsedCircuitCommunity {
  raw: string;
  baseAsn: number;
  namespace: string;
  circuitId: string;
  actionCode: string;
  valid: boolean;
}

export interface BgpNetworkStatement {
  prefix: string;
  family: AnnouncementFamily;
  routePolicyName: string;
  raw: string;
}

export interface PolicyClassification {
  name: string;
  policyClass: PolicyClass;
  modifiable: boolean;
  auditOnly: boolean;
  circuit: ParsedCircuitPolicy | null;
}

export interface MatrixCell {
  circuitId: string;
  upstreamName: string;
  state: CellState;
  label: CellStateLabel;
  community: string | null;
  actionCode: string | null;
  prependCount: number | null;
  confidence: "high" | "medium" | "low";
}

export interface MatrixRow {
  targetKey: string;
  targetType: TargetType;
  routePolicyName: string;
  node: number;
  family: AnnouncementFamily;
  prefixScope: string;
  affectedPrefixes: string[];
  prefixListName: string | null;
  modifiable: boolean;
  riskLevel: RiskLevel;
  cells: MatrixCell[];
  findings: AnnouncementFinding[];
  lastCollectedAt: string | null;
  collectionAgeMinutes: number | null;
  targetRole?: TargetRole;
  targetEditMode?: TargetEditMode;
  dependencyScope?: DependencyScope;
  dependencyProtection?: DependencyProtection;
  dependencyReason?: string;
}

export interface ProtectedGlobalDependency {
  objectName: string;
  objectKind: string;
  dependencyScope: DependencyScope;
  dependencyProtection: DependencyProtection;
  reason: string;
  consumerCount: number;
  consumers: string[];
}

export interface MatrixConflictItem {
  targetKey: string;
  routePolicyName: string;
  node: number;
  family: AnnouncementFamily;
  targetRole: TargetRole;
  circuitIds: string[];
  message: string;
}

export interface MatrixSemanticWarnings {
  operational: string[];
  insufficientData: string[];
  sharedDependency: string[];
  protectedGlobalNotices: string[];
}

export interface MatrixSemanticView {
  countersByTargetRole: Record<TargetRole, number>;
  countersByDependencyScope: Record<DependencyScope, number>;
  protectedGlobals: ProtectedGlobalDependency[];
  realConflicts: MatrixConflictItem[];
  warnings: MatrixSemanticWarnings;
  editableRowCount: number;
  auditOnlyRowCount: number;
}

export interface MatrixResponse {
  deviceId: number;
  upstreams: Array<{ circuitId: string; displayName: string; role: string }>;
  rows: MatrixRow[];
  findings: AnnouncementFinding[];
  generatedAt: string;
  semanticView?: MatrixSemanticView;
  meta?: {
    source: string;
    dataSource?: string;
    collectionAgeMinutes: number | null;
    lastCollectedAt: string | null;
    readOnly: boolean;
    refreshMode?: "database_only";
    snapshotId?: number;
    snapshotCreatedAt?: string;
    counters?: SnapshotCounters;
    warnings?: string[];
    status?: SnapshotRefreshStatus;
  };
}

export type SnapshotRefreshStatus = "ok" | "partial" | "empty";

export interface SnapshotCounters {
  originTargets: number;
  customerTargets: number;
  upstreamCount: number;
  communitySetCount: number;
  policyCount: number;
  conflictCount: number;
  rowCount: number;
}

export interface SnapshotRefreshResult {
  snapshotId: number;
  deviceId: number;
  createdAt: string;
  counters: SnapshotCounters;
  warnings: string[];
  status: SnapshotRefreshStatus;
}

export interface SnapshotSummary {
  id: number;
  deviceId: number;
  createdAt: string;
  rowCount: number;
  counters: SnapshotCounters;
  conflictCount: number;
  status: SnapshotRefreshStatus;
  warnings: string[];
}

export interface PreviewChangeRequest {
  deviceId: number;
  targetPolicyName: string;
  node: number;
  family: AnnouncementFamily;
  upstreamCircuitId: string;
  newState: Exclude<CellState, "unknown" | "conflict">;
}

export interface PreviewChangeResponse {
  allowed: boolean;
  blockedReasons: string[];
  targetPolicyName: string;
  node: number;
  affectedPrefixes: string[];
  oldState: CellStateLabel;
  newState: CellStateLabel;
  oldCommunities: string[];
  newCommunities: string[];
  communitySetMatchName: string | null;
  usesCommunityList: boolean;
  generatedScript: string;
  rollbackScript: string;
  diff: string[];
  riskLevel: RiskLevel;
  findings: AnnouncementFinding[];
}

export const CELL_STATE_TO_LABEL: Record<CellState, CellStateLabel> = {
  on: "On",
  p1: "P1",
  p2: "P2",
  p3: "P3",
  p4: "P4",
  off: "Off",
  bh: "BH",
  no_export: "NE",
  default: "Def",
  none: "—",
  unknown: "?",
  conflict: "!",
};

export const STATE_TO_ACTION_CODE: Record<string, string> = {
  on: "01",
  p1: "02",
  p2: "03",
  p3: "04",
  p4: "05",
  no_export: "08",
  default: "09",
  bh: "66",
  off: "67",
};

export const ACTION_CODE_TO_STATE: Record<string, CellState> = {
  "00": "unknown",
  "01": "on",
  "02": "p1",
  "03": "p2",
  "04": "p3",
  "05": "p4",
  "08": "no_export",
  "09": "default",
  "66": "bh",
  "67": "off",
};
