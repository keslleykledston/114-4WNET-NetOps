import {
  db,
  devicesTable,
  l2CircuitsTable,
  l2DeviceOperationalTable,
} from "@workspace/db";
import type { Device } from "@workspace/db";
import { eq } from "drizzle-orm";
import { collectSnmpInterfacesOnly, isNetopsSnmpRealEnabled } from "../../netops/snmp/collect.js";
import { collectSnmpInterfacesViaConnector } from "../../connectors/connector-snmp-collect.js";
import type { SnmpCollectedInterface } from "../../netops/snmp/types.js";
import { resolveSnmpCredential } from "../../netops/snmp/snmp-credential-resolver.js";
import { assertSnmpFastPilotDevice, OperationalPilotError } from "../../operational/pilot.js";
import { SnmpCredentialsNotConfiguredError } from "../../operational/operational-errors.js";
import {
  DEVICE_CREDENTIALS_NOT_CONFIGURED,
  L2DeviceCredentialsError,
  resolveDeviceSshConfig,
} from "../device-ssh-config.js";
import { buildCircuitKey } from "../normalizers/circuit-key.helpers.js";
import { enrichCircuitsWithFindings, resolveL2Findings } from "../normalizers/findings.resolver.js";
import { parseHuaweiL2Circuits } from "../parsers/huawei-vrp-l2.js";
import type { NormalizedL2Circuit } from "../l2circuits.types.js";
import {
  isL2OperationalRefreshEnabled,
  isL2OperationalRefreshSshConfigEnabled,
} from "./l2-operational-refresh.gate.js";
import {
  L2OperationalRefreshDisabledError,
  L2OperationalSnmpDisabledError,
} from "./l2-operational-refresh.errors.js";
import { mergeVsiOperationalEvidence } from "../parsers/vsi-multipoint.helpers.js";
import { computeL2OperationalFreshness, type L2OperationalFreshnessStatus } from "./l2-operational-refresh.freshness.js";
import { collectL2CircuitsViaSsh } from "../collectors/ssh.collector.js";
import { persistL2CircuitsFromCommandOutputs, syncL2CircuitsFromLatestCollectedConfig } from "../../config-backup/config-bundle-parser.service.js";
import { collectL2OperationalViaSsh } from "./l2-operational-ssh-ops.collector.js";
import {
  applyLiveOpsToCircuit,
  applySnmpInterfaceStatus,
  buildInterfaceStatusMap,
  buildLiveOpsByKey,
  OPERATIONAL_STALE_TAG,
  shouldMarkOperationalStale,
} from "./l2-operational-merge.js";

export {
  L2OperationalRefreshDisabledError,
  L2OperationalSnmpDisabledError,
  L2_OPERATIONAL_REFRESH_DISABLED,
  L2_OPERATIONAL_SNMP_DISABLED,
} from "./l2-operational-refresh.errors.js";
export { OperationalPilotError } from "../../operational/pilot.js";
export { SnmpCredentialsNotConfiguredError } from "../../operational/operational-errors.js";
export { L2DeviceCredentialsError, DEVICE_CREDENTIALS_NOT_CONFIGURED } from "../device-ssh-config.js";
export { computeL2OperationalFreshness } from "./l2-operational-refresh.freshness.js";

export type L2OperationalMeta = {
  device_id: number;
  last_refresh_at: string | null;
  freshness: L2OperationalFreshnessStatus;
  operational_state?: Record<string, unknown>;
};

export type L2OperationalRefreshResult = {
  device_id: number;
  last_refresh_at: string;
  freshness: L2OperationalFreshnessStatus;
  circuits_updated: number;
  findings_count: number;
  operational_state: Record<string, unknown>;
  warnings: string[];
};

