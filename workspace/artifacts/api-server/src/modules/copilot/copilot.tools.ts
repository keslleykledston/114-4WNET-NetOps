import { aggregatePeersAcrossDevices } from "./copilot.aggregate.js";
import { buildConfigHintsFromContext } from "./copilot.config-hints.js";
import { mergeResolvedIntoEntities, resolveCopilotEntities } from "./copilot.entity-resolver.js";
import { buildBgpDiagnosticTrail } from "./copilot.diagnostic-trail.js";
import { comparePeerDrilldownInScope } from "./copilot.drilldown-compare.js";
import { lookupOperationalHistory } from "./copilot.history-lookup.js";
import { compareAnnouncementMatrixTimelapse } from "./copilot.matrix-timelapse.js";
import { tracePrefixInScope } from "./copilot.prefix-trace.js";
import {
  getCopilotInventoryRefreshConfig,
  isCopilotInventoryRefreshEnabled,
  isSnmpRealEnabledForCopilot,
  refreshInventoryInScope,
} from "./copilot.inventory-refresh.js";
import {
  getCopilotNetboxConfig,
  isCopilotNetboxEnabled,
  isCopilotNetboxOperational,
  queryNetboxInventoryInScope,
} from "./copilot.netbox-query.js";
import {
  getCopilotSshOnDemandConfig,
  isCopilotSshOnDemandEnabled,
  mergeSshHitsIntoPrefixTraces,
  queryPrefixLiveRoutesInScope,
} from "./copilot.ssh-on-demand.js";
import { explainRoutePoliciesInScope } from "./copilot.route-policy-explain.js";
import { searchAnnouncements, searchBgpPeers, searchCircuits, searchComplianceFindings, searchL2Findings } from "./copilot.queries.js";
import type {
  CopilotToolContext,
  CopilotToolName,
  CopilotToolResultPayload,
  CopilotToolRunRecord,
  CopilotToolSource,
} from "./copilot.tools.types.js";

