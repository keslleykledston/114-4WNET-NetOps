import { createHash } from "crypto";
import { db, discoveryEvidenceTable, discoveryRunsTable, discoverySnapshotsTable } from "@workspace/db";
import { desc, eq } from "drizzle-orm";
import type { DeviceDiscoveryRequest, DeviceDiscoverySnapshot, RawEvidenceRecord } from "../discovery.types.js";

const MAX_EVIDENCE_CHARS = 12_000;
const evidenceByRun = new Map<string, RawEvidenceRecord[]>();
const latestSnapshotByDevice = new Map<number, DeviceDiscoverySnapshot>();

export function sanitizeDiscoveryText(value: unknown): string {
  const text = String(value ?? "");
  return text
    .replace(/(password|community|token|secret)\s*[:=]\s*\S+/gi, "$1=<redacted>")
    .replace(/snmp-server\s+community\s+\S+/gi, "snmp-server community <redacted>")
    .replace(/(cipher|simple)\s+\S+/gi, "$1 <redacted>")
    .slice(0, MAX_EVIDENCE_CHARS);
}

export class RawEvidenceStore {
  async startRun(deviceId: number, request: DeviceDiscoveryRequest, startedAt: string) {
    const [run] = await db.insert(discoveryRunsTable).values({
      deviceId,
      requestedContextsJson: request.contexts,
      preferLiveSsh: request.preferLiveSsh,
      allowSnmpFallback: request.allowSnmpFallback,
      useCachedConfig: request.useCachedConfig,
      status: "running",
      sshStatus: "skipped",
      snmpStatus: "skipped",
      cachedConfigUsed: false,
      sourceSummaryJson: {},
      summaryJson: {},
      warningsJson: [],
      startedAt: new Date(startedAt),
      createdBy: "local",
    }).returning();
    return run;
  }

  save(record: RawEvidenceRecord): void {
    const list = evidenceByRun.get(record.discoveryRunId) ?? [];
    list.push({
      ...record,
      sanitizedOutput: sanitizeDiscoveryText(record.sanitizedOutput),
      errorMessage: record.errorMessage ? sanitizeDiscoveryText(record.errorMessage).slice(0, 500) : undefined,
    });
    evidenceByRun.set(record.discoveryRunId, list);
  }

  async savePersistentEvidence(record: RawEvidenceRecord, persistedRunId: number): Promise<void> {
    await db.insert(discoveryEvidenceTable).values({
      deviceId: record.deviceId,
      discoveryRunId: persistedRunId,
      context: record.context,
      source: record.source,
      commandOrOidGroup: record.command ?? record.oidGroup ?? null,
      sanitizedOutput: sanitizeDiscoveryText(record.sanitizedOutput),
      status: record.status,
      errorMessage: record.errorMessage ? sanitizeDiscoveryText(record.errorMessage).slice(0, 500) : null,
      startedAt: new Date(record.startedAt),
      finishedAt: new Date(record.finishedAt),
    });
  }

  saveSnapshot(snapshot: DeviceDiscoverySnapshot): void {
    latestSnapshotByDevice.set(snapshot.deviceId, snapshot);
  }

  async finishRun(snapshot: DeviceDiscoverySnapshot, persistedRunId: number): Promise<number | null> {
    const summary = {
      interfaces: snapshot.interfaces.length,
      bgpPeers: snapshot.bgpPeers.length,
      policies: snapshot.policies.length,
      communities: snapshot.communities.length + snapshot.communityLists.length,
      vrfs: snapshot.vrfs.length,
      l2vpn: snapshot.l2vpn.l2vcs.length + snapshot.l2vpn.vsis.length,
    };
    const sourceSummary = {
      sourcesUsed: snapshot.sourcesUsed,
      sourceStatus: snapshot.sourceStatus,
      cachedFromPersistedSnapshot: snapshot.cachedFromPersistedSnapshot === true,
    };

    await db.update(discoveryRunsTable)
      .set({
        status: snapshot.status,
        sshStatus: snapshot.sourceStatus.ssh,
        sshMessage: snapshot.audit.find((item) => item.source === "ssh")?.message ?? null,
        snmpStatus: snapshot.sourceStatus.snmp,
        snmpMessage: snapshot.audit.find((item) => item.source === "snmp")?.message ?? null,
        cachedConfigUsed: snapshot.sourceStatus.cachedConfig === "used",
        sourceSummaryJson: sourceSummary,
        summaryJson: summary,
        warningsJson: snapshot.warnings,
        finishedAt: new Date(snapshot.finishedAt),
      })
      .where(eq(discoveryRunsTable.id, persistedRunId));

    const snapshotHash = hashSnapshot(snapshot);
    const latest = await this.getLatestPersistentSnapshot(snapshot.deviceId);
    if (latest?.snapshotHash === snapshotHash) return latest.id;

    const [created] = await db.insert(discoverySnapshotsTable).values({
      deviceId: snapshot.deviceId,
      discoveryRunId: persistedRunId,
      status: snapshot.status,
      snapshotJson: snapshot,
      sourceSummaryJson: sourceSummary,
      parserVersion: "huawei-vrp-v1",
      snapshotHash,
    }).returning();

    return created.id;
  }

  getLatestSnapshot(deviceId: number): DeviceDiscoverySnapshot | null {
    return latestSnapshotByDevice.get(deviceId) ?? null;
  }

  async getLatestPersistentSnapshot(deviceId: number) {
    const [snapshot] = await db
      .select()
      .from(discoverySnapshotsTable)
      .where(eq(discoverySnapshotsTable.deviceId, deviceId))
      .orderBy(desc(discoverySnapshotsTable.createdAt))
      .limit(1);
    return snapshot ?? null;
  }

  async getLatestPersistentRun(deviceId: number) {
    const [run] = await db
      .select()
      .from(discoveryRunsTable)
      .where(eq(discoveryRunsTable.deviceId, deviceId))
      .orderBy(desc(discoveryRunsTable.createdAt))
      .limit(1);
    return run ?? null;
  }

  getRunEvidence(discoveryRunId: string): RawEvidenceRecord[] {
    return evidenceByRun.get(discoveryRunId) ?? [];
  }
}

export const rawEvidenceStore = new RawEvidenceStore();

function hashSnapshot(snapshot: DeviceDiscoverySnapshot): string {
  return createHash("sha256").update(JSON.stringify({
    interfaces: snapshot.interfaces,
    bgpPeers: snapshot.bgpPeers,
    policies: snapshot.policies,
    communities: snapshot.communities,
    communityLists: snapshot.communityLists,
    prefixLists: snapshot.prefixLists,
    vrfs: snapshot.vrfs,
    l2vpn: snapshot.l2vpn,
  })).digest("hex");
}
