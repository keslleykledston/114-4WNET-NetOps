export class OperationalPilotError extends Error {
  readonly statusCode = 403;
  constructor(message: string) {
    super(message);
    this.name = "OperationalPilotError";
  }
}

export function getSnmpFastPilotDeviceIds(): Set<number> {
  const raw = process.env["SNMP_FAST_PILOT_DEVICE_IDS"]?.trim() || "1";
  const ids = raw
    .split(",")
    .map((part) => Number(part.trim()))
    .filter((id) => Number.isFinite(id) && id > 0);
  return new Set(ids.length > 0 ? ids : [1]);
}

export function assertSnmpFastPilotDevice(deviceId: number): void {
  if (!getSnmpFastPilotDeviceIds().has(deviceId)) {
    throw new OperationalPilotError(
      `Device ${deviceId} is not in SNMP_FAST pilot allowlist (SNMP_FAST_PILOT_DEVICE_IDS).`,
    );
  }
}
