import { desc, eq } from "drizzle-orm";
import { bgpPeerCleanupAnalysesTable, db, devicesTable } from "@workspace/db";
import { getRequestSourceIp, logAuditEvent } from "../../lib/audit.js";
import { createSnmpSession, snmpGet, toSnmpNumber } from "../netops/snmp/snmp-session.js";
import { runSSHCommandsForDevice } from "../connectors/connector-aware-transport.js";
import { SSH_CONFIG_BUNDLE_TIMEOUT_SECONDS } from "../connectors/connector-config-collect.service.js";
import { deviceUsesConnector, executeSnmpGet, resolveDeviceConnectorContext } from "../connectors/connector-execution.service.js";
import { buildBgpPeerDrilldownResult, getBgpPeerDrilldown } from "../bgp-drilldown/bgp-peer-drilldown.service.js";
import { buildSshDetailCommands, sanitizeSshDetailResults } from "../bgp-drilldown/bgp-peer-drilldown-ssh-detail.js";
import type { BgpPeerDrilldownResult } from "../bgp-drilldown/bgp-peer-drilldown.types.js";
import { getLatestDiscoverySnapshot } from "../netops/device-discovery/discovery.service.js";
import type { DeviceDiscoverySnapshot, BgpPeerSummary } from "../netops/device-discovery/discovery.types.js";
import type { NetopsBgpPeer } from "../netops/types.js";
import { normalizeBgpPeer } from "../netops/bgp/bgp-normalizer.js";
import { primaryDirectionForRole } from "../netops/device-discovery/normalizers/bgp.normalizer.js";
import { parseHuaweiPolicyDependencyPipeline } from "../netops/huawei-vrp/parsers/policy-dependency-pipeline.js";
import { normalizePolicyLookupKey } from "../netops/huawei-vrp/parsers/policy-utils.js";
import type { BgpPeerFamily } from "../netops/huawei-vrp/parsers/bgp-peer-dependency-parser.js";
import { computeCleanupRisk } from "./bgp-drill-cleanup.risk.js";
import {
  analyzeBgpPeerCleanupDependencies,
  findTwinPeer,
} from "./bgp-drill-cleanup.dependency-analyzer.js";
import {
  buildBgpPeerCleanupMarkdown,
  buildBgpPeerCleanupScript,
  shouldRemoveDependency,
} from "./bgp-drill-cleanup.command-builder.js";
import {
  isReliableLocalAs,
  localAsFromSnapshot,
  parseLocalAsFromBgpConfigText,
  resolveLocalAsForCleanup,
} from "./bgp-drill-cleanup.local-as.js";
import { buildChangePlanInputFromBgpCleanup } from "../change-plans/adapters/bgp-cleanup.adapter.js";
import {
  auditChangePlanEvent,
  createChangePlan,
  exportChangePlan,
} from "../change-plans/change-plans.service.js";
import type {
  BgpPeerCleanupAnalysis,
  BgpPeerCleanupAnalyzeRequest,
  BgpPeerCleanupExportResponse,
  BgpPeerCleanupDependencyBuckets,
  BgpPeerCleanupSshRefresh,
} from "./bgp-drill-cleanup.types.js";

function normalizeCleanupPeerIp(peerIp: string): string {
  return peerIp.trim().toUpperCase();
}

export function peerFromSnapshot(snapshot: DeviceDiscoverySnapshot, peerIp: string): BgpPeerSummary | null {
  const target = normalizeCleanupPeerIp(peerIp);
  return snapshot.bgpPeers.find((peer) => normalizeCleanupPeerIp(peer.peerIp) === target) ?? null;
}

function peerPresentInBgpConfig(rawBgpConfig: string, peerIp: string): boolean {
  const escaped = peerIp.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`peer\\s+${escaped}\\b`, "i").test(rawBgpConfig);
}

const BGP_LOCAL_AS_OID = "1.3.6.1.2.1.15.2.0";
const BGP_CLEANUP_SSH_TIMEOUT_MS = SSH_CONFIG_BUNDLE_TIMEOUT_SECONDS * 1000;
const BGP_CLEANUP_BGP_CONFIG_COMMAND = "display current-configuration configuration bgp";
const BGP_CLEANUP_INTERFACE_CONFIG_COMMAND = "display current-configuration interface";

function parseSnmpGetNumber(stdout: string): number | null {
  const match = stdout.match(/(?:INTEGER|Gauge32|Counter32|Unsigned32):\s*(-?\d+)/i)
    ?? stdout.match(/=\s*(-?\d+)\s*$/m)
    ?? stdout.match(/(-?\d+)\s*$/m);
  if (!match) return null;
  const parsed = Number(match[1]);
  return Number.isFinite(parsed) ? parsed : null;
}

