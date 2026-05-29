import { db, l2CircuitsTable, l2DeviceOperationalTable, l2DiscoveryJobsTable } from "@workspace/db";
import { eq, inArray } from "drizzle-orm";
import type { SSHConfig } from "../../lib/ssh.js";
import { collectL2CircuitsViaSsh } from "./collectors/ssh.collector.js";
import { parseHuaweiL2Circuits } from "./parsers/huawei-vrp-l2.js";
import { normalizeCircuits } from "./normalizers/status.normalizer.js";
import { enrichCircuitsWithFindings, resolveL2Findings } from "./normalizers/findings.resolver.js";
import type { NormalizedL2Circuit } from "./l2circuits.types.js";
import { buildL3RoleContext, hasL3ServiceEvidence, type L3EvidenceSnapshot } from "./parsers/l3-evidence.helpers.js";
import type { L2Circuit, L2CircuitListFilter, L2DiscoveryJob, L2DiscoveryJobResponse } from "./l2circuits.types.js";
import { OPERATIONAL_STALE_TAG } from "./operational-refresh/l2-operational-merge.js";
import {
  mergeVsiOperationalEvidence,
  readVsiOperationalFromEvidence,
} from "./parsers/vsi-multipoint.helpers.js";

export function createL2DiscoveryRunId(deviceId: number): string {
  return `disc-l2-${deviceId}-${Date.now()}`;
}

export async function startL2DiscoveryJob(deviceId: number, runId: string): Promise<{ jobId: number; startedAt: Date }> {
  const startedAt = new Date();
  const [job] = await db
    .insert(l2DiscoveryJobsTable)
    .values({
      runId,
      deviceId,
      status: "running",
      startedAt,
    })
    .returning();

  if (!job) {
    throw new Error("Failed to create L2 discovery job");
  }

  return { jobId: job.id, startedAt };
}

export async function runL2DiscoveryJob(deviceId: number, runId: string, sshConfig: SSHConfig): Promise<void> {
  const job = await getL2DiscoveryJob(runId);
  if (!job) {
    throw new Error(`Discovery job not found: ${runId}`);
  }

  const now = job.startedAt;

  if (process.env.L2_DISCOVER_SSH_ENABLED !== "true") {
    await db
      .update(l2DiscoveryJobsTable)
      .set({
        status: "failed",
        finishedAt: new Date(),
        errorMessage: "L2 SSH discovery is disabled (set L2_DISCOVER_SSH_ENABLED=true to collect from devices)",
      })
      .where(eq(l2DiscoveryJobsTable.runId, runId));
    return;
  }

  try {
    const rawOutput = await collectL2CircuitsViaSsh(sshConfig);
    const parsed = parseHuaweiL2Circuits(rawOutput);
    const normalized = normalizeCircuits(parsed);
    const withFindings = enrichCircuitsWithFindings(normalized, deviceId);
    const allFindings = resolveL2Findings(normalized, deviceId);

    for (const circuit of withFindings) {
      await db.insert(l2CircuitsTable).values({
        deviceId,
        circuitType: circuit.circuitType,
        serviceId: circuit.serviceId,
        name: circuit.name,
        vcId: circuit.vcId,
        vsiName: circuit.vsiName,
        vsiId: circuit.vsiId,
        localInterface: circuit.localInterface,
        parentInterface: circuit.parentInterface,
        peerIp: circuit.primaryPeerIp ?? circuit.peerIp,
        outerVlan: circuit.outerVlan,
        innerVlan: circuit.innerVlan,
        adminStatus: circuit.adminStatus,
        operStatus: circuit.operStatus,
        pwStatus: circuit.pwStatus,
        macCount: circuit.macCount,
        description: circuit.description,
        classification: circuit.classification,
        l2Transport: circuit.l2Transport,
        deviceRoleFamily: circuit.deviceRoleFamily,
        evidenceFlags: mergeVsiOperationalEvidence(circuit.evidenceFlags, circuit),
        anomalyTags: circuit.anomalyTags ?? [],
        roleContext: circuit.roleContext,
        findings: circuit.findings,
        rawEvidence: circuit.rawEvidence,
        discoveryRunId: runId,
        firstSeen: now,
        lastSeen: now,
        source: "ssh_live",
      });
    }

    await db
      .update(l2DiscoveryJobsTable)
      .set({
        status: "completed",
        finishedAt: new Date(),
        circuitCount: withFindings.length,
        findingsCount: allFindings.length,
      })
      .where(eq(l2DiscoveryJobsTable.runId, runId));
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    await db
      .update(l2DiscoveryJobsTable)
      .set({
        status: "failed",
        finishedAt: new Date(),
        errorMessage: errorMsg,
      })
      .where(eq(l2DiscoveryJobsTable.runId, runId));
    throw error;
  }
}

