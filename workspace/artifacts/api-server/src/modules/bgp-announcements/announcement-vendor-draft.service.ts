import type { ParsedPolicyDependencyConfig } from "../netops/huawei-vrp/parsers/policy-dependency-pipeline.js";
import type {
  AnnouncementChangePreview,
  ChangePreviewActionType,
  DependencyProtection,
  ProposedCommandConfidence,
  ProposedCommandLine,
  ProposedCommandSet,
  ProposedCommandVendor,
} from "./bgp-announcement.types.js";

export type VendorDraftVendor = ProposedCommandVendor | "unsupported_vendor";

export interface VendorDraftBuildResult {
  vendor: VendorDraftVendor;
  proposedCommands: ProposedCommandSet[];
  warnings: string[];
  confidence: ProposedCommandConfidence;
}

const AUDIT_ONLY_ROLES = new Set(["provider", "upstream", "ix", "cdn"]);
const BLOCKED_DEPENDENCY_PROTECTIONS = new Set<DependencyProtection>(["protected_global", "protected_system"]);
const SUPPORTED_ACTIONS = new Set<ChangePreviewActionType>([
  "add_community",
  "remove_community",
  "block_announcement",
  "set_prepend",
  "clear_prepend",
]);

const HEADER_LINE = "# PROPOSTO - NAO EXECUTADO - REVISAR MANUALMENTE";
const SAFETY_WARNING = "Comandos propostos para documentação. Não executar sem revisão humana.";
const NO_EXEC_WARNING = "Nenhum comando foi executado pelo sistema.";
const HUMAN_REVIEW_NOTE = "Revisão manual obrigatória antes de qualquer uso fora do preview.";
const SPECIFIC_DEPENDENCY_SCOPES = new Set(["customer_specific", "circuit_specific"]);

function normalizeList(items: string[]): string[] {
  return [...new Set(items.map((item) => item.trim()).filter(Boolean))];
}

function communityDelta(preview: AnnouncementChangePreview): { added: string[]; removed: string[] } {
  const current = new Set(preview.currentState.communities);
  const proposed = new Set(preview.proposedState.communities);
  const added = [...proposed].filter((community) => !current.has(community));
  const removed = [...current].filter((community) => !proposed.has(community));
  return {
    added: normalizeList(added),
    removed: normalizeList(removed),
  };
}

function renderCommandLine(line: string, confidence: ProposedCommandConfidence, notes: string[]): ProposedCommandLine {
  return {
    line,
    kind: line.trim().startsWith("#") ? "comment" : "candidate",
    confidence,
    requiresHumanReview: true,
    notes,
  };
}

function makeCommandSet(input: {
  actionType: ChangePreviewActionType;
  commandSetName: string;
  confidence: ProposedCommandConfidence;
  commands: ProposedCommandLine[];
  warnings: string[];
}): ProposedCommandSet {
  return {
    vendor: "huawei_vrp",
    scope: "documental_only",
    safety: "not_executable",
    actionType: input.actionType,
    commandSetName: input.commandSetName,
    confidence: input.confidence,
    commands: input.commands,
    warnings: normalizeList([SAFETY_WARNING, NO_EXEC_WARNING, ...input.warnings]),
  };
}

function baseWarnings(preview: AnnouncementChangePreview): string[] {
  return [
    SAFETY_WARNING,
    NO_EXEC_WARNING,
    HUMAN_REVIEW_NOTE,
    ...(preview.proposedCommandsWarnings ?? []),
  ];
}

function blockedTargetWarning(preview: AnnouncementChangePreview): string | null {
  if (preview.targetRole && AUDIT_ONLY_ROLES.has(preview.targetRole)) {
    return `targetRole=${preview.targetRole} é audit-only; proposedCommands não gerado.`;
  }
  if (preview.dependencyProtection && BLOCKED_DEPENDENCY_PROTECTIONS.has(preview.dependencyProtection)) {
    return `dependencyProtection=${preview.dependencyProtection} bloqueia proposedCommands.`;
  }
  if (preview.riskAssessment.blocked || preview.validation.status === "blocked") {
    return "Preview bloqueado; proposedCommands não gerado.";
  }
  return null;
}