async function collectLocalAsViaSnmp(device: Awaited<ReturnType<typeof resolveDevice>>): Promise<{
  value: number | null;
  warning: string | null;
}> {
  const community = device?.snmpCommunity?.trim();
  if (!device || !community) return { value: null, warning: "SNMP local-as ignorado: comunidade SNMP não configurada." };

  try {
    const rawValue = deviceUsesConnector(device)
      ? await (async () => {
        const context = await resolveDeviceConnectorContext(device.id);
        if (!context.connectorId) throw new Error("connector indisponível para SNMP");
        const result = await executeSnmpGet({
          deviceId: device.id,
          connectorId: context.connectorId,
          connectorGroupId: device.connectorGroupId ?? null,
          targetIp: device.ipAddress,
          oid: BGP_LOCAL_AS_OID,
          community: context.community ?? community,
          timeoutSeconds: 10,
        });
        if (!result.success) throw new Error(result.stderr || result.stdout || "SNMP_GET bgpLocalAs falhou");
        return parseSnmpGetNumber(result.stdout);
      })()
      : await (async () => {
        const session = createSnmpSession(device.ipAddress, community, { timeout: 4000, retries: 1 });
        try {
          const result = await snmpGet(session, BGP_LOCAL_AS_OID);
          return toSnmpNumber(result.value);
        } finally {
          session.close();
        }
      })();

    if (isReliableLocalAs(rawValue)) return { value: rawValue, warning: null };
    return {
      value: null,
      warning: rawValue === 23456
        ? "SNMP bgpLocalAs retornou AS_TRANS 23456; usando fallback via config BGP."
        : `SNMP bgpLocalAs inválido (${rawValue ?? "sem valor"}); usando fallback via config BGP.`,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { value: null, warning: `SNMP bgpLocalAs falhou (${message}); usando fallback via config BGP.` };
  }
}

function ipv4ToNumber(ip: string): number | null {
  const parts = ip.split(".").map((part) => Number(part));
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return null;
  return (((parts[0] * 256 + parts[1]) * 256 + parts[2]) * 256 + parts[3]) >>> 0;
}

function maskToNumber(mask: string): number | null {
  if (/^\d{1,2}$/.test(mask)) {
    const prefix = Number(mask);
    if (!Number.isInteger(prefix) || prefix < 0 || prefix > 32) return null;
    return prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
  }
  return ipv4ToNumber(mask);
}

function sameIpv4Subnet(leftIp: string, rightIp: string, mask: string): boolean {
  const left = ipv4ToNumber(leftIp);
  const right = ipv4ToNumber(rightIp);
  const maskNumber = maskToNumber(mask);
  if (left == null || right == null || maskNumber == null) return false;
  return (left & maskNumber) === (right & maskNumber);
}

function peerHasEbgpMultihop(rawBgpConfig: string, peerIp: string): boolean {
  const escaped = peerIp.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`^\\s*peer\\s+${escaped}\\s+ebgp-(?:max-hop|multihop)\\b`, "im").test(rawBgpConfig);
}

function findInterfaceForIpv4Peer(rawInterfaceConfig: string, peerIp: string): { name: string; address: string; mask: string } | null {
  let current: string | null = null;
  for (const line of rawInterfaceConfig.split(/\r?\n/)) {
    const header = /^interface\s+(\S+)/i.exec(line.trim());
    if (header) {
      current = header[1];
      continue;
    }
    if (!current) continue;
    const address = /^\s*ip\s+address\s+(\d+\.\d+\.\d+\.\d+)\s+(\d+\.\d+\.\d+\.\d+|\d{1,2})\b/i.exec(line);
    if (address && sameIpv4Subnet(address[1], peerIp, address[2])) {
      return { name: current, address: address[1], mask: address[2] };
    }
  }
  return null;
}

function interfaceCleanupWarnings(input: { peerIp: string; rawBgpConfig: string; rawInterfaceConfig: string }): string[] {
  if (!/^\d+\.\d+\.\d+\.\d+$/.test(input.peerIp)) {
    return ["Busca de interface relacionada limitada a peer IPv4; revisar interface IPv6 manualmente se aplicável."];
  }
  if (peerHasEbgpMultihop(input.rawBgpConfig, input.peerIp)) {
    return [`Peer ${input.peerIp} usa ebgp-multihop/ebgp-max-hop; revisar manualmente a remoção de configuração da interface relacionada.`];
  }
  const iface = findInterfaceForIpv4Peer(input.rawInterfaceConfig, input.peerIp);
  if (!iface) return [`Interface vizinha do peer ${input.peerIp} não inferida por subnet; revisar configuração de interface manualmente.`];
  return [`Interface provável do peer ${input.peerIp}: ${iface.name} (${iface.address}/${iface.mask}). Revisar remoção de descrição/IP/subinterface manualmente; não incluído no script automático.`];
}

function emptySnapshot(deviceId: number): DeviceDiscoverySnapshot {
  return {
    deviceId,
    discoveryRunId: "cleanup-live-bgp",
    status: "partial",
    contexts: ["bgp", "policies"],
    startedAt: new Date().toISOString(),
    finishedAt: new Date().toISOString(),
    sourceStatus: { ssh: "skipped", snmp: "skipped", cachedConfig: "skipped" },
    sourcesUsed: ["ssh_running_config"],
    interfaces: [],
    bgpPeers: [],
    policies: [],
    communities: [],
    communityLists: [],
    prefixLists: [],
    ipv6PrefixLists: [],
    asPathFilters: [],
    extcommunityFilters: [],
    aclFilters: [],
    vrfs: [],
    l2vpn: { l2vcs: [], vsis: [], source: "local_db", confidence: "low" },
    warnings: [],
    audit: [],
  };
}

