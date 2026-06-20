import type { CopilotIntent } from "../copilot.types.js";
import type { CopilotSkillContext, CopilotSkillDefinition, CopilotSkillResult } from "../copilot.skills.types.js";
import { bgpAnnouncementsSkill } from "./bgp-announcements.skill.js";
import { bgpPeeringSkill } from "./bgp-peering.skill.js";
import { configGuidanceSkill } from "./config-guidance.skill.js";
import { complianceSkill } from "./compliance.skill.js";
import { l2CircuitsSkill } from "./l2-circuits.skill.js";
import { netboxSkill } from "./netbox.skill.js";

const builtinSkills: CopilotSkillDefinition[] = [
  bgpPeeringSkill,
  bgpAnnouncementsSkill,
  l2CircuitsSkill,
  complianceSkill,
  netboxSkill,
  configGuidanceSkill,
];

const skillRegistry = new Map<string, CopilotSkillDefinition>();

function registerSkill(skill: CopilotSkillDefinition): void {
  skillRegistry.set(skill.id, skill);
}

for (const skill of builtinSkills) {
  registerSkill(skill);
}

/** Register a new skill at runtime (agents/plugins). */
export function addCopilotSkill(skill: CopilotSkillDefinition): void {
  registerSkill(skill);
}

export function listCopilotSkills(): CopilotSkillDefinition[] {
  return [...skillRegistry.values()].sort((left, right) => left.id.localeCompare(right.id));
}

export function getCopilotSkill(id: string): CopilotSkillDefinition | undefined {
  return skillRegistry.get(id);
}

function skillMatchesIntent(skill: CopilotSkillDefinition, intent: CopilotIntent): boolean {
  return skill.intents.includes(intent);
}

function skillMatchesKeywords(skill: CopilotSkillDefinition, question: string): boolean {
  return skill.keywords.some((pattern) => pattern.test(question));
}

export async function runCopilotSkills(context: CopilotSkillContext): Promise<{
  results: CopilotSkillResult[];
  skillsUsed: string[];
}> {
  const selected = listCopilotSkills().filter((skill) => {
    if (skillMatchesIntent(skill, context.intent)) return true;
    return skillMatchesKeywords(skill, context.question);
  });

  const results: CopilotSkillResult[] = [];
  const skillsUsed: string[] = [];

  for (const skill of selected) {
    const result = await skill.run(context);
    results.push(result);
    skillsUsed.push(skill.id);
  }

  return { results, skillsUsed };
}

export function mergeSkillResults(results: CopilotSkillResult[]): CopilotSkillResult {
  const merged: CopilotSkillResult = {
    peers: [],
    peerAggregates: [],
    announcements: [],
    circuits: [],
    configHints: [],
    notes: [],
  };

  for (const result of results) {
    if (result.peers) merged.peers!.push(...result.peers);
    if (result.peerAggregates) merged.peerAggregates!.push(...result.peerAggregates);
    if (result.announcements) merged.announcements!.push(...result.announcements);
    if (result.circuits) merged.circuits!.push(...result.circuits);
    if (result.configHints) merged.configHints!.push(...result.configHints);
    if (result.notes) merged.notes!.push(...result.notes);
  }

  const dedupePeers = new Map<string, NonNullable<CopilotSkillResult["peers"]>[number]>();
  for (const peer of merged.peers ?? []) {
    dedupePeers.set(`${peer.deviceId}|${peer.peerIp}|${peer.vrf ?? ""}`, peer);
  }
  merged.peers = [...dedupePeers.values()];

  const dedupeHints = new Map<string, NonNullable<CopilotSkillResult["configHints"]>[number]>();
  for (const hint of merged.configHints ?? []) {
    dedupeHints.set(hint.id, hint);
  }
  merged.configHints = [...dedupeHints.values()];

  merged.notes = [...new Set(merged.notes ?? [])];
  return merged;
}
