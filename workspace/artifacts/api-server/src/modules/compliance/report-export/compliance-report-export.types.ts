import type { ComplianceJob, ComplianceFinding } from "@workspace/db";

export type ReportFormat = "markdown" | "json" | "csv";

export interface ComplianceReportFilters {
  status?: string;
  severity?: string;
  context?: string;
  source?: string;
  confidence?: string;
  operationalCategory?: string;
  freshness?: string;
  latestJobOnly?: boolean;
  actionableOnly?: boolean;
}

export interface ComplianceReportMetadata {
  jobId: number;
  deviceId: number;
  deviceHostname: string;
  policyProfileName: string;
  status: string;
  startedAt: string | null;
  completedAt: string | null;
  generatedAt: string;
  generatedBy: string | null;
  format: ReportFormat;
}

export interface ComplianceReportSummary {
  totalFindings: number;
  byStatus: Record<string, number>;
  bySeverity: Record<string, number>;
  byOperationalCategory: Record<string, number>;
  byFreshness: Record<string, number>;
  bySourceConfidence: Record<string, number>;
  passCount: number;
  failCount: number;
}

export interface ComplianceReportGroup {
  ruleId: string;
  ruleName: string;
  policyName: string;
  context: string;
  severity: string;
  operationalCategory: string;
  freshness: string;
  message: string;
  count: number;
  sampleFindingIds: number[];
}

export interface ComplianceReportFinding {
  id: number;
  jobId: number;
  deviceId: number;
  deviceHostname: string;
  status: string;
  severity: string;
  context: string;
  operationalCategory: string;
  freshness: string;
  source: string;
  confidence: string;
  ruleId: string;
  ruleName: string;
  objectType: string;
  objectName: string;
  message: string;
  recommendation: string;
  evidenceSanitized?: string;
  createdAt: string;
}

export interface ComplianceReportJson {
  metadata: ComplianceReportMetadata;
  summary: ComplianceReportSummary;
  filters: ComplianceReportFilters;
  groups: ComplianceReportGroup[];
  findings: ComplianceReportFinding[];
  sanitization: {
    enabled: boolean;
    rulesApplied: string[];
  };
}
