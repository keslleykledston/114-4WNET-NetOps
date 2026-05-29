export class OperationalPilotError extends Error {
  readonly statusCode = 403;
  constructor(message: string) {
    super(message);
    this.name = "OperationalPilotError";
  }
}

const ALLOW_ALL_TOKENS = new Set(["*", "all", "any"]);

/** When false, SNMP_FAST collect/refresh applies to any device id. */
export function isSnmpFastPilotAllowlistEnforced(): boolean {
  const raw = process.env["SNMP_FAST_PILOT_DEVICE_IDS"]?.trim() ?? "";
  if (!raw) {
    return true;
  }
  return !ALLOW_ALL_TOKENS.has(raw.toLowerCase());
}

export function getSnmpFastPilotDeviceIds(): Set<number> {
  const raw = process.env["SNMP_FAST_PILOT_DEVICE_IDS"]?.trim() || "1";
  const ids = raw
    .split(",")
    .map((part) => part.trim())
    .filter((part) => part.length > 0 && !ALLOW_ALL_TOKENS.has(part.toLowerCase()))
    .map((part) => Number(part))
    .filter((id) => Number.isFinite(id) && id > 0);
  return new Set(ids.length > 0 ? ids : [1]);
}

export function assertSnmpFastPilotDevice(deviceId: number): void {
  if (!isSnmpFastPilotAllowlistEnforced()) {
    return;
  }
  if (!getSnmpFastPilotDeviceIds().has(deviceId)) {
    throw new OperationalPilotError(
      `Device ${deviceId} is not in SNMP_FAST pilot allowlist (SNMP_FAST_PILOT_DEVICE_IDS).`,
    );
  }
}
