import { and, desc, eq, inArray, or } from "drizzle-orm";
import {
  collectedConfigsTable,
  connectorGroupsTable,
  connectorsTable,
  db,
  devicesTable,
  l2CircuitsTable,
  tenantsTable,
  vsiServiceConfigsTable,
  vsiServiceEventsTable,
  vsiServiceMembersTable,
  vsiServiceStatusHistoryTable,
  vsiServicesTable,
  type Device,
} from "@workspace/db";
import type { L2Finding, L2VsiPeer } from "../l2circuits.types.js";
import { readVsiOperationalFromEvidence } from "../parsers/vsi-multipoint.helpers.js";
import { focusVsiVplsConfigText } from "./vsi-vpls.config.js";
import { classifyVsiVplsStatus } from "./vsi-vpls.status.js";
import type {
  VsiVplsAlarmRecord,
  VsiVplsConfigRecord,
  VsiVplsDetailResponse,
  VsiVplsHistoryRecord,
  VsiVplsListFilter,
  VsiVplsListResponse,
  VsiVplsMemberRecord,
  VsiVplsStatusResult,
  VsiVplsServiceSummary,
} from "./vsi-vpls.types.js";

type L2CircuitRow = typeof l2CircuitsTable.$inferSelect;

type JoinedRow = {
  circuit: L2CircuitRow;
  device: Device;
  tenantId: number | null;
};

