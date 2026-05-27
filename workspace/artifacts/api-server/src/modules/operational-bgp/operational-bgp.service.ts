import {
  db,
  devicesTable,
  operationalBgpCollectionJobsTable,
  operationalBgpPeersTable,
} from "@workspace/db";
import { desc, eq } from "drizzle-orm";
import { assertSnmpFastPilotDevice, OperationalPilotError } from "../operational/pilot.js";
import { SnmpCredentialsNotConfiguredError } from "../operational/operational-errors.js";
import { collectBgpPeers } from "./operational-bgp.collector.js";
import { SnmpFastBgpDisabledError } from "./operational-bgp.errors.js";
import { computeBgpFreshnessStatus } from "./operational-bgp.freshness.js";
import { isNetopsSnmpBgpRealEnabled } from "./operational-bgp.gate.js";
import { runBgpPreflightOffline } from "./operational-bgp.preflight.js";
import type {
  BgpFreshnessStatus,
  OperationalBgpCollectResult,
  OperationalBgpListResponse,
  OperationalBgpPeerDto,
  OperationalBgpSummaryResponse,
} from "./operational-bgp.types.js";

export { OperationalPilotError } from "../operational/pilot.js";
export { SnmpCredentialsNotConfiguredError } from "../operational/operational-errors.js";
export { SNMP_FAST_BGP_DISABLED, SnmpFastBgpDisabledError } from "./operational-bgp.errors.js";
export { computeBgpFreshnessStatus } from "./operational-bgp.freshness.js";

function toPeerDto(row: typeof operationalBgpPeersTable.$inferSelect): OperationalBgpPeerDto {
  return {
    peerIp: row.peerIp,
    peerAs: row.peerAs,
    peerType: row.peerType,
    vrf: row.vrf,
    afi: row.afi,
    safi: row.safi,
    adminStatus: row.adminStatus,
    operStatus: row.operStatus,
    fsmState: row.fsmState,
    uptimeSeconds: row.uptimeSeconds,
    receivedPrefixes: row.receivedPrefixes,
    acceptedPrefixes: row.acceptedPrefixes,
    advertisedPrefixes: row.advertisedPrefixes,
    lastChange: row.lastChange?.toISOString() ?? null,
    collectedAt: row.collectedAt.toISOString(),
  };
}

async function getLatestJob(deviceId: number) {
  const [job] = await db
    .select()
    .from(operationalBgpCollectionJobsTable)
    .where(eq(operationalBgpCollectionJobsTable.deviceId, deviceId))
    .orderBy(desc(operationalBgpCollectionJobsTable.startedAt))
    .limit(1);
  return job ?? null;
}

async function getLatestPeers(deviceId: number): Promise<OperationalBgpPeerDto[]> {
  const rows = await db
    .select()
    .from(operationalBgpPeersTable)
    .where(eq(operationalBgpPeersTable.deviceId, deviceId))
    .orderBy(desc(operationalBgpPeersTable.collectedAt));

  const latest = new Map<string, (typeof rows)[number]>();
  for (const row of rows) {
    const key = `${row.peerIp}|${row.vrf ?? ""}|${row.afi}|${row.safi}`;
    if (!latest.has(key)) latest.set(key, row);
  }

  return [...latest.values()]
    .sort((a, b) => a.peerIp.localeCompare(b.peerIp))
    .map((row) => toPeerDto(row));
}

function summarizeCounts(peers: OperationalBgpPeerDto[]) {
  const counts = { up: 0, down: 0, idle: 0, active: 0, unknown: 0 };
  for (const peer of peers) {
    if (peer.fsmState === "idle") {
      counts.idle += 1;
      continue;
    }
    if (peer.fsmState === "active") {
      counts.active += 1;
      continue;
    }
    if (peer.operStatus === "up") {
      counts.up += 1;
      continue;
    }
    if (peer.operStatus === "down" || peer.fsmState === "connect" || peer.fsmState === "opensent") {
      counts.down += 1;
      continue;
    }
    counts.unknown += 1;
  }
  return counts;
}

