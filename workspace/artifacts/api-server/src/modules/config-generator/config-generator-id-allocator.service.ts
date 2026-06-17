import type { ConfigGeneratorValidationFinding } from "./config-generator.types.js";
import {
  CONFIG_GENERATOR_ID_RANGES_VERSION,
  findVlanRangeForValue,
  getVlanRangeByKey,
  getVlanRangeForServiceType,
  isVlanGloballyBlocked,
  isVlanOutsidePreferredRange,
  listBuiltinIdRanges,
  resolveVlanRangeKeyForServiceType,
  type ConfigGeneratorIdType,
} from "./config-generator-id-ranges.js";
import {
  listConfigGeneratorDiscoveredIds,
  listTenantIdsByType,
  refreshConfigGeneratorIdInventory,
} from "./config-generator-id-inventory.service.js";

export interface ConfigGeneratorIdSuggestionItem {
  value: number;
  range?: string;
  rangeKey?: string;
  reason: string;
  confidence: "high" | "medium" | "low";
  origin: "id_allocator";
  scope?: "tenant" | "device" | "site";
  alternatives?: number[];
}

export interface ConfigGeneratorIdSuggestResponse {
  tenantId: number;
  siteId?: number | null;
  siteCode?: string | null;
  deviceId?: number | null;
  serviceType: string;
  suggestions: {
    vlan?: ConfigGeneratorIdSuggestionItem;
    subinterfaceId?: ConfigGeneratorIdSuggestionItem;
    l2vcId?: ConfigGeneratorIdSuggestionItem;
    vsiId?: ConfigGeneratorIdSuggestionItem;
  };
  usedIdsSummary: Partial<Record<ConfigGeneratorIdType, number[]>>;
  warnings: ConfigGeneratorValidationFinding[];
  blockingConflicts: ConfigGeneratorValidationFinding[];
}

export interface ConfigGeneratorIdValidateRequest {
  tenantId: number;
  siteCode?: string | null;
  deviceId?: number | null;
  serviceType: string;
  parentInterface?: string | null;
  vlan?: number | null;
  subinterfaceId?: number | null;
  l2vcId?: number | null;
  vsiId?: number | null;
}

export interface ConfigGeneratorIdValidateResponse {
  ok: boolean;
  warnings: ConfigGeneratorValidationFinding[];
  blockingConflicts: ConfigGeneratorValidationFinding[];
  fieldOrigins: Partial<Record<"vlan" | "subinterfaceId" | "l2vcId" | "vsiId", "id_allocator" | "manual">>;
}

export function nextFreeIds(used: Set<number>, rangeStart: number, rangeEnd: number, count = 4): number[] {
  const free: number[] = [];
  for (let candidate = rangeStart; candidate <= rangeEnd && free.length < count; candidate += 1) {
    if (!used.has(candidate)) free.push(candidate);
  }
  return free;
}

function buildRangeLabel(rangeStart: number, rangeEnd: number): string {
  return rangeStart === rangeEnd ? String(rangeStart) : `${rangeStart}-${rangeEnd}`;
}

function warning(code: string, message: string, context?: Record<string, unknown>): ConfigGeneratorValidationFinding {
  return { severity: "warning", code, message, ...(context ? { context } : {}) };
}

function errorFinding(code: string, message: string, context?: Record<string, unknown>): ConfigGeneratorValidationFinding {
  return { severity: "error", code, message, ...(context ? { context } : {}) };
}

async function loadUsedIds(input: {
  tenantId: number;
  deviceId?: number | null;
  idType: ConfigGeneratorIdType;
}) {
  return new Set(await listTenantIdsByType(input.tenantId, input.idType, input.deviceId));
}

export async function getUsedIds(input: {
  tenantId: number;
  siteCode?: string | null;
  deviceId?: number | null;
  idType: ConfigGeneratorIdType;
  serviceType?: string | null;
}): Promise<number[]> {
  void input.serviceType;
  if (input.siteCode) {
    const rows = await listConfigGeneratorDiscoveredIds({
      tenantId: input.tenantId,
      siteCode: input.siteCode,
      deviceId: input.deviceId ?? undefined,
      idType: input.idType,
    });
    return [...new Set(rows.map((row) => row.idValue))].sort((a, b) => a - b);
  }
  return listTenantIdsByType(input.tenantId, input.idType, input.deviceId);
}

