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
}

export interface MatrixResponse {
  deviceId: number;
  upstreams: Array<{ circuitId: string; displayName: string; role: string }>;
  rows: MatrixRow[];
  findings: Array<{ code: string; severity: string; message: string }>;
  generatedAt: string;
  meta?: {
    source: string;
    collectionAgeMinutes: number | null;
    lastCollectedAt: string | null;
    readOnly: boolean;
  };
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