function normalizeKey(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function toIso(value: Date | null | undefined): string | null {
  return value ? value.toISOString() : null;
}

function buildServiceKey(tenantId: number | null, vsId: string | null, name: string): string {
  return `${tenantId ?? 0}:${vsId ?? normalizeKey(name)}`;
}

function tenantLabel(tenantId: number | null, tenantName: string | null): string {
  if (tenantName) return tenantName;
  return tenantId != null ? `Tenant ${tenantId}` : "Tenant desconhecido";
}

function maybeTenantId(device: Device & { connectorTenantId?: number | null; groupTenantId?: number | null }): number | null {
  return device.connectorTenantId ?? device.groupTenantId ?? null;
}

async function loadTenantsByIds(ids: number[]): Promise<Map<number, string>> {
  if (ids.length === 0) return new Map();
  const rows = await db.select({ id: tenantsTable.id, name: tenantsTable.name }).from(tenantsTable).where(inArray(tenantsTable.id, ids));
  return new Map(rows.map((row) => [row.id, row.name] as const));
}

async function loadLatestConfigsByDeviceIds(deviceIds: number[]): Promise<Map<number, VsiVplsConfigRecord>> {
  if (deviceIds.length === 0) return new Map();
  const rows = await db
    .select()
    .from(collectedConfigsTable)
    .where(inArray(collectedConfigsTable.deviceId, deviceIds))
    .orderBy(desc(collectedConfigsTable.collectedAt));

  const configs = new Map<number, VsiVplsConfigRecord>();
  for (const row of rows) {
    if (configs.has(row.deviceId)) continue;
    configs.set(row.deviceId, {
      device_id: row.deviceId,
      device_name: `Device ${row.deviceId}`,
      site: "",
      tenant_id: null,
      tenant_name: null,
      collected_at: row.collectedAt.toISOString(),
      parser_status: row.parserStatus ?? null,
      source: row.source ?? null,
      raw_config: row.rawConfig ?? null,
    });
  }
  return configs;
}

async function loadJoinedCircuits(): Promise<JoinedRow[]> {
  const rows = await db
    .select({
      circuit: l2CircuitsTable,
      device: devicesTable,
      connectorTenantId: connectorsTable.tenantId,
      groupTenantId: connectorGroupsTable.tenantId,
    })
    .from(l2CircuitsTable)
    .innerJoin(devicesTable, eq(l2CircuitsTable.deviceId, devicesTable.id))
    .leftJoin(connectorsTable, eq(devicesTable.connectorId, connectorsTable.id))
    .leftJoin(connectorGroupsTable, eq(devicesTable.connectorGroupId, connectorGroupsTable.id))
    .where(or(eq(l2CircuitsTable.circuitType, "vsi"), eq(l2CircuitsTable.circuitType, "vpls")));

  return rows.map((row) => ({
    circuit: row.circuit,
    device: {
      ...row.device,
      connectorTenantId: row.connectorTenantId ?? null,
      groupTenantId: row.groupTenantId ?? null,
    } as Device & { connectorTenantId?: number | null; groupTenantId?: number | null },
    tenantId: maybeTenantId({
      ...row.device,
      connectorTenantId: row.connectorTenantId ?? null,
      groupTenantId: row.groupTenantId ?? null,
    } as Device & { connectorTenantId?: number | null; groupTenantId?: number | null }),
  }));
}

function serviceNameForRows(rows: L2CircuitRow[]): string {
  const names = rows.map((row) => row.vsiName ?? row.name).filter(Boolean).map((name) => normalizeKey(String(name)));
  const first = names[0];
  return first ?? "unknown-vsi";
}

function aggregateMember(row: JoinedRow, tenantName: string | null): VsiVplsMemberRecord {
  const operational = readVsiOperationalFromEvidence(row.circuit.evidenceFlags);
  const peers = operational.peers ?? [];
  const peerIps = operational.peerIps ?? peers.map((peer: L2VsiPeer) => peer.peer_ip);
  const findings = (row.circuit.findings ?? []) as L2Finding[];
  return {
    device_id: row.device.id,
    device_name: row.device.hostname,
    site: row.device.site,
    tenant_id: row.tenantId,
    tenant_name: tenantLabel(row.tenantId, tenantName),
    vendor: row.device.vendor,
    circuit_id: row.circuit.id,
    circuit_type: row.circuit.circuitType as "vsi" | "vpls",
    name: row.circuit.name,
    normalized_name: normalizeKey(row.circuit.vsiName ?? row.circuit.name),
    vs_id: row.circuit.vsiId ?? null,
    vsi_name: row.circuit.vsiName ?? null,
    source: row.circuit.source,
    admin_status: (row.circuit.adminStatus ?? "UNKNOWN") as VsiVplsMemberRecord["admin_status"],
    oper_status: (row.circuit.operStatus ?? "UNKNOWN") as VsiVplsMemberRecord["oper_status"],
    pw_status: row.circuit.pwStatus ?? null,
    local_interface: row.circuit.localInterface ?? null,
    parent_interface: row.circuit.parentInterface ?? null,
    peer_ip: operational.primaryPeerIp ?? row.circuit.peerIp ?? null,
    peer_ips: peerIps,
    peers,
    pw_summary: operational.pwSummary ?? null,
    outer_vlan: row.circuit.outerVlan ?? null,
    inner_vlan: row.circuit.innerVlan ?? null,
    mac_count: row.circuit.macCount ?? null,
    findings,
    first_seen: row.circuit.firstSeen.toISOString(),
    last_seen: row.circuit.lastSeen.toISOString(),
    raw_evidence: row.circuit.rawEvidence ?? null,
  };
}

async function aggregateConfigs(rows: JoinedRow[], tenantNames: Map<number, string>): Promise<VsiVplsConfigRecord[]> {
  const uniqueDeviceIds = [...new Set(rows.map((row) => row.device.id))];
  const latestConfigs = await loadLatestConfigsByDeviceIds(uniqueDeviceIds);
  return uniqueDeviceIds.map((deviceId) => {
    const row = rows.find((entry) => entry.device.id === deviceId)!;
    const config = latestConfigs.get(deviceId);
    return {
      device_id: row.device.id,
      device_name: row.device.hostname,
      site: row.device.site,
      tenant_id: row.tenantId,
      tenant_name: tenantLabel(row.tenantId, tenantNames.get(row.tenantId ?? -1) ?? null),
      collected_at: config?.collected_at ?? row.circuit.updatedAt.toISOString(),
      parser_status: config?.parser_status ?? null,
      source: config?.source ?? row.circuit.source,
      raw_config: focusVsiVplsConfigText(config?.raw_config ?? row.circuit.rawEvidence ?? null, {
        vsId: row.circuit.vsiId,
        vsiName: row.circuit.vsiName ?? row.circuit.name,
      }),
    };
  });
}

function aggregateAlarms(rows: JoinedRow[]): VsiVplsAlarmRecord[] {
  const alarms: VsiVplsAlarmRecord[] = [];
  for (const row of rows) {
    for (const finding of (row.circuit.findings ?? []) as L2Finding[]) {
      if (finding.severity === "info") continue;
      alarms.push({
        device_id: row.device.id,
        device_name: row.device.hostname,
        code: finding.code,
        severity: finding.severity,
        message: finding.message,
        source: row.circuit.source,
      });
    }
  }
  return alarms;
}

function aggregateHistory(rows: JoinedRow[], diagnosisReason: string): VsiVplsHistoryRecord[] {
  const history: VsiVplsHistoryRecord[] = [];
  const seenDevices = new Set<number>();
  for (const row of rows) {
    if (seenDevices.has(row.device.id)) continue;
    seenDevices.add(row.device.id);
    history.push({
      id: `member-${row.circuit.id}`,
      event_type: "member_seen",
      reason: `${row.device.hostname} observada em ${row.device.site}`,
      created_at: row.circuit.firstSeen.toISOString(),
    });
  }

  const latestConfig = rows
    .slice()
    .sort((a, b) => b.circuit.updatedAt.getTime() - a.circuit.updatedAt.getTime())[0];
  if (latestConfig) {
    history.push({
      id: `config-${latestConfig.circuit.id}`,
      event_type: "config_collected",
      reason: "Config persistida a partir do inventario existente",
      created_at: latestConfig.circuit.updatedAt.toISOString(),
    });
  }

  history.push({
    id: `status-${latestConfig?.circuit.id ?? "unknown"}`,
    event_type: "status_snapshot",
    reason: diagnosisReason,
    created_at: latestConfig?.circuit.updatedAt.toISOString() ?? new Date().toISOString(),
  });

  return history;
}

function aggregateService(rows: JoinedRow[], tenantName: string | null): VsiVplsServiceSummary {
  const first = rows[0];
  const allNames = new Set(rows.map((row) => normalizeKey(row.circuit.vsiName ?? row.circuit.name)));
  const allVsIds = new Set(rows.map((row) => row.circuit.vsiId ?? ""));
  const sites = new Set(rows.map((row) => row.device.site));
  const devices = new Set(rows.map((row) => row.device.id));
  const interfaces = new Set(rows.map((row) => row.circuit.localInterface ?? "").filter(Boolean));
  const operationalRows = rows.map((row) => ({
    ...row,
    operational: readVsiOperationalFromEvidence(row.circuit.evidenceFlags),
  }));
  const pwsTotal = operationalRows.reduce((acc, row) => acc + (row.operational.pwSummary?.total ?? row.operational.peers?.length ?? 0), 0);
  const pwsUp = operationalRows.reduce((acc, row) => acc + (row.operational.pwSummary?.up ?? 0), 0);
  const findings = rows.flatMap((row) => (row.circuit.findings ?? []) as L2Finding[]);
  const hasActiveAlarm = findings.some((finding) => finding.severity === "warning" || finding.severity === "error");
  const hasDivergence = allNames.size > 1 || [...allVsIds].some((value) => value === "") || operationalRows.some((row) => {
    const peers = row.operational.peers ?? [];
    return peers.length > 0 && peers.some((peer) => peer.session_state === "DOWN" || peer.pw_state === "DOWN");
  });
  const diagnosis = classifyVsiVplsStatus({
    memberCount: rows.length,
    configsCount: devices.size,
    pwsTotal,
    pwsUp,
    hasActiveAlarm,
    hasDivergence,
    operationalStatuses: rows.map((row) => row.circuit.operStatus ?? "UNKNOWN"),
    findings,
  });

  const latest = rows.slice().sort((a, b) => b.circuit.updatedAt.getTime() - a.circuit.updatedAt.getTime())[0];
  const firstSeen = rows.slice().sort((a, b) => a.circuit.firstSeen.getTime() - b.circuit.firstSeen.getTime())[0];

  return {
    id: buildServiceKey(first.tenantId, first.circuit.vsiId ?? null, first.circuit.vsiName ?? first.circuit.name),
    tenant_id: first.tenantId,
    tenant_name: tenantLabel(first.tenantId, tenantName),
    vs_id: first.circuit.vsiId ?? null,
    name: first.circuit.vsiName ?? first.circuit.name,
    normalized_name: serviceNameForRows(rows.map((row) => row.circuit)),
    status: diagnosis.status,
    severity: diagnosis.severity,
    sites_count: sites.size,
    devices_count: devices.size,
    acs_count: interfaces.size,
    pws_count: pwsTotal,
    pws_up_count: pwsUp,
    alarms_count: findings.length,
    has_divergence: hasDivergence,
    last_collected_at: toIso(latest?.circuit.updatedAt ?? null),
    first_seen_at: toIso(firstSeen?.circuit.firstSeen ?? null),
    last_seen_at: toIso(latest?.circuit.lastSeen ?? null),
  };
}

type LiveVsiVplsGroup = {
  service: VsiVplsServiceSummary;
  rows: JoinedRow[];
  members: VsiVplsMemberRecord[];
  configs_metadata: VsiVplsConfigRecord[];
  alarms: VsiVplsAlarmRecord[];
  history_summary: VsiVplsHistoryRecord[];
  diagnosis: ReturnType<typeof classifyVsiVplsStatus>;
  acs: VsiVplsDetailResponse["acs"];
  pseudowires: VsiVplsDetailResponse["pseudowires"];
};

async function buildLiveGroups(filters?: VsiVplsListFilter): Promise<LiveVsiVplsGroup[]> {
  const rows = applyFilters(await loadJoinedCircuits(), filters);
  const tenantIds = [...new Set(rows.map((row) => row.tenantId).filter((value): value is number => value != null))];
  const tenantNames = await loadTenantsByIds(tenantIds);
  const groups = new Map<string, JoinedRow[]>();

  for (const row of rows) {
    const key = buildServiceKey(row.tenantId, row.circuit.vsiId ?? null, row.circuit.vsiName ?? row.circuit.name);
    const list = groups.get(key) ?? [];
    list.push(row);
    groups.set(key, list);
  }

  const result: LiveVsiVplsGroup[] = [];
  for (const groupRows of groups.values()) {
    const tenantName = tenantNames.get(groupRows[0].tenantId ?? -1) ?? null;
    const service = aggregateService(groupRows, tenantName);
    const members = groupRows.map((row) => aggregateMember(row, tenantName));
    const configs_metadata = await aggregateConfigs(groupRows, tenantNames);
    const alarms = aggregateAlarms(groupRows);
    const diagnosis = classifyVsiVplsStatus({
      memberCount: members.length,
      configsCount: configs_metadata.length,
      pwsTotal: members.reduce((acc, member) => acc + (member.pw_summary?.total ?? member.peers.length), 0),
      pwsUp: members.reduce((acc, member) => acc + (member.pw_summary?.up ?? 0), 0),
      hasActiveAlarm: alarms.length > 0,
      hasDivergence: service.has_divergence,
      operationalStatuses: members.map((member) => member.oper_status),
      findings: members.flatMap((member) => member.findings) as Array<{ code: string; severity: string }>,
    });
    const acs = members.flatMap((member) =>
      member.local_interface
        ? [{
            device_id: member.device_id,
            interface_name: member.local_interface,
            vlan_id: member.outer_vlan,
            qinq_outer_vlan: member.outer_vlan,
            qinq_inner_vlan: member.inner_vlan,
          }]
        : [],
    );
    const pseudowires = members.flatMap((member) =>
      member.peers.map((peer) => ({
        device_id: member.device_id,
        peer_ip: peer.peer_ip,
        pw_id: member.vs_id,
        vsi_id: member.vs_id,
        status: peer.pw_state ?? member.pw_status,
        uptime: peer.last_up_time ?? null,
        last_down_reason: null,
      })),
    );
    const history_summary = aggregateHistory(groupRows, diagnosis.reason);
    result.push({ service, rows: groupRows, members, configs_metadata, alarms, history_summary, diagnosis, acs, pseudowires });
  }

  result.sort((a, b) => {
    const at = a.service.last_collected_at ? new Date(a.service.last_collected_at).getTime() : 0;
    const bt = b.service.last_collected_at ? new Date(b.service.last_collected_at).getTime() : 0;
    return bt - at || a.service.name.localeCompare(b.service.name);
  });

  return result;
}

async function loadPersistedSummaries(filters?: VsiVplsListFilter): Promise<VsiVplsServiceSummary[]> {
  const conditions = [];
  if (filters?.tenantId != null) conditions.push(eq(vsiServicesTable.tenantId, filters.tenantId));
  if (filters?.vsId) conditions.push(eq(vsiServicesTable.vsId, filters.vsId));
  if (filters?.name) conditions.push(or(eq(vsiServicesTable.name, filters.name), eq(vsiServicesTable.normalizedName, normalizeKey(filters.name))));
  if (filters?.status) conditions.push(eq(vsiServicesTable.status, filters.status));
  if (filters?.hasDivergence != null) conditions.push(eq(vsiServicesTable.hasDivergence, filters.hasDivergence));
  const rows = conditions.length
    ? await db.select().from(vsiServicesTable).where(conditions.length === 1 ? conditions[0]! : and(...conditions))
    : await db.select().from(vsiServicesTable);

  return rows.map((row) => ({
    id: row.serviceKey,
    tenant_id: row.tenantId,
    tenant_name: row.tenantName,
    vs_id: row.vsId,
    name: row.name,
    normalized_name: row.normalizedName,
    status: row.status as VsiVplsServiceSummary["status"],
    severity: row.severity as VsiVplsServiceSummary["severity"],
    sites_count: row.sitesCount,
    devices_count: row.devicesCount,
    acs_count: row.acsCount,
    pws_count: row.pwsCount,
    pws_up_count: row.pwsUpCount,
    alarms_count: row.alarmsCount,
    has_divergence: row.hasDivergence,
    last_collected_at: toIso(row.lastCollectedAt),
    first_seen_at: toIso(row.firstSeenAt),
    last_seen_at: toIso(row.lastSeenAt),
  }));
}

async function loadPersistedDetail(id: string): Promise<VsiVplsDetailResponse | null> {
  const [serviceRow] = await db.select().from(vsiServicesTable).where(eq(vsiServicesTable.serviceKey, id)).limit(1);
  if (!serviceRow) return null;

  const [members, configs, historyRows, events] = await Promise.all([
    db
      .select({
        member: vsiServiceMembersTable,
        deviceName: devicesTable.hostname,
      })
      .from(vsiServiceMembersTable)
      .innerJoin(devicesTable, eq(vsiServiceMembersTable.deviceId, devicesTable.id))
      .where(eq(vsiServiceMembersTable.serviceId, serviceRow.id)),
    db.select().from(vsiServiceConfigsTable).where(eq(vsiServiceConfigsTable.serviceId, serviceRow.id)),
    db.select().from(vsiServiceStatusHistoryTable).where(eq(vsiServiceStatusHistoryTable.serviceId, serviceRow.id)).orderBy(desc(vsiServiceStatusHistoryTable.collectedAt)),
    db.select().from(vsiServiceEventsTable).where(eq(vsiServiceEventsTable.serviceId, serviceRow.id)).orderBy(desc(vsiServiceEventsTable.createdAt)),
  ]);

  const memberRecords: VsiVplsMemberRecord[] = members.map(({ member, deviceName }) => ({
    device_id: member.deviceId,
    device_name: deviceName,
    site: member.site,
    tenant_id: serviceRow.tenantId,
    tenant_name: serviceRow.tenantName,
    vendor: member.vendor,
    circuit_id: member.circuitId,
    circuit_type: member.circuitType as "vsi" | "vpls",
    name: member.name,
    normalized_name: member.normalizedName,
    vs_id: member.vsId,
    vsi_name: member.vsiName,
    source: member.source,
    admin_status: member.adminStatus as VsiVplsMemberRecord["admin_status"],
    oper_status: member.operStatus as VsiVplsMemberRecord["oper_status"],
    pw_status: member.pwStatus,
    local_interface: member.localInterface,
    parent_interface: member.parentInterface,
    peer_ip: member.peerIp,
    peer_ips: Array.isArray(member.peerIpsJson) ? (member.peerIpsJson as string[]) : [],
    peers: Array.isArray(member.peersJson) ? (member.peersJson as L2VsiPeer[]) : [],
    pw_summary: (member.pwSummaryJson as { total: number; up: number; down: number; unknown: number }) ?? null,
    outer_vlan: member.outerVlan,
    inner_vlan: member.innerVlan,
    mac_count: member.macCount,
    findings: (member.findingsJson as L2Finding[]) ?? [],
    first_seen: member.firstSeenAt.toISOString(),
    last_seen: member.lastSeenAt.toISOString(),
    raw_evidence: member.rawEvidence,
  }));

  const configRecords: VsiVplsConfigRecord[] = configs.map((config) => {
    const member = members.find((entry) => entry.member.id === config.memberId);
    return {
      device_id: config.deviceId,
      device_name: member?.deviceName ?? `Device ${config.deviceId}`,
      site: member?.member.site ?? "",
      tenant_id: serviceRow.tenantId,
      tenant_name: serviceRow.tenantName,
      collected_at: config.collectedAt.toISOString(),
      parser_status: config.parserStatus,
      source: config.source,
      raw_config: focusVsiVplsConfigText(config.rawConfig, { vsId: serviceRow.vsId, vsiName: serviceRow.name }),
    };
  });

  const diagnosis = classifyVsiVplsStatus({
    memberCount: memberRecords.length,
    configsCount: configRecords.length,
    pwsTotal: memberRecords.reduce((acc, member) => acc + (member.pw_summary?.total ?? member.peers.length), 0),
    pwsUp: memberRecords.reduce((acc, member) => acc + (member.pw_summary?.up ?? 0), 0),
    hasActiveAlarm: events.some((event) => /alarm/i.test(event.eventType)),
    hasDivergence: serviceRow.hasDivergence,
    operationalStatuses: memberRecords.map((member) => member.oper_status),
    findings: memberRecords.flatMap((member) => member.findings) as Array<{ code: string; severity: string }>,
  });

  const acs = memberRecords.flatMap((member) =>
    member.local_interface
      ? [{
          device_id: member.device_id,
          interface_name: member.local_interface,
          vlan_id: member.outer_vlan,
          qinq_outer_vlan: member.outer_vlan,
          qinq_inner_vlan: member.inner_vlan,
        }]
      : [],
  );
  const pseudowires = memberRecords.flatMap((member) =>
    member.peers.map((peer) => ({
      device_id: member.device_id,
      peer_ip: peer.peer_ip,
      pw_id: member.vs_id,
      vsi_id: member.vs_id,
      status: peer.pw_state ?? member.pw_status,
      uptime: peer.last_up_time ?? null,
      last_down_reason: null,
    })),
  );
  const history_summary = historyRows.map((row) => ({
    id: String(row.id),
    event_type: "status_snapshot" as const,
    status: row.status as VsiVplsStatusResult["status"],
    severity: row.severity as VsiVplsStatusResult["severity"],
    reason: row.reason,
    created_at: row.collectedAt.toISOString(),
  }));

  return {
    service: {
      id: serviceRow.serviceKey,
      tenant_id: serviceRow.tenantId,
      tenant_name: serviceRow.tenantName,
      vs_id: serviceRow.vsId,
      name: serviceRow.name,
      normalized_name: serviceRow.normalizedName,
      status: serviceRow.status as VsiVplsServiceSummary["status"],
      severity: serviceRow.severity as VsiVplsServiceSummary["severity"],
      sites_count: serviceRow.sitesCount,
      devices_count: serviceRow.devicesCount,
      acs_count: serviceRow.acsCount,
      pws_count: serviceRow.pwsCount,
      pws_up_count: serviceRow.pwsUpCount,
      alarms_count: serviceRow.alarmsCount,
      has_divergence: serviceRow.hasDivergence,
      last_collected_at: toIso(serviceRow.lastCollectedAt),
      first_seen_at: toIso(serviceRow.firstSeenAt),
      last_seen_at: toIso(serviceRow.lastSeenAt),
    },
    members: memberRecords,
    configs_metadata: configRecords,
    alarms: events
      .filter((event) => /alarm|finding/i.test(event.eventType) || /alarm/i.test(event.message))
      .map((event) => ({
        device_id: event.deviceId ?? 0,
        device_name: `Device ${event.deviceId ?? 0}`,
        code: event.eventType,
        severity: (((event.metadataJson ?? {}) as Record<string, unknown>).severity as VsiVplsAlarmRecord["severity"]) ?? "warning",
        message: event.message,
        source: "persisted",
      })),
    history_summary,
    diagnosis,
    acs,
    pseudowires,
  };
}

async function persistLiveGroups(groups: LiveVsiVplsGroup[]): Promise<void> {
  if (groups.length === 0) return;
  const now = new Date();
  await db.transaction(async (tx) => {
    for (const group of groups) {
      const [serviceRow] = await tx
        .insert(vsiServicesTable)
        .values({
          serviceKey: group.service.id,
          tenantId: group.service.tenant_id,
          tenantName: group.service.tenant_name,
          vsId: group.service.vs_id,
          name: group.service.name,
          normalizedName: group.service.normalized_name,
          status: group.service.status,
          severity: group.service.severity,
          sitesCount: group.service.sites_count,
          devicesCount: group.service.devices_count,
          acsCount: group.service.acs_count,
          pwsCount: group.service.pws_count,
          pwsUpCount: group.service.pws_up_count,
          alarmsCount: group.service.alarms_count,
          hasDivergence: group.service.has_divergence,
          firstSeenAt: group.service.first_seen_at ? new Date(group.service.first_seen_at) : null,
          lastSeenAt: group.service.last_seen_at ? new Date(group.service.last_seen_at) : null,
          lastCollectedAt: group.service.last_collected_at ? new Date(group.service.last_collected_at) : now,
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: vsiServicesTable.serviceKey,
          set: {
            tenantId: group.service.tenant_id,
            tenantName: group.service.tenant_name,
            vsId: group.service.vs_id,
            name: group.service.name,
            normalizedName: group.service.normalized_name,
            status: group.service.status,
            severity: group.service.severity,
            sitesCount: group.service.sites_count,
            devicesCount: group.service.devices_count,
            acsCount: group.service.acs_count,
            pwsCount: group.service.pws_count,
            pwsUpCount: group.service.pws_up_count,
            alarmsCount: group.service.alarms_count,
            hasDivergence: group.service.has_divergence,
            firstSeenAt: group.service.first_seen_at ? new Date(group.service.first_seen_at) : now,
            lastSeenAt: group.service.last_seen_at ? new Date(group.service.last_seen_at) : now,
            lastCollectedAt: group.service.last_collected_at ? new Date(group.service.last_collected_at) : now,
            updatedAt: now,
          },
        })
        .returning();

      if (!serviceRow) continue;

      await tx.delete(vsiServiceMembersTable).where(eq(vsiServiceMembersTable.serviceId, serviceRow.id));
      await tx.delete(vsiServiceConfigsTable).where(eq(vsiServiceConfigsTable.serviceId, serviceRow.id));

      const memberRows = await tx
        .insert(vsiServiceMembersTable)
        .values(
          group.members.map((member) => ({
            serviceId: serviceRow.id,
            deviceId: member.device_id,
            site: member.site,
            vendor: member.vendor,
            circuitId: member.circuit_id,
            circuitType: member.circuit_type,
            name: member.name,
            normalizedName: member.normalized_name,
            vsId: member.vs_id,
            vsiName: member.vsi_name,
            source: member.source,
            adminStatus: member.admin_status,
            operStatus: member.oper_status,
            pwStatus: member.pw_status,
            localInterface: member.local_interface,
            parentInterface: member.parent_interface,
            peerIp: member.peer_ip,
            peerIpsJson: member.peer_ips,
            peersJson: member.peers,
            pwSummaryJson: member.pw_summary ?? {},
            outerVlan: member.outer_vlan,
            innerVlan: member.inner_vlan,
            macCount: member.mac_count,
            findingsJson: member.findings,
            firstSeenAt: new Date(member.first_seen),
            lastSeenAt: new Date(member.last_seen),
            rawEvidence: member.raw_evidence,
            updatedAt: now,
          })),
        )
        .returning({ id: vsiServiceMembersTable.id, deviceId: vsiServiceMembersTable.deviceId });

      const memberIdByDevice = new Map(memberRows.map((row) => [row.deviceId, row.id] as const));

      const configPayloads = group.configs_metadata.flatMap((config) => {
        const memberId = memberIdByDevice.get(config.device_id);
        if (!memberId) return [];
        return [{
          serviceId: serviceRow.id,
          memberId,
          deviceId: config.device_id,
          collectedAt: new Date(config.collected_at),
          parserStatus: config.parser_status,
          source: config.source,
          rawConfig: config.raw_config,
          configHash: null,
          commandUsed: null,
          parserVersion: null,
          updatedAt: now,
        }];
      });

      if (configPayloads.length > 0) {
        await tx.insert(vsiServiceConfigsTable).values(configPayloads);
      }

      await tx.insert(vsiServiceStatusHistoryTable).values({
        serviceId: serviceRow.id,
        status: group.service.status,
        severity: group.service.severity,
        reason: group.diagnosis.reason,
        evidenceJson: group.diagnosis.evidence,
        collectedAt: new Date(group.service.last_collected_at ?? now.toISOString()),
      });

      const eventPayloads: Array<{
        serviceId: number;
        deviceId?: number | null;
        eventType: string;
        oldValue: string | null;
        newValue: string | null;
        message: string;
        metadataJson: Record<string, unknown>;
      }> = [
        {
          serviceId: serviceRow.id,
          eventType: "snapshot_refreshed",
          oldValue: null,
          newValue: group.service.status,
          message: `Snapshot VSI/VPLS atualizado para ${group.service.name}`,
          metadataJson: {
            tenant_id: group.service.tenant_id,
            vs_id: group.service.vs_id,
            status: group.service.status,
            severity: group.service.severity,
          },
        },
      ];

      for (const alarm of group.alarms) {
          eventPayloads.push({
            serviceId: serviceRow.id,
            deviceId: alarm.device_id,
            eventType: "alarm_observed",
            oldValue: null,
          newValue: alarm.code,
          message: alarm.message,
          metadataJson: {
            severity: alarm.severity,
            source: alarm.source,
          },
        });
      }

      await tx.insert(vsiServiceEventsTable).values(eventPayloads);
    }
  });
}

function applyFilters(rows: JoinedRow[], filters?: VsiVplsListFilter): JoinedRow[] {
  return rows.filter((row) => {
    const serviceName = row.circuit.vsiName ?? row.circuit.name;
    const summaryName = normalizeKey(serviceName);
    const tenantId = row.tenantId;
    const collectedAt = row.circuit.updatedAt;
    if (filters?.tenantId != null && tenantId !== filters.tenantId) return false;
    if (filters?.vsId && (row.circuit.vsiId ?? "") !== filters.vsId) return false;
    if (filters?.name && !summaryName.includes(normalizeKey(filters.name))) return false;
    if (filters?.site && !normalizeKey(row.device.site).includes(normalizeKey(filters.site))) return false;
    if (filters?.deviceId != null && row.device.id !== filters.deviceId) return false;
    if (filters?.lastCollectedFrom && collectedAt < new Date(filters.lastCollectedFrom)) return false;
    if (filters?.lastCollectedTo && collectedAt > new Date(filters.lastCollectedTo)) return false;
    return true;
  });
}

async function buildServices(filters?: VsiVplsListFilter): Promise<VsiVplsServiceSummary[]> {
  const requiresLiveRead = Boolean(
    filters?.site || filters?.deviceId != null || filters?.lastCollectedFrom || filters?.lastCollectedTo,
  );
  if (!requiresLiveRead) {
    const persisted = await loadPersistedSummaries(filters);
    if (persisted.length > 0) return persisted;
  }

  const groups = await buildLiveGroups(filters);
  let summaries = groups.map((group) => group.service);

  if (filters?.status) {
    summaries = summaries.filter((summary) => summary.status === filters.status);
  }
  if (filters?.hasAlarm != null) {
    summaries = summaries.filter((summary) => (filters.hasAlarm ? summary.alarms_count > 0 : summary.alarms_count === 0));
  }
  if (filters?.hasDivergence != null) {
    summaries = summaries.filter((summary) => summary.has_divergence === filters.hasDivergence);
  }

  return summaries.sort((a, b) => {
    const at = a.last_collected_at ? new Date(a.last_collected_at).getTime() : 0;
    const bt = b.last_collected_at ? new Date(b.last_collected_at).getTime() : 0;
    return bt - at || a.name.localeCompare(b.name);
  });
}

async function loadDetail(id: string): Promise<VsiVplsDetailResponse | null> {
  const persisted = await loadPersistedDetail(id);
  if (persisted) return persisted;

  const rows = await loadJoinedCircuits();
  const tenantNames = await loadTenantsByIds([...new Set(rows.map((row) => row.tenantId).filter((value): value is number => value != null))]);
  const matched = rows.filter((row) => buildServiceKey(row.tenantId, row.circuit.vsiId ?? null, row.circuit.vsiName ?? row.circuit.name) === id);
  if (matched.length === 0) return null;

  const service = aggregateService(matched, tenantNames.get(matched[0].tenantId ?? -1) ?? null);
  const memberRows = matched.map((row) => aggregateMember(row, tenantNames.get(row.tenantId ?? -1) ?? null));
  const configs_metadata = await aggregateConfigs(matched, tenantNames);
  const focusedConfigs = configs_metadata.map((config) => ({
    ...config,
    raw_config: focusVsiVplsConfigText(config.raw_config, { vsId: service.vs_id, vsiName: service.name }),
  }));
  const alarms = aggregateAlarms(matched);
  const diagnosis = classifyVsiVplsStatus({
    memberCount: memberRows.length,
    configsCount: focusedConfigs.length,
    pwsTotal: memberRows.reduce((acc, member) => acc + (member.pw_summary?.total ?? member.peers.length), 0),
    pwsUp: memberRows.reduce((acc, member) => acc + (member.pw_summary?.up ?? 0), 0),
    hasActiveAlarm: alarms.length > 0,
    hasDivergence: service.has_divergence,
    operationalStatuses: memberRows.map((member) => member.oper_status),
    findings: memberRows.flatMap((member) => member.findings) as Array<{ code: string; severity: string }>,
  });

  const acs = memberRows.flatMap((member) =>
    member.local_interface
      ? [{
          device_id: member.device_id,
          interface_name: member.local_interface,
          vlan_id: member.outer_vlan,
          qinq_outer_vlan: member.outer_vlan,
          qinq_inner_vlan: member.inner_vlan,
        }]
      : [],
  );

  const pseudowires = memberRows.flatMap((member) =>
    member.peers.map((peer) => ({
      device_id: member.device_id,
      peer_ip: peer.peer_ip,
      pw_id: member.vs_id,
      vsi_id: member.vs_id,
      status: peer.pw_state ?? member.pw_status,
      uptime: peer.last_up_time ?? null,
      last_down_reason: null,
    })),
  );

  const history_summary = aggregateHistory(matched, diagnosis.reason);
  return {
    service,
    members: memberRows,
    configs_metadata: focusedConfigs,
    alarms,
    history_summary,
    diagnosis,
    acs,
    pseudowires,
  };
}

export async function listVsiVplsServices(filters?: VsiVplsListFilter): Promise<VsiVplsListResponse> {
  const services = await buildServices(filters);
  return { services, total: services.length };
}

export async function getVsiVplsServiceDetail(id: string): Promise<VsiVplsDetailResponse | null> {
  return loadDetail(id);
}

export async function getVsiVplsServiceMembers(id: string): Promise<VsiVplsMemberRecord[]> {
  const detail = await loadDetail(id);
  return detail?.members ?? [];
}

export async function getVsiVplsServiceConfigs(id: string): Promise<VsiVplsConfigRecord[]> {
  const detail = await loadDetail(id);
  return detail?.configs_metadata ?? [];
}

export async function getVsiVplsServiceAlarms(id: string): Promise<VsiVplsAlarmRecord[]> {
  const detail = await loadDetail(id);
  return detail?.alarms ?? [];
}

export async function getVsiVplsServiceHistory(id: string): Promise<VsiVplsHistoryRecord[]> {
  const detail = await loadDetail(id);
  return detail?.history_summary ?? [];
}

export async function runVsiVplsDiscoverySnapshot(filters?: VsiVplsListFilter): Promise<VsiVplsListResponse> {
  const groups = await buildLiveGroups(filters);
  await persistLiveGroups(groups);
  return { services: groups.map((group) => group.service), total: groups.length };
}
