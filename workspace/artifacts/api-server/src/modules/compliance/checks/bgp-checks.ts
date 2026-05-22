import type { BgpPeerSummary, RoutePolicySummary } from "../../netops/device-discovery/discovery.types.js";
import type { ComplianceContext, StructuredFinding } from "../compliance-context.js";
import type { ComplianceSource } from "../confidence.js";

function policyRefs(policy: RoutePolicySummary): string[] {
  return policy.nodes.flatMap((node) => [...node.matches, ...node.applies]).filter(Boolean);
}

function hasReference(refs: string[], name: string): boolean {
  return refs.some((ref) => ref.toLowerCase().includes(name.toLowerCase()));
}

function categoryOf(peer: BgpPeerSummary): string {
  return String(peer.category ?? peer.role ?? "customer").toLowerCase();
}

function peerSource(peer: BgpPeerSummary, fallback: ComplianceSource): ComplianceSource {
  if (peer.source === "ssh_live" || peer.source === "ssh_running_config" || peer.source === "snmp_snapshot" || peer.source === "local_db") {
    return peer.source;
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

export function runBgpChecks(ctx: ComplianceContext): StructuredFinding[] {
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
  const policies = snapshot.policies ?? [];
  const policyNames = new Set(policies.map((policy) => policy.name));
  const prefixNames = new Set((snapshot.prefixLists ?? []).map((item) => item.name));
  const communityNames = new Set([...(snapshot.communities ?? []), ...(snapshot.communityLists ?? [])].map((item) => item.name));
  const findings: StructuredFinding[] = [];

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

    for (const [kind, name] of [["import", importPolicy], ["export", exportPolicy]] as const) {
      if (name && !policyNames.has(name)) {
        findings.push({
          policyKey: "huawei-bgp-route-policy-exists",
          policyName: "Route-policy referenciada existe",
          context: "bgp",
          status: "fail",
          severity: "high",
          message: `Peer ${peerIp} referencia ${kind} policy inexistente no snapshot: ${name}`,
          recommendation: "Validar nome da route-policy e discovery de policies.",
          source: peerSource(peer, ctx.source),
          confidence: ctx.confidence,
          objectType: "route_policy",
          objectId: name,
          objectName: name,
          evidence: peer,
        });
      }
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

  for (const policy of policies) {
    const refs = policyRefs(policy);
    for (const ref of refs) {
      const prefixMatch = ref.match(/ip-prefix\s+([A-Za-z0-9_.:-]+)/i);
      if (prefixMatch?.[1] && !prefixNames.has(prefixMatch[1])) {
        findings.push({
          policyKey: "huawei-route-policy-prefix-exists",
          policyName: "Prefix-list referenciada existe",
          context: "bgp",
          status: "fail",
          severity: "medium",
          message: `Route-policy ${policy.name} referencia ip-prefix ausente: ${prefixMatch[1]}`,
          source: ctx.source,
          confidence: policy.confidence,
          objectType: "route_policy",
          objectId: policy.name,
          objectName: policy.name,
          evidence: ref,
        });
      }
      const communityMatch = ref.match(/community-(?:filter|list)\s+([A-Za-z0-9_.:-]+)/i);
      if (communityMatch?.[1] && !communityNames.has(communityMatch[1])) {
        findings.push({
          policyKey: "huawei-route-policy-community-exists",
          policyName: "Community-filter/list referenciada existe",
          context: "bgp",
          status: "fail",
          severity: "medium",
          message: `Route-policy ${policy.name} referencia community ausente: ${communityMatch[1]}`,
          source: ctx.source,
          confidence: policy.confidence,
          objectType: "route_policy",
          objectId: policy.name,
          objectName: policy.name,
          evidence: ref,
        });
      }
    }
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
    });
  }

  return findings;
}
