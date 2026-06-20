import type {
  CopilotAnnouncementMatch,
  CopilotCircuitMatch,
  CopilotConfigHint,
  CopilotEvidence,
  CopilotIntent,
  CopilotPeerAggregate,
  CopilotPeerMatch,
  CopilotResponseMode,
} from "./copilot.types.js";

function formatUptime(uptime: string | null): string {
  if (!uptime) return "uptime indisponivel no snapshot";
  const seconds = Number(uptime);
  if (!Number.isFinite(seconds) || seconds <= 0) return uptime;
  const days = Math.floor(seconds / 86_400);
  const hours = Math.floor((seconds % 86_400) / 3600);
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h`;
  return `${Math.floor(seconds / 60)}min`;
}

function summarizePeer(peer: CopilotPeerMatch): string {
  const prefixes = [
    peer.receivedPrefixes != null ? `recebidos=${peer.receivedPrefixes}` : null,
    peer.advertisedPrefixes != null ? `anunciados=${peer.advertisedPrefixes}` : null,
  ].filter(Boolean).join(", ");

  return [
    `**${peer.deviceHostname}** · ${peer.peerIp}`,
    peer.remoteAs != null ? `AS${peer.remoteAs}` : null,
    peer.vrf ? `VRF ${peer.vrf}` : null,
    `estado **${peer.state}**`,
    formatUptime(peer.uptime),
    prefixes ? `prefixos (${prefixes})` : "contagem de prefixos nao disponivel via SNMP",
    peer.exportPolicy ? `export-policy \`${peer.exportPolicy}\`` : null,
    peer.importPolicy ? `import-policy \`${peer.importPolicy}\`` : null,
  ].filter(Boolean).join(" · ");
}

function summarizeAggregate(aggregate: CopilotPeerAggregate): string {
  const deviceLines = aggregate.devices.map((device) => {
    return `  - ${device.deviceHostname}: **${device.state}**${device.uptime ? ` (${formatUptime(device.uptime)})` : ""}`;
  });

  return [
    `**${aggregate.peerIp}**${aggregate.remoteAs != null ? ` AS${aggregate.remoteAs}` : ""}${aggregate.vrf ? ` · VRF ${aggregate.vrf}` : ""}`,
    `Consolidado: ${aggregate.establishedCount}/${aggregate.devices.length} Established`,
    ...deviceLines,
  ].join("\n");
}

function scopeHeader(evidence: CopilotEvidence): string | null {
  if (evidence.scope.deviceCount <= 1) return null;
  const hosts = evidence.scope.deviceHostnames.slice(0, 6).join(", ");
  const tail = evidence.scope.deviceCount > 6 ? ` +${evidence.scope.deviceCount - 6}` : "";
  return `Escopo **${evidence.scope.label}** (${evidence.scope.deviceCount} devices: ${hosts}${tail}).`;
}

function composePeeringAnswer(evidence: CopilotEvidence): string {
  const { peers, peerAggregates, notes } = evidence;
  const header = scopeHeader(evidence);

  if (peers.length === 0) {
    return [
      header,
      "Nao encontrei peers BGP que correspondam a pergunta no inventario atual.",
      "Verifique se a coleta SNMP recente foi executada e se o peer esta na VRF correta (ex.: CDN).",
      ...notes,
    ].filter(Boolean).join("\n\n");
  }

  const established = peers.filter((peer) => peer.state === "Established");
  const parts: string[] = [];

  if (header) parts.push(header);

  if (peerAggregates.length > 0 && evidence.scope.deviceCount > 1) {
    parts.push(
      peerAggregates.length === 1
        ? "Visao consolidada (mesma empresa):"
        : `Visao consolidada — ${peerAggregates.length} peer(s) unicos em ${evidence.scope.deviceCount} devices:`,
      ...peerAggregates.slice(0, 6).map((aggregate) => summarizeAggregate(aggregate)),
    );
  } else {
    parts.push(
      peers.length === 1
        ? "Encontrei 1 sessao BGP relacionada:"
        : `Encontrei ${peers.length} sessoes BGP relacionadas (${established.length} Established):`,
      ...peers.slice(0, 8).map((peer) => `- ${summarizePeer(peer)}`),
    );
    if (peers.length > 8) parts.push(`... e mais ${peers.length - 8} sessao(oes).`);
  }

  if (notes.length > 0) parts.push(...notes);
  return parts.join("\n\n");
}

