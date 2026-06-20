export type CopilotIntent =
  | "bgp_peering_status"
  | "bgp_announcements"
  | "l2_circuit_status"
  | "config_guidance"
  | "prefix_trace"
  | "route_policy_explain"
  | "historical_diff"
  | "compliance_status"
  | "netbox_inventory"
  | "help"
  | "unknown";

export interface CopilotNetboxMatch {
  netboxDeviceId: number;
  hostname: string;
  ipAddress: string | null;
  site: string | null;
  role: string | null;
  vendor: string | null;
  platform: string | null;
  syncAction: "create" | "update" | "skip";
  localDeviceId: number | null;
  matchReason: string;
  warnings: string[];
}

export interface CopilotNetboxSummary {
  totalFromNetBox: number;
  matchedByNetboxId: number;
  matchedByHostname: number;
  toCreate: number;
  toUpdate: number;
  toSkip: number;
  readiness: string;
}

export type CopilotConfigHintCategory = "bgp_peering" | "bgp_announcements" | "l2_circuit";

export interface CopilotConfigHint {
  id: string;
  title: string;
  category: CopilotConfigHintCategory;
  commands: string[];
  warnings: string[];
  references: string[];
}

export interface CopilotPeerDeviceState {
  deviceId: number;
  deviceHostname: string;
  state: string;
  uptime: string | null;
  receivedPrefixes: number | null;
  advertisedPrefixes: number | null;
  importPolicy: string | null;
  exportPolicy: string | null;
}

export interface CopilotPeerAggregate {
  peerIp: string;
  remoteAs: number | null;
  vrf: string | null;
  role: string;
  devices: CopilotPeerDeviceState[];
  establishedCount: number;
  downCount: number;
}

export interface CopilotCompanyScopeSummary {
  kind: "tenant" | "device_group" | "site";
  label: string;
  tenantId: number | null;
  deviceCount: number;
  deviceHostnames: string[];
}

export type CopilotResponseMode = "quick" | "technical" | "diagnostic" | "action";

export interface CopilotEvidenceSource {
  tool: string;
  type: string;
  ref: string;
  collectedAt: string | null;
}

export interface CopilotNluEvidence {
  used: boolean;
  provider: "ollama" | "none";
  model: string | null;
  confidence: number | null;
  intentOverride: boolean;
  ambiguous: boolean;
  error?: string;
}

export interface CopilotToolRunSummary {
  toolName: string;
  status: string;
  durationMs: number;
  sourceType: string | null;
  sourceRef: string | null;
  error?: string;
}

export interface CopilotQueryPlanSummary {
  intent: CopilotIntent;
  tools: string[];
  skills: string[];
}

export type CopilotEntityKind =
  | "provider"
  | "customer"
  | "asn"
  | "prefix"
  | "peer_ip"
  | "vrf"
  | "circuit"
  | "device"
  | "site";

export interface CopilotEntity {
  kind: CopilotEntityKind;
  value: string;
  label?: string;
}

export interface CopilotPeerMatch {
  deviceId: number;
  deviceHostname: string;
  peerIp: string;
  remoteAs: number | null;
  state: string;
  vrf: string | null;
  role: string;
  uptime: string | null;
  receivedPrefixes: number | null;
  advertisedPrefixes: number | null;
  importPolicy: string | null;
  exportPolicy: string | null;
  matchReason: string;
}

export interface CopilotAnnouncementMatch {
  deviceId: number;
  deviceHostname: string;
  routePolicyName: string;
  family: string;
  targetType: string;
  affectedPrefixes: string[];
  upstreamSummary: string;
}

export interface CopilotPrefixTrace {
  prefix: string;
  deviceId: number;
  deviceHostname: string;
  receivedFrom: Array<{ peerIp: string; remoteAs: number | null; direction: string; collectedAt: string }>;
  advertisedTo: Array<{ peerIp: string; remoteAs: number | null; direction: string; collectedAt: string }>;
  matrixTargets: Array<{ targetName: string; targetType: string; announced: boolean; reason: string }>;
  relatedPolicies: string[];
  communities: string[];
  activeInRouteHistory: boolean;
  configSnapshotAt: string | null;
  liveSshVerified?: boolean;
  sshLiveHitCount?: number;
}

export interface CopilotRoutePolicyExplain {
  deviceId: number;
  routePolicy: string;
  source: string;
  collectedAt: string | null;
  nodes: Array<{ node: number | null; action: string | null; matches: string[]; applies: string[] }>;
  dependencies: {
    ipPrefixes: string[];
    communityFilters: string[];
    peerBindings: Array<{ peerIp: string; direction: "import" | "export" }>;
  };
}