async function runWithTiming(
  toolName: CopilotToolName,
  input: Record<string, unknown>,
  source: CopilotToolSource | null,
  runner: () => Promise<CopilotToolResultPayload>,
): Promise<CopilotToolRunRecord> {
  const started = Date.now();
  try {
    const output = await runner();
    return {
      toolName,
      status: "ok",
      durationMs: Date.now() - started,
      input,
      output,
      source,
    };
  } catch (error) {
    return {
      toolName,
      status: "error",
      durationMs: Date.now() - started,
      input,
      output: {},
      source,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function executeCopilotTool(
  toolName: CopilotToolName,
  context: CopilotToolContext,
  accumulated: CopilotToolResultPayload,
): Promise<CopilotToolRunRecord> {
  switch (toolName) {
    case "copilot_entity_resolve": {
      return runWithTiming(toolName, { question: context.question, tenantId: context.tenantId }, {
        type: "entity_catalog",
        ref: `tenant:${context.tenantId ?? "unknown"}`,
        collectedAt: new Date().toISOString(),
      }, async () => {
        const resolved = await resolveCopilotEntities({
          question: context.question,
          tenantId: context.tenantId,
          parsedEntities: context.entities,
        });
        return {
          resolvedEntities: resolved,
          notes: resolved.length > 0
            ? [`Entidades resolvidas: ${resolved.map((item) => item.canonicalName).join(", ")}`]
            : ["Nenhuma entidade canonica resolvida — usando texto livre e entidades parseadas."],
        };
      });
    }

    case "netops_inventory_refresh": {
      if (!isCopilotInventoryRefreshEnabled()) {
        return {
          toolName,
          status: "skipped",
          durationMs: 0,
          input: { deviceIds: context.scope.deviceIds },
          output: { notes: ["Inventario refresh desabilitado (NETOPS_COPILOT_INVENTORY_REFRESH_ENABLED=false)."] },
          source: { type: "snmp_snapshot", ref: "disabled", collectedAt: null },
        };
      }

      if (!isSnmpRealEnabledForCopilot()) {
        return {
          toolName,
          status: "skipped",
          durationMs: 0,
          input: { deviceIds: context.scope.deviceIds },
          output: { notes: ["SNMP real desabilitado (NETOPS_SNMP_REAL_ENABLED=false)."] },
          source: { type: "snmp_snapshot", ref: "snmp-disabled", collectedAt: null },
        };
      }

      return runWithTiming(toolName, { deviceIds: context.scope.deviceIds }, {
        type: "snmp_snapshot",
        ref: `refresh:${context.scope.deviceIds.join(",")}`,
        collectedAt: new Date().toISOString(),
      }, async () => {
        const { results, notes } = await refreshInventoryInScope(context.scope.deviceIds);
        return { inventoryRefresh: results, notes };
      });
    }

    case "bgp_peer_status_query": {
      const entities = mergeResolvedIntoEntities(
        context.entities,
        accumulated.resolvedEntities ?? [],
      );
      return runWithTiming(toolName, { deviceIds: context.scope.deviceIds, entities }, {
        type: "snmp_snapshot",
        ref: `devices:${context.scope.deviceIds.join(",")}`,
        collectedAt: new Date().toISOString(),
      }, async () => {
        const peers = await searchBgpPeers({
          entities,
          deviceIds: context.scope.deviceIds,
          freeText: context.freeText ?? context.question,
        });
        return {
          peers,
          notes: peers.length > 0
            ? [`${peers.length} peer(s) BGP encontrado(s) no escopo ${context.scope.label}.`]
            : ["Nenhum peer BGP correspondente no inventario SNMP atual."],
        };
      });
    }

    case "bgp_prefix_received":
    case "bgp_prefix_advertised": {
      const entities = mergeResolvedIntoEntities(context.entities, accumulated.resolvedEntities ?? []);
      const prefixEntity = entities.find((entity) => entity.kind === "prefix");
      return runWithTiming(toolName, { deviceIds: context.scope.deviceIds, prefix: prefixEntity?.value ?? null }, {
        type: "snmp_snapshot",
        ref: `prefix-trace:${prefixEntity?.value ?? "none"}`,
        collectedAt: new Date().toISOString(),
      }, async () => {
        const peers = accumulated.peers ?? await searchBgpPeers({
          entities,
          deviceIds: context.scope.deviceIds,
          freeText: context.freeText ?? context.question,
        });
        const filtered = prefixEntity
          ? peers.filter((peer) =>
              (toolName === "bgp_prefix_received" && (peer.receivedPrefixes ?? 0) > 0)
              || (toolName === "bgp_prefix_advertised" && (peer.advertisedPrefixes ?? 0) > 0),
            )
          : peers;
        return {
          peers: filtered,
          notes: [
            toolName === "bgp_prefix_received"
              ? "Contagem de prefixos recebidos via SNMP (autoritativo para sessao, nao lista RIB completa)."
              : "Contagem de prefixos anunciados via SNMP.",
          ],
        };
      });
    }

    case "announcement_matrix_query": {
      const entities = mergeResolvedIntoEntities(context.entities, accumulated.resolvedEntities ?? []);
      return runWithTiming(toolName, { deviceIds: context.scope.deviceIds, entities }, {
        type: "announcement_matrix",
        ref: `matrix:${context.scope.deviceIds.join(",")}`,
        collectedAt: new Date().toISOString(),
      }, async () => {
        const announcements = await searchAnnouncements({ entities, deviceIds: context.scope.deviceIds });
        return {
          announcements,
          notes: announcements.length > 0
            ? [`${announcements.length} linha(s) na matriz de anuncios.`]
            : ["Matriz de anuncios sem correspondencia para os termos informados."],
        };
      });
    }

    case "route_policy_lookup": {
      const peers = accumulated.peers ?? [];
      return runWithTiming(toolName, { peerCount: peers.length }, {
        type: "snmp_snapshot",
        ref: "peer-policies",
        collectedAt: new Date().toISOString(),
      }, async () => {
        const routePolicies = peers.flatMap((peer) => {
          const rows: Array<{ deviceId: number; deviceHostname: string; policyName: string; role: "import" | "export" }> = [];
          if (peer.importPolicy) {
            rows.push({
              deviceId: peer.deviceId,
              deviceHostname: peer.deviceHostname,
              policyName: peer.importPolicy,
              role: "import",
            });
          }
          if (peer.exportPolicy) {
            rows.push({
              deviceId: peer.deviceId,
              deviceHostname: peer.deviceHostname,
              policyName: peer.exportPolicy,
              role: "export",
            });
          }
          return rows;
        });
        return { routePolicies, peers };
      });
    }

    case "compliance_findings_query": {
      const entities = mergeResolvedIntoEntities(context.entities, accumulated.resolvedEntities ?? []);
      return runWithTiming(toolName, { deviceIds: context.scope.deviceIds }, {
        type: "compliance_db",
        ref: `compliance:${context.scope.deviceIds.join(",")}`,
        collectedAt: new Date().toISOString(),
      }, async () => {
        const complianceFindings = await searchComplianceFindings({
          deviceIds: context.scope.deviceIds,
          freeText: context.freeText ?? context.question,
          status: "fail",
        });
        return {
          complianceFindings,
          notes: complianceFindings.length > 0
            ? [`${complianceFindings.length} achado(s) de compliance (fail) no escopo.`]
            : ["Nenhum achado de compliance fail — valide jobs em /compliance."],
        };
      });
    }

    case "netbox_inventory_query": {
      if (!isCopilotNetboxEnabled()) {
        return {
          toolName,
          status: "skipped",
          durationMs: 0,
          input: { deviceIds: context.scope.deviceIds },
          output: { notes: ["NetBox no copilot desabilitado (NETOPS_COPILOT_NETBOX_ENABLED=false)."] },
          source: { type: "netbox_api", ref: "disabled", collectedAt: null },
        };
      }

      if (!isCopilotNetboxOperational()) {
        return {
          toolName,
          status: "skipped",
          durationMs: 0,
          input: { deviceIds: context.scope.deviceIds },
          output: { notes: ["Integracao NetBox desabilitada ou nao configurada (NETBOX_ENABLED=false)."] },
          source: { type: "netbox_api", ref: "netbox-disabled", collectedAt: null },
        };
      }

      const siteFilter = context.entities.find((entity) => entity.kind === "site")?.value ?? null;
      return runWithTiming(toolName, { deviceIds: context.scope.deviceIds, siteFilter }, {
        type: "netbox_api",
        ref: `netbox:${context.scope.deviceIds.join(",") || "all"}`,
        collectedAt: new Date().toISOString(),
      }, async () => {
        const { matches, summary, notes } = await queryNetboxInventoryInScope({
          freeText: context.freeText ?? context.question,
          deviceIds: context.scope.deviceIds,
          deviceHostnames: context.scope.deviceHostnames,
          siteFilter,
        });
        return {
          netboxMatches: matches,
          netboxSummary: summary,
          notes: [
            `NetBox read-only (max ${getCopilotNetboxConfig().maxMatches} matches).`,
            ...notes,
          ],
        };
      });
    }

    case "l2_findings_query": {
      const entities = mergeResolvedIntoEntities(context.entities, accumulated.resolvedEntities ?? []);
      return runWithTiming(toolName, { deviceIds: context.scope.deviceIds }, {
        type: "l2_inventory",
        ref: `l2-findings:${context.scope.deviceIds.join(",")}`,
        collectedAt: new Date().toISOString(),
      }, async () => {
        const l2Findings = await searchL2Findings({
          deviceIds: context.scope.deviceIds,
          freeText: context.freeText ?? context.question,
        });
        return {
          l2Findings,
          notes: l2Findings.length > 0
            ? [`${l2Findings.length} circuito(s) L2 com findings operacionais.`]
            : ["Nenhum finding L2 aberto no inventario atual."],
        };
      });
    }

    case "l2_circuit_status_query": {
      const entities = mergeResolvedIntoEntities(context.entities, accumulated.resolvedEntities ?? []);
      return runWithTiming(toolName, { deviceIds: context.scope.deviceIds, entities }, {
        type: "l2_inventory",
        ref: `l2:${context.scope.deviceIds.join(",")}`,
        collectedAt: new Date().toISOString(),
      }, async () => {
        const circuits = await searchCircuits({
          entities,
          deviceIds: context.scope.deviceIds,
          freeText: context.freeText ?? context.question,
        });
        return {
          circuits,
          notes: circuits.length > 0
            ? [`${circuits.length} circuito(s) L2 no escopo.`]
            : ["Nenhum circuito L2 correspondente."],
        };
      });
    }

    case "customer_lookup": {
      const entities = mergeResolvedIntoEntities(context.entities, accumulated.resolvedEntities ?? []);
      const customer = entities.find((entity) => entity.kind === "customer");
      return runWithTiming(toolName, { customer: customer?.value ?? null }, {
        type: "db",
        ref: "peer-customer-match",
        collectedAt: new Date().toISOString(),
      }, async () => {
        const peers = await searchBgpPeers({
          entities: customer ? [customer] : entities,
          deviceIds: context.scope.deviceIds,
          freeText: context.freeText ?? context.question,
        });
        return {
          peers,
          notes: customer
            ? [`Peers correlacionados ao cliente ${customer.label ?? customer.value}.`]
            : ["Busca de cliente sem entidade explicita — usando texto livre."],
        };
      });
    }

    case "bgp_route_ssh_live": {
      const entities = mergeResolvedIntoEntities(context.entities, accumulated.resolvedEntities ?? []);
      const prefix = entities.find((entity) => entity.kind === "prefix")?.value
        ?? context.question.match(/\b(?:(?:\d{1,3}\.){3}\d{1,3}\/\d{1,2})\b/i)?.[0];

      if (!isCopilotSshOnDemandEnabled()) {
        return {
          toolName,
          status: "skipped",
          durationMs: 0,
          input: { prefix: prefix ?? null },
          output: { notes: ["SSH on-demand desabilitado (NETOPS_COPILOT_SSH_ON_DEMAND_ENABLED=false)."] },
          source: { type: "ssh_live", ref: "disabled", collectedAt: null },
        };
      }

      if (!prefix) {
        return {
          toolName,
          status: "skipped",
          durationMs: 0,
          input: {},
          output: { notes: ["SSH live requer prefixo CIDR na pergunta."] },
          source: null,
        };
      }

      return runWithTiming(toolName, { prefix, deviceIds: context.scope.deviceIds }, {
        type: "ssh_live",
        ref: `live:${prefix}`,
        collectedAt: new Date().toISOString(),
      }, async () => {
        const peers = accumulated.peers ?? await searchBgpPeers({
          entities,
          deviceIds: context.scope.deviceIds,
          freeText: context.freeText ?? context.question,
        });

        const baseTraces = accumulated.prefixTraces?.length
          ? accumulated.prefixTraces
          : await tracePrefixInScope({ prefix, deviceIds: context.scope.deviceIds });

        const vrfHint = entities.find((entity) => entity.kind === "vrf")?.value
          ?? accumulated.resolvedEntities?.find((entity) => entity.vrf)?.vrf
          ?? null;

        const { hits, notes } = await queryPrefixLiveRoutesInScope({
          prefix,
          deviceIds: context.scope.deviceIds,
          peers,
          vrfHint,
        });

        const hostnameMap = new Map(
          context.scope.deviceIds.map((deviceId, index) => [
            deviceId,
            context.scope.deviceHostnames[index] ?? `device-${deviceId}`,
          ]),
        );

        const prefixTraces = mergeSshHitsIntoPrefixTraces({
          traces: baseTraces,
          hits,
          prefix,
          deviceHostnames: hostnameMap,
        });

        return {
          prefixTraces,
          notes: [
            `SSH on-demand (${getCopilotSshOnDemandConfig().maxPeersPerDevice} peers/device max).`,
            ...notes,
          ],
        };
      });
    }

    case "bgp_prefix_trace": {
      const entities = mergeResolvedIntoEntities(context.entities, accumulated.resolvedEntities ?? []);
      const prefix = entities.find((entity) => entity.kind === "prefix")?.value
        ?? context.question.match(/\b(?:(?:\d{1,3}\.){3}\d{1,3}\/\d{1,2})\b/i)?.[0];
      return runWithTiming(toolName, { prefix: prefix ?? null, deviceIds: context.scope.deviceIds }, {
        type: "route_history",
        ref: `trace:${prefix ?? "none"}`,
        collectedAt: new Date().toISOString(),
      }, async () => {
        if (!prefix) {
          return { notes: ["Informe um prefixo CIDR para rastrear (ex.: 45.7.10.0/24)."] };
        }
        const prefixTraces = await tracePrefixInScope({ prefix, deviceIds: context.scope.deviceIds });
        return {
          prefixTraces,
          notes: prefixTraces.length > 0
            ? [`Rastreio de ${prefix} em ${prefixTraces.length} device(s).`]
            : [`Nenhuma evidencia de ${prefix} em route-history, matriz ou config bundle.`],
        };
      });
    }

    case "route_policy_explain": {
      const policyHints = [
        ...accumulated.routePolicies?.map((row) => row.policyName) ?? [],
        ...context.entities.map((entity) => entity.label ?? entity.value),
      ];
      return runWithTiming(toolName, { policyHints }, {
        type: "config_bundle",
        ref: "policy-dependency",
        collectedAt: new Date().toISOString(),
      }, async () => {
        const routePolicyExplains = await explainRoutePoliciesInScope({
          question: context.question,
          deviceIds: context.scope.deviceIds,
          policyHints,
        });
        return {
          routePolicyExplains,
          notes: routePolicyExplains.length > 0
            ? [`${routePolicyExplains.length} route-policy(s) explicada(s) via config bundle.`]
            : ["Nenhuma route-policy encontrada no snapshot parseado."],
        };
      });
    }

    case "historical_diff_lookup": {
      const entities = mergeResolvedIntoEntities(context.entities, accumulated.resolvedEntities ?? []);
      const prefix = entities.find((entity) => entity.kind === "prefix")?.value ?? null;
      const peerIp = entities.find((entity) => entity.kind === "peer_ip")?.value ?? null;
      return runWithTiming(toolName, { prefix, peerIp, sinceHours: 48 }, {
        type: "peer_history",
        ref: "bgp_peer_collection_history",
        collectedAt: new Date().toISOString(),
      }, async () => {
        const historyEvents = await lookupOperationalHistory({
          deviceIds: context.scope.deviceIds,
          peerIp,
          prefix,
          sinceHours: 48,
        });
        return {
          historyEvents,
          notes: historyEvents.length > 0
            ? [`${historyEvents.length} evento(s) historico(s) nas ultimas 48h.`]
            : ["Sem eventos historicos relevantes na janela de 48h."],
        };
      });
    }

    case "announcement_matrix_timelapse": {
      const entities = mergeResolvedIntoEntities(context.entities, accumulated.resolvedEntities ?? []);
      const prefix = entities.find((entity) => entity.kind === "prefix")?.value ?? null;
      return runWithTiming(toolName, { sinceHours: 24, prefix }, {
        type: "matrix_timelapse",
        ref: `timelapse:${context.scope.deviceIds.join(",")}`,
        collectedAt: new Date().toISOString(),
      }, async () => {
        const matrixTimelapse = await compareAnnouncementMatrixTimelapse({
          deviceIds: context.scope.deviceIds,
          sinceHours: 24,
          prefixFilter: prefix,
        });
        return {
          matrixTimelapse,
          notes: matrixTimelapse.length > 0
            ? [`Timelapse de matriz em ${matrixTimelapse.length} device(s), janela 24h.`]
            : ["Sem snapshots de matriz — abra /bgp/announcements para gerar baseline."],
        };
      });
    }

    case "bgp_drilldown_compare": {
      const peers = accumulated.peers ?? [];
      return runWithTiming(toolName, { peerCount: peers.length }, {
        type: "drilldown_cache",
        ref: "bgp_peer_drilldown_snapshots",
        collectedAt: new Date().toISOString(),
      }, async () => {
        const drilldownCompares = await comparePeerDrilldownInScope({
          deviceIds: context.scope.deviceIds,
          peers,
        });
        return {
          drilldownCompares,
          notes: drilldownCompares.length > 0
            ? [`${drilldownCompares.length} comparacao(oes) drilldown peer (ultimos 2 snapshots).`]
            : ["Sem historico drilldown com 2+ snapshots para peers encontrados."],
        };
      });
    }

    case "bgp_diagnostic_trail": {
      const entities = mergeResolvedIntoEntities(context.entities, accumulated.resolvedEntities ?? []);
      const provider = accumulated.resolvedEntities?.find((entity) =>
        entity.entityType === "provider" || entity.entityType === "cdn",
      )?.canonicalName ?? null;
      return runWithTiming(toolName, { intent: context.intent }, {
        type: "db",
        ref: "diagnostic-trail",
        collectedAt: new Date().toISOString(),
      }, async () => {
        const diagnosticTrail = buildBgpDiagnosticTrail({
          entities,
          payload: accumulated,
          providerLabel: provider,
        });
        const failures = diagnosticTrail.filter((item) => item.status === "fail").length;
        return {
          diagnosticTrail,
          notes: [
            `Trilha de diagnostico: ${diagnosticTrail.length} passos, ${failures} falha(s).`,
          ],
        };
      });
    }

    case "config_suggestion_builder": {
      const peers = accumulated.peers ?? [];
      const entities = mergeResolvedIntoEntities(context.entities, accumulated.resolvedEntities ?? []);
      return runWithTiming(toolName, { intent: context.intent }, {
        type: "db",
        ref: "config-hints-template",
        collectedAt: new Date().toISOString(),
      }, async () => {
        const configHints = buildConfigHintsFromContext({ entities, peers });
        return {
          configHints,
          notes: [
            "Sugestoes read-only — nenhum comando e aplicado.",
            "Risco medio/alto se envolver export BGP para operadora.",
          ],
        };
      });
    }

    default:
      return {
        toolName,
        status: "skipped",
        durationMs: 0,
        input: {},
        output: {},
        source: null,
        error: "unknown tool",
      };
  }
}

export function mergeToolPayload(base: CopilotToolResultPayload, patch: CopilotToolResultPayload): CopilotToolResultPayload {
  const peers = [...(base.peers ?? []), ...(patch.peers ?? [])];
  const dedupePeers = new Map<string, NonNullable<CopilotToolResultPayload["peers"]>[number]>();
  for (const peer of peers) dedupePeers.set(`${peer.deviceId}|${peer.peerIp}|${peer.vrf ?? ""}`, peer);

  return {
    resolvedEntities: patch.resolvedEntities ?? base.resolvedEntities,
    peers: [...dedupePeers.values()],
    announcements: patch.announcements ?? base.announcements,
    circuits: patch.circuits ?? base.circuits,
    complianceFindings: [...(base.complianceFindings ?? []), ...(patch.complianceFindings ?? [])],
    l2Findings: patch.l2Findings ?? base.l2Findings,
    configHints: patch.configHints ?? base.configHints,
    routePolicies: patch.routePolicies ?? base.routePolicies,
    prefixTraces: patch.prefixTraces ?? base.prefixTraces,
    routePolicyExplains: patch.routePolicyExplains ?? base.routePolicyExplains,
    historyEvents: [...(base.historyEvents ?? []), ...(patch.historyEvents ?? [])],
    matrixTimelapse: [...(base.matrixTimelapse ?? []), ...(patch.matrixTimelapse ?? [])],
    drilldownCompares: patch.drilldownCompares ?? base.drilldownCompares,
    diagnosticTrail: patch.diagnosticTrail ?? base.diagnosticTrail,
    inventoryRefresh: patch.inventoryRefresh ?? base.inventoryRefresh,
    netboxMatches: patch.netboxMatches ?? base.netboxMatches,
    netboxSummary: patch.netboxSummary ?? base.netboxSummary,
    notes: [...new Set([...(base.notes ?? []), ...(patch.notes ?? [])])],
  };
}

export function peerAggregatesFromPayload(payload: CopilotToolResultPayload) {
  return aggregatePeersAcrossDevices(payload.peers ?? []);
}
