import { complianceFindingsTable, complianceJobsTable, db, devicesTable } from "@workspace/db";
import { and, desc, eq, inArray } from "drizzle-orm";
import { getAnnouncementMatrix } from "../bgp-announcements/announcement-matrix.service.js";
import { listL2Circuits } from "../l2circuits/l2circuits.service.js";
import { listNetopsBgpPeers } from "../netops/service.js";
import type { NetopsBgpPeer } from "../netops/types.js";
import { PROVIDER_ALIASES, resolveProviderAlias, type ProviderAlias } from "./copilot.aliases.js";
import type {
  CopilotAnnouncementMatch,
  CopilotCircuitMatch,
  CopilotComplianceFinding,
  CopilotEntity,
  CopilotL2FindingMatch,
  CopilotPeerMatch,
} from "./copilot.types.js";

function peerHaystack(peer: NetopsBgpPeer): string {
  return [
    peer.peerIp,
    peer.name,
    peer.description,
    peer.importPolicy,
    peer.exportPolicy,
    peer.vrf,
    peer.role,
    peer.remoteAs != null ? String(peer.remoteAs) : "",
  ].filter(Boolean).join(" ").toLowerCase();
}

function peerMatchesProvider(peer: NetopsBgpPeer, alias: ProviderAlias): boolean {
  const hay = peerHaystack(peer);
  if (alias.remoteAs?.includes(peer.remoteAs ?? -1)) return true;
  return alias.keywords.some((keyword) => hay.includes(keyword));
}

function peerMatchesEntity(peer: NetopsBgpPeer, entity: CopilotEntity): string | null {
  const hay = peerHaystack(peer);
  switch (entity.kind) {
    case "provider": {
      const alias = PROVIDER_ALIASES.find((item) => item.id === entity.value);
      return alias && peerMatchesProvider(peer, alias) ? `alias ${alias.displayName}` : null;
    }
    case "asn":
      return peer.remoteAs === Number(entity.value) ? `ASN ${entity.value}` : null;
    case "peer_ip":
      return peer.peerIp === entity.value ? "peer IP" : null;
    case "vrf":
      return peer.vrf?.toUpperCase() === entity.value.toUpperCase() ? `VRF ${entity.value}` : null;
    case "customer":
      return hay.includes(entity.value.toLowerCase()) ? `nome ${entity.value}` : null;
    case "prefix":
      return hay.includes(entity.value.toLowerCase()) ? `prefixo ${entity.value}` : null;
    default:
      return hay.includes(entity.value.toLowerCase()) ? entity.value : null;
  }
}

async function loadTargetDevices(deviceIds: number[]) {
  if (deviceIds.length === 0) return [];
  const devices = await db.select().from(devicesTable).where(eq(devicesTable.status, "active"));
  const allowed = new Set(deviceIds);
  return devices.filter((device) => allowed.has(device.id));
}

export async function searchBgpPeers(input: {
  entities: CopilotEntity[];
  deviceIds: number[];
  freeText?: string;
}): Promise<CopilotPeerMatch[]> {
  const devices = await loadTargetDevices(input.deviceIds);
  const matches: CopilotPeerMatch[] = [];
  const providerFromText = input.freeText ? resolveProviderAlias(input.freeText) : null;

  const providerEntity = input.entities.find((entity) => entity.kind === "provider");
  const providerAlias = providerEntity
    ? PROVIDER_ALIASES.find((item) => item.id === providerEntity.value) ?? null
    : null;
  const filterEntities = input.entities.filter((entity) => entity.kind !== "provider");

  for (const device of devices) {
    const peers = await listNetopsBgpPeers(device.id);
    if (!peers) continue;

    for (const peer of peers) {
      const reasons: string[] = [];

      if (providerAlias) {
        if (!peerMatchesProvider(peer, providerAlias)) continue;
        reasons.push(`alias ${providerAlias.displayName}`);
        for (const entity of filterEntities) {
          const reason = peerMatchesEntity(peer, entity);
          if (!reason) {
            reasons.length = 0;
            break;
          }
          reasons.push(reason);
        }
        if (reasons.length === 0) continue;
      } else {
        for (const entity of input.entities) {
          const reason = peerMatchesEntity(peer, entity);
          if (reason) reasons.push(reason);
        }
        if (providerFromText && peerMatchesProvider(peer, providerFromText)) {
          reasons.push(`alias ${providerFromText.displayName}`);
        }
        if (reasons.length === 0 && input.freeText) {
          const q = input.freeText.toLowerCase();
          if (peerHaystack(peer).includes(q)) {
            reasons.push("texto livre");
          }
        }
        if (reasons.length === 0) continue;
      }

      matches.push({
        deviceId: device.id,
        deviceHostname: device.hostname,
        peerIp: peer.peerIp,
        remoteAs: peer.remoteAs,
        state: peer.state,
        vrf: peer.vrf,
        role: peer.role,
        uptime: peer.uptime,
        receivedPrefixes: peer.receivedPrefixes,
        advertisedPrefixes: peer.advertisedPrefixes,
        importPolicy: peer.importPolicy,
        exportPolicy: peer.exportPolicy,
        matchReason: [...new Set(reasons)].join(", "),
      });
    }
  }

  return matches.sort((left, right) => {
    const leftUp = left.state === "Established" ? 0 : 1;
    const rightUp = right.state === "Established" ? 0 : 1;
    return leftUp - rightUp || left.deviceHostname.localeCompare(right.deviceHostname);
  });
}

