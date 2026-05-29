import type {
  ProvisioningContext,
  ProvisioningParameterField,
  ProvisioningServiceType,
  ProvisioningTemplateDefinition,
  ProvisioningValidationItem,
} from "./provisioning.types.js";

function field(
  type: string,
  description: string,
  options?: { required?: boolean; sensitive?: boolean },
): ProvisioningParameterField {
  return {
    type,
    description,
    required: options?.required,
    sensitive: options?.sensitive,
  };
}

function baseTemplate(
  partial: Omit<ProvisioningTemplateDefinition, "supported">,
): ProvisioningTemplateDefinition {
  return { ...partial, supported: true };
}

export const PROVISIONING_TEMPLATES: ProvisioningTemplateDefinition[] = [
  baseTemplate({
    id: "huawei-vrp-bgp-customer",
    name: "BGP Peer — Customer",
    description: "eBGP customer peering with optional VPN instance and address family",
    vendor: "huawei",
    platform: "vrp",
    serviceType: "bgp_customer",
    parameterSchema: {
      peerIp: field("string", "Customer peer IP", { required: true }),
      remoteAs: field("string", "Customer ASN", { required: true }),
      importPolicy: field("string", "Route-policy import", { required: true }),
      exportPolicy: field("string", "Route-policy export", { required: true }),
      description: field("string", "Peer description"),
      vpnInstance: field("string", "VPN instance name (optional)"),
      localAs: field("string", "Local ASN (default 65000)"),
      addressFamily: field("string", "ipv4 or ipv6 (default ipv4)"),
      password: field("string", "BGP MD5 password (optional)", { sensitive: true }),
    },
    risks: [
      "Verify import/export route-policies exist before any future apply.",
      "Customer peering changes may affect prefix propagation.",
    ],
    precheckHints: [
      "Confirm peer IP is not already configured.",
      "Validate route-policy references against discovery snapshot.",
    ],
    postcheckHints: [
      "display bgp peer",
      "display bgp routing-table peer <peerIp> received-routes",
    ],
    configTemplate: `# BGP Customer — {{description}}
bgp {{localAs}}
{{#vpnInstance}} ipv4-family vpn-instance {{vpnInstance}}
{{/vpnInstance}} peer {{peerIp}} as-number {{remoteAs}}
 peer {{peerIp}} description {{description}}
 peer {{peerIp}} route-policy {{importPolicy}} import
 peer {{peerIp}} route-policy {{exportPolicy}} export
{{#password}} peer {{peerIp}} password cipher {{password}}
{{/password}}{{#vpnInstance}} quit
{{/vpnInstance}}`,
    rollbackTemplate: `# Rollback BGP customer {{peerIp}}
bgp {{localAs}}
{{#vpnInstance}} ipv4-family vpn-instance {{vpnInstance}}
{{/vpnInstance}} undo peer {{peerIp}}
{{#vpnInstance}} quit
{{/vpnInstance}}`,
  }),
  baseTemplate({
    id: "huawei-vrp-bgp-provider",
    name: "BGP Peer — Provider / Upstream",
    description: "eBGP upstream or transit peering",
    vendor: "huawei",
    platform: "vrp",
    serviceType: "bgp_provider",
    parameterSchema: {
      peerIp: field("string", "Provider peer IP", { required: true }),
      remoteAs: field("string", "Provider ASN", { required: true }),
      importPolicy: field("string", "Route-policy import", { required: true }),
      exportPolicy: field("string", "Route-policy export", { required: true }),
      description: field("string", "Peer description"),
      vpnInstance: field("string", "VPN instance name (optional)"),
      localAs: field("string", "Local ASN (default 65000)"),
      addressFamily: field("string", "ipv4 or ipv6 (default ipv4)"),
    },
    risks: [
      "Upstream peering changes can affect default route and transit.",
      "Validate maintenance window before any future apply.",
    ],
    precheckHints: [
      "Confirm provider ASN and peer IP with carrier documentation.",
      "Check for existing provider sessions on the device.",
    ],
    postcheckHints: [
      "display bgp peer",
      "display bgp routing-table peer <peerIp> received-routes",
    ],
    configTemplate: `# BGP Provider — {{description}}
bgp {{localAs}}
{{#vpnInstance}} ipv4-family vpn-instance {{vpnInstance}}
{{/vpnInstance}} peer {{peerIp}} as-number {{remoteAs}}
 peer {{peerIp}} description {{description}}
 peer {{peerIp}} route-policy {{importPolicy}} import
 peer {{peerIp}} route-policy {{exportPolicy}} export
{{#vpnInstance}} quit
{{/vpnInstance}}`,
    rollbackTemplate: `# Rollback BGP provider {{peerIp}}
bgp {{localAs}}
{{#vpnInstance}} ipv4-family vpn-instance {{vpnInstance}}
{{/vpnInstance}} undo peer {{peerIp}}
{{#vpnInstance}} quit
{{/vpnInstance}}`,
  }),
  baseTemplate({
    id: "huawei-vrp-l3vpn-vrf",
    name: "L3VPN / VRF",
    description: "VPN instance with RD/RT",
    vendor: "huawei",
    platform: "vrp",
    serviceType: "l3vpn_vrf",
    parameterSchema: {
      vrfName: field("string", "VPN instance name", { required: true }),
      rd: field("string", "Route distinguisher", { required: true }),
      rtImport: field("string", "Route-target import", { required: true }),
      rtExport: field("string", "Route-target export", { required: true }),
      description: field("string", "Service description"),
    },
    risks: ["VRF duplication may break existing services."],
    precheckHints: ["Confirm VRF name and RD are unique on the device."],
    postcheckHints: ["display ip vpn-instance", "display ip routing-table vpn-instance <vrfName>"],
    configTemplate: `# L3VPN VRF — {{description}}
ip vpn-instance {{vrfName}}
 ipv4-family
  route-distinguisher {{rd}}
  vpn-target {{rtExport}} export-extcommunity
  vpn-target {{rtImport}} import-extcommunity
  description {{description}}`,
    rollbackTemplate: `# Rollback VRF {{vrfName}}
undo ip vpn-instance {{vrfName}}`,
  }),
  baseTemplate({
    id: "huawei-vrp-l2vpn-vpws",
    name: "L2VPN VPWS (L2VC)",
    description: "Point-to-point L2VPN pseudowire",
    vendor: "huawei",
    platform: "vrp",
    serviceType: "l2vpn_vpws",
    parameterSchema: {
      vcId: field("string", "L2VC identifier", { required: true }),
      remotePeerIp: field("string", "Remote PE IP", { required: true }),
      interfaceName: field("string", "AC interface", { required: true }),
      description: field("string", "Service description"),
      vlanId: field("string", "Dot1q VLAN if subinterface"),
    },
    risks: ["L2VC misconfiguration may impact customer circuit."],
    precheckHints: ["Validate AC interface exists and is free."],
    postcheckHints: ["display mpls l2vc", "display interface {{interfaceName}}"],
    configTemplate: `# L2VPN VPWS — {{description}}
mpls l2vpn
 mpls l2vc {{remotePeerIp}} {{vcId}} tunnel-policy default
interface {{interfaceName}}
 mpls l2vc {{remotePeerIp}} {{vcId}}`,
    rollbackTemplate: `# Rollback VPWS {{vcId}}
interface {{interfaceName}}
 undo mpls l2vc
mpls l2vpn
 undo mpls l2vc {{remotePeerIp}} {{vcId}}`,
  }),
  baseTemplate({
    id: "huawei-vrp-l2vpn-vpls",
    name: "L2VPN VPLS (VSI)",
    description: "Multipoint L2VPN with VSI binding",
    vendor: "huawei",
    platform: "vrp",
    serviceType: "l2vpn_vpls",
    parameterSchema: {
      vsiName: field("string", "VSI name", { required: true }),
      interfaceName: field("string", "AC interface", { required: true }),
      rd: field("string", "Route distinguisher (optional)"),
      vpnTargetImport: field("string", "RT import"),
      vpnTargetExport: field("string", "RT export"),
      description: field("string", "Service description"),
    },
    risks: ["VSI name collision may affect existing multipoint services."],
    precheckHints: ["Confirm VSI and AC interface availability."],
    postcheckHints: ["display vsi", "display interface {{interfaceName}}"],
    configTemplate: `# L2VPN VPLS — {{description}}
vsi {{vsiName}} static
 pwsignal ldp
  vsi-id {{vsiName}}
interface {{interfaceName}}
 l2 binding vsi {{vsiName}}`,
    rollbackTemplate: `# Rollback VSI {{vsiName}}
interface {{interfaceName}}
 undo l2 binding vsi {{vsiName}}
undo vsi {{vsiName}}`,
  }),
  baseTemplate({
    id: "huawei-vrp-subinterface-dot1q",
    name: "Subinterface Dot1q",
    description: "802.1Q subinterface with optional IP and VPN binding",
    vendor: "huawei",
    platform: "vrp",
    serviceType: "interface_subinterface",
    parameterSchema: {
      parentInterface: field("string", "Parent interface", { required: true }),
      vlanId: field("string", "802.1Q VLAN ID", { required: true }),
      ipAddress: field("string", "IP address/mask (optional)"),
      description: field("string", "Interface description"),
      vpnInstance: field("string", "VPN instance (optional)"),
    },
    risks: ["Duplicate subinterface may break existing VLAN service."],
    precheckHints: ["Confirm parent interface exists.", "Check VLAN/subinterface not already in use."],
    postcheckHints: ["display interface {{parentInterface}}.{{vlanId}}"],
    configTemplate: `# Subinterface — {{description}}
interface {{parentInterface}}.{{vlanId}}
 description {{description}}
 dot1q termination vid {{vlanId}}
{{#ipAddress}} ip address {{ipAddress}}
{{/ipAddress}}{{#vpnInstance}} ip binding vpn-instance {{vpnInstance}}
{{/vpnInstance}}`,
    rollbackTemplate: `# Rollback subinterface {{parentInterface}}.{{vlanId}}
interface {{parentInterface}}.{{vlanId}}
 undo description
 undo dot1q termination vid
{{#ipAddress}} undo ip address
{{/ipAddress}}{{#vpnInstance}} undo ip binding vpn-instance
{{/vpnInstance}}`,
  }),
  baseTemplate({
    id: "huawei-vrp-route-policy",
    name: "Route-policy node",
    description: "Add a route-policy node with community apply (preview skeleton)",
    vendor: "huawei",
    platform: "vrp",
    serviceType: "route_policy",
    parameterSchema: {
      policyName: field("string", "Route-policy name", { required: true }),
      nodeId: field("string", "Node ID", { required: true }),
      ifMatchPrefix: field("string", "if-match ip-prefix name"),
      applyCommunity: field("string", "apply community value or list"),
      action: field("string", "permit or deny (default permit)"),
    },
    risks: ["Route-policy edits affect BGP propagation."],
    precheckHints: ["Confirm route-policy exists or plan creation order."],
    postcheckHints: ["display route-policy {{policyName}}"],
    configTemplate: `# Route-policy — {{policyName}} node {{nodeId}}
route-policy {{policyName}} {{action}} node {{nodeId}}
{{#ifMatchPrefix}} if-match ip-prefix {{ifMatchPrefix}}
{{/ifMatchPrefix}}{{#applyCommunity}} apply community {{applyCommunity}}
{{/applyCommunity}}`,
    rollbackTemplate: `# Rollback route-policy node {{policyName}} {{nodeId}}
route-policy {{policyName}} {{action}} node {{nodeId}}
 undo route-policy {{policyName}} node {{nodeId}}`,
  }),
  baseTemplate({
    id: "huawei-vrp-community-filter",
    name: "Community filter",
    description: "Basic community-filter entry (preview skeleton)",
    vendor: "huawei",
    platform: "vrp",
    serviceType: "community_filter",
    parameterSchema: {
      filterName: field("string", "Community-filter name", { required: true }),
      index: field("string", "Entry index", { required: true }),
      community: field("string", "Community value", { required: true }),
      action: field("string", "permit or deny (default permit)"),
    },
    risks: ["Community-filter changes affect policy matching."],
    precheckHints: ["Validate community-filter name availability."],
    postcheckHints: ["display ip community-filter"],
    configTemplate: `# Community filter — {{filterName}}
ip community-filter basic {{filterName}} index {{index}} {{action}} {{community}}`,
    rollbackTemplate: `# Rollback community filter {{filterName}} index {{index}}
undo ip community-filter basic {{filterName}} index {{index}}`,
  }),
  baseTemplate({
    id: "huawei-vrp-prefix-list",
    name: "Prefix-list",
    description: "IPv4 prefix-list entry (preview skeleton)",
    vendor: "huawei",
    platform: "vrp",
    serviceType: "prefix_list",
    parameterSchema: {
      listName: field("string", "Prefix-list name", { required: true }),
      index: field("string", "Entry index", { required: true }),
      prefix: field("string", "Prefix (e.g. 10.0.0.0 24)", { required: true }),
      action: field("string", "permit or deny (default permit)"),
      ge: field("string", "greater-equal length"),
      le: field("string", "less-equal length"),
    },
    risks: ["Prefix-list changes affect route-policy matching."],
    precheckHints: ["Validate prefix-list name and overlapping entries."],
    postcheckHints: ["display ip ip-prefix {{listName}}"],
    configTemplate: `# Prefix-list — {{listName}}
ip ip-prefix {{listName}} index {{index}} {{action}} {{prefix}}{{#ge}} greater-equal {{ge}}{{/ge}}{{#le}} less-equal {{le}}{{/le}}`,
    rollbackTemplate: `# Rollback prefix-list {{listName}} index {{index}}
undo ip ip-prefix {{listName}} index {{index}}`,
  }),
];

