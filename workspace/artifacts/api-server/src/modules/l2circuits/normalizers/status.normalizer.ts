import type { L2Status, NormalizedL2Circuit, NormalizedL2Status, ParsedL2Circuit } from "../l2circuits.types.js";

export function normalizeL2CircuitStatus(parsed: ParsedL2Circuit): NormalizedL2Status {
  const adminStatus = normalizeAdminStatus(parsed.adminStatus);
  const operStatus = normalizeOperStatus(parsed.operStatus, adminStatus);
  const pwStatus = parsed.pwStatus ? normalizePwStatus(parsed.pwStatus) : undefined;

  return {
    adminStatus,
    operStatus,
    pwStatus,
  };
}

export function normalizeAdminStatus(status?: string): L2Status {
  if (!status) return "UNKNOWN";

  const normalized = status.toLowerCase().trim();

  if (normalized === "up" || normalized === "enable") return "UP";
  if (normalized === "down" || normalized === "disable" || normalized === "admin-down") return "DOWN";

  return "UNKNOWN";
}

export function normalizeOperStatus(status?: string, adminStatus?: L2Status): L2Status {
  if (!status) {
    if (adminStatus === "DOWN") return "DOWN";
    return "CONFIG_ONLY";
  }

  const normalized = status.toLowerCase().trim();

  if (normalized === "up" || normalized === "active") return "UP";
  if (normalized === "down" || normalized === "inactive") {
    if (adminStatus === "UP") return "DOWN";
    return "DOWN";
  }

  return "UNKNOWN";
}

export function normalizePwStatus(status: string): L2Status {
  const normalized = status.toLowerCase().trim();

  if (normalized === "up" || normalized.startsWith("up")) return "UP";
  if (normalized === "down" || normalized.startsWith("down")) return "PARTIAL";
  if (normalized === "unknown" || normalized.includes("unknown")) return "UNKNOWN";

  return "UNKNOWN";
}

export function normalizeCircuits(parsed: ParsedL2Circuit[]): NormalizedL2Circuit[] {
  return parsed.map((circuit) => {
    const status = normalizeL2CircuitStatus(circuit);
    return {
      ...circuit,
      adminStatus: status.adminStatus,
      operStatus: status.operStatus,
      findings: [],
    };
  });
}
