import type { CopilotSkillDefinition } from "../copilot.skills.types.js";
import { searchAnnouncements } from "../copilot.queries.js";

export const bgpAnnouncementsSkill: CopilotSkillDefinition = {
  id: "bgp_announcements",
  name: "BGP Announcements",
  description: "Consulta matriz de anuncios/route-policies em multiplos devices da empresa.",
  intents: ["bgp_announcements"],
  keywords: [/\b(an[uú]ncio|prefixo|export|import|propag|route-policy)\b/i],
  async run(context) {
    const announcements = await searchAnnouncements({
      entities: context.entities,
      deviceIds: context.scope.deviceIds,
    });

    return { announcements };
  },
};
