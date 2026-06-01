import { isIP } from "node:net";
import type {
  ProvisioningContext,
  ProvisioningRisk,
  ProvisioningTemplateDefinition,
  ProvisioningValidationItem,
} from "./provisioning.types.js";
import {
  getRequiredParameterNames,
  vendorPlatformCompatible,
} from "./provisioning-template-registry.js";
import type {
  ProvisioningFinding,
  ProvisioningFindingCode,
  ProvisioningL2vpnPreviewInput,
  ProvisioningL3vpnPreviewInput,
  ProvisioningStructuredValidationResult,
} from "./provisioning.types.js";

function isBlank(value: unknown): boolean {
  return value === undefined || value === null || String(value).trim() === "";
}

function isValidAsn(value: string): boolean {
  const asn = Number(value);
  return Number.isInteger(asn) && asn >= 1 && asn <= 4294967295;
}

function isValidVlan(value: string): boolean {
  const vlan = Number(value);
  return Number.isInteger(vlan) && vlan >= 1 && vlan <= 4094;
}

function isValidIp(value: string, family?: "ipv4" | "ipv6"): boolean {
  const trimmed = value.split("/")[0]?.trim() ?? value.trim();
  if (family === "ipv4") return isIP(trimmed) === 4;
  if (family === "ipv6") return isIP(trimmed) === 6;
  return isIP(trimmed) !== 0;
}

function interfaceExists(context: ProvisioningContext, name: string): boolean | null {
  if (!context.discoveryAvailable || !context.discovery) return null;
  return context.discovery.interfaces.some((item) => item.name?.toLowerCase() === name.toLowerCase());
}

function subinterfaceExists(context: ProvisioningContext, parent: string, vlanId: string): boolean | null {
  if (!context.discoveryAvailable || !context.discovery) return null;
  const target = `${parent}.${vlanId}`.toLowerCase();
  return context.discovery.interfaces.some((item) => item.name?.toLowerCase() === target);
}

type ValidationContext = ProvisioningContext & {
  peerContext?: ProvisioningContext | null;
  connectorAvailable?: boolean | null;
  peerConnectorAvailable?: boolean | null;
  snapshotAgeHours?: number | null;
  peerSnapshotAgeHours?: number | null;
};

function makeFinding(
  code: ProvisioningFindingCode,
  severity: ProvisioningFinding["severity"],
  message: string,
  evidence: string[],
  recommendation: string,
  blocking: boolean,
): ProvisioningFinding {
  return { code, severity, message, evidence, recommendation, blocking };
}

function pushFinding(
  findings: ProvisioningFinding[],
  findingsMap: Map<ProvisioningFindingCode, ProvisioningFinding>,
  finding: ProvisioningFinding,
): void {
  if (findingsMap.has(finding.code)) return;
  findingsMap.set(finding.code, finding);
  findings.push(finding);
}

function hasDiscovery(context: ValidationContext): boolean {
  return Boolean(context.discoveryAvailable && context.discovery);
}

function deviceLabel(context: ProvisioningContext): string {
  return `${context.device.hostname}${context.device.ipAddress ? ` (${context.device.ipAddress})` : ""}`;
}

function validateInterfaceDiscovery(
  context: ValidationContext,
  interfaceName: string,
  label: string,
  findings: ProvisioningFinding[],
  findingsMap: Map<ProvisioningFindingCode, ProvisioningFinding>,
  validations: ProvisioningValidationItem[],
  blockedReasons: string[],
): void {
  if (!hasDiscovery(context) || isBlank(interfaceName)) return;
  const exists = interfaceExists(context, interfaceName);
  const passed = exists !== false;
  validations.push({
    name: label,
    passed,
    message: passed ? `Interface ${interfaceName} found in snapshot` : `Interface ${interfaceName} not found in snapshot`,
    severity: passed ? "info" : "error",
  });
  if (exists === false) {
    const finding = makeFinding(
      "INTERFACE_NOT_FOUND",
      "error",
      `Interface ${interfaceName} not found on ${context.device.hostname}.`,
      [`snapshot.deviceId=${context.device.id}`, `interface=${interfaceName}`],
      "Refresh discovery and verify the target interface before approval.",
      true,
    );
    pushFinding(findings, findingsMap, finding);
    blockedReasons.push(finding.message);
  }
}

