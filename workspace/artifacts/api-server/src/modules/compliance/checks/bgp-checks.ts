import type { BgpPeerSummary } from "../../netops/device-discovery/discovery.types.js";
import type { ComplianceContext, StructuredFinding } from "../compliance-context.js";
import type { ComplianceSource } from "../confidence.js";
import { buildPolicyDependencyConfigFromSnapshot } from "../../netops/huawei-vrp/parsers/policy-dependency-pipeline.js";

function categoryOf(peer: BgpPeerSummary): string {
  return String(peer.category ?? peer.role ?? "customer").toLowerCase();
}

function peerSource(peer: BgpPeerSummary, fallback: ComplianceSource): ComplianceSource {
  if (peer.source === "ssh_live" || peer.source === "ssh_running_config" || peer.source === "snmp_snapshot" || peer.source === "local_db") {
    return peer.source;
  }
  return fallback;
}

function dependencySource(source: string, fallback: ComplianceSource): ComplianceSource {
  if (source === "ssh_live" || source === "ssh_running_config" || source === "snmp_snapshot" || source === "local_db") {
    return source;
  }
  return fallback;
}

function peerName(peer: BgpPeerSummary): string {
  const row = peer as unknown as Record<string, unknown>;
  return String(peer.description ?? row.peerName ?? peer.peerIp);
}

function routeCounter(peer: BgpPeerSummary, key: "receivedRoutes" | "advertisedRoutes"): number | null {
  const row = peer as unknown as Record<string, unknown>;
  const value = row[key];
  return typeof value === "number" ? value : null;
}

