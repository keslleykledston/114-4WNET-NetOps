import type { ComplianceContext, StructuredFinding } from "../compliance-context.js";

export function runVrfChecks(ctx: ComplianceContext): StructuredFinding[] {
  const vrfs = ctx.snapshot?.vrfs ?? [];
  if (!ctx.snapshot) {
    return [{
      policyKey: "huawei-vrf-snapshot-present",
      policyName: "VRF no snapshot",
      context: "l3vpn",
      status: "unknown",
      severity: "warning",
      message: "VRFs não avaliadas: snapshot ausente.",
      recommendation: "Execute discovery com contexto vrfs.",
      source: ctx.source,
      confidence: ctx.confidence,
      objectType: "device",
      objectId: String(ctx.device.id),
      objectName: ctx.device.hostname,
    }];
  }

  const findings: StructuredFinding[] = [];
  for (const vrf of vrfs) {
    const name = vrf.name;
    const block = ctx.rawConfig.match(new RegExp(`ip vpn-instance\\s+${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}[\\s\\S]*?(?=\\n#|\\nip vpn-instance|$)`, "i"))?.[0] ?? "";
    const hasRd = Boolean(vrf.rd) || /route-distinguisher\s+\S+/i.test(block);
    const hasImportRt = /vpn-target\s+\S+\s+import-extcommunity/i.test(block);
    const hasExportRt = /vpn-target\s+\S+\s+export-extcommunity/i.test(block);

    findings.push({
      policyKey: "huawei-vrf-rd",
      policyName: "VRF com RD",
      context: "l3vpn",
      status: hasRd ? "pass" : "fail",
      severity: hasRd ? "info" : "high",
      message: hasRd ? `VRF ${name} possui RD.` : `VRF ${name} sem RD.`,
      recommendation: hasRd ? undefined : "Configurar route-distinguisher.",
      source: ctx.source,
      confidence: ctx.confidence,
      objectType: "vrf",
      objectId: name,
      objectName: name,
      evidence: hasRd ? (vrf.rd ?? "route-distinguisher") : vrf,
    });

    for (const [key, ok, label] of [
      ["huawei-vrf-rt-import", hasImportRt, "RT import"],
      ["huawei-vrf-rt-export", hasExportRt, "RT export"],
    ] as const) {
      findings.push({
        policyKey: key,
        policyName: `VRF com ${label}`,
        context: "l3vpn",
        status: ok ? "pass" : "warning",
        severity: ok ? "info" : "medium",
        message: ok ? `VRF ${name} possui ${label}.` : `VRF ${name} sem ${label} comprovado.`,
        recommendation: ok ? undefined : `Validar vpn-target ${label}.`,
        source: ctx.source,
        confidence: ctx.confidence,
        objectType: "vrf",
        objectId: name,
        objectName: name,
        evidence: ok ? label : vrf,
      });
    }
  }

  if (findings.length === 0) {
    findings.push({
      policyKey: "huawei-vrf-none",
      policyName: "VRF/L3VPN",
      context: "l3vpn",
      status: "unknown",
      severity: "info",
      message: "Nenhuma VRF encontrada no snapshot.",
      source: ctx.source,
      confidence: ctx.confidence,
      objectType: "device",
      objectId: String(ctx.device.id),
      objectName: ctx.device.hostname,
    });
  }
  return findings;
}
