import { shouldRemoveDependency } from "../../bgp-drill-cleanup/bgp-drill-cleanup.command-builder.js";
import type { BgpPeerCleanupAnalysis, BgpPeerCleanupDependency } from "../../bgp-drill-cleanup/bgp-drill-cleanup.types.js";
import type { BgpPeerDrilldownResult } from "../../bgp-drilldown/bgp-peer-drilldown.types.js";
import type { DeviceDiscoverySnapshot, BgpPeerSummary } from "../../netops/device-discovery/discovery.types.js";
import type {
  ChangePlanCreateInput,
  ChangePlanItemRecord,
  ChangePlanRollbackDocument,
} from "../change-plans.types.js";

function dependencyUsageCount(dep: BgpPeerCleanupDependency): number {
  if (dep.users.length > 0) return dep.users.length;
  return dep.status === "exclusive" ? 1 : 0;
}

function willBeRemoved(dep: BgpPeerCleanupDependency, recommendation: BgpPeerCleanupAnalysis["recommendation"]): boolean {
  if (recommendation === "skip") return false;
  return shouldRemoveDependency(dep as BgpPeerCleanupDependency & Record<string, unknown>);
}

function collectRelatedObjects(input: {
  analysis: BgpPeerCleanupAnalysis;
  snapshot: DeviceDiscoverySnapshot;
  drilldown: BgpPeerDrilldownResult;
}) {
  const policyNames = new Set<string>();
  for (const policy of input.drilldown.effectivePolicies) policyNames.add(policy.policyName);
  for (const policy of input.drilldown.policies) policyNames.add(policy.name);

  const prefixLists = (input.snapshot.prefixLists ?? [])
    .filter((entry) => input.analysis.dependencies.exclusive.some((dep) => dep.type === "ip-prefix" && dep.name === entry.name)
      || input.analysis.dependencies.shared.some((dep) => dep.type === "ip-prefix" && dep.name === entry.name)
      || input.analysis.dependencies.global.some((dep) => dep.type === "ip-prefix" && dep.name === entry.name)
      || input.analysis.dependencies.ambiguous.some((dep) => dep.type === "ip-prefix" && dep.name === entry.name))
    .map((entry) => ({ name: entry.name }));

  const ipv6PrefixLists = (input.snapshot.ipv6PrefixLists ?? [])
    .filter((entry) => [...input.analysis.dependencies.exclusive, ...input.analysis.dependencies.shared, ...input.analysis.dependencies.global, ...input.analysis.dependencies.ambiguous]
      .some((dep) => dep.type === "ipv6-prefix" && dep.name === entry.name))
    .map((entry) => ({ name: entry.name }));

  const communityFilters = (input.snapshot.communities ?? [])
    .filter((entry) => [...input.analysis.dependencies.exclusive, ...input.analysis.dependencies.shared, ...input.analysis.dependencies.global, ...input.analysis.dependencies.ambiguous]
      .some((dep) => dep.type === "community-filter" && dep.name === entry.name))
    .map((entry) => ({ name: entry.name }));

  const communityLists = (input.snapshot.communityLists ?? [])
    .map((entry) => ({ name: entry.name }));

  const asPathFilters = (input.snapshot.asPathFilters ?? [])
    .filter((entry) => [...input.analysis.dependencies.exclusive, ...input.analysis.dependencies.shared, ...input.analysis.dependencies.global, ...input.analysis.dependencies.ambiguous]
      .some((dep) => dep.type === "as-path-filter" && dep.name === entry.name))
    .map((entry) => ({ name: entry.name }));

  const extcommunityFilters = (input.snapshot.extcommunityFilters ?? [])
    .filter((entry) => [...input.analysis.dependencies.exclusive, ...input.analysis.dependencies.shared, ...input.analysis.dependencies.global, ...input.analysis.dependencies.ambiguous]
      .some((dep) => dep.type === "extcommunity-filter" && dep.name === entry.name))
    .map((entry) => ({ name: entry.name }));

  return {
    routePolicies: [...policyNames].map((name) => ({
      name,
      direction: input.drilldown.effectivePolicies.find((policy) => policy.policyName === name)?.direction ?? null,
    })),
    prefixLists,
    ipv6PrefixLists,
    communityFilters,
    communityLists,
    asPathFilters,
    extcommunityFilters,
  };
}

function dependencyToItem(dep: BgpPeerCleanupDependency, recommendation: BgpPeerCleanupAnalysis["recommendation"]): ChangePlanItemRecord {
  return {
    itemType: dep.type,
    itemName: dep.name,
    classification: dep.status,
    usageCount: dependencyUsageCount(dep),
    willBeRemoved: willBeRemoved(dep, recommendation),
    reason: dep.reason ?? dep.evidence,
    users: dep.users.map((user) => ({
      peerIp: user.peerIp,
      state: user.state,
      vrf: user.vrf,
      afi: user.afi,
      safi: user.safi,
    })),
    metadata: {
      evidence: dep.evidence,
      source: dep.source ?? "discovery",
    },
  };
}

