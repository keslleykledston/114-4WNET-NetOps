import { db, l2CircuitsTable, l2DiscoveryJobsTable, devicesTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import type { and as andType } from "drizzle-orm";
import type { SSHConfig } from "../../lib/ssh.js";
import { collectL2CircuitsViaSsh } from "./collectors/ssh.collector.js";
import { parseHuaweiL2Circuits } from "./parsers/huawei-vrp-l2.js";
import { normalizeCircuits } from "./normalizers/status.normalizer.js";
import { resolveL2Findings, attachFindingsToCircuits } from "./normalizers/findings.resolver.js";
import type { L2Circuit, L2CircuitListFilter, L2DiscoveryJob, L2DiscoveryJobResponse, NormalizedL2Circuit } from "./l2circuits.types.js";

export async function discoverL2Circuits(deviceId: number, sshConfig: SSHConfig): Promise<L2DiscoveryJobResponse> {
  const runId = `disc-l2-${deviceId}-${Date.now()}`;
  const now = new Date();

  // Create job record
  const jobRecord = await db.insert(l2DiscoveryJobsTable).values({
    runId,
    deviceId,
    status: "running",
    startedAt: now,
  }).returning();

  const jobId = jobRecord[0]?.id;

  try {
    // Collect via SSH
    const rawOutput = await collectL2CircuitsViaSsh(sshConfig);

    // Parse
    const parsed = parseHuaweiL2Circuits(rawOutput);

    // Normalize
    const normalized = normalizeCircuits(parsed);

    // Resolve findings
    const allFindings = resolveL2Findings(normalized);
    const withFindings = attachFindingsToCircuits(normalized, allFindings);

    // Upsert circuits in DB
    for (const circuit of withFindings) {
      await db
        .insert(l2CircuitsTable)
        .values({
          deviceId,
          circuitType: circuit.circuitType,
          name: circuit.name,
          vcId: circuit.vcId,
          vsiName: circuit.vsiName,
          vsiId: circuit.vsiId,
          localInterface: circuit.localInterface,
          parentInterface: circuit.parentInterface,
          peerIp: circuit.peerIp,
          outerVlan: circuit.outerVlan,
          innerVlan: circuit.innerVlan,
          adminStatus: circuit.adminStatus,
          operStatus: circuit.operStatus,
          pwStatus: circuit.pwStatus,
          macCount: circuit.macCount,
          description: circuit.description,
          findings: circuit.findings,
          rawEvidence: circuit.rawEvidence,
          discoveryRunId: runId,
          firstSeen: now,
          lastSeen: now,
          source: "ssh_live",
        })
        .onConflictDoUpdate({
          target: [],
          set: {
            adminStatus: circuit.adminStatus,
            operStatus: circuit.operStatus,
            pwStatus: circuit.pwStatus,
            macCount: circuit.macCount,
            findings: circuit.findings,
            lastSeen: now,
          },
        });
    }

    // Update job to completed
    const totalFindings = allFindings.length;
    if (jobId) {
      await db
        .update(l2DiscoveryJobsTable)
        .set({
          status: "completed",
          finishedAt: new Date(),
          circuitCount: withFindings.length,
          findingsCount: totalFindings,
        })
        .where(eq(l2DiscoveryJobsTable.id, jobId));
    }

    // Return response
    return {
      run_id: runId,
      device_id: deviceId,
      status: "completed",
      started_at: now.toISOString(),
      finished_at: new Date().toISOString(),
      circuit_count: withFindings.length,
      findings_count: totalFindings,
      circuits: await getL2CircuitsByRunId(runId),
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);

    // Mark job as failed
    if (jobId) {
      await db
        .update(l2DiscoveryJobsTable)
        .set({
          status: "failed",
          finishedAt: new Date(),
          errorMessage: errorMsg,
        })
        .where(eq(l2DiscoveryJobsTable.id, jobId));
    }

    throw error;
  }
}

export async function listL2Circuits(filter?: L2CircuitListFilter): Promise<L2Circuit[]> {
  let results: any[] = [];

  if (filter?.deviceId) {
    results = await (db.select() as any).from(l2CircuitsTable).where(eq(l2CircuitsTable.deviceId, filter.deviceId));
  } else if (filter?.circuitType) {
    results = await (db.select() as any).from(l2CircuitsTable).where(eq(l2CircuitsTable.circuitType, filter.circuitType));
  } else if (filter?.vcId) {
    results = await (db.select() as any).from(l2CircuitsTable).where(eq(l2CircuitsTable.vcId, filter.vcId));
  } else if (filter?.vsiName) {
    results = await (db.select() as any).from(l2CircuitsTable).where(eq(l2CircuitsTable.vsiName, filter.vsiName));
  } else {
    results = await (db.select() as any).from(l2CircuitsTable);
  }

  return results.map(formatCircuit);
}

export async function getL2Circuit(id: number): Promise<L2Circuit | null> {
  const [result] = await db.select().from(l2CircuitsTable).where(eq(l2CircuitsTable.id, id));
  return result ? formatCircuit(result) : null;
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
    status: row.status as any,
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
  return results.map(formatCircuit);
}

function formatCircuit(row: typeof l2CircuitsTable.$inferSelect): L2Circuit {
  return {
    id: row.id,
    deviceId: row.deviceId,
    circuitType: row.circuitType as any,
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
    peerIp: row.peerIp,
    adminStatus: row.adminStatus as any,
    operStatus: row.operStatus as any,
    pwStatus: row.pwStatus,
    macCount: row.macCount,
    source: row.source as any,
    rawEvidence: row.rawEvidence,
    findings: (row.findings || []) as any,
    firstSeen: row.firstSeen,
    lastSeen: row.lastSeen,
    discoveryRunId: row.discoveryRunId,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}