function composeAnnouncementAnswer(rows: CopilotAnnouncementMatch[], notes: string[], evidence: CopilotEvidence): string {
  const header = scopeHeader(evidence);
  if (rows.length === 0) {
    return [
      header,
      "Nao encontrei anuncios/policies na matriz de BGP Announcements para os termos informados.",
      "Confirme se o discovery/config bundle do device esta atualizado.",
      ...notes,
    ].filter(Boolean).join("\n\n");
  }

  const lines = rows.slice(0, 8).map((row) => {
    const prefixes = row.affectedPrefixes.length > 0
      ? row.affectedPrefixes.join(", ")
      : "prefixos nao expandidos no snapshot";
    return `- **${row.deviceHostname}** · policy \`${row.routePolicyName}\` (${row.family}/${row.targetType}) · ${prefixes} · upstreams: ${row.upstreamSummary || "—"}`;
  });

  return [
    header,
    `Encontrei ${rows.length} alvo(s) na matriz de anuncios:`,
    ...lines,
    ...notes,
  ].filter(Boolean).join("\n");
}

function composeNetboxAnswer(matches: CopilotEvidence["netboxMatches"], summary: CopilotEvidence["netboxSummary"], notes: string[], evidence: CopilotEvidence): string {
  const header = scopeHeader(evidence);
  if (matches.length === 0) {
    return [
      header,
      "Nenhum device NetBox correspondente no escopo (preview read-only).",
      summary
        ? `Remoto: ${summary.totalFromNetBox} devices · create=${summary.toCreate} update=${summary.toUpdate} skip=${summary.toSkip} · readiness=${summary.readiness}`
        : null,
      ...notes,
    ].filter(Boolean).join("\n\n");
  }

  const lines = matches.slice(0, 12).map((row) => {
    const local = row.localDeviceId != null ? `local#${row.localDeviceId}` : "sem match local";
    return `- **${row.hostname}** (nb#${row.netboxDeviceId}) · ${row.site ?? "—"} · ${row.role ?? "—"} · ${row.syncAction} · ${local}`;
  });

  const summaryLine = summary
    ? `Resumo NetBox: total=${summary.totalFromNetBox} matched_id=${summary.matchedByNetboxId} matched_host=${summary.matchedByHostname}`
    : null;

  return [header, `Devices NetBox no escopo (${matches.length}):`, ...lines, summaryLine, ...notes].filter(Boolean).join("\n\n");
}

function composeComplianceAnswer(findings: CopilotEvidence["complianceFindings"], notes: string[], evidence: CopilotEvidence): string {
  const header = scopeHeader(evidence);
  if (findings.length === 0) {
    return [
      header,
      "Nenhum achado de compliance com status fail no escopo.",
      "Execute um job em /compliance ou refine com contexto (BGP, interface, security).",
      ...notes,
    ].filter(Boolean).join("\n\n");
  }

  const lines = findings.slice(0, 10).map((row) =>
    `- **${row.deviceHostname}** · ${row.severity}/${row.status} · ${row.ruleName} · ${row.message.slice(0, 120)}`,
  );

  return [header, `Achados compliance (${findings.length}):`, ...lines, ...notes].filter(Boolean).join("\n\n");
}

function composeL2FindingsSection(findings: CopilotEvidence["l2Findings"]): string {
  if (findings.length === 0) return "";
  const lines = findings.slice(0, 8).map((row) =>
    `- **${row.deviceHostname}** · ${row.circuitName} · oper=${row.operStatus} · ${row.codes.join(", ")}`,
  );
  return ["Findings L2 operacionais:", ...lines].join("\n");
}