export function explainSuggestion(input: {
  idType: ConfigGeneratorIdType;
  value: number;
  serviceType: string;
  rangeKey?: string | null;
  scope?: "tenant" | "device" | "site";
}): string {
  const range = input.rangeKey ? getVlanRangeByKey(input.rangeKey) : getVlanRangeForServiceType(input.serviceType);
  const label = range?.label ?? "range aplicável";
  if (input.idType === "subinterface") {
    return `Subinterface ${input.value} alinhada à VLAN sugerida`;
  }
  if (input.idType === "l2vc") {
    return `Próximo L2VC ID livre no escopo ${input.scope ?? "tenant"} (${label})`;
  }
  if (input.idType === "vsi") {
    return `Próximo VSI ID livre no escopo ${input.scope ?? "tenant"} (${label})`;
  }
  return `Próxima VLAN livre para ${label} no escopo ${input.scope ?? "device"}`;
}

export async function suggestNextId(input: {
  tenantId: number;
  siteCode?: string | null;
  deviceId?: number | null;
  serviceType: string;
  parentInterface?: string | null;
}): Promise<ConfigGeneratorIdSuggestResponse> {
  const preferredRangeKey = resolveVlanRangeKeyForServiceType(input.serviceType);
  const preferredRange = preferredRangeKey ? getVlanRangeByKey(preferredRangeKey) : getVlanRangeForServiceType(input.serviceType);
  const warnings: ConfigGeneratorValidationFinding[] = [];
  const blockingConflicts: ConfigGeneratorValidationFinding[] = [];

  const usedVlan = new Set(await getUsedIds({ tenantId: input.tenantId, siteCode: input.siteCode, deviceId: input.deviceId, idType: "vlan" }));
  const usedSubif = new Set(await getUsedIds({ tenantId: input.tenantId, siteCode: input.siteCode, deviceId: input.deviceId, idType: "subinterface" }));
  const usedL2vc = new Set(await getUsedIds({ tenantId: input.tenantId, deviceId: null, idType: "l2vc" }));
  const usedVsi = new Set(await getUsedIds({ tenantId: input.tenantId, deviceId: null, idType: "vsi" }));

  let vlanCandidates: number[] = [];
  if (preferredRange) {
    vlanCandidates = nextFreeIds(usedVlan, preferredRange.rangeStart, preferredRange.rangeEnd, 4);
  }
  if (vlanCandidates.length === 0) {
    const general = getVlanRangeByKey("general_use");
    if (general && preferredRange?.key !== "general_use") {
      vlanCandidates = nextFreeIds(usedVlan, general.rangeStart, general.rangeEnd, 4);
      warnings.push(warning(
        "id_range_exhausted",
        `Range preferencial ${buildRangeLabel(preferredRange?.rangeStart ?? 0, preferredRange?.rangeEnd ?? 0)} esgotado; sugerindo uso geral.`,
        { preferredRangeKey, fallbackRangeKey: "general_use" },
      ));
    }
  }
  if (vlanCandidates.length === 0) {
    blockingConflicts.push(errorFinding(
      "id_range_exhausted",
      "Nenhuma VLAN livre encontrada nos ranges permitidos.",
      { serviceType: input.serviceType },
    ));
  }

  const vlanValue = vlanCandidates[0];
  const suggestions: ConfigGeneratorIdSuggestResponse["suggestions"] = {};

  if (vlanValue != null) {
    suggestions.vlan = {
      value: vlanValue,
      range: preferredRange ? buildRangeLabel(preferredRange.rangeStart, preferredRange.rangeEnd) : undefined,
      rangeKey: preferredRange?.key,
      reason: explainSuggestion({ idType: "vlan", value: vlanValue, serviceType: input.serviceType, rangeKey: preferredRange?.key, scope: "device" }),
      confidence: "high",
      origin: "id_allocator",
      scope: "device",
      alternatives: vlanCandidates.slice(1),
    };
    suggestions.subinterfaceId = {
      value: vlanValue,
      reason: "Alinhado à VLAN sugerida",
      confidence: "high",
      origin: "id_allocator",
      scope: "device",
    };
  }

  const l2vcCandidates = nextFreeIds(usedL2vc, preferredRange?.rangeStart ?? 600, preferredRange?.rangeEnd ?? 799, 4);
  const l2vcValue = l2vcCandidates[0] ?? vlanValue;
  if (l2vcValue != null) {
    suggestions.l2vcId = {
      value: l2vcValue,
      reason: explainSuggestion({ idType: "l2vc", value: l2vcValue, serviceType: input.serviceType, rangeKey: preferredRange?.key, scope: "tenant" }),
      confidence: "high",
      origin: "id_allocator",
      scope: "tenant",
      alternatives: l2vcCandidates.slice(1),
    };
  }

  const vsiCandidates = nextFreeIds(usedVsi, preferredRange?.rangeStart ?? 600, preferredRange?.rangeEnd ?? 799, 4);
  const vsiValue = vsiCandidates[0] ?? vlanValue;
  if (vsiValue != null) {
    suggestions.vsiId = {
      value: vsiValue,
      reason: explainSuggestion({ idType: "vsi", value: vsiValue, serviceType: input.serviceType, rangeKey: preferredRange?.key, scope: "tenant" }),
      confidence: "high",
      origin: "id_allocator",
      scope: "tenant",
      alternatives: vsiCandidates.slice(1),
    };
  }

  return {
    tenantId: input.tenantId,
    siteCode: input.siteCode ?? null,
    deviceId: input.deviceId ?? null,
    serviceType: input.serviceType,
    suggestions,
    usedIdsSummary: {
      vlan: [...usedVlan].sort((a, b) => a - b),
      subinterface: [...usedSubif].sort((a, b) => a - b),
      l2vc: [...usedL2vc].sort((a, b) => a - b),
      vsi: [...usedVsi].sort((a, b) => a - b),
    },
    warnings,
    blockingConflicts,
  };
}