function validateSnapshotFreshness(
  context: ValidationContext,
  label: string,
  findings: ProvisioningFinding[],
  findingsMap: Map<ProvisioningFindingCode, ProvisioningFinding>,
): void {
  const ageHours = context.snapshotAgeHours;
  if (ageHours === null || ageHours === undefined) return;
  if (ageHours <= 24) return;
  const finding = makeFinding(
    "SNAPSHOT_STALE",
    "warn",
    `${label} discovery snapshot is ${Math.round(ageHours)}h old.`,
    [`snapshot_age_hours=${Math.round(ageHours)}`],
    "Refresh discovery before approval to avoid stale interface and policy data.",
    true,
  );
  pushFinding(findings, findingsMap, finding);
}

function validateConnectorAvailability(
  context: ValidationContext,
  label: string,
  findings: ProvisioningFinding[],
  findingsMap: Map<ProvisioningFindingCode, ProvisioningFinding>,
): void {
  if (context.connectorAvailable !== false) return;
  const finding = makeFinding(
    "CONNECTOR_UNAVAILABLE",
    "error",
    `${label} connector is unavailable.`,
    [`device=${context.device.hostname}`],
    "Restore connector connectivity or move the job to a reachable target before approval.",
    true,
  );
  pushFinding(findings, findingsMap, finding);
}

function validateVlanConflict(
  context: ValidationContext,
  vlanValue: string,
  label: string,
  findings: ProvisioningFinding[],
  findingsMap: Map<ProvisioningFindingCode, ProvisioningFinding>,
): void {
  if (!hasDiscovery(context) || isBlank(vlanValue)) return;
  const vlan = Number(vlanValue);
  if (!Number.isInteger(vlan)) return;
  const conflict = context.discovery!.interfaces.find((item) => item.vlan === vlan || item.vlanId === vlan);
  if (!conflict) return;
  const finding = makeFinding(
    "VLAN_CONFLICT",
    "error",
    `${label} VLAN ${vlan} already appears in discovery on ${conflict.name}.`,
    [`conflict_interface=${conflict.name}`, `vlan=${vlan}`],
    "Choose a free VLAN or free the existing service before approval.",
    true,
  );
  pushFinding(findings, findingsMap, finding);
}

function validateSubinterfaceConflict(
  context: ValidationContext,
  parentInterface: string,
  vlanValue: string,
  findings: ProvisioningFinding[],
  findingsMap: Map<ProvisioningFindingCode, ProvisioningFinding>,
): void {
  if (!hasDiscovery(context) || isBlank(parentInterface) || isBlank(vlanValue)) return;
  const exists = subinterfaceExists(context, parentInterface, vlanValue);
  if (!exists) return;
  const finding = makeFinding(
    "SUBINTERFACE_EXISTS",
    "error",
    `Subinterface ${parentInterface}.${vlanValue} already exists.`,
    [`parent_interface=${parentInterface}`, `vlan=${vlanValue}`],
    "Use a free subinterface or remove the existing one before approval.",
    true,
  );
  pushFinding(findings, findingsMap, finding);
}

function validateBgpPeerConflict(
  context: ValidationContext,
  peerIp: string,
  findings: ProvisioningFinding[],
  findingsMap: Map<ProvisioningFindingCode, ProvisioningFinding>,
): void {
  if (!hasDiscovery(context) || isBlank(peerIp)) return;
  const exists = context.discovery!.bgpPeers.some((peer) => peer.peerIp === peerIp);
  if (!exists) return;
  pushFinding(findings, findingsMap, makeFinding(
    "BGP_PEER_EXISTS",
    "warn",
    `BGP peer ${peerIp} already exists in discovery.`,
    [`peer_ip=${peerIp}`],
    "Re-use the existing peer definition or adjust the new service parameters.",
    false,
  ));
}

function validateNamedResource(
  context: ValidationContext,
  resource: "policies" | "prefixLists" | "communities",
  resourceName: string,
  findings: ProvisioningFinding[],
  findingsMap: Map<ProvisioningFindingCode, ProvisioningFinding>,
  code: ProvisioningFindingCode,
  messagePrefix: string,
): void {
  if (!hasDiscovery(context) || isBlank(resourceName)) return;
  const list = context.discovery![resource];
  const exists = list.some((item: { name?: string }) => item.name?.toLowerCase() === resourceName.toLowerCase());
  if (exists) return;
  pushFinding(findings, findingsMap, makeFinding(
    code,
    "warn",
    `${messagePrefix} ${resourceName} not found in discovery.`,
    [`resource=${resourceName}`],
    "Synchronize discovery or adjust the referenced policy/filter before approval.",
    false,
  ));
}