function buildBeforeState(input: {
  peer: BgpPeerSummary;
  analysis: BgpPeerCleanupAnalysis;
  related: ReturnType<typeof collectRelatedObjects>;
}): Record<string, unknown[]> {
  return {
    "bgp-peer": [{
      name: input.peer.peerIp,
      vrf: input.peer.vrf ?? null,
      family: input.peer.addressFamily,
      remoteAs: input.peer.remoteAs ?? null,
      importPolicy: input.peer.importPolicy ?? null,
      exportPolicy: input.peer.exportPolicy ?? null,
      state: input.peer.state,
    }],
    "route-policy": input.related.routePolicies.map((entry) => ({ name: entry.name, direction: entry.direction })),
    "ip-prefix": input.related.prefixLists.map((entry) => ({ name: entry.name })),
    "ipv6-prefix": input.related.ipv6PrefixLists.map((entry) => ({ name: entry.name })),
    "community-filter": input.related.communityFilters.map((entry) => ({ name: entry.name })),
    "community-list": input.related.communityLists.map((entry) => ({ name: entry.name })),
    "as-path-filter": input.related.asPathFilters.map((entry) => ({ name: entry.name })),
    "extcommunity-filter": input.related.extcommunityFilters.map((entry) => ({ name: entry.name })),
  };
}

function buildAfterState(input: {
  beforeState: Record<string, unknown[]>;
  analysis: BgpPeerCleanupAnalysis;
}): Record<string, unknown[]> {
  if (input.analysis.recommendation === "skip") return structuredClone(input.beforeState);

  const removedKeys = new Set(
    input.analysis.dependencies.exclusive
      .filter((dep) => willBeRemoved(dep, input.analysis.recommendation))
      .map((dep) => `${dep.type}::${dep.name}`),
  );
  removedKeys.add(`bgp-peer::${input.analysis.peerIp}`);

  const after: Record<string, unknown[]> = {};
  for (const [type, entries] of Object.entries(input.beforeState)) {
    after[type] = entries.filter((entry) => {
      const name = entry && typeof entry === "object" && "name" in entry ? String((entry as { name: string }).name) : String(entry);
      return !removedKeys.has(`${type}::${name}`);
    });
  }
  return after;
}

function bgpFamilyForAfi(afi: string): "ipv4" | "ipv6" {
  return afi === "ipv6" ? "ipv6" : "ipv4";
}

export function buildBgpCleanupRollbackDocument(input: {
  analysis: BgpPeerCleanupAnalysis;
  peer: BgpPeerSummary;
  snapshot: DeviceDiscoverySnapshot;
}): ChangePlanRollbackDocument {
  const warnings: string[] = [
    "Rollback documental apenas — nenhum comando será executado automaticamente.",
    "Recriar objetos exclusivos a partir da configuração coletada / snapshot antes da remoção.",
  ];
  const steps: ChangePlanRollbackDocument["steps"] = [];
  const dependencies: ChangePlanRollbackDocument["dependencies"] = [];
  const script: string[] = ["system-view"];

  if (input.analysis.recommendation === "skip") {
    return {
      valid: false,
      script: [],
      steps: [],
      dependencies: [],
      warnings: [...warnings, "Plano marcado como skip — rollback indisponível."],
    };
  }

  const localAs = input.analysis.localAs ?? input.snapshot.parsed_config?.bgp_peer_model?.localAs ?? null;
  script.push(`bgp ${localAs ?? "<ASN>"}`);

  const family = bgpFamilyForAfi(input.analysis.afi);
  if (input.analysis.vrf) {
    script.push(`${family}-family vpn-instance ${input.analysis.vrf}`);
  }

  if (input.peer.remoteAs) {
    script.push(`peer ${input.peer.peerIp} as-number ${input.peer.remoteAs}`);
    steps.push({ order: steps.length + 1, action: "restore-peer", target: input.peer.peerIp, note: "Restaurar sessão BGP" });
  } else {
    warnings.push(`remote-as do peer ${input.peer.peerIp} indisponível no snapshot; completar rollback manualmente.`);
  }

  if (input.peer.importPolicy) {
    script.push(`peer ${input.peer.peerIp} import ${input.peer.importPolicy}`);
    dependencies.push({ type: "route-policy", name: input.peer.importPolicy });
  }
  if (input.peer.exportPolicy) {
    script.push(`peer ${input.peer.peerIp} export ${input.peer.exportPolicy}`);
    dependencies.push({ type: "route-policy", name: input.peer.exportPolicy });
  }

  if (input.analysis.vrf) script.push("quit");

  const exclusiveToRestore = input.analysis.dependencies.exclusive
    .filter((dep) => willBeRemoved(dep, input.analysis.recommendation));

  script.push("quit");
  for (const dep of exclusiveToRestore) {
    dependencies.push({ type: dep.type, name: dep.name });
    steps.push({
      order: steps.length + 1,
      action: "restore-object",
      target: `${dep.type} ${dep.name}`,
      note: "Recriar objeto a partir do snapshot / config coletada",
    });
    switch (dep.type) {
      case "route-policy":
        script.push(`# route-policy ${dep.name} — restaurar definição completa do snapshot`);
        break;
      case "ip-prefix":
        script.push(`# ip ip-prefix ${dep.name} — restaurar entradas do snapshot`);
        break;
      case "ipv6-prefix":
        script.push(`# ip ipv6-prefix ${dep.name} — restaurar entradas do snapshot`);
        break;
      case "community-filter":
        script.push(`# ip community-filter ${dep.name} — restaurar entradas do snapshot`);
        break;
      case "as-path-filter":
        script.push(`# ip as-path-filter ${dep.name} — restaurar entradas do snapshot`);
        break;
      case "extcommunity-filter":
        script.push(`# ip extcommunity-filter ${dep.name} — restaurar entradas do snapshot`);
        break;
      default:
        script.push(`# ${dep.type} ${dep.name} — restaurar manualmente`);
        break;
    }
  }

  script.push("commit");

  const valid = Boolean(input.peer.remoteAs);
  if (!valid) warnings.push("Rollback incompleto — revisão humana obrigatória antes de qualquer tentativa de restauração.");

  return { valid, script, steps, dependencies, warnings };
}

