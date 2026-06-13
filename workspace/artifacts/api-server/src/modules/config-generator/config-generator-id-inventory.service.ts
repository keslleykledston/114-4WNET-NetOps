import { and, desc, eq, inArray, isNull, or, sql } from "drizzle-orm";
import {
  collectedConfigsTable,
  configGeneratorDiscoveredIdsTable,
  connectorsTable,
  connectorGroupsTable,
  db,
  devicesTable,
  discoverySnapshotsTable,
  l2CircuitsTable,
  snmpSnapshotsTable,
  tenantsTable,
} from "@workspace/db";
import type { DeviceDiscoverySnapshot } from "../netops/device-discovery/discovery.types.js";
import { snapshotToNetopsData } from "../netops/adapters/snapshot-adapter.js";
import type { ConfigGeneratorIdType } from "./config-generator-id-ranges.js";

export type DiscoveredIdSource =
  | "collected_config"
  | "discovery_snapshot"
  | "snmp_snapshot"
  | "l2_circuit"
  | "bgp_matrix"
  | "manual";

export type DiscoveredIdStatus = "active" | "reserved" | "stale" | "unknown";
export type DiscoveredIdConfidence = "high" | "medium" | "low";

export interface DiscoveredIdCandidate {
  tenantId: number;
  siteCode?: string | null;
  deviceId?: number | null;
  idType: ConfigGeneratorIdType;
  idValue: number;
  parentInterface?: string | null;
  interfaceName?: string | null;
  serviceType?: string | null;
  serviceName?: string | null;
  circuitId?: string | null;
  customerName?: string | null;
  status?: DiscoveredIdStatus;
  source: DiscoveredIdSource;
  evidenceRef?: string | null;
  confidence?: DiscoveredIdConfidence;
  metadata?: Record<string, unknown>;
}

function parsePositiveInt(value: unknown): number | null {
  if (typeof value === "number" && Number.isInteger(value) && value > 0) return value;
  if (typeof value === "string" && /^\d+$/.test(value.trim())) return Number(value.trim());
  return null;
}

function parseSubinterface(name: string): { parent: string; subId: number } | null {
  const match = /^(.+)\.(\d+)$/.exec(name.trim());
  if (!match) return null;
  const subId = Number(match[2]);
  if (!Number.isInteger(subId) || subId <= 0) return null;
  return { parent: match[1], subId };
}

function extractVlansFromConfig(rawConfig: string): number[] {
  const vlans = new Set<number>();
  const patterns = [
    /\bvlan\s+(\d{1,4})\b/gi,
    /\bdot1q\s+(\d{1,4})\b/gi,
    /\bencapsulation\s+(?:dot1q|qinq)\s+(\d{1,4})\b/gi,
    /\bvid\s+(\d{1,4})\b/gi,
  ];
  for (const pattern of patterns) {
    for (const match of rawConfig.matchAll(pattern)) {
      const vlan = parsePositiveInt(match[1]);
      if (vlan != null && vlan <= 4094) vlans.add(vlan);
    }
  }
  return [...vlans];
}

function extractSubinterfacesFromConfig(rawConfig: string): Array<{ parent: string; subId: number; name: string }> {
  const rows: Array<{ parent: string; subId: number; name: string }> = [];
  for (const match of rawConfig.matchAll(/^interface\s+(\S+)/gim)) {
    const name = match[1];
    const parsed = parseSubinterface(name);
    if (parsed) rows.push({ ...parsed, name });
  }
  return rows;
}

function extractL2vcIdsFromConfig(rawConfig: string): number[] {
  const ids = new Set<number>();
  for (const match of rawConfig.matchAll(/\b(?:l2vc|vc-id|vc\s+id)\s+(\d+)\b/gi)) {
    const id = parsePositiveInt(match[1]);
    if (id != null) ids.add(id);
  }
  for (const match of rawConfig.matchAll(/\bmpls\s+l2vc\s+(\d+)\b/gi)) {
    const id = parsePositiveInt(match[1]);
    if (id != null) ids.add(id);
  }
  return [...ids];
}

