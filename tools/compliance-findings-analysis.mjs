#!/usr/bin/env node
/**
 * TAREFA 1: Analyze real findings from device 1, compliance_job 13.
 * Generate findings review report grouped by context, severity, source, confidence.
 */

import pg from "pg";
import fs from "fs";
import path from "path";

const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || "postgresql://netops:NetOps2024!@localhost:5432/netops",
});

const db = pool;

async function analyzeFindingsForDevice1Job13() {
  console.log("🔍 Analisando findings do device 1, job 13...");

  try {
    // Query all findings for job 13
    const result = await db.query(`
      SELECT
        f.id,
        f.job_id,
        f.policy_id,
        f.policy_name,
        f.severity,
        f.context,
        f.result,
        f.detail,
        f.evidence,
        f.status,
        f.message,
        f.recommendation,
        f.blocking,
        f.source,
        f.confidence,
        f.object_type,
        f.object_id,
        f.object_name,
        f.rule_id,
        f.rule_name,
        f.metadata_json
      FROM compliance_findings f
      WHERE f.job_id = 13
      ORDER BY f.severity, f.context, f.object_type
    `);

    const findings = result.rows;
    console.log(`✓ Found ${findings.length} findings`);

    // Analysis by context
    const byContext = {};
    const bySeverity = {};
    const byStatus = {};
    const bySource = {};
    const byConfidence = {};
    const byObjectType = {};
    const byRuleId = {};
    const byMessage = {};

    for (const f of findings) {
      // By context
      if (!byContext[f.context]) {
        byContext[f.context] = { count: 0, severity: {} };
      }
      byContext[f.context].count++;
      byContext[f.context].severity[f.severity] = (byContext[f.context].severity[f.severity] || 0) + 1;

      // By severity
      if (!bySeverity[f.severity]) {
        bySeverity[f.severity] = 0;
      }
      bySeverity[f.severity]++;

      // By status
      if (!byStatus[f.status]) {
        byStatus[f.status] = 0;
      }
      byStatus[f.status]++;

      // By source
      if (!bySource[f.source]) {
        bySource[f.source] = 0;
      }
      bySource[f.source]++;

      // By confidence
      if (!byConfidence[f.confidence]) {
        byConfidence[f.confidence] = 0;
      }
      byConfidence[f.confidence]++;

      // By object type
      if (!byObjectType[f.object_type]) {
        byObjectType[f.object_type] = 0;
      }
      byObjectType[f.object_type]++;

      // By rule ID
      if (!byRuleId[f.rule_id]) {
        byRuleId[f.rule_id] = { count: 0, names: new Set(), severity: {} };
      }
      byRuleId[f.rule_id].count++;
      if (f.rule_name) byRuleId[f.rule_id].names.add(f.rule_name);
      byRuleId[f.rule_id].severity[f.severity] = (byRuleId[f.rule_id].severity[f.severity] || 0) + 1;

      // By message pattern (top findings)
      const msgKey = f.message || "no-message";
      if (!byMessage[msgKey]) {
        byMessage[msgKey] = { count: 0, severity: {}, objects: [] };
      }
      byMessage[msgKey].count++;
      byMessage[msgKey].severity[f.severity] = (byMessage[msgKey].severity[f.severity] || 0) + 1;
      byMessage[msgKey].objects.push({ name: f.object_name, type: f.object_type, id: f.object_id });
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
    const reportLines = [];
    reportLines.push("# Compliance Findings Analysis — Device 1, Job 13");
    reportLines.push("");
    reportLines.push(`**Analysis Date:** ${new Date().toISOString()}`);
    reportLines.push(`**Total Findings:** ${findings.length}`);
    reportLines.push("");

    // Summary table by context
    reportLines.push("## Resumo por Contexto");
    reportLines.push("");
    reportLines.push("| Contexto | Total | Critical | High | Medium | Low | Info | Unknown |");
    reportLines.push("|----------|------:|--------:|-----:|-------:|-----:|-----:|--------:|");

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
    for (const [sev, count] of Object.entries(bySeverity).sort((a, b) => b[1] - a[1])) {
      reportLines.push(`- **${sev}**: ${count}`);
    }
    reportLines.push("");

    // Source distribution
    reportLines.push("## Distribuição por Source");
    reportLines.push("");
    for (const [src, count] of Object.entries(bySource).sort((a, b) => b[1] - a[1])) {
      reportLines.push(`- **${src}**: ${count}`);
    }
    reportLines.push("");

    // Confidence distribution
    reportLines.push("## Distribuição por Confidence");
    reportLines.push("");
    for (const [conf, count] of Object.entries(byConfidence).sort((a, b) => b[1] - a[1])) {
      reportLines.push(`- **${conf}**: ${count}`);
    }
    reportLines.push("");

    // Object type distribution
    reportLines.push("## Distribuição por Tipo de Objeto");
    reportLines.push("");
    for (const [objType, count] of Object.entries(byObjectType).sort((a, b) => b[1] - a[1])) {
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
        reportLines.push(
          `  - ${ex.type}: ${ex.name || ex.id || "unknown"}`
        );
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
    const reportsDir = path.dirname(
      new URL(import.meta.url).pathname.replace(/^\/mnt\/./, "/")
    );
    const reportPath = path.join(
      reportsDir,
      "..",
      "reports",
      "V0_2_5_DEVICE_1_FINDINGS_REVIEW.md"
    );

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

    // Return summary data for next tasks
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
    console.error("❌ Error analyzing findings:", err.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

// Run analysis
const summary = await analyzeFindingsForDevice1Job13();
console.log("\n✓ Analysis complete.");
