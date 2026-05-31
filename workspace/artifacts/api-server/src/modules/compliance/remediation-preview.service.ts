export interface RemediationSuggestion {
  ruleId: string;
  title: string;
  cliSuggestion: string;
  explanation: string;
  severity: string;
}

function extractObjectName(message: string): string | null {
  const peerMatch = message.match(/peer\s+([\d\.]+)/i);
  if (peerMatch) return peerMatch[1];

  const interfaceMatch = message.match(/interface\s+(\S+)/i);
  if (interfaceMatch) return interfaceMatch[1];

  const vrfMatch = message.match(/vrf\s+(\S+)/i);
  if (vrfMatch) return vrfMatch[1];

  return null;
}

const REMEDIATION_TEMPLATES: Record<string, (objectName: string | null) => RemediationSuggestion | null> = {
  "huawei-interface-active-description": (objectName) => ({
    ruleId: "huawei-interface-active-description",
    title: "Interface Missing Description",
    cliSuggestion: objectName
      ? `interface ${objectName}\n description PORT_DESCRIPTION`
      : "interface <name>\n description <description>",
    explanation: "Active interfaces must have a description for operational clarity and documentation.",
    severity: "medium",
  }),

  "huawei-bgp-customer-import-policy": (objectName) => ({
    ruleId: "huawei-bgp-customer-import-policy",
    title: "BGP Customer Missing Import Policy",
    cliSuggestion: objectName
      ? `peer ${objectName} route-policy IMPORT_POLICY import`
      : "peer <ip> route-policy <policy-name> import",
    explanation: "Customer BGP peers must have import policies to filter and control inbound routes.",
    severity: "high",
  }),

  "huawei-bgp-transit-export-policy": (objectName) => ({
    ruleId: "huawei-bgp-transit-export-policy",
    title: "BGP Transit/Provider Missing Export Policy",
    cliSuggestion: objectName
      ? `peer ${objectName} route-policy EXPORT_POLICY export`
      : "peer <ip> route-policy <policy-name> export",
    explanation: "Transit/Provider BGP peers must have export policies to control outbound route advertisement.",
    severity: "high",
  }),

  "huawei-vrf-rd": (objectName) => ({
    ruleId: "huawei-vrf-rd",
    title: "VRF Missing Route Distinguisher",
    cliSuggestion: objectName
      ? `ip vpn-instance ${objectName}\n route-distinguisher <asn>:<id>`
      : "ip vpn-instance <vrf-name>\n route-distinguisher <rd>",
    explanation: "VRF must have a Route Distinguisher (RD) for unique identification in MPLS networks.",
    severity: "high",
  }),

  "huawei-vrf-rt-import": (objectName) => ({
    ruleId: "huawei-vrf-rt-import",
    title: "VRF Missing RT Import",
    cliSuggestion: objectName
      ? `ip vpn-instance ${objectName}\n vpn-target <asn>:<id> import-extcommunity`
      : "ip vpn-instance <vrf-name>\n vpn-target <rt> import-extcommunity",
    explanation: "VRF must have RT Import configuration to accept routes from other VRFs.",
    severity: "medium",
  }),

  "huawei-vrf-rt-export": (objectName) => ({
    ruleId: "huawei-vrf-rt-export",
    title: "VRF Missing RT Export",
    cliSuggestion: objectName
      ? `ip vpn-instance ${objectName}\n vpn-target <asn>:<id> export-extcommunity`
      : "ip vpn-instance <vrf-name>\n vpn-target <rt> export-extcommunity",
    explanation: "VRF must have RT Export configuration to advertise routes to other VRFs.",
    severity: "medium",
  }),

  "huawei-security-snmp-public-absent": () => ({
    ruleId: "huawei-security-snmp-public-absent",
    title: "SNMP Public Community Detected",
    cliSuggestion: "undo snmp-agent community read public\nundo snmp-agent community write public",
    explanation: "Default SNMP community 'public' is a security risk and must be removed.",
    severity: "high",
  }),

  "huawei-security-snmp-private-absent": () => ({
    ruleId: "huawei-security-snmp-private-absent",
    title: "SNMP Private Community Detected",
    cliSuggestion: "undo snmp-agent community read private\nundo snmp-agent community write private",
    explanation: "Default SNMP community 'private' is a security risk and must be removed.",
    severity: "high",
  }),

  "huawei-l2vc-service-id": (objectName) => ({
    ruleId: "huawei-l2vc-service-id",
    title: "L2VC Missing Service/VC ID",
    cliSuggestion:
      "mpls l2vpn\n vpws-service <name>\n  vsi <peer-ip> vc-id <vc-id>",
    explanation: "L2VC must have proper service and VC IDs for VPWS operation.",
    severity: "medium",
  }),

  "huawei-peer-bgp-established": (objectName) => ({
    ruleId: "huawei-peer-bgp-established",
    title: "BGP Peer Not Established",
    cliSuggestion: objectName
      ? `peer ${objectName} connect-interface <local-ip>`
      : "Verify routing, BGP configuration, and network connectivity.",
    explanation: "BGP peer must be in Established state. Verify configuration and connectivity.",
    severity: "high",
  }),

  "huawei-subinterface-dot1q": (objectName) => ({
    ruleId: "huawei-subinterface-dot1q",
    title: "Subinterface Missing Dot1Q Encapsulation",
    cliSuggestion: objectName
      ? `interface ${objectName}\n encapsulation dot1q <vlan-id>`
      : "interface <subinterface>\n encapsulation dot1q <vlan>",
    explanation: "Subinterfaces must have proper Dot1Q encapsulation for VLAN tagging.",
    severity: "medium",
  }),
};

export function generateRemediationPreview(finding: {
  ruleId: string;
  objectName?: string;
  severity: string;
  message: string;
}): RemediationSuggestion | null {
  const ruleKey = finding.ruleId;

  if (!REMEDIATION_TEMPLATES[ruleKey]) {
    return null;
  }

  const objectName = finding.objectName || extractObjectName(finding.message) || null;
  const template = REMEDIATION_TEMPLATES[ruleKey];

  try {
    return template(objectName);
  } catch {
    return null;
  }
}

export function generateRemediationPreviewForAll(
  findings: Array<{ ruleId: string; objectName?: string; severity: string; message: string }>,
): RemediationSuggestion[] {
  const suggestions: RemediationSuggestion[] = [];

  for (const finding of findings) {
    const suggestion = generateRemediationPreview(finding);
    if (suggestion) {
      suggestions.push(suggestion);
    }
  }

  return suggestions;
}
