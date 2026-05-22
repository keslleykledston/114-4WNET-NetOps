import type { BgpPeerSummary, RoutePolicySummary } from "../../netops/device-discovery/discovery.types.js";
import type { ComplianceContext, StructuredFinding } from "../compliance-context.js";
import type { ComplianceSource } from "../confidence.js";
import { normalizePolicyLookupKey, normalizePolicyObjectName } from "../../netops/huawei-vrp/parsers/policy-utils.js";
import { verifyCommunityFilterByName } from "../../netops/device-discovery/services/community-discovery.service.js";

function policyRefs(policy: RoutePolicySummary): string[] {
  return policy.nodes.flatMap((node) => [...node.matches, ...node.applies]).filter(Boolean);
}

function policyCommunityRefs(policy: RoutePolicySummary): Array<{ type: "community-filter" | "community-list"; name: string; raw: string }> {
  const refs: Array<{ type: "community-filter" | "community-list"; name: string; raw: string }> = [];
  const seen = new Set<string>();
  for (const node of policy.nodes) {
    for (const detail of node.matchDetails ?? []) {
      if (detail.type === "community-filter" || detail.type === "community-list") {
        const name = normalizePolicyObjectName(detail.name);
        const key = `${normalizePolicyLookupKey(name)}|${detail.raw}`;
        if (seen.has(key)) continue;
        seen.add(key);
        refs.push({ type: detail.type, name, raw: detail.raw });
      }
    }
    for (const ref of node.matches) {
      const communityMatch = ref.match(/community-(?:filter|list)(?:\s+(?:basic|advanced))?\s+([A-Za-z0-9_.:-]+)/i);
      if (communityMatch?.[1]) {
        const name = normalizePolicyObjectName(communityMatch[1]);
        const key = `${normalizePolicyLookupKey(name)}|${ref}`;
        if (seen.has(key)) continue;
        seen.add(key);
        refs.push({
          type: /community-filter/i.test(ref) ? "community-filter" : "community-list",
          name,
          raw: ref,
        });
      }
    }
  }
  return refs;
}

