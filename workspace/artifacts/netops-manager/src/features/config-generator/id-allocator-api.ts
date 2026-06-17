import { useMutation, useQuery } from "@tanstack/react-query";

export type ConfigGeneratorIdSuggestionItem = {
  value: number;
  range?: string;
  rangeKey?: string;
  reason: string;
  confidence: "high" | "medium" | "low";
  origin: "id_allocator";
  scope?: "tenant" | "device" | "site";
  alternatives?: number[];
};

export type ConfigGeneratorIdSuggestResponse = {
  tenantId: number;
  serviceType: string;
  suggestions: {
    vlan?: ConfigGeneratorIdSuggestionItem;
    subinterfaceId?: ConfigGeneratorIdSuggestionItem;
    l2vcId?: ConfigGeneratorIdSuggestionItem;
    vsiId?: ConfigGeneratorIdSuggestionItem;
  };
  usedIdsSummary: Partial<Record<"vlan" | "subinterface" | "l2vc" | "vsi", number[]>>;
  warnings: Array<{ code: string; message: string }>;
  blockingConflicts: Array<{ code: string; message: string }>;
};

export type ConfigGeneratorIdInventoryResponse = {
  summary: Partial<Record<"vlan" | "subinterface" | "l2vc" | "vsi", number[]>>;
};

export type ConfigGeneratorIdRangesResponse = {
  version: string;
  ranges: Array<{ key: string; label: string; rangeStart: number; rangeEnd: number }>;
};

const jsonHeaders = { "content-type": "application/json" };

async function parseJson<T>(res: Response): Promise<T> {
  const text = await res.text();
  if (!res.ok) {
    const payload = text ? JSON.parse(text) : {};
    throw Object.assign(new Error(payload.error ?? `HTTP ${res.status}`), { data: payload });
  }
  return text ? JSON.parse(text) : ({} as T);
}

export function fetchConfigGeneratorIdRanges() {
  return fetch("/api/config-generator/id-ranges").then((res) => parseJson<ConfigGeneratorIdRangesResponse>(res));
}

export function fetchConfigGeneratorIdInventory(params: {
  tenantId: number;
  deviceId?: number | null;
  siteCode?: string | null;
  idType?: string | null;
}) {
  const query = new URLSearchParams({ tenantId: String(params.tenantId) });
  if (params.deviceId != null) query.set("deviceId", String(params.deviceId));
  if (params.siteCode) query.set("siteCode", params.siteCode);
  if (params.idType) query.set("idType", params.idType);
  return fetch(`/api/config-generator/id-inventory?${query}`).then((res) => parseJson<ConfigGeneratorIdInventoryResponse>(res));
}

export function suggestConfigGeneratorIds(body: {
  tenantId: number;
  deviceId?: number | null;
  serviceType: string;
  siteCode?: string | null;
  parentInterface?: string | null;
}) {
  return fetch("/api/config-generator/id-allocator/suggest", {
    method: "POST",
    headers: jsonHeaders,
    body: JSON.stringify(body),
  }).then((res) => parseJson<ConfigGeneratorIdSuggestResponse>(res));
}

export function validateConfigGeneratorIds(body: Record<string, unknown>) {
  return fetch("/api/config-generator/id-allocator/validate", {
    method: "POST",
    headers: jsonHeaders,
    body: JSON.stringify(body),
  }).then((res) => parseJson<{ ok: boolean; warnings: unknown[]; blockingConflicts: unknown[] }>(res));
}

export function refreshConfigGeneratorIdInventory(body: {
  tenantId: number;
  deviceId?: number | null;
  siteCode?: string | null;
}) {
  return fetch("/api/config-generator/id-inventory/refresh", {
    method: "POST",
    headers: jsonHeaders,
    body: JSON.stringify(body),
  }).then((res) => parseJson<{ ok: boolean; inserted: number; updated: number; total: number; message: string }>(res));
}

export function useConfigGeneratorIdInventory(
  tenantId: number | null,
  deviceId: number | null,
  enabled = true,
) {
  return useQuery({
    queryKey: ["config-generator", "id-inventory", tenantId, deviceId],
    enabled: enabled && tenantId != null,
    queryFn: () => fetchConfigGeneratorIdInventory({ tenantId: tenantId!, deviceId }),
  });
}

export function useConfigGeneratorIdSuggest(
  tenantId: number | null,
  deviceId: number | null,
  serviceType: string | null,
  enabled = true,
) {
  return useQuery({
    queryKey: ["config-generator", "id-suggest", tenantId, deviceId, serviceType],
    enabled: enabled && tenantId != null && serviceType != null,
    queryFn: () => suggestConfigGeneratorIds({
      tenantId: tenantId!,
      deviceId,
      serviceType: serviceType!,
    }),
  });
}

export function useRefreshConfigGeneratorIdInventory() {
  return useMutation({
    mutationFn: refreshConfigGeneratorIdInventory,
  });
}

export function useValidateConfigGeneratorIds() {
  return useMutation({
    mutationFn: validateConfigGeneratorIds,
  });
}
