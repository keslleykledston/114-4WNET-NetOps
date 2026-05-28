import {
  db,
  devicesTable,
  l2CircuitsTable,
  l2DeviceOperationalTable,
} from "@workspace/db";
import { eq } from "drizzle-orm";
import { collectSnmpInterfacesOnly, isNetopsSnmpRealEnabled } from "../../netops/snmp/collect.js";
import { resolveSnmpCredential } from "../../netops/snmp/snmp-credential-resolver.js";
import { assertSnmpFastPilotDevice, OperationalPilotError } from "../../operational/pilot.js";
import { SnmpCredentialsNotConfiguredError } from "../../operational/operational-errors.js";
import {
  DEVICE_CREDENTIALS_NOT_CONFIGURED,
  L2DeviceCredentialsError,
  resolveDeviceSshConfig,
} from "../device-ssh-config.js";
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
import { computeL2OperationalFreshness, type L2OperationalFreshnessStatus } from "./l2-operational-refresh.freshness.js";
import { collectL2OperationalViaSsh } from "./l2-operational-ssh-ops.collector.js";
import {
  applyLiveOpsToCircuit,
  applySnmpInterfaceStatus,
  buildInterfaceStatusMap,
  buildLiveOpsByKey,
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

export async function runL2OperationalRefresh(deviceId: number): Promise<L2OperationalRefreshResult> {
  if (!isL2OperationalRefreshEnabled()) {
    throw new L2OperationalRefreshDisabledError();
  }
  if (!isNetopsSnmpRealEnabled()) {
    throw new L2OperationalSnmpDisabledError();
  }

  assertSnmpFastPilotDevice(deviceId);

  const [device] = await db.select().from(devicesTable).where(eq(devicesTable.id, deviceId)).limit(1);
  if (!device) {
    throw new Error("Device not found");
  }

  const credential = resolveSnmpCredential({
    device: { snmpCommunity: device.snmpCommunity },
    env: { snmpCommunity: process.env["SNMP_COMMUNITY"], labFallbackAllowed: true },
    nodeEnv: process.env.NODE_ENV,
  });

  if (!credential.available || !credential.value) {
    throw new SnmpCredentialsNotConfiguredError(deviceId);
  }

  const rows = await db.select().from(l2CircuitsTable).where(eq(l2CircuitsTable.deviceId, deviceId));
  if (rows.length === 0) {
    throw new Error(`No L2 circuits stored for device ${deviceId}. Run discovery first.`);
  }

  const refreshAt = new Date();
  const warnings: string[] = [];

  const snmpResult = await collectSnmpInterfacesOnly(device, credential.value);
  if (!snmpResult.success && snmpResult.interfaces.length === 0) {
    throw new Error(snmpResult.errorMessage ?? "SNMP_FAST interface collection failed");
  }
  if (snmpResult.warnings.length > 0) {
    warnings.push(...snmpResult.warnings);
  }
  if (!snmpResult.success) {
    warnings.push(snmpResult.errorMessage ?? "SNMP partial failure");
  }

  const interfaceMap = buildInterfaceStatusMap(snmpResult.interfaces);
  let snmpMatched = 0;

  let sshOpsCollected = false;
  let sshConfigCollected = false;
  const liveByKey = new Map<string, import("../l2circuits.types.js").ParsedL2Circuit>();

  try {
    const sshConfig = resolveDeviceSshConfig(device);
    const includeConfig = isL2OperationalRefreshSshConfigEnabled();
    const sshOutput = await collectL2OperationalViaSsh(sshConfig, { includeConfig });
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

  const normalizedRows = rows.map((row) => {
    const normalized = rowToNormalized(row);
    if (applySnmpInterfaceStatus(normalized, interfaceMap)) {
      snmpMatched += 1;
    }
    applyLiveOpsToCircuit(normalized, liveByKey, deviceId);
    return { id: row.id, normalized };
  });

  const allNormalized = normalizedRows.map((entry) => entry.normalized);
  const enriched = enrichCircuitsWithFindings(allNormalized, deviceId);
  const allFindings = resolveL2Findings(allNormalized, deviceId);

  for (let i = 0; i < normalizedRows.length; i++) {
    const { id, normalized } = normalizedRows[i];
    const circuit = enriched[i] ?? normalized;
    await db
      .update(l2CircuitsTable)
      .set({
        adminStatus: circuit.adminStatus,
        operStatus: circuit.operStatus,
        pwStatus: circuit.pwStatus ?? null,
        description: circuit.description ?? null,
        findings: circuit.findings,
        lastSeen: refreshAt,
        updatedAt: refreshAt,
        source: sshOpsCollected ? "ssh_live" : "cached_config",
      })
      .where(eq(l2CircuitsTable.id, id));
  }

  const freshness = computeL2OperationalFreshness(refreshAt);
  const operationalState = {
    circuits_total: rows.length,
    circuits_updated: rows.length,
    snmp_interfaces: snmpResult.interfaces.length,
    snmp_interface_matches: snmpMatched,
    ssh_ops: sshOpsCollected,
    ssh_config: sshConfigCollected,
    findings_count: allFindings.length,
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
