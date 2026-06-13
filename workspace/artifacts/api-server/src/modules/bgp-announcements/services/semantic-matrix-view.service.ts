import type { ParsedPolicyDependencyConfig } from "../../netops/huawei-vrp/parsers/policy-dependency-pipeline.js";
import type {
  DependencyScope,
  MatrixConflictItem,
  MatrixResponse,
  MatrixRow,
  MatrixSemanticView,
  MatrixSemanticWarnings,
  ProtectedGlobalDependency,
  TargetRole,
} from "../bgp-announcement.types.js";
import {
  collectProtectedGlobalFilterUsage,
  isSharedProtectedGlobalFilter,
} from "../resolvers/protected-global-filter.js";
import {
  classifyDependencyScope,
  enrichMatrixRowSemantics,
  getDependencyProtectionReason,
  isEditableMatrixRow,
  isProtectedGlobalDependency,
  isRealMatrixConflict,
  shouldSuppressSharedDependencyFinding,
} from "../resolvers/semantic-dependency-classifier.js";
import { countPoliciesUsingPrefixList } from "../resolvers/prefix-expansion.resolver.js";

const EMPTY_ROLE_COUNTERS = (): Record<TargetRole, number> => ({
  customer: 0,
  origin: 0,
  provider: 0,
  upstream: 0,
  ix: 0,
  cdn: 0,
  ibgp: 0,
  unknown: 0,
});

const EMPTY_SCOPE_COUNTERS = (): Record<DependencyScope, number> => ({
  circuit_specific: 0,
  customer_specific: 0,
  global_shared: 0,
  system: 0,
  unknown: 0,
});

function collectProtectedGlobals(
  rows: MatrixRow[],
  parsedConfig?: ParsedPolicyDependencyConfig,
): ProtectedGlobalDependency[] {
  const map = new Map<string, ProtectedGlobalDependency>();

  for (const row of rows) {
    const candidates = [row.prefixListName, row.prefixScope].filter(Boolean) as string[];
    for (const objectName of candidates) {
      if (!isProtectedGlobalDependency(objectName, "prefix-list")) continue;
      const usageCount = parsedConfig ? countPoliciesUsingPrefixList(parsedConfig, objectName) : 1;
      const scope = classifyDependencyScope(objectName, "prefix-list", usageCount);
      const { protection, reason } = getDependencyProtectionReason(objectName, "prefix-list", scope, usageCount);
      const existing = map.get(objectName) ?? {
        objectName,
        objectKind: "prefix-list",
        dependencyScope: scope,
        dependencyProtection: protection,
        reason,
        consumerCount: 0,
        consumers: [],
      };
      if (!existing.consumers.includes(row.routePolicyName)) {
        existing.consumers.push(row.routePolicyName);
        existing.consumerCount = existing.consumers.length;
      }
      map.set(objectName, existing);
    }
  }

  if (parsedConfig) {
    for (const usage of collectProtectedGlobalFilterUsage(parsedConfig)) {
      const scope: DependencyScope = isSharedProtectedGlobalFilter(usage) ? "global_shared" : "circuit_specific";
      const { protection, reason } = getDependencyProtectionReason(
        usage.filterName,
        "community-filter",
        scope,
        usage.policies.length,
      );
      map.set(usage.filterName, {
        objectName: usage.filterName,
        objectKind: "community-filter",
        dependencyScope: scope,
        dependencyProtection: protection,
        reason,
        consumerCount: usage.policies.length,
        consumers: [...new Set(usage.policies.map((row) => row.policy))],
      });
    }
  }

  return [...map.values()].sort((left, right) => left.objectName.localeCompare(right.objectName));
}

function collectRealConflicts(rows: MatrixRow[]): MatrixConflictItem[] {
  const conflicts: MatrixConflictItem[] = [];

  for (const row of rows) {
    if (!isRealMatrixConflict(row)) continue;
    const circuitIds = row.cells.filter((cell) => cell.state === "conflict").map((cell) => cell.circuitId);
    conflicts.push({
      targetKey: row.targetKey,
      routePolicyName: row.routePolicyName,
      node: row.node,
      family: row.family,
      targetRole: row.targetRole ?? "unknown",
      circuitIds,
      message: `Communities conflitantes para circuitos ${circuitIds.join(", ")} no node ${row.node}.`,
    });
  }

  return conflicts;
}

