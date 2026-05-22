import type { ComplianceContext, StructuredFinding } from "../compliance-context.js";
import { isHuaweiInterfaceName, isHuaweiSubinterfaceName } from "../interface-identifiers.js";

export function runInterfaceChecks(ctx: ComplianceContext): StructuredFinding[] {
  const interfaces = ctx.snapshot?.interfaces ?? [];
  if (!ctx.snapshot) {
    return [{
      policyKey: "huawei-interface-snapshot-present",
      policyName: "Interfaces no snapshot",
      context: "interface",
      status: "unknown",
      severity: "warning",
      message: "Interfaces não avaliadas: snapshot ausente.",
      recommendation: "Execute discovery para coletar interfaces.",
      source: ctx.source,
      confidence: ctx.confidence,
      objectType: "device",
      objectId: String(ctx.device.id),
      objectName: ctx.device.hostname,
    }];
  }

  const findings: StructuredFinding[] = [];
  const names = new Set<string>();
  for (const item of interfaces) {
    const row = item as unknown as Record<string, unknown>;
    const name = typeof item.name === "string" ? item.name : (typeof row.ifName === "string" ? row.ifName : null);
    if (!name || !isHuaweiInterfaceName(name)) continue;
    if (names.has(name)) {
      findings.push({
        policyKey: "huawei-interface-duplicate",
        policyName: "Interface duplicada",
        context: "interface",
        status: "fail",
        severity: "high",
        message: `Interface duplicada no snapshot: ${name}`,
        source: ctx.source,
        confidence: ctx.confidence,
        objectType: "interface",
        objectId: name,
        objectName: name,
        evidence: item,
      });
    }
    names.add(name);

    const isUp = String(row.status ?? row.operStatus ?? "").toLowerCase().includes("up");
    const description = String(item.description ?? "").trim();
    if (isUp && !description) {
      findings.push({
        policyKey: "huawei-interface-active-description",
        policyName: "Interface ativa com descrição",
        context: "interface",
        status: "warning",
        severity: "low",
        message: `Interface ativa sem description: ${name}`,
        recommendation: "Adicionar description operacional.",
        source: ctx.source,
        confidence: item.confidence ?? ctx.confidence,
        objectType: "interface",
        objectId: name,
        objectName: name,
        evidence: item.evidence ?? item,
      });
    }

    const isSubinterface = isHuaweiSubinterfaceName(name);
    const hasDot1q = /dot1q|vlan-type|qinq/i.test(String(item.evidence ?? "") + "\n" + ctx.rawConfig.match(new RegExp(`interface\\s+${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}[\\s\\S]{0,500}`, "i"))?.[0]);
    if (isSubinterface && !hasDot1q) {
      findings.push({
        policyKey: "huawei-subinterface-dot1q",
        policyName: "Subinterface com dot1q",
        context: "interface",
        status: ctx.rawConfig ? "fail" : "unknown",
        severity: "medium",
        message: `Subinterface sem dot1q comprovado: ${name}`,
        recommendation: "Validar encapsulamento dot1q/QinQ.",
        source: ctx.source,
        confidence: ctx.confidence,
        objectType: "interface",
        objectId: name,
        objectName: name,
        evidence: {
          interfaceName: name,
          ipAddresses: [...(item.ipv4 ?? []), ...(item.ipv6 ?? [])],
          dot1q: null,
          sourceEvidence: item.evidence,
        },
      });
    }
  }

  if (findings.length === 0) {
    findings.push({
      policyKey: "huawei-interface-structured-pass",
      policyName: "Interfaces estruturadas",
      context: "interface",
      status: "pass",
      severity: "info",
      message: `${interfaces.length} interfaces avaliadas sem achados críticos.`,
      source: ctx.source,
      confidence: ctx.confidence,
      objectType: "device",
      objectId: String(ctx.device.id),
      objectName: ctx.device.hostname,
    });
  }

  return findings;
}