function composeCircuitAnswer(circuits: CopilotCircuitMatch[], notes: string[], evidence: CopilotEvidence): string {
  const header = scopeHeader(evidence);
  if (circuits.length === 0) {
    return [
      header,
      "Nao encontrei circuitos L2 correspondentes.",
      "Use discovery L2 no device ou refine com nome/VSI/VC ID.",
      ...notes,
    ].filter(Boolean).join("\n\n");
  }

  const lines = circuits.slice(0, 8).map((circuit) => {
    const findings = circuit.findings.length > 0 ? `findings: ${circuit.findings.join(", ")}` : "sem findings";
    return `- **${circuit.deviceHostname}** · ${circuit.name} (${circuit.circuitType}) · oper=${circuit.operStatus} admin=${circuit.adminStatus} · peer=${circuit.peerIp ?? "—"} · ${findings}`;
  });

  const l2Section = composeL2FindingsSection(evidence.l2Findings);
  return [header, `Encontrei ${circuits.length} circuito(s):`, ...lines, l2Section, ...notes].filter(Boolean).join("\n");
}

function composeConfigGuidanceAnswer(hints: CopilotConfigHint[], notes: string[], evidence: CopilotEvidence): string {
  const header = scopeHeader(evidence);
  if (hints.length === 0) {
    return [
      header,
      "Posso sugerir templates de configuracao, mas preciso de mais contexto (peer IP, ASN, prefixo, VRF ou circuito).",
      "Exemplo: `Como configurar peer BGP 203.0.113.5 AS15169 na VRF CDN?`",
      ...notes,
    ].filter(Boolean).join("\n\n");
  }

  const blocks = hints.slice(0, 3).map((hint) => {
    const commands = hint.commands.map((line) => `  ${line}`).join("\n");
    const warnings = hint.warnings.map((line) => `- ${line}`).join("\n");
    const refs = hint.references.join(", ");
    return [
      `### ${hint.title}`,
      "```",
      commands,
      "```",
      warnings,
      refs ? `Referencias: ${refs}` : null,
    ].filter(Boolean).join("\n");
  });

  return [
    header,
    "Sugestoes de configuracao (read-only — nao aplicadas):",
    ...blocks,
    ...notes,
  ].filter(Boolean).join("\n\n");
}

function composeQuickPeering(evidence: CopilotEvidence): string {
  const up = evidence.peers.filter((peer) => peer.state === "Established").length;
  const total = evidence.peers.length;
  if (total === 0) return "Nenhum peer correspondente no inventario SNMP atual.";
  const first = evidence.peers[0]!;
  return [
    total === 1 ? "1 sessao encontrada." : `${total} sessoes · ${up} Established.`,
    `${first.deviceHostname}: ${first.peerIp} **${first.state}**${first.uptime ? ` (${formatUptime(first.uptime)})` : ""}.`,
    first.receivedPrefixes != null ? `Recebendo ${first.receivedPrefixes} prefixos.` : null,
  ].filter(Boolean).join(" ");
}

function composeDiagnosticPeering(evidence: CopilotEvidence): string {
  const base = composePeeringAnswer(evidence);
  const down = evidence.peers.filter((peer) => peer.state !== "Established");
  const diag = down.length > 0
    ? `\n\n**Diagnostico:** ${down.length} sessao(oes) fora de Established. Valide coleta SNMP, VRF e filtros de peer.`
    : "\n\n**Diagnostico:** Sem evidencia de falha operacional nos peers encontrados.";
  return base + diag;
}

function composeActionPeering(evidence: CopilotEvidence): string {
  return [
    composeQuickPeering(evidence),
    "",
    "**Proximos passos sugeridos:**",
    "1. Confirmar snapshot SNMP recente nos devices do escopo.",
    "2. Validar VRF (ex.: CDN) e ASN remoto.",
    "3. Conferir import/export policy na matriz de anuncios.",
    "4. Se sessao DOWN, usar BGP drilldown read-only antes de qualquer mudanca.",
  ].join("\n");
}

