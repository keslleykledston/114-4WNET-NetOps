export type ImportFormat = "csv" | "xlsx" | "txt";
export type ImportAction = "create" | "update" | "skip" | "invalid";
export type ImportMode = "create_only" | "update_existing" | "upsert";

export interface RawDeviceRow {
  [key: string]: string | number | undefined;
}

export interface ParsedDevice {
  hostname: string;
  ipAddress?: string;
  vendor?: string;
  platform?: string;
  role?: string;
  site?: string;
  status?: string;
  sshPort?: number;
  snmpVersion?: string;
  notes?: string;
}

export interface ImportItem {
  rowNumber: number;
  action: ImportAction;
  parsed?: ParsedDevice;
  matchedDeviceId?: number;
  errors: string[];
  warnings: string[];
}

export interface ImportSummary {
  totalRows: number;
  validRows: number;
  invalidRows: number;
  toCreate: number;
  toUpdate: number;
  toSkip: number;
  duplicates: number;
  warnings: number;
}

export interface ImportPreviewResponse {
  summary: ImportSummary;
  items: ImportItem[];
  previewToken: string;
  fileHash: string;
  createdAt: string;
  expiresAt: string;
}

export interface ImportApplyRequest {
  previewToken: string;
  mode: ImportMode;
}

export interface ImportApplyResponse {
  success: boolean;
  summary: {
    created: number;
    updated: number;
    skipped: number;
    failed: number;
  };
  errors: Array<{ rowNumber: number; message: string }>;
  reportId?: string;
}

export interface FieldAlias {
  [alias: string]: keyof ParsedDevice;
}

export const FIELD_ALIASES: FieldAlias = {
  // hostname aliases
  hostname: "hostname",
  name: "hostname",
  device: "hostname",
  device_name: "hostname",

  // IP aliases
  ip: "ipAddress",
  ip_address: "ipAddress",
  management_ip: "ipAddress",
  mgmt_ip: "ipAddress",

  // vendor aliases
  vendor: "vendor",
  manufacturer: "vendor",

  // platform aliases
  platform: "platform",
  os: "platform",
  device_os: "platform",

  // role aliases
  role: "role",
  device_role: "role",

  // site aliases
  site: "site",
  location: "site",

  // other
  status: "status",
  ssh_port: "sshPort",
  snmp_version: "snmpVersion",
  notes: "notes",
  description: "notes",
};
