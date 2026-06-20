import type { CopilotToolResultPayload } from "./copilot.tools.types.js";
import type { CopilotDiagnosticStep, CopilotEntity } from "./copilot.types.js";

function step(
  n: number,
  question: string,
  status: CopilotDiagnosticStep["status"],
  finding: string,
  evidenceRef?: string,
): CopilotDiagnosticStep {
  return { step: n, question, status, finding, evidenceRef };
}

export function buildBgpDiagnosticTrail(input: {
  entities: CopilotEntity[];
  payload: CopilotToolResultPayload;
  providerLabel?: string | null;
}): CopilotDiagnosticStep[] {
  const { payload } = input;
  const customerEntity = input.entities.find((entity) => entity.kind === "customer");
  const resolvedCustomer = payload.resolvedEntities?.find((entity) => entity.entityType === "customer");
  const prefix = input.entities.find((entity) => entity.kind === "prefix")?.value
    ?? payload.prefixTraces?.[0]?.prefix
    ?? null;
  const peers = payload.peers ?? [];
  const established = peers.filter((peer) => peer.state === "Established");
  const traces = payload.prefixTraces ?? [];
  const matrixOn = traces.flatMap((trace) => trace.matrixTargets.filter((target) => target.announced));
  const importPolicies = payload.routePolicyExplains?.filter((row) =>
    row.dependencies.peerBindings.some((binding) => binding.direction === "import"),
  ) ?? [];

  const steps: CopilotDiagnosticStep[] = [];

  steps.push(step(
    1,
    "Cliente / entidade existe no escopo?",
    customerEntity || resolvedCustomer || peers.length > 0 ? "pass" : "unknown",
    customerEntity || resolvedCustomer
      ? `Entidade ${customerEntity?.label ?? customerEntity?.value ?? resolvedCustomer?.canonicalName} resolvida.`
      : "Nenhum cliente explicito — usando peers e texto livre.",
    "copilot_entity_resolve",
  ));

  steps.push(step(
    2,
    "Peer BGP do cliente esta UP?",
    established.length > 0 ? "pass" : peers.length > 0 ? "fail" : "unknown",
    established.length > 0
      ? `${established.length}/${peers.length} sessao(oes) Established.`
      : peers.length > 0
        ? `${peers.length} peer(s) encontrado(s), nenhum Established.`
        : "Sem peers correlacionados no SNMP.",
    "bgp_peer_status_query",
  ));

  steps.push(step(
    3,
    "Prefixo esta sendo recebido?",
    traces.some((trace) => trace.receivedFrom.length > 0) ? "pass" : prefix ? "fail" : "unknown",
    traces.some((trace) => trace.receivedFrom.length > 0)
      ? `Recebido em ${traces.filter((trace) => trace.receivedFrom.length > 0).length} device(s).`
      : prefix
        ? `Prefixo ${prefix} nao visto em route-history received.`
        : "Informe um prefixo CIDR para validar recepcao.",
    "bgp_prefix_trace",
  ));

  steps.push(step(
    4,
    "Prefixo ativo em consulta de rota?",
    traces.some((trace) => trace.activeInRouteHistory) ? "pass" : prefix ? "warn" : "unknown",
    traces.some((trace) => trace.activeInRouteHistory)
      ? "Prefixo presente em bgp_route_history."
      : "Sem consulta SSH recente com esse prefixo na RIB.",
    "route_history",
  ));

  steps.push(step(
    5,
    "Community de marcacao identificada?",
    traces.some((trace) => trace.communities.length > 0) ? "pass" : importPolicies.length > 0 ? "warn" : "unknown",
    traces.some((trace) => trace.communities.length > 0)
      ? `Communities: ${[...new Set(traces.flatMap((trace) => trace.communities))].slice(0, 4).join(", ")}`
      : "Nenhuma community expandida no config bundle para o prefixo.",
    "route_policy_explain",
  ));

  steps.push(step(
    6,
    "Route-policy de import aplica regra ao prefixo?",
    importPolicies.length > 0 || traces.some((trace) => trace.relatedPolicies.length > 0) ? "pass" : "unknown",
    traces.some((trace) => trace.relatedPolicies.length > 0)
      ? `Policies: ${[...new Set(traces.flatMap((trace) => trace.relatedPolicies))].slice(0, 4).join(", ")}`
      : "Revise RP de import do peer do cliente no config bundle.",
    "route_policy_explain",
  ));

  steps.push(step(
    7,
    "Export para operadora/CDN elegivel na matriz?",
    matrixOn.length > 0 ? "pass" : traces.some((trace) => trace.matrixTargets.length > 0) ? "fail" : "unknown",
    matrixOn.length > 0
      ? `${matrixOn.length} alvo(s) com estado de anuncio ativo.`
      : traces.some((trace) => trace.matrixTargets.length > 0)
        ? "Matriz encontrada, mas sem celula ON para o destino."
        : "Sem linha na matriz de anuncios.",
    "announcement_matrix_query",
  ));

  const providerPeers = input.providerLabel
    ? peers.filter((peer) =>
        peer.exportPolicy?.toLowerCase().includes(input.providerLabel!.toLowerCase())
        || peer.importPolicy?.toLowerCase().includes(input.providerLabel!.toLowerCase()),
      )
    : peers.filter((peer) => peer.role === "provider" || peer.role === "transit");

  steps.push(step(
    8,
    "Peer da operadora/upstream esta UP?",
    providerPeers.some((peer) => peer.state === "Established") ? "pass" : providerPeers.length > 0 ? "fail" : "unknown",
    providerPeers.length > 0
      ? `${providerPeers.filter((peer) => peer.state === "Established").length}/${providerPeers.length} upstream Established.`
      : "Nenhum peer de operadora correlacionado no escopo.",
    "bgp_peer_status_query",
  ));

  const prefixInLists = payload.routePolicyExplains?.some((row) =>
    prefix ? row.dependencies.ipPrefixes.some((p) => p.includes(prefix.split("/")[0] ?? prefix)) : false,
  ) ?? false;

  steps.push(step(
    9,
    "Ip-prefix / filtro bloqueando o anuncio?",
    prefixInLists ? "pass" : prefix ? "warn" : "unknown",
    prefixInLists
      ? "Prefixo casa com ip-prefix expandido em route-policy."
      : "Valide ip-prefix e community-filter no import do cliente.",
    "route_policy_explain",
  ));

  const recentChanges = (payload.historyEvents?.length ?? 0) + (payload.matrixTimelapse?.some((diff) =>
    diff.added.length > 0 || diff.removed.length > 0 || diff.changed.length > 0,
  ) ? 1 : 0);

  steps.push(step(
    10,
    "Houve mudanca recente (historico / matriz)?",
    recentChanges > 0 ? "warn" : "pass",
    recentChanges > 0
      ? "Eventos historicos ou diff de matriz detectados na janela consultada."
      : "Sem mudancas relevantes na janela de historico.",
    "historical_diff_lookup",
  ));

  return steps;
}