function addressFamilyFromAfiSafi(afiSafi: BgpPeerFamily["afiSafi"]): NetopsBgpPeer["addressFamily"] {
  return afiSafi.includes("ipv6") || afiSafi === "vpnv6" ? "ipv6" : "ipv4";
}

function snapshotPeerKey(peer: Pick<BgpPeerSummary, "peerIp" | "addressFamily" | "vrf">): string {
  return `${normalizePolicyLookupKey(peer.peerIp)}|${peer.addressFamily}|${peer.vrf ?? ""}`;
}

function summaryFromBgpFamily(input: {
  family: BgpPeerFamily;
  existing: BgpPeerSummary | null;
  remoteAs: number | null;
  description: string | null;
}): BgpPeerSummary {
  const addressFamily = addressFamilyFromAfiSafi(input.family.afiSafi);
  const normalized = normalizeBgpPeer({
    peerIp: input.family.peerAddressOrName,
    remoteAs: input.remoteAs,
    description: input.description ?? input.existing?.description ?? null,
    name: input.description ?? input.existing?.name ?? null,
    state: input.existing?.state ?? "Unknown",
    role: input.existing?.role ?? null,
    vrf: input.family.vrfName,
    importPolicy: input.family.effectiveImportRoutePolicy,
    exportPolicy: input.family.effectiveExportRoutePolicy,
    receivedPrefixes: input.existing?.receivedPrefixes ?? null,
    advertisedPrefixes: input.existing?.advertisedPrefixes ?? null,
    activePrefixes: input.existing?.activePrefixes ?? null,
    uptime: input.existing?.uptime ?? null,
    sessionType: input.existing?.sessionType ?? null,
    source: "ssh",
  });
  const peer: NetopsBgpPeer = { ...normalized, addressFamily };
  const received = peer.receivedPrefixes ?? 0;
  const advertised = peer.advertisedPrefixes ?? 0;
  return {
    ...peer,
    category: peer.role,
    primaryDirection: primaryDirectionForRole(peer.role),
    largeReceivedRoutes: received > 5000,
    largeAdvertisedRoutes: advertised > 5000,
    autoLoadRoutes: false,
    requiresExplicitRouteSearch: received > 5000 || advertised > 5000,
    source: "ssh_running_config",
    confidence: "high",
    evidence: `display current-configuration configuration bgp: peer ${peer.peerIp}`,
  };
}

export function buildSnapshotFromLiveBgpConfig(input: {
  deviceId: number;
  baseSnapshot: DeviceDiscoverySnapshot;
  rawBgpConfig: string;
  startedAt: string;
  finishedAt: string;
  targetPeerIp?: string;
}): DeviceDiscoverySnapshot {
  const parsedConfig = parseHuaweiPolicyDependencyPipeline(input.rawBgpConfig, "ssh_running_config");
  const existingPeers = new Map(input.baseSnapshot.bgpPeers.map((peer) => [snapshotPeerKey(peer), peer]));
  const bgpModel = parsedConfig.bgp_peer_model;
  const familyPeers = (bgpModel?.families ?? [])
    .filter((family) => !family.isGroup)
    .map((family) => {
      const addressFamily = addressFamilyFromAfiSafi(family.afiSafi);
      const key = `${normalizePolicyLookupKey(family.peerAddressOrName)}|${addressFamily}|${family.vrfName ?? ""}`;
      const existing = existingPeers.get(key) ?? null;
      const root = bgpModel?.roots[family.peerKey] ?? null;
      return summaryFromBgpFamily({
        family,
        existing,
        remoteAs: root?.asNumber ?? existing?.remoteAs ?? null,
        description: root?.description ?? existing?.description ?? null,
      });
    });

  const livePeerKeys = new Set(familyPeers.map((peer) => snapshotPeerKey(peer)));
  const preservedOperationalPeers = input.baseSnapshot.bgpPeers.filter(
    (peer) => !livePeerKeys.has(snapshotPeerKey(peer)),
  );
  const mergedPeers = [...familyPeers, ...preservedOperationalPeers].sort((left, right) =>
    left.peerIp.localeCompare(right.peerIp),
  );
  const refreshWarnings: DeviceDiscoverySnapshot["warnings"] = [
    ...(input.baseSnapshot.warnings ?? []),
    {
      level: "info",
      source: "ssh",
      message: "Planejamento revalidado com display current-configuration configuration bgp sem cache de peers.",
    },
  ];
  if (preservedOperationalPeers.length > 0) {
    refreshWarnings.push({
      level: "warning",
      source: "ssh",
      message:
        `${preservedOperationalPeers.length} peer(s) operacional(is) ausente(s) na config BGP via SSH foram preservados do snapshot para planejamento.`,
    });
  }
  if (input.targetPeerIp) {
    const target = normalizeCleanupPeerIp(input.targetPeerIp);
    const inLiveConfig = familyPeers.some((peer) => normalizeCleanupPeerIp(peer.peerIp) === target);
    const preservedTarget = preservedOperationalPeers.some((peer) => normalizeCleanupPeerIp(peer.peerIp) === target);
    if (!inLiveConfig && preservedTarget) {
      refreshWarnings.push({
        level: "warning",
        source: "ssh",
        message:
          `Peer ${input.targetPeerIp} ausente na config BGP via SSH; planejamento usa metadados operacionais do snapshot.`,
      });
    }
  }

  return {
    ...input.baseSnapshot,
    deviceId: input.deviceId,
    discoveryRunId: "cleanup-live-bgp",
    status: "partial",
    contexts: [...new Set([...input.baseSnapshot.contexts, "bgp", "policies"])] as DeviceDiscoverySnapshot["contexts"],
    startedAt: input.startedAt,
    finishedAt: input.finishedAt,
    sourceStatus: { ssh: "success", snmp: "skipped", cachedConfig: "skipped" },
    sourcesUsed: ["ssh_running_config"],
    bgpPeers: mergedPeers,
    warnings: refreshWarnings,
    audit: [
      ...(input.baseSnapshot.audit ?? []),
      {
        level: "info",
        source: "ssh",
        message: "cleanup live bgp config collected",
      },
    ],
  };
}