export async function getOperationalBgpPeers(deviceId: number): Promise<OperationalBgpListResponse | null> {
  assertSnmpFastPilotDevice(deviceId);

  const [device] = await db.select().from(devicesTable).where(eq(devicesTable.id, deviceId)).limit(1);
  if (!device) return null;

  const job = await getLatestJob(deviceId);
  const peers = await getLatestPeers(deviceId);
  const collectedAt = job?.finishedAt ?? job?.startedAt ?? null;
  const freshness = (job?.freshness as BgpFreshnessStatus) ?? computeBgpFreshnessStatus(collectedAt);

  return {
    deviceId,
    peers,
    freshness: peers.length === 0 && !job ? "unknown" : freshness,
    collectedAt: collectedAt?.toISOString() ?? null,
    jobId: job?.id ?? null,
  };
}

export async function getOperationalBgpSummary(deviceId: number): Promise<OperationalBgpSummaryResponse | null> {
  const list = await getOperationalBgpPeers(deviceId);
  if (!list) return null;

  const counts = summarizeCounts(list.peers);
  return {
    deviceId,
    total: list.peers.length,
    freshness: list.freshness,
    collectedAt: list.collectedAt,
    counts,
  };
}

export async function collectOperationalBgpPeers(
  deviceId: number,
  _createdBy: string,
): Promise<OperationalBgpCollectResult> {
  assertSnmpFastPilotDevice(deviceId);

  if (!isNetopsSnmpBgpRealEnabled()) {
    throw new SnmpFastBgpDisabledError();
  }

  const [device] = await db.select().from(devicesTable).where(eq(devicesTable.id, deviceId)).limit(1);
  if (!device) throw new Error("Device not found");
  if (!device.snmpCommunity?.trim()) {
    throw new SnmpCredentialsNotConfiguredError(deviceId);
  }

  const preflight = runBgpPreflightOffline();
  if (!preflight.ok) {
    throw new Error(preflight.message);
  }

  const [job] = await db
    .insert(operationalBgpCollectionJobsTable)
    .values({
      deviceId,
      status: "running",
      freshness: "unknown",
    })
    .returning();

  const collected = await collectBgpPeers({
    deviceId,
    host: device.ipAddress,
    community: device.snmpCommunity.trim(),
  });

  const collectedAt = new Date();
  const freshness = computeBgpFreshnessStatus(collectedAt);

  if (collected.peers.length > 0) {
    await db.insert(operationalBgpPeersTable).values(
      collected.peers.map((peer) => ({
        deviceId,
        collectionJobId: job.id,
        peerIp: peer.peerIp,
        peerAs: peer.peerAs,
        peerType: peer.peerType,
        vrf: peer.vrf,
        afi: peer.afi,
        safi: peer.safi,
        adminStatus: peer.adminStatus,
        operStatus: peer.operStatus,
        fsmState: peer.fsmState,
        uptimeSeconds: peer.uptimeSeconds,
        receivedPrefixes: peer.receivedPrefixes,
        acceptedPrefixes: peer.acceptedPrefixes,
        advertisedPrefixes: peer.advertisedPrefixes,
        lastChange: peer.lastChange,
        collectedAt,
      })),
    );
  }

  const jobStatus = collected.peers.length > 0 ? "succeeded" : "partial";

  await db
    .update(operationalBgpCollectionJobsTable)
    .set({
      status: jobStatus,
      finishedAt: collectedAt,
      peerCount: collected.peers.length,
      freshness,
      errorCode: null,
    })
    .where(eq(operationalBgpCollectionJobsTable.id, job.id));

  return {
    deviceId,
    jobId: job.id,
    status: jobStatus,
    peerCount: collected.peers.length,
    collectorUsed: collected.collectorUsed,
    collectedAt: collectedAt.toISOString(),
    freshness,
    stub: collected.stub,
    errorCode: null,
  };
}