function extractVsiIdsFromConfig(rawConfig: string): number[] {
  const ids = new Set<number>();
  for (const match of rawConfig.matchAll(/\bvsi\s+(\d+)\b/gi)) {
    const id = parsePositiveInt(match[1]);
    if (id != null) ids.add(id);
  }
  return [...ids];
}

async function resolveTenantDevices(tenantId: number, deviceId?: number | null) {
  const rows = await db
    .select({
      deviceId: devicesTable.id,
      siteCode: devicesTable.site,
      tenantIdFromConnector: connectorsTable.tenantId,
      tenantIdFromGroup: connectorGroupsTable.tenantId,
    })
    .from(devicesTable)
    .leftJoin(connectorsTable, eq(devicesTable.connectorId, connectorsTable.id))
    .leftJoin(connectorGroupsTable, eq(devicesTable.connectorGroupId, connectorGroupsTable.id))
    .where(deviceId != null ? eq(devicesTable.id, deviceId) : sql`true`);

  return rows
    .map((row) => ({
      deviceId: row.deviceId,
      siteCode: row.siteCode,
      tenantId: row.tenantIdFromGroup ?? row.tenantIdFromConnector ?? null,
    }))
    .filter((row) => row.tenantId === tenantId);
}

function collectFromDiscoverySnapshot(
  tenantId: number,
  deviceId: number,
  siteCode: string,
  snapshot: DeviceDiscoverySnapshot,
): DiscoveredIdCandidate[] {
  const rows: DiscoveredIdCandidate[] = [];
  for (const iface of snapshot.interfaces ?? []) {
    const parsed = parseSubinterface(iface.name);
    if (parsed) {
      rows.push({
        tenantId,
        siteCode,
        deviceId,
        idType: "subinterface",
        idValue: parsed.subId,
        parentInterface: parsed.parent,
        interfaceName: iface.name,
        source: "discovery_snapshot",
        confidence: "high",
        metadata: { vlan: (iface as { vlan?: number | null; vlanId?: number | null }).vlan ?? (iface as { vlanId?: number | null }).vlanId ?? null },
      });
    }
    const ifaceVlan = (iface as { vlan?: number | null; vlanId?: number | null }).vlan ?? (iface as { vlanId?: number | null }).vlanId;
    if (ifaceVlan != null) {
      rows.push({
        tenantId,
        siteCode,
        deviceId,
        idType: "vlan",
        idValue: ifaceVlan,
        interfaceName: iface.name,
        source: "discovery_snapshot",
        confidence: "high",
      });
    }
  }
  for (const item of snapshot.l2vpn?.l2vcs ?? []) {
    const vcId = parsePositiveInt(item.vcId ?? item.name);
    if (vcId != null) {
      rows.push({
        tenantId,
        siteCode,
        deviceId,
        idType: "l2vc",
        idValue: vcId,
        serviceName: item.name ?? null,
        circuitId: item.vcId ?? item.name ?? null,
        source: "discovery_snapshot",
        confidence: "high",
      });
    }
  }
  for (const item of snapshot.l2vpn?.vsis ?? []) {
    const vsiId = parsePositiveInt(item.name);
    if (vsiId != null) {
      rows.push({
        tenantId,
        siteCode,
        deviceId,
        idType: "vsi",
        idValue: vsiId,
        serviceName: item.name ?? null,
        source: "discovery_snapshot",
        confidence: "medium",
      });
    }
  }
  return rows;
}

