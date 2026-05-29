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