/** @deprecated Use startL2DiscoveryJob + runL2DiscoveryJob */
export async function discoverL2Circuits(
  deviceId: number,
  sshConfig: SSHConfig,
  runId: string,
): Promise<L2DiscoveryJobResponse> {
  await runL2DiscoveryJob(deviceId, runId, sshConfig);
  const job = await getL2DiscoveryJob(runId);
  const circuits = await getL2CircuitsByRunId(runId);

  return {
    run_id: runId,
    device_id: deviceId,
    status: job?.status ?? "failed",
    started_at: job?.startedAt.toISOString() ?? new Date().toISOString(),
    finished_at: job?.finishedAt?.toISOString() ?? null,
    circuit_count: job?.circuitCount ?? circuits.length,
    findings_count: job?.findingsCount ?? 0,
    circuits,
  };
}

export async function listL2Circuits(filter?: L2CircuitListFilter): Promise<L2Circuit[]> {
  let results: (typeof l2CircuitsTable.$inferSelect)[] = [];

  if (filter?.deviceId) {
    results = await db.select().from(l2CircuitsTable).where(eq(l2CircuitsTable.deviceId, filter.deviceId));
  } else if (filter?.circuitType) {
    results = await db.select().from(l2CircuitsTable).where(eq(l2CircuitsTable.circuitType, filter.circuitType));
  } else if (filter?.vcId) {
    results = await db.select().from(l2CircuitsTable).where(eq(l2CircuitsTable.vcId, filter.vcId));
  } else if (filter?.vsiName) {
    results = await db.select().from(l2CircuitsTable).where(eq(l2CircuitsTable.vsiName, filter.vsiName));
  } else {
    results = await db.select().from(l2CircuitsTable);
  }

  return (await rehydrateFindingsForRows(results)).map(formatCircuit);
}

export async function getL2Circuit(id: number): Promise<L2Circuit | null> {
  const [result] = await db.select().from(l2CircuitsTable).where(eq(l2CircuitsTable.id, id));
  if (!result) return null;

  const [rehydrated] = await rehydrateFindingsForRows([result]);
  return formatCircuit(rehydrated);
}

function inferDot1qView(row: typeof l2CircuitsTable.$inferSelect): {
  classification?: string;
  circuitType?: string;
  l2Transport?: string;
  roleContext?: string;
} {
  if (row.classification) {
    return { classification: row.classification, circuitType: row.circuitType, l2Transport: row.l2Transport ?? undefined };
  }

  const dot1qTypes = new Set(["vlan_local", "vlan_orphan", "dot1q_subif", "vlan", "l3_interface", "l3_vrf_link"]);
  if (!dot1qTypes.has(row.circuitType) || !row.localInterface) {
    return {};
  }

  const flags = (row.evidenceFlags ?? {}) as L3EvidenceSnapshot & Record<string, boolean | undefined>;
  if (hasL3ServiceEvidence(flags, row.rawEvidence)) {
    const l3Flags: L3EvidenceSnapshot = {
      ...flags,
      hasDot1q: flags.hasDot1q ?? row.outerVlan != null,
    };
    const classification = flags.hasVrf ? "l3_vrf_link" : "l3_interface";
    return {
      classification,
      circuitType: classification,
      l2Transport: "l3",
      roleContext: buildL3RoleContext(l3Flags),
    };
  }

  const hasBinding =
    flags.hasBridge ||
    flags.hasL2Binding ||
    flags.hasVeGroup ||
    flags.hasVcId ||
    flags.hasVsi ||
    flags.hasSwitchingUse ||
    flags.hasMac;
  const hasDescription = Boolean(row.description?.trim()) || Boolean(flags.hasDescription);

  if (!hasBinding && !hasDescription) {
    return { classification: "vlan_orphan", circuitType: "vlan_orphan", l2Transport: "none" };
  }

  return {};
}

