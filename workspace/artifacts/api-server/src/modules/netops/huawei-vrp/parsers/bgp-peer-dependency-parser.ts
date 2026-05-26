import type { DiscoverySource } from "../../device-discovery/discovery.types.js";
import type { BgpPolicyBindingDependency, CatalogStatus, DependencyStatus } from "./policy-dependency-pipeline.js";
import { normalizePolicyLookupKey, normalizePolicyObjectName } from "./policy-utils.js";

export type BgpAfiSafi =
  | "ipv4_unicast"
  | "ipv6_unicast"
  | "vpnv4"
  | "vpnv6"
  | "ipv4_vrf"
  | "ipv6_vrf"
  | "unknown";

export interface BgpPeerRoot {
  peerKey: string;
  peerAddressOrName: string;
  isGroup: boolean;
  asNumber: number | null;
  description: string | null;
  groupName: string | null;
  connectInterface: string | null;
  sourceContext: "bgp_root";
  rawEvidence: string[];
}

export interface BgpPeerFamily {
  peerKey: string;
  peerAddressOrName: string;
  isGroup: boolean;
  afiSafi: BgpAfiSafi;
  familyName: string;
  vrfName: string | null;
  enabled: boolean;
  importRoutePolicy: string | null;
  exportRoutePolicy: string | null;
  defaultRouteAdvertise: boolean;
  nextHopLocal: boolean;
  advertiseCommunity: boolean;
  advertiseExtCommunity: boolean;
  reflectClient: boolean;
  groupName: string | null;
  inheritedFromGroup: boolean;
  inheritedGroup: string | null;
  effectiveImportRoutePolicy: string | null;
  effectiveExportRoutePolicy: string | null;
  effectiveNextHopLocal: boolean;
  effectiveAdvertiseCommunity: boolean;
  effectiveAdvertiseExtCommunity: boolean;
  rawEvidence: string[];
}

export interface BgpPeerPolicyDependency {
  peerKey: string;
  peerAddressOrName: string;
  afiSafi: BgpAfiSafi;
  dependencyType: "route-policy";
  dependencyName: string;
  direction: "import" | "export";
  sourceLine: string;
  inheritedFromGroup: boolean;
  inheritedGroup: string | null;
  status: DependencyStatus;
  evidence: string;
  reason?: string;
}

export interface ParsedHuaweiBgpPeerDependencyModel {
  localAs: number | null;
  roots: Record<string, BgpPeerRoot>;
  families: BgpPeerFamily[];
  peer_policy_dependencies: BgpPeerPolicyDependency[];
  root_context_loaded: boolean;
}

const RE_BGP = /^bgp\s+(\d+)\s*$/i;
const RE_FAMILY = /^(ipv4-family|ipv6-family)\s+(.+)$/i;
const RE_PEER_AS = /^peer\s+(\S+)\s+as-number\s+(\d+)\s*$/i;
const RE_PEER_DESC = /^peer\s+(\S+)\s+description\s+(.+)$/i;
const RE_PEER_GROUP = /^peer\s+(\S+)\s+group\s+(\S+)\s*$/i;
const RE_PEER_CONNECT = /^peer\s+(\S+)\s+connect-interface\s+(\S+)\s*$/i;
const RE_PEER_ENABLE = /^peer\s+(\S+)\s+enable\s*$/i;
const RE_PEER_RP = /^peer\s+(\S+)\s+route-policy\s+(\S+)\s+(import|export)\s*$/i;
const RE_PEER_DEFAULT = /^peer\s+(\S+)\s+default-route-advertise\s*$/i;
const RE_PEER_NHL = /^peer\s+(\S+)\s+next-hop-local\s*$/i;
const RE_PEER_COMM = /^peer\s+(\S+)\s+advertise-community\s*$/i;
const RE_PEER_EXTCOMM = /^peer\s+(\S+)\s+advertise-ext-community\s*$/i;
const RE_PEER_REFLECT = /^peer\s+(\S+)\s+reflect-client\s*$/i;

function leadingSpaces(line: string): number {
  const m = /^(\s*)/.exec(line);
  return m?.[1]?.length ?? 0;
}