export async function extractDiscoveredIdCandidates(input: {
  tenantId: number;
  deviceId?: number | null;
  siteCode?: string | null;
}): Promise<DiscoveredIdCandidate[]> {
  const devices = await resolveTenantDevices(input.tenantId, input.deviceId);
  const filtered = input.siteCode
    ? devices.filter((item) => item.siteCode === input.siteCode)
    : devices;
  const rows: DiscoveredIdCandidate[] = [];

  for (const device of filtered) {
    const [configRow] = await db
      .select({ rawConfig: collectedConfigsTable.rawConfig, collectedAt: collectedConfigsTable.collectedAt })
      .from(collectedConfigsTable)
      .where(eq(collectedConfigsTable.deviceId, device.deviceId))
      .orderBy(desc(collectedConfigsTable.collectedAt))
      .limit(1);

    if (configRow?.rawConfig) {
      const evidenceRef = `collected_config:${device.deviceId}`;
      for (const vlan of extractVlansFromConfig(configRow.rawConfig)) {
        rows.push({
          tenantId: input.tenantId,
          siteCode: device.siteCode,
          deviceId: device.deviceId,
          idType: "vlan",
          idValue: vlan,
          source: "collected_config",
          evidenceRef,
          confidence: "high",
        });
      }
      for (const subif of extractSubinterfacesFromConfig(configRow.rawConfig)) {
        rows.push({
          tenantId: input.tenantId,
          siteCode: device.siteCode,
          deviceId: device.deviceId,
          idType: "subinterface",
          idValue: subif.subId,
          parentInterface: subif.parent,
          interfaceName: subif.name,
          source: "collected_config",
          evidenceRef,
          confidence: "high",
        });
      }
      for (const l2vcId of extractL2vcIdsFromConfig(configRow.rawConfig)) {
        rows.push({
          tenantId: input.tenantId,
          siteCode: device.siteCode,
          deviceId: device.deviceId,
          idType: "l2vc",
          idValue: l2vcId,
          source: "collected_config",
          evidenceRef,
          confidence: "high",
        });
      }
      for (const vsiId of extractVsiIdsFromConfig(configRow.rawConfig)) {
        rows.push({
          tenantId: input.tenantId,
          siteCode: device.siteCode,
          deviceId: device.deviceId,
          idType: "vsi",
          idValue: vsiId,
          source: "collected_config",
          evidenceRef,
          confidence: "medium",
        });
      }
    }

    const [discoveryRow] = await db
      .select({ snapshotJson: discoverySnapshotsTable.snapshotJson })
      .from(discoverySnapshotsTable)
      .where(eq(discoverySnapshotsTable.deviceId, device.deviceId))
      .orderBy(desc(discoverySnapshotsTable.createdAt))
      .limit(1);
    if (discoveryRow?.snapshotJson) {
      rows.push(...collectFromDiscoverySnapshot(
        input.tenantId,
        device.deviceId,
        device.siteCode,
        discoveryRow.snapshotJson as DeviceDiscoverySnapshot,
      ));
    }

    const [snmpRow] = await db
      .select()
      .from(snmpSnapshotsTable)
      .where(eq(snmpSnapshotsTable.deviceId, device.deviceId))
      .orderBy(desc(snmpSnapshotsTable.collectedAt))
      .limit(1);
    if (snmpRow) {
      const netops = snapshotToNetopsData(snmpRow);
      for (const iface of netops.interfaces) {
        const parsed = parseSubinterface(iface.name);
        if (parsed) {
          rows.push({
            tenantId: input.tenantId,
            siteCode: device.siteCode,
            deviceId: device.deviceId,
            idType: "subinterface",
            idValue: parsed.subId,
            parentInterface: parsed.parent,
            interfaceName: iface.name,
            source: "snmp_snapshot",
            confidence: "medium",
          });
        }
        if (iface.vlan != null) {
          rows.push({
            tenantId: input.tenantId,
            siteCode: device.siteCode,
            deviceId: device.deviceId,
            idType: "vlan",
            idValue: iface.vlan,
            interfaceName: iface.name,
            source: "snmp_snapshot",
            confidence: "medium",
          });
        }
      }
    }

    const l2Rows = await db
      .select()
      .from(l2CircuitsTable)
      .where(eq(l2CircuitsTable.deviceId, device.deviceId));
    for (const circuit of l2Rows) {
      for (const vlan of [circuit.outerVlan, circuit.innerVlan]) {
        if (vlan != null) {
          rows.push({
            tenantId: input.tenantId,
            siteCode: device.siteCode,
            deviceId: device.deviceId,
            idType: "vlan",
            idValue: vlan,
            interfaceName: circuit.localInterface ?? null,
            serviceType: circuit.circuitType,
            serviceName: circuit.name,
            circuitId: circuit.serviceId ?? circuit.vcId ?? null,
            source: "l2_circuit",
            confidence: "high",
          });
        }
      }
      const vcId = parsePositiveInt(circuit.vcId);
      if (vcId != null) {
        rows.push({
          tenantId: input.tenantId,
          siteCode: device.siteCode,
          deviceId: device.deviceId,
          idType: "l2vc",
          idValue: vcId,
          serviceType: circuit.circuitType,
          serviceName: circuit.name,
          circuitId: circuit.serviceId ?? circuit.vcId ?? null,
          source: "l2_circuit",
          confidence: "high",
        });
      }
      const vsiId = parsePositiveInt(circuit.vsiId ?? circuit.vsiName);
      if (vsiId != null) {
        rows.push({
          tenantId: input.tenantId,
          siteCode: device.siteCode,
          deviceId: device.deviceId,
          idType: "vsi",
          idValue: vsiId,
          serviceType: circuit.circuitType,
          serviceName: circuit.name,
          circuitId: circuit.serviceId ?? null,
          source: "l2_circuit",
          confidence: "high",
        });
      }
      const subif = circuit.localInterface ? parseSubinterface(circuit.localInterface) : null;
      if (subif) {
        rows.push({
          tenantId: input.tenantId,
          siteCode: device.siteCode,
          deviceId: device.deviceId,
          idType: "subinterface",
          idValue: subif.subId,
          parentInterface: subif.parent,
          interfaceName: circuit.localInterface,
          serviceType: circuit.circuitType,
          serviceName: circuit.name,
          source: "l2_circuit",
          confidence: "high",
        });
      }
    }
  }

  return rows;
}