function validateVrfConflict(
  context: ValidationContext,
  vrfName: string,
  findings: ProvisioningFinding[],
  findingsMap: Map<ProvisioningFindingCode, ProvisioningFinding>,
): void {
  if (!hasDiscovery(context) || isBlank(vrfName)) return;
  const exists = context.discovery!.vrfs.some((vrf) => vrf.name.toLowerCase() === vrfName.toLowerCase());
  if (!exists) return;
  pushFinding(findings, findingsMap, makeFinding(
    "VRF_CONFLICT",
    "error",
    `VRF ${vrfName} already exists in discovery.`,
    [`vrf=${vrfName}`],
    "Choose a new VRF name or remove the existing instance before approval.",
    true,
  ));
}

function validateRdConflict(
  context: ValidationContext,
  rd: string,
  findings: ProvisioningFinding[],
  findingsMap: Map<ProvisioningFindingCode, ProvisioningFinding>,
): void {
  if (!hasDiscovery(context) || isBlank(rd)) return;
  const exists = context.discovery!.vrfs.some((vrf) => String(vrf.rd ?? "").toLowerCase() === rd.toLowerCase());
  if (!exists) return;
  pushFinding(findings, findingsMap, makeFinding(
    "RD_CONFLICT",
    "error",
    `Route distinguisher ${rd} is already in use.`,
    [`rd=${rd}`],
    "Select a unique route distinguisher before approval.",
    true,
  ));
}

function validateRtConflict(
  context: ValidationContext,
  rt: string,
  label: string,
  findings: ProvisioningFinding[],
  findingsMap: Map<ProvisioningFindingCode, ProvisioningFinding>,
): void {
  if (!hasDiscovery(context) || isBlank(rt)) return;
  const seen = context.discovery!.vrfs.some((vrf) => [vrf.rd, vrf.name].some((item) => String(item ?? "").toLowerCase() === rt.toLowerCase()));
  if (!seen) return;
  pushFinding(findings, findingsMap, makeFinding(
    "RT_CONFLICT",
    "warn",
    `${label} ${rt} already appears in discovery.`,
    [`rt=${rt}`],
    "Confirm the RT is intended or choose a unique one.",
    false,
  ));
}

function baseStructuredResult(): ProvisioningStructuredValidationResult {
  return { validations: [], findings: [], risks: [], missingData: [], blockedReasons: [] };
}

