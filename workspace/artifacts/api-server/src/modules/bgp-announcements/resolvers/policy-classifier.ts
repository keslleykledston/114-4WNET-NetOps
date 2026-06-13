import type { ParsedPolicyDependencyConfig } from "../../netops/huawei-vrp/parsers/policy-dependency-pipeline.js";
import type { BgpNetworkStatement, PolicyClass, PolicyClassification } from "../bgp-announcement.types.js";
import { parseCircuitPolicyName } from "../parsers/circuit-policy.parser.js";

const RE_ORIGIN = /^ORIGIN-/i;
const RE_CUSTOMER_IMPORT = /^AS(\d+)-.+Import/i;
const RE_CUSTOMER_EXPORT = /^AS(\d+)-.+Export/i;
const RE_MALHA = /^MALHA-/i;
const RE_INTERNAL_MESH = /reflect-client|ibgp/i;

export function classifyPolicy(
  policyName: string,
  networks: BgpNetworkStatement[],
  parsedConfig: ParsedPolicyDependencyConfig,
): PolicyClassification {
  const circuit = parseCircuitPolicyName(policyName);

  if (circuit) {
    const policyClass: PolicyClass = circuit.function === "EXPORT" ? "upstream_export_audit" : "upstream_import_audit";
    return { name: policyName, policyClass, modifiable: false, auditOnly: true, circuit };
  }

  if (RE_MALHA.test(policyName) || RE_INTERNAL_MESH.test(policyName)) {
    return { name: policyName, policyClass: "internal_mesh", modifiable: false, auditOnly: true, circuit: null };
  }

  const isOriginByNetwork = networks.some((n) => n.routePolicyName === policyName);
  if (RE_ORIGIN.test(policyName) || isOriginByNetwork) {
    return { name: policyName, policyClass: "origin_target", modifiable: true, auditOnly: false, circuit: null };
  }

  const bindings = parsedConfig.dependency_graph.bgp_policy_bindings.filter((binding) => binding.routePolicy === policyName);
  const hasExportBinding = bindings.some((binding) => binding.direction === "export");
  const hasImportBinding = bindings.some((binding) => binding.direction === "import");

  if (hasExportBinding || RE_CUSTOMER_EXPORT.test(policyName)) {
    return { name: policyName, policyClass: "customer_export", modifiable: false, auditOnly: true, circuit: null };
  }

  if (hasImportBinding || RE_CUSTOMER_IMPORT.test(policyName)) {
    return { name: policyName, policyClass: "customer_import_target", modifiable: true, auditOnly: false, circuit: null };
  }

  return { name: policyName, policyClass: "unknown", modifiable: false, auditOnly: true, circuit: null };
}

export function isModifiableTarget(classification: PolicyClassification): boolean {
  return classification.modifiable && !classification.auditOnly;
}

export function isUpstreamAuditPolicy(classification: PolicyClassification): boolean {
  return classification.policyClass === "upstream_export_audit" || classification.policyClass === "upstream_import_audit";
}

export function shouldIncludeInAnnouncementMatrix(classification: PolicyClassification): boolean {
  if (classification.auditOnly) return false;
  if (!classification.modifiable) return false;
  if (classification.policyClass === "origin_target") return true;
  return classification.policyClass === "customer_import_target";
}
