export class SnmpCredentialsNotConfiguredError extends Error {
  static readonly code = "SNMP_CREDENTIALS_NOT_CONFIGURED";
  readonly statusCode = 400;
  readonly errorCode = SnmpCredentialsNotConfiguredError.code;

  constructor(deviceId: number) {
    super(`SNMP credentials not configured for device ${deviceId}`);
    this.name = "SnmpCredentialsNotConfiguredError";
  }
}
