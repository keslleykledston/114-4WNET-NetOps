export type CellStateLabel = "On" | "P1" | "P2" | "P3" | "P4" | "Off" | "BH" | "NE" | "Def" | "—" | "?" | "!";

export interface MatrixCell {
  circuitId: string;
  upstreamName: string;
  state: string;
  label: CellStateLabel;
  community: string | null;
  actionCode: string | null;
  prependCount: number | null;
  confidence: string;
}

export interface MatrixRow {
  targetKey: string;
  targetType: "origin" | "customer" | "unknown";
  routePolicyName: string;
  node: number;
  family: "ipv4" | "ipv6";
  prefixScope: string;
  affectedPrefixes: string[];
  prefixListName: string | null;
  modifiable: boolean;
  riskLevel: string;
  cells: MatrixCell[];
  findings: Array<{ code: string; severity: string; message: string }>;
  lastCollectedAt: string | null;
  collectionAgeMinutes: number | null;
  targetRole?: TargetRole;
  targetEditMode?: TargetEditMode;
  dependencyScope?: DependencyScope;
  dependencyProtection?: DependencyProtection;
  dependencyReason?: string;
}

export type TargetRole =
  | "customer"
  | "origin"
  | "provider"
  | "upstream"
  | "ix"
  | "cdn"
  | "ibgp"
  | "unknown";

export type TargetEditMode = "editable_future" | "audit_only" | "hidden" | "unknown";

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
  family: "ipv4" | "ipv6";
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
  findings: Array<{ code: string; severity: string; message: string }>;
  generatedAt: string;
  semanticView?: MatrixSemanticView;
  meta?: {
    source: string;
    dataSource?: string;
    collectionAgeMinutes: number | null;
    lastCollectedAt: string | null;
    readOnly: boolean;
    refreshMode?: string;
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

export interface TargetEvidence {
  deviceId: number;
  targetKey: string;
  routePolicyName: string;
  node: number;
  family: "ipv4" | "ipv6";
  upstreamCircuitId: string;
  upstreamName: string;
  prefix: string | null;
  prefixesAffected: string[];
  prefixListName: string | null;
  detectedState: string;
  community: string | null;
  actionCode: string | null;
  communitiesDirect: string[];
  communityListName: string | null;
  policyClass: string;
  modifiable: boolean;
  auditOnly: boolean;
  rawApplies: string[];
  source: string;
  lastCollectedAt: string | null;
  collectionAgeMinutes: number | null;
  confidence: string;
  findings: Array<{ code: string; severity: string; message: string }>;
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
  riskLevel: string;
  findings: Array<{ code: string; severity: string; message: string }>;
}

export interface ChangePlanRow {
  id: number;
  targetPolicyName: string;
  targetType: string;
  family: string;
  node: number;
  upstreamCircuitId: string;
  upstreamName: string | null;
  oldState: string | null;
  newState: string;
  riskLevel: string;
  status: string;
  generatedScript: string | null;
  rollbackScript: string | null;
  createdAt: string;
}

export interface UpstreamAuditReport {
  deviceId: number;
  localAs: number | null;
  upstreams: Array<{
    circuitId: string;
    displayName: string;
    exportPolicyName: string | null;
    localAs: number | null;
    family: string;
    findings: Array<{ code: string; severity: string; message: string }>;
    rules: Array<{
      actionCode: string;
      state: string;
      label: string;
      communityFilter: string | null;
      communityValue: string | null;
      asPathRule: string | null;
      status: string;
    }>;
  }>;
  findings: Array<{ code: string; severity: string; message: string }>;
  generatedAt: string;
}

export interface CommunitySetRow {
  id: number;
  name: string;
  communitiesJson: string[];
  normalizedHash: string;
  isShared: boolean;
  usageCount: number;
}
