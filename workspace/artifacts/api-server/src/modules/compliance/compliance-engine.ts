import { desc, eq } from "drizzle-orm";
import {
  collectedConfigsTable,
  complianceFindingsTable,
  complianceJobsTable,
  compliancePoliciesTable,
  db,
  devicesTable,
  discoverySnapshotsTable,
  type CompliancePolicy,
} from "@workspace/db";
import type { DeviceDiscoverySnapshot } from "../netops/device-discovery/discovery.types.js";
import { confidenceFromSnapshot, sourceFromSnapshot } from "./confidence.js";
import type { ComplianceContext, StructuredFinding } from "./compliance-context.js";
import { sanitizeEvidence, compactReference } from "./evidence-builder.js";
import { runBgpChecks } from "./checks/bgp-checks.js";
import { runInterfaceChecks } from "./checks/interface-checks.js";
import { runL2vpnChecks } from "./checks/l2vpn-checks.js";
import { runSecurityChecks } from "./checks/security-checks.js";
import { runVrfChecks } from "./checks/vrf-checks.js";

const DEFAULT_POLICIES: Array<Pick<CompliancePolicy, "name" | "description" | "context" | "severity" | "ruleType" | "rulePattern" | "vendor" | "enabled">> = [
  { name: "Discovery snapshot disponível", description: "Snapshot estruturado existe para compliance.", context: "security", severity: "warning", ruleType: "structured", rulePattern: "structured-snapshot-present", vendor: "huawei", enabled: true },
  { name: "Telnet ausente", description: "Telnet não deve estar habilitado.", context: "security", severity: "high", ruleType: "structured", rulePattern: "huawei-security-telnet-disabled", vendor: "huawei", enabled: true },
  { name: "SSH presente", description: "SSH/STelnet deve estar disponível.", context: "security", severity: "medium", ruleType: "structured", rulePattern: "huawei-security-ssh-present", vendor: "huawei", enabled: true },
  { name: "SNMP public ausente", description: "Community public não deve aparecer.", context: "security", severity: "high", ruleType: "structured", rulePattern: "huawei-security-snmp-public-absent", vendor: "huawei", enabled: true },
  { name: "NTP configurado", description: "NTP deve estar configurado.", context: "ntp", severity: "low", ruleType: "structured", rulePattern: "huawei-ntp-configured", vendor: "huawei", enabled: true },
  { name: "Interface ativa com descrição", description: "Interfaces ativas devem ter description.", context: "interface", severity: "low", ruleType: "structured", rulePattern: "huawei-interface-active-description", vendor: "huawei", enabled: true },
  { name: "Subinterface com dot1q", description: "Subinterfaces devem ter dot1q/QinQ.", context: "interface", severity: "medium", ruleType: "structured", rulePattern: "huawei-subinterface-dot1q", vendor: "huawei", enabled: true },
  { name: "VRF com RD", description: "VRF deve ter RD.", context: "l3vpn", severity: "high", ruleType: "structured", rulePattern: "huawei-vrf-rd", vendor: "huawei", enabled: true },
  { name: "VRF com RT import", description: "VRF deve ter RT import.", context: "l3vpn", severity: "medium", ruleType: "structured", rulePattern: "huawei-vrf-rt-import", vendor: "huawei", enabled: true },
  { name: "VRF com RT export", description: "VRF deve ter RT export.", context: "l3vpn", severity: "medium", ruleType: "structured", rulePattern: "huawei-vrf-rt-export", vendor: "huawei", enabled: true },
  { name: "Peer BGP Established", description: "Peers críticos devem estar Established.", context: "bgp", severity: "high", ruleType: "structured", rulePattern: "huawei-bgp-peer-established", vendor: "huawei", enabled: true },
  { name: "Cliente com import policy", description: "Cliente BGP deve ter import policy.", context: "bgp", severity: "high", ruleType: "structured", rulePattern: "huawei-bgp-customer-import-policy", vendor: "huawei", enabled: true },
  { name: "Operadora/IX/CDN com export policy", description: "Transito/IX/CDN deve ter export policy.", context: "bgp", severity: "high", ruleType: "structured", rulePattern: "huawei-bgp-transit-export-policy", vendor: "huawei", enabled: true },
  { name: "Route-policy referenciada existe", description: "Route-policy referenciada deve existir no snapshot.", context: "bgp", severity: "high", ruleType: "structured", rulePattern: "huawei-bgp-route-policy-exists", vendor: "huawei", enabled: true },
  { name: "Prefix-list referenciada existe", description: "Prefix-list em route-policy deve existir.", context: "bgp", severity: "medium", ruleType: "structured", rulePattern: "huawei-route-policy-prefix-exists", vendor: "huawei", enabled: true },
  { name: "Community-filter/list referenciada existe", description: "Community em route-policy deve existir.", context: "bgp", severity: "medium", ruleType: "structured", rulePattern: "huawei-route-policy-community-exists", vendor: "huawei", enabled: true },
  { name: "L2VC duplicado", description: "L2VC não deve duplicar id.", context: "l2vpn", severity: "high", ruleType: "structured", rulePattern: "huawei-l2vc-duplicate", vendor: "huawei", enabled: true },
  { name: "L2VC com service/vc id", description: "L2VC deve ter service/vc id.", context: "l2vpn", severity: "medium", ruleType: "structured", rulePattern: "huawei-l2vc-service-id", vendor: "huawei", enabled: true },
];