function isLikelyIpOrName(value: string): boolean {
  if (value.includes(":")) return true;
  if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(value)) return true;
  return false;
}

function peerKeyFor(name: string): string {
  return normalizePolicyLookupKey(name);
}

function parseFamilyHeader(kind: string, rest: string): { afiSafi: BgpAfiSafi; familyName: string; vrfName: string | null } {
  const lower = rest.trim().toLowerCase();
  if (kind.toLowerCase() === "ipv4-family") {
    if (lower === "unicast") return { afiSafi: "ipv4_unicast", familyName: "ipv4-family unicast", vrfName: null };
    if (lower === "vpnv4") return { afiSafi: "vpnv4", familyName: "ipv4-family vpnv4", vrfName: null };
    if (lower.startsWith("vpn-instance ")) {
      return { afiSafi: "ipv4_vrf", familyName: `ipv4-family ${rest.trim()}`, vrfName: rest.trim().replace(/^vpn-instance\s+/i, "") };
    }
  }
  if (kind.toLowerCase() === "ipv6-family") {
    if (lower === "unicast") return { afiSafi: "ipv6_unicast", familyName: "ipv6-family unicast", vrfName: null };
    if (lower === "vpnv6") return { afiSafi: "vpnv6", familyName: "ipv6-family vpnv6", vrfName: null };
    if (lower.startsWith("vpn-instance ")) {
      return { afiSafi: "ipv6_vrf", familyName: `ipv6-family ${rest.trim()}`, vrfName: rest.trim().replace(/^vpn-instance\s+/i, "") };
    }
  }
  return { afiSafi: "unknown", familyName: `${kind} ${rest}`.trim(), vrfName: null };
}

function familyBindingKey(afiSafi: BgpAfiSafi, peerKey: string): string {
  return `${afiSafi}|${peerKey}`;
}

function applyInheritance(model: ParsedHuaweiBgpPeerDependencyModel): void {
  const byFamily = new Map<string, BgpPeerFamily[]>();
  for (const entry of model.families) {
    const list = byFamily.get(entry.afiSafi) ?? [];
    list.push(entry);
    byFamily.set(entry.afiSafi, list);
  }

  for (const [, entries] of byFamily) {
    const byKey = new Map(entries.map((entry) => [entry.peerKey, entry]));

    for (const entry of entries) {
      entry.effectiveImportRoutePolicy = entry.importRoutePolicy;
      entry.effectiveExportRoutePolicy = entry.exportRoutePolicy;
      entry.effectiveNextHopLocal = entry.nextHopLocal;
      entry.effectiveAdvertiseCommunity = entry.advertiseCommunity;
      entry.effectiveAdvertiseExtCommunity = entry.advertiseExtCommunity;
      entry.inheritedFromGroup = false;
      entry.inheritedGroup = null;

      if (!entry.groupName) continue;
      const group = byKey.get(peerKeyFor(entry.groupName));
      if (!group) continue;

      if (!entry.effectiveImportRoutePolicy && group.importRoutePolicy) {
        entry.effectiveImportRoutePolicy = group.importRoutePolicy;
        entry.inheritedFromGroup = true;
        entry.inheritedGroup = group.peerAddressOrName;
      }
      if (!entry.effectiveExportRoutePolicy && group.exportRoutePolicy) {
        entry.effectiveExportRoutePolicy = group.exportRoutePolicy;
        entry.inheritedFromGroup = true;
        entry.inheritedGroup = group.peerAddressOrName;
      }
      if (!entry.effectiveNextHopLocal && group.nextHopLocal) {
        entry.effectiveNextHopLocal = true;
        entry.inheritedFromGroup = true;
        entry.inheritedGroup = group.peerAddressOrName;
      }
      if (!entry.effectiveAdvertiseCommunity && group.advertiseCommunity) {
        entry.effectiveAdvertiseCommunity = true;
        entry.inheritedFromGroup = true;
        entry.inheritedGroup = group.peerAddressOrName;
      }
      if (!entry.effectiveAdvertiseExtCommunity && group.advertiseExtCommunity) {
        entry.effectiveAdvertiseExtCommunity = true;
        entry.inheritedFromGroup = true;
        entry.inheritedGroup = group.peerAddressOrName;
      }
    }

    for (const entry of entries) {
      if (!entry.effectiveImportRoutePolicy) entry.effectiveImportRoutePolicy = entry.importRoutePolicy;
      if (!entry.effectiveExportRoutePolicy) entry.effectiveExportRoutePolicy = entry.exportRoutePolicy;
      if (!entry.effectiveNextHopLocal) entry.effectiveNextHopLocal = entry.nextHopLocal;
      if (!entry.effectiveAdvertiseCommunity) entry.effectiveAdvertiseCommunity = entry.advertiseCommunity;
      if (!entry.effectiveAdvertiseExtCommunity) entry.effectiveAdvertiseExtCommunity = entry.advertiseExtCommunity;
    }
  }
}