async function collectLiveBgpCleanupSnapshot(input: {
  device: Awaited<ReturnType<typeof resolveDevice>>;
  deviceId: number;
  baseSnapshot: DeviceDiscoverySnapshot;
  peerIp: string;
}): Promise<{
  snapshot: DeviceDiscoverySnapshot;
  rawConfig: string;
  localAs: number | null;
  sshRefresh: BgpPeerCleanupSshRefresh;
} | "no_config"> {
  if (!input.device?.passwordEncrypted) return "no_config";
  const startedAt = new Date().toISOString();
  const [bgpResults, snmpLocalAs] = await Promise.all([
    runSSHCommandsForDevice(input.device, [BGP_CLEANUP_BGP_CONFIG_COMMAND], {
      sessionTimeoutMs: BGP_CLEANUP_SSH_TIMEOUT_MS,
      commandTimeoutMs: BGP_CLEANUP_SSH_TIMEOUT_MS,
      setupTimeoutMs: 8_000,
    }),
    collectLocalAsViaSnmp(input.device),
  ]);
  const bgpResult = bgpResults[0];
  const rawConfig = bgpResult?.output?.trim() ?? "";
  const bgpError = bgpResult?.error?.trim();
  if (!rawConfig || bgpError) return "no_config";

  let rawInterfaceConfig = "";
  const interfaceWarnings: string[] = [];
  try {
    const interfaceResults = await runSSHCommandsForDevice(
      input.device,
      [BGP_CLEANUP_INTERFACE_CONFIG_COMMAND],
      {
        sessionTimeoutMs: BGP_CLEANUP_SSH_TIMEOUT_MS,
        commandTimeoutMs: BGP_CLEANUP_SSH_TIMEOUT_MS,
        setupTimeoutMs: 8_000,
      },
    );
    const interfaceResult = interfaceResults[0];
    rawInterfaceConfig = interfaceResult?.output?.trim() ?? "";
    if (interfaceResult?.error?.trim()) {
      interfaceWarnings.push(
        `Config de interface não coletada via SSH (${interfaceResult.error.trim()}); revisar interface relacionada manualmente.`,
      );
    } else if (!rawInterfaceConfig) {
      interfaceWarnings.push("Config de interface retornou vazia; revisar interface relacionada manualmente.");
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    interfaceWarnings.push(
      `Config de interface não coletada via SSH (${message}); revisar interface relacionada manualmente.`,
    );
  }

  const finishedAt = new Date().toISOString();
  const commands = [BGP_CLEANUP_BGP_CONFIG_COMMAND, BGP_CLEANUP_INTERFACE_CONFIG_COMMAND];
  const sanitized = sanitizeSshDetailResults([
    bgpResult,
    {
      command: BGP_CLEANUP_INTERFACE_CONFIG_COMMAND,
      output: rawInterfaceConfig,
      error: interfaceWarnings[0],
    },
  ]);
  const parsedLocalAs = parseLocalAsFromBgpConfigText(rawConfig);
  const localAs = snmpLocalAs.value ?? parsedLocalAs;
  const localAsWarnings = snmpLocalAs.warning
    ? [snmpLocalAs.warning]
    : isReliableLocalAs(snmpLocalAs.value)
      ? [`Local AS coletado via SNMP bgpLocalAs.0 (${BGP_LOCAL_AS_OID}).`]
      : parsedLocalAs
        ? ["Local AS inferido da config BGP coletada via SSH live."]
        : [];
  const warnings = [
    "BGP config revalidado via SSH live; cache de peers ignorado para dependências compartilhadas.",
    ...localAsWarnings,
    ...interfaceWarnings,
    ...interfaceCleanupWarnings({ peerIp: input.peerIp, rawBgpConfig: rawConfig, rawInterfaceConfig }),
  ];
  const snapshot = buildSnapshotFromLiveBgpConfig({
    deviceId: input.deviceId,
    baseSnapshot: input.baseSnapshot,
    rawBgpConfig: rawConfig,
    startedAt,
    finishedAt,
    targetPeerIp: input.peerIp,
  });
  return {
    snapshot,
    rawConfig,
    localAs,
    sshRefresh: {
      enabled: true,
      commandCount: commands.length,
      executedCount: sanitized.filter((item) => !item.error).length,
      commands,
      warnings,
      evidence: sanitized,
    },
  };
}

function snapshotSource(snapshot: DeviceDiscoverySnapshot): BgpPeerCleanupAnalysis["snapshotSource"] {
  return snapshot.sourcesUsed[0] ?? "unknown";
}

function collectPolicies(drilldown: BgpPeerDrilldownResult) {
  const importPolicies = [...new Set(drilldown.effectivePolicies.filter((policy) => policy.direction === "import").map((policy) => policy.policyName))];
  const exportPolicies = [...new Set(drilldown.effectivePolicies.filter((policy) => policy.direction === "export").map((policy) => policy.policyName))];
  return { importPolicies, exportPolicies };
}

function buildCleanupScriptWarnings(input: {
  dependencies: BgpPeerCleanupDependencyBuckets;
  script: BgpPeerCleanupAnalysis["script"];
}): string[] {
  const warnings: string[] = [];
  const routePolicyCommands = new Set(
    input.script.removalCommands.filter((command) => /^undo\s+route-policy\s+\S+/i.test(command)),
  );

  for (const dep of input.dependencies.exclusive) {
    const depKey = `${dep.type}:${dep.name}`;
    if (shouldRemoveDependency(dep as typeof dep & Record<string, unknown>)) {
      if (dep.type === "route-policy") {
        const expectedCommand = `undo route-policy ${dep.name}`;
        if (!routePolicyCommands.has(expectedCommand)) {
          warnings.push(`Route-policy exclusiva não incluída no script: ${dep.name}`);
        }
      }
      continue;
    }

    if (
      !["route-policy", "ip-prefix", "ipv6-prefix", "community-filter", "as-path-filter", "extcommunity-filter"].includes(dep.type)
    ) {
      warnings.push(`Tipo de dependência não suportado para remoção automática: ${dep.type} ${dep.name}`);
    }

    if (!routePolicyCommands.has(`undo route-policy ${dep.name}`) && dep.type === "route-policy") {
      warnings.push(`Route-policy exclusiva não incluída no script: ${dep.name}`);
    }
  }

  return [...new Set(warnings)];
}

async function collectReadOnlyPeerRefresh(input: {
  device: Awaited<ReturnType<typeof resolveDevice>>;
  drilldown: BgpPeerDrilldownResult;
}): Promise<BgpPeerCleanupSshRefresh | null> {
  const warnings: string[] = [];
  if (!input.device?.passwordEncrypted) {
    return {
      enabled: true,
      commandCount: 0,
      executedCount: 0,
      commands: [],
      warnings: ["Dispositivo sem senha SSH configurada; revalidação via SSH ignorada."],
      evidence: [],
    };
  }

  const { commands, warnings: buildWarnings } = buildSshDetailCommands(input.drilldown, {
    includePeerVerbose: true,
    includeRoutePolicies: true,
    includePolicyObjects: true,
  });
  warnings.push(...buildWarnings);

  if (commands.length === 0) {
    warnings.push("Nenhum comando SSH read-only permitido para revalidar o peer.");
    return {
      enabled: true,
      commandCount: 0,
      executedCount: 0,
      commands: [],
      warnings,
      evidence: [],
    };
  }

  try {
    const results = await runSSHCommandsForDevice(input.device, commands, {
      sessionTimeoutMs: BGP_CLEANUP_SSH_TIMEOUT_MS,
      commandTimeoutMs: BGP_CLEANUP_SSH_TIMEOUT_MS,
      setupTimeoutMs: 10000,
    });
    const sanitized = sanitizeSshDetailResults(results);
    const executed = sanitized.filter((item) => !item.error).length;
    warnings.push(`SSH read-only reexecutado: ${executed}/${commands.length} comandos respondidos.`);
    const blocked = sanitized.filter((item) => item.error).map((item) => `${item.command}: ${item.error}`);
    warnings.push(...blocked);
    return {
      enabled: true,
      commandCount: commands.length,
      executedCount: executed,
      commands,
      warnings,
      evidence: sanitized,
    };
  } catch (error) {
    warnings.push(error instanceof Error ? `SSH read-only falhou: ${error.message}` : "SSH read-only falhou.");
    return {
      enabled: true,
      commandCount: commands.length,
      executedCount: 0,
      commands,
      warnings,
      evidence: [],
    };
  }
}

function buildBlockedReasons(input: {
  peer: BgpPeerSummary | null;
  twin: BgpPeerCleanupAnalysis["twin"];
  dependencies: BgpPeerCleanupDependencyBuckets;
}): string[] {
  const blocked: string[] = [];
  if (input.peer?.state === "Established") blocked.push("Peer está Established");
  if (input.dependencies.ambiguous.length > 0) blocked.push("Dependência ambígua exige revisão humana");
  return blocked;
}

function recommendationFor(input: {
  peer: BgpPeerSummary | null;
  blockedReasons: string[];
  dependencies: BgpPeerCleanupDependencyBuckets;
}): "full" | "partial" | "skip" {
  if (input.blockedReasons.length > 0) return "skip";
  if (!input.peer) return "skip";
  const hasPolicies = input.dependencies.exclusive.some((dep) => dep.type === "route-policy")
    || input.dependencies.shared.some((dep) => dep.type === "route-policy")
    || input.dependencies.ambiguous.some((dep) => dep.type === "route-policy");
  if (!hasPolicies && input.dependencies.exclusive.length === 0 && input.dependencies.shared.length === 0) return "partial";
  if (input.dependencies.shared.length === 0 && input.dependencies.ambiguous.length === 0) return "full";
  return "partial";
}

function riskFor(recommendation: "full" | "partial" | "skip", dependencies: BgpPeerCleanupDependencyBuckets): "low" | "medium" | "high" {
  return computeCleanupRisk(recommendation, dependencies.shared.length > 0, dependencies.ambiguous.length > 0);
}

export function classifyBgpPeerCleanup(input: {
  peer: BgpPeerSummary | null;
  twin: BgpPeerCleanupAnalysis["twin"];
  dependencies: BgpPeerCleanupDependencyBuckets;
}): {
  blockedReasons: string[];
  recommendation: BgpPeerCleanupAnalysis["recommendation"];
  riskLevel: BgpPeerCleanupAnalysis["riskLevel"];
} {
  const blockedReasons = buildBlockedReasons(input);
  const recommendation = recommendationFor({ peer: input.peer, blockedReasons, dependencies: input.dependencies });
  const riskLevel = riskFor(recommendation, input.dependencies);
  return { blockedReasons, recommendation, riskLevel };
}

export function buildBgpPeerCleanupAnalysis(input: {
  deviceId: number;
  peer: BgpPeerSummary;
  snapshot: DeviceDiscoverySnapshot;
  drilldown: BgpPeerDrilldownResult;
  dependencies: BgpPeerCleanupDependencyBuckets;
  twin: BgpPeerCleanupAnalysis["twin"];
  recommendation: BgpPeerCleanupAnalysis["recommendation"];
  riskLevel: BgpPeerCleanupAnalysis["riskLevel"];
  blockedReasons: string[];
  warnings: string[];
  sshRefresh?: BgpPeerCleanupAnalysis["sshRefresh"] | null;
  localAs?: number | null;
  analysisId?: number;
}): BgpPeerCleanupAnalysis {
  const peerPolicies = collectPolicies(input.drilldown);
  return {
    analysisId: input.analysisId ?? 0,
    deviceId: input.deviceId,
    peerIp: input.peer.peerIp,
    vrf: input.peer.vrf ?? null,
    afi: input.peer.addressFamily,
    safi: "unicast",
    peerRole: input.peer.role ?? null,
    peerCategory: input.peer.category ?? null,
    state: input.peer.state,
    peerAs: input.peer.remoteAs ?? null,
    localAs: input.localAs ?? localAsFromSnapshot(input.snapshot),
    importPolicies: peerPolicies.importPolicies,
    exportPolicies: peerPolicies.exportPolicies,
    recommendation: input.recommendation,
    riskLevel: input.riskLevel,
    dependencies: input.dependencies,
    script: { removalCommands: [], validationBefore: [], validationAfter: [], sha256: "" },
    sshRefresh: input.sshRefresh ?? null,
    warnings: input.warnings,
    blockedReasons: input.blockedReasons,
    twin: input.twin,
    collectedAt: input.snapshot.finishedAt ?? null,
    snapshotSource: snapshotSource(input.snapshot),
    drilldown: input.drilldown,
  };
}

async function resolveDevice(deviceId: number) {
  const [device] = await db.select().from(devicesTable).where(eq(devicesTable.id, deviceId)).limit(1);
  return device ?? null;
}

function fallbackAnalysis(deviceId: number, peerIp: string): BgpPeerCleanupAnalysis {
  return {
    analysisId: 0,
    deviceId,
    peerIp,
    vrf: null,
    afi: "ipv4",
    safi: "unicast",
    peerRole: null,
    peerCategory: null,
    state: "Unknown",
    peerAs: null,
    localAs: null,
    importPolicies: [],
    exportPolicies: [],
    recommendation: "skip",
    riskLevel: "high",
    dependencies: { exclusive: [], shared: [], global: [], ambiguous: [] },
    script: { removalCommands: [], validationBefore: [], validationAfter: [], sha256: "" },
    warnings: ["Device ou peer não encontrado"],
    blockedReasons: ["Device ou peer não encontrado"],
    twin: null,
    collectedAt: null,
    snapshotSource: "unknown",
  };
}

function toStoredAnalysis(analysis: BgpPeerCleanupAnalysis): Record<string, unknown> {
  return {
    analysisId: analysis.analysisId,
    deviceId: analysis.deviceId,
    peerIp: analysis.peerIp,
    vrf: analysis.vrf,
    afi: analysis.afi,
    safi: analysis.safi,
    peerRole: analysis.peerRole,
    peerCategory: analysis.peerCategory,
    state: analysis.state,
    peerAs: analysis.peerAs,
    localAs: analysis.localAs ?? null,
    importPolicies: analysis.importPolicies,
    exportPolicies: analysis.exportPolicies,
    recommendation: analysis.recommendation,
    riskLevel: analysis.riskLevel,
    dependencies: analysis.dependencies,
    script: analysis.script,
    sshRefresh: analysis.sshRefresh ?? null,
    warnings: analysis.warnings,
    blockedReasons: analysis.blockedReasons,
    twin: analysis.twin,
    collectedAt: analysis.collectedAt,
    snapshotSource: analysis.snapshotSource,
    changePlanId: analysis.changePlanId ?? null,
  };
}

function analysisHasUsableScript(analysis: BgpPeerCleanupAnalysis): boolean {
  if (analysis.recommendation === "skip") {
    return analysis.script.removalCommands.length === 0
      && analysis.script.validationBefore.length > 0
      && analysis.script.validationAfter.length > 0
      && Boolean(analysis.script.sha256);
  }

  return analysis.script.removalCommands.length > 0
    && analysis.script.validationBefore.length > 0
    && analysis.script.validationAfter.length > 0
    && Boolean(analysis.script.sha256);
}

function hydrateBgpPeerCleanupScript(analysis: BgpPeerCleanupAnalysis): BgpPeerCleanupAnalysis {
  const normalized: BgpPeerCleanupAnalysis = {
    ...analysis,
    dependencies: {
      exclusive: analysis.dependencies?.exclusive ?? [],
      shared: analysis.dependencies?.shared ?? [],
      global: analysis.dependencies?.global ?? [],
      ambiguous: analysis.dependencies?.ambiguous ?? [],
    },
  };
  if (analysisHasUsableScript(normalized)) return normalized;
  return {
    ...normalized,
    script: buildBgpPeerCleanupScript({ analysis: normalized }),
  };
}

export async function analyzeBgpPeerCleanup(input: {
  deviceId: number;
  peerIp: string;
  request?: BgpPeerCleanupAnalyzeRequest;
  createdBy?: string | null;
  sourceIp?: string | null;
}): Promise<BgpPeerCleanupAnalysis | "device_not_found" | "peer_not_found" | "no_config" | "peer_established_protected"> {
  const device = await resolveDevice(input.deviceId);
  if (!device) return "device_not_found";

  const validateReadOnly = input.request?.validateReadOnly === true;
  const baseSnapshot = await getLatestDiscoverySnapshot(input.deviceId);
  const live = validateReadOnly
    ? await collectLiveBgpCleanupSnapshot({
      device,
      deviceId: input.deviceId,
      baseSnapshot: baseSnapshot ?? emptySnapshot(input.deviceId),
      peerIp: input.peerIp,
    })
    : null;
  if (live === "no_config") return "no_config";
  const snapshot = live?.snapshot ?? baseSnapshot;
  if (!snapshot) return "no_config";

  const peer = peerFromSnapshot(snapshot, input.peerIp);
  if (!peer) return "peer_not_found";
  if (peer.state === "Established") return "peer_established_protected";

  const drilldown = live
    ? buildBgpPeerDrilldownResult({
      deviceId: input.deviceId,
      peer: input.peerIp,
      snapshot,
      rawConfig: live.rawConfig,
      collectedAt: new Date(snapshot.finishedAt),
      snapshotId: snapshot.persistedSnapshotId ?? null,
      query: {
        source: "snapshot",
        includePolicies: true,
        includePolicyObjects: true,
        forceRecompute: true,
      },
    })
    : await getBgpPeerDrilldown(input.deviceId, input.peerIp, {
      source: "snapshot",
      includePolicies: true,
      includePolicyObjects: true,
  });
  if (drilldown === "device_not_found" || drilldown === "no_config") return "no_config";

  const dependencies = analyzeBgpPeerCleanupDependencies({
    targetPeerIp: input.peerIp,
    snapshot,
    drilldown,
  });
  const twin = findTwinPeer({ snapshot, targetPeer: peer });
  const { blockedReasons, recommendation, riskLevel } = classifyBgpPeerCleanup({ peer, twin, dependencies });
  const sshRefresh = live
    ? live.sshRefresh
    : validateReadOnly
      ? await collectReadOnlyPeerRefresh({ device, drilldown })
    : null;

  const localAsResolution = await resolveLocalAsForCleanup({
    deviceId: input.deviceId,
    snapshot,
    liveLocalAs: live?.localAs ?? null,
    rawBgpConfig: live?.rawConfig ?? null,
  });
  if (!isReliableLocalAs(live?.localAs) && !localAsResolution.localAs) {
    const snmpFallback = await collectLocalAsViaSnmp(device);
    if (snmpFallback.warning) localAsResolution.warnings.push(snmpFallback.warning);
    if (isReliableLocalAs(snmpFallback.value)) {
      localAsResolution.localAs = snmpFallback.value;
      localAsResolution.source = "snmp";
    }
  }

  const analysisBase = buildBgpPeerCleanupAnalysis({
    deviceId: input.deviceId,
    peer,
    snapshot,
    drilldown,
    dependencies,
    twin,
    recommendation,
    riskLevel,
    blockedReasons,
    localAs: localAsResolution.localAs,
    warnings: [
      ...(drilldown.warnings ?? []),
      ...(sshRefresh?.warnings ?? []),
      ...localAsResolution.warnings,
      ...(live && !peerPresentInBgpConfig(live.rawConfig, input.peerIp)
        ? [`Peer ${input.peerIp} não aparece em display current-configuration configuration bgp; script undo peer ainda é gerado com base no snapshot operacional.`]
        : []),
      ...(twin ? [`Twin AF ${twin.afi} detectado (${twin.peerIp}, ${twin.state}); tratado separadamente e não incluído no script de remoção.`] : []),
    ],
    sshRefresh,
  });

  analysisBase.script = buildBgpPeerCleanupScript({ analysis: analysisBase });
  analysisBase.warnings = [...analysisBase.warnings, ...buildCleanupScriptWarnings({
    dependencies: dependencies,
    script: analysisBase.script,
  })];
  const hydratedAnalysis = hydrateBgpPeerCleanupScript(analysisBase);

  const [inserted] = await db.insert(bgpPeerCleanupAnalysesTable).values({
    deviceId: input.deviceId,
    peerIp: peer.peerIp,
    vrf: analysisBase.vrf,
    afi: analysisBase.afi,
    safi: analysisBase.safi,
    state: analysisBase.state,
    recommendation: analysisBase.recommendation,
    riskLevel: analysisBase.riskLevel,
    analysisJson: toStoredAnalysis(hydratedAnalysis),
    createdBy: input.createdBy ?? null,
  }).returning();

  if (!inserted) return hydratedAnalysis;

  const analysis = { ...hydratedAnalysis, analysisId: inserted.id };
  await db
    .update(bgpPeerCleanupAnalysesTable)
    .set({ analysisJson: toStoredAnalysis(analysis) })
    .where(eq(bgpPeerCleanupAnalysesTable.id, inserted.id));

  const changePlanInput = buildChangePlanInputFromBgpCleanup({
    analysis,
    peer,
    snapshot,
    drilldown,
    hostname: device.hostname,
    createdBy: input.createdBy ?? null,
    sourceAnalysisId: inserted.id,
  });
  const changePlan = await createChangePlan(changePlanInput);
  const analysisWithPlan = { ...analysis, changePlanId: changePlan.id };
  await db
    .update(bgpPeerCleanupAnalysesTable)
    .set({ analysisJson: toStoredAnalysis(analysisWithPlan) })
    .where(eq(bgpPeerCleanupAnalysesTable.id, inserted.id));

  await auditChangePlanEvent({
    action: "change_plan_created",
    changePlanId: changePlan.id,
    module: changePlan.module,
    deviceId: changePlan.deviceId,
    metadata: {
      peerIp: analysis.peerIp,
      recommendation: analysis.recommendation,
      sourceAnalysisId: inserted.id,
    },
    sourceIp: input.sourceIp ?? undefined,
  });

  return analysisWithPlan;
}

export async function getBgpPeerCleanupAnalysisById(id: number): Promise<BgpPeerCleanupAnalysis | null> {
  const [row] = await db.select().from(bgpPeerCleanupAnalysesTable).where(eq(bgpPeerCleanupAnalysesTable.id, id)).limit(1);
  if (!row) return null;
  const analysis = hydrateBgpPeerCleanupScript(row.analysisJson as BgpPeerCleanupAnalysis);
  return { ...analysis, analysisId: row.id };
}

export async function exportBgpPeerCleanupAnalysisById(input: {
  id: number;
  createdBy?: string | null;
  sourceIp?: string | null;
}): Promise<BgpPeerCleanupExportResponse | "not_found" | "invalid"> {
  const analysis = await getBgpPeerCleanupAnalysisById(input.id);
  if (!analysis) return "not_found";

  if (analysis.changePlanId) {
    const exported = await exportChangePlan({
      id: analysis.changePlanId,
      format: "markdown",
      sourceIp: input.sourceIp ?? null,
    });
    if (exported === "invalid") return "invalid";
    if (exported !== "not_found") {
      await db.update(bgpPeerCleanupAnalysesTable)
        .set({ exportedAt: new Date() })
        .where(eq(bgpPeerCleanupAnalysesTable.id, input.id));

      await logAuditEvent({
        action: "bgp_cleanup_script_exported",
        objectType: "bgp_cleanup_analysis",
        objectId: String(input.id),
        metadata: {
          deviceId: analysis.deviceId,
          peerIp: analysis.peerIp,
          recommendation: analysis.recommendation,
          changePlanId: analysis.changePlanId,
        },
        sourceIp: input.sourceIp ?? undefined,
      });

      return {
        analysisId: analysis.analysisId,
        markdown: exported.content,
        exportedAt: exported.exportedAt,
      };
    }
  }

  const markdown = buildBgpPeerCleanupMarkdown({ analysis });
  await db.update(bgpPeerCleanupAnalysesTable)
    .set({ exportedAt: new Date() })
    .where(eq(bgpPeerCleanupAnalysesTable.id, input.id));

  await logAuditEvent({
    action: "bgp_cleanup_script_exported",
    objectType: "bgp_cleanup_analysis",
    objectId: String(input.id),
    metadata: { deviceId: analysis.deviceId, peerIp: analysis.peerIp, recommendation: analysis.recommendation },
    sourceIp: input.sourceIp ?? undefined,
  });

  return {
    analysisId: analysis.analysisId,
    markdown,
    exportedAt: new Date().toISOString(),
  };
}

export async function auditBgpCleanupCreation(analysis: BgpPeerCleanupAnalysis, sourceIp?: string | null) {
  await logAuditEvent({
    action: "bgp_cleanup_analysis_created",
    objectType: "bgp_cleanup_analysis",
    objectId: String(analysis.analysisId),
    metadata: {
      deviceId: analysis.deviceId,
      peerIp: analysis.peerIp,
      recommendation: analysis.recommendation,
      riskLevel: analysis.riskLevel,
    },
    sourceIp: sourceIp ?? undefined,
  });
}
