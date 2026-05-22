import type { RawDeviceRow, ParsedDevice } from "./device-import.types.js";

const VALID_STATUSES = ["unknown", "active", "inactive", "fail", "pending"];
const VALID_VENDORS = ["cisco", "huawei", "juniper", "arista", "nokia", "unknown"];
const VALID_ROLES = ["customer", "provider", "ix", "cdn"];
const VALID_SNMP_VERSIONS = ["1", "2c", "3"];

function isValidIP(ip: string | undefined): boolean {
  if (!ip) return true; // optional field
  const parts = ip.split(".");
  if (parts.length !== 4) return false;
  return parts.every((p) => {
    const num = parseInt(p, 10);
    return num >= 0 && num <= 255 && !isNaN(num);
  });
}

function isValidPort(port: number | undefined): boolean {
  if (!port) return true; // optional
  return port >= 1 && port <= 65535;
}

export interface ValidationResult {
  valid: boolean;
  parsed?: ParsedDevice;
  errors: string[];
  warnings: string[];
}

export function validateDeviceRow(row: RawDeviceRow): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const parsed: Partial<ParsedDevice> = {};

  // hostname (required)
  if (!row.hostname) {
    errors.push("hostname is required");
  } else {
    const hostname = String(row.hostname).trim();
    if (hostname.length < 1) {
      errors.push("hostname cannot be empty");
    } else if (hostname.length > 255) {
      errors.push("hostname too long (max 255 chars)");
    } else {
      parsed.hostname = hostname;
    }
  }

  // ipAddress (optional but must be valid if provided)
  if (row.ipAddress) {
    const ip = String(row.ipAddress).trim();
    if (!isValidIP(ip)) {
      errors.push(`invalid IP address: ${ip}`);
    } else {
      parsed.ipAddress = ip;
    }
  }

  // vendor (optional, normalize)
  if (row.vendor) {
    const vendor = String(row.vendor).toLowerCase().trim();
    if (VALID_VENDORS.includes(vendor)) {
      parsed.vendor = vendor;
    } else {
      warnings.push(`unknown vendor: ${vendor}, using as-is`);
      parsed.vendor = vendor;
    }
  }

  // platform (optional)
  if (row.platform) {
    parsed.platform = String(row.platform).trim();
  }

  // role (optional, normalize)
  if (row.role) {
    const role = String(row.role).toLowerCase().trim();
    if (VALID_ROLES.includes(role)) {
      parsed.role = role;
    } else {
      warnings.push(`unknown role: ${role}, skipping`);
    }
  }

  // site (optional)
  if (row.site) {
    parsed.site = String(row.site).trim();
  }

  // status (optional, validate)
  if (row.status) {
    const status = String(row.status).toLowerCase().trim();
    if (VALID_STATUSES.includes(status)) {
      parsed.status = status;
    } else {
      warnings.push(`unknown status: ${status}, skipping`);
    }
  }

  // sshPort (optional, validate)
  if (row.sshPort) {
    const port = parseInt(String(row.sshPort), 10);
    if (!isNaN(port) && isValidPort(port)) {
      parsed.sshPort = port;
    } else {
      warnings.push(`invalid SSH port: ${row.sshPort}, skipping`);
    }
  }

  // snmpVersion (optional, validate)
  if (row.snmpVersion) {
    const version = String(row.snmpVersion).trim();
    if (VALID_SNMP_VERSIONS.includes(version)) {
      parsed.snmpVersion = version;
    } else {
      warnings.push(`invalid SNMP version: ${version}, skipping`);
    }
  }

  // notes (optional)
  if (row.notes) {
    parsed.notes = String(row.notes).trim();
  }

  return {
    valid: errors.length === 0,
    parsed: parsed as ParsedDevice,
    errors,
    warnings,
  };
}

export function validateParsedDevice(device: ParsedDevice): string[] {
  const errors: string[] = [];

  if (!device.hostname) {
    errors.push("hostname required");
  }
  if (device.ipAddress && !isValidIP(device.ipAddress)) {
    errors.push("invalid IP");
  }
  if (device.sshPort && !isValidPort(device.sshPort)) {
    errors.push("invalid SSH port");
  }

  return errors;
}