function rowToNormalized(row: typeof l2CircuitsTable.$inferSelect): NormalizedL2Circuit {
  const inferred = inferDot1qView(row);
  const circuitType = (inferred.circuitType ?? row.circuitType) as NormalizedL2Circuit["circuitType"];
  const classification = (inferred.classification ?? row.classification ?? undefined) as NormalizedL2Circuit["classification"];
  const vsiOps = readVsiOperationalFromEvidence(row.evidenceFlags);

  return {
    circuitType,
    serviceId: row.serviceId ?? undefined,
    name: row.name,
    description: row.description ?? undefined,
    outerVlan: row.outerVlan ?? undefined,
    innerVlan: row.innerVlan ?? undefined,
    vcId: row.vcId ?? undefined,
    vsiName: row.vsiName ?? undefined,
    vsiId: row.vsiId ?? undefined,
    localInterface: row.localInterface ?? undefined,
    parentInterface: row.parentInterface ?? undefined,
    peerIp: vsiOps.primaryPeerIp ?? row.peerIp ?? undefined,
    primaryPeerIp: vsiOps.primaryPeerIp ?? row.peerIp ?? undefined,
    peerIps: vsiOps.peerIps,
    peers: vsiOps.peers,
    pwSummary: vsiOps.pwSummary,
    vsiState: vsiOps.vsiState,
    adminStatus: (row.adminStatus ?? "UNKNOWN") as NormalizedL2Circuit["adminStatus"],
    operStatus: (row.operStatus ?? "UNKNOWN") as NormalizedL2Circuit["operStatus"],
    pwStatus: row.pwStatus ?? undefined,
    macCount: row.macCount ?? undefined,
    rawEvidence: row.rawEvidence ?? "",
    classification,
    l2Transport: (inferred.l2Transport ?? row.l2Transport ?? undefined) as NormalizedL2Circuit["l2Transport"],
    deviceRoleFamily: (row.deviceRoleFamily ?? undefined) as NormalizedL2Circuit["deviceRoleFamily"],
    evidenceFlags: (row.evidenceFlags ?? {}) as NormalizedL2Circuit["evidenceFlags"],
    anomalyTags: (row.anomalyTags as string[] | null) ?? undefined,
    roleContext: inferred.roleContext ?? row.roleContext ?? undefined,
    findings: [],
  };
}

const OPERATIONAL_REFRESH_TS_TOLERANCE_MS = 5_000;

function rowHasOperationalStaleTag(row: typeof l2CircuitsTable.$inferSelect): boolean {
  const tags = row.anomalyTags;
  return Array.isArray(tags) && tags.includes(OPERATIONAL_STALE_TAG);
}

function rowWasUpdatedByOperationalRefresh(
  row: typeof l2CircuitsTable.$inferSelect,
  lastRefreshAt: Date | null | undefined,
): boolean {
  if (!lastRefreshAt || !row.lastSeen) return false;
  return Math.abs(row.lastSeen.getTime() - lastRefreshAt.getTime()) <= OPERATIONAL_REFRESH_TS_TOLERANCE_MS;
}

function persistedFindings(row: typeof l2CircuitsTable.$inferSelect): NormalizedL2Circuit["findings"] {
  return (row.findings ?? []) as NormalizedL2Circuit["findings"];
}