export function listProvisioningTemplates(): ProvisioningTemplateDefinition[] {
  return PROVISIONING_TEMPLATES;
}

export function getProvisioningTemplateById(id: string): ProvisioningTemplateDefinition | undefined {
  return PROVISIONING_TEMPLATES.find((item) => item.id === id);
}

export function toTemplateSummary(template: ProvisioningTemplateDefinition) {
  return {
    id: template.id,
    name: template.name,
    description: template.description,
    vendor: template.vendor,
    platform: template.platform,
    serviceType: template.serviceType,
    parameterSchema: template.parameterSchema,
    risks: template.risks,
    precheckHints: template.precheckHints,
    postcheckHints: template.postcheckHints,
    supported: template.supported,
  };
}

export function normalizeParameters(
  template: ProvisioningTemplateDefinition,
  raw: Record<string, unknown>,
  context: ProvisioningContext,
): Record<string, unknown> {
  const params: Record<string, unknown> = { ...raw };
  params.hostname = context.device.hostname;
  params.localAs = params.localAs ?? "65000";
  params.action = params.action ?? "permit";
  params.addressFamily = params.addressFamily ?? "ipv4";
  params.description = params.description ?? `${template.name} on ${context.device.hostname}`;

  for (const [key, schema] of Object.entries(template.parameterSchema)) {
    if (schema.required && (params[key] === undefined || params[key] === null || String(params[key]).trim() === "")) {
      continue;
    }
  }

  return params;
}

export function vendorPlatformCompatible(
  template: ProvisioningTemplateDefinition,
  context: ProvisioningContext,
): boolean {
  const deviceVendor = context.device.vendor?.toLowerCase() ?? "";
  const devicePlatform = context.device.platform?.toLowerCase() ?? "";
  return deviceVendor.includes(template.vendor) && devicePlatform.includes(template.platform);
}

export function getRequiredParameterNames(template: ProvisioningTemplateDefinition): string[] {
  return Object.entries(template.parameterSchema)
    .filter(([, schema]) => schema.required)
    .map(([name]) => name);
}

export type { ProvisioningServiceType };
