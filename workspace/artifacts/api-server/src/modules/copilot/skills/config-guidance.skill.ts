import { buildConfigHintsFromContext } from "../copilot.config-hints.js";
import type { CopilotSkillDefinition } from "../copilot.skills.types.js";
import { searchBgpPeers } from "../copilot.queries.js";

export const configGuidanceSkill: CopilotSkillDefinition = {
  id: "config_guidance",
  name: "Config Guidance",
  description: "Dicas read-only de configuracao Huawei VRP (sem apply).",
  intents: ["config_guidance"],
  keywords: [
    /\b(como configur|como criar|como adicionar|passo a passo|template|exemplo de config)\b/i,
    /\b(route-policy|ip-prefix|peer enable|vpn-instance)\b/i,
  ],
  async run(context) {
    const peers = await searchBgpPeers({
      entities: context.entities,
      deviceIds: context.scope.deviceIds,
      freeText: context.question,
    });

    const configHints = buildConfigHintsFromContext({
      entities: context.entities,
      peers,
    });

    return {
      peers,
      configHints,
      notes: [
        "Orientacao apenas — nenhum comando e enviado ao equipamento.",
        "Use Provisioning Preview e BGP Cleanup para validar antes de mudancas.",
      ],
    };
  },
};