function bindingEvidencePeer(
  peer: string,
  afiSafi: BgpAfiSafi,
  direction: "import" | "export",
  policy: string,
  status: DependencyStatus,
  source: DiscoverySource,
  inheritedFromGroup: boolean,
  inheritedGroup: string | null,
  reason?: string,
): string {
  const familyLabel = afiSafi.replace(/_/g, "/");
  if (status === "FOUND") {
    return inheritedFromGroup
      ? `Peer ${peer} em ${familyLabel} herda route-policy ${policy} ${direction} do peer-group ${inheritedGroup}; encontrada no snapshot (${source}).`
      : `Peer ${peer} em ${familyLabel} route-policy ${policy} ${direction} encontrada no snapshot (${source}).`;
  }
  if (status === "MISSING") {
    return inheritedFromGroup
      ? `Peer ${peer} em ${familyLabel} herda route-policy ${policy} ${direction} do peer-group ${inheritedGroup}, mas ela não foi encontrada no snapshot (${source}).`
      : `Peer ${peer} em ${familyLabel} referencia route-policy ${policy} ${direction}, mas ela não foi encontrada no snapshot (${source}).`;
  }
  return `Catálogo route-policy indisponível para peer ${peer} em ${familyLabel}; motivo=${reason ?? "unknown"}; source=${source}.`;
}