export async function searchAnnouncements(input: {
  entities: CopilotEntity[];
  deviceIds: number[];
}): Promise<CopilotAnnouncementMatch[]> {
  const searchTerms = input.entities
    .filter((entity) => ["prefix", "asn", "customer", "provider"].includes(entity.kind))
    .map((entity) => {
      if (entity.kind === "provider") {
        const alias = PROVIDER_ALIASES.find((item) => item.id === entity.value);
        return alias?.displayName ?? entity.value;
      }
      return entity.label ?? entity.value;
    });

  if (searchTerms.length === 0) return [];

  const devices = await loadTargetDevices(input.deviceIds);
  const matches: CopilotAnnouncementMatch[] = [];

  for (const device of devices.slice(0, 12)) {
    for (const term of searchTerms) {
      const matrix = await getAnnouncementMatrix(device.id, { search: term });
      if (matrix === "no_snapshot") continue;
      for (const row of matrix.rows.slice(0, 12)) {
        matches.push({
          deviceId: device.id,
          deviceHostname: device.hostname,
          routePolicyName: row.routePolicyName,
          family: row.family,
          targetType: row.targetType,
          affectedPrefixes: row.affectedPrefixes.slice(0, 8),
          upstreamSummary: row.cells.map((cell) => `${cell.circuitId}:${cell.state}`).join(", "),
        });
      }
    }
  }

  const deduped = new Map<string, CopilotAnnouncementMatch>();
  for (const match of matches) {
    deduped.set(`${match.deviceId}|${match.routePolicyName}|${match.family}`, match);
  }
  return [...deduped.values()];
}

export async function searchCircuits(input: {
  entities: CopilotEntity[];
  deviceIds: number[];
  freeText?: string;
}): Promise<CopilotCircuitMatch[]> {
  const allowed = new Set(input.deviceIds);
  const circuits = (await listL2Circuits()).filter((circuit) => allowed.has(circuit.deviceId));
  const devices = await loadTargetDevices(input.deviceIds);
  const hostnameById = new Map(devices.map((device) => [device.id, device.hostname]));
  const terms = [
    ...input.entities.filter((entity) => entity.kind === "circuit").map((entity) => entity.value.toLowerCase()),
    ...(input.freeText ? [input.freeText.toLowerCase()] : []),
  ].filter(Boolean);

  if (terms.length === 0 && input.entities.length === 0) {
    return [];
  }

  const matches: CopilotCircuitMatch[] = [];
  for (const circuit of circuits) {
    const hay = [
      circuit.name,
      circuit.description,
      circuit.serviceId,
      circuit.vsiName,
      circuit.vcId,
      circuit.peerIp,
      circuit.localInterface,
    ].filter(Boolean).join(" ").toLowerCase();

    const reasons: string[] = [];
    for (const term of terms) {
      if (hay.includes(term)) reasons.push(term);
    }
    if (reasons.length === 0) continue;

    matches.push({
      id: circuit.id,
      deviceId: circuit.deviceId,
      deviceHostname: hostnameById.get(circuit.deviceId) ?? `device-${circuit.deviceId}`,
      name: circuit.name,
      circuitType: circuit.circuitType,
      operStatus: circuit.operStatus,
      adminStatus: circuit.adminStatus,
      peerIp: circuit.peerIp ?? circuit.primaryPeerIp ?? null,
      vsiName: circuit.vsiName ?? null,
      vcId: circuit.vcId ?? null,
      findings: circuit.findings.map((finding) => finding.code),
      matchReason: [...new Set(reasons)].join(", "),
    });
  }

  return matches.slice(0, 20);
}

