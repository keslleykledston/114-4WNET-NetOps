import type { ChangePlanDetail, ChangePlanSnapshotPayload } from "./change-plans.types.js";
import { summarizeDiffForMarkdown } from "./change-plans.diff-engine.js";
import { formatProposedCommandsMarkdown } from "../bgp-announcements/announcement-vendor-draft.service.js";
import type { ProposedCommandSet } from "../bgp-announcements/bgp-announcement.types.js";

export function buildChangePlanMarkdown(plan: ChangePlanDetail): string {
  const snapshot = plan.snapshot;
  const lines: string[] = [];
  lines.push("# Change Plan");
  lines.push("");
  lines.push(`- ID: ${plan.id}`);
  lines.push(`- Module: ${plan.module}`);
  lines.push(`- Change type: ${plan.changeType}`);
  lines.push(`- Device: ${plan.deviceId}${plan.hostname ? ` (${plan.hostname})` : ""}`);
  lines.push(`- Status: ${plan.status}`);
  lines.push(`- Created at: ${plan.createdAt}`);
  lines.push(`- Created by: ${plan.createdBy ?? "—"}`);
  if (plan.ticketRef) lines.push(`- Ticket: ${plan.ticketRef}`);
  if (snapshot.peerIp) lines.push(`- Peer: ${snapshot.peerIp}`);
  if (snapshot.vrf) lines.push(`- VRF: ${snapshot.vrf}`);
  if (snapshot.family) lines.push(`- Family: ${snapshot.family}`);
  lines.push("");
  lines.push("## Objetivo");
  lines.push(`Planejamento documental (${plan.changeType}) sem execução automática.`);
  lines.push("");
  lines.push("## Impacto");
  lines.push(`- Recommendation: ${snapshot.impact.recommendation}`);
  lines.push(`- Risk: ${snapshot.impact.riskLevel}`);
  if (snapshot.impact.blockedReasons.length) {
    lines.push("");
    lines.push("### Blocked reasons");
    for (const reason of snapshot.impact.blockedReasons) lines.push(`- ${reason}`);
  }
  if (snapshot.impact.warnings.length) {
    lines.push("");
    lines.push("### Warnings");
    for (const warning of snapshot.impact.warnings) lines.push(`- ${warning}`);
  }
  const proposedCommands = snapshot.proposedCommands ?? (Array.isArray(plan.metadata["proposedCommands"])
    ? plan.metadata["proposedCommands"] as ProposedCommandSet[]
    : []);
  const proposedCommandWarnings = snapshot.proposedCommandsWarnings ?? (Array.isArray(plan.metadata["proposedCommandsWarnings"])
    ? plan.metadata["proposedCommandsWarnings"] as string[]
    : []);
  if (plan.module === "bgp_announcements" || (proposedCommands?.length ?? 0) > 0 || proposedCommandWarnings.length > 0) {
    lines.push("");
    lines.push(...formatProposedCommandsMarkdown({
      proposedCommands: proposedCommands ?? [],
      warnings: proposedCommandWarnings,
    }));
  }
  lines.push("");
  lines.push("## Dependências exclusivas");
  for (const item of plan.items.filter((entry) => entry.classification === "exclusive")) {
    lines.push(`- ${item.itemType} ${item.itemName} (usage=${item.usageCount}, remove=${item.willBeRemoved ? "SIM" : "NÃO"})`);
  }
  lines.push("");
  lines.push("## Dependências compartilhadas");
  for (const item of plan.items.filter((entry) => entry.classification === "shared")) {
    lines.push(`- ${item.itemType} ${item.itemName} (usage=${item.usageCount})`);
  }
  lines.push("");
  lines.push("## Dependências globais preservadas");
  for (const item of plan.items.filter((entry) => entry.classification === "global")) {
    lines.push(`- ${item.itemType} ${item.itemName} — ${item.reason ?? "Dependência global protegida."}`);
  }
  lines.push("");
  lines.push("## Script de remoção (documental)");
  lines.push("```text");
  lines.push(snapshot.suggestedScript.join("\n") || "—");
  lines.push("```");
  lines.push("");
  lines.push("## Rollback documental");
  lines.push("```text");
  lines.push(snapshot.suggestedRollback.script.join("\n") || "—");
  lines.push("```");
  if (snapshot.suggestedRollback.warnings.length) {
    lines.push("");
    lines.push("### Rollback warnings");
    for (const warning of snapshot.suggestedRollback.warnings) lines.push(`- ${warning}`);
  }
  lines.push("");
  lines.push("## Validações");
  lines.push("### Before");
  lines.push("```text");
  lines.push(snapshot.validations.before.join("\n") || "—");
  lines.push("```");
  lines.push("### After");
  lines.push("```text");
  lines.push(snapshot.validations.after.join("\n") || "—");
  lines.push("```");
  lines.push("");
  lines.push("## Findings");
  if (!snapshot.findings.length) lines.push("- none");
  else for (const finding of snapshot.findings) lines.push(`- ${finding}`);
  lines.push("");
  lines.push("## Diff");
  lines.push(...summarizeDiffForMarkdown(plan.diff));
  return lines.join("\n");
}

export function buildChangePlanJson(plan: ChangePlanDetail): string {
  return JSON.stringify({
    id: plan.id,
    module: plan.module,
    changeType: plan.changeType,
    deviceId: plan.deviceId,
    hostname: plan.hostname,
    status: plan.status,
    createdBy: plan.createdBy,
    ticketRef: plan.ticketRef,
    metadata: plan.metadata,
    snapshot: plan.snapshot,
    items: plan.items,
    diff: plan.diff,
    rollback: plan.rollback,
    beforeState: plan.beforeState,
    afterState: plan.afterState,
    createdAt: plan.createdAt,
    updatedAt: plan.updatedAt,
  }, null, 2);
}

export function snapshotSections(snapshot: ChangePlanSnapshotPayload) {
  return {
    peer: snapshot.peerIp ?? null,
    routePolicies: snapshot.routePolicies,
    prefixLists: snapshot.prefixLists,
    ipv6PrefixLists: snapshot.ipv6PrefixLists,
    communityFilters: snapshot.communityFilters,
    communityLists: snapshot.communityLists,
    asPathFilters: snapshot.asPathFilters,
    extcommunityFilters: snapshot.extcommunityFilters,
    globalPreserved: snapshot.globalPreserved,
  };
}