export function parseHuaweiBgpPeerDependencies(
  configText: string,
  source: DiscoverySource = "ssh_running_config",
): ParsedHuaweiBgpPeerDependencyModel {
  const model: ParsedHuaweiBgpPeerDependencyModel = {
    localAs: null,
    roots: {},
    families: [],
    peer_policy_dependencies: [],
    root_context_loaded: false,
  };

  const lines = (configText || "").replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
  let inBgp = false;
  let bgpIndent = -1;
  let currentFamily: { afiSafi: BgpAfiSafi; familyName: string; vrfName: string | null; familyIndent: number } | null = null;
  const familyEntries = new Map<string, BgpPeerFamily>();

  const ensureRoot = (name: string, isGroup: boolean): BgpPeerRoot => {
    const key = peerKeyFor(name);
    const existing = model.roots[key];
    if (existing) return existing;
    const row: BgpPeerRoot = {
      peerKey: key,
      peerAddressOrName: normalizePolicyObjectName(name),
      isGroup,
      asNumber: null,
      description: null,
      groupName: null,
      connectInterface: null,
      sourceContext: "bgp_root",
      rawEvidence: [],
    };
    model.roots[key] = row;
    return row;
  };

  const ensureFamily = (name: string, isGroup: boolean): BgpPeerFamily | null => {
    if (!currentFamily) return null;
    const key = peerKeyFor(name);
    const mapKey = familyBindingKey(currentFamily.afiSafi, key);
    let row = familyEntries.get(mapKey);
    if (!row) {
      row = {
        peerKey: key,
        peerAddressOrName: normalizePolicyObjectName(name),
        isGroup,
        afiSafi: currentFamily.afiSafi,
        familyName: currentFamily.familyName,
        vrfName: currentFamily.vrfName,
        enabled: false,
        importRoutePolicy: null,
        exportRoutePolicy: null,
        defaultRouteAdvertise: false,
        nextHopLocal: false,
        advertiseCommunity: false,
        advertiseExtCommunity: false,
        reflectClient: false,
        groupName: null,
        inheritedFromGroup: false,
        inheritedGroup: null,
        effectiveImportRoutePolicy: null,
        effectiveExportRoutePolicy: null,
        effectiveNextHopLocal: false,
        effectiveAdvertiseCommunity: false,
        effectiveAdvertiseExtCommunity: false,
        rawEvidence: [],
      };
      familyEntries.set(mapKey, row);
      model.families.push(row);
    }
    return row;
  };

  for (const rawLine of lines) {
    const indent = leadingSpaces(rawLine);
    const line = rawLine.trim();
    if (!line || line === "#") continue;

    const bgpMatch = RE_BGP.exec(line);
    if (bgpMatch && indent === 0) {
      inBgp = true;
      bgpIndent = indent;
      model.localAs = Number(bgpMatch[1]);
      model.root_context_loaded = true;
      currentFamily = null;
      continue;
    }

    if (!inBgp) continue;

    if (indent <= bgpIndent && !line.startsWith("peer ") && !RE_FAMILY.test(line)) {
      if (!RE_BGP.test(line)) {
        inBgp = false;
        currentFamily = null;
      }
      continue;
    }

    const familyMatch = RE_FAMILY.exec(line);
    if (familyMatch && indent === bgpIndent + 1) {
      currentFamily = { ...parseFamilyHeader(familyMatch[1], familyMatch[2]), familyIndent: indent };
      continue;
    }

    if (indent === bgpIndent + 1 && !currentFamily) {
      const asMatch = RE_PEER_AS.exec(line);
      if (asMatch) {
        const name = asMatch[1];
        const isGroup = !isLikelyIpOrName(name);
        const root = ensureRoot(name, isGroup);
        root.asNumber = Number(asMatch[2]);
        root.isGroup = isGroup;
        root.rawEvidence.push(line);
        continue;
      }
      const descMatch = RE_PEER_DESC.exec(line);
      if (descMatch) {
        const root = ensureRoot(descMatch[1], !isLikelyIpOrName(descMatch[1]));
        root.description = descMatch[2].trim();
        root.rawEvidence.push(line);
        continue;
      }
      const connectMatch = RE_PEER_CONNECT.exec(line);
      if (connectMatch) {
        const root = ensureRoot(connectMatch[1], !isLikelyIpOrName(connectMatch[1]));
        root.connectInterface = connectMatch[2];
        root.rawEvidence.push(line);
        continue;
      }
    }

    if (currentFamily && indent >= bgpIndent + 2) {
      const peerNameFromLine = (m: RegExpExecArray) => m[1];
      const enableMatch = RE_PEER_ENABLE.exec(line);
      if (enableMatch) {
        const name = enableMatch[1];
        const fam = ensureFamily(name, !isLikelyIpOrName(name));
        if (fam) {
          fam.enabled = true;
          fam.rawEvidence.push(line);
        }
        continue;
      }
      const rpMatch = RE_PEER_RP.exec(line);
      if (rpMatch) {
        const name = rpMatch[1];
        const policy = normalizePolicyObjectName(rpMatch[2]);
        const direction = rpMatch[3].toLowerCase() as "import" | "export";
        const fam = ensureFamily(name, !isLikelyIpOrName(name));
        if (fam) {
          if (direction === "import") fam.importRoutePolicy = policy;
          else fam.exportRoutePolicy = policy;
          fam.rawEvidence.push(line);
        }
        continue;
      }
      const groupMatch = RE_PEER_GROUP.exec(line);
      if (groupMatch) {
        const fam = ensureFamily(groupMatch[1], isLikelyIpOrName(groupMatch[1]));
        if (fam) {
          fam.groupName = normalizePolicyObjectName(groupMatch[2]);
          fam.rawEvidence.push(line);
        }
        continue;
      }
      const defaultMatch = RE_PEER_DEFAULT.exec(line);
      if (defaultMatch) {
        const fam = ensureFamily(defaultMatch[1], !isLikelyIpOrName(defaultMatch[1]));
        if (fam) { fam.defaultRouteAdvertise = true; fam.rawEvidence.push(line); }
        continue;
      }
      const nhlMatch = RE_PEER_NHL.exec(line);
      if (nhlMatch) {
        const fam = ensureFamily(nhlMatch[1], !isLikelyIpOrName(nhlMatch[1]));
        if (fam) { fam.nextHopLocal = true; fam.rawEvidence.push(line); }
        continue;
      }
      const commMatch = RE_PEER_COMM.exec(line);
      if (commMatch) {
        const fam = ensureFamily(commMatch[1], !isLikelyIpOrName(commMatch[1]));
        if (fam) { fam.advertiseCommunity = true; fam.rawEvidence.push(line); }
        continue;
      }
      const extMatch = RE_PEER_EXTCOMM.exec(line);
      if (extMatch) {
        const fam = ensureFamily(extMatch[1], !isLikelyIpOrName(extMatch[1]));
        if (fam) { fam.advertiseExtCommunity = true; fam.rawEvidence.push(line); }
        continue;
      }
      const reflectMatch = RE_PEER_REFLECT.exec(line);
      if (reflectMatch) {
        const fam = ensureFamily(reflectMatch[1], !isLikelyIpOrName(reflectMatch[1]));
        if (fam) { fam.reflectClient = true; fam.rawEvidence.push(line); }
        continue;
      }
    }
  }

  applyInheritance(model);
  return model;
}

