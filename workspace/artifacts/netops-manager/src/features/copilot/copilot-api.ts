export type CopilotIntent =
  | "bgp_peering_status"
  | "bgp_announcements"
  | "l2_circuit_status"
  | "config_guidance"
  | "prefix_trace"
  | "route_policy_explain"
  | "historical_diff"
  | "compliance_status"
  | "help"
  | "unknown";

export type CopilotResponseMode = "quick" | "technical" | "diagnostic" | "action";

export interface CopilotConfigHint {
  id: string;
  title: string;
  category: string;
  commands: string[];
  warnings: string[];
  references: string[];
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
  sessionId?: number;
  messageId?: number;
  evidence: {
    intent: CopilotIntent;
    entities: Array<{ kind: string; value: string; label?: string }>;
    resolvedEntities: Array<{
      canonicalName: string;
      entityType: string;
      asn: number | null;
      matchedAliases: string[];
      confidence: number;
    }>;
    scope: {
      kind: string;
      label: string;
      tenantId: number | null;
      deviceCount: number;
      deviceHostnames: string[];
    };
    queryPlan: { intent: CopilotIntent; tools: string[]; skills: string[] };
    skillsUsed: string[];
    toolRuns: Array<{
      toolName: string;
      status: string;
      durationMs: number;
      sourceType: string | null;
      sourceRef: string | null;
      error?: string;
    }>;
    sources: Array<{ tool: string; type: string; ref: string; collectedAt: string | null }>;
    peers: Array<{
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
    }>;
    peerAggregates: Array<{
      peerIp: string;
      remoteAs: number | null;
      vrf: string | null;
      role: string;
      establishedCount: number;
      downCount: number;
      devices: Array<{ deviceHostname: string; state: string }>;
    }>;
    announcements: Array<{
      deviceId: number;
      deviceHostname: string;
      routePolicyName: string;
      family: string;
      targetType: string;
      affectedPrefixes: string[];
      upstreamSummary: string;
    }>;
    circuits: Array<{
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
    }>;
    complianceFindings?: Array<{
      id: number;
      deviceHostname: string;
      severity: string;
      status: string;
      ruleName: string;
      message: string;
    }>;
    l2Findings?: Array<{
      deviceHostname: string;
      circuitName: string;
      operStatus: string;
      codes: string[];
    }>;
    configHints: CopilotConfigHint[];
    routePolicies: Array<{
      deviceId: number;
      deviceHostname: string;
      policyName: string;
      role: "import" | "export";
    }>;
    matrixTimelapse: Array<{
      deviceId: number;
      deviceHostname: string;
      windowHours: number;
      olderAt: string | null;
      newerAt: string | null;
      added: Array<{ routePolicyName: string; prefixes: string[]; cells: string }>;
      removed: Array<{ routePolicyName: string; prefixes: string[]; cells: string }>;
      changed: Array<{ key: string; routePolicyName: string; before: string; after: string }>;
      note?: string;
    }>;
    drilldownCompares: Array<{
      deviceId: number;
      deviceHostname: string;
      peerIp: string;
      importPolicyChanges: number;
      exportPolicyChanges: number;
    }>;
    diagnosticTrail: Array<{
      step: number;
      question: string;
      status: "pass" | "fail" | "unknown" | "warn";
      finding: string;
    }>;
    nlu?: {
      used: boolean;
      provider: "ollama" | "none";
      model: string | null;
      confidence: number | null;
      intentOverride: boolean;
      ambiguous: boolean;
      error?: string;
    };
    notes: string[];
  };
  readOnly: true;
  generatedAt: string;
}

export interface CopilotQueryPlanResponse {
  question: string;
  plan: {
    intent: CopilotIntent;
    tools: string[];
    skills: string[];
    scope: CopilotAskResponse["evidence"]["scope"];
    entities: Array<{ kind: string; value: string; label?: string }>;
  };
  readOnly: true;
  generatedAt: string;
}

async function parseError(response: Response): Promise<never> {
  const payload = await response.json().catch(() => ({}));
  throw new Error(typeof payload.error === "string" ? payload.error : `HTTP ${response.status}`);
}

export async function askCopilot(input: {
  question: string;
  deviceId?: number;
  mode?: CopilotResponseMode;
  sessionId?: number;
}): Promise<CopilotAskResponse> {
  const response = await fetch("/api/copilot/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(input),
  });

  if (!response.ok) await parseError(response);
  return response.json() as Promise<CopilotAskResponse>;
}

export async function planCopilotQuery(input: {
  question: string;
  deviceId?: number;
}): Promise<CopilotQueryPlanResponse> {
  const response = await fetch("/api/copilot/query-plan", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(input),
  });

  if (!response.ok) await parseError(response);
  return response.json() as Promise<CopilotQueryPlanResponse>;
}

export async function listCopilotSkills(): Promise<{ skills: CopilotSkillSummary[]; readOnly: true }> {
  const response = await fetch("/api/copilot/skills", { credentials: "include" });
  if (!response.ok) await parseError(response);
  return response.json();
}

export interface CopilotLearnedAlias {
  id: number;
  alias: string;
  entityType: string;
  canonicalName: string | null;
  confidence: number | null;
  status: string;
  createdAt: string;
}

export async function getCopilotAliasStats(tenantId: number): Promise<{
  stats: { pending: number; approved: number; rejected: number; total: number };
  readOnly: true;
}> {
  const response = await fetch(`/api/copilot/aliases/stats?tenantId=${tenantId}`, { credentials: "include" });
  if (!response.ok) await parseError(response);
  return response.json();
}

export async function listCopilotAliases(
  tenantId: number,
  status = "pending",
): Promise<{ aliases: CopilotLearnedAlias[]; readOnly: true }> {
  const response = await fetch(`/api/copilot/aliases?tenantId=${tenantId}&status=${status}`, { credentials: "include" });
  if (!response.ok) await parseError(response);
  return response.json();
}

export async function proposeCopilotAlias(input: {
  tenantId: number;
  alias: string;
  canonicalName: string;
  entityType?: string;
}): Promise<{ alias: CopilotLearnedAlias; status: "pending" }> {
  const response = await fetch("/api/copilot/aliases/propose", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(input),
  });
  if (!response.ok) await parseError(response);
  return response.json();
}

export async function approveCopilotAlias(input: {
  aliasId: number;
  tenantId: number;
}): Promise<{ alias: CopilotLearnedAlias }> {
  const response = await fetch(`/api/copilot/aliases/${input.aliasId}/approve`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ tenantId: input.tenantId }),
  });
  if (!response.ok) await parseError(response);
  return response.json();
}

export async function rejectCopilotAlias(input: {
  aliasId: number;
  tenantId: number;
}): Promise<{ alias: CopilotLearnedAlias }> {
  const response = await fetch(`/api/copilot/aliases/${input.aliasId}/reject`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ tenantId: input.tenantId }),
  });
  if (!response.ok) await parseError(response);
  return response.json();
}

export async function sendCopilotFeedback(input: {
  messageId: number;
  rating: "useful" | "incorrect" | "teach";
  comment?: string;
  question?: string;
  tenantId?: number;
  alias?: string;
  canonicalName?: string;
  entityType?: string;
}): Promise<{ ok: true; feedbackId: number; aliasProposalId?: number | null }> {
  const response = await fetch("/api/copilot/feedback", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(input),
  });
  if (!response.ok) await parseError(response);
  return response.json();
}
