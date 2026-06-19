import { buildCopilotQueryPlan } from "./copilot.planner.js";
import { executeCopilotTool, mergeToolPayload, peerAggregatesFromPayload } from "./copilot.tools.js";
import type { CopilotCompanyScope } from "./copilot.scope.js";
import type { CopilotExecutorResult, CopilotToolContext, CopilotToolResultPayload } from "./copilot.tools.types.js";
import type { CopilotEntity, CopilotIntent } from "./copilot.types.js";

export async function executeCopilotQueryPlan(input: {
  question: string;
  intent: CopilotIntent;
  entities: CopilotEntity[];
  scope: CopilotCompanyScope;
}): Promise<CopilotExecutorResult> {
  const plan = await buildCopilotQueryPlan(input);
  const context: CopilotToolContext = {
    question: input.question,
    intent: input.intent,
    entities: input.entities,
    scope: input.scope,
    tenantId: input.scope.tenantId,
    freeText: input.question,
  };

  let payload: CopilotToolResultPayload = {};
  const toolRuns = [];

  for (const toolName of plan.tools) {
    const run = await executeCopilotTool(toolName, context, payload);
    toolRuns.push(run);
    if (run.status === "ok") {
      payload = mergeToolPayload(payload, run.output);
    }
  }

  return { plan, toolRuns, payload };
}

export function evidenceSourcesFromRuns(
  toolRuns: CopilotExecutorResult["toolRuns"],
): Array<{ tool: string; type: string; ref: string; collectedAt: string | null }> {
  return toolRuns
    .filter((run) => run.source)
    .map((run) => ({
      tool: run.toolName,
      type: run.source!.type,
      ref: run.source!.ref,
      collectedAt: run.source!.collectedAt,
    }));
}

export { peerAggregatesFromPayload };
