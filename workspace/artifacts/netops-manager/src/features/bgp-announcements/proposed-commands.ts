import type { ProposedCommandConfidence, ProposedCommandSet } from "./announcement-types";

export function proposedCommandConfidenceLabel(confidence: ProposedCommandConfidence): string {
  if (confidence === "high") return "High";
  if (confidence === "medium") return "Medium";
  return "Low";
}

export function formatProposedCommandsClipboardText(input: {
  proposedCommands: ProposedCommandSet[];
  warnings?: string[];
}): string {
  const lines: string[] = [
    "## Comandos Propostos / Não Executados",
    "",
  ];

  if (input.proposedCommands.length === 0) {
    lines.push("- (nenhum comando proposto)");
  } else {
    for (const set of input.proposedCommands) {
      lines.push(`- vendor: ${set.vendor}`);
      lines.push(`- scope: ${set.scope}`);
      lines.push(`- safety: ${set.safety}`);
      lines.push(`- confidence: ${set.confidence}`);
      lines.push(`- actionType: ${set.actionType}`);
      lines.push(`- commandSetName: ${set.commandSetName}`);
      lines.push("- commands:");
      for (const command of set.commands) {
        lines.push(`  - ${command.line}`);
      }
      if (set.warnings.length > 0) {
        lines.push("- set warnings:");
        for (const warning of set.warnings) lines.push(`  - ${warning}`);
      }
    }
  }

  const warnings = input.warnings ?? [];
  if (warnings.length > 0) {
    lines.push("");
    lines.push("### Warnings");
    for (const warning of warnings) lines.push(`- ${warning}`);
  }

  lines.push("");
  lines.push("### Confirmacao");
  lines.push("- Nenhum comando foi executado.");
  lines.push("- Estes comandos são proposta documental para revisão humana.");
  lines.push("- Não colar em produção sem validação manual.");
  return lines.join("\n");
}
