import { aggregatePeersAcrossDevices } from "../copilot.aggregate.js";
import type { CopilotSkillDefinition } from "../copilot.skills.types.js";
import { searchBgpPeers } from "../copilot.queries.js";

export const bgpPeeringSkill: CopilotSkillDefinition = {
  id: "bgp_peering",
  name: "BGP Peering",
  description: "Consulta estado de sessoes BGP (SNMP autoritativo) em todos os devices da mesma empresa.",
  intents: ["bgp_peering_status", "bgp_announcements"],
  keywords: [/\b(peering|peer|sess[aã]o|vizinho|bgp)\b/i],
  async run(context) {
    const peers = await searchBgpPeers({
      entities: context.entities,
      deviceIds: context.scope.deviceIds,
      freeText: context.question,
    });

    return {
      peers,
      peerAggregates: aggregatePeersAcrossDevices(peers),
      notes: context.scope.deviceIds.length > 1
        ? [`Escopo empresa: ${context.scope.label} (${context.scope.deviceIds.length} devices).`]
        : [],
    };
  },
};