export function validateL2vpnPreviewRequest(
  input: ProvisioningL2vpnPreviewInput,
  context: ValidationContext,
): ProvisioningStructuredValidationResult {
  const result = baseStructuredResult();
  const findingsMap = new Map<ProvisioningFindingCode, ProvisioningFinding>();

  result.validations.push({
    name: "Device A exists",
    passed: true,
    message: deviceLabel(context),
    severity: "info",
  });

  if (context.peerContext) {
    result.validations.push({
      name: "Device B exists",
      passed: true,
      message: deviceLabel(context.peerContext),
      severity: "info",
    });
  }

  if (context.discoveryAvailable) {
    validateSnapshotFreshness(context, "Primary", result.findings, findingsMap);
    validateConnectorAvailability(context, "Primary", result.findings, findingsMap);
  } else {
    pushFinding(result.findings, findingsMap, makeFinding(
      "DEVICE_UNREACHABLE",
      "error",
      `Discovery snapshot is unavailable for ${context.device.hostname}.`,
      [`device=${context.device.hostname}`],
      "Run discovery before approval.",
      true,
    ));
  }

  if (context.peerContext?.discoveryAvailable) {
    validateSnapshotFreshness(context.peerContext as ValidationContext, "Peer", result.findings, findingsMap);
    validateConnectorAvailability(context.peerContext as ValidationContext, "Peer", result.findings, findingsMap);
  }

  const parameters = input.parameters;
  const missing = ["customerName", "deviceA", "interfaceA", "vlanA", "deviceB", "interfaceB", "vlanB", "type", "serviceId"].filter(
    (key) => isBlank((parameters as Record<string, unknown>)[key]),
  );
  result.missingData.push(...missing);
  result.validations.push({
    name: "Required parameters",
    passed: missing.length === 0,
    message: missing.length === 0 ? "All required parameters present" : `Missing: ${missing.join(", ")}`,
    severity: missing.length === 0 ? "info" : "error",
  });
  if (missing.length > 0) {
    result.blockedReasons.push(`Missing required parameters: ${missing.join(", ")}`);
  }

  validateInterfaceDiscovery(context, String(parameters.interfaceA ?? ""), "Interface A", result.findings, findingsMap, result.validations, result.blockedReasons);
  if (context.peerContext) {
    validateInterfaceDiscovery(context.peerContext as ValidationContext, String(parameters.interfaceB ?? ""), "Interface B", result.findings, findingsMap, result.validations, result.blockedReasons);
  }

  validateVlanConflict(context, String(parameters.vlanA ?? ""), "Device A", result.findings, findingsMap);
  validateVlanConflict(context.peerContext ?? context, String(parameters.vlanB ?? ""), "Device B", result.findings, findingsMap);
  validateSubinterfaceConflict(context, String(parameters.interfaceA ?? ""), String(parameters.vlanA ?? ""), result.findings, findingsMap);
  if (context.peerContext) {
    validateSubinterfaceConflict(context.peerContext as ValidationContext, String(parameters.interfaceB ?? ""), String(parameters.vlanB ?? ""), result.findings, findingsMap);
  }

  const serviceType = String(parameters.type ?? "");
  if (serviceType === "vpws" || serviceType === "l2vc") {
    validateBgpPeerConflict(context, String(parameters.remotePeer ?? ""), result.findings, findingsMap);
  }

  const l2vcId = String(parameters.serviceId ?? "");
  if (hasDiscovery(context) && l2vcId) {
    const existingL2vc = context.discovery!.l2vpn.l2vcs.some((item) => item.vcId?.toLowerCase() === l2vcId.toLowerCase() || item.name.toLowerCase() === l2vcId.toLowerCase());
    if (existingL2vc) {
      pushFinding(result.findings, findingsMap, makeFinding(
        "L2VC_ID_CONFLICT",
        "error",
        `L2VC/service ID ${l2vcId} already exists.`,
        [`service_id=${l2vcId}`],
        "Select a unique L2VC/service ID before approval.",
        true,
      ));
    }
  }

  if (serviceType === "vpls" || serviceType === "vsi") {
    if (hasDiscovery(context) && l2vcId) {
      const existingVsi = context.discovery!.l2vpn.vsis.some((item) => item.name.toLowerCase() === l2vcId.toLowerCase());
      if (existingVsi) {
        pushFinding(result.findings, findingsMap, makeFinding(
          "VSI_NAME_CONFLICT",
          "error",
          `VSI name ${l2vcId} already exists.`,
          [`vsi=${l2vcId}`],
          "Pick a unique VSI name or adjust the service ID.",
          true,
        ));
      }
    }
  }

  const finalFindings = result.findings;
  if (context.discoveryAvailable) {
    validateNamedResource(context, "policies", String((parameters as Record<string, unknown>).importRoutePolicy ?? ""), finalFindings, findingsMap, "ROUTE_POLICY_MISSING", "Route-policy");
    validateNamedResource(context, "policies", String((parameters as Record<string, unknown>).exportRoutePolicy ?? ""), finalFindings, findingsMap, "ROUTE_POLICY_MISSING", "Route-policy");
    validateNamedResource(context, "prefixLists", String((parameters as Record<string, unknown>).prefixList ?? ""), finalFindings, findingsMap, "PREFIX_LIST_MISSING", "Prefix-list");
    validateNamedResource(context, "communities", String((parameters as Record<string, unknown>).communityFilter ?? ""), finalFindings, findingsMap, "COMMUNITY_FILTER_MISSING", "Community-filter");
  }

  return result;
}

