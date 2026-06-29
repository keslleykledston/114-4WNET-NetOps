import type { TranslateFn } from "./l2-circuit-badges";
import type { L2Circuit, L2Finding, L2FindingCode, L2Status } from "./l2-circuits-api";
import { circuitTypeGroup } from "./l2-circuit-badges";
import { circuitKeyField, formatVlan } from "./l2-circuits-utils";

export type DetailNocBadge = "unavailable" | "attention" | "critical" | "informative";

const FINDING_PRIORITY: L2FindingCode[] = [
  "CIRCUIT_DOWN",
  "L2VC_DOWN",
  "VSI_DOWN",
  "CLASSIFICATION_CONFLICT",
  "DUPLICATED_VC_ID",
  "REMOTE_NOT_FORWARDING",
  "PW_PARTIAL_DOWN",
  "VLAN_ORPHAN",
  "VLANIF_ORPHAN",
  "VLAN_NOT_IN_SWITCH_BATCH",
  "INCOMPLETE_L2_CONFIG",
  "VLAN_CONFLICT",
  "ROUTER_L2_VLAN_ANOMALY",
  "DESCRIPTION_MISSING",
  "VLAN_MULTI_INTERFACE_LOCAL",
  "VLAN_USED_IN_L2VC",
  "VLAN_USED_IN_VSI",
  "VLAN_USED_IN_L3_VRF",
];

const ds = "l2Circuits.detailSheet";

export function friendlyOperStatus(status: L2Status | string, t: TranslateFn): string {
  const key = `${ds}.operStatusFriendly.${status}`;
  const translated = t(key);
  return translated !== key ? translated : String(status);
}

export function getDetailHeaderBadges(circuit: L2Circuit): DetailNocBadge[] {
  const hasError = circuit.findings.some((finding) => finding.severity === "error");
  const hasWarning = circuit.findings.some((finding) => finding.severity === "warning");
  const isUnavailable = circuit.operStatus === "DOWN" || circuit.operStatus === "PARTIAL";

  const badges: DetailNocBadge[] = [];
  if (hasError) badges.push("critical");
  if (isUnavailable) badges.push("unavailable");
  if (hasWarning && !hasError) badges.push("attention");
  if (!badges.length) badges.push("informative");
  return badges;
}

function pickPrimaryFinding(circuit: L2Circuit): L2Finding | null {
  if (!circuit.findings.length) return null;
  for (const code of FINDING_PRIORITY) {
    const match = circuit.findings.find((finding) => finding.code === code);
    if (match) return match;
  }
  return circuit.findings[0] ?? null;
}

export function getProbableCause(circuit: L2Circuit, t: TranslateFn): string {
  const primary = pickPrimaryFinding(circuit);
  if (primary) {
    const key = `${ds}.probableCause.${primary.code}`;
    const translated = t(key);
    if (translated !== key) return translated;
  }

  if (circuit.operStatus === "DOWN") return t(`${ds}.probableCause.operDown`);
  if (circuit.operStatus === "PARTIAL") return t(`${ds}.probableCause.operPartial`);
  if (circuit.operStatus === "CONFIG_ONLY") return t(`${ds}.probableCause.operConfigOnly`);
  if (circuit.findings.length === 0) return t(`${ds}.probableCause.healthy`);
  return t(`${ds}.probableCause.generic`);
}

export function getProbableImpact(circuit: L2Circuit, t: TranslateFn): string {
  const hasError = circuit.findings.some((finding) => finding.severity === "error");
  const hasWarning = circuit.findings.some((finding) => finding.severity === "warning");
  if (hasError || circuit.operStatus === "DOWN") return t(`${ds}.impact.critical`);
  if (hasWarning || circuit.operStatus === "PARTIAL") return t(`${ds}.impact.warning`);
  if (circuit.findings.some((finding) => finding.severity === "info")) return t(`${ds}.impact.info`);
  return t(`${ds}.impact.none`);
}

export function formatServiceIdentifier(circuit: L2Circuit, t: TranslateFn): string {
  const group = circuitTypeGroup(circuit.circuitType);
  if (group === "local") {
    const vlan = formatVlan(circuit);
    return vlan || t(`${ds}.summary.notApplicable`);
  }
  if (group === "mpls") {
    return circuit.vcId ? `VC ${circuit.vcId}` : t(`${ds}.summary.notApplicable`);
  }
  return circuit.vsiName ?? circuit.vsiId ?? t(`${ds}.summary.notApplicable`);
}

export function formatDeviceLabel(circuit: L2Circuit, deviceName?: string | null): string {
  if (deviceName?.trim()) return `${deviceName} (#${circuit.deviceId})`;
  return `#${circuit.deviceId}`;
}

export interface FriendlyFindingCopy {
  title: string;
  explanation: string;
  impact: string;
  action: string;
  step?: string;
}

export function getFriendlyFindingCopy(finding: L2Finding, t: TranslateFn): FriendlyFindingCopy {
  const base = `${ds}.friendlyFindings.${finding.code}`;
  const title = t(`${base}.title`);
  const explanation = t(`${base}.explanation`);
  const impact = t(`${base}.impact`);
  const action = t(`${base}.action`);
  const stepKey = `${base}.step`;
  const step = t(stepKey);
  return {
    title: title !== `${base}.title` ? title : finding.code,
    explanation: explanation !== `${base}.explanation` ? explanation : finding.message,
    impact: impact !== `${base}.impact` ? impact : t(`${ds}.impact.genericFinding`),
    action: action !== `${base}.action` ? action : t(`${ds}.actions.reviewWithNetwork`),
    step: step !== stepKey ? step : undefined,
  };
}

export function getSuggestedActionSteps(circuit: L2Circuit, t: TranslateFn): string[] {
  const steps: string[] = [];
  const seen = new Set<string>();

  for (const code of FINDING_PRIORITY) {
    const finding = circuit.findings.find((item) => item.code === code);
    if (!finding) continue;
    const copy = getFriendlyFindingCopy(finding, t);
    const step = copy.step ?? copy.action;
    if (!step || seen.has(step)) continue;
    seen.add(step);
    steps.push(step);
  }

  if (!steps.length && circuit.operStatus === "DOWN") {
    steps.push(t(`${ds}.actions.checkOperationalStatus`));
  }
  if (!steps.length && circuit.findings.length === 0) {
    steps.push(t(`${ds}.actions.noActionNeeded`));
  }

  return steps.slice(0, 5);
}

export function getCircuitDisplayName(circuit: L2Circuit): string {
  return circuit.name?.trim() || circuit.localInterface?.trim() || circuit.serviceId?.trim() || `#${circuit.id}`;
}

export function formatVlanVcVsiSummary(circuit: L2Circuit, t: TranslateFn): string {
  const parts: string[] = [];
  const vlan = formatVlan(circuit);
  if (vlan) parts.push(`${t(`${ds}.summary.vlanLabel`)} ${vlan}`);
  if (circuit.vcId) parts.push(`${t(`${ds}.summary.vcLabel`)} ${circuit.vcId}`);
  if (circuit.vsiName) parts.push(`${t(`${ds}.summary.vsiLabel`)} ${circuit.vsiName}`);
  if (circuit.vsiId && !circuit.vsiName) parts.push(`${t(`${ds}.summary.vsiLabel`)} ${circuit.vsiId}`);
  if (!parts.length) return circuitKeyField(circuit) === "—" ? t(`${ds}.summary.notApplicable`) : String(circuitKeyField(circuit));
  return parts.join(" · ");
}