export function resolveBgpPeerPolicyDependencies(
  model: ParsedHuaweiBgpPeerDependencyModel,
  routePolicyCatalog: Record<string, { name: string }>,
  routePolicyStatus: CatalogStatus,
  source: DiscoverySource,
): BgpPeerPolicyDependency[] {
  const deps: BgpPeerPolicyDependency[] = [];
  for (const fam of model.families) {
    for (const direction of ["import", "export"] as const) {
      const policy = direction === "import" ? fam.effectiveImportRoutePolicy : fam.effectiveExportRoutePolicy;
      if (!policy) continue;
      const resolved = routePolicyStatus !== "loaded"
        ? { status: "UNKNOWN" as const, reason: `catálogo route-policy status=${routePolicyStatus}` }
        : routePolicyCatalog[normalizePolicyLookupKey(policy)]
          ? { status: "FOUND" as const }
          : { status: "MISSING" as const };
      deps.push({
        peerKey: fam.peerKey,
        peerAddressOrName: fam.peerAddressOrName,
        afiSafi: fam.afiSafi,
        dependencyType: "route-policy",
        dependencyName: policy,
        direction,
        sourceLine: fam.rawEvidence.join("; "),
        inheritedFromGroup: fam.inheritedFromGroup,
        inheritedGroup: fam.inheritedGroup,
        status: resolved.status,
        reason: resolved.reason,
        evidence: bindingEvidencePeer(
          fam.peerAddressOrName,
          fam.afiSafi,
          direction,
          policy,
          resolved.status,
          source,
          fam.inheritedFromGroup,
          fam.inheritedGroup,
          resolved.reason,
        ),
      });
    }
  }
  model.peer_policy_dependencies = deps;
  return deps;
}

export function buildBgpPolicyBindingsFromPeerModel(
  model: ParsedHuaweiBgpPeerDependencyModel,
  routePolicyCatalog: Record<string, { name: string }>,
  routePolicyStatus: CatalogStatus,
  source: DiscoverySource,
): BgpPolicyBindingDependency[] {
  const deps = resolveBgpPeerPolicyDependencies(model, routePolicyCatalog, routePolicyStatus, source);
  return deps.map((dep) => ({
    consumerType: dep.inheritedFromGroup ? "peer_group" as const : "bgp_peer" as const,
    consumerName: dep.peerAddressOrName,
    peerIp: isLikelyIpOrName(dep.peerAddressOrName) ? dep.peerAddressOrName : undefined,
    direction: dep.direction,
    routePolicy: dep.dependencyName,
    source,
    status: dep.status,
    reason: dep.reason,
    evidence: dep.evidence,
    afiSafi: dep.afiSafi,
    inheritedFromGroup: dep.inheritedFromGroup,
    inheritedGroup: dep.inheritedGroup ?? undefined,
  }));
}