function buildSemanticWarnings(
  matrix: MatrixResponse,
  rows: MatrixRow[],
  protectedGlobals: ProtectedGlobalDependency[],
): MatrixSemanticWarnings {
  const operational: string[] = [];
  const insufficientData: string[] = [];
  const sharedDependency: string[] = [];
  const protectedGlobalNotices: string[] = [];

  for (const warning of matrix.meta?.warnings ?? []) {
    if (/collected_config|persistidos|snapshot|dados/i.test(warning)) {
      insufficientData.push(warning);
    } else {
      operational.push(warning);
    }
  }

  for (const finding of matrix.findings) {
    if (finding.code === "EXPORT_POLICY_EXCLUDED_FROM_ANNOUNCEMENT_MATRIX") continue;
    operational.push(finding.message);
  }

  for (const row of rows) {
    for (const finding of row.findings) {
      const dependencyName = row.prefixListName ?? row.prefixScope;
      if (shouldSuppressSharedDependencyFinding(finding.code, dependencyName)) {
        protectedGlobalNotices.push(
          `${dependencyName}: compartilhamento global esperado — não é conflito de remoção.`,
        );
        continue;
      }
      if (finding.code === "PREFIX_LIST_SHARED_BY_MULTIPLE_POLICIES") {
        sharedDependency.push(finding.message);
        continue;
      }
      if (finding.severity === "high" || finding.severity === "critical") {
        operational.push(finding.message);
      }
    }
  }

  for (const global of protectedGlobals) {
    protectedGlobalNotices.push(`${global.objectName}: ${global.reason}`);
  }

  return {
    operational: [...new Set(operational)],
    insufficientData: [...new Set(insufficientData)],
    sharedDependency: [...new Set(sharedDependency)],
    protectedGlobalNotices: [...new Set(protectedGlobalNotices)],
  };
}

export function buildSemanticMatrixView(
  matrix: MatrixResponse,
  parsedConfig?: ParsedPolicyDependencyConfig,
): MatrixSemanticView {
  const enrichedRows = matrix.rows.map((row) => enrichMatrixRowSemantics(row, parsedConfig));
  const countersByTargetRole = EMPTY_ROLE_COUNTERS();
  const countersByDependencyScope = EMPTY_SCOPE_COUNTERS();

  for (const row of enrichedRows) {
    const role = row.targetRole ?? "unknown";
    countersByTargetRole[role] += 1;
    const scope = row.dependencyScope ?? "unknown";
    countersByDependencyScope[scope] += 1;
  }

  const protectedGlobals = collectProtectedGlobals(enrichedRows, parsedConfig);
  const realConflicts = collectRealConflicts(enrichedRows);
  const warnings = buildSemanticWarnings(matrix, enrichedRows, protectedGlobals);

  return {
    countersByTargetRole,
    countersByDependencyScope,
    protectedGlobals,
    realConflicts,
    warnings,
    editableRowCount: enrichedRows.filter((row) => isEditableMatrixRow(row)).length,
    auditOnlyRowCount: enrichedRows.filter((row) => row.targetEditMode === "audit_only").length,
  };
}

export function enrichMatrixResponseSemantics(
  matrix: MatrixResponse,
  parsedConfig?: ParsedPolicyDependencyConfig,
): MatrixResponse {
  const rows = matrix.rows.map((row) => enrichMatrixRowSemantics(row, parsedConfig));
  const semanticView = buildSemanticMatrixView({ ...matrix, rows }, parsedConfig);

  return {
    ...matrix,
    rows,
    semanticView,
  };
}

export function deriveRowSemanticsForLegacySnapshot(row: MatrixRow): MatrixRow {
  return enrichMatrixRowSemantics(row);
}