function namedLookupSet(snapshot: Record<string, unknown>, keys: string[]): Set<string> {
  const out = new Set<string>();
  for (const key of keys) {
    const value = snapshot[key];
    if (!Array.isArray(value)) continue;
    for (const item of value) {
      if (!item || typeof item !== "object") continue;
      const name = normalizePolicyObjectName(String((item as Record<string, unknown>).name ?? ""));
      if (name) out.add(normalizePolicyLookupKey(name));
    }
  }
  return out;
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

const MAX_COMMUNITY_PROOFS_PER_JOB = 50;

function buildCommunityUnknownFinding(ctx: ComplianceContext, policy: RoutePolicySummary, ref: { type: "community-filter" | "community-list"; name: string; raw: string }, message: string, confidence: StructuredFinding["confidence"] = "low"): StructuredFinding {
  return {
    policyKey: "huawei-route-policy-community-exists",
    policyName: "Community-filter/list referenciada existe",
    context: "bgp",
    status: "unknown",
    severity: "warning",
    message,
    source: ctx.source,
    confidence,
    objectType: "route_policy",
    objectId: policy.name,
    objectName: policy.name,
    evidence: { policy: policy.name, reference: ref.name, referenceType: ref.type, rawReference: ref.raw },
    metadata: { verification: "unavailable" },
  };
}

export interface BgpCheckOptions {
  verifyCommunityFilterByName?: typeof verifyCommunityFilterByName;
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
  const policies = snapshot.policies ?? [];
  const policyNames = new Set(policies.map((policy) => policy.name));
  const prefixNames = new Set((snapshot.prefixLists ?? []).map((item) => item.name));
  const snapshotRecord = snapshot as unknown as Record<string, unknown>;
  const communityFilterNames = namedLookupSet(snapshotRecord, ["communities", "communityFilters"]);
  const communityListNames = namedLookupSet(snapshotRecord, ["communityLists"]);
  const communitySetNames = namedLookupSet(snapshotRecord, ["communitySets"]);
  const hasAnyCommunityCatalog = communityFilterNames.size > 0 || communityListNames.size > 0 || communitySetNames.size > 0;
  const findings: StructuredFinding[] = [];
  const verificationCache = new Map<string, Promise<Awaited<ReturnType<typeof verifyCommunityFilterByName>>>>();
  const verifier = options.verifyCommunityFilterByName ?? verifyCommunityFilterByName;
  const maxCommunityProofs = options.maxCommunityProofs ?? MAX_COMMUNITY_PROOFS_PER_JOB;
  const canLiveProof = options.allowLiveProof ?? (String(ctx.device.vendor ?? "").toLowerCase().includes("huawei") && Boolean(ctx.device.username) && Boolean((ctx.device as unknown as Record<string, unknown>).passwordEncrypted));
  let proofLimitWarningAdded = false;

  const getCommunityProof = (name: string) => {
    const key = normalizePolicyLookupKey(name);
    const cached = verificationCache.get(key);
    if (cached) return cached;
    if (verificationCache.size >= maxCommunityProofs) return null;
    const promise = verifier(ctx.device, name);
    verificationCache.set(key, promise);
    return promise;
  };

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
    const communityRefs = policyCommunityRefs(policy);
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
    }

    for (const ref of communityRefs) {
      const key = normalizePolicyLookupKey(ref.name);
      const existsInSnapshot = ref.type === "community-filter"
        ? (communityFilterNames.has(key) || communityListNames.has(key) || communitySetNames.has(key))
        : (communityListNames.has(key) || communitySetNames.has(key));
      if (existsInSnapshot) {
        continue;
      }

      if (!hasAnyCommunityCatalog && ref.type === "community-list") {
        findings.push(buildCommunityUnknownFinding(ctx, policy, ref, `Community-list ${ref.name} referenciada, mas catálogo não foi coletado no snapshot.`));
        continue;
      }

      if (ref.type === "community-filter" && canLiveProof) {
        const proof = getCommunityProof(ref.name);
        if (!proof) {
          if (!proofLimitWarningAdded) {
            findings.push({
              policyKey: "huawei-route-policy-community-exists",
              policyName: "Community-filter/list referenciada existe",
              context: "bgp",
              status: "warning",
              severity: "warning",
              message: `Limite de ${maxCommunityProofs} provas SSH para community-filter atingido.`,
              source: ctx.source,
              confidence: "low",
              objectType: "device",
              objectId: String(ctx.device.id),
              objectName: ctx.device.hostname,
              metadata: { limit: maxCommunityProofs },
            });
            proofLimitWarningAdded = true;
          }
          findings.push(buildCommunityUnknownFinding(ctx, policy, ref, `Community-filter ${ref.name} referenciada, mas o limite de provas SSH foi atingido.`));
          continue;
        }

        const result = await proof;
        if (result.exists === true) {
          continue;
        }
        if (result.exists === false) {
          findings.push({
            policyKey: "huawei-route-policy-community-exists",
            policyName: "Community-filter/list referenciada existe",
            context: "bgp",
            status: "fail",
            severity: "medium",
            message: `Route-policy ${policy.name} referencia community-filter inexistente: ${ref.name}`,
            source: ctx.source,
            confidence: "high",
            objectType: "route_policy",
            objectId: policy.name,
            objectName: policy.name,
            evidence: {
              policy: policy.name,
              reference: ref.name,
              referenceType: ref.type,
              verifiedBy: "ssh_display",
              command: `display ip community-filter ${ref.name}`,
              listId: result.listId ?? null,
              entries: result.entries,
              rawEvidence: result.rawEvidence,
            },
            metadata: { verifiedBy: result.source },
          });
          continue;
        }

        findings.push(buildCommunityUnknownFinding(ctx, policy, ref, `Community-filter ${ref.name} referenciada, mas a prova SSH falhou ou retornou resposta ambígua.`, result.confidence));
        continue;
      }

      if (ref.type === "community-filter" && !canLiveProof) {
        findings.push(buildCommunityUnknownFinding(ctx, policy, ref, `Community-filter ${ref.name} referenciada, mas catálogo não foi coletado no snapshot.`));
        continue;
      }

      if (!hasAnyCommunityCatalog) {
        findings.push(buildCommunityUnknownFinding(ctx, policy, ref, `Community-filter ${ref.name} referenciada, mas catálogo não foi coletado no snapshot.`));
        continue;
      }

      if (!existsInSnapshot) {
        findings.push({
          policyKey: "huawei-route-policy-community-exists",
          policyName: "Community-filter/list referenciada existe",
          context: "bgp",
          status: "fail",
          severity: "medium",
          message: `Route-policy ${policy.name} referencia community ausente: ${ref.name}`,
          source: ctx.source,
          confidence: policy.confidence,
          objectType: "route_policy",
          objectId: policy.name,
          objectName: policy.name,
          evidence: ref.raw,
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