export type CopilotDiagnosticStatus = "pass" | "fail" | "unknown" | "warn";

export interface CopilotDiagnosticStep {
  step: number;
  question: string;
  status: CopilotDiagnosticStatus;
  finding: string;
  evidenceRef?: string;
}

export interface CopilotMatrixTimelapseDiff {
  deviceId: number;
  deviceHostname: string;
  windowHours: number;
  olderAt: string | null;
  newerAt: string | null;
  added: Array<{ routePolicyName: string; prefixes: string[]; cells: string }>;
  removed: Array<{ routePolicyName: string; prefixes: string[]; cells: string }>;
  changed: Array<{ key: string; routePolicyName: string; before: string; after: string }>;
  note?: string;
}

export interface CopilotDrilldownCompare {
  deviceId: number;
  deviceHostname: string;
  peerIp: string;
  leftCollectedAt: string;
  rightCollectedAt: string;
  importPolicyChanges: number;
  exportPolicyChanges: number;
  enabledFamilyChanges: number;
  newWarnings: string[];
  resolvedWarnings: string[];
}

export interface CopilotHistoryEvent {
  kind: "peer_collection_diff" | "route_query";
  deviceId: number;
  deviceHostname: string;
  collectedAt: string;
  summary: string;
  details: string[];
}

export interface CopilotComplianceFinding {
  id: number;
  jobId: number;
  deviceId: number;
  deviceHostname: string;
  severity: string;
  status: string;
  context: string;
  ruleName: string;
  message: string;
  recommendation: string | null;
  objectName: string | null;
  collectedAt: string | null;
}

export interface CopilotL2FindingMatch {
  deviceId: number;
  deviceHostname: string;
  circuitId: number;
  circuitName: string;
  operStatus: string;
  codes: string[];
  matchReason: string;
}

export interface CopilotCircuitMatch {
  id: number;
  deviceId: number;
  deviceHostname: string;
  name: string;
  circuitType: string;
  operStatus: string;
  adminStatus: string;
  peerIp: string | null;
  vsiName: string | null;
  vcId: string | null;
  findings: string[];
  matchReason: string;
}

export interface CopilotEvidence {
  intent: CopilotIntent;
  entities: CopilotEntity[];
  resolvedEntities: Array<{
    canonicalName: string;
    entityType: string;
    asn: number | null;
    matchedAliases: string[];
    confidence: number;
  }>;
  scope: CopilotCompanyScopeSummary;
  queryPlan: CopilotQueryPlanSummary;
  skillsUsed: string[];
  toolRuns: CopilotToolRunSummary[];
  sources: CopilotEvidenceSource[];
  peers: CopilotPeerMatch[];
  peerAggregates: CopilotPeerAggregate[];
  announcements: CopilotAnnouncementMatch[];
  circuits: CopilotCircuitMatch[];
  complianceFindings: CopilotComplianceFinding[];
  l2Findings: CopilotL2FindingMatch[];
  configHints: CopilotConfigHint[];
  routePolicies: Array<{ deviceId: number; deviceHostname: string; policyName: string; role: "import" | "export" }>;
  prefixTraces: CopilotPrefixTrace[];
  routePolicyExplains: CopilotRoutePolicyExplain[];
  historyEvents: CopilotHistoryEvent[];
  matrixTimelapse: CopilotMatrixTimelapseDiff[];
  drilldownCompares: CopilotDrilldownCompare[];
  diagnosticTrail: CopilotDiagnosticStep[];
  netboxMatches: CopilotNetboxMatch[];
  netboxSummary: CopilotNetboxSummary | null;
  nlu: CopilotNluEvidence;
  notes: string[];
}

export interface CopilotAskRequest {
  question: string;
  deviceId?: number;
  mode?: CopilotResponseMode;
  sessionId?: number;
  userId?: number;
}

export interface CopilotSkillSummary {
  id: string;
  name: string;
  description: string;
  intents: CopilotIntent[];
}

export interface CopilotAskResponse {
  question: string;
  intent: CopilotIntent;
  mode: CopilotResponseMode;
  answer: string;
  confidence: "high" | "medium" | "low";
  evidence: CopilotEvidence;
  sessionId?: number;
  messageId?: number;
  readOnly: true;
  generatedAt: string;
}

export interface CopilotQueryPlanResponse {
  question: string;
  plan: CopilotQueryPlanSummary & {
    scope: CopilotCompanyScopeSummary;
    entities: CopilotEntity[];
  };
  readOnly: true;
  generatedAt: string;
}