function parseContexts(value: string | null): string[] {
  try {
    const parsed = JSON.parse(value ?? "[]");
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}

function isRequested(contexts: string[], names: string[]): boolean {
  if (contexts.length === 0) return true;
  return names.some((name) => contexts.includes(name));
}

async function ensureDefaultPolicies() {
  const existing = await db.select().from(compliancePoliciesTable);
  const existingKeys = new Set(existing.map((policy) => `${policy.vendor ?? ""}:${policy.rulePattern ?? policy.name}`));
  const missing = DEFAULT_POLICIES.filter((policy) => !existingKeys.has(`${policy.vendor ?? ""}:${policy.rulePattern ?? policy.name}`));
  if (missing.length > 0) {
    await db.insert(compliancePoliciesTable).values(missing);
  }
}

function severityOrder(severity: string): number {
  return { critical: 5, high: 4, medium: 3, warning: 2, low: 1, info: 0 }[severity] ?? 0;
}

function normalizeSeverity(finding: StructuredFinding): string {
  if (finding.confidence === "low" || finding.confidence === "unknown") {
    if (finding.severity === "critical" || finding.severity === "high") return "warning";
  }
  return finding.severity;
}

function evaluateLegacyPolicy(policy: CompliancePolicy, ctx: ComplianceContext): StructuredFinding | null {
  if (policy.ruleType === "structured") return null;
  if (!ctx.contexts.includes(policy.context)) return null;
  if (!ctx.rawConfig) {
    return {
      policyKey: policy.rulePattern ?? policy.name,
      policyName: policy.name,
      context: policy.context,
      status: "unknown",
      severity: "warning",
      message: `Policy ${policy.name} não avaliada: raw config indisponível.`,
      recommendation: "Execute coleta de configuração ou discovery SSH.",
      source: ctx.source,
      confidence: ctx.confidence,
      objectType: "device",
      objectId: String(ctx.device.id),
      objectName: ctx.device.hostname,
    };
  }

  let found = false;
  try {
    if (policy.ruleType === "regex" && policy.rulePattern) {
      found = new RegExp(policy.rulePattern, "im").test(ctx.rawConfig);
    } else if (policy.rulePattern) {
      found = ctx.rawConfig.toLowerCase().includes(policy.rulePattern.toLowerCase());
    }
  } catch {
    return {
      policyKey: policy.rulePattern ?? policy.name,
      policyName: policy.name,
      context: policy.context,
      status: "warning",
      severity: "warning",
      message: `Policy ${policy.name} possui expressão inválida.`,
      source: ctx.source,
      confidence: ctx.confidence,
      objectType: "device",
      objectId: String(ctx.device.id),
      objectName: ctx.device.hostname,
    };
  }

  const pass = policy.ruleType === "absence" ? !found : found;
  return {
    policyKey: policy.rulePattern ?? policy.name,
    policyName: policy.name,
    context: policy.context,
    status: pass ? "pass" : "fail",
    severity: pass ? "info" : (policy.severity as StructuredFinding["severity"]),
    message: pass ? `Policy ${policy.name} passou.` : `Policy ${policy.name} não conforme.`,
    evidence: found ? policy.rulePattern : undefined,
    recommendation: pass ? undefined : "Validar configuração conforme policy.",
    source: ctx.source,
    confidence: ctx.confidence,
    objectType: "device",
    objectId: String(ctx.device.id),
    objectName: ctx.device.hostname,
  };
}

async function buildContext(jobId: number): Promise<ComplianceContext | null> {
  const [job] = await db.select().from(complianceJobsTable).where(eq(complianceJobsTable.id, jobId));
  if (!job) return null;
  const [device] = await db.select().from(devicesTable).where(eq(devicesTable.id, job.deviceId));
  if (!device) {
    await db.update(complianceJobsTable).set({ status: "error", errorMessage: "Device not found", completedAt: new Date() }).where(eq(complianceJobsTable.id, jobId));
    return null;
  }
  const [snapshotRow] = await db.select().from(discoverySnapshotsTable).where(eq(discoverySnapshotsTable.deviceId, device.id)).orderBy(desc(discoverySnapshotsTable.createdAt)).limit(1);
  const [collectedConfig] = await db.select().from(collectedConfigsTable).where(eq(collectedConfigsTable.deviceId, device.id)).orderBy(desc(collectedConfigsTable.collectedAt)).limit(1);
  const snapshot = (snapshotRow?.snapshotJson ?? null) as DeviceDiscoverySnapshot | null;
  return {
    device,
    contexts: parseContexts(job.contexts),
    snapshotRow: snapshotRow ?? null,
    snapshot,
    collectedConfig: collectedConfig ?? null,
    rawConfig: collectedConfig?.rawConfig ?? "",
    source: sourceFromSnapshot(snapshot),
    confidence: confidenceFromSnapshot(snapshot),
  };
}

async function policyMapForFindings(findings: StructuredFinding[], deviceVendor: string) {
  await ensureDefaultPolicies();
  const policies = await db.select().from(compliancePoliciesTable).where(eq(compliancePoliciesTable.enabled, true));
  const byRule = new Map<string, CompliancePolicy>();
  const byName = new Map<string, CompliancePolicy>();
  for (const policy of policies) {
    if (policy.vendor && policy.vendor !== deviceVendor) continue;
    if (policy.rulePattern) byRule.set(policy.rulePattern, policy);
    byName.set(policy.name, policy);
  }
  for (const finding of findings) {
    if (!byRule.has(finding.policyKey) && !byName.has(finding.policyName)) {
      const [created] = await db.insert(compliancePoliciesTable).values({
        name: finding.policyName,
        description: finding.message,
        context: finding.context,
        severity: finding.severity,
        ruleType: "structured",
        rulePattern: finding.policyKey,
        vendor: deviceVendor,
        enabled: true,
      }).returning();
      byRule.set(finding.policyKey, created);
      byName.set(finding.policyName, created);
    }
  }
  return { byRule, byName, policies };
}

export async function executeComplianceJob(jobId: number) {
  await db.update(complianceJobsTable).set({ status: "running", startedAt: new Date(), errorMessage: null }).where(eq(complianceJobsTable.id, jobId));
  const ctx = await buildContext(jobId);
  if (!ctx) return;

  const findings: StructuredFinding[] = [];
  if (isRequested(ctx.contexts, ["security", "snmp", "ntp"])) findings.push(...runSecurityChecks(ctx));
  if (isRequested(ctx.contexts, ["interface", "interfaces"])) findings.push(...runInterfaceChecks(ctx));
  if (isRequested(ctx.contexts, ["bgp"])) findings.push(...runBgpChecks(ctx));
  if (isRequested(ctx.contexts, ["l3vpn", "vrf", "vrfs"])) findings.push(...runVrfChecks(ctx));
  if (isRequested(ctx.contexts, ["l2vpn"])) findings.push(...runL2vpnChecks(ctx));

  const { byRule, byName, policies } = await policyMapForFindings(findings, ctx.device.vendor);
  for (const policy of policies) {
    const legacy = evaluateLegacyPolicy(policy, ctx);
    if (legacy) findings.push(legacy);
  }

  await db.delete(complianceFindingsTable).where(eq(complianceFindingsTable.jobId, jobId));
  let passCount = 0;
  let failCount = 0;

  if (findings.length > 0) {
    const rows = findings.map((finding) => {
      const policy = byRule.get(finding.policyKey) ?? byName.get(finding.policyName);
      const severity = normalizeSeverity(finding);
      if (finding.status === "pass") passCount += 1;
      if (finding.status === "fail") failCount += 1;
      return {
        jobId,
        policyId: policy?.id ?? byName.values().next().value.id,
        policyName: finding.policyName,
        severity,
        context: finding.context,
        result: finding.status,
        detail: finding.message,
        evidence: finding.evidence === undefined ? null : sanitizeEvidence(finding.evidence),
        status: finding.status,
        message: finding.message,
        recommendation: finding.recommendation ?? null,
        blocking: finding.blocking ?? severityOrder(severity) >= severityOrder("high"),
        source: finding.source,
        confidence: finding.confidence,
        objectType: finding.objectType ?? null,
        objectId: finding.objectId ?? null,
        objectName: finding.objectName ?? null,
        ruleId: finding.policyKey,
        ruleName: finding.policyName,
        rawReference: finding.rawReference === undefined ? compactReference(finding.evidence) : compactReference(finding.rawReference),
        metadataJson: finding.metadata ?? {},
      };
    });
    await db.insert(complianceFindingsTable).values(rows);
  }

  const finalStatus = failCount > 0 ? "failed" : "passed";
  await db.update(complianceJobsTable).set({
    status: finalStatus,
    passCount,
    failCount,
    completedAt: new Date(),
  }).where(eq(complianceJobsTable.id, jobId));
}
