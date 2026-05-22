import { and, eq } from "drizzle-orm";
import { db } from "@workspace/db";
import {
  complianceJobsTable,
  complianceFindingsTable,
  devicesTable,
} from "@workspace/db";
import { sanitizeEvidenceForExport, SANITIZATION_RULES_APPLIED } from "./compliance-report-sanitizer.js";
import { exportComplianceReportMarkdown } from "./compliance-report-markdown.js";
import { exportComplianceReportJson } from "./compliance-report-json.js";
import { exportFindingsCsv, exportGroupsCsv } from "./compliance-report-csv.js";
import type {
  ReportFormat,
  ComplianceReportFilters,
  ComplianceReportJson,
  ComplianceReportMetadata,
  ComplianceReportSummary,
  ComplianceReportFinding,
  ComplianceReportGroup,
} from "./compliance-report-export.types.js";

export async function buildComplianceReport(
  jobId: number,
  filters?: ComplianceReportFilters
): Promise<ComplianceReportJson> {
  // Fetch job
  const [job] = await db.select().from(complianceJobsTable).where(eq(complianceJobsTable.id, jobId));
  if (!job) throw new Error("Job not found");

  // Fetch device
  const [device] = await db
    .select({ hostname: devicesTable.hostname, id: devicesTable.id })
    .from(devicesTable)
    .where(eq(devicesTable.id, job.deviceId));
  if (!device) throw new Error("Device not found");

  // Fetch findings with optional filters
  let query = db.select().from(complianceFindingsTable).where(eq(complianceFindingsTable.jobId, jobId));

  // Build findings list
  const findings = await query;

  // Apply filters
  let filteredFindings = findings;
  if (filters) {
    filteredFindings = findings.filter((f) => {
      if (filters.status && f.status !== filters.status) return false;
      if (filters.severity && f.severity !== filters.severity) return false;
      if (filters.context && f.context !== filters.context) return false;
      if (filters.source && f.source !== filters.source) return false;
      if (filters.confidence && f.confidence !== filters.confidence) return false;
      if (filters.operationalCategory && f.operationalCategory !== filters.operationalCategory) return false;
      const metadata = (f.metadataJson as Record<string, unknown>) || {};
      if (filters.freshness && (metadata.freshness as string) !== filters.freshness) return false;
      if (filters.actionableOnly && f.status === "pass") return false;
      return true;
    });
  }

  // Build report findings
  const reportFindings: ComplianceReportFinding[] = filteredFindings.map((f) => {
    const metadata = (f.metadataJson as Record<string, unknown>) || {};
    return {
      id: f.id,
      jobId: f.jobId,
      deviceId: f.id,
      deviceHostname: device.hostname,
      status: f.status || "unknown",
      severity: f.severity,
      context: f.context,
      operationalCategory: f.operationalCategory || "unknown",
      freshness: (metadata.freshness as string) || "fresh",
      source: f.source || "unknown",
      confidence: f.confidence || "medium",
      ruleId: f.ruleId || "unknown",
      ruleName: f.ruleName || "unknown",
      objectType: f.objectType || "unknown",
      objectName: f.objectName || "unknown",
      message: f.message || "",
      recommendation: f.recommendation || "",
      evidenceSanitized: f.evidence ? sanitizeEvidenceForExport(f.evidence) : undefined,
      createdAt: f.id.toString(), // Placeholder
    };
  });

  // Build groups
  const groupMap = new Map<string, ComplianceReportGroup>();
  for (const finding of reportFindings) {
    const key = `${finding.ruleId}`;
    if (!groupMap.has(key)) {
      groupMap.set(key, {
        ruleId: finding.ruleId,
        ruleName: finding.ruleName,
        policyName: "", // TODO: fetch from policy
        context: finding.context,
        severity: finding.severity,
        operationalCategory: finding.operationalCategory,
        freshness: finding.freshness,
        message: finding.message,
        count: 0,
        sampleFindingIds: [],
      });
    }
    const group = groupMap.get(key)!;
    group.count++;
    if (group.sampleFindingIds.length < 5) {
      group.sampleFindingIds.push(finding.id);
    }
  }

  // Build summary
  const summary: ComplianceReportSummary = {
    totalFindings: reportFindings.length,
    byStatus: {},
    bySeverity: {},
    byOperationalCategory: {},
    byFreshness: {},
    bySourceConfidence: {},
    passCount: reportFindings.filter((f) => f.status === "pass").length,
    failCount: reportFindings.filter((f) => f.status === "fail").length,
  };

  // Aggregate summary
  for (const finding of reportFindings) {
    summary.byStatus[finding.status] = (summary.byStatus[finding.status] || 0) + 1;
    summary.bySeverity[finding.severity] = (summary.bySeverity[finding.severity] || 0) + 1;
    summary.byOperationalCategory[finding.operationalCategory] =
      (summary.byOperationalCategory[finding.operationalCategory] || 0) + 1;
    summary.byFreshness[finding.freshness] = (summary.byFreshness[finding.freshness] || 0) + 1;
    const sourceConf = `${finding.source}/${finding.confidence}`;
    summary.bySourceConfidence[sourceConf] = (summary.bySourceConfidence[sourceConf] || 0) + 1;
  }

  // Build metadata
  const metadata: ComplianceReportMetadata = {
    jobId: job.id,
    deviceId: job.deviceId,
    deviceHostname: device.hostname,
    policyProfileName: job.policyProfileName || "unknown",
    status: job.status,
    startedAt: job.startedAt?.toISOString() || null,
    completedAt: job.completedAt?.toISOString() || null,
    generatedAt: new Date().toISOString(),
    generatedBy: "system",
    format: "json",
  };

  return {
    metadata,
    summary,
    filters: filters || {},
    groups: Array.from(groupMap.values()),
    findings: reportFindings,
    sanitization: {
      enabled: true,
      rulesApplied: SANITIZATION_RULES_APPLIED,
    },
  };
}

export async function exportComplianceReport(
  jobId: number,
  format: ReportFormat,
  filters?: ComplianceReportFilters
): Promise<{ content: string; contentType: string }> {
  const report = await buildComplianceReport(jobId, filters);

  if (format === "markdown") {
    return {
      content: exportComplianceReportMarkdown(report),
      contentType: "text/markdown; charset=utf-8",
    };
  } else if (format === "json") {
    return {
      content: exportComplianceReportJson(report),
      contentType: "application/json",
    };
  } else if (format === "csv") {
    return {
      content: exportFindingsCsv(report.findings),
      contentType: "text/csv; charset=utf-8",
    };
  }

  throw new Error(`Unsupported format: ${format}`);
}

export function buildReportFilename(jobId: number, format: ReportFormat): string {
  const timestamp = new Date().toISOString().slice(0, 10);
  const ext = format === "json" ? "json" : format === "markdown" ? "md" : "csv";
  return `compliance-job-${jobId}-${timestamp}.${ext}`;
}
