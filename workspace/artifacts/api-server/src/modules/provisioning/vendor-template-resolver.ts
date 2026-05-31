const RESOLVER: Record<string, string> = {
  "huawei-vrp-l2vpn_vpws": "huawei-vrp-l2vpn-vpws",
  "huawei-vrp-l2vpn_vpls": "huawei-vrp-l2vpn-vpls",
  "huawei-vrp-bgp_peer_customer": "huawei-vrp-bgp-customer",
  "huawei-vrp-bgp_peer_provider": "huawei-vrp-bgp-provider",
  "huawei-vrp-l3vpn_vrf": "huawei-vrp-l3vpn-vrf",
  "huawei-vrp-interface_subinterface": "huawei-vrp-subinterface-dot1q",
};

export function resolveTemplate(serviceType: string, vendor: string, _platform: string): string | null {
  const key = `${vendor}-${serviceType}`;
  return RESOLVER[key] || null;
}

export function getSupportedVendors(): string[] {
  return ["huawei"];
}