function buildAddCommunitySet(preview: AnnouncementChangePreview): ProposedCommandSet | null {
  if (!preview.dependencyScope || !SPECIFIC_DEPENDENCY_SCOPES.has(preview.dependencyScope)) {
    return null;
  }
  const { added } = communityDelta(preview);
  if (added.length === 0) return null;

  const commandLines = [
    renderCommandLine(HEADER_LINE, "medium", ["Linha de cabeçalho documental."]),
    renderCommandLine(
      `# Huawei VRP: route-policy ${preview.targetName} adicionar community(s): ${added.join(", ")}`,
      "medium",
      [
        `Target ${preview.targetName} (${preview.targetRole})`,
        `Escopo: ${preview.dependencyScope ?? "unknown"}`,
        "Ajuste documental somente.",
      ],
    ),
  ];

  const confidence: ProposedCommandConfidence = preview.dependencyScope === "customer_specific" || preview.dependencyScope === "circuit_specific"
    ? "high"
    : "medium";

  return makeCommandSet({
    actionType: preview.actionType,
    commandSetName: "BGP announcement proposed change",
    confidence,
    commands: commandLines,
    warnings: [
      preview.dependencyReason ? `dependencyReason: ${preview.dependencyReason}` : "",
      "Remoção/adição de community é apenas documental nesta fase.",
    ].filter(Boolean),
  });
}

function buildRemoveCommunitySet(preview: AnnouncementChangePreview): ProposedCommandSet | null {
  if (!preview.dependencyScope || !SPECIFIC_DEPENDENCY_SCOPES.has(preview.dependencyScope)) {
    return null;
  }
  const { removed } = communityDelta(preview);
  if (removed.length === 0) return null;
  if (preview.dependencyProtection === "protected_global" || preview.dependencyProtection === "protected_system") {
    return null;
  }

  const commandLines = [
    renderCommandLine(HEADER_LINE, "medium", ["Linha de cabeçalho documental."]),
    renderCommandLine(
      `# Huawei VRP: route-policy ${preview.targetName} remover community(s): ${removed.join(", ")}`,
      "medium",
      [
        `Target ${preview.targetName} (${preview.targetRole})`,
        `Escopo: ${preview.dependencyScope ?? "unknown"}`,
        "Somente se a dependência for customer/circuit specific.",
      ],
    ),
  ];

  const confidence: ProposedCommandConfidence = preview.dependencyScope === "customer_specific" || preview.dependencyScope === "circuit_specific"
    ? "high"
    : "medium";

  return makeCommandSet({
    actionType: preview.actionType,
    commandSetName: "BGP announcement proposed change",
    confidence,
    commands: commandLines,
    warnings: [
      preview.dependencyReason ? `dependencyReason: ${preview.dependencyReason}` : "",
      "Não sugerir remoção de community-filter global.",
    ].filter(Boolean),
  });
}

function buildBlockAnnouncementSet(preview: AnnouncementChangePreview): ProposedCommandSet | null {
  const targetScope = preview.targetEditMode === "editable_future" && (preview.targetRole === "customer" || preview.targetRole === "origin");
  if (!targetScope || !preview.dependencyScope || !SPECIFIC_DEPENDENCY_SCOPES.has(preview.dependencyScope)) return null;

  const commandLines = [
    renderCommandLine(HEADER_LINE, "medium", ["Linha de cabeçalho documental."]),
    renderCommandLine(
      `# Huawei VRP: route-policy ${preview.targetName} bloquear anúncio do target ${preview.targetRole} via upstream ${preview.upstreamCircuitId ?? "—"}`,
      "medium",
      [
        `Target ${preview.targetName} (${preview.targetRole})`,
        "Apenas documentação para implementação manual.",
      ],
    ),
  ];

  return makeCommandSet({
    actionType: preview.actionType,
    commandSetName: "BGP announcement proposed change",
    confidence: "medium",
    commands: commandLines,
    warnings: ["block_announcement não executa nada automaticamente."],
  });
}