export function buildChangePlanInputFromBgpCleanup(input: {
  analysis: BgpPeerCleanupAnalysis;
  peer: BgpPeerSummary;
  snapshot: DeviceDiscoverySnapshot;
  drilldown: BgpPeerDrilldownResult;
  hostname?: string | null;
  createdBy?: string | null;
  sourceAnalysisId: number;
}): ChangePlanCreateInput {
  const related = collectRelatedObjects(input);
  const rollback = buildBgpCleanupRollbackDocument(input);
  const beforeState = buildBeforeState({ peer: input.peer, analysis: input.analysis, related });
  const afterState = buildAfterState({ beforeState, analysis: input.analysis });

  const allDependencies = [
    ...input.analysis.dependencies.exclusive,
    ...input.analysis.dependencies.shared,
    ...input.analysis.dependencies.global,
    ...input.analysis.dependencies.ambiguous,
  ];

  const items: ChangePlanItemRecord[] = [
    {
      itemType: "bgp-peer",
      itemName: input.peer.peerIp,
      classification: "exclusive",
      usageCount: 1,
      willBeRemoved: input.analysis.recommendation !== "skip",
      reason: "Peer alvo do plano de remoção",
      users: [{
        peerIp: input.peer.peerIp,
        state: input.peer.state,
        vrf: input.peer.vrf ?? null,
        afi: input.peer.addressFamily,
        safi: "unicast",
      }],
      metadata: {
        remoteAs: input.peer.remoteAs ?? null,
        importPolicy: input.peer.importPolicy ?? null,
        exportPolicy: input.peer.exportPolicy ?? null,
      },
    },
    ...allDependencies.map((dep) => dependencyToItem(dep, input.analysis.recommendation)),
  ];

  const findings = [
    ...input.analysis.blockedReasons.map((entry) => `BLOCKED: ${entry}`),
    ...input.analysis.warnings,
  ];

  return {
    module: "bgp_cleanup",
    changeType: "peer_removal",
    deviceId: input.analysis.deviceId,
    hostname: input.hostname ?? null,
    createdBy: input.createdBy ?? null,
    sourceObjectType: "bgp_cleanup_analysis",
    sourceObjectId: String(input.sourceAnalysisId),
    metadata: {
      peerIp: input.analysis.peerIp,
      vrf: input.analysis.vrf,
      family: input.analysis.afi,
      recommendation: input.analysis.recommendation,
      riskLevel: input.analysis.riskLevel,
      analysisId: input.sourceAnalysisId,
    },
    snapshot: {
      deviceId: input.analysis.deviceId,
      hostname: input.hostname ?? null,
      peerIp: input.analysis.peerIp,
      peerGroup: input.drilldown.root.group ?? null,
      vrf: input.analysis.vrf,
      family: input.analysis.afi,
      timestamp: input.analysis.collectedAt ?? new Date().toISOString(),
      routePolicies: related.routePolicies,
      prefixLists: related.prefixLists,
      ipv6PrefixLists: related.ipv6PrefixLists,
      communityFilters: related.communityFilters,
      communityLists: related.communityLists,
      asPathFilters: related.asPathFilters,
      extcommunityFilters: related.extcommunityFilters,
      globalPreserved: input.analysis.dependencies.global.map((dep) => ({
        type: dep.type,
        name: dep.name,
        reason: dep.reason ?? null,
      })),
      suggestedScript: input.analysis.script.removalCommands,
      suggestedRollback: rollback,
      validations: {
        before: input.analysis.script.validationBefore,
        after: input.analysis.script.validationAfter,
      },
      findings,
      impact: {
        recommendation: input.analysis.recommendation,
        riskLevel: input.analysis.riskLevel,
        blockedReasons: input.analysis.blockedReasons,
        warnings: input.analysis.warnings,
      },
      sourceModule: "bgp_cleanup",
      sourceAnalysisId: input.sourceAnalysisId,
    },
    items,
    beforeState,
    afterState,
    rollback,
  };
}
