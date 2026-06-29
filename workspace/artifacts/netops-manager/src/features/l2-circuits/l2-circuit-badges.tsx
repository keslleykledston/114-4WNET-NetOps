import { Badge } from "@/components/ui/badge";
import { useTranslation } from "@/i18n";
import type { TranslationParams } from "@/i18n/types";
import type { L2CircuitType, L2Finding, L2OperationalFreshness, L2Status } from "./l2-circuits-api";

export type TranslateFn = (key: string, params?: TranslationParams) => string;

export function operStatusClass(status: L2Status | string) {
  switch (status) {
    case "UP":
      return "bg-green-500/10 text-green-400 border-green-500/20";
    case "DOWN":
      return "bg-red-500/10 text-red-400 border-red-500/20";
    case "PARTIAL":
      return "bg-amber-500/10 text-amber-300 border-amber-500/20";
    case "CONFIG_ONLY":
      return "bg-slate-500/10 text-slate-300 border-slate-500/20";
    default:
      return "bg-blue-500/10 text-blue-300 border-blue-500/20";
  }
}

export function circuitTypeClass(type: L2CircuitType | string) {
  switch (type) {
    case "vlan_local":
      return "bg-cyan-500/10 text-cyan-300 border-cyan-500/20";
    case "vlan_orphan":
    case "vlanif_orphan":
    case "vlan_not_in_switch_batch":
      return "bg-amber-500/10 text-amber-300 border-amber-500/20";
    case "l3_interface":
    case "l3_vrf_link":
      return "bg-blue-500/10 text-blue-300 border-blue-500/20";
    case "config_only":
      return "bg-slate-500/10 text-slate-300 border-slate-500/20";
    case "l2vc":
      return "bg-violet-500/10 text-violet-300 border-violet-500/20";
    case "vpws":
      return "bg-indigo-500/10 text-indigo-300 border-indigo-500/20";
    case "vsi":
      return "bg-emerald-500/10 text-emerald-300 border-emerald-500/20";
    case "vpls":
      return "bg-teal-500/10 text-teal-300 border-teal-500/20";
    default:
      return "bg-slate-500/10 text-slate-300 border-slate-500/20";
  }
}

export function circuitTypeLabel(type: L2CircuitType | string, t?: TranslateFn) {
  const key = `l2Circuits.circuitTypes.${type}`;
  if (t) {
    const translated = t(key);
    if (translated !== key) return translated;
  }
  return type;
}

export function circuitTypeGroup(type: L2CircuitType | string): "local" | "mpls" | "vsi" {
  if (type === "vlan_local" || type === "vlan_orphan" || type === "vlanif_orphan" || type === "vlan_not_in_switch_batch" || type === "dot1q_subif" || type === "vlan" || type === "l3_interface" || type === "l3_vrf_link" || type === "config_only") return "local";
  if (type === "l2vc" || type === "vpws") return "mpls";
  return "vsi";
}

export function OperStatusBadge({ status }: { status: L2Status | string }) {
  return (
    <Badge variant="outline" className={operStatusClass(status)}>
      {status}
    </Badge>
  );
}

export function CircuitTypeBadge({ type }: { type: L2CircuitType | string }) {
  const { t } = useTranslation();
  return (
    <Badge variant="outline" className={circuitTypeClass(type)}>
      {circuitTypeLabel(type, t)}
    </Badge>
  );
}

export function FreshnessBadge({ freshness }: { freshness: L2OperationalFreshness }) {
  const { t } = useTranslation();
  const cls =
    freshness === "fresh"
      ? "bg-green-500/10 text-green-400 border-green-500/20"
      : freshness === "stale"
        ? "bg-amber-500/10 text-amber-300 border-amber-500/20"
        : freshness === "expired"
          ? "bg-red-500/10 text-red-400 border-red-500/20"
          : "bg-slate-500/10 text-slate-300 border-slate-500/20";
  const label = t(`l2Circuits.freshness.${freshness}`);

  return (
    <Badge variant="outline" className={cls}>
      {label}
    </Badge>
  );
}

export function NocFindingBadges({ findings }: { findings: L2Finding[] }) {
  const { t } = useTranslation();
  const circuitDown = findings.some((f) => f.code === "CIRCUIT_DOWN" || f.code === "L2VC_DOWN" || f.code === "VSI_DOWN");
  const remoteNotForwarding = findings.some((f) => f.code === "REMOTE_NOT_FORWARDING");
  const vlanOrphan = findings.some((f) => f.code === "VLAN_ORPHAN");

  if (!circuitDown && !remoteNotForwarding && !vlanOrphan) return null;

  return (
    <div className="flex flex-wrap gap-1">
      {circuitDown && (
        <Badge variant="outline" className="bg-red-500/15 text-red-300 border-red-500/40 text-[10px] uppercase tracking-wide">
          {t("l2Circuits.findingBadges.circuitDown")}
        </Badge>
      )}
      {remoteNotForwarding && (
        <Badge variant="outline" className="bg-amber-500/15 text-amber-200 border-amber-500/40 text-[10px] uppercase tracking-wide">
          {t("l2Circuits.findingBadges.remoteNotForwarding")}
        </Badge>
      )}
      {vlanOrphan && (
        <Badge variant="outline" className="bg-orange-500/15 text-orange-200 border-orange-500/40 text-[10px] uppercase tracking-wide">
          {t("l2Circuits.findingBadges.vlanOrphan")}
        </Badge>
      )}
    </div>
  );
}

export function FindingsCountBadge({ findings }: { findings: L2Finding[] }) {
  if (!findings.length) {
    return <span className="text-xs text-muted-foreground">0</span>;
  }
  const hasError = findings.some((f) => f.severity === "error");
  const hasWarning = findings.some((f) => f.severity === "warning");
  const cls = hasError
    ? "bg-red-500/10 text-red-400 border-red-500/20"
    : hasWarning
      ? "bg-amber-500/10 text-amber-300 border-amber-500/20"
      : "bg-blue-500/10 text-blue-300 border-blue-500/20";

  return (
    <Badge variant="outline" className={cls}>
      {findings.length}
    </Badge>
  );
}

export function FindingSeverityBadge({ severity }: { severity: L2Finding["severity"] }) {
  const { t } = useTranslation();
  const cls =
    severity === "error"
      ? "bg-red-500/10 text-red-400 border-red-500/20"
      : severity === "warning"
        ? "bg-amber-500/10 text-amber-300 border-amber-500/20"
        : "bg-blue-500/10 text-blue-300 border-blue-500/20";
  const labelKey = `l2Circuits.detailSheet.severityLevels.${severity}`;
  const label = t(labelKey);
  return (
    <Badge variant="outline" className={cls}>
      {label !== labelKey ? label : severity}
    </Badge>
  );
}