function buildSetPrependSet(preview: AnnouncementChangePreview): ProposedCommandSet | null {
  const prepend = preview.proposedState.prependCounts[preview.upstreamCircuitId ?? ""];
  if (typeof prepend !== "number" || prepend < 1) return null;

  const confidence: ProposedCommandConfidence = preview.dependencyScope && SPECIFIC_DEPENDENCY_SCOPES.has(preview.dependencyScope)
    ? "medium"
    : "low";
  const commandLines = [
    renderCommandLine(HEADER_LINE, confidence, ["Linha de cabeçalho documental."]),
    renderCommandLine(
      `# Huawei VRP: route-policy ${preview.targetName} aplicar as-path prepend x${prepend} no upstream ${preview.upstreamCircuitId ?? "—"}`,
      confidence,
      [
        `Target ${preview.targetName} (${preview.targetRole})`,
        `Escopo: ${preview.dependencyScope ?? "unknown"}`,
        "Pseudo-comando comentado; revisão manual obrigatória.",
      ],
    ),
  ];

  return makeCommandSet({
    actionType: preview.actionType,
    commandSetName: "BGP announcement prepend proposed change",
    confidence,
    commands: commandLines,
    warnings: [
      preview.dependencyReason ? `dependencyReason: ${preview.dependencyReason}` : "",
      "Pseudo-comando comentado: a implementação final continua humana.",
    ].filter(Boolean),
  });
}

function buildClearPrependSet(preview: AnnouncementChangePreview): ProposedCommandSet | null {
  const before = preview.currentState.prependCounts[preview.upstreamCircuitId ?? ""];
  if (typeof before !== "number") return null;

  const confidence: ProposedCommandConfidence = before > 0 && preview.dependencyScope && SPECIFIC_DEPENDENCY_SCOPES.has(preview.dependencyScope)
    ? "medium"
    : "low";
  const commandLines = [
    renderCommandLine(HEADER_LINE, confidence, ["Linha de cabeçalho documental."]),
    renderCommandLine(
      `# Huawei VRP: route-policy ${preview.targetName} remover prepend do upstream ${preview.upstreamCircuitId ?? "—"} (before=${before})`,
      confidence,
      [
        `Target ${preview.targetName} (${preview.targetRole})`,
        `prepend atual: ${before}`,
        "Pseudo-comando comentado; revisão manual obrigatória.",
      ],
    ),
  ];

  return makeCommandSet({
    actionType: preview.actionType,
    commandSetName: "BGP announcement prepend proposed change",
    confidence,
    commands: commandLines,
    warnings: [
      preview.dependencyReason ? `dependencyReason: ${preview.dependencyReason}` : "",
      "clear_prepend só gera proposta documental quando o before é conhecido.",
    ].filter(Boolean),
  });
}