function policyValue(peer: BgpPeerSummary, key: "import" | "export"): string | null {
  const value = key === "import"
    ? (peer.importPolicy ?? (peer as unknown as Record<string, unknown>).importRoutePolicy)
    : (peer.exportPolicy ?? (peer as unknown as Record<string, unknown>).exportRoutePolicy);
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export interface BgpCheckOptions {
  allowLiveProof?: boolean;
  maxCommunityProofs?: number;
}

export async function runBgpChecks(ctx: ComplianceContext, options: BgpCheckOptions = {}): Promise<StructuredFinding[]> {
  const snapshot = ctx.snapshot;
  if (!snapshot) {
    return [{
      policyKey: "huawei-bgp-snapshot-present",
      policyName: "BGP no snapshot",
      context: "bgp",
      status: "unknown",
      severity: "warning",
      message: "BGP não avaliado: snapshot ausente.",
      recommendation: "Execute discovery com contexto BGP.",
      source: ctx.source,
      confidence: ctx.confidence,
      objectType: "device",
      objectId: String(ctx.device.id),
      objectName: ctx.device.hostname,
    }];
  }

  const peers = snapshot.bgpPeers ?? [];
  const policyConfig = buildPolicyDependencyConfigFromSnapshot(snapshot, { rawConfig: ctx.rawConfig });
  const findings: StructuredFinding[] = [];
  const dependencyEvidence: string[] = [];

  for (const peer of peers) {
    const peerIp = peer.peerIp;
    const category = categoryOf(peer);
    const state = String(peer.state ?? "").toLowerCase();
    const established = state === "established";
    const isCustomer = category === "customer" || category === "cliente";
    const isTransit = ["provider", "operadora", "ix", "cdn"].includes(category);
    const importPolicy = policyValue(peer, "import");
    const exportPolicy = policyValue(peer, "export");

    findings.push({
      policyKey: "huawei-bgp-peer-established",
      policyName: "Peer BGP Established",
      context: "bgp",
      status: established ? "pass" : (category === "ibgp" ? "warning" : "fail"),
      severity: established ? "info" : (category === "ibgp" ? "medium" : "high"),
      message: established ? `Peer ${peerIp} Established.` : `Peer ${peerIp} state=${peer.state ?? "unknown"}.`,
      recommendation: established ? undefined : "Validar sessão BGP, transporte, AS remoto e filtros.",
      source: peerSource(peer, ctx.source),
      confidence: peer.confidence ?? ctx.confidence,
      objectType: "bgp_peer",
      objectId: peerIp,
      objectName: peerName(peer),
      evidence: peer.evidence ?? peer,
    });

    if (!peer.description && peerName(peer) === peer.peerIp) {
      findings.push({
        policyKey: "huawei-bgp-peer-description",
        policyName: "Peer BGP com descrição",
        context: "bgp",
        status: "warning",
        severity: "low",
        message: `Peer ${peerIp} sem description/nome.`,
        recommendation: "Configurar descrição do peer.",
        source: peerSource(peer, ctx.source),
        confidence: peer.confidence ?? ctx.confidence,
        objectType: "bgp_peer",
        objectId: peerIp,
        objectName: peerIp,
        evidence: peer.evidence ?? peer,
      });
    }

    if (isCustomer && !importPolicy) {
      findings.push({
        policyKey: "huawei-bgp-customer-import-policy",
        policyName: "Cliente com import policy",
        context: "bgp",
        status: "fail",
        severity: "high",
        message: `Cliente ${peerIp} sem import policy.`,
        recommendation: "Aplicar import route-policy para controlar prefixos recebidos.",
        source: peerSource(peer, ctx.source),
        confidence: peer.confidence ?? ctx.confidence,
        objectType: "bgp_peer",
        objectId: peerIp,
        objectName: peer.description ?? peerIp,
        evidence: peer,
      });
    }

    if (isTransit && !exportPolicy) {
      findings.push({
        policyKey: "huawei-bgp-transit-export-policy",
        policyName: "Operadora/IX/CDN com export policy",
        context: "bgp",
        status: "fail",
        severity: "high",
        message: `Peer ${category} ${peerIp} sem export policy.`,
        recommendation: "Aplicar export route-policy para controlar anúncios.",
        source: peerSource(peer, ctx.source),
        confidence: peer.confidence ?? ctx.confidence,
        objectType: "bgp_peer",
        objectId: peerIp,
        objectName: peer.description ?? peerIp,
        evidence: peer,
      });
    }

    const receivedRoutes = routeCounter(peer, "receivedRoutes");
    const advertisedRoutes = routeCounter(peer, "advertisedRoutes");

    if (isCustomer && receivedRoutes === 0) {
      findings.push({
        policyKey: "huawei-bgp-customer-received-routes",
        policyName: "Cliente anuncia prefixos",
        context: "bgp",
        status: "warning",
        severity: "medium",
        message: `Cliente ${peerIp} com receivedRoutes=0.`,
        recommendation: "Validar se cliente deveria anunciar prefixos.",
        source: peerSource(peer, ctx.source),
        confidence: peer.confidence ?? ctx.confidence,
        objectType: "bgp_peer",
        objectId: peerIp,
        objectName: peer.description ?? peerIp,
        evidence: { receivedRoutes },
      });
    }

    if (isTransit && advertisedRoutes === 0) {
      findings.push({
        policyKey: "huawei-bgp-transit-advertised-routes",
        policyName: "Operadora/IX/CDN recebe anúncios",
        context: "bgp",
        status: "warning",
        severity: "medium",
        message: `Peer ${category} ${peerIp} com advertisedRoutes=0.`,
        recommendation: "Validar export policy e tabela BGP.",
        source: peerSource(peer, ctx.source),
        confidence: peer.confidence ?? ctx.confidence,
        objectType: "bgp_peer",
        objectId: peerIp,
        objectName: peer.description ?? peerIp,
        evidence: { advertisedRoutes },
      });
    }
  }

  for (const dep of policyConfig.dependency_graph.route_policy_dependencies) {
    if (dep.status === "FOUND") {
      dependencyEvidence.push(dep.evidence);
      continue;
    }

    findings.push({
      policyKey: `huawei-route-policy-${dep.dependencyType}-exists`,
      policyName: `${dep.dependencyType} referenciada existe`,
      context: "bgp",
      status: dep.status === "MISSING" ? "fail" : "unknown",
      severity: dep.status === "MISSING" ? "medium" : "warning",
      message: dep.evidence,
      source: dependencySource(dep.source, ctx.source),
      confidence: dep.status === "MISSING" ? "high" : "low",
      objectType: "route_policy",
      objectId: dep.routePolicy,
      objectName: dep.routePolicy,
      evidence: {
        routePolicy: dep.routePolicy,
        node: dep.node,
        dependencyType: dep.dependencyType,
        dependencyName: dep.dependencyName,
        rawReference: dep.raw,
        source: dep.source,
        reason: dep.reason,
      },
      metadata: {
        dependencyStatus: dep.status,
        configBuildSource: policyConfig.configBuildSource ?? "snapshot_aggregate",
      },
    });
  }

  for (const binding of policyConfig.dependency_graph.bgp_policy_bindings) {
    if (binding.status === "FOUND") {
      dependencyEvidence.push(binding.evidence);
      continue;
    }

    findings.push({
      policyKey: "huawei-bgp-route-policy-exists",
      policyName: "Route-policy referenciada existe",
      context: "bgp",
      status: binding.status === "MISSING" ? "fail" : "unknown",
      severity: binding.status === "MISSING" ? "high" : "warning",
      message: binding.evidence,
      recommendation: binding.status === "MISSING" ? "Validar nome da route-policy e discovery de policies." : "Executar discovery com policies.",
      source: dependencySource(binding.source, ctx.source),
      confidence: binding.status === "MISSING" ? "high" : "low",
      objectType: "route_policy",
      objectId: binding.routePolicy,
      objectName: binding.routePolicy,
      evidence: binding,
      metadata: {
        dependencyStatus: binding.status,
        configBuildSource: policyConfig.configBuildSource ?? "snapshot_aggregate",
      },
    });
  }

  if (dependencyEvidence.length > 0) {
    findings.push({
      policyKey: "huawei-policy-dependency-evidence",
      policyName: "Dependências BGP encontradas",
      context: "bgp",
      status: "pass",
      severity: "info",
      message: `${dependencyEvidence.length} dependências BGP/route-policy encontradas no snapshot.`,
      source: ctx.source,
      confidence: ctx.confidence,
      objectType: "device",
      objectId: String(ctx.device.id),
      objectName: ctx.device.hostname,
      evidence: { routePolicyDependencies: dependencyEvidence },
    });
  }

  if (findings.length === 0) {
    findings.push({
      policyKey: "huawei-bgp-structured-pass",
      policyName: "BGP estruturado",
      context: "bgp",
      status: "pass",
      severity: "info",
      message: `${peers.length} peers BGP avaliados sem achados.`,
      source: ctx.source,
      confidence: ctx.confidence,
      objectType: "device",
      objectId: String(ctx.device.id),
      objectName: ctx.device.hostname,
      evidence: dependencyEvidence.length > 0 ? { routePolicyDependencies: dependencyEvidence } : undefined,
    });
  }

  return findings;
}