function composeEvidenceFooter(evidence: CopilotEvidence): string {
  if (evidence.sources.length === 0 && evidence.toolRuns.length === 0) return "";
  const sourceLines = evidence.sources.slice(0, 6).map((source) =>
    `- ${source.tool}: ${source.type} · ${source.ref}${source.collectedAt ? ` · ${source.collectedAt}` : ""}`,
  );
  const toolLines = evidence.toolRuns.slice(0, 8).map((run) =>
    `- ${run.toolName} (${run.status}, ${run.durationMs}ms)`,
  );
  return [
    "",
    "**Evidencias consultadas:**",
    ...sourceLines,
    toolLines.length > 0 ? `Tools: ${toolLines.join(" ")}` : null,
    evidence.queryPlan.tools.length > 0 ? `Plano: ${evidence.queryPlan.tools.join(" → ")}` : null,
  ].filter(Boolean).join("\n");
}

function applyMode(intent: CopilotIntent, evidence: CopilotEvidence, mode: CopilotResponseMode, base: string): string {
  if (intent === "help") return base;
  let body = base;
  if (mode === "quick") {
    if (intent === "bgp_peering_status") body = composeQuickPeering(evidence);
    else if (intent === "bgp_announcements") {
      body = evidence.announcements.length > 0
        ? `${evidence.announcements.length} alvo(s) na matriz. Primeiro: ${evidence.announcements[0]!.routePolicyName} em ${evidence.announcements[0]!.deviceHostname}.`
        : "Sem correspondencia na matriz de anuncios.";
    } else if (intent === "l2_circuit_status") {
      body = evidence.circuits.length > 0
        ? `${evidence.circuits.length} circuito(s). Ex.: ${evidence.circuits[0]!.name} oper=${evidence.circuits[0]!.operStatus}.`
        : "Nenhum circuito L2 correspondente.";
    } else if (intent === "config_guidance") {
      body = evidence.configHints.length > 0
        ? `Sugestao read-only disponivel (${evidence.configHints.length}). Risco medio/alto se envolver export BGP.`
        : base;
    }
  } else if (mode === "diagnostic") {
    if (intent === "bgp_peering_status") body = composeDiagnosticPeering(evidence);
    else body = `${base}\n\n**Diagnostico:** correlacione peers, policies e matriz antes de concluir causa raiz.`;
  } else if (mode === "action") {
    if (intent === "bgp_peering_status") body = composeActionPeering(evidence);
    else body = `${base}\n\n**Plano de acao:** valide evidencias, confirme impacto e use Provisioning Preview antes de mudancas.`;
  }
  return body + composeEvidenceFooter(evidence);
}

function formatDiagnosticTrail(trail: CopilotEvidence["diagnosticTrail"]): string {
  if (trail.length === 0) return "";
  const icon = (status: string) => {
    if (status === "pass") return "OK";
    if (status === "fail") return "FALHA";
    if (status === "warn") return "ATENCAO";
    return "?";
  };
  const lines = trail.map((item) =>
    `${item.step}. [${icon(item.status)}] ${item.question}\n   ${item.finding}`,
  );
  return ["**Trilha de diagnostico (10 passos):**", ...lines].join("\n");
}

function composeMatrixTimelapseSection(diffs: CopilotEvidence["matrixTimelapse"]): string {
  if (diffs.length === 0) return "";
  const lines = diffs.flatMap((diff) => {
    if (diff.note) return [`- **${diff.deviceHostname}**: ${diff.note}`];
    const parts: string[] = [];
    if (diff.added.length > 0) parts.push(`+${diff.added.length} adicionado(s)`);
    if (diff.removed.length > 0) parts.push(`-${diff.removed.length} removido(s)`);
    if (diff.changed.length > 0) parts.push(`~${diff.changed.length} alterado(s)`);
    return [`- **${diff.deviceHostname}** (${diff.olderAt ?? "?"} → ${diff.newerAt ?? "?"}): ${parts.join(", ") || "sem diff"}`];
  });
  return ["**Timelapse matriz (24h):**", ...lines].join("\n");
}

function composeDrilldownSection(compares: CopilotEvidence["drilldownCompares"]): string {
  if (compares.length === 0) return "";
  const lines = compares.map((row) =>
    `- **${row.deviceHostname}** peer ${row.peerIp}: import Δ${row.importPolicyChanges} export Δ${row.exportPolicyChanges}${row.newWarnings.length ? ` warnings+${row.newWarnings.length}` : ""}`,
  );
  return ["**Drilldown (ultimos 2 snapshots):**", ...lines].join("\n");
}

