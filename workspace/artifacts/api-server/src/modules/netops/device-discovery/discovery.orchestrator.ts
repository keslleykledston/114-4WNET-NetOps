import { bgpPeerRoleOverridesTable, collectedConfigsTable, db, devicesTable, snmpSnapshotsTable } from "@workspace/db";
import { desc, eq } from "drizzle-orm";
import { decrypt } from "../../../lib/crypto.js";
import { normalizeBgpPeer } from "../bgp/bgp-normalizer.js";
import type { NetopsBgpPeer, NetopsCommunity, NetopsFilter, NetopsInterface } from "../types.js";
import { collectDiscoverySnmp } from "./collectors/snmp.collector.js";
import { collectDiscoverySsh } from "./collectors/ssh.collector.js";
import type { CollectorOutput, DeviceDiscoveryRequest, DeviceDiscoverySnapshot, DiscoveryStatus, DiscoveryWarning, RawEvidenceRecord, VrfSummary } from "./discovery.types.js";
import { rawEvidenceStore, sanitizeDiscoveryText } from "./evidence/evidence-store.js";
import { buildBgpPeerDetails, normalizeDiscoveryBgpPeers, primaryDirectionForRole } from "./normalizers/bgp.normalizer.js";
import { normalizeDiscoveryInterfaces } from "./normalizers/interface.normalizer.js";
import { emptyL2vpnSummary } from "./normalizers/l2vpn.normalizer.js";
import { normalizeDiscoveryCommunities, normalizeDiscoveryPolicies } from "./normalizers/policy.normalizer.js";
import { COMPLIANCE_PARSER_VERSION, INTERFACE_PARSER_VERSION } from "../versioning.js";