function rowToNormalized(row: typeof l2CircuitsTable.$inferSelect): NormalizedL2Circuit {
  return {
    circuitType: row.circuitType as NormalizedL2Circuit["circuitType"],
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
    peerIp: row.peerIp ?? undefined,
    adminStatus: (row.adminStatus ?? "UNKNOWN") as NormalizedL2Circuit["adminStatus"],
    operStatus: (row.operStatus ?? "UNKNOWN") as NormalizedL2Circuit["operStatus"],
    pwStatus: row.pwStatus ?? undefined,
    macCount: row.macCount ?? undefined,
    rawEvidence: row.rawEvidence ?? "",
    classification: row.classification as NormalizedL2Circuit["classification"],
    l2Transport: row.l2Transport as NormalizedL2Circuit["l2Transport"],
    deviceRoleFamily: row.deviceRoleFamily as NormalizedL2Circuit["deviceRoleFamily"],
    evidenceFlags: (row.evidenceFlags ?? {}) as NormalizedL2Circuit["evidenceFlags"],
    anomalyTags: (row.anomalyTags as string[] | null) ?? undefined,
    roleContext: row.roleContext ?? undefined,
    findings: [],
  };
}

export async function getL2DeviceOperationalMeta(deviceId: number): Promise<L2OperationalMeta | null> {
  const [row] = await db
    .select()
    .from(l2DeviceOperationalTable)
    .where(eq(l2DeviceOperationalTable.deviceId, deviceId))
    .limit(1);

  if (!row) {
    return {
      device_id: deviceId,
      last_refresh_at: null,
      freshness: "unknown",
    };
  }

  return {
    device_id: deviceId,
    last_refresh_at: row.lastRefreshAt?.toISOString() ?? null,
    freshness: (row.freshness as L2OperationalFreshnessStatus) ?? computeL2OperationalFreshness(row.lastRefreshAt),
    operational_state: (row.operationalState ?? {}) as Record<string, unknown>,
  };
}

type SnmpRefreshAttempt = {
  interfaces: SnmpCollectedInterface[];
  success: boolean;
  warnings: string[];
  errorMessage: string | null;
  collected: boolean;
};