function dedupeKey(row: DiscoveredIdCandidate): string {
  return [
    row.tenantId,
    row.deviceId ?? "tenant",
    row.idType,
    row.idValue,
    row.parentInterface ?? "",
    row.interfaceName ?? "",
  ].join("|");
}

export async function refreshConfigGeneratorIdInventory(input: {
  tenantId: number;
  deviceId?: number | null;
  siteCode?: string | null;
}): Promise<{ inserted: number; updated: number; total: number }> {
  const candidates = await extractDiscoveredIdCandidates(input);
  const deduped = new Map<string, DiscoveredIdCandidate>();
  for (const candidate of candidates) {
    const key = dedupeKey(candidate);
    const existing = deduped.get(key);
    if (!existing || (existing.confidence === "low" && candidate.confidence !== "low")) {
      deduped.set(key, candidate);
    }
  }

  let inserted = 0;
  let updated = 0;
  const now = new Date();

  for (const row of deduped.values()) {
    const parentInterface = row.parentInterface ?? null;
    const interfaceName = row.interfaceName ?? null;
    const [existing] = await db
      .select()
      .from(configGeneratorDiscoveredIdsTable)
      .where(and(
        eq(configGeneratorDiscoveredIdsTable.tenantId, row.tenantId),
        row.deviceId != null
          ? eq(configGeneratorDiscoveredIdsTable.deviceId, row.deviceId)
          : isNull(configGeneratorDiscoveredIdsTable.deviceId),
        eq(configGeneratorDiscoveredIdsTable.idType, row.idType),
        eq(configGeneratorDiscoveredIdsTable.idValue, row.idValue),
        parentInterface
          ? eq(configGeneratorDiscoveredIdsTable.parentInterface, parentInterface)
          : isNull(configGeneratorDiscoveredIdsTable.parentInterface),
        interfaceName
          ? eq(configGeneratorDiscoveredIdsTable.interfaceName, interfaceName)
          : isNull(configGeneratorDiscoveredIdsTable.interfaceName),
      ))
      .limit(1);

    if (existing) {
      await db
        .update(configGeneratorDiscoveredIdsTable)
        .set({
          lastSeenAt: now,
          updatedAt: now,
          status: row.status ?? existing.status,
          confidence: row.confidence ?? existing.confidence,
          serviceType: row.serviceType ?? existing.serviceType,
          serviceName: row.serviceName ?? existing.serviceName,
          circuitId: row.circuitId ?? existing.circuitId,
          customerName: row.customerName ?? existing.customerName,
          metadataJson: { ...(existing.metadataJson as Record<string, unknown>), ...(row.metadata ?? {}) },
        })
        .where(eq(configGeneratorDiscoveredIdsTable.id, existing.id));
      updated += 1;
      continue;
    }

    await db.insert(configGeneratorDiscoveredIdsTable).values({
      tenantId: row.tenantId,
      siteCode: row.siteCode ?? null,
      deviceId: row.deviceId ?? null,
      idType: row.idType,
      idValue: row.idValue,
      parentInterface,
      interfaceName,
      serviceType: row.serviceType ?? null,
      serviceName: row.serviceName ?? null,
      circuitId: row.circuitId ?? null,
      customerName: row.customerName ?? null,
      status: row.status ?? "active",
      source: row.source,
      evidenceRef: row.evidenceRef ?? null,
      firstSeenAt: now,
      lastSeenAt: now,
      confidence: row.confidence ?? "medium",
      metadataJson: row.metadata ?? {},
    });
    inserted += 1;
  }

  return { inserted, updated, total: deduped.size };
}

