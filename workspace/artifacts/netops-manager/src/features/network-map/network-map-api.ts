/** SNMP_FAST live traffic poll interval — avoid hammering POST /collect. */
export const SNMP_FAST_POLL_MS = 5_000;

export type OperationalInterfaceDto = {
  ifIndex: number;
  ifName: string;
  ifDescr: string | null;
  ifAlias: string | null;
  adminStatus: string;
  operStatus: string;
  ifHighSpeedMbps: number | null;
  ifSpeedBps: number | null;
  hcInOctets: string | null;
  hcOutOctets: string | null;
  collectedAt: string;
};

export type OperationalInterfacesResponse = {
  deviceId: number;
  interfaceCount: number;
  interfaces: OperationalInterfaceDto[];
  collectedAt: string | null;
  freshness: string;
};

export class ApiHttpError extends Error {
  readonly status: number;
  readonly code?: string;

  constructor(status: number, message: string, code?: string) {
    super(message);
    this.name = "ApiHttpError";
    this.status = status;
    this.code = code;
  }
}

function formatApiError(status: number, data: Record<string, unknown> | null): ApiHttpError {
  const code = typeof data?.code === "string" ? data.code : undefined;
  if (status === 502) {
    return new ApiHttpError(
      status,
      "Serviço SNMP indisponível (502). O coletor pode estar sobrecarregado — aguarde e tente novamente.",
      code,
    );
  }
  if (status === 503) {
    if (code === "SNMP_FAST_DISABLED") {
      return new ApiHttpError(
        status,
        "Coleta SNMP_FAST desabilitada (NETOPS_SNMP_REAL_ENABLED=false).",
        code,
      );
    }
    const message = typeof data?.message === "string"
      ? data.message
      : typeof data?.error === "string"
        ? data.error
        : "Coleta SNMP indisponível (503).";
    return new ApiHttpError(status, message, code);
  }
  if (status === 429) {
    const retryAfterSec = typeof data?.retryAfterSec === "number" ? data.retryAfterSec : undefined;
    return new ApiHttpError(
      status,
      retryAfterSec != null
        ? `Limite de coleta SNMP atingido. Aguarde ${retryAfterSec}s.`
        : "Limite de coleta SNMP atingido. Aguarde antes de tentar novamente.",
      code ?? "SNMP_FAST_RATE_LIMIT",
    );
  }
  const fallback = typeof data?.error === "string"
    ? data.error
    : typeof data?.message === "string"
      ? data.message
      : `Falha na requisição (${status})`;
  return new ApiHttpError(status, fallback, code);
}

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    credentials: "include",
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
    ...init,
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    throw formatApiError(response.status, data as Record<string, unknown> | null);
  }
  return data as T;
}

export async function collectSnmpFastInterfaces(deviceId: number): Promise<{ status: string; interfaceCount?: number }> {
  return apiFetch("/api/operational/interfaces/collect", {
    method: "POST",
    body: JSON.stringify({ deviceId }),
  });
}

type CollectCoordinatorState = {
  lastCollectAt: number;
  inFlight: Promise<void> | null;
};

const collectCoordinator = new Map<number, CollectCoordinatorState>();

/**
 * Trigger SNMP_FAST POST collect at most once per SNMP_FAST_POLL_MS per device.
 * Concurrent callers share the same in-flight request.
 */
export async function ensureSnmpFastCollect(deviceId: number): Promise<{ triggered: boolean }> {
  const now = Date.now();
  const state = collectCoordinator.get(deviceId) ?? { lastCollectAt: 0, inFlight: null };

  if (state.inFlight) {
    await state.inFlight.catch(() => undefined);
    return { triggered: false };
  }

  if (now - state.lastCollectAt < SNMP_FAST_POLL_MS) {
    return { triggered: false };
  }

  state.lastCollectAt = now;
  const run = async () => {
    try {
      await collectSnmpFastInterfaces(deviceId);
    } catch (err) {
      if (err instanceof ApiHttpError && (err.status === 502 || err.status === 503)) {
        throw err;
      }
      // 429 / pilot — fall back to last stored GET sample
    }
  };
  state.inFlight = run().finally(() => {
    state.inFlight = null;
    collectCoordinator.set(deviceId, state);
  });
  collectCoordinator.set(deviceId, state);

  await state.inFlight;
  return { triggered: true };
}

export async function fetchOperationalInterfaces(deviceId: number): Promise<OperationalInterfacesResponse> {
  return apiFetch(`/api/operational/interfaces?device_id=${deviceId}`);
}

export function findOperationalInterface(
  payload: OperationalInterfacesResponse,
  ifName: string,
): OperationalInterfaceDto | undefined {
  const target = ifName.trim().toLowerCase();
  return payload.interfaces.find(
    (iface) => iface.ifName.toLowerCase() === target || (iface.ifDescr?.toLowerCase() === target),
  );
}

export function capacityMbpsFromInterface(iface: OperationalInterfaceDto | undefined): number {
  if (!iface) return 1000;
  if (iface.ifHighSpeedMbps != null && iface.ifHighSpeedMbps > 0) return iface.ifHighSpeedMbps;
  if (iface.ifSpeedBps != null && iface.ifSpeedBps > 0) return iface.ifSpeedBps / 1_000_000;
  return 1000;
}

export function computeTrafficMbps(
  prev: { inOctets: bigint; outOctets: bigint; at: number } | null,
  next: { inOctets: bigint; outOctets: bigint; at: number },
): { txMbps: number; rxMbps: number } {
  if (!prev) return { txMbps: 0, rxMbps: 0 };
  const dtSec = (next.at - prev.at) / 1000;
  if (dtSec <= 0.5) return { txMbps: 0, rxMbps: 0 };

  const txDelta = next.outOctets - prev.outOctets;
  const rxDelta = next.inOctets - prev.inOctets;
  if (txDelta < 0n || rxDelta < 0n) return { txMbps: 0, rxMbps: 0 };

  return {
    txMbps: Number(txDelta) * 8 / dtSec / 1_000_000,
    rxMbps: Number(rxDelta) * 8 / dtSec / 1_000_000,
  };
}

export function counterSample(iface: OperationalInterfaceDto): {
  inOctets: bigint;
  outOctets: bigint;
  at: number;
} {
  return {
    inOctets: BigInt(iface.hcInOctets ?? "0"),
    outOctets: BigInt(iface.hcOutOctets ?? "0"),
    at: new Date(iface.collectedAt).getTime(),
  };
}
