import type { BgpPeerDrilldownResult } from "./bgp-peer-drilldown.types.js";

export type BgpPeerDrilldownHistoryCompareResult = {
  left: { id: number; collectedAt: string; configBuildSource: string };
  right: { id: number; collectedAt: string; configBuildSource: string };
  importPolicyChanges: Array<{ afiSafi: string; vrf: string | null; left: string | null; right: string | null }>;
  exportPolicyChanges: Array<{ afiSafi: string; vrf: string | null; left: string | null; right: string | null }>;
  enabledFamilyChanges: Array<{ afiSafi: string; vrf: string | null; left: boolean; right: boolean }>;
  warningsAdded: string[];
  warningsRemoved: string[];
};

function familyKey(afiSafi: string, vrf: string | null): string {
  return `${afiSafi}::${vrf ?? ""}`;
}

export function compareBgpPeerDrilldownSnapshots(
  leftId: number,
  rightId: number,
  left: BgpPeerDrilldownResult,
  right: BgpPeerDrilldownResult,
): BgpPeerDrilldownHistoryCompareResult {
  const leftFamilies = new Map(left.families.map((f) => [familyKey(f.afiSafi, f.vrf), f]));
  const rightFamilies = new Map(right.families.map((f) => [familyKey(f.afiSafi, f.vrf), f]));
  const keys = new Set([...leftFamilies.keys(), ...rightFamilies.keys()]);

  const importPolicyChanges: BgpPeerDrilldownHistoryCompareResult["importPolicyChanges"] = [];
  const exportPolicyChanges: BgpPeerDrilldownHistoryCompareResult["exportPolicyChanges"] = [];
  const enabledFamilyChanges: BgpPeerDrilldownHistoryCompareResult["enabledFamilyChanges"] = [];

  for (const key of keys) {
    const lf = leftFamilies.get(key);
    const rf = rightFamilies.get(key);
    const afiSafi = lf?.afiSafi ?? rf?.afiSafi ?? "unknown";
    const vrf = lf?.vrf ?? rf?.vrf ?? null;
    const leftImport = lf?.effectiveImportPolicy ?? lf?.importPolicy ?? null;
    const rightImport = rf?.effectiveImportPolicy ?? rf?.importPolicy ?? null;
    const leftExport = lf?.effectiveExportPolicy ?? lf?.exportPolicy ?? null;
    const rightExport = rf?.effectiveExportPolicy ?? rf?.exportPolicy ?? null;
    if (leftImport !== rightImport) {
      importPolicyChanges.push({ afiSafi, vrf, left: leftImport, right: rightImport });
    }
    if (leftExport !== rightExport) {
      exportPolicyChanges.push({ afiSafi, vrf, left: leftExport, right: rightExport });
    }
    if (Boolean(lf?.enabled) !== Boolean(rf?.enabled)) {
      enabledFamilyChanges.push({ afiSafi, vrf, left: Boolean(lf?.enabled), right: Boolean(rf?.enabled) });
    }
  }

  const leftWarnings = new Set(left.warnings);
  const rightWarnings = new Set(right.warnings);

  return {
    left: { id: leftId, collectedAt: left.collectedAt, configBuildSource: left.configBuildSource },
    right: { id: rightId, collectedAt: right.collectedAt, configBuildSource: right.configBuildSource },
    importPolicyChanges,
    exportPolicyChanges,
    enabledFamilyChanges,
    warningsAdded: [...rightWarnings].filter((w) => !leftWarnings.has(w)),
    warningsRemoved: [...leftWarnings].filter((w) => !rightWarnings.has(w)),
  };
}