export async function listConfigGeneratorDiscoveredIds(input: {
  tenantId: number;
  siteCode?: string | null;
  deviceId?: number | null;
  idType?: ConfigGeneratorIdType;
  serviceType?: string | null;
  status?: DiscoveredIdStatus;
}) {
  const filters = [eq(configGeneratorDiscoveredIdsTable.tenantId, input.tenantId)];
  if (input.siteCode) filters.push(eq(configGeneratorDiscoveredIdsTable.siteCode, input.siteCode));
  if (input.deviceId != null) filters.push(eq(configGeneratorDiscoveredIdsTable.deviceId, input.deviceId));
  if (input.idType) filters.push(eq(configGeneratorDiscoveredIdsTable.idType, input.idType));
  if (input.serviceType) filters.push(eq(configGeneratorDiscoveredIdsTable.serviceType, input.serviceType));
  if (input.status) filters.push(eq(configGeneratorDiscoveredIdsTable.status, input.status));

  return db
    .select()
    .from(configGeneratorDiscoveredIdsTable)
    .where(and(...filters))
    .orderBy(desc(configGeneratorDiscoveredIdsTable.lastSeenAt));
}

export async function listTenantIdsByType(tenantId: number, idType: ConfigGeneratorIdType, deviceId?: number | null): Promise<number[]> {
  const filters = [
    eq(configGeneratorDiscoveredIdsTable.tenantId, tenantId),
    eq(configGeneratorDiscoveredIdsTable.idType, idType),
    inArray(configGeneratorDiscoveredIdsTable.status, ["active", "reserved"]),
  ];
  if (deviceId != null && (idType === "vlan" || idType === "subinterface")) {
    filters.push(or(
      eq(configGeneratorDiscoveredIdsTable.deviceId, deviceId),
      isNull(configGeneratorDiscoveredIdsTable.deviceId),
    )!);
  }
  const rows = await db
    .select({ idValue: configGeneratorDiscoveredIdsTable.idValue })
    .from(configGeneratorDiscoveredIdsTable)
    .where(and(...filters));
  return [...new Set(rows.map((row) => row.idValue))].sort((a, b) => a - b);
}

export async function ensureTenantExists(tenantId: number): Promise<boolean> {
  const [row] = await db.select({ id: tenantsTable.id }).from(tenantsTable).where(eq(tenantsTable.id, tenantId)).limit(1);
  return Boolean(row);
}
