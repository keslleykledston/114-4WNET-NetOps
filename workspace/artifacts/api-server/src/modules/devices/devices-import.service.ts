import { createHash } from "crypto";
import type { Device } from "@workspace/db";

export interface DeviceImportRow {
  hostname: string;
  ipAddress: string;
  vendor: string;
  platform: string;
  username: string;
  password?: string;
  site?: string;
  role?: string;
  snmpCommunity?: string;
}

export interface ImportWarning {
  row: number;
  field: string;
  message: string;
}

export interface DuplicateEntry {
  hostname: string;
  ipAddress: string;
  reason: "hostname_exists" | "ip_exists" | "both_exist";
}

export interface DeviceImportPreview {
  total: number;
  valid: number;
  warnings: ImportWarning[];
  duplicates: DuplicateEntry[];
  preview: Array<DeviceImportRow & { will_insert: boolean }>;
  fileHash: string;
}

const VALID_VENDORS = ["huawei", "cisco", "juniper", "arista", "nokia", "unknown"];
const VALID_ROLES = ["provider", "customer", "ix", "cdn"];

function isValidIP(ip: string): boolean {
  const ipv4Regex = /^(\d{1,3}\.){3}\d{1,3}$/;
  if (!ipv4Regex.test(ip)) return false;
  const parts = ip.split(".");
  return parts.every((p) => {
    const num = parseInt(p, 10);
    return num >= 0 && num <= 255;
  });
}

function parseCSV(content: string): string[][] {
  const lines = content.split("\n").filter((l) => l.trim());
  const delimiter = detectDelimiter(content);
  return lines.map((line) => line.split(delimiter).map((c) => c.trim()));
}

function detectDelimiter(content: string): string {
  const sample = content.split("\n").slice(0, 3).join("\n");
  const commas = (sample.match(/,/g) || []).length;
  const semis = (sample.match(/;/g) || []).length;
  const tabs = (sample.match(/\t/g) || []).length;
  if (semis > commas && semis > tabs) return ";";
  if (tabs > commas && tabs > semis) return "\t";
  return ",";
}

// XLSX parsing deferred to v0.3.2 - requires xlsx dependency

export async function parseDeviceImportFile(
  buffer: Buffer,
  filename: string
): Promise<{ rows: DeviceImportRow[]; warnings: ImportWarning[] }> {
  let rawRows: string[][] = [];

  if (filename.endsWith(".csv") || filename.endsWith(".txt")) {
    rawRows = parseCSV(buffer.toString("utf-8"));
  } else {
    throw new Error("Unsupported file format. Use .csv or .txt");
  }

  if (rawRows.length < 2) {
    throw new Error("File must have header row and at least 1 data row");
  }

  const headers = rawRows[0].map((h) => h.toLowerCase());
  const requiredCols = ["hostname", "ipaddress", "vendor", "platform", "username"];
  const missing = requiredCols.filter((col) => !headers.includes(col));
  if (missing.length > 0) {
    throw new Error(`Missing required columns: ${missing.join(", ")}`);
  }

  const rows: DeviceImportRow[] = [];
  const warnings: ImportWarning[] = [];

  for (let i = 1; i < rawRows.length; i++) {
    const row = rawRows[i];
    if (!row || row.every((c) => !c)) continue; // Skip empty rows

    const record: any = {};
    headers.forEach((header, idx) => {
      record[header] = row[idx] || "";
    });

    const rowNum = i + 1;
    const device: DeviceImportRow = {
      hostname: record.hostname,
      ipAddress: record.ipaddress || record.ip_address || "",
      vendor: record.vendor,
      platform: record.platform,
      username: record.username,
      password: record.password,
      site: record.site,
      role: record.role,
      snmpCommunity: record.snmp_community || record.snmpcommunity,
    };

    // Validate
    if (!device.hostname || device.hostname.length < 1) {
      warnings.push({ row: rowNum, field: "hostname", message: "Empty hostname" });
      continue;
    }
    if (!device.ipAddress || !isValidIP(device.ipAddress)) {
      warnings.push({ row: rowNum, field: "ipAddress", message: "Invalid IP address" });
      continue;
    }
    if (!VALID_VENDORS.includes(device.vendor.toLowerCase())) {
      warnings.push({
        row: rowNum,
        field: "vendor",
        message: `Unknown vendor (expected: ${VALID_VENDORS.join(", ")})`,
      });
      // Don't skip, continue with warning
    }
    if (!device.platform || device.platform.length < 1) {
      warnings.push({ row: rowNum, field: "platform", message: "Empty platform" });
      continue;
    }
    if (!device.username || device.username.length < 1) {
      warnings.push({ row: rowNum, field: "username", message: "Empty username" });
      continue;
    }
    if (device.role && !VALID_ROLES.includes(device.role.toLowerCase())) {
      warnings.push({
        row: rowNum,
        field: "role",
        message: `Unknown role (expected: ${VALID_ROLES.join(", ")})`,
      });
      // Don't skip
    }

    // Normalize
    device.vendor = device.vendor.toLowerCase();
    if (device.role) device.role = device.role.toLowerCase();

    rows.push(device);
  }

  return { rows, warnings };
}

export async function previewImport(
  rows: DeviceImportRow[],
  existing: Array<{ hostname: string; ipAddress: string }>
): Promise<Omit<DeviceImportPreview, "fileHash">> {
  const duplicates: DuplicateEntry[] = [];
  const preview: Array<DeviceImportRow & { will_insert: boolean }> = [];

  for (const row of rows) {
    const dupHostname = existing.some((e) => e.hostname === row.hostname);
    const dupIP = existing.some((e) => e.ipAddress === row.ipAddress);

    if (dupHostname || dupIP) {
      duplicates.push({
        hostname: row.hostname,
        ipAddress: row.ipAddress,
        reason: dupHostname && dupIP ? "both_exist" : dupHostname ? "hostname_exists" : "ip_exists",
      });
    }

    preview.push({
      ...row,
      will_insert: !(dupHostname || dupIP),
    });
  }

  return {
    total: rows.length,
    valid: preview.filter((p) => p.will_insert).length,
    warnings: [],
    duplicates,
    preview,
  };
}

export function generateFileHash(buffer: Buffer): string {
  return createHash("sha256").update(buffer).digest("hex");
}
