/**
 * Built-in service templates for v0.4.0 preview workflow (Huawei VRP style, preview-only).
 */

export type ProvisioningServiceType =
  | "l2vpn_vpws"
  | "l2vpn_vpls"
  | "l3vpn_vrf"
  | "bgp_peer_customer"
  | "bgp_peer_provider";

export interface ServiceTemplateDefinition {
  serviceType: ProvisioningServiceType;
  name: string;
  description: string;
  configTemplateType: "l2vpn" | "l3vpn" | "bgp";
  vendor: string;
  platform: string;
  requiredParameters: string[];
  optionalParameters: string[];
  template: string;
  rollbackTemplate: string;
  parameterSchema: Record<string, { type: string; description: string }>;
}

const PREVIEW_HEADER = "# PREVIEW ONLY — not applied. CONFIG_APPLY_ENABLED=false by default.\n";

export const SERVICE_TEMPLATES: ServiceTemplateDefinition[] = [
  {
    serviceType: "l2vpn_vpws",
    name: "L2VPN VPWS (L2VC)",
    description: "Point-to-point L2VPN pseudowire (VPWS / L2VC)",
    configTemplateType: "l2vpn",
    vendor: "huawei",
    platform: "vrp",
    requiredParameters: ["vcId", "remotePeerIp", "interfaceName"],
    optionalParameters: ["vsiName", "description", "vlanId"],
    parameterSchema: {
      vcId: { type: "string", description: "L2VC / VC identifier" },
      remotePeerIp: { type: "string", description: "Remote PE loopback or interface IP" },
      interfaceName: { type: "string", description: "AC interface on local PE" },
      vsiName: { type: "string", description: "Optional VSI name" },
      description: { type: "string", description: "Service description" },
      vlanId: { type: "string", description: "Dot1q VLAN if subinterface" },
    },
    template: `${PREVIEW_HEADER}
# L2VPN VPWS — {{description}}
mpls l2vpn
 mpls l2vc {{remotePeerIp}} {{vcId}} tunnel-policy default
interface {{interfaceName}}
 mpls l2vc {{remotePeerIp}} {{vcId}}
`,
    rollbackTemplate: `${PREVIEW_HEADER}
# Rollback VPWS {{vcId}}
interface {{interfaceName}}
 undo mpls l2vc
mpls l2vpn
 undo mpls l2vc {{remotePeerIp}} {{vcId}}
`,
  },
  {
    serviceType: "l2vpn_vpls",
    name: "L2VPN VPLS (VSI)",
    description: "Multipoint L2VPN VPLS with VSI binding",
    configTemplateType: "l2vpn",
    vendor: "huawei",
    platform: "vrp",
    requiredParameters: ["vsiName", "interfaceName"],
    optionalParameters: ["rd", "vpnTargetImport", "vpnTargetExport", "description"],
    parameterSchema: {
      vsiName: { type: "string", description: "VSI instance name" },
      interfaceName: { type: "string", description: "AC interface" },
      rd: { type: "string", description: "Route distinguisher (optional)" },
      vpnTargetImport: { type: "string", description: "RT import" },
      vpnTargetExport: { type: "string", description: "RT export" },
      description: { type: "string", description: "Service description" },
    },
    template: `${PREVIEW_HEADER}
# L2VPN VPLS — {{description}}
vsi {{vsiName}} static
 pwsignal ldp
  vsi-id {{vsiName}}
interface {{interfaceName}}
 l2 binding vsi {{vsiName}}
`,
    rollbackTemplate: `${PREVIEW_HEADER}
# Rollback VSI {{vsiName}}
interface {{interfaceName}}
 undo l2 binding vsi {{vsiName}}
undo vsi {{vsiName}}
`,
  },
  {
    serviceType: "l3vpn_vrf",
    name: "L3VPN / VRF",
    description: "VRF instance with RD/RT and PE-CE interface",
    configTemplateType: "l3vpn",
    vendor: "huawei",
    platform: "vrp",
    requiredParameters: ["vrfName", "rd", "interfaceName", "peCeAddress"],
    optionalParameters: ["vpnTargetImport", "vpnTargetExport", "description"],
    parameterSchema: {
      vrfName: { type: "string", description: "VPN instance name" },
      rd: { type: "string", description: "Route distinguisher" },
      interfaceName: { type: "string", description: "PE-CE interface" },
      peCeAddress: { type: "string", description: "PE-CE IP address/mask" },
      vpnTargetImport: { type: "string", description: "RT import" },
      vpnTargetExport: { type: "string", description: "RT export" },
      description: { type: "string", description: "Customer / service label" },
    },
    template: `${PREVIEW_HEADER}
# L3VPN VRF — {{description}}
ip vpn-instance {{vrfName}}
 ipv4-family
  route-distinguisher {{rd}}
  vpn-target {{vpnTargetExport}} export-extcommunity
  vpn-target {{vpnTargetImport}} import-extcommunity
interface {{interfaceName}}
 ip binding vpn-instance {{vrfName}}
 ip address {{peCeAddress}}
`,
    rollbackTemplate: `${PREVIEW_HEADER}
# Rollback VRF {{vrfName}}
interface {{interfaceName}}
 undo ip binding vpn-instance
 undo ip address
undo ip vpn-instance {{vrfName}}
`,
  },
  {
    serviceType: "bgp_peer_customer",
    name: "BGP peer — Customer",
    description: "eBGP customer peering (import/export policies)",
    configTemplateType: "bgp",
    vendor: "huawei",
    platform: "vrp",
    requiredParameters: ["peerIp", "remoteAs", "importPolicy", "exportPolicy"],
    optionalParameters: ["description", "vrfName"],
    parameterSchema: {
      peerIp: { type: "string", description: "Customer peer IP" },
      remoteAs: { type: "string", description: "Customer ASN" },
      importPolicy: { type: "string", description: "Route-policy in" },
      exportPolicy: { type: "string", description: "route-policy out" },
      description: { type: "string", description: "Peer description" },
      vrfName: { type: "string", description: "VPN instance if VRF peering" },
    },
    template: `${PREVIEW_HEADER}
# BGP Customer — {{description}}
bgp {{localAs}}
 peer {{peerIp}} as-number {{remoteAs}}
 peer {{peerIp}} description {{description}}
 peer {{peerIp}} route-policy {{importPolicy}} import
 peer {{peerIp}} route-policy {{exportPolicy}} export
`,
    rollbackTemplate: `${PREVIEW_HEADER}
# Rollback BGP customer {{peerIp}}
bgp {{localAs}}
 undo peer {{peerIp}}
`,
  },
  {
    serviceType: "bgp_peer_provider",
    name: "BGP peer — Provider / Upstream",
    description: "eBGP upstream or transit peering",
    configTemplateType: "bgp",
    vendor: "huawei",
    platform: "vrp",
    requiredParameters: ["peerIp", "remoteAs", "importPolicy", "exportPolicy"],
    optionalParameters: ["description", "vrfName", "localAs"],
    parameterSchema: {
      peerIp: { type: "string", description: "Provider peer IP" },
      remoteAs: { type: "string", description: "Provider ASN" },
      importPolicy: { type: "string", description: "Route-policy in" },
      exportPolicy: { type: "string", description: "Route-policy out" },
      description: { type: "string", description: "Peer description" },
      vrfName: { type: "string", description: "VPN instance if applicable" },
      localAs: { type: "string", description: "Local ASN (default from device)" },
    },
    template: `${PREVIEW_HEADER}
# BGP Provider — {{description}}
bgp {{localAs}}
 peer {{peerIp}} as-number {{remoteAs}}
 peer {{peerIp}} description {{description}}
 peer {{peerIp}} route-policy {{importPolicy}} import
 peer {{peerIp}} route-policy {{exportPolicy}} export
`,
    rollbackTemplate: `${PREVIEW_HEADER}
# Rollback BGP provider {{peerIp}}
bgp {{localAs}}
 undo peer {{peerIp}}
`,
  },
];

export function getServiceTemplate(serviceType: string): ServiceTemplateDefinition | undefined {
  return SERVICE_TEMPLATES.find((item) => item.serviceType === serviceType);
}

export function listServiceTemplates(): ServiceTemplateDefinition[] {
  return SERVICE_TEMPLATES;
}