async function rehydrateFindingsForRows(
  rows: (typeof l2CircuitsTable.$inferSelect)[],
): Promise<(typeof l2CircuitsTable.$inferSelect)[]> {
  if (rows.length === 0) return rows;

  const byDevice = new Map<number, typeof rows>();
  for (const row of rows) {
    const list = byDevice.get(row.deviceId) ?? [];
    list.push(row);
    byDevice.set(row.deviceId, list);
  }

  const deviceIds = [...byDevice.keys()];
  const operationalRows =
    deviceIds.length > 0
      ? await db
          .select()
          .from(l2DeviceOperationalTable)
          .where(inArray(l2DeviceOperationalTable.deviceId, deviceIds))
      : [];
  const lastRefreshByDevice = new Map(
    operationalRows.map((row) => [row.deviceId, row.lastRefreshAt] as const),
  );

  const findingsByRowId = new Map<number, NormalizedL2Circuit["findings"]>();

  for (const [deviceId, deviceRows] of byDevice.entries()) {
    const lastRefreshAt = lastRefreshByDevice.get(deviceId);
    const rowsToRehydrate: (typeof l2CircuitsTable.$inferSelect)[] = [];

    for (const row of deviceRows) {
      if (rowHasOperationalStaleTag(row) || rowWasUpdatedByOperationalRefresh(row, lastRefreshAt)) {
        findingsByRowId.set(row.id, persistedFindings(row));
      } else {
        rowsToRehydrate.push(row);
      }
    }

    if (rowsToRehydrate.length === 0) continue;

    const normalized = rowsToRehydrate.map(rowToNormalized);
    const enriched = enrichCircuitsWithFindings(normalized, deviceId);
    for (let i = 0; i < rowsToRehydrate.length; i++) {
      findingsByRowId.set(rowsToRehydrate[i].id, enriched[i]?.findings ?? []);
    }
  }

  return rows.map((row) => {
    const inferred = inferDot1qView(row);
    return {
      ...row,
      circuitType: inferred.circuitType ?? row.circuitType,
      classification: inferred.classification ?? row.classification,
      l2Transport: inferred.l2Transport ?? row.l2Transport,
      roleContext: inferred.roleContext ?? row.roleContext,
      findings: findingsByRowId.get(row.id) ?? persistedFindings(row),
    };
  });
}

export async function getL2DiscoveryJob(runId: string): Promise<L2DiscoveryJob | null> {
  const results = await db
    .select()
    .from(l2DiscoveryJobsTable)
    .where(eq(l2DiscoveryJobsTable.runId, runId));
  if (results.length === 0) return null;

  const row = results[0];
  return {
    id: row.id,
    runId: row.runId,
    deviceId: row.deviceId,
    status: row.status as L2DiscoveryJob["status"],
    startedAt: row.startedAt,
    finishedAt: row.finishedAt,
    circuitCount: row.circuitCount,
    findingsCount: row.findingsCount,
    errorMessage: row.errorMessage,
    createdAt: row.createdAt,
  };
}

export async function getL2CircuitsByRunId(runId: string): Promise<L2Circuit[]> {
  const results = await db
    .select()
    .from(l2CircuitsTable)
    .where(eq(l2CircuitsTable.discoveryRunId, runId));
  return (await rehydrateFindingsForRows(results)).map(formatCircuit);
}

function formatCircuit(row: typeof l2CircuitsTable.$inferSelect): L2Circuit {
  const vsiOps = readVsiOperationalFromEvidence(row.evidenceFlags);

  return {
    id: row.id,
    deviceId: row.deviceId,
    circuitType: row.circuitType as L2Circuit["circuitType"],
    serviceId: row.serviceId,
    name: row.name,
    description: row.description,
    outerVlan: row.outerVlan,
    innerVlan: row.innerVlan,
    vcId: row.vcId,
    vsiName: row.vsiName,
    vsiId: row.vsiId,
    localInterface: row.localInterface,
    parentInterface: row.parentInterface,
    peerIp: row.peerIp ?? vsiOps.primaryPeerIp,
    primaryPeerIp: vsiOps.primaryPeerIp ?? row.peerIp,
    peerIps: vsiOps.peerIps ?? null,
    peers: vsiOps.peers ?? null,
    pwSummary: vsiOps.pwSummary ?? null,
    adminStatus: row.adminStatus as L2Circuit["adminStatus"],
    operStatus: row.operStatus as L2Circuit["operStatus"],
    pwStatus: row.pwStatus,
    macCount: row.macCount,
    source: row.source as L2Circuit["source"],
    rawEvidence: row.rawEvidence,
    classification: row.classification,
    l2Transport: row.l2Transport,
    deviceRoleFamily: row.deviceRoleFamily,
    evidenceFlags: row.evidenceFlags,
    anomalyTags: row.anomalyTags as string[] | null,
    roleContext: row.roleContext,
    findings: (row.findings || []) as L2Circuit["findings"],
    firstSeen: row.firstSeen,
    lastSeen: row.lastSeen,
    discoveryRunId: row.discoveryRunId,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}
