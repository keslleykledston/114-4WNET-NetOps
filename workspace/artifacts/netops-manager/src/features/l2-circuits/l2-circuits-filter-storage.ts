import { DEFAULT_L2_FILTERS, FILTER_ALL, type L2CircuitFilters } from "./l2-circuits-utils";

const STORAGE_PREFIX = "netops:l2-circuits-filters";

export function l2FiltersStorageKey(userId?: number | null) {
  return `${STORAGE_PREFIX}:${userId ?? "anonymous"}`;
}

export function loadL2CircuitFilters(userId?: number | null): L2CircuitFilters {
  if (typeof window === "undefined") return DEFAULT_L2_FILTERS;

  try {
    const raw = localStorage.getItem(l2FiltersStorageKey(userId));
    if (!raw) return DEFAULT_L2_FILTERS;

    const parsed = JSON.parse(raw) as Partial<L2CircuitFilters>;
    return {
      device: typeof parsed.device === "string" ? parsed.device : FILTER_ALL,
      circuitType: typeof parsed.circuitType === "string" ? parsed.circuitType : FILTER_ALL,
      status: typeof parsed.status === "string" ? parsed.status : FILTER_ALL,
      vlan: typeof parsed.vlan === "string" ? parsed.vlan : "",
      vcId: typeof parsed.vcId === "string" ? parsed.vcId : "",
      peerIp: typeof parsed.peerIp === "string" ? parsed.peerIp : "",
      showHealthy: parsed.showHealthy === true,
      showStaleInventory: parsed.showStaleInventory === true,
    };
  } catch {
    return DEFAULT_L2_FILTERS;
  }
}

export function saveL2CircuitFilters(filters: L2CircuitFilters, userId?: number | null) {
  if (typeof window === "undefined") return;
  localStorage.setItem(l2FiltersStorageKey(userId), JSON.stringify(filters));
}

export function clearL2CircuitFilters(userId?: number | null) {
  if (typeof window === "undefined") return;
  localStorage.removeItem(l2FiltersStorageKey(userId));
}
