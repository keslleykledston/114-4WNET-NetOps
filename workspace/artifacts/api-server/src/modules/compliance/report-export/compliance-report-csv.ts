import type { ComplianceReportFinding, ComplianceReportGroup } from "./compliance-report-export.types.js";

function escapeCsvField(field: string | null | undefined): string {
  if (field === null || field === undefined) return "";
  const str = String(field);
  if (str.includes(",") || str.includes('"') || str.includes("\n")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function exportFindingsCsv(findings: ComplianceReportFinding[]): string {
  const headers = [
    "jobId",
    "deviceId",
    "deviceHostname",
    "status",
    "severity",
    "context",
    "operationalCategory",
    "freshness",
    "source",
    "confidence",
    "ruleId",
    "ruleName",
    "objectType",
    "objectName",
    "message",
    "recommendation",
    "createdAt",
  ];

  const rows: string[] = [headers.map(escapeCsvField).join(",")];

  for (const finding of findings) {
    const row = [
      String(finding.jobId),
      String(finding.deviceId),
      finding.deviceHostname,
      finding.status,
      finding.severity,
      finding.context,
      finding.operationalCategory,
      finding.freshness,
      finding.source,
      finding.confidence,
      finding.ruleId,
      finding.ruleName,
      finding.objectType,
      finding.objectName,
      finding.message,
      finding.recommendation,
      finding.createdAt,
    ];
    rows.push(row.map((f) => escapeCsvField(f || "")).join(","));
  }

  return rows.join("\n");
}

export function exportGroupsCsv(groups: ComplianceReportGroup[]): string {
  const headers = [
    "ruleId",
    "ruleName",
    "policyName",
    "context",
    "severity",
    "operationalCategory",
    "freshness",
    "message",
    "count",
    "sampleFindingIds",
  ];

  const rows: string[] = [headers.map(escapeCsvField).join(",")];

  for (const group of groups) {
    const row = [
      group.ruleId,
      group.ruleName,
      group.policyName,
      group.context,
      group.severity,
      group.operationalCategory,
      group.freshness,
      group.message,
      String(group.count),
      group.sampleFindingIds.join("|"),
    ];
    rows.push(row.map((f) => escapeCsvField(f || "")).join(","));
  }

  return rows.join("\n");
}