export function buildVendorDraftProposedCommands(input: {
  preview: AnnouncementChangePreview;
  parsedConfig?: ParsedPolicyDependencyConfig | null;
}): VendorDraftBuildResult {
  const { preview, parsedConfig } = input;
  const vendor: VendorDraftVendor = parsedConfig ? "huawei_vrp" : "unsupported_vendor";
  const warnings = baseWarnings(preview);

  if (vendor === "unsupported_vendor") {
    return {
      vendor,
      proposedCommands: [],
      warnings: normalizeList([
        ...warnings,
        "unsupported_vendor: vendor não suportado para proposedCommands.",
      ]),
      confidence: "low",
    };
  }

  const blockedWarning = blockedTargetWarning(preview);
  if (blockedWarning) {
    return {
      vendor,
      proposedCommands: [],
      warnings: normalizeList([...warnings, blockedWarning]),
      confidence: "low",
    };
  }

  if (!SUPPORTED_ACTIONS.has(preview.actionType)) {
    return {
      vendor,
      proposedCommands: [],
      warnings: normalizeList([...warnings, `unsupported_action: ${preview.actionType}`]),
      confidence: "low",
    };
  }

  if (preview.dependencyProtection === "protected_system") {
    return {
      vendor,
      proposedCommands: [],
      warnings: normalizeList([...warnings, "protected_system nunca gera proposedCommands."]),
      confidence: "low",
    };
  }

  const proposedCommands: ProposedCommandSet[] = [];
  if (preview.actionType === "add_community") {
    const set = buildAddCommunitySet(preview);
    if (set) proposedCommands.push(set);
  } else if (preview.actionType === "remove_community") {
    const set = buildRemoveCommunitySet(preview);
    if (set) proposedCommands.push(set);
  } else if (preview.actionType === "block_announcement") {
    const set = buildBlockAnnouncementSet(preview);
    if (set) proposedCommands.push(set);
  } else if (preview.actionType === "set_prepend") {
    const set = buildSetPrependSet(preview);
    if (set) proposedCommands.push(set);
  } else if (preview.actionType === "clear_prepend") {
    const before = preview.currentState.prependCounts[preview.upstreamCircuitId ?? ""];
    if (typeof before !== "number") {
      warnings.push("clear_prepend sem before conhecido; proposedCommands não gerado.");
    }
    const set = buildClearPrependSet(preview);
    if (set) proposedCommands.push(set);
  }

  const confidence = proposedCommands[0]?.confidence ?? "low";
  const warningsOut = proposedCommands.flatMap((set) => set.warnings);
  if (proposedCommands.length === 0) {
    warningsOut.push("Condições insuficientes para gerar proposedCommands documentais.");
  }

  return {
    vendor,
    proposedCommands,
    warnings: normalizeList([...warnings, ...warningsOut]),
    confidence,
  };
}

export function flattenProposedCommands(proposedCommands: ProposedCommandSet[]): string[] {
  const lines: string[] = [];
  for (const set of proposedCommands) {
    lines.push(`## ${set.commandSetName}`);
    lines.push(`- vendor: ${set.vendor}`);
    lines.push(`- scope: ${set.scope}`);
    lines.push(`- safety: ${set.safety}`);
    lines.push(`- actionType: ${set.actionType}`);
    lines.push(`- confidence: ${set.confidence}`);
    if (set.warnings.length > 0) {
      lines.push("- warnings:");
      for (const warning of set.warnings) lines.push(`  - ${warning}`);
    }
    lines.push("- commands:");
    for (const command of set.commands) {
      lines.push(`  - ${command.line}`);
    }
    lines.push("");
  }
  return lines;
}

export function formatProposedCommandsMarkdown(input: {
  proposedCommands: ProposedCommandSet[];
  warnings?: string[];
}): string[] {
  const lines: string[] = [
    "## Comandos Propostos / Não Executados",
    "",
  ];

  if (input.proposedCommands.length > 0) {
    for (const set of input.proposedCommands) {
      lines.push(`- **Vendor:** ${set.vendor}`);
      lines.push(`- **Scope:** ${set.scope}`);
      lines.push(`- **Safety:** ${set.safety}`);
      lines.push(`- **Confidence:** ${set.confidence}`);
      lines.push(`- **Action:** ${set.actionType}`);
      lines.push(`- **Command set:** ${set.commandSetName}`);
      lines.push("- **Commands:**");
      for (const command of set.commands) {
        lines.push(`  - ${command.line}`);
      }
      if (set.warnings.length > 0) {
        lines.push("- **Set warnings:**");
        for (const warning of set.warnings) {
          lines.push(`  - ${warning}`);
        }
      }
      lines.push("");
    }
  } else {
    lines.push("- (nenhum comando proposto)");
    lines.push("");
  }

  const warnings = normalizeList([...(input.warnings ?? [])]);
  if (warnings.length > 0) {
    lines.push("### Warnings");
    for (const warning of warnings) lines.push(`- ${warning}`);
    lines.push("");
  }

  lines.push("### Confirmacao");
  lines.push("- Nenhum comando foi executado.");
  lines.push("- Estes comandos são proposta documental para revisão humana.");
  lines.push("- Não colar em produção sem validação manual.");
  return lines;
}

export function formatProposedCommandsClipboardText(input: {
  proposedCommands: ProposedCommandSet[];
  warnings?: string[];
}): string {
  return formatProposedCommandsMarkdown(input).join("\n");
}