export function validateL3vpnPreviewRequest(
  input: ProvisioningL3vpnPreviewInput,
  context: ValidationContext,
): ProvisioningStructuredValidationResult {
  const result = baseStructuredResult();
  const findingsMap = new Map<ProvisioningFindingCode, ProvisioningFinding>();

  result.validations.push({
    name: "Device exists",
    passed: true,
    message: deviceLabel(context),
    severity: "info",
  });

  validateSnapshotFreshness(context, "Primary", result.findings, findingsMap);
  validateConnectorAvailability(context, "Primary", result.findings, findingsMap);
  validateInterfaceDiscovery(context, String(input.parameters.interfaceName ?? ""), "Interface", result.findings, findingsMap, result.validations, result.blockedReasons);

  const parameters = input.parameters;
  const missing = ["customerName", "interfaceName", "vlan", "vrfName", "rd", "rtImport", "rtExport", "ipWan", "peerBgp", "remoteAsn", "importRoutePolicy", "exportRoutePolicy"].filter(
    (key) => isBlank((parameters as Record<string, unknown>)[key]),
  );
  result.missingData.push(...missing);
  result.validations.push({
    name: "Required parameters",
    passed: missing.length === 0,
    message: missing.length === 0 ? "All required parameters present" : `Missing: ${missing.join(", ")}`,
    severity: missing.length === 0 ? "info" : "error",
  });
  if (missing.length > 0) {
    result.blockedReasons.push(`Missing required parameters: ${missing.join(", ")}`);
  }

  validateVlanConflict(context, String(parameters.vlan ?? ""), "L3VPN", result.findings, findingsMap);
  validateSubinterfaceConflict(context, String(parameters.interfaceName ?? ""), String(parameters.vlan ?? ""), result.findings, findingsMap);
  validateVrfConflict(context, String(parameters.vrfName ?? ""), result.findings, findingsMap);
  validateRdConflict(context, String(parameters.rd ?? ""), result.findings, findingsMap);
  validateRtConflict(context, String(parameters.rtImport ?? ""), "RT import", result.findings, findingsMap);
  validateRtConflict(context, String(parameters.rtExport ?? ""), "RT export", result.findings, findingsMap);
  validateBgpPeerConflict(context, String(parameters.peerBgp ?? ""), result.findings, findingsMap);

  if (hasDiscovery(context)) {
    validateNamedResource(context, "policies", String(parameters.importRoutePolicy ?? ""), result.findings, findingsMap, "ROUTE_POLICY_MISSING", "Route-policy");
    validateNamedResource(context, "policies", String(parameters.exportRoutePolicy ?? ""), result.findings, findingsMap, "ROUTE_POLICY_MISSING", "Route-policy");
    validateNamedResource(context, "prefixLists", String(parameters.prefixList ?? ""), result.findings, findingsMap, "PREFIX_LIST_MISSING", "Prefix-list");
    validateNamedResource(context, "communities", String(parameters.communityFilter ?? ""), result.findings, findingsMap, "COMMUNITY_FILTER_MISSING", "Community-filter");
  }

  return result;
}

