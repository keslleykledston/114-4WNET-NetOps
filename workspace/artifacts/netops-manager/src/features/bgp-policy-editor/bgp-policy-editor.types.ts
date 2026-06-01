import type { BgpAfiSafi, BgpPeerDrilldownResult } from "@/features/bgp-drilldown/types";
import type { CommunityLibraryItem, CommunitySet } from "@workspace/api-client-react";

export interface BgpPolicyEditorPolicyNode {
  sequence: number | null;
  action: string | null;
  matches: Array<{ type: string; name: string; raw: string }>;
  applies: Array<{ type: string; raw: string }>;
}

export interface BgpPolicyEditorPolicyDependency {
  fromNode: number | null;
  dependencyType: string;
  dependencyName: string;
  status: string;
  evidence: string;
}

export interface BgpPolicyEditorPolicy {
  name: string;
  direction: "import";
  afiSafi: BgpAfiSafi;
  nodes: BgpPolicyEditorPolicyNode[];
  dependencies: BgpPolicyEditorPolicyDependency[];
  status: string;
}

export type BgpPolicyEditorNodeKey = string;

export interface BgpPolicyEditorCommunityOption {
  value: string;
  label: string;
  source?: string;
}

export interface BgpPolicyEditorCommunitySetOption {
  id: number;
  name: string;
  vrpObjectName: string;
  members: string[];
  status: string;
  description?: string | null;
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
  | "ROLLBACK_DISABLED"
  | "BACKEND_PREVIEW_UNAVAILABLE"
  | "PREVIEW_DRIFT_DETECTED";

export interface BgpPolicyEditorFinding {
  code: BgpPolicyEditorPreviewFindingCode;
  severity: "info" | "warning" | "error";
  message: string;
  recommendation: string;
  blocking: boolean;
}

export interface BgpPolicyEditorPreviewDiff {
  beforeLines: string[];
  afterLines: string[];
  removedLines: string[];
  addedLines: string[];
  summary: string;
}

export type BgpPolicyEditorPreviewSource = "backend" | "local" | "local_fallback";

export interface BgpPolicyEditorCommunityResolution {
  matchedCommunityListName: string | null;
  isCustom: boolean;
  normalizedCommunities: string[];
  confidence: "exact" | "custom" | "empty" | "no-library";
}

export interface BgpPolicyEditorNodePreview {
  nodeId: string;
  action: string | null;
  before: string;
  after: string;
  selectedCommunities: string[];
  matchedCommunityListName: string | null;
  isCustom: boolean;
  changed: boolean;
  unsupportedReason?: string | null;
  diff: BgpPolicyEditorPreviewDiff;
}

export interface BgpPolicyEditorSafety {
  applyDisabled: boolean;
  rollbackDisabled: boolean;
  dryRun: boolean;
  messages: string[];
}

export interface BgpPolicyEditorPreviewNodeEdit {
  nodeId: string;
  selectedCommunities: string[];
}

export interface BgpPolicyEditorPreviewRequest {
  routePolicyName?: string | null;
  nodeEdits: BgpPolicyEditorPreviewNodeEdit[];
}

export interface BgpPolicyEditorBackendPreviewResponse {
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
  diff: BgpPolicyEditorPreviewDiff;
  findings: BgpPolicyEditorFinding[];
  safety: {
    applyDisabled: true;
    rollbackDisabled: true;
    dryRun: true;
    messages: string[];
  };
}

export interface BgpPolicyEditorPreview {
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
  direction: "import" | "export";
  nodeEdits: BgpPolicyEditorNodePreview[];
  diff: BgpPolicyEditorPreviewDiff;
  findings: BgpPolicyEditorFinding[];
  safety: BgpPolicyEditorSafety;
  previewSource?: BgpPolicyEditorPreviewSource;
  backendError?: string | null;
  driftDetected?: boolean;
  driftSummary?: string[];
}

export interface BgpPolicyEditorNodeDraft {
  key: BgpPolicyEditorNodeKey;
  policyName: string;
  direction: "import";
  afiSafi: BgpAfiSafi;
  sequence: number | null;
  original: BgpPolicyEditorPolicyNode;
  selectedCommunities: string[];
  matchedCommunityListName: string | null;
  isCustom: boolean;
  confidence: "exact" | "custom" | "empty" | "no-library";
  changed: boolean;
  previewText: string;
}

export interface BgpPolicyEditorPolicyDraft {
  policyName: string;
  nodes: BgpPolicyEditorNodeDraft[];
}

export interface BgpPolicyEditorPendingEdit {
  key: BgpPolicyEditorNodeKey;
  policyName: string;
  afiSafi: BgpAfiSafi;
  sequence: number | null;
  original: BgpPolicyEditorPolicyNode;
  selectedCommunities: string[];
  matchedCommunityListName: string | null;
  isCustom: boolean;
  confidence: "exact" | "custom" | "empty" | "no-library";
  changed: boolean;
  previewText: string;
}

export interface BgpPolicyEditorCommunityEditPayload {
  key: BgpPolicyEditorNodeKey;
  policyName: string;
  afiSafi: BgpAfiSafi;
  sequence: number | null;
  selectedCommunities: string[];
  matchedCommunityListName: string | null;
  isCustom: boolean;
  normalizedCommunities: string[];
  confidence: "exact" | "custom" | "empty" | "no-library";
  changed: boolean;
  previewText: string;
}

export interface BgpPolicyEditorModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  deviceId: number;
  deviceName: string;
  peerIp: string;
  peerRemoteAs?: number | null;
  peerVrf?: string | null;
  drilldown?: BgpPeerDrilldownResult | null;
  communityLibraryItems?: CommunityLibraryItem[] | null;
  communitySets?: CommunitySet[] | null;
}