async function collectOptionalSnmpForL2Refresh(
  device: Device,
  deviceId: number,
  warnings: string[],
): Promise<SnmpRefreshAttempt> {
  const empty: SnmpRefreshAttempt = {
    interfaces: [],
    success: false,
    warnings: [],
    errorMessage: null,
    collected: false,
  };

  if (!isNetopsSnmpRealEnabled()) {
    warnings.push("SNMP desabilitado (NETOPS_SNMP_REAL_ENABLED=false) — refresh continua só com SSH.");
    return empty;
  }

  try {
    assertSnmpFastPilotDevice(deviceId);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    warnings.push(`SNMP ignorado: ${message}`);
    return empty;
  }

  const credential = resolveSnmpCredential({
    device: { snmpCommunity: device.snmpCommunity },
    env: { snmpCommunity: process.env["SNMP_COMMUNITY"], labFallbackAllowed: true },
    nodeEnv: process.env.NODE_ENV,
  });

  if (!credential.available || !credential.value) {
    warnings.push("SNMP community não configurada — refresh continua só com SSH.");
    return empty;
  }

  try {
    const snmpResult =
      device.connectorId || device.connectorGroupId
        ? await collectSnmpInterfacesViaConnector(device, credential.value)
        : await collectSnmpInterfacesOnly(device, credential.value);

    if (!snmpResult.success && snmpResult.interfaces.length === 0) {
      warnings.push(
        snmpResult.errorMessage ??
          "SNMP preflight/collection falhou — refresh continua com status operacional via SSH.",
      );
    } else if (!snmpResult.success) {
      warnings.push(snmpResult.errorMessage ?? "SNMP parcial — algumas interfaces não foram coletadas.");
    }
    if (snmpResult.warnings.length > 0) {
      warnings.push(...snmpResult.warnings);
    }

    return {
      interfaces: snmpResult.interfaces,
      success: snmpResult.success,
      warnings: snmpResult.warnings,
      errorMessage: snmpResult.errorMessage ?? null,
      collected: snmpResult.interfaces.length > 0,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    warnings.push(`SNMP falhou (${message}) — refresh continua só com SSH.`);
    return empty;
  }
}

export async function runL2OperationalRefresh(deviceId: number): Promise<L2OperationalRefreshResult> {
  if (!isL2OperationalRefreshEnabled()) {
    throw new L2OperationalRefreshDisabledError();
  }

  const [device] = await db.select().from(devicesTable).where(eq(devicesTable.id, deviceId)).limit(1);
  if (!device) {
    throw new Error("Device not found");
  }

  const refreshAt = new Date();
  const warnings: string[] = [];
  let sshInventorySynced = 0;
  let cachedInventorySynced = 0;
  let sshSyncDetail: string | null = null;

  try {
    resolveDeviceSshConfig(device);
    const sshOutputs = await collectL2CircuitsViaSsh(device);
    const sync = await persistL2CircuitsFromCommandOutputs({
      deviceId,
      device,
      outputs: sshOutputs as Record<string, string>,
      discoveryRunId: `ops-sync-${deviceId}-${refreshAt.getTime()}`,
      source: "ssh_live",
    });
    sshInventorySynced = sync.circuitCount;
    sshSyncDetail = `SSH live: ${sync.circuitCount} circuit(s)`;
    if (sync.circuitCount === 0) {
      warnings.push("SSH live collection returned 0 L2 circuits — will try cached config fallback");
    }
  } catch (error) {
    if (error instanceof L2DeviceCredentialsError) {
      sshSyncDetail = "SSH live: credentials not configured";
      warnings.push(`SSH inventory sync failed: ${sshSyncDetail}`);
    } else {
      sshSyncDetail = `SSH live: ${error instanceof Error ? error.message : String(error)}`;
      warnings.push(`SSH inventory sync failed: ${sshSyncDetail}`);
    }
  }

  let rows = await db.select().from(l2CircuitsTable).where(eq(l2CircuitsTable.deviceId, deviceId));

  if (rows.length === 0 || sshInventorySynced === 0) {
    try {
      const cached = await syncL2CircuitsFromLatestCollectedConfig({
        deviceId,
        device,
        discoveryRunId: `ops-cached-${deviceId}-${refreshAt.getTime()}`,
      });
      if (cached.circuitCount > 0) {
        cachedInventorySynced = cached.circuitCount;
        warnings.push(`Inventário complementado via ${cached.detail}`);
        rows = await db.select().from(l2CircuitsTable).where(eq(l2CircuitsTable.deviceId, deviceId));
      } else if (rows.length === 0) {
        warnings.push(`Fallback de config em cache: ${cached.detail}`);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (rows.length === 0) {
        warnings.push(`Fallback de config em cache falhou: ${message}`);
      }
    }
  }

  if (rows.length === 0) {
    const parts = [
      sshSyncDetail ?? "SSH live: not attempted",
      cachedInventorySynced > 0 ? `cached: ${cachedInventorySynced} circuit(s)` : "cached: 0 circuits",
    ];
    throw new Error(
      `No L2 circuits stored for device ${deviceId}. ${parts.join(" · ")}. ` +
        "Ensure SSH works or run device discovery/config collection first.",
    );
  }

  const snmpResult = await collectOptionalSnmpForL2Refresh(device, deviceId, warnings);
  const interfaceMap = buildInterfaceStatusMap(snmpResult.interfaces);
  let snmpMatched = 0;

  let sshOpsCollected = false;
  let sshConfigCollected = false;
  const liveByKey = new Map<string, import("../l2circuits.types.js").ParsedL2Circuit>();
  let staleMarked = 0;

  try {
    resolveDeviceSshConfig(device);
    const includeConfig = isL2OperationalRefreshSshConfigEnabled();
    const sshOutput = await collectL2OperationalViaSsh(device, { includeConfig });
    sshOpsCollected = true;
    sshConfigCollected = includeConfig;
    const parsed = parseHuaweiL2Circuits(sshOutput);
    for (const [key, value] of buildLiveOpsByKey(parsed, deviceId)) {
      liveByKey.set(key, value);
    }
  } catch (error) {
    if (error instanceof L2DeviceCredentialsError) {
      warnings.push("SSH ops skipped: credentials not configured");
    } else {
      warnings.push(`SSH ops skipped: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  const liveKeys = new Set(liveByKey.keys());

  const normalizedRows = rows.map((row) => {
    const normalized = rowToNormalized(row);
    const didSnmp = applySnmpInterfaceStatus(normalized, interfaceMap);
    if (didSnmp) {
      snmpMatched += 1;
    }
    const didLive = applyLiveOpsToCircuit(normalized, liveByKey, deviceId);
    const key = buildCircuitKey(normalized, deviceId);
    let stale = false;

    if (
      shouldMarkOperationalStale({
        snmpCollected: snmpResult.collected,
        sshOpsCollected,
        snmpMatched: didSnmp,
        liveMatched: didLive,
        localInterface: normalized.localInterface,
        circuitType: normalized.circuitType,
        circuitKey: key,
        liveKeys,
      })
    ) {
      normalized.operStatus = "UNKNOWN";
      normalized.adminStatus = "UNKNOWN";
      normalized.pwStatus = undefined;
      normalized.anomalyTags = [...new Set([...(normalized.anomalyTags ?? []), OPERATIONAL_STALE_TAG])];
      stale = true;
      staleMarked += 1;
    }

    return { id: row.id, normalized, stale };
  });

  const allNormalized = normalizedRows.map((entry) => entry.normalized);
  const enriched = enrichCircuitsWithFindings(allNormalized, deviceId);
  const allFindings = resolveL2Findings(allNormalized, deviceId);

  for (let i = 0; i < normalizedRows.length; i++) {
    const entry = normalizedRows[i];
    const circuit = entry.stale ? entry.normalized : (enriched[i] ?? entry.normalized);
    const findings = entry.stale ? [] : circuit.findings;

    await db
      .update(l2CircuitsTable)
      .set({
        adminStatus: circuit.adminStatus,
        operStatus: circuit.operStatus,
        pwStatus: circuit.pwStatus ?? null,
        peerIp: circuit.primaryPeerIp ?? circuit.peerIp ?? null,
        description: circuit.description ?? null,
        findings,
        evidenceFlags: mergeVsiOperationalEvidence(entry.normalized.evidenceFlags, circuit),
        anomalyTags: entry.normalized.anomalyTags ?? [],
        lastSeen: refreshAt,
        updatedAt: refreshAt,
        source: sshOpsCollected ? "ssh_live" : "cached_config",
      })
      .where(eq(l2CircuitsTable.id, entry.id));
  }

  const freshness = computeL2OperationalFreshness(refreshAt);
  const operationalState = {
    circuits_total: rows.length,
    circuits_updated: rows.length,
    ssh_inventory_synced: sshInventorySynced,
    cached_inventory_synced: cachedInventorySynced,
    snmp_collected: snmpResult.collected,
    snmp_success: snmpResult.success,
    snmp_interfaces: snmpResult.interfaces.length,
    snmp_interface_matches: snmpMatched,
    ssh_ops: sshOpsCollected,
    ssh_config: sshConfigCollected,
    findings_count: allFindings.length,
    stale_marked: staleMarked,
  };

  await db
    .insert(l2DeviceOperationalTable)
    .values({
      deviceId,
      lastRefreshAt: refreshAt,
      freshness,
      operationalState,
      lastError: null,
      updatedAt: refreshAt,
    })
    .onConflictDoUpdate({
      target: l2DeviceOperationalTable.deviceId,
      set: {
        lastRefreshAt: refreshAt,
        freshness,
        operationalState,
        lastError: null,
        updatedAt: refreshAt,
      },
    });

  return {
    device_id: deviceId,
    last_refresh_at: refreshAt.toISOString(),
    freshness,
    circuits_updated: rows.length,
    findings_count: allFindings.length,
    operational_state: operationalState,
    warnings,
  };
}
