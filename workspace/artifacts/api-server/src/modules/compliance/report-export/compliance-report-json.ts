import type { ComplianceReportJson } from "./compliance-report-export.types.js";

export function exportComplianceReportJson(report: ComplianceReportJson): string {
  return JSON.stringify(report, null, 2);
}
