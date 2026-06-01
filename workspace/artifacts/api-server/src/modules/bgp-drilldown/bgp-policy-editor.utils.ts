import type { BgpPeerDrilldownResult } from "./bgp-peer-drilldown.types.js";
import type {
  BgpPolicyEditorCommunityResolution,
  BgpPolicyEditorCommunitySetOption,
  BgpPolicyEditorDiff,
  BgpPolicyEditorFinding,
  BgpPolicyEditorNodeEdit,
  BgpPolicyEditorNodePreview,
  BgpPolicyEditorPolicy,
  BgpPolicyEditorPreviewResponse,
} from "./bgp-policy-editor.types.js";

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

export function extractAppliedCommunities(node: { applies: Array<{ type: string; raw: string }> }): string[] {
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
      matchedCommunitySetName: null,
      isCustom: true,
      normalizedCommunities,
      confidence: "empty",
    };
  }

  const sets = availableCommunityLists ?? [];
  if (sets.length === 0) {
    return {
      matchedCommunityListName: null,
      matchedCommunitySetName: null,
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
        matchedCommunitySetName: normalizeCommunityName(set.vrpObjectName),
        isCustom: false,
        normalizedCommunities,
        confidence: "exact",
      };
    }
  }

  return {
    matchedCommunityListName: null,
    matchedCommunitySetName: null,
    isCustom: true,
    normalizedCommunities,
    confidence: "custom",
  };
}

export function buildNodeLines(
  node: { sequence: number | null; action: string | null; matches: Array<{ type: string; name: string; raw: string }> },
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

export function diffLines(beforeLines: string[], afterLines: string[]): BgpPolicyEditorDiff {
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

export function buildNodePreviewText(
  node: { sequence: number | null; action: string | null; matches: Array<{ type: string; name: string; raw: string }> },
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
  pendingEdits: Record<string, BgpPolicyEditorNodeEdit>;
  routePolicyName?: string | null;
}): BgpPolicyEditorPreviewResponse {
  const importPolicies = getImportPolicies(input.drilldown ?? null);
  const requestedRoutePolicy = input.routePolicyName ? normalizeCommunityName(input.routePolicyName) : null;
  const routePolicy = requestedRoutePolicy
    ? importPolicies.find((policy) => normalizeCommunityName(policy.name) === requestedRoutePolicy) ?? null
    : importPolicies[0] ?? null;
  const routePolicyName = normalizeCommunityName(routePolicy?.name ?? requestedRoutePolicy ?? "—");
  const routePolicyFound = Boolean(routePolicy);
  const findings: BgpPolicyEditorFinding[] = [];

  if (importPolicies.length === 0) {
    findings.push({
      code: "IMPORT_POLICY_NOT_BOUND",
      severity: "warning",
      message: "Nenhuma import policy está vinculada ao peer atual.",
      recommendation: "Verifique se o peer deveria herdar policy do grupo ou se a seleção está incompleta.",
      blocking: false,
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
  }

  const nodeEdits: BgpPolicyEditorNodePreview[] = [];

  if (routePolicy) {
    for (const [index, node] of routePolicy.nodes.entries()) {
      const nodeId = buildNodeKey(routePolicy.name, node.sequence, index);
      const pending = input.pendingEdits[nodeId];
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

      const originalCommunityList = extractCommunityListFromMatches(node.matches);
      if (originalCommunityList) {
        const normalizedOriginal = normalizeCommunityName(originalCommunityList);
        const matchedOriginalSet = input.communitySets.find((set) =>
          normalizeCommunityName(set.name) === normalizedOriginal || normalizeCommunityName(set.vrpObjectName) === normalizedOriginal);
        if (!matchedOriginalSet) {
          findings.push({
            code: "COMMUNITY_LIST_NOT_FOUND",
            severity: "warning",
            message: `Community-list ${originalCommunityList} não encontrada no snapshot/community sets carregados.`,
            recommendation: "Confirme se o catálogo de community-lists do device foi coletado antes de considerar alterações futuras.",
            blocking: false,
          });
        } else if ((matchedOriginalSet.members ?? []).length === 0) {
          findings.push({
            code: "COMMUNITY_LIST_EMPTY",
            severity: "warning",
            message: `Community-list ${matchedOriginalSet.name} está vazia.`,
            recommendation: "Adicione members à community-list ou escolha uma lista equivalente com members válidos.",
            blocking: false,
          });
        }
      }

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
          message: `Nenhuma community-list disponível para ${routePolicy.name}.`,
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

      nodeEdits.push({
        nodeId,
        policyName: routePolicy.name,
        sequence: node.sequence,
        action: node.action,
        before: beforeLines.join("\n"),
        after: afterLines.join("\n"),
        selectedCommunities: resolved.normalizedCommunities,
        matchedCommunityListName: resolved.matchedCommunityListName,
        matchedCommunitySetName: resolved.matchedCommunitySetName,
        isCustom: resolved.isCustom,
        changed: diff.summary !== "0 removidas, 0 adicionadas",
        unsupportedReason,
        diff,
      });
    }
  }

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

  const aggregateBefore = nodeEdits.flatMap((item) => item.diff.beforeLines);
  const aggregateAfter = nodeEdits.flatMap((item) => item.diff.afterLines);

  return {
    contractVersion: "bgp-policy-editor-preview-v1",
    previewSource: "backend",
    deviceId: input.deviceId,
    deviceName: input.deviceName,
    peer: input.peerIp,
    peerContext: {
      deviceId: input.deviceId,
      deviceName: input.deviceName,
      peerIp: input.peerIp,
      peerRemoteAs: input.peerRemoteAs,
      peerVrf: input.peerVrf,
      snapshotId: input.drilldown?.snapshotId ?? null,
      collectedAt: input.drilldown?.collectedAt ?? null,
    },
    routePolicyName: routePolicy?.name ?? routePolicyName,
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
  };
}
