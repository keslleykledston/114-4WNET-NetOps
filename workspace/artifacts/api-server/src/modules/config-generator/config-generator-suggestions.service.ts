import { and, desc, eq, inArray, or } from "drizzle-orm";
import {
  bgpAnnouncementTargetsTable,
  bgpCommunitySetsTable,
  collectedConfigsTable,
  configGeneratorTemplatesTable,
  configGeneratorTemplateVersionsTable,
  discoverySnapshotsTable,
  l2CircuitsTable,
  serviceCatalogTable,
  snmpSnapshotsTable,
  tenantsTable,
  communityLibraryItemsTable,
  communitySetMembersTable,
  connectorsTable,
  connectorGroupsTable,
  db,
  devicesTable,
} from "@workspace/db";
import type { DeviceDiscoverySnapshot, InterfaceSummary as DiscoveryInterfaceSummary, BgpPeerSummary, L2vpnSummary } from "../netops/device-discovery/discovery.types.js";
import { snapshotToNetopsData } from "../netops/adapters/snapshot-adapter.js";
import { CONFIG_GENERATOR_GLOBAL_OBJECTS } from "./config-generator.catalog.js";
import { listConfigGeneratorTemplates } from "./config-generator.service.js";
import type {
  ConfigGeneratorBgpPeerSuggestion,
  ConfigGeneratorConflictSuggestion,
  ConfigGeneratorDependencySuggestion,
  ConfigGeneratorDeviceContextResponse,
  ConfigGeneratorDevicesResponse,
  ConfigGeneratorFieldOrigins,
  ConfigGeneratorInterfaceSuggestion,
  ConfigGeneratorScopeResponse,
  ConfigGeneratorServiceContextResponse,
  ConfigGeneratorScopeTenant,
  ConfigGeneratorScopeDevice,
  ConfigGeneratorTemplatesResponse,
} from "./config-generator.types.js";
import { suggestNextId } from "./config-generator-id-allocator.service.js";

