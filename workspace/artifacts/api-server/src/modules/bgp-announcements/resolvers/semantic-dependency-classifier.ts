import type { ParsedPolicyDependencyConfig } from "../../netops/huawei-vrp/parsers/policy-dependency-pipeline.js";
import type {
  DependencyProtection,
  DependencyScope,
  MatrixRow,
  PolicyClassification,
  TargetEditMode,
  TargetRole,
} from "../bgp-announcement.types.js";
import { parseCircuitPolicyName } from "../parsers/circuit-policy.parser.js";
import { classifyPolicy } from "./policy-classifier.js";
import { isProtectedGlobalCommunityFilter } from "./protected-global-filter.js";
import { countPoliciesUsingPrefixList } from "./prefix-expansion.resolver.js";

export type DependencyObjectKind =
  | "community-filter"
  | "ip-prefix"
  | "prefix-list"
  | "route-policy"
  | "community-list"
  | "as-path"
  | "unknown";

const PROTECTED_GLOBAL_PREFIX_PATTERNS: RegExp[] = [
  /^GLOBAL-/i,
  /^FULL-ROUTE-/i,
  /^IXBR-/i,
  /^DEFAULT-/i,
];

const PROTECTED_SYSTEM_PATTERNS: RegExp[] = [
  /^DENY$/i,
  /^MALHA-/i,
  /^SYSTEM-/i,
  /^BASE-/i,
];

const IBGP_PATTERNS: RegExp[] = [
  /^MALHA-/i,
  /reflect-client/i,
  /ibgp/i,
];

export function inferUpstreamRoleFromPolicyName(policyName: string): TargetRole {
  const upper = policyName.toUpperCase();
  if (/IX|PTT/.test(upper)) return "ix";
  if (/GGC|OCA|FNA|CDN/.test(upper)) return "cdn";
  if (/PNI/.test(upper)) return "provider";
  return "upstream";
}

export function classifyTargetRoleFromPolicy(
  policyName: string,
  classification: PolicyClassification,
): TargetRole {
  if (classification.policyClass === "origin_target") return "origin";
  if (classification.policyClass === "customer_import_target") return "customer";
  if (classification.policyClass === "internal_mesh") return "ibgp";

  const circuit = classification.circuit ?? parseCircuitPolicyName(policyName);
  if (circuit) {
    if (circuit.function === "EXPORT") {
      const role = inferUpstreamRoleFromPolicyName(policyName);
      if (role === "ix" || role === "cdn") return role;
      return "provider";
    }
    return "upstream";
  }

  if (IBGP_PATTERNS.some((pattern) => pattern.test(policyName))) return "ibgp";
  return "unknown";
}

export function classifyTargetEditMode(targetRole: TargetRole): TargetEditMode {
  if (targetRole === "customer" || targetRole === "origin") return "editable_future";
  if (targetRole === "provider" || targetRole === "upstream" || targetRole === "ix" || targetRole === "cdn") {
    return "audit_only";
  }
  if (targetRole === "ibgp") return "hidden";
  return "unknown";
}

export function isProtectedGlobalDependency(
  objectName: string,
  objectKind: DependencyObjectKind = "unknown",
): boolean {
  const trimmed = (objectName || "").trim();
  if (!trimmed) return false;

  if (objectKind === "community-filter" || objectKind === "unknown") {
    if (isProtectedGlobalCommunityFilter(trimmed)) return true;
  }

  if (PROTECTED_GLOBAL_PREFIX_PATTERNS.some((pattern) => pattern.test(trimmed))) return true;

  if (/^GLOBAL-/i.test(trimmed)) return true;

  return false;
}

export function isProtectedSystemDependency(objectName: string): boolean {
  const trimmed = (objectName || "").trim();
  return PROTECTED_SYSTEM_PATTERNS.some((pattern) => pattern.test(trimmed));
}

export function classifyDependencyScope(
  objectName: string,
  objectKind: DependencyObjectKind,
  usageCount = 1,
): DependencyScope {
  const trimmed = (objectName || "").trim();
  if (!trimmed) return "unknown";

  if (isProtectedSystemDependency(trimmed)) return "system";
  if (isProtectedGlobalDependency(trimmed, objectKind)) return "global_shared";

  const circuit = parseCircuitPolicyName(trimmed);
  if (circuit) return "circuit_specific";

  if (/^AS\d+-/i.test(trimmed)) return "customer_specific";

  if (usageCount > 1) return "global_shared";

  return "circuit_specific";
}

