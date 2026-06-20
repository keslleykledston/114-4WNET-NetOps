import type { CopilotSkillDefinition } from "../copilot.skills.types.js";
import { searchCircuits } from "../copilot.queries.js";

export const l2CircuitsSkill: CopilotSkillDefinition = {
  id: "l2_circuits",
  name: "L2 Circuits",
  description: "Consulta circuitos L2/VSI/PW no escopo da empresa.",
  intents: ["l2_circuit_status"],
  keywords: [/\b(circuito|l2|l2vc|vsi|pw|pseudowire|vlan)\b/i],
  async run(context) {
    const circuits = await searchCircuits({
      entities: context.entities,
      deviceIds: context.scope.deviceIds,
      freeText: context.question,
    });

    return { circuits };
  },
};
