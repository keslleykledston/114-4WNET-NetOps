import type { ComplianceContext, StructuredFinding } from "../compliance-context.js";

function base(ctx: ComplianceContext, policyKey: string, policyName: string, message: string): Omit<StructuredFinding, "status" | "severity"> {
  return {
    policyKey,
    policyName,
    context: policyKey.includes("ntp") ? "ntp" : "security",
    message,
    source: ctx.source,
    confidence: ctx.confidence,
    objectType: "device",
    objectId: String(ctx.device.id),
    objectName: ctx.device.hostname,
  };
}

export function runSecurityChecks(ctx: ComplianceContext): StructuredFinding[] {
  const raw = ctx.rawConfig.toLowerCase();
  const findings: StructuredFinding[] = [];

  if (!ctx.snapshot && !raw) {
    findings.push({
      ...base(ctx, "structured-snapshot-present", "Discovery snapshot disponível", "Nenhum discovery snapshot encontrado."),
      status: "unknown",
      severity: "warning",
      recommendation: "Execute discovery via SSH/SNMP antes do compliance.",
    });
    return findings;
  }

  const telnetEnabled = /telnet\s+server\s+enable|user-interface\s+vty[\s\S]{0,300}protocol\s+inbound\s+telnet/i.test(ctx.rawConfig);
  findings.push({
    ...base(ctx, "huawei-security-telnet-disabled", "Telnet ausente", telnetEnabled ? "Telnet aparenta estar habilitado." : "Telnet não encontrado na configuração analisada."),
    status: telnetEnabled ? "fail" : "pass",
    severity: telnetEnabled ? "high" : "info",
    evidence: telnetEnabled ? "telnet server/protocol inbound telnet" : "sem ocorrência telnet server enable",
    recommendation: telnetEnabled ? "Remover Telnet e manter somente SSH/STelnet." : undefined,
  });

  const sshPresent = /stelnet\s+server\s+enable|ssh\s+server|protocol\s+inbound\s+(ssh|all)/i.test(ctx.rawConfig) || ctx.snapshot?.sourceStatus.ssh === "success";
  findings.push({
    ...base(ctx, "huawei-security-ssh-present", "SSH presente", sshPresent ? "SSH/STelnet ou coleta SSH confirmada." : "SSH/STelnet não comprovado."),
    status: sshPresent ? "pass" : "warning",
    severity: sshPresent ? "info" : "medium",
    recommendation: sshPresent ? undefined : "Validar configuração SSH/STelnet no VRP.",
  });

  const publicCommunity = /snmp-agent\s+community\s+\S+\s+public\b/i.test(ctx.rawConfig) || /community\s+public\b/i.test(ctx.rawConfig);
  findings.push({
    ...base(ctx, "huawei-security-snmp-public-absent", "SNMP public ausente", publicCommunity ? "Community SNMP public encontrada." : "Community SNMP public não encontrada."),
    status: publicCommunity ? "fail" : "pass",
    severity: publicCommunity ? "high" : "info",
    evidence: publicCommunity ? "snmp community public" : "sem ocorrência public",
    recommendation: publicCommunity ? "Remover community public e usar community restrita/ACL." : undefined,
  });

  const ntpPresent = /ntp-service\s+unicast-server|ntp-service\s+server/i.test(ctx.rawConfig);
  findings.push({
    ...base(ctx, "huawei-ntp-configured", "NTP configurado", ntpPresent ? "NTP encontrado." : "NTP não encontrado."),
    context: "ntp",
    status: ntpPresent ? "pass" : ctx.rawConfig ? "warning" : "unknown",
    severity: ntpPresent ? "info" : "low",
    recommendation: ntpPresent ? undefined : "Configurar NTP para carimbo confiável de logs/auditoria.",
  });

  return findings;
}
