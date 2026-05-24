import type { L2Circuit } from "./l2-circuits-api";
import { circuitExportRow } from "./l2-circuits-utils";

const CSV_HEADERS = [
  "device",
  "type",
  "status",
  "vlan",
  "vc_id",
  "vsi_name",
  "local_interface",
  "peer_ip",
  "findings_count",
  "last_seen",
] as const;

function csvEscape(value: string): string {
  if (/[",\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export function buildL2CircuitsCsv(
  circuits: L2Circuit[],
  deviceNameById: Map<number, string>,
): string {
  const lines = [CSV_HEADERS.join(",")];

  for (const circuit of circuits) {
    const row = circuitExportRow(circuit, deviceNameById);
    lines.push(CSV_HEADERS.map((key) => csvEscape(row[key])).join(","));
  }

  return lines.join("\n");
}

export function downloadL2CircuitsCsv(
  circuits: L2Circuit[],
  deviceNameById: Map<number, string>,
) {
  const csv = buildL2CircuitsCsv(circuits, deviceNameById);
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
  link.href = url;
  link.download = `l2-circuits-${stamp}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}