export async function searchComplianceFindings(input: {
  deviceIds: number[];
  freeText?: string;
  status?: "fail" | "pass" | "all";
}): Promise<CopilotComplianceFinding[]> {
  if (input.deviceIds.length === 0) return [];

  const rows = await db
    .select({
      id: complianceFindingsTable.id,
      jobId: complianceFindingsTable.jobId,
      deviceId: complianceJobsTable.deviceId,
      deviceHostname: devicesTable.hostname,
      severity: complianceFindingsTable.severity,
      status: complianceFindingsTable.status,
      context: complianceFindingsTable.context,
      ruleName: complianceFindingsTable.ruleName,
      message: complianceFindingsTable.message,
      recommendation: complianceFindingsTable.recommendation,
      objectName: complianceFindingsTable.objectName,
      completedAt: complianceJobsTable.completedAt,
    })
    .from(complianceFindingsTable)
    .innerJoin(complianceJobsTable, eq(complianceFindingsTable.jobId, complianceJobsTable.id))
    .innerJoin(devicesTable, eq(complianceJobsTable.deviceId, devicesTable.id))
    .where(and(
      inArray(complianceJobsTable.deviceId, input.deviceIds),
      ...(input.status && input.status !== "all" ? [eq(complianceFindingsTable.status, input.status)] : []),
    ))
    .orderBy(desc(complianceJobsTable.completedAt), desc(complianceFindingsTable.id))
    .limit(80);

  const needle = input.freeText?.trim().toLowerCase() ?? "";
  const matches: CopilotComplianceFinding[] = [];

  for (const row of rows) {
    const hay = [
      row.ruleName,
      row.message,
      row.context,
      row.objectName,
      row.deviceHostname,
    ].filter(Boolean).join(" ").toLowerCase();

    if (needle && !hay.includes(needle)) continue;

    matches.push({
      id: row.id,
      jobId: row.jobId,
      deviceId: row.deviceId,
      deviceHostname: row.deviceHostname,
      severity: row.severity,
      status: row.status ?? "unknown",
      context: row.context,
      ruleName: row.ruleName ?? "unknown",
      message: row.message ?? "",
      recommendation: row.recommendation,
      objectName: row.objectName,
      collectedAt: row.completedAt?.toISOString() ?? null,
    });
  }

  const deduped = new Map<string, CopilotComplianceFinding>();
  for (const row of matches) {
    const key = `${row.deviceId}|${row.ruleName}|${row.objectName ?? ""}`;
    if (!deduped.has(key)) deduped.set(key, row);
  }

  return [...deduped.values()].slice(0, 30);
}

export async function searchL2Findings(input: {
  deviceIds: number[];
  freeText?: string;
}): Promise<CopilotL2FindingMatch[]> {
  const circuits = await searchCircuits({
    entities: [],
    deviceIds: input.deviceIds,
    freeText: input.freeText,
  });

  const allowed = new Set(input.deviceIds);
  const allCircuits = (await listL2Circuits()).filter((circuit) => allowed.has(circuit.deviceId));
  const devices = await loadTargetDevices(input.deviceIds);
  const hostnameById = new Map(devices.map((device) => [device.id, device.hostname]));
  const needle = input.freeText?.trim().toLowerCase() ?? "";

  const matches: CopilotL2FindingMatch[] = [];
  for (const circuit of allCircuits) {
    const codes = circuit.findings.map((finding) => finding.code).filter(Boolean);
    if (codes.length === 0) continue;

    const hay = [
      circuit.name,
      circuit.description,
      circuit.vsiName,
      circuit.vcId,
      ...codes,
    ].filter(Boolean).join(" ").toLowerCase();

    if (needle && !hay.includes(needle)) continue;

    matches.push({
      deviceId: circuit.deviceId,
      deviceHostname: hostnameById.get(circuit.deviceId) ?? `device-${circuit.deviceId}`,
      circuitId: circuit.id,
      circuitName: circuit.name,
      operStatus: circuit.operStatus,
      codes,
      matchReason: codes.join(", "),
    });
  }

  if (matches.length === 0 && circuits.length > 0) {
    for (const circuit of circuits) {
      if (circuit.findings.length === 0) continue;
      matches.push({
        deviceId: circuit.deviceId,
        deviceHostname: circuit.deviceHostname,
        circuitId: circuit.id,
        circuitName: circuit.name,
        operStatus: circuit.operStatus,
        codes: circuit.findings,
        matchReason: circuit.matchReason,
      });
    }
  }

  return matches.slice(0, 25);
}