export async function validateRequestedId(input: ConfigGeneratorIdValidateRequest): Promise<ConfigGeneratorIdValidateResponse> {
  const warnings: ConfigGeneratorValidationFinding[] = [];
  const blockingConflicts: ConfigGeneratorValidationFinding[] = [];
  const fieldOrigins: ConfigGeneratorIdValidateResponse["fieldOrigins"] = {};

  const validateNumeric = async (
    field: "vlan" | "subinterfaceId" | "l2vcId" | "vsiId",
    value: number | null | undefined,
    idType: ConfigGeneratorIdType,
    scopeDevice: boolean,
  ) => {
    if (value == null) return;
    fieldOrigins[field] = "manual";

    if (field === "vlan") {
      if (isVlanGloballyBlocked(value, input.serviceType)) {
        blockingConflicts.push(errorFinding("vlan_blocked", `VLAN ${value} está bloqueada pela política K3G.`, { vlan: value, field }));
        return;
      }
      if (isVlanOutsidePreferredRange(value, input.serviceType)) {
        warnings.push(warning("vlan_outside_preferred_range", `VLAN ${value} está fora do range padrão para ${input.serviceType}.`, { vlan: value, field }));
      }
      const range = findVlanRangeForValue(value);
      if (range?.reserved && input.serviceType !== "oob_management" && value === 99) {
        blockingConflicts.push(errorFinding("vlan_reserved", `VLAN ${value} é reservada (${range.label}).`, { vlan: value, field }));
      }
    }

    const used = await getUsedIds({
      tenantId: input.tenantId,
      siteCode: input.siteCode,
      deviceId: scopeDevice ? input.deviceId : null,
      idType,
    });
    if (used.includes(value)) {
      blockingConflicts.push(errorFinding("id_occupied", `${field} ${value} já está em uso.`, { field, value, idType }));
    }
  };

  await validateNumeric("vlan", input.vlan, "vlan", true);
  await validateNumeric("subinterfaceId", input.subinterfaceId, "subinterface", true);
  await validateNumeric("l2vcId", input.l2vcId, "l2vc", false);
  await validateNumeric("vsiId", input.vsiId, "vsi", false);

  if (input.serviceType === "inter_site_link" && input.vlan != null) {
    const range = getVlanRangeByKey("inter_site");
    if (range && (input.vlan < range.rangeStart || input.vlan > range.rangeEnd)) {
      warnings.push(warning("inter_site_vlan_range", "Enlaces inter-site devem usar VLAN 100-199.", { vlan: input.vlan }));
    }
  }

  return {
    ok: blockingConflicts.length === 0,
    warnings,
    blockingConflicts,
    fieldOrigins,
  };
}

export async function refreshAndSuggest(input: {
  tenantId: number;
  siteCode?: string | null;
  deviceId?: number | null;
  serviceType: string;
  parentInterface?: string | null;
}) {
  await refreshConfigGeneratorIdInventory({
    tenantId: input.tenantId,
    deviceId: input.deviceId,
    siteCode: input.siteCode,
  });
  return suggestNextId(input);
}

export function listConfigGeneratorIdRangesCatalog() {
  return {
    version: CONFIG_GENERATOR_ID_RANGES_VERSION,
    ranges: listBuiltinIdRanges(),
  };
}

export {
  refreshConfigGeneratorIdInventory,
  listConfigGeneratorDiscoveredIds,
};
