import type {
  ChangePreviewLogicalDiffItem,
  ChangePreviewPrependDiffEntry,
  ChangePreviewState,
  ChangePreviewValidation,
  MatrixRow,
} from "./bgp-announcement.types.js";
import { PREPEND_COUNT_MAX, PREPEND_COUNT_MIN } from "./bgp-announcement.types.js";

export function detectPrependForUpstream(row: MatrixRow, upstreamCircuitId: string): number | null | "unknown" {
  const cell = row.cells.find((item) => item.circuitId === upstreamCircuitId);
  if (!cell) return "unknown";
  return cell.prependCount ?? null;
}

export function validatePrependCount(prependCount: number | undefined): ChangePreviewValidation {
  if (prependCount == null || Number.isNaN(prependCount)) {
    return {
      status: "blocked",
      ok: false,
      errors: ["prependCount obrigatório para set_prepend (inteiro entre 1 e 10)."],
      warnings: [],
    };
  }
  if (!Number.isInteger(prependCount)) {
    return {
      status: "blocked",
      ok: false,
      errors: ["prependCount deve ser inteiro."],
      warnings: [],
    };
  }
  if (prependCount < PREPEND_COUNT_MIN || prependCount > PREPEND_COUNT_MAX) {
    return {
      status: "blocked",
      ok: false,
      errors: [`prependCount deve estar entre ${PREPEND_COUNT_MIN} e ${PREPEND_COUNT_MAX}.`],
      warnings: [],
    };
  }
  return { status: "ok", ok: true, errors: [], warnings: [] };
}

export function buildSetPrependProposedState(
  current: ChangePreviewState,
  upstreamCircuitId: string,
  prependCount: number,
): ChangePreviewState {
  return {
    ...current,
    prependCounts: {
      ...current.prependCounts,
      [upstreamCircuitId]: prependCount,
    },
    notes: [
      ...current.notes,
      `C${upstreamCircuitId}: prepend ${current.prependCounts[upstreamCircuitId] ?? "none"} → ${prependCount}`,
    ],
  };
}

export function buildClearPrependProposedState(
  current: ChangePreviewState,
  upstreamCircuitId: string,
): ChangePreviewState {
  return {
    ...current,
    prependCounts: {
      ...current.prependCounts,
      [upstreamCircuitId]: null,
    },
    notes: [
      ...current.notes,
      `C${upstreamCircuitId}: prepend ${current.prependCounts[upstreamCircuitId] ?? "unknown"} → none`,
    ],
  };
}

export function buildPrependStructuredDiff(input: {
  operation: "set_prepend" | "clear_prepend";
  row: MatrixRow;
  upstreamCircuitId: string;
  beforePrepend: number | null | "unknown";
  afterPrepend: number | null;
}): ChangePreviewPrependDiffEntry {
  const explanation = input.operation === "set_prepend"
    ? `Preview lógico para aplicar prepend ${input.afterPrepend}x no anúncio do cliente/origin para o upstream C${input.upstreamCircuitId} selecionado.`
    : `Preview lógico para remover prepend do anúncio do cliente/origin para o upstream C${input.upstreamCircuitId} selecionado.`;

  return {
    operation: input.operation,
    targetId: input.row.targetKey,
    targetName: input.row.routePolicyName,
    upstreamCircuitId: input.upstreamCircuitId,
    before: { prepend: input.beforePrepend },
    after: { prepend: input.afterPrepend },
    explanation,
  };
}

export function buildPrependLogicalDiff(
  structured: ChangePreviewPrependDiffEntry,
): ChangePreviewLogicalDiffItem[] {
  const beforeLabel = structured.before.prepend === "unknown"
    ? "unknown"
    : structured.before.prepend == null
      ? "none"
      : String(structured.before.prepend);
  const afterLabel = structured.after.prepend == null ? "none" : String(structured.after.prepend);

  return [
    structured,
    `C${structured.upstreamCircuitId} prepend: ${beforeLabel} → ${afterLabel}`,
    structured.explanation,
  ];
}

export function buildSetPrependRiskHints(input: {
  row: MatrixRow;
  upstreamCircuitId: string;
  prependCount: number;
  upstreamCount: number;
}): string[] {
  const hints = [
    "Prepend altera preferência de saída/entrada conforme política do upstream — preview lógico apenas.",
    "Validar se o upstream aceita AS-PATH prepend antes de qualquer implementação manual.",
    "Validar se Local-AS, replace-as ou allowas-in não interferem na política de prepend.",
    "Mudança é documental e exige implementação manual — nenhum comando vendor é gerado nesta fase.",
  ];
  if (input.upstreamCount > 1) {
    hints.push("Validar se há múltiplos upstreams anunciando o mesmo prefixo — impacto pode ser assimétrico.");
  }
  if (input.row.dependencyScope === "global_shared") {
    hints.push("Dependência compartilhada detectada — revisar impacto em outros consumidores.");
  }
  return hints;
}

export function buildClearPrependRiskHints(input: {
  row: MatrixRow;
  hadPrepend: boolean;
}): string[] {
  const hints = [
    "Remoção de prepend pode aumentar preferência do caminho — preview lógico apenas.",
    "Validar se não há engenharia de tráfego ativa antes de implementação manual.",
    "Validar impacto em redundância e balanceamento entre upstreams.",
    "Mudança é documental e exige implementação manual — nenhum comando vendor é gerado nesta fase.",
  ];
  if (!input.hadPrepend) {
    hints.push("Nenhum prepend detectável no snapshot — operação documental/no-op; confirmar estado real no equipamento.");
  }
  if (input.row.dependencyScope === "global_shared") {
    hints.push("Dependência compartilhada detectada — revisar impacto em outros consumidores.");
  }
  return hints;
}

export function buildPrependTicketSection(preview: {
  actionType: "set_prepend" | "clear_prepend";
  targetName: string;
  targetRole: string;
  upstreamCircuitId: string | null;
  currentState: ChangePreviewState;
  proposedState: ChangePreviewState;
  structured?: ChangePreviewPrependDiffEntry | null;
  riskHints: string[];
}): string[] {
  const upstream = preview.upstreamCircuitId ? `C${preview.upstreamCircuitId}` : "—";
  const detectedBefore = preview.structured?.before.prepend
    ?? (preview.upstreamCircuitId
      ? preview.currentState.prependCounts[preview.upstreamCircuitId]
      : null)
    ?? "unknown";
  const proposedAfter = preview.structured?.after.prepend
    ?? (preview.upstreamCircuitId
      ? preview.proposedState.prependCounts[preview.upstreamCircuitId]
      : null);

  return [
    "## Prepend / AS-PATH",
    "",
    `- **Ação:** ${preview.actionType}`,
    `- **Target Cliente/ORIGIN:** ${preview.targetName} (${preview.targetRole})`,
    `- **Upstream selecionado:** ${upstream}`,
    `- **Valor atual detectado:** ${detectedBefore === "unknown" ? "unknown" : detectedBefore ?? "none"}`,
    `- **Valor proposto:** ${proposedAfter ?? "none"}`,
    "",
    "### Riscos operacionais",
    ...preview.riskHints.map((hint) => `- ${hint}`),
    "",
    "### Confirmação",
    "- Nenhum comando foi executado.",
    "- Preview lógico/documental. Implementação deve ser manual ou por fase futura aprovada.",
    "",
  ];
}

export function logicalDiffItemsToStrings(items: ChangePreviewLogicalDiffItem[]): string[] {
  return items.map((item) => {
    if (typeof item === "string") return item;
    return JSON.stringify(item);
  });
}
