#!/usr/bin/env node
/**
 * TAREFA 1: Analyze real findings from device 1, compliance_job 13.
 * Run: pnpm --dir workspace exec tsx ../tools/compliance-findings-analysis.ts
 */

import { db, complianceFindingsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function analyzeFindingsForDevice1Job13() {
  console.log("🔍 Analisando findings do device 1, job 13...");

  try {
    // Query all findings for job 13
    const findings = await db
      .select()
      .from(complianceFindingsTable)
      .where(eq(complianceFindingsTable.jobId, 13));

    console.log(`✓ Found ${findings.length} findings`);

    // Analysis by context
    const byContext: Record<string, { count: number; severity: Record<string, number> }> = {};
    const bySeverity: Record<string, number> = {};
    const byStatus: Record<string, number> = {};
    const bySource: Record<string, number> = {};
    const byConfidence: Record<string, number> = {};
    const byObjectType: Record<string, number> = {};
    const byRuleId: Record<string, { count: number; names: Set<string>; severity: Record<string, number> }> = {};
    const byMessage: Record<string, { count: number; severity: Record<string, number>; objects: any[] }> = {};

    for (const f of findings) {
      // By context
      if (!byContext[f.context]) {
        byContext[f.context] = { count: 0, severity: {} };
      }
      byContext[f.context].count++;
      if (f.severity) {
        byContext[f.context].severity[f.severity] =
          (byContext[f.context].severity[f.severity] || 0) + 1;
      }

      // By severity
      if (f.severity) {
        bySeverity[f.severity] = (bySeverity[f.severity] || 0) + 1;
      }

      // By status
      if (f.status) {
        byStatus[f.status] = (byStatus[f.status] || 0) + 1;
      }

      // By source
      if (f.source) {
        bySource[f.source] = (bySource[f.source] || 0) + 1;
      }

      // By confidence
      if (f.confidence) {
        byConfidence[f.confidence] = (byConfidence[f.confidence] || 0) + 1;
      }

      // By object type
      if (f.objectType) {
        byObjectType[f.objectType] = (byObjectType[f.objectType] || 0) + 1;
      }

      // By rule ID
      if (f.ruleId) {
        if (!byRuleId[f.ruleId]) {
          byRuleId[f.ruleId] = { count: 0, names: new Set(), severity: {} };
        }
        byRuleId[f.ruleId].count++;
        if (f.ruleName) byRuleId[f.ruleId].names.add(f.ruleName);
        if (f.severity) {
          byRuleId[f.ruleId].severity[f.severity] =
            (byRuleId[f.ruleId].severity[f.severity] || 0) + 1;
        }
      }

      // By message pattern
      const msgKey = f.message || "no-message";
      if (!byMessage[msgKey]) {
        byMessage[msgKey] = { count: 0, severity: {}, objects: [] };
      }
      byMessage[msgKey].count++;
      if (f.severity) {
        byMessage[msgKey].severity[f.severity] = (byMessage[msgKey].severity[f.severity] || 0) + 1;
      }
      byMessage[msgKey].objects.push({
        name: f.objectName,
        type: f.objectType,
        id: f.objectId,
      });
    }

    // Sort by message frequency
    const topMessages = Object.entries(byMessage)
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, 20)
      .map(([msg, data]) => ({
        message: msg,
        count: data.count,
        severity: data.severity,
        examples: data.objects.slice(0, 3),
      }));

    // Generate report
    const reportLines: string[] = [];
    reportLines.push("# Compliance Findings Analysis — Device 1, Job 13");
    reportLines.push("");
    reportLines.push(`**Analysis Date:** ${new Date().toISOString()}`);
    reportLines.push(`**Total Findings:** ${findings.length}`);
    reportLines.push("");

    // Summary table by context
    reportLines.push("## Resumo por Contexto");
    reportLines.push("");
    reportLines.push(
      "| Contexto | Total | Critical | High | Medium | Low | Info | Unknown |"
    );
    reportLines.push(
      "|----------|------:|--------:|-----:|-------:|-----:|-----:|--------:|"
    );

    for (const [ctx, data] of Object.entries(byContext)) {
      const critical = data.severity.critical || 0;
      const high = data.severity.high || 0;
      const medium = data.severity.medium || 0;
      const low = data.severity.low || 0;
      const info = data.severity.info || 0;
      const unknown = data.severity.unknown || 0;
      reportLines.push(
        `| ${ctx} | ${data.count} | ${critical} | ${high} | ${medium} | ${low} | ${info} | ${unknown} |`
      );
    }
    reportLines.push("");

    // Severity distribution
    reportLines.push("## Distribuição por Severidade");
    reportLines.push("");
    for (const [sev, count] of Object.entries(bySeverity).sort(
      (a, b) => b[1] - a[1]
    )) {
      reportLines.push(`- **${sev}**: ${count}`);
    }
    reportLines.push("");

    // Source distribution
    reportLines.push("## Distribuição por Source");
    reportLines.push("");
    for (const [src, count] of Object.entries(bySource).sort(
      (a, b) => b[1] - a[1]
    )) {
      reportLines.push(`- **${src}**: ${count}`);
    }
    reportLines.push("");

    // Confidence distribution
    reportLines.push("## Distribuição por Confidence");
    reportLines.push("");
    for (const [conf, count] of Object.entries(byConfidence).sort(
      (a, b) => b[1] - a[1]
    )) {
      reportLines.push(`- **${conf}**: ${count}`);
    }
    reportLines.push("");

    // Object type distribution
    reportLines.push("## Distribuição por Tipo de Objeto");
    reportLines.push("");
    for (const [objType, count] of Object.entries(byObjectType).sort(
      (a, b) => b[1] - a[1]
    )) {
      reportLines.push(`- **${objType}**: ${count}`);
    }
    reportLines.push("");

    // Top 20 findings by message
    reportLines.push("## Top 20 Tipos de Findings");
    reportLines.push("");
    for (let i = 0; i < topMessages.length; i++) {
      const msg = topMessages[i];
      reportLines.push(`### ${i + 1}. ${msg.message || "no-message"}`);
      reportLines.push(`- **Occurrências:** ${msg.count}`);
      reportLines.push(`- **Severidade:** ${JSON.stringify(msg.severity)}`);
      reportLines.push(`- **Exemplos:**`);
      for (const ex of msg.examples) {
        reportLines.push(`  - ${ex.type}: ${ex.name || ex.id || "unknown"}`);
      }
      reportLines.push("");
    }

    // Top rules
    reportLines.push("## Top 10 Regras Acionadas");
    reportLines.push("");
    const topRules = Object.entries(byRuleId)
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, 10);

    for (const [ruleId, data] of topRules) {
      const ruleName = Array.from(data.names).join(", ") || "unknown";
      reportLines.push(`### ${ruleId}: ${ruleName}`);
      reportLines.push(`- **Occorrências:** ${data.count}`);
      reportLines.push(`- **Severidade:** ${JSON.stringify(data.severity)}`);
      reportLines.push("");
    }

    const report = reportLines.join("\n");

    // Save report
    const reportPath = path.join(__dirname, "..", "reports", "V0_2_5_DEVICE_1_FINDINGS_REVIEW.md");

    // Ensure directory exists
    const reportsDirPath = path.dirname(reportPath);
    if (!fs.existsSync(reportsDirPath)) {
      fs.mkdirSync(reportsDirPath, { recursive: true });
    }

    fs.writeFileSync(reportPath, report, "utf-8");
    console.log(`✓ Report saved to ${reportPath}`);

    // Print summary to console
    console.log("");
    console.log("=== RESUMO FINDINGS ===");
    console.log(`Total: ${findings.length}`);
    console.log(`Critical: ${bySeverity.critical || 0}`);
    console.log(`High: ${bySeverity.high || 0}`);
    console.log(`Medium: ${bySeverity.medium || 0}`);
    console.log(`Low: ${bySeverity.low || 0}`);

    return {
      totalFindings: findings.length,
      bySeverity,
      byContext,
      bySource,
      byConfidence,
      byObjectType,
      topMessages,
      topRules,
    };
  } catch (err) {
    console.error("❌ Error:", err);
    process.exit(1);
  }
}

// Run
await analyzeFindingsForDevice1Job13();
console.log("\n✓ Done.");