function composePrefixTraceAnswer(traces: CopilotEvidence["prefixTraces"], notes: string[], evidence: CopilotEvidence): string {
  const header = scopeHeader(evidence);
  if (traces.length === 0) {
    return [
      header,
      "Nao encontrei evidencias do prefixo em route-history, matriz de anuncios ou config bundle.",
      "Valide coleta SNMP, discovery e se o prefixo esta na policy/import correta.",
      ...notes,
    ].filter(Boolean).join("\n\n");
  }

  const lines = traces.slice(0, 6).map((trace) => {
    const recv = trace.receivedFrom.length > 0
      ? `recebido de ${trace.receivedFrom.map((row) => row.peerIp).join(", ")}`
      : "nao visto em route-history received";
    const sshTag = trace.liveSshVerified ? ` · SSH live (${trace.sshLiveHitCount ?? 0} hit(s))` : "";
    const matrix = trace.matrixTargets.length > 0
      ? trace.matrixTargets.map((target) => `${target.targetName}(${target.announced ? "on" : "off"})`).join(", ")
      : "sem linha na matriz";
    const policies = trace.relatedPolicies.length > 0 ? trace.relatedPolicies.join(", ") : "—";
    return `- **${trace.deviceHostname}** · ${trace.prefix} · ${recv}${sshTag} · matriz: ${matrix} · policies: ${policies}`;
  });

  const extras = [
    formatDiagnosticTrail(evidence.diagnosticTrail),
    composeMatrixTimelapseSection(evidence.matrixTimelapse),
    composeDrilldownSection(evidence.drilldownCompares),
  ].filter(Boolean);

  return [header, `Rastreio de prefixo (${traces.length} device(s)):`, ...lines, ...extras, ...notes].filter(Boolean).join("\n\n");
}

function composeRoutePolicyExplainAnswer(rows: CopilotEvidence["routePolicyExplains"], notes: string[], evidence: CopilotEvidence): string {
  const header = scopeHeader(evidence);
  if (rows.length === 0) {
    return [header, "Nenhuma route-policy encontrada no config bundle parseado.", ...notes].filter(Boolean).join("\n\n");
  }

  const blocks = rows.slice(0, 4).map((row) => {
    const nodeLines = row.nodes.slice(0, 4).map((node) =>
      `  - node ${node.node ?? "?"} ${node.action ?? ""}: match ${node.matches.join("; ") || "—"} apply ${node.applies.join("; ") || "—"}`,
    );
    return [
      `**${row.routePolicy}** (device ${row.deviceId}, fonte ${row.source})`,
      ...nodeLines,
      `Prefixos expandidos: ${row.dependencies.ipPrefixes.slice(0, 6).join(", ") || "—"}`,
      `Peers vinculados: ${row.dependencies.peerBindings.map((peer) => `${peer.peerIp} ${peer.direction}`).join(", ") || "—"}`,
    ].join("\n");
  });

  return [header, "Explicacao de route-policy (read-only):", ...blocks, ...notes].filter(Boolean).join("\n\n");
}

function composeHistoryAnswer(events: CopilotEvidence["historyEvents"], notes: string[], evidence: CopilotEvidence): string {
  const header = scopeHeader(evidence);
  if (events.length === 0) {
    return [header, "Sem eventos historicos na janela consultada (48h).", ...notes].filter(Boolean).join("\n\n");
  }
  const lines = events.slice(0, 10).map((event) =>
    `- **${event.deviceHostname}** · ${event.collectedAt} · ${event.summary}${event.details.length ? ` (${event.details.join(", ")})` : ""}`,
  );
  return [header, `Historico operacional (${events.length} evento(s)):`, ...lines, ...notes].filter(Boolean).join("\n");
}

