import type { CopilotSkillDefinition } from "../copilot.skills.types.js";
import { searchComplianceFindings } from "../copilot.queries.js";

export const complianceSkill: CopilotSkillDefinition = {
  id: "compliance",
  name: "Compliance",
  description: "Consulta achados de compliance (jobs read-only) no escopo da empresa.",
  intents: ["compliance_status"],
  keywords: [/\b(compliance|conformidade|achado|viola[cç][aã]o|baseline|auditoria)\b/i],
  async run(context) {
    const findings = await searchComplianceFindings({
      deviceIds: context.scope.deviceIds,
      freeText: context.question,
      status: "fail",
    });

    return {
      notes: findings.length > 0
        ? [`Skill compliance: ${findings.length} achado(s) fail.`]
        : ["Skill compliance: sem achados fail."],
    };
  },
};