function parseJsonArray(value: string | null): unknown[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function numberValue(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function cachedInterfaces(value: string | null): NetopsInterface[] {
  return parseJsonArray(value).map((item) => {
    const row = asRecord(item);
    const name = text(row["name"]) ?? "unknown";
    return {
      name,
      description: text(row["description"]) ?? null,
      adminStatus: "unknown",
      operStatus: text(row["state"]) === "up" ? "up" : "unknown",
      ipv4: text(row["ip"]) ? [text(row["ip"])!] : [],
      ipv6: [],
      vlan: null,
      vrf: null,
      source: "ssh",
    };
  });
}

function localDbInterfaces(value: string | null): NetopsInterface[] {
  return parseJsonArray(value).map((item) => {
    const row = asRecord(item);
    const name = text(row["name"]) ?? "unknown";
    const adminStatus = text(row["adminStatus"]);
    const operStatus = text(row["operStatus"]);
    return {
      name,
      description: text(row["description"]) ?? null,
      alias: text(row["alias"]),
      rawDescr: text(row["rawDescr"]),
      adminStatus: adminStatus === "up" || adminStatus === "down" ? adminStatus : "unknown",
      operStatus: operStatus === "up" || operStatus === "down" ? operStatus : "unknown",
      ipv4: Array.isArray(row["ipv4"]) ? row["ipv4"].filter((value): value is string => typeof value === "string") : [],
      ipv6: Array.isArray(row["ipv6"]) ? row["ipv6"].filter((value): value is string => typeof value === "string") : [],
      vlan: numberValue(row["vlan"]),
      vrf: text(row["vrf"]),
      source: "db",
      ifIndex: numberValue(row["ifIndex"]) ?? undefined,
    };
  });
}

function cachedBgpPeers(value: string | null): NetopsBgpPeer[] {
  return parseJsonArray(value).map((item) => {
    const row = asRecord(item);
    const peerIp = text(row["peerIp"]) ?? text(row["neighbor"]) ?? "unknown";
    return normalizeBgpPeer({
      peerIp,
      remoteAs: numberValue(row["remoteAs"] ?? row["asn"]),
      state: text(row["state"]),
      receivedPrefixes: numberValue(row["receivedPrefixes"] ?? row["prefixesReceived"]),
      source: "ssh",
    });
  });
}

function localDbBgpPeers(value: string | null): NetopsBgpPeer[] {
  return parseJsonArray(value).map((item) => {
    const row = asRecord(item);
    const peerIp = text(row["peerIp"]) ?? "unknown";
    return normalizeBgpPeer({
      peerIp,
      remoteAs: numberValue(row["remoteAs"]),
      description: text(row["description"]),
      name: text(row["name"]),
      state: text(row["state"]),
      role: text(row["role"]) as NetopsBgpPeer["role"] | null,
      vrf: text(row["vrf"]),
      importPolicy: text(row["importPolicy"]),
      exportPolicy: text(row["exportPolicy"]),
      receivedPrefixes: numberValue(row["receivedPrefixes"]),
      advertisedPrefixes: numberValue(row["advertisedPrefixes"]),
      activePrefixes: numberValue(row["activePrefixes"]),
      uptime: text(row["uptime"]),
      source: "db",
    });
  });
}

function cachedFilters(value: string | null): NetopsFilter[] {
  return parseJsonArray(value).map((item) => {
    const row = asRecord(item);
    return {
      name: text(row["name"]) ?? "unknown",
      type: "unknown",
      entries: [],
      source: "ssh",
    };
  });
}

function cachedVrfs(value: string | null): VrfSummary[] {
  return parseJsonArray(value).map((item) => {
    const row = asRecord(item);
    const name = text(row["name"]) ?? "unknown";
    return {
      name,
      rd: text(row["rd"]),
      exists: true,
      source: "ssh_running_config",
      confidence: "high",
      evidence: `ip vpn-instance ${name}`,
    };
  });
}

function emptyCollectorOutput(source: CollectorOutput["source"], evidenceSource: CollectorOutput["evidenceSource"]): CollectorOutput {
  return {
    source,
    evidenceSource,
    success: false,
    rawOutputs: [],
    interfaces: [],
    bgpPeers: [],
    filters: [],
    communities: [],
    vrfs: [],
    l2vpn: emptyL2vpnSummary,
    warnings: [],
  };
}

function computeStatus(ssh: CollectorOutput, snmp: CollectorOutput, cacheUsed: boolean, localDbUsed: boolean): DiscoveryStatus {
  if (ssh.success && snmp.success) return "full";
  if (!ssh.success && snmp.success && cacheUsed) return "fallback";
  if (ssh.success || snmp.success) return "partial";
  if (cacheUsed || localDbUsed) return "cached";
  return "failed";
}

function keyInterface(item: Pick<NetopsInterface, "name">): string {
  return item.name;
}

function keyPeer(item: Pick<NetopsBgpPeer, "peerIp" | "addressFamily" | "vrf">): string {
  return `${item.peerIp}|${item.addressFamily}|${item.vrf ?? ""}`;
}

function normalizeLegacyRole(role: NetopsBgpPeer["role"] | null | undefined): NetopsBgpPeer["role"] {
  if (!role || role === "unknown") return "customer";
  return role;
}

function removalCandidateWarnings(
  localInterfaces: NetopsInterface[],
  localPeers: NetopsBgpPeer[],
  freshInterfaces: NetopsInterface[],
  freshPeers: NetopsBgpPeer[],
): DiscoveryWarning[] {
  const freshInterfaceKeys = new Set(freshInterfaces.map(keyInterface));
  const freshPeerKeys = new Set(freshPeers.map((peer) => keyPeer(peer)));
  return [
    ...localInterfaces
      .filter((item) => !freshInterfaceKeys.has(keyInterface(item)))
      .map((item): DiscoveryWarning => ({
        level: "warning",
        source: "system",
        message: `interface ${item.name} existe no banco local, mas nao apareceu na coleta atual; candidato a remocao.`,
      })),
    ...localPeers
      .filter((item) => !freshPeerKeys.has(keyPeer(item)))
      .map((item): DiscoveryWarning => ({
        level: "warning",
        source: "system",
        message: `peer BGP ${item.peerIp} existe no banco local, mas nao apareceu na coleta atual; candidato a remocao.`,
      })),
  ];
}

async function applyRoleOverrides(deviceId: number, peers: ReturnType<typeof normalizeDiscoveryBgpPeers>) {
  const overrides = await db
    .select()
    .from(bgpPeerRoleOverridesTable)
    .where(eq(bgpPeerRoleOverridesTable.deviceId, deviceId));
  const byPeer = new Map(overrides.map((override) => [`${override.peerIp}|${override.addressFamily}`, override]));

  return peers.map((peer) => {
    const override = byPeer.get(`${peer.peerIp}|${peer.addressFamily}`);
    if (!override) return peer;
    const role = normalizeLegacyRole(override.role as typeof peer.role);
    return {
      ...peer,
      role,
      category: role,
      primaryDirection: primaryDirectionForRole(role),
      roleSource: "manual_override" as const,
      remoteAs: override.remoteAs ?? peer.remoteAs,
      name: override.label ?? peer.name,
    };
  });
}

export class CollectionOrchestrator {
  async run(deviceId: number, request: DeviceDiscoveryRequest): Promise<DeviceDiscoverySnapshot | null> {
    const [device] = await db.select().from(devicesTable).where(eq(devicesTable.id, deviceId)).limit(1);
    if (!device) return null;

    const discoveryRunId = `disc-${deviceId}-${Date.now()}`;
    const startedAt = new Date().toISOString();
    const audit: DiscoveryWarning[] = [{ level: "info", source: "system", message: "discovery iniciado" }];

    let ssh = emptyCollectorOutput("ssh", "ssh");
    let snmp = emptyCollectorOutput("snmp", "snmp");
    let cachedInterfacesData: NetopsInterface[] = [];
    let cachedPeersData: NetopsBgpPeer[] = [];
    let cachedFiltersData: NetopsFilter[] = [];
    let cachedCommunitiesData: NetopsCommunity[] = [];
    let cachedVrfsData: VrfSummary[] = [];
    let cachedConfigStatus: DeviceDiscoverySnapshot["sourceStatus"]["cachedConfig"] = request.useCachedConfig ? "missing" : "skipped";
    let localInterfacesData: NetopsInterface[] = [];
    let localPeersData: NetopsBgpPeer[] = [];
    let cachedFromPersistedSnapshot = false;

    const [latestLocalSnapshot] = await db
      .select()
      .from(snmpSnapshotsTable)
      .where(eq(snmpSnapshotsTable.deviceId, deviceId))
      .orderBy(desc(snmpSnapshotsTable.collectedAt))
      .limit(1);

    const persistedRun = await rawEvidenceStore.startRun(deviceId, request, startedAt);

    if (latestLocalSnapshot) {
      localInterfacesData = localDbInterfaces(latestLocalSnapshot.interfacesJson);
      localPeersData = localDbBgpPeers(latestLocalSnapshot.bgpPeersJson);
    }

    if (localInterfacesData.length === 0 && localPeersData.length === 0) {
      const persistedSnapshot = await rawEvidenceStore.getLatestPersistentSnapshot(deviceId);
      if (persistedSnapshot) {
        const previous = persistedSnapshot.snapshotJson as DeviceDiscoverySnapshot;
        localInterfacesData = previous.interfaces.map((item) => ({ ...item, source: "db" }));
        localPeersData = previous.bgpPeers.map((item) => ({ ...item, source: "db" }));
        cachedFromPersistedSnapshot = true;
        audit.push({ level: "info", source: "system", message: "ultimo discovery_snapshot persistido usado como cache" });
      }
    }

    if (request.allowSnmpFallback && (request.contexts.includes("interfaces") || request.contexts.includes("bgp"))) {
      snmp = await collectDiscoverySnmp(device);
      audit.push({ level: snmp.success ? "info" : "warning", source: "snmp", message: snmp.success ? "SNMP inventory collection success" : "SNMP inventory collection failure" });
    }

    if (request.preferLiveSsh) {
      try {
        const password = decrypt(device.passwordEncrypted);
        ssh = await collectDiscoverySsh(device, password, request.contexts);
        audit.push({ level: ssh.success ? "info" : "warning", source: "ssh", message: ssh.success ? "SSH detail collection success" : "SSH detail collection failure" });
      } catch (error) {
        ssh = { ...ssh, warnings: [{ level: "error", source: "ssh", message: sanitizeDiscoveryText(error) }] };
        audit.push({ level: "warning", source: "ssh", message: "SSH detail collection failure" });
      }
    }

    const liveIncomplete = !snmp.success || (request.contexts.includes("interfaces") && snmp.interfaces.length === 0) || (request.contexts.includes("bgp") && snmp.bgpPeers.length === 0);
    if (request.useCachedConfig && liveIncomplete) {
      const [cached] = await db
        .select()
        .from(collectedConfigsTable)
        .where(eq(collectedConfigsTable.deviceId, deviceId))
        .orderBy(desc(collectedConfigsTable.collectedAt))
        .limit(1);
      if (cached) {
        cachedConfigStatus = ssh.success || snmp.success ? "available" : "used";
        cachedInterfacesData = cachedInterfaces(cached.parsedInterfaces);
        cachedPeersData = cachedBgpPeers(cached.parsedBgp);
        cachedFiltersData = cachedFilters(cached.parsedVlans);
        cachedVrfsData = cachedVrfs(cached.parsedL3vpn);
        audit.push({ level: "info", source: "system", message: "cached config used" });
      }
    }

    for (const output of [ssh, snmp]) {
      for (const raw of output.rawOutputs) {
        const evidenceRecord: RawEvidenceRecord = {
          deviceId,
          discoveryRunId,
          context: "system",
          source: output.evidenceSource,
          command: raw.command,
          oidGroup: raw.oidGroup,
          sanitizedOutput: raw.output,
          status: raw.error ? "failed" : "success",
          startedAt,
          finishedAt: new Date().toISOString(),
          errorMessage: raw.error,
        };
        rawEvidenceStore.save(evidenceRecord);
        await rawEvidenceStore.savePersistentEvidence(evidenceRecord, persistedRun.id);
      }
    }

    const interfaces = normalizeDiscoveryInterfaces(ssh.interfaces, snmp.interfaces, cachedInterfacesData, localInterfacesData);
    const bgpPeers = await applyRoleOverrides(deviceId, normalizeDiscoveryBgpPeers(ssh.bgpPeers, snmp.bgpPeers, cachedPeersData, localPeersData));
    const { policies, prefixLists } = normalizeDiscoveryPolicies([...cachedFiltersData, ...ssh.filters]);
    const { communityFilters, communityLists } = normalizeDiscoveryCommunities([...cachedCommunitiesData, ...ssh.communities]);
    const candidateWarnings = removalCandidateWarnings(
      localInterfacesData,
      localPeersData,
      [...snmp.interfaces, ...ssh.interfaces],
      [...snmp.bgpPeers, ...ssh.bgpPeers],
    );
    const status = computeStatus(ssh, snmp, cachedConfigStatus === "used", Boolean((latestLocalSnapshot || cachedFromPersistedSnapshot) && (localInterfacesData.length || localPeersData.length)));
    const finishedAt = new Date().toISOString();

    const snapshot: DeviceDiscoverySnapshot = {
      deviceId,
      discoveryRunId,
      status,
      contexts: request.contexts,
      startedAt,
      finishedAt,
      sourceStatus: {
        ssh: request.preferLiveSsh ? (ssh.success ? "success" : "failed") : "skipped",
        snmp: request.allowSnmpFallback ? (snmp.success ? "success" : "failed") : "skipped",
        cachedConfig: cachedConfigStatus,
      },
      persistedRunId: persistedRun.id,
      persistedSnapshotId: null,
      cachedFromPersistedSnapshot,
      parserVersion: COMPLIANCE_PARSER_VERSION,
      parserVersions: {
        interface: INTERFACE_PARSER_VERSION,
      },
      sourcesUsed: [
        ...(snmp.success ? ["snmp_snapshot" as const] : []),
        ...(ssh.success ? ["ssh_live" as const] : []),
        ...(cachedConfigStatus === "used" || cachedConfigStatus === "available" ? ["ssh_running_config" as const] : []),
        ...(latestLocalSnapshot ? ["local_db" as const] : []),
        ...(cachedFromPersistedSnapshot ? ["local_db" as const] : []),
      ],
      interfaces,
      bgpPeers,
      policies,
      communities: communityFilters,
      communityLists,
      prefixLists,
      vrfs: [...cachedVrfsData, ...ssh.vrfs],
      l2vpn: ssh.l2vpn,
      warnings: [...ssh.warnings, ...snmp.warnings, ...candidateWarnings],
      audit: [...audit, { level: "info", source: "system", message: "discovery results persisted to local database" }, { level: status === "failed" ? "error" : "info", source: "system", message: "discovery completed" }],
    };

    snapshot.persistedSnapshotId = await rawEvidenceStore.finishRun(snapshot, persistedRun.id);

    rawEvidenceStore.saveSnapshot(snapshot);
    return snapshot;
  }

  buildPeerDetails(snapshot: DeviceDiscoverySnapshot, peerIp: string) {
    const peer = snapshot.bgpPeers.find((item) => item.peerIp === peerIp);
    if (!peer) return null;
    return buildBgpPeerDetails(peer, snapshot.policies, snapshot.communities, snapshot.communityLists, snapshot.prefixLists);
  }
}

export const collectionOrchestrator = new CollectionOrchestrator();