function composeHelpAnswer(): string {
  return [
    "Sou o copiloto read-only do NetOps. Consulto inventario SNMP/discovery e oriento configuracao sem apply.",
    "",
    "**Consultas** (agrega devices da mesma empresa):",
    "- `Como esta o peering do Google na CDN?`",
    "- `O cliente AS268836 esta anunciando prefixos?`",
    "- `Status do circuito VSI cliente-x em todos os POPs`",
    "- `Quais devices do escopo existem no NetBox?` (requer NETBOX_ENABLED)",
    "",
    "**Config (somente dicas):**",
    "- `Como configurar peer BGP 203.0.113.5 AS15169 na VRF CDN?`",
    "- `Template para anunciar prefixo 200.1.2.0/24`",
    "",
    "Nao executo comandos nem apply em equipamentos. Novas habilidades podem ser registradas via API de skills.",
  ].join("\n");
}

export function composeCopilotAnswer(
  intent: CopilotIntent,
  evidence: CopilotEvidence,
  mode: CopilotResponseMode = "technical",
): {
  answer: string;
  confidence: "high" | "medium" | "low";
} {
  const notes = evidence.notes.length > 0 ? evidence.notes : [];

  switch (intent) {
    case "bgp_peering_status": {
      const confidence = evidence.peers.length > 0 ? "high" : "low";
      return {
        answer: applyMode(intent, evidence, mode, composePeeringAnswer(evidence)),
        confidence,
      };
    }
    case "bgp_announcements": {
      const confidence = evidence.announcements.length > 0 ? "high" : evidence.peers.length > 0 ? "medium" : "low";
      const peerFallback = evidence.peers.length > 0
        ? `\n\nPeers operacionais relacionados:\n${evidence.peers.slice(0, 4).map((peer) => `- ${summarizePeer(peer)}`).join("\n")}`
        : "";
      return {
        answer: applyMode(intent, evidence, mode, composeAnnouncementAnswer(evidence.announcements, notes, evidence) + peerFallback),
        confidence,
      };
    }
    case "l2_circuit_status": {
      const hasData = evidence.circuits.length > 0 || evidence.l2Findings.length > 0;
      return {
        answer: applyMode(intent, evidence, mode, composeCircuitAnswer(evidence.circuits, notes, evidence)),
        confidence: hasData ? "high" : "low",
      };
    }
    case "compliance_status": {
      return {
        answer: applyMode(intent, evidence, mode, composeComplianceAnswer(evidence.complianceFindings, notes, evidence)),
        confidence: evidence.complianceFindings.length > 0 ? "high" : "low",
      };
    }
    case "netbox_inventory": {
      return {
        answer: applyMode(intent, evidence, mode, composeNetboxAnswer(evidence.netboxMatches, evidence.netboxSummary, notes, evidence)),
        confidence: evidence.netboxMatches.length > 0 ? "high" : evidence.netboxSummary ? "medium" : "low",
      };
    }
    case "config_guidance": {
      return {
        answer: applyMode(intent, evidence, mode, composeConfigGuidanceAnswer(evidence.configHints, notes, evidence)),
        confidence: evidence.configHints.length > 0 ? "medium" : "low",
      };
    }
    case "prefix_trace": {
      const failures = evidence.diagnosticTrail.filter((item) => item.status === "fail").length;
      const confidence = failures > 0 ? "medium" : evidence.prefixTraces.length > 0 ? "high" : evidence.peers.length > 0 ? "medium" : "low";
      return {
        answer: applyMode(intent, evidence, mode, composePrefixTraceAnswer(evidence.prefixTraces, notes, evidence)),
        confidence,
      };
    }
    case "route_policy_explain": {
      return {
        answer: applyMode(intent, evidence, mode, composeRoutePolicyExplainAnswer(evidence.routePolicyExplains, notes, evidence)),
        confidence: evidence.routePolicyExplains.length > 0 ? "high" : "low",
      };
    }
    case "historical_diff": {
      return {
        answer: applyMode(intent, evidence, mode, composeHistoryAnswer(evidence.historyEvents, notes, evidence)),
        confidence: evidence.historyEvents.length > 0 ? "medium" : "low",
      };
    }
    case "help":
      return { answer: composeHelpAnswer(), confidence: "high" };
    default:
      return {
        answer: applyMode(intent, evidence, mode, [
          "Nao consegui classificar a pergunta.",
          composeHelpAnswer(),
        ].join("\n\n")),
        confidence: "low",
      };
  }
}
