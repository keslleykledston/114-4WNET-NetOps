import type { VsiVplsStatusResult } from "./vsi-vpls.types.js";

export interface VsiVplsStatusInput {
  memberCount: number;
  configsCount: number;
  pwsTotal: number;
  pwsUp: number;
  hasActiveAlarm: boolean;
  hasDivergence: boolean;
  operationalStatuses: string[];
  findings: Array<{ code: string; severity: string }>;
}

export function classifyVsiVplsStatus(input: VsiVplsStatusInput): VsiVplsStatusResult {
  const evidence: string[] = [];
  const downFindings = input.findings.filter((finding) => /down|partial/i.test(finding.code) || finding.severity === "error");

  if (input.memberCount === 0 && input.configsCount > 0) {
    return {
      status: "CONFIG_ONLY",
      severity: "warning",
      reason: "Config existe, mas nao ha runtime operacional suficiente",
      evidence: ["config-only"],
    };
  }

  if (input.memberCount === 0) {
    return {
      status: "UNKNOWN",
      severity: "warning",
      reason: "Coleta incompleta ou sem membros operacionais",
      evidence: ["no-members"],
    };
  }

  if (input.pwsTotal === 0 && input.configsCount > 0) {
    return {
      status: "CONFIG_ONLY",
      severity: "warning",
      reason: "Sem PWs operacionais, apenas config persistida",
      evidence: ["no-pws", "config-only"],
    };
  }

  if (input.pwsTotal > 0 && input.pwsUp === 0) {
    evidence.push("all-pws-down");
    if (downFindings.length > 0) evidence.push(...downFindings.map((finding) => finding.code));
    return {
      status: "DOWN",
      severity: "error",
      reason: "Nenhum PW operacional",
      evidence,
    };
  }

  if (input.hasActiveAlarm || input.hasDivergence || downFindings.length > 0 || input.pwsUp < input.pwsTotal) {
    if (input.pwsUp > 0) evidence.push("partial-pws-up");
    if (input.hasActiveAlarm) evidence.push("active-alarm");
    if (input.hasDivergence) evidence.push("divergence");
    evidence.push(...downFindings.map((finding) => finding.code));
    return {
      status: "DEGRADED",
      severity: "warning",
      reason: input.hasDivergence ? "Divergencia ou alarme relevante detectado" : "Parte do servico segue operacional",
      evidence,
    };
  }

  if (input.operationalStatuses.length === 0 && input.configsCount > 0) {
    return {
      status: "CONFIG_ONLY",
      severity: "warning",
      reason: "Somente config coletada",
      evidence: ["config-only"],
    };
  }

  if (input.pwsUp > 0 && input.memberCount > 0) {
    evidence.push("pws-up");
    return {
      status: "UP",
      severity: "info",
      reason: "Servico operacional sem divergencia relevante",
      evidence,
    };
  }

  return {
    status: "UNKNOWN",
    severity: "warning",
    reason: "Dados insuficientes para classificacao confiavel",
    evidence: ["insufficient-data"],
  };
}
