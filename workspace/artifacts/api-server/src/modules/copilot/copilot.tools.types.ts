import type { CopilotCompanyScope } from "./copilot.scope.js";
import type {
  CopilotAnnouncementMatch,
  CopilotCircuitMatch,
  CopilotConfigHint,
  CopilotEntity,
  CopilotIntent,
  CopilotPeerMatch,
} from "./copilot.types.js";

export type CopilotToolName =
  | "copilot_entity_resolve"
  | "netops_inventory_refresh"
  | "customer_lookup"
  | "bgp_peer_status_query"
  | "bgp_prefix_received"
  | "bgp_prefix_advertised"
  | "bgp_prefix_trace"
  | "bgp_route_ssh_live"
  | "copilot_nlu_classify"
  | "announcement_matrix_query"
  | "route_policy_lookup"
  | "route_policy_explain"
  | "historical_diff_lookup"
  | "announcement_matrix_timelapse"
  | "bgp_drilldown_compare"
  | "bgp_diagnostic_trail"
  | "l2_circuit_status_query"
  | "l2_findings_query"
  | "compliance_findings_query"
  | "netbox_inventory_query"
  | "config_suggestion_builder";

export type CopilotToolStatus = "ok" | "error" | "skipped";

export interface CopilotToolSource {
  type: "snmp_snapshot" | "db" | "config_bundle" | "announcement_matrix" | "matrix_timelapse" | "l2_inventory" | "compliance_db" | "entity_catalog" | "route_history" | "peer_history" | "drilldown_cache" | "ssh_live" | "netbox_api" | "nlu";
  ref: string;
  collectedAt: string | null;
}

export interface CopilotResolvedEntity {
  canonicalName: string;
  entityType: string;
  asn: number | null;
  matchedAliases: string[];
  confidence: number;
  vrf: string | null;
}

export interface CopilotToolContext {
  question: string;
  intent: CopilotIntent;
  entities: CopilotEntity[];
  scope: CopilotCompanyScope;
  tenantId: number | null;
  freeText?: string;
}

export interface CopilotToolResultPayload {
  resolvedEntities?: CopilotResolvedEntity[];
  peers?: CopilotPeerMatch[];
  announcements?: CopilotAnnouncementMatch[];
  circuits?: CopilotCircuitMatch[];
  complianceFindings?: import("./copilot.types.js").CopilotComplianceFinding[];
  l2Findings?: import("./copilot.types.js").CopilotL2FindingMatch[];
  configHints?: CopilotConfigHint[];
  routePolicies?: Array<{ deviceId: number; deviceHostname: string; policyName: string; role: "import" | "export" }>;
  prefixTraces?: import("./copilot.types.js").CopilotPrefixTrace[];
  routePolicyExplains?: import("./copilot.types.js").CopilotRoutePolicyExplain[];
  historyEvents?: import("./copilot.types.js").CopilotHistoryEvent[];
  matrixTimelapse?: import("./copilot.types.js").CopilotMatrixTimelapseDiff[];
  drilldownCompares?: import("./copilot.types.js").CopilotDrilldownCompare[];
  diagnosticTrail?: import("./copilot.types.js").CopilotDiagnosticStep[];
  inventoryRefresh?: import("./copilot.inventory-refresh.js").CopilotInventoryRefreshResult[];
  netboxMatches?: import("./copilot.types.js").CopilotNetboxMatch[];
  netboxSummary?: import("./copilot.types.js").CopilotNetboxSummary | null;
  notes?: string[];
}

export interface CopilotToolRunRecord {
  toolName: CopilotToolName;
  status: CopilotToolStatus;
  durationMs: number;
  input: Record<string, unknown>;
  output: CopilotToolResultPayload;
  source: CopilotToolSource | null;
  error?: string;
}

export interface CopilotQueryPlan {
  intent: CopilotIntent;
  entities: CopilotEntity[];
  scope: {
    kind: string;
    label: string;
    tenantId: number | null;
    deviceIds: number[];
    deviceHostnames: string[];
  };
  tools: CopilotToolName[];
  skills: string[];
}

export interface CopilotExecutorResult {
  plan: CopilotQueryPlan;
  toolRuns: CopilotToolRunRecord[];
  payload: CopilotToolResultPayload;
}