export function getDependencyProtectionReason(
  objectName: string,
  objectKind: DependencyObjectKind,
  scope: DependencyScope,
  usageCount = 1,
): { protection: DependencyProtection; reason: string } {
  if (scope === "system" || isProtectedSystemDependency(objectName)) {
    return {
      protection: "protected_system",
      reason: "Objeto de sistema/base compartilhado — não candidato a remoção.",
    };
  }

  if (isProtectedGlobalDependency(objectName, objectKind) || scope === "global_shared") {
    if (isProtectedGlobalDependency(objectName, objectKind)) {
      return {
        protection: "protected_global",
        reason: "Objeto global protegido do projeto — uso amplo esperado; não tratar como dependência exclusiva de circuito.",
      };
    }
    if (usageCount > 1) {
      return {
        protection: "shared_requires_review",
        reason: "Objeto compartilhado por múltiplos consumidores — revisar impacto antes de qualquer mudança futura.",
      };
    }
  }

  if (scope === "customer_specific") {
    return {
      protection: "removable_candidate",
      reason: "Dependência específica de cliente/origin — candidata a edição futura via import policy.",
    };
  }

  if (scope === "circuit_specific") {
    return {
      protection: "removable_candidate",
      reason: "Dependência específica de circuito — fora do escopo de remoção global.",
    };
  }

  return {
    protection: "unknown",
    reason: "Escopo de dependência não classificado.",
  };
}

export function resolveRowDependencySemantics(
  row: MatrixRow,
  parsedConfig?: ParsedPolicyDependencyConfig,
): Pick<MatrixRow, "targetRole" | "targetEditMode" | "dependencyScope" | "dependencyProtection" | "dependencyReason"> {
  const classification = parsedConfig
    ? classifyPolicy(row.routePolicyName, [], parsedConfig)
    : {
        name: row.routePolicyName,
        policyClass: row.targetType === "origin" ? "origin_target" as const :
          row.targetType === "customer" ? "customer_import_target" as const : "unknown" as const,
        modifiable: row.modifiable,
        auditOnly: !row.modifiable,
        circuit: null,
      };

  const targetRole = classifyTargetRoleFromPolicy(row.routePolicyName, classification);
  const targetEditMode = classifyTargetEditMode(targetRole);

  const dependencyName = row.prefixListName ?? row.prefixScope;
  const usageCount = parsedConfig && row.prefixListName
    ? countPoliciesUsingPrefixList(parsedConfig, row.prefixListName)
    : 1;

  const objectKind: DependencyObjectKind = row.prefixListName ? "prefix-list" : "route-policy";
  const dependencyScope = classifyDependencyScope(dependencyName, objectKind, usageCount);
  const { protection, reason } = getDependencyProtectionReason(dependencyName, objectKind, dependencyScope, usageCount);

  return {
    targetRole,
    targetEditMode,
    dependencyScope,
    dependencyProtection: protection,
    dependencyReason: reason,
  };
}

export function enrichMatrixRowSemantics(
  row: MatrixRow,
  parsedConfig?: ParsedPolicyDependencyConfig,
): MatrixRow {
  if (row.targetRole && row.targetEditMode && row.dependencyScope && row.dependencyProtection) {
    return row;
  }

  const semantics = resolveRowDependencySemantics(row, parsedConfig);
  return { ...row, ...semantics };
}

export function isEditableMatrixRow(row: MatrixRow): boolean {
  return row.targetEditMode === "editable_future" && row.modifiable;
}

export function isRealMatrixConflict(row: MatrixRow): boolean {
  if (!isEditableMatrixRow(row)) return false;
  return row.cells.some((cell) => cell.state === "conflict");
}

export function shouldSuppressSharedDependencyFinding(
  findingCode: string,
  dependencyName: string,
): boolean {
  if (findingCode !== "PREFIX_LIST_SHARED_BY_MULTIPLE_POLICIES") return false;
  return isProtectedGlobalDependency(dependencyName, "prefix-list");
}