export function validateProvisioningParameters(
  template: ProvisioningTemplateDefinition,
  parameters: Record<string, unknown>,
  context: ProvisioningContext,
): {
  validations: ProvisioningValidationItem[];
  risks: ProvisioningRisk[];
  missingData: string[];
  blockedReasons: string[];
} {
  const validations: ProvisioningValidationItem[] = [];
  const risks: ProvisioningRisk[] = template.risks.map((message, index) => ({
    code: `template_risk_${index + 1}`,
    message,
    severity: "warn" as const,
  }));
  const missingData: string[] = [];
  const blockedReasons: string[] = [];

  validations.push({
    name: "Device exists",
    passed: true,
    message: `${context.device.hostname} (${context.device.ipAddress})`,
    severity: "info",
  });

  const vendorOk = vendorPlatformCompatible(template, context);
  validations.push({
    name: "Vendor/platform compatibility",
    passed: vendorOk,
    message: vendorOk
      ? `${context.device.vendor}/${context.device.platform} compatible with ${template.vendor}/${template.platform}`
      : `Device ${context.device.vendor}/${context.device.platform} incompatible with template ${template.vendor}/${template.platform}`,
    severity: vendorOk ? "info" : "error",
  });
  if (!vendorOk) {
    blockedReasons.push("Vendor/platform incompatible with selected template");
  }

  for (const key of getRequiredParameterNames(template)) {
    if (isBlank(parameters[key])) {
      missingData.push(key);
    }
  }

  validations.push({
    name: "Required parameters",
    passed: missingData.length === 0,
    message: missingData.length === 0
      ? "All required parameters present"
      : `Missing: ${missingData.join(", ")}`,
    severity: missingData.length === 0 ? "info" : "error",
  });
  if (missingData.length > 0) {
    blockedReasons.push(`Missing required parameters: ${missingData.join(", ")}`);
  }

  if (!isBlank(parameters.remoteAs) && !isValidAsn(String(parameters.remoteAs))) {
    validations.push({
      name: "Remote ASN",
      passed: false,
      message: "Invalid remote ASN",
      severity: "error",
    });
    blockedReasons.push("Invalid remote ASN");
  }

  if (!isBlank(parameters.localAs) && !isValidAsn(String(parameters.localAs))) {
    validations.push({
      name: "Local ASN",
      passed: false,
      message: "Invalid local ASN",
      severity: "error",
    });
    blockedReasons.push("Invalid local ASN");
  }

  if (!isBlank(parameters.peerIp)) {
    const family = String(parameters.addressFamily ?? "ipv4") === "ipv6" ? "ipv6" : "ipv4";
    const peerOk = isValidIp(String(parameters.peerIp), family);
    validations.push({
      name: "Peer IP",
      passed: peerOk,
      message: peerOk ? `Peer IP valid (${family})` : `Invalid peer IP for ${family}`,
      severity: peerOk ? "info" : "error",
    });
    if (!peerOk) blockedReasons.push("Invalid peer IP");
  }

  if (!isBlank(parameters.remotePeerIp) && !isValidIp(String(parameters.remotePeerIp), "ipv4")) {
    validations.push({
      name: "Remote peer IP",
      passed: false,
      message: "Invalid remote peer IP",
      severity: "error",
    });
    blockedReasons.push("Invalid remote peer IP");
  }

  if (!isBlank(parameters.ipAddress) && !isValidIp(String(parameters.ipAddress))) {
    validations.push({
      name: "IP address",
      passed: false,
      message: "Invalid IP address/mask",
      severity: "error",
    });
    blockedReasons.push("Invalid IP address");
  }

  if (!isBlank(parameters.vlanId) && !isValidVlan(String(parameters.vlanId))) {
    validations.push({
      name: "VLAN ID",
      passed: false,
      message: "VLAN must be between 1 and 4094",
      severity: "error",
    });
    blockedReasons.push("Invalid VLAN ID");
  }

  if (!context.discoveryAvailable) {
    validations.push({
      name: "Discovery snapshot",
      passed: true,
      message: "No discovery snapshot available — conflict checks skipped (warning only)",
      severity: "warn",
    });
    risks.push({
      code: "discovery_missing",
      message: "Discovery data unavailable; VLAN/VRF/BGP conflict checks not fully verified.",
      severity: "warn",
    });
  } else {
    validations.push({
      name: "Discovery snapshot",
      passed: true,
      message: "Discovery snapshot loaded for pre-check hints",
      severity: "info",
    });
  }

  if (!isBlank(parameters.vrfName) && context.discoveryAvailable && context.discovery) {
    const exists = context.discovery.vrfs.some((vrf) => vrf.name.toLowerCase() === String(parameters.vrfName).toLowerCase());
    if (exists) {
      validations.push({
        name: "VRF duplication",
        passed: true,
        message: `VRF ${parameters.vrfName} already exists on device (warning)`,
        severity: "warn",
      });
      risks.push({
        code: "vrf_exists",
        message: `VRF ${parameters.vrfName} already present in discovery snapshot.`,
        severity: "warn",
      });
    }
  }

  if (!isBlank(parameters.vpnInstance) && context.discoveryAvailable && context.discovery) {
    const exists = context.discovery.vrfs.some((vrf) => vrf.name.toLowerCase() === String(parameters.vpnInstance).toLowerCase());
    if (!exists) {
      validations.push({
        name: "VPN instance reference",
        passed: true,
        message: `VPN instance ${parameters.vpnInstance} not found in discovery (warning)`,
        severity: "warn",
      });
      risks.push({
        code: "vpn_instance_missing",
        message: `VPN instance ${parameters.vpnInstance} not found in discovery snapshot.`,
        severity: "warn",
      });
    }
  }

  if (!isBlank(parameters.peerIp) && context.discoveryAvailable && context.discovery) {
    const exists = context.discovery.bgpPeers.some((peer) => peer.peerIp === String(parameters.peerIp));
    if (exists) {
      validations.push({
        name: "BGP peer duplication",
        passed: true,
        message: `Peer ${parameters.peerIp} already present (warning)`,
        severity: "warn",
      });
      risks.push({
        code: "bgp_peer_exists",
        message: `BGP peer ${parameters.peerIp} already exists in discovery snapshot.`,
        severity: "warn",
      });
    }
  }

  if (!isBlank(parameters.parentInterface)) {
    const parentExists = interfaceExists(context, String(parameters.parentInterface));
    if (parentExists === false) {
      validations.push({
        name: "Parent interface",
        passed: true,
        message: `Parent interface ${parameters.parentInterface} not found in discovery (warning)`,
        severity: "warn",
      });
      risks.push({
        code: "parent_interface_missing",
        message: `Parent interface ${parameters.parentInterface} not found in discovery snapshot.`,
        severity: "warn",
      });
    }
  }

  if (!isBlank(parameters.parentInterface) && !isBlank(parameters.vlanId)) {
    const exists = subinterfaceExists(context, String(parameters.parentInterface), String(parameters.vlanId));
    if (exists) {
      validations.push({
        name: "Subinterface duplication",
        passed: true,
        message: `Subinterface ${parameters.parentInterface}.${parameters.vlanId} already exists (warning)`,
        severity: "warn",
      });
      risks.push({
        code: "subinterface_exists",
        message: `Subinterface ${parameters.parentInterface}.${parameters.vlanId} already exists in discovery snapshot.`,
        severity: "warn",
      });
    }
  }

  if (!isBlank(parameters.interfaceName)) {
    const exists = interfaceExists(context, String(parameters.interfaceName));
    if (exists === false) {
      validations.push({
        name: "Interface reference",
        passed: true,
        message: `Interface ${parameters.interfaceName} not found in discovery (warning)`,
        severity: "warn",
      });
      risks.push({
        code: "interface_missing",
        message: `Interface ${parameters.interfaceName} not found in discovery snapshot.`,
        severity: "warn",
      });
    }
  }

  for (const [paramName, policyNameRaw] of [
    ["importPolicy", parameters.importPolicy],
    ["exportPolicy", parameters.exportPolicy],
    ["policyName", parameters.policyName],
  ] as const) {
    if (isBlank(policyNameRaw) || !context.discoveryAvailable || !context.discovery) continue;
    const policyName = String(policyNameRaw);
    const exists = context.discovery.policies.some((policy) => policy.name.toLowerCase() === policyName.toLowerCase());
    if (!exists) {
      validations.push({
        name: `Route-policy reference (${paramName})`,
        passed: true,
        message: `Route-policy ${policyName} not found in discovery (warning)`,
        severity: "warn",
      });
      risks.push({
        code: "route_policy_missing",
        message: `Route-policy ${policyName} not found in discovery snapshot.`,
        severity: "warn",
      });
    }
  }

  if (!isBlank(parameters.filterName) && context.discoveryAvailable && context.discovery) {
    const filterName = String(parameters.filterName);
    const exists = context.discovery.communities.some((item) => item.name.toLowerCase() === filterName.toLowerCase());
    if (!exists) {
      risks.push({
        code: "community_filter_missing",
        message: `Community-filter ${filterName} not found in discovery snapshot.`,
        severity: "warn",
      });
    }
  }

  if (!isBlank(parameters.listName) && context.discoveryAvailable && context.discovery) {
    const listName = String(parameters.listName);
    const exists = context.discovery.prefixLists.some((item) => item.name.toLowerCase() === listName.toLowerCase());
    if (!exists) {
      risks.push({
        code: "prefix_list_missing",
        message: `Prefix-list ${listName} not found in discovery snapshot.`,
        severity: "warn",
      });
    }
  }

  if (!isBlank(parameters.ifMatchPrefix) && context.discoveryAvailable && context.discovery) {
    const prefixName = String(parameters.ifMatchPrefix);
    const exists = context.discovery.prefixLists.some((item) => item.name.toLowerCase() === prefixName.toLowerCase());
    if (!exists) {
      risks.push({
        code: "prefix_list_reference_missing",
        message: `Referenced prefix-list ${prefixName} not found in discovery snapshot.`,
        severity: "warn",
      });
    }
  }

  if (!context.device.ipAddress) {
    risks.push({
      code: "device_ip_missing",
      message: "Device IP missing — future apply pre-check may fail.",
      severity: "warn",
    });
  }

  return { validations, risks, missingData, blockedReasons };
}

export function derivePreviewStatus(
  blockedReasons: string[],
  risks: ProvisioningRisk[],
): "valid" | "warning" | "blocked" {
  if (blockedReasons.length > 0) return "blocked";
  if (risks.some((risk) => risk.severity === "warn" || risk.severity === "error")) return "warning";
  return "valid";
}
