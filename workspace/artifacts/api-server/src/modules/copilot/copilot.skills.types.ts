import type { CopilotCompanyScope } from "./copilot.scope.js";
import type {
  CopilotAnnouncementMatch,
  CopilotCircuitMatch,
  CopilotConfigHint,
  CopilotEntity,
  CopilotIntent,
  CopilotPeerAggregate,
  CopilotPeerMatch,
} from "./copilot.types.js";

export interface CopilotSkillContext {
  question: string;
  intent: CopilotIntent;
  entities: CopilotEntity[];
  scope: CopilotCompanyScope;
}

export interface CopilotSkillResult {
  peers?: CopilotPeerMatch[];
  peerAggregates?: CopilotPeerAggregate[];
  announcements?: CopilotAnnouncementMatch[];
  circuits?: CopilotCircuitMatch[];
  configHints?: CopilotConfigHint[];
  notes?: string[];
}

export interface CopilotSkillDefinition {
  id: string;
  name: string;
  description: string;
  intents: CopilotIntent[];
  keywords: RegExp[];
  run: (context: CopilotSkillContext) => Promise<CopilotSkillResult>;
}
