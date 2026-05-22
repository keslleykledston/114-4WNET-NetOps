import type { Device } from "@workspace/db";

export type ExportFormat = "csv" | "xlsx" | "json";

interface ExportDevice {
  id: number;
  hostname: string;
  ipAddress: string;
  vendor: string;
  platform: string;
  username: string;
  site?: string | null;
  role?: string | null;
  snmpCommunity?: string | null;
  lastSeen?: string | null;
  status?: string | null;
  createdAt: string;
}

function deviceToExportFormat(device: Device): ExportDevice {
  return {
    id: device.id,
    hostname: device.hostname,
    ipAddress: device.ipAddress,
    vendor: device.vendor,
    platform: device.platform,
    username: device.username,
    site: device.site,
    role: device.role,
    snmpCommunity: device.snmpCommunity,
    lastSeen: device.lastSeen?.toISOString() ?? null,
    status: device.status,
    createdAt: device.createdAt.toISOString(),
  };
}

export function exportToCSV(devices: Device[]): Buffer {
  const headers = [
    "id",
    "hostname",
    "ipAddress",
    "vendor",
    "platform",
    "username",
    "site",
    "role",
    "snmpCommunity",
    "lastSeen",
    "status",
    "createdAt",
  ];

  const rows = devices.map((d) => {
    const exp = deviceToExportFormat(d);
    return [
      exp.id,
      exp.hostname,
      exp.ipAddress,
      exp.vendor,
      exp.platform,
      exp.username,
      exp.site || "",
      exp.role || "",
      exp.snmpCommunity || "",
      exp.lastSeen || "",
      exp.status || "",
      exp.createdAt,
    ];
  });

  const csv = [headers, ...rows].map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(",")).join("\n");

  return Buffer.from(csv, "utf-8");
}

// XLSX export requires xlsx package - deferred to v0.3.2
// For now, only CSV and JSON supported

export function exportToJSON(
  devices: Device[],
  exportedBy: string
): Buffer {
  const data = {
    exported_at: new Date().toISOString(),
    exported_by: exportedBy,
    count: devices.length,
    devices: devices.map((d) => deviceToExportFormat(d)),
  };

  return Buffer.from(JSON.stringify(data, null, 2), "utf-8");
}

export function getExportFilename(format: ExportFormat, timestamp = new Date()): string {
  const ts = timestamp.toISOString().split("T")[0];
  const ext = format === "json" ? "json" : "csv";
  return `devices-export-${ts}.${ext}`;
}

export function getContentType(format: ExportFormat): string {
  switch (format) {
    case "json":
      return "application/json";
    case "csv":
    default:
      return "text/csv;charset=utf-8";
  }
}
