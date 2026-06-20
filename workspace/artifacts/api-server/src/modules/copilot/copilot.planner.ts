import { copilotSkillsTable, db } from "@workspace/db";
import { and, eq, isNull, or } from "drizzle-orm";
import type { CopilotCompanyScope } from "./copilot.scope.js";
import type { CopilotQueryPlan, CopilotToolName } from "./copilot.tools.types.js";
import type { CopilotEntity, CopilotIntent } from "./copilot.types.js";

function withInventoryRefresh(tools: CopilotToolName[]): CopilotToolName[] {
  if (!tools.includes("copilot_entity_resolve") || tools.includes("netops_inventory_refresh")) {
    return tools;
  }
  const copy = [...tools];
  const idx = copy.indexOf("copilot_entity_resolve");
  copy.splice(idx + 1, 0, "netops_inventory_refresh");
  return copy;
}

const DEFAULT_TOOL_CHAIN: Record<CopilotIntent, CopilotToolName[]> = {
  bgp_peering_status: withInventoryRefresh([
    "copilot_entity_resolve",
    "bgp_peer_status_query",
    "bgp_prefix_received",
    "bgp_prefix_advertised",
    "route_policy_lookup",
  ]),
  bgp_announcements: withInventoryRefresh([
    "copilot_entity_resolve",
    "announcement_matrix_query",
    "bgp_peer_status_query",
    "bgp_prefix_received",
    "bgp_route_ssh_live",
    "route_policy_lookup",
  ]),
  l2_circuit_status: [
    "copilot_entity_resolve",
    "l2_circuit_status_query",
    "l2_findings_query",
  ],
  compliance_status: [
    "copilot_entity_resolve",
    "compliance_findings_query",
  ],
  netbox_inventory: [
    "copilot_entity_resolve",
    "netbox_inventory_query",
  ],
  config_guidance: withInventoryRefresh([
    "copilot_entity_resolve",
    "bgp_peer_status_query",
    "announcement_matrix_query",
    "config_suggestion_builder",
  ]),
  prefix_trace: withInventoryRefresh([
    "copilot_entity_resolve",
    "customer_lookup",
    "bgp_peer_status_query",
    "bgp_prefix_trace",
    "bgp_route_ssh_live",
    "announcement_matrix_query",
    "announcement_matrix_timelapse",
    "route_policy_explain",
    "historical_diff_lookup",
    "bgp_drilldown_compare",
    "bgp_diagnostic_trail",
  ]),
  route_policy_explain: withInventoryRefresh([
    "copilot_entity_resolve",
    "route_policy_explain",
    "route_policy_lookup",
    "bgp_peer_status_query",
  ]),
  historical_diff: withInventoryRefresh([
    "copilot_entity_resolve",
    "bgp_peer_status_query",
    "historical_diff_lookup",
    "announcement_matrix_query",
    "announcement_matrix_timelapse",
    "bgp_drilldown_compare",
  ]),
  help: [],
  unknown: ["copilot_entity_resolve"],
};

async function loadSkillKeysForIntent(intent: CopilotIntent, tenantId: number | null): Promise<string[]> {
  const rows = await db
    .select({ skillKey: copilotSkillsTable.skillKey, toolChain: copilotSkillsTable.toolChain })
    .from(copilotSkillsTable)
    .where(and(
      eq(copilotSkillsTable.enabled, true),
      tenantId == null
        ? isNull(copilotSkillsTable.tenantId)
        : or(isNull(copilotSkillsTable.tenantId), eq(copilotSkillsTable.tenantId, tenantId)),
    ));

  const intentNeedle = intent.replace(/_/g, " ");
  return rows
    .filter((row) => {
      const chain = row.toolChain ?? [];
      return chain.length > 0 && (row.skillKey.includes(intent.split("_")[0] ?? "") || intentNeedle.includes(row.skillKey));
    })
    .map((row) => row.skillKey);
}

export async function buildCopilotQueryPlan(input: {
  question: string;
  intent: CopilotIntent;
  entities: CopilotEntity[];
  scope: CopilotCompanyScope;
}): Promise<CopilotQueryPlan> {
  const skills = await loadSkillKeysForIntent(input.intent, input.scope.tenantId);
  const tools = [...(DEFAULT_TOOL_CHAIN[input.intent] ?? DEFAULT_TOOL_CHAIN.unknown)];

  return {
    intent: input.intent,
    entities: input.entities,
    scope: {
      kind: input.scope.kind,
      label: input.scope.label,
      tenantId: input.scope.tenantId,
      deviceIds: input.scope.deviceIds,
      deviceHostnames: input.scope.deviceHostnames,
    },
    tools,
    skills,
  };
}