function text(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function num(value: unknown): number | null {
  if (typeof value === "number" && Number.isInteger(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isInteger(parsed) ? parsed : null;
  }
  return null;
}

function first<T>(items: T[]): T | null {
  return items.length > 0 ? items[0] : null;
}

function parseJsonTextArray(value: string | null | undefined): string[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.map((item) => String(item).trim()).filter(Boolean) : [];
  } catch {
    return [];
  }
}

type ScopedDeviceRow = {
  tenantId: number | null;
  tenantName: string;
  deviceId: number;
  deviceName: string;
  vendor: string;
  platform: string;
  status: string;
};

function deviceTenantLabel(row: { tenantNameFromConnector?: string | null; tenantNameFromGroup?: string | null; tenantIdFromConnector?: number | null; tenantIdFromGroup?: number | null }) {
  return row.tenantNameFromGroup ?? row.tenantNameFromConnector ?? `Tenant ${row.tenantIdFromGroup ?? row.tenantIdFromConnector ?? 0}`;
}

async function loadScopedDeviceRows(filter?: { tenantId?: number; deviceId?: number }): Promise<ScopedDeviceRow[]> {
  const rows = await db
    .select({
      deviceId: devicesTable.id,
      deviceName: devicesTable.hostname,
      vendor: devicesTable.vendor,
      platform: devicesTable.platform,
      status: devicesTable.status,
      tenantIdFromConnector: connectorsTable.tenantId,
      tenantIdFromGroup: connectorGroupsTable.tenantId,
      tenantNameFromConnector: tenantsTable.name,
      tenantNameFromGroup: tenantsTable.name,
    })
    .from(devicesTable)
    .leftJoin(connectorsTable, eq(devicesTable.connectorId, connectorsTable.id))
    .leftJoin(connectorGroupsTable, eq(devicesTable.connectorGroupId, connectorGroupsTable.id))
    .leftJoin(tenantsTable, or(eq(connectorsTable.tenantId, tenantsTable.id), eq(connectorGroupsTable.tenantId, tenantsTable.id)));

  return rows
    .map((row) => {
      const tenantId = row.tenantIdFromGroup ?? row.tenantIdFromConnector ?? null;
      const tenantName = deviceTenantLabel(row);
      return {
        tenantId,
        tenantName,
        deviceId: row.deviceId,
        deviceName: row.deviceName,
        vendor: row.vendor,
        platform: row.platform,
        status: row.status,
      };
    })
    .filter((row) => (filter?.tenantId != null ? row.tenantId === filter.tenantId : true))
    .filter((row) => (filter?.deviceId != null ? row.deviceId === filter.deviceId : true));
}

async function loadDeviceTenantDevice(deviceId: number) {
  const [row] = await loadScopedDeviceRows({ deviceId });
  return row ?? null;
}

function summarizeInterfaces(snapshot: DeviceDiscoverySnapshot | null, snmpInterfaces: ConfigGeneratorInterfaceSuggestion[]): ConfigGeneratorInterfaceSuggestion[] {
  const discoveryInterfaces = snapshot?.interfaces?.map((item) => ({
    name: item.name,
    description: item.description ?? null,
    status: item.operStatus ?? item.adminStatus ?? "unknown",
    kind: item.kind ?? "unknown",
    source: "discovery" as const,
  })) ?? [];
  return discoveryInterfaces.length > 0 ? discoveryInterfaces : snmpInterfaces;
}

function summarizeBgpPeers(snapshot: DeviceDiscoverySnapshot | null, snmpPeers: ConfigGeneratorBgpPeerSuggestion[]): ConfigGeneratorBgpPeerSuggestion[] {
  const discoveryPeers = snapshot?.bgpPeers?.map((item) => ({
    remoteAsn: item.remoteAs ?? null,
    remoteIp: item.peerIp ?? null,
    localIp: null,
    description: item.description ?? null,
    state: item.state ?? null,
  })) ?? [];
  return discoveryPeers.length > 0 ? discoveryPeers : snmpPeers;
}

function buildGlobalDependency(name: string, present: boolean, classification: "global" | "circuit" = "global"): ConfigGeneratorDependencySuggestion {
  return {
    type: name,
    name,
    status: present ? "present" : "missing",
    classification,
  };
}

function buildGlobalDependencyRows(rawConfig: string | null, snapshot: DeviceDiscoverySnapshot | null, communities: string[]): ConfigGeneratorDependencySuggestion[] {
  const raw = (rawConfig ?? "").toLowerCase();
  const rows = CONFIG_GENERATOR_GLOBAL_OBJECTS.map((name) => buildGlobalDependency(name, raw.includes(name.toLowerCase())));
  const snapshotNames = [
    ...(snapshot?.communities ?? []).map((item) => item.name),
    ...(snapshot?.communityLists ?? []).map((item) => item.name),
    ...(snapshot?.prefixLists ?? []).map((item) => item.name),
    ...(snapshot?.asPathFilters ?? []).map((item) => item.name),
    ...(snapshot?.extcommunityFilters ?? []).map((item) => item.name),
    ...(snapshot?.aclFilters ?? []).map((item) => item.name),
  ];
  const extra = new Set(snapshotNames.filter(Boolean));
  for (const name of extra) {
    rows.push(buildGlobalDependency(name, true));
  }
  for (const community of communities) {
    rows.push({
      type: "community",
      name: community,
      status: raw.includes(community.toLowerCase()) ? "present" : "missing",
      classification: "global",
    });
  }
  return rows;
}

function buildFieldOriginsFromSuggestions(suggestions: Record<string, unknown>): ConfigGeneratorFieldOrigins {
  const origins: ConfigGeneratorFieldOrigins = {};
  for (const [key, value] of Object.entries(suggestions)) {
    if (value !== undefined && value !== null && value !== "") {
      origins[key] = "manual";
    }
  }
  return origins;
}

function buildConflict(code: string, message: string, field?: string): ConfigGeneratorConflictSuggestion {
  return { code, severity: "warning", message, ...(field ? { field } : {}) };
}

async function loadLatestDiscoverySnapshot(deviceId: number) {
  const [row] = await db
    .select()
    .from(discoverySnapshotsTable)
    .where(eq(discoverySnapshotsTable.deviceId, deviceId))
    .orderBy(desc(discoverySnapshotsTable.createdAt))
    .limit(1);
  return row?.snapshotJson ? (row.snapshotJson as DeviceDiscoverySnapshot) : null;
}

async function loadLatestSnmpSnapshot(deviceId: number) {
  const [row] = await db
    .select()
    .from(snmpSnapshotsTable)
    .where(eq(snmpSnapshotsTable.deviceId, deviceId))
    .orderBy(desc(snmpSnapshotsTable.collectedAt))
    .limit(1);
  return row ?? null;
}

async function loadLatestRawConfig(deviceId: number) {
  const [row] = await db
    .select({ rawConfig: collectedConfigsTable.rawConfig })
    .from(collectedConfigsTable)
    .where(eq(collectedConfigsTable.deviceId, deviceId))
    .orderBy(desc(collectedConfigsTable.collectedAt))
    .limit(1);
  return row?.rawConfig ?? null;
}

export async function listConfigGeneratorSuggestionScope(): Promise<ConfigGeneratorScopeResponse> {
  const rows = await loadScopedDeviceRows();
  const tenants = new Map<number, ConfigGeneratorScopeTenant>();
  for (const row of rows) {
    if (row.tenantId == null) continue;
    const current = tenants.get(row.tenantId);
    if (current) {
      current.deviceCount += 1;
      continue;
    }
    tenants.set(row.tenantId, {
      tenantId: row.tenantId,
      tenantName: row.tenantName,
      deviceCount: 1,
    });
  }
  return { tenants: [...tenants.values()].sort((a, b) => a.tenantName.localeCompare(b.tenantName)) };
}

export async function listConfigGeneratorSuggestionDevices(tenantId: number): Promise<ConfigGeneratorDevicesResponse> {
  const rows = await loadScopedDeviceRows({ tenantId });
  return {
    tenantId,
    devices: rows.map((row) => ({
      tenantId: row.tenantId ?? tenantId,
      tenantName: row.tenantName,
      deviceId: row.deviceId,
      deviceName: row.deviceName,
      vendor: row.vendor,
      platform: row.platform,
      status: row.status,
    })),
  };
}

export async function listConfigGeneratorSuggestionTemplates(input: { tenantId?: number | null; deviceId?: number | null; serviceType?: string | null } = {}): Promise<ConfigGeneratorTemplatesResponse> {
  const templates = await listConfigGeneratorTemplates();
  const device = input.deviceId != null ? await loadDeviceTenantDevice(input.deviceId) : null;
  const filtered = templates.filter((template) => {
    if (input.serviceType && template.serviceType !== input.serviceType) return false;
    if (!device) return true;
    return template.vendor.toLowerCase() === device.vendor.toLowerCase() && template.platform.toLowerCase() === device.platform.toLowerCase();
  });
  return {
    tenantId: input.tenantId ?? null,
    deviceId: input.deviceId ?? null,
    serviceType: input.serviceType ?? null,
    templates: filtered,
  };
}

export async function getConfigGeneratorDeviceContext(input: { tenantId: number; deviceId: number }): Promise<ConfigGeneratorDeviceContextResponse | null> {
  const device = await loadDeviceTenantDevice(input.deviceId);
  if (!device || device.tenantId !== input.tenantId) return null;

  const discoverySnapshot = await loadLatestDiscoverySnapshot(input.deviceId);
  const snmpSnapshot = await loadLatestSnmpSnapshot(input.deviceId);
  const netopsData = snmpSnapshot ? snapshotToNetopsData(snmpSnapshot) : null;
  const rawConfig = await loadLatestRawConfig(input.deviceId);

  const interfaces = summarizeInterfaces(discoverySnapshot, netopsData?.interfaces.map((item) => ({
    name: item.name,
    description: item.description ?? null,
    status: item.operStatus,
    kind: item.kind ?? "physical",
    source: "snmp" as const,
  })) ?? []);
  const bgpPeers = summarizeBgpPeers(discoverySnapshot, netopsData?.bgpPeers.map((item) => ({
    remoteAsn: item.remoteAs ?? null,
    remoteIp: item.peerIp ?? null,
    localIp: null,
    description: item.description ?? null,
    state: item.state ?? null,
  })) ?? []);

  const localAsn = null;
  const l2Rows = await db.select().from(l2CircuitsTable).where(eq(l2CircuitsTable.deviceId, input.deviceId)).orderBy(desc(l2CircuitsTable.createdAt));
  const l2Circuits = l2Rows.map((row) => ({
    circuitId: row.serviceId ?? row.vcId ?? row.name,
    serviceId: row.serviceId ?? null,
    circuitType: row.circuitType,
    name: row.name,
    vlan: row.outerVlan ?? row.innerVlan ?? null,
    interfaceName: row.localInterface ?? null,
    peerIp: row.peerIp ?? null,
  }));

  const serviceCatalog = await db.select().from(serviceCatalogTable).where(eq(serviceCatalogTable.status, "ACTIVE"));
  const communityRows = await db
    .select({ communityValue: communityLibraryItemsTable.communityValue })
    .from(communityLibraryItemsTable)
    .where(eq(communityLibraryItemsTable.deviceId, input.deviceId));
  const communitySetRows = await db
    .select({ communityValue: communitySetMembersTable.communityValue })
    .from(communitySetMembersTable)
    .innerJoin(communityLibraryItemsTable, eq(communitySetMembersTable.linkedLibraryItemId, communityLibraryItemsTable.id))
    .where(eq(communityLibraryItemsTable.deviceId, input.deviceId));
  const communities = [...communityRows.map((row) => row.communityValue), ...communitySetRows.map((row) => row.communityValue)];

  const globalDependencies = buildGlobalDependencyRows(
    rawConfig,
    discoverySnapshot,
    communities,
  );

  const conflicts: ConfigGeneratorConflictSuggestion[] = [];
  const firstL2 = first(l2Circuits);
  if (firstL2?.vlan != null) {
    conflicts.push(buildConflict("L2_CIRCUIT_EXISTS", `VLAN ${firstL2.vlan} já existe no device`, "vlan"));
  }
  if (!first(interfaces)) {
    conflicts.push(buildConflict("INTERFACE_NOT_FOUND", "Nenhuma interface descoberta no device", "interface"));
  }
  if (serviceCatalog.some((item) => item.serviceType === "bgp_customer_community" || item.serviceType === "l2vpn_vlan")) {
    // no-op, only here to keep data in context payload
  }

  const suggestedInput: Record<string, unknown> = {
    customerName: firstL2?.name ?? device.deviceName,
    circuitId: firstL2?.circuitId ?? String(firstL2?.vlan ?? input.deviceId),
    interface: firstL2?.interfaceName ?? first(interfaces)?.name ?? "",
    vlan: firstL2?.vlan ?? null,
    localAsn,
    remoteAsn: first(bgpPeers)?.remoteAsn ?? null,
    peerLocalIpv4: first(bgpPeers)?.localIp ?? null,
    peerRemoteIpv4: first(bgpPeers)?.remoteIp ?? null,
    importPolicyName: firstL2 ? `C${String(firstL2.circuitId ?? firstL2.vlan ?? input.deviceId).replace(/\W+/g, "_")}_IMPORT` : `C${input.deviceId}_IMPORT`,
    exportPolicyName: firstL2 ? `C${String(firstL2.circuitId ?? firstL2.vlan ?? input.deviceId).replace(/\W+/g, "_")}_EXPORT` : `C${input.deviceId}_EXPORT`,
    communityBase: localAsn != null ? `${localAsn}:${String(firstL2?.circuitId ?? firstL2?.vlan ?? input.deviceId).replace(/\D+/g, "") || firstL2?.vlan || input.deviceId}` : null,
    prependProfile: "P1",
    ipv4Prefixes: [],
  };

  const fieldOrigins = buildFieldOriginsFromSuggestions(suggestedInput);
  if (suggestedInput.customerName) fieldOrigins.customerName = "inventory";
  if (suggestedInput.interface) fieldOrigins.interface = "inventory";
  if (suggestedInput.circuitId) fieldOrigins.circuitId = "l2_circuit";
  if (suggestedInput.vlan != null) fieldOrigins.vlan = "l2_circuit";
  if (suggestedInput.localAsn != null) fieldOrigins.localAsn = "device_context";
  if (suggestedInput.remoteAsn != null) fieldOrigins.remoteAsn = "bgp_peer";
  if (suggestedInput.peerLocalIpv4 != null) fieldOrigins.peerLocalIpv4 = "bgp_peer";
  if (suggestedInput.peerRemoteIpv4 != null) fieldOrigins.peerRemoteIpv4 = "bgp_peer";
  if (suggestedInput.importPolicyName) fieldOrigins.importPolicyName = "announcement_matrix";
  if (suggestedInput.exportPolicyName) fieldOrigins.exportPolicyName = "announcement_matrix";
  if (suggestedInput.communityBase) fieldOrigins.communityBase = "announcement_matrix";
  if (suggestedInput.prependProfile) fieldOrigins.prependProfile = "announcement_matrix";
  fieldOrigins.ipv4Prefixes = "manual";

  return {
    tenantId: input.tenantId,
    tenantName: device.tenantName,
    deviceId: input.deviceId,
    deviceName: device.deviceName,
    vendor: device.vendor,
    platform: device.platform,
    interfaces,
    bgp: {
      localAsn,
      peers: bgpPeers,
    },
    l2Circuits,
    globalDependencies,
    conflicts,
    suggestedInput,
    fieldOrigins,
  };
}

export async function getConfigGeneratorServiceContext(input: { tenantId: number; deviceId: number; serviceType: string; ref?: string | null }): Promise<ConfigGeneratorServiceContextResponse | null> {
  const deviceContext = await getConfigGeneratorDeviceContext({ tenantId: input.tenantId, deviceId: input.deviceId });
  if (!deviceContext) return null;

  const serviceCatalogRows = await db
    .select()
    .from(serviceCatalogTable)
    .where(and(eq(serviceCatalogTable.status, "ACTIVE"), eq(serviceCatalogTable.serviceType, input.serviceType)));
  const templateRows = await listConfigGeneratorTemplates();
  const compatibleTemplates = templateRows.filter((template) => template.vendor.toLowerCase() === deviceContext.vendor.toLowerCase() && template.platform.toLowerCase() === deviceContext.platform.toLowerCase() && template.serviceType === input.serviceType);
  const ref = input.ref?.trim() || null;
  const serviceCatalogItem = ref ? serviceCatalogRows.find((item) => item.name.toLowerCase().includes(ref.toLowerCase())) ?? first(serviceCatalogRows) ?? null : first(serviceCatalogRows) ?? null;
  const circuit = first(deviceContext.l2Circuits);

  const suggestedInput: Record<string, unknown> = { ...deviceContext.suggestedInput };
  const notes: string[] = [];
  if (input.serviceType === "bgp_customer_community") {
    suggestedInput.customerName = serviceCatalogItem?.name ?? circuit?.name ?? deviceContext.deviceName;
    suggestedInput.circuitId = circuit?.circuitId ?? ref ?? String(input.deviceId);
    suggestedInput.interface = circuit?.interfaceName ?? deviceContext.interfaces[0]?.name ?? "";
    suggestedInput.vlan = circuit?.vlan ?? null;
    suggestedInput.deviceName = deviceContext.deviceName;
    suggestedInput.mode = "tagged";
    suggestedInput.serviceType = input.serviceType;
    suggestedInput.remoteAsn = deviceContext.bgp.peers[0]?.remoteAsn ?? null;
    suggestedInput.peerLocalIpv4 = deviceContext.bgp.peers[0]?.localIp ?? null;
    suggestedInput.peerRemoteIpv4 = deviceContext.bgp.peers[0]?.remoteIp ?? null;
    suggestedInput.importPolicyName = `C${String(suggestedInput.circuitId ?? input.deviceId).replace(/\W+/g, "_")}_IMPORT`;
    suggestedInput.exportPolicyName = `C${String(suggestedInput.circuitId ?? input.deviceId).replace(/\W+/g, "_")}_EXPORT`;
    suggestedInput.communityBase = deviceContext.bgp.localAsn != null ? `${deviceContext.bgp.localAsn}:${String(suggestedInput.circuitId ?? suggestedInput.vlan ?? input.deviceId).replace(/\D+/g, "") || suggestedInput.vlan || input.deviceId}` : null;
    suggestedInput.prependProfile = "P1";
    suggestedInput.ipv4Prefixes = [];
    notes.push(compatibleTemplates.length > 0 ? `Template sugerido: ${compatibleTemplates[0].name}` : "Sem template compatível encontrado");
  } else if (input.serviceType === "l2vpn_vlan") {
    suggestedInput.customerName = serviceCatalogItem?.name ?? circuit?.name ?? deviceContext.deviceName;
    suggestedInput.circuitId = circuit?.circuitId ?? ref ?? String(input.deviceId);
    suggestedInput.interface = circuit?.interfaceName ?? deviceContext.interfaces[0]?.name ?? "";
    suggestedInput.vlan = circuit?.vlan ?? null;
    suggestedInput.deviceName = deviceContext.deviceName;
    suggestedInput.mode = circuit?.circuitType?.toLowerCase().includes("qinq") ? "qinq" : "tagged";
    suggestedInput.serviceType = input.serviceType;
    suggestedInput.description = serviceCatalogItem?.description ?? circuit?.name ?? null;
    suggestedInput.mtu = 1500;
    suggestedInput.peerLocalIpv4 = deviceContext.bgp.peers[0]?.localIp ?? null;
    suggestedInput.peerRemoteIpv4 = deviceContext.bgp.peers[0]?.remoteIp ?? null;
    suggestedInput.ipv4Prefixes = [];
    notes.push(compatibleTemplates.length > 0 ? `Template sugerido: ${compatibleTemplates[0].name}` : "Sem template compatível encontrado");
  }

  const fieldOrigins = buildFieldOriginsFromSuggestions(suggestedInput);
  if (suggestedInput.customerName) fieldOrigins.customerName = "service_catalog";
  if (suggestedInput.circuitId) fieldOrigins.circuitId = circuit ? "l2_circuit" : "announcement_matrix";
  if (suggestedInput.interface) fieldOrigins.interface = circuit ? "l2_circuit" : "inventory";
  if (suggestedInput.vlan != null) fieldOrigins.vlan = circuit ? "l2_circuit" : "manual";
  if (suggestedInput.deviceName) fieldOrigins.deviceName = "inventory";
  if (suggestedInput.mode) fieldOrigins.mode = "l2_circuit";
  if (suggestedInput.serviceType) fieldOrigins.serviceType = "service_catalog";
  if (suggestedInput.description) fieldOrigins.description = "service_catalog";
  if (suggestedInput.mtu != null) fieldOrigins.mtu = "manual";
  if (suggestedInput.remoteAsn != null) fieldOrigins.remoteAsn = "bgp_peer";
  if (suggestedInput.peerLocalIpv4 != null) fieldOrigins.peerLocalIpv4 = "bgp_peer";
  if (suggestedInput.peerRemoteIpv4 != null) fieldOrigins.peerRemoteIpv4 = "bgp_peer";
  if (suggestedInput.importPolicyName) fieldOrigins.importPolicyName = "announcement_matrix";
  if (suggestedInput.exportPolicyName) fieldOrigins.exportPolicyName = "announcement_matrix";
  if (suggestedInput.communityBase) fieldOrigins.communityBase = "announcement_matrix";
  if (suggestedInput.prependProfile) fieldOrigins.prependProfile = "announcement_matrix";
  fieldOrigins.ipv4Prefixes = "manual";

  const conflicts: ConfigGeneratorConflictSuggestion[] = [];
  if (suggestedInput.interface && !deviceContext.interfaces.some((item) => item.name === suggestedInput.interface)) {
    conflicts.push(buildConflict("INTERFACE_NOT_FOUND", "Interface sugerida não existe no device", "interface"));
  }
  if (suggestedInput.vlan != null && deviceContext.l2Circuits.some((item) => item.vlan === suggestedInput.vlan)) {
    conflicts.push(buildConflict("VLAN_CONFLICT", `VLAN ${suggestedInput.vlan} já usada em circuito local`, "vlan"));
  }
  const candidateCommunity = suggestedInput.circuitId && suggestedInput.vlan != null && deviceContext.bgp.localAsn != null
    ? `${deviceContext.bgp.localAsn}:${String(suggestedInput.circuitId).replace(/\D+/g, "") || suggestedInput.vlan}`
    : null;
  if (candidateCommunity && deviceContext.globalDependencies.some((item) => item.name === candidateCommunity)) {
    conflicts.push(buildConflict("COMMUNITY_CONFLICT", "Community sugerida já existe no contexto", "community"));
  }

  let idSuggestions = null;
  try {
    idSuggestions = await suggestNextId({
      tenantId: input.tenantId,
      deviceId: input.deviceId,
      serviceType: input.serviceType,
    });
    const alloc = idSuggestions.suggestions;
    if (alloc.vlan && suggestedInput.vlan == null) {
      suggestedInput.vlan = alloc.vlan.value;
      fieldOrigins.vlan = "id_allocator";
      suggestedInput.allocationRangeKey = alloc.vlan.rangeKey ?? null;
      suggestedInput.allocationReason = alloc.vlan.reason;
    }
    if (alloc.subinterfaceId) {
      suggestedInput.subinterfaceId = alloc.subinterfaceId.value;
      fieldOrigins.subinterfaceId = "id_allocator";
    }
    if (alloc.l2vcId && suggestedInput.l2vcId == null) {
      suggestedInput.l2vcId = alloc.l2vcId.value;
      fieldOrigins.l2vcId = "id_allocator";
    }
    if (alloc.vsiId && suggestedInput.vsiId == null) {
      suggestedInput.vsiId = alloc.vsiId.value;
      fieldOrigins.vsiId = "id_allocator";
    }
    for (const item of idSuggestions.blockingConflicts) {
      conflicts.push({
        code: item.code,
        severity: item.severity === "error" ? "error" : "warning",
        message: item.message,
        field: typeof item.context?.field === "string" ? item.context.field : undefined,
      });
    }
    if (idSuggestions.warnings.length > 0) {
      notes.push(...idSuggestions.warnings.map((item) => item.message));
    }
    notes.push("IDs sugeridos pelo alocador — recomendação, não obrigação.");
  } catch {
    notes.push("Alocador de IDs indisponível; preencha VLAN/L2VC manualmente.");
  }

  return {
    tenantId: input.tenantId,
    deviceId: input.deviceId,
    serviceType: input.serviceType,
    ref,
    suggestedInput,
    fieldOrigins,
    conflicts,
    globalDependencies: deviceContext.globalDependencies,
    notes,
    idSuggestions,
  };
}

export {
  buildGlobalDependencyRows,
  buildFieldOriginsFromSuggestions,
};
