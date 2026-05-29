import type { Device } from "@workspace/db";
import { decrypt } from "../../lib/crypto.js";
import type { SSHConfig } from "../../lib/ssh.js";

export const DEVICE_CREDENTIALS_NOT_CONFIGURED = "DEVICE_CREDENTIALS_NOT_CONFIGURED";

export class L2DeviceCredentialsError extends Error {
  readonly code = DEVICE_CREDENTIALS_NOT_CONFIGURED;

  constructor(message: string) {
    super(message);
    this.name = "L2DeviceCredentialsError";
  }
}

export function resolveDeviceSshConfig(device: Device): SSHConfig {
  if (!device.ipAddress?.trim()) {
    throw new L2DeviceCredentialsError("Device IP address is not configured");
  }

  if (!device.username?.trim()) {
    throw new L2DeviceCredentialsError("Device SSH username is not configured");
  }

  if (!device.passwordEncrypted?.trim()) {
    throw new L2DeviceCredentialsError("Device SSH password is not configured");
  }

  let password: string;
  try {
    password = decrypt(device.passwordEncrypted);
  } catch {
    throw new L2DeviceCredentialsError("Device SSH password could not be decrypted");
  }

  if (!password.trim()) {
    throw new L2DeviceCredentialsError("Device SSH password is not configured");
  }

  return {
    host: device.ipAddress.trim(),
    port: device.sshPort ?? 22,
    username: device.username.trim(),
    password,
  };
}
