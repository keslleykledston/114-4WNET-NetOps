import type { ComplianceContext, StructuredFinding } from "../compliance-context.js";

export function runL2vpnChecks(ctx: ComplianceContext): StructuredFinding[] {
  const l2vpn = ctx.snapshot?.l2vpn;
  if (!ctx.snapshot || !l2vpn) {
    return [{
      policyKey: "huawei-l2vpn-snapshot-present",
      policyName: "L2VPN no snapshot",
      context: "l2vpn",
      status: "unknown",
      severity: "warning",
      message: "L2VPN não avaliado: snapshot ausente.",
      recommendation: "Execute discovery com contexto l2vpn.",
      source: ctx.source,
      confidence: ctx.confidence,
      objectType: "device",
      objectId: String(ctx.device.id),
      objectName: ctx.device.hostname,
    }];
  }

  const findings: StructuredFinding[] = [];
  const seen = new Set<string>();
  for (const vc of l2vpn.l2vcs ?? []) {
    const key = vc.vcId ?? vc.name;
    if (key && seen.has(key)) {
      findings.push({
        policyKey: "huawei-l2vc-duplicate",
        policyName: "L2VC duplicado",
        context: "l2vpn",
        status: "fail",
        severity: "high",
        message: `L2VC duplicado: ${key}`,
        source: ctx.source,
        confidence: ctx.confidence,
        objectType: "l2vc",
        objectId: key,
        objectName: vc.name,
        evidence: vc,
      });
    }
    if (key) seen.add(key);
    if (!vc.vcId) {
      findings.push({
        policyKey: "huawei-l2vc-service-id",
        policyName: "L2VC com service/vc id",
        context: "l2vpn",
        status: "fail",
        severity: "medium",
        message: `L2VC sem VC/service id: ${vc.name}`,
        recommendation: "Validar mpls l2vc service-id/vc-id.",
        source: ctx.source,
        confidence: ctx.confidence,
        objectType: "l2vc",
        objectId: vc.name,
        objectName: vc.name,
        evidence: vc,
      });
    }
  }

  const vsiNames = new Set<string>();
  for (const vsi of l2vpn.vsis ?? []) {
    if (vsiNames.has(vsi.name)) {
      findings.push({
        policyKey: "huawei-vsi-duplicate",
        policyName: "VSI duplicado",
        context: "l2vpn",
        status: "fail",
        severity: "high",
        message: `VSI duplicado: ${vsi.name}`,
        source: ctx.source,
        confidence: ctx.confidence,
        objectType: "vsi",
        objectId: vsi.name,
        objectName: vsi.name,
        evidence: vsi,
      });
    }
    vsiNames.add(vsi.name);
  }

  if (findings.length === 0) {
    findings.push({
      policyKey: "huawei-l2vpn-structured-pass",
      policyName: "L2VPN estruturado",
      context: "l2vpn",
      status: "pass",
      severity: "info",
      message: `${(l2vpn.l2vcs ?? []).length} L2VCs e ${(l2vpn.vsis ?? []).length} VSIs avaliados sem achados críticos.`,
      source: ctx.source,
      confidence: ctx.confidence,
      objectType: "device",
      objectId: String(ctx.device.id),
      objectName: ctx.device.hostname,
    });
  }
  return findings;
}
