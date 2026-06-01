import type { BgpAfiSafi } from "../netops/huawei-vrp/parsers/bgp-peer-dependency-parser.js";

export interface BgpPolicyEditorNodeEdit {
  nodeId: string;
  selectedCommunities: string[];
}

export interface BgpPolicyEditorPreviewRequest {
  routePolicyName?: string | null;
  nodeEdits: BgpPolicyEditorNodeEdit[];
}

export type BgpPolicyEditorPreviewFindingCode =
  | "COMMUNITY_LIST_NOT_FOUND"
  | "COMMUNITY_LIST_EMPTY"
  | "COMMUNITY_COMBINATION_CUSTOM"
  | "COMMUNITY_COMBINATION_MATCHED"
  | "NODE_NOT_FOUND"
  | "NODE_UNSUPPORTED_ACTION"
  | "ROUTE_POLICY_NOT_FOUND"
  | "IMPORT_POLICY_NOT_BOUND"
  | "SNAPSHOT_STALE"
  | "APPLY_DISABLED"
  | "ROLLBACK_DISABLED";

export interface BgpPolicyEditorFinding {
  code: BgpPolicyEditorPreviewFindingCode;
  severity: "info" | "warning" | "error";
  message: string;
  recommendation: string;
  blocking: boolean;
}

export interface BgpPolicyEditorDiff {
  beforeLines: string[];
  afterLines: string[];
  removedLines: string[];
  addedLines: string[];
  summary: string;
}

export interface BgpPolicyEditorCommunityResolution {
  matchedCommunityListName: string | null;
  matchedCommunitySetName: string | null;
  isCustom: boolean;
  normalizedCommunities: string[];
  confidence: "exact" | "custom" | "empty" | "no-library";
}

export interface BgpPolicyEditorNodePreview {
  nodeId: string;
  policyName: string;
  sequence: number | null;
  action: string | null;
  before: string;
  after: string;
  selectedCommunities: string[];
  matchedCommunityListName: string | null;
  matchedCommunitySetName: string | null;
  isCustom: boolean;
  changed: boolean;
  unsupportedReason?: string | null;
  diff: BgpPolicyEditorDiff;
}

export interface BgpPolicyEditorSafety {
  applyDisabled: true;
  rollbackDisabled: true;
  dryRun: true;
  messages: string[];
}

export interface BgpPolicyEditorPreviewResponse {
  contractVersion: "bgp-policy-editor-preview-v1";
  previewSource: "backend";
  deviceId: number;
  deviceName: string;
  peer: string;
  peerContext: {
    deviceId: number;
    deviceName: string;
    peerIp: string;
    peerRemoteAs: number | null;
    peerVrf: string | null;
    snapshotId: number | null;
    collectedAt: string | null;
  };
  routePolicyName: string;
  direction: "import";
  nodeEdits: BgpPolicyEditorNodePreview[];
  diff: BgpPolicyEditorDiff;
  findings: BgpPolicyEditorFinding[];
  safety: BgpPolicyEditorSafety;
}

export interface BgpPolicyEditorCommunitySetOption {
  id: number;
  name: string;
  vrpObjectName: string;
  members: string[];
  status: string;
  description?: string | null;
}

export interface BgpPolicyEditorNodeNode {
  sequence: number | null;
  action: string | null;
  matches: Array<{ type: string; name: string; raw: string }>;
  applies: Array<{ type: string; raw: string }>;
}

export interface BgpPolicyEditorPolicy {
  name: string;
  direction: "import";
  afiSafi: BgpAfiSafi;
  nodes: BgpPolicyEditorNodeNode[];
  dependencies: Array<{
    fromNode: number | null;
    dependencyType: string;
    dependencyName: string;
    status: string;
    evidence: string;
  }>;
  status: string;
}
