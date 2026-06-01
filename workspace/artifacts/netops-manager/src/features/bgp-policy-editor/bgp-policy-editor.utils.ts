import type { CommunityLibraryItem, CommunitySet } from "@workspace/api-client-react";
import type { BgpPeerDrilldownResult } from "@/features/bgp-drilldown/types";
import type {
  BgpPolicyEditorBackendPreviewResponse,
  BgpPolicyEditorCommunityOption,
  BgpPolicyEditorCommunitySetOption,
  BgpPolicyEditorFinding,
  BgpPolicyEditorPolicy,
  BgpPolicyEditorPolicyNode,
  BgpPolicyEditorPreview,
  BgpPolicyEditorPreviewDiff,
  BgpPolicyEditorCommunityResolution,
} from "./bgp-policy-editor.types";

export const BGP_POLICY_EDITOR_ENABLED = true;

export function normalizeToken(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

export function normalizeCommunityName(value: string): string {
  return normalizeToken(value);
}

export function normalizeCommunityValue(value: string): string {
  return normalizeToken(value);
}

export function normalizeCommunityValues(values: string[]): string[] {
  return [...new Set(values.map(normalizeCommunityValue).filter(Boolean))].sort((left, right) => left.localeCompare(right, "pt", { sensitivity: "base" }));
}

export function buildNodeKey(policyName: string, sequence: number | null, index: number): string {
  return `${normalizeToken(policyName)}|${sequence ?? `idx-${index}`}`;
}

export function extractCommunityListFromMatches(matches: Array<{ type: string; name: string; raw: string }>): string | null {
  const found = matches.find((match) => match.type === "community-list");
  return found ? normalizeCommunityName(found.name) : null;
}

export function extractCommunityRefs(matches: Array<{ type: string; name: string; raw: string }>): string[] {
  return matches
    .filter((match) => match.type === "community-list")
    .map((match) => normalizeCommunityName(match.name));
}

export function extractAppliedCommunities(node: BgpPolicyEditorPolicyNode): string[] {
  const values = new Set<string>();
  for (const apply of node.applies) {
    const raw = apply.raw.trim();
    const match = /^apply\s+community\s+(.+)$/i.exec(raw);
    if (!match) continue;
    const payload = match[1]
      .replace(/\b(additive|overwrite|replace|none)\b/gi, "")
      .trim();
    if (!payload) continue;
    for (const token of payload.split(/[\s,]+/)) {
      const normalized = normalizeToken(token);
      if (normalized) values.add(normalized);
    }
  }
  return [...values];
}

export function nodeHasMeaningfulChange(original: string[], selected: string[]): boolean {
  const left = normalizeCommunityValues(original);
  const right = normalizeCommunityValues(selected);
  if (left.length !== right.length) return true;
  return left.some((value, index) => value !== right[index]);
}

export function resolveCommunitySelection(
  selectedCommunities: string[],
  availableCommunityLists: BgpPolicyEditorCommunitySetOption[] | null | undefined,
): BgpPolicyEditorCommunityResolution {
  const normalizedCommunities = normalizeCommunityValues(selectedCommunities);
  if (normalizedCommunities.length === 0) {
    return {
      matchedCommunityListName: null,
      isCustom: true,
      normalizedCommunities,
      confidence: "empty",
    };
  }

  const sets = availableCommunityLists ?? [];
  if (sets.length === 0) {
    return {
      matchedCommunityListName: null,
      isCustom: true,
      normalizedCommunities,
      confidence: "no-library",
    };
  }

  for (const set of sets) {
    const members = normalizeCommunityValues((set.members ?? []).map(normalizeCommunityValue));
    if (members.length !== normalizedCommunities.length) continue;
    const same = members.every((value, index) => value === normalizedCommunities[index]);
    if (same) {
      return {
        matchedCommunityListName: normalizeCommunityName(set.name),
        isCustom: false,
        normalizedCommunities,
        confidence: "exact",
      };
    }
  }

  return {
    matchedCommunityListName: null,
    isCustom: true,
    normalizedCommunities,
    confidence: "custom",
  };
}

export function buildNodePreviewText(
  node: BgpPolicyEditorPolicyNode,
  selectedCommunities: string[],
  matchedCommunityListName: string | null,
  isCustom: boolean,
  confidence: BgpPolicyEditorCommunityResolution["confidence"] = "custom",
): string {
  const lines: string[] = [];
  lines.push(node.sequence !== null ? `route-policy node ${node.sequence}` : "route-policy node ?");
  lines.push(`action: ${node.action ?? "—"}`);
  const matchSummary = node.matches.length
    ? node.matches.map((match) => `${match.type} ${match.name}`).join(" | ")
    : "—";
  lines.push(`if-match: ${matchSummary}`);
  lines.push(`apply community-list: ${matchedCommunityListName ?? "Customizado"}`);
  lines.push(`apply community values: ${selectedCommunities.length ? selectedCommunities.join(" ") : "—"}`);
  lines.push(`mode: ${isCustom ? "Customizado" : "Normalizado"}`);
  lines.push(`confidence: ${confidence}`);
  return lines.join("\n");
}

export function buildNodeLines(
  node: BgpPolicyEditorPolicyNode,
  selectedCommunities: string[],
  matchedCommunityListName: string | null,
  isCustom: boolean,
  confidence: BgpPolicyEditorCommunityResolution["confidence"] = "custom",
): string[] {
  return [
    `node ${node.sequence ?? "?"}`,
    `action ${node.action ?? "—"}`,
    `if-match ${node.matches.length ? node.matches.map((match) => `${match.type} ${normalizeCommunityName(match.name)}`).join(" | ") : "—"}`,
    `apply community-list ${matchedCommunityListName ?? "Customizado"}`,
    `apply community ${selectedCommunities.length ? normalizeCommunityValues(selectedCommunities).join(" ") : "—"}`,
    `mode ${isCustom ? "Customizado" : "Normalizado"}`,
    `confidence ${confidence}`,
  ];
}

export function diffLines(beforeLines: string[], afterLines: string[]): BgpPolicyEditorPreviewDiff {
  const before = beforeLines.map(normalizeToken);
  const after = afterLines.map(normalizeToken);
  const removedLines = before.filter((line) => !after.includes(line));
  const addedLines = after.filter((line) => !before.includes(line));
  return {
    beforeLines,
    afterLines,
    removedLines,
    addedLines,
    summary: `${removedLines.length} removidas, ${addedLines.length} adicionadas`,
  };
}

export function buildPolicyEditorPreviewRequest(input: {
  routePolicyName?: string | null;
  pendingEdits: Record<string, {
    key: string;
    selectedCommunities: string[];
  }>;
}): {
  routePolicyName: string | null;
  nodeEdits: Array<{ nodeId: string; selectedCommunities: string[] }>;
} {
  return {
    routePolicyName: input.routePolicyName ?? null,
    nodeEdits: Object.values(input.pendingEdits).map((edit) => ({
      nodeId: edit.key,
      selectedCommunities: normalizeCommunityValues(edit.selectedCommunities),
    })),
  };
}

export function comparePreviewSummaries(
  localPreview: BgpPolicyEditorPreview,
  backendPreview: BgpPolicyEditorBackendPreviewResponse,
): { driftDetected: boolean; driftSummary: string[] } {
  const driftSummary: string[] = [];
  const localNodes = new Map(localPreview.nodeEdits.map((node) => [node.nodeId, node]));
  const backendNodes = new Map(backendPreview.nodeEdits.map((node) => [node.nodeId, node]));

  if (localPreview.nodeEdits.length !== backendPreview.nodeEdits.length) {
    driftSummary.push(`node_count_diff local=${localPreview.nodeEdits.length} backend=${backendPreview.nodeEdits.length}`);
  }

  for (const [nodeId, localNode] of localNodes) {
    const backendNode = backendNodes.get(nodeId);
    if (!backendNode) {
      driftSummary.push(`community_resolution_diff missing_backend_node=${nodeId}`);
      continue;
    }

    const localCommunities = normalizeCommunityValues(localNode.selectedCommunities);
    const backendCommunities = normalizeCommunityValues(backendNode.selectedCommunities);
    if (JSON.stringify(localCommunities) !== JSON.stringify(backendCommunities)) {
      driftSummary.push(`community_resolution_diff node=${nodeId}`);
    }

    if ((localNode.matchedCommunityListName ?? null) !== (backendNode.matchedCommunityListName ?? null)) {
      driftSummary.push(`community_resolution_diff node=${nodeId} matchedCommunityListName`);
    }
  }

  const localCodes = [...new Set(localPreview.findings.map((finding) => finding.code))].sort();
  const backendCodes = [...new Set(backendPreview.findings.map((finding) => finding.code))].sort();
  if (JSON.stringify(localCodes) !== JSON.stringify(backendCodes)) {
    driftSummary.push(`finding_codes_diff local=${localCodes.join(",")} backend=${backendCodes.join(",")}`);
  }

  const localSafety = {
    applyDisabled: localPreview.safety.applyDisabled,
    rollbackDisabled: localPreview.safety.rollbackDisabled,
    dryRun: localPreview.safety.dryRun,
  };
  const backendSafety = {
    applyDisabled: backendPreview.safety.applyDisabled,
    rollbackDisabled: backendPreview.safety.rollbackDisabled,
    dryRun: backendPreview.safety.dryRun,
  };
  if (JSON.stringify(localSafety) !== JSON.stringify(backendSafety)) {
    driftSummary.push("safety_mismatch");
  }

  return {
    driftDetected: driftSummary.length > 0,
    driftSummary,
  };
}

export function buildBackendPreviewUnavailableFinding(message: string): BgpPolicyEditorFinding {
  return {
    code: "BACKEND_PREVIEW_UNAVAILABLE",
    severity: "warning",
    message,
    recommendation: "O shell usou o preview local como fallback sem aplicar nenhuma mudança.",
    blocking: false,
  };
}

export function buildPreviewDriftFinding(driftSummary: string[]): BgpPolicyEditorFinding {
  return {
    code: "PREVIEW_DRIFT_DETECTED",
    severity: "warning",
    message: "O preview backend divergiu do preview local.",
    recommendation: driftSummary.length > 0 ? driftSummary.join(" | ") : "Revise o drift antes de considerar qualquer ação futura.",
    blocking: false,
  };
}

export function buildCommunityOptions(items: CommunityLibraryItem[] | null | undefined): BgpPolicyEditorCommunityOption[] {
  const seen = new Set<string>();
  const options: BgpPolicyEditorCommunityOption[] = [];
  for (const item of items ?? []) {
    const value = normalizeToken(item.communityValue);
    if (!value || seen.has(value)) continue;
    seen.add(value);
    const label = item.filterName ? `${item.filterName} · ${value}` : value;
    options.push({ value, label, source: item.origin });
  }
  return options.sort((left, right) => left.value.localeCompare(right.value, "pt", { sensitivity: "base" }));
}

export function buildCommunitySetOptions(sets: CommunitySet[] | null | undefined): BgpPolicyEditorCommunitySetOption[] {
  return (sets ?? [])
    .map((set) => ({
      id: set.id,
      name: set.name,
      vrpObjectName: set.vrpObjectName,
      members: (set.members ?? [])
        .map((member) => normalizeToken(member.communityValue ?? ""))
        .filter(Boolean),
      status: set.status,
      description: set.description ?? null,
    }))
    .sort((left, right) => left.name.localeCompare(right.name, "pt", { sensitivity: "base" }));
}

export function findMatchingCommunitySet(
  selectedCommunities: string[],
  sets: BgpPolicyEditorCommunitySetOption[],
): BgpPolicyEditorCommunitySetOption | null {
  const selected = [...new Set(selectedCommunities.map(normalizeToken))].filter(Boolean).sort();
  if (!selected.length) return null;
  for (const set of sets) {
    const values = [...new Set(set.members.map(normalizeToken))].filter(Boolean).sort();
    if (values.length !== selected.length) continue;
    const same = values.every((value, index) => value === selected[index]);
    if (same) return set;
  }
  return null;
}

export function communitySelectionIsCustom(
  selectedCommunities: string[],
  sets: BgpPolicyEditorCommunitySetOption[],
): boolean {
  return findMatchingCommunitySet(selectedCommunities, sets) === null;
}

export function summariseNode(node: BgpPolicyEditorPolicyNode): string {
  const ifMatch = node.matches.length
    ? node.matches.map((match) => `${match.type} ${match.name}`).join(" | ")
    : "—";
  const applies = node.applies.length
    ? node.applies.map((apply) => apply.raw).join(" | ")
    : "—";
  return `if-match: ${ifMatch}\napply: ${applies}`;
}

export function getImportPolicies(drilldown: BgpPeerDrilldownResult | null | undefined): BgpPolicyEditorPolicy[] {
  return (drilldown?.policies ?? [])
    .filter((policy) => policy.direction === "import")
    .map((policy) => ({
      name: policy.name,
      direction: "import",
      afiSafi: policy.afiSafi,
      nodes: policy.nodes,
      dependencies: policy.dependencies,
      status: policy.status,
    }));
}

export function buildPolicyEditorPreview(input: {
  deviceId: number;
  deviceName: string;
  peerIp: string;
  peerRemoteAs: number | null;
  peerVrf: string | null;
  drilldown: BgpPeerDrilldownResult | null | undefined;
  communitySets: BgpPolicyEditorCommunitySetOption[];
  pendingEdits: Record<string, {
    key: string;
    policyName: string;
    afiSafi: string;
    sequence: number | null;
    original: BgpPolicyEditorPolicyNode;
    selectedCommunities: string[];
    matchedCommunityListName: string | null;
    isCustom: boolean;
    confidence: BgpPolicyEditorCommunityResolution["confidence"];
    changed: boolean;
    previewText: string;
  }>;
}): BgpPolicyEditorPreview {
  const importPolicies = getImportPolicies(input.drilldown ?? null);
  const routePolicyName = importPolicies[0]?.name ?? "—";
  const routePolicyFound = importPolicies.length > 0;
  const findings: BgpPolicyEditorFinding[] = [];
  const nodeEdits = importPolicies.flatMap((policy) =>
    policy.nodes.map((node, index) => {
      const key = buildNodeKey(policy.name, node.sequence, index);
      const pending = input.pendingEdits[key];
      const originalSelected = extractAppliedCommunities(node);
      const baseSelected = pending?.selectedCommunities ?? originalSelected;
      const beforeResolution = resolveCommunitySelection(originalSelected, input.communitySets);
      const resolved = resolveCommunitySelection(baseSelected, input.communitySets);
      const beforeLines = buildNodeLines(
        node,
        beforeResolution.normalizedCommunities,
        beforeResolution.matchedCommunityListName,
        beforeResolution.isCustom,
        beforeResolution.confidence,
      );
      const afterLines = buildNodeLines(
        node,
        resolved.normalizedCommunities,
        resolved.matchedCommunityListName,
        resolved.isCustom,
        resolved.confidence,
      );
      const diff = diffLines(beforeLines, afterLines);
      const action = (node.action ?? "").toLowerCase();
      const unsupportedReason = !action || !["permit", "deny"].includes(action)
        ? `action '${node.action ?? "—"}' não suportada`
        : null;

      if (resolved.confidence === "empty") {
        findings.push({
          code: "COMMUNITY_LIST_EMPTY",
          severity: "warning",
          message: `Node ${node.sequence ?? "?"} sem communities selecionadas.`,
          recommendation: "Selecione ao menos uma community para gerar um preview útil.",
          blocking: false,
        });
      } else if (resolved.confidence === "no-library") {
        findings.push({
          code: "COMMUNITY_LIST_NOT_FOUND",
          severity: "warning",
          message: `Nenhuma community-list disponível para ${policy.name}.`,
          recommendation: "Garanta que discovery/community sets do device estejam carregados.",
          blocking: false,
        });
      } else if (resolved.isCustom) {
        findings.push({
          code: "COMMUNITY_COMBINATION_CUSTOM",
          severity: "warning",
          message: `Combinação customizada no node ${node.sequence ?? "?"}.`,
          recommendation: "Se quiser padronizar, escolha uma community-list equivalente existente.",
          blocking: false,
        });
      } else {
        findings.push({
          code: "COMMUNITY_COMBINATION_MATCHED",
          severity: "info",
          message: `Combinação reconhecida como ${resolved.matchedCommunityListName}.`,
          recommendation: "Confira se a community-list encontrada é a esperada para este peer.",
          blocking: false,
        });
      }

      if (unsupportedReason) {
        findings.push({
          code: "NODE_UNSUPPORTED_ACTION",
          severity: "warning",
          message: `Node ${node.sequence ?? "?"} tem ação não suportada: ${node.action ?? "—"}.`,
          recommendation: "Revise o node antes de usar o preview normalizado.",
          blocking: false,
        });
      }

      return {
        nodeId: key,
        action: node.action,
        before: beforeLines.join("\n"),
        after: afterLines.join("\n"),
        selectedCommunities: resolved.normalizedCommunities,
        matchedCommunityListName: resolved.matchedCommunityListName,
        isCustom: resolved.isCustom,
        changed: diff.summary !== "0 removidas, 0 adicionadas",
        unsupportedReason,
        diff,
      };
    }),
  );
  const knownNodeKeys = new Set(nodeEdits.map((item) => item.nodeId));
  for (const key of Object.keys(input.pendingEdits)) {
    if (knownNodeKeys.has(key)) continue;
    findings.push({
      code: "NODE_NOT_FOUND",
      severity: "error",
      message: `Alteração local órfã para ${key}.`,
      recommendation: "Reabra o editor e recalcule o preview normalizado.",
      blocking: true,
    });
  }

  if (!routePolicyFound) {
    findings.push({
      code: "ROUTE_POLICY_NOT_FOUND",
      severity: "error",
      message: "Nenhuma route-policy de import encontrada no snapshot.",
      recommendation: "Confirme se o snapshot está completo ou se o peer tem policy de import.",
      blocking: true,
    });
    findings.push({
      code: "IMPORT_POLICY_NOT_BOUND",
      severity: "warning",
      message: "Nenhuma import policy está vinculada ao peer atual.",
      recommendation: "Verifique se o peer deveria herdar policy do grupo ou se a seleção está incompleta.",
      blocking: false,
    });
  }

  const collectedAt = input.drilldown?.collectedAt ? new Date(input.drilldown.collectedAt).getTime() : NaN;
  const stale = Number.isNaN(collectedAt) || Date.now() - collectedAt > 24 * 60 * 60 * 1000;
  if (stale) {
    findings.push({
      code: "SNAPSHOT_STALE",
      severity: "warning",
      message: "Snapshot local pode estar desatualizado para o preview normalizado.",
      recommendation: "Execute um novo snapshot antes de considerar qualquer ação futura.",
      blocking: false,
    });
  }

  findings.push({
    code: "APPLY_DISABLED",
    severity: "warning",
    message: "Apply real desabilitado nesta fase.",
    recommendation: "O preview normalizado é apenas local/read-only.",
    blocking: true,
  });
  findings.push({
    code: "ROLLBACK_DISABLED",
    severity: "warning",
    message: "Rollback real desabilitado nesta fase.",
    recommendation: "Rollback só poderá existir após um contrato de apply controlado.",
    blocking: true,
  });

  const changedNodeEdits = nodeEdits.filter((item) => item.changed);
  const aggregateBefore = nodeEdits.flatMap((item) => item.diff.beforeLines);
  const aggregateAfter = nodeEdits.flatMap((item) => item.diff.afterLines);

  return {
    peerContext: {
      deviceId: input.deviceId,
      deviceName: input.deviceName,
      peerIp: input.peerIp,
      peerRemoteAs: input.peerRemoteAs,
      peerVrf: input.peerVrf,
      snapshotId: input.drilldown?.snapshotId ?? null,
      collectedAt: input.drilldown?.collectedAt ?? null,
    },
    routePolicyName,
    direction: "import",
    nodeEdits,
    diff: diffLines(aggregateBefore, aggregateAfter),
    findings,
    safety: {
      applyDisabled: true,
      rollbackDisabled: true,
      dryRun: true,
      messages: [
        "Apply real desabilitado nesta fase.",
        "Rollback real desabilitado nesta fase.",
        "Dry-run only.",
      ],
    },
    previewSource: "local",
    backendError: null,
    driftDetected: false,
    driftSummary: [],
  };
}
