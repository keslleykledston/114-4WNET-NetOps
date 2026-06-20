import type { CopilotSkillDefinition } from "../copilot.skills.types.js";
import { isCopilotNetboxOperational, queryNetboxInventoryInScope } from "../copilot.netbox-query.js";

export const netboxSkill: CopilotSkillDefinition = {
  id: "netbox",
  name: "NetBox",
  description: "Consulta inventario NetBox read-only e correlacao com devices locais.",
  intents: ["netbox_inventory"],
  keywords: [/\b(netbox|net\s*box|invent[aá]rio externo)\b/i],
  async run(context) {
    if (!isCopilotNetboxOperational()) {
      return { notes: ["Skill NetBox: integracao desabilitada ou nao configurada."] };
    }

    const siteFilter = context.entities.find((entity) => entity.kind === "site")?.value ?? null;
    const result = await queryNetboxInventoryInScope({
      freeText: context.question,
      deviceIds: context.scope.deviceIds,
      deviceHostnames: context.scope.deviceHostnames,
      siteFilter,
    });

    return { notes: result.notes };
  },
};
