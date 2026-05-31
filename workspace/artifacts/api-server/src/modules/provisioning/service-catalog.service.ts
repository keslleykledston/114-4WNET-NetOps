import { db } from "@workspace/db";
import { serviceCatalogTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const CATALOG_SEEDS = [
  {
    name: "L2VC",
    description: "Layer 2 Virtual Circuit (VPWS)",
    vendor: "any",
    service_type: "l2vpn_vpws",
    template_id: "huawei-vrp-l2vpn-vpws",
    icon: "🔗",
    form_schema_json: JSON.stringify([
      { field: "circuit_id", label: "Circuit ID", type: "text", required: true },
      { field: "vc_id", label: "VC ID", type: "number", required: true },
      { field: "peer_ip", label: "Peer IP", type: "text", required: true },
      { field: "vlan", label: "VLAN", type: "number", required: false },
      { field: "description", label: "Description", type: "text", required: false },
    ]),
  },
  {
    name: "VSI",
    description: "Virtual Switching Instance (VPLS)",
    vendor: "any",
    service_type: "l2vpn_vpls",
    template_id: "huawei-vrp-l2vpn-vpls",
    icon: "🌉",
    form_schema_json: JSON.stringify([
      { field: "vsi_name", label: "VSI Name", type: "text", required: true },
      { field: "vsi_id", label: "VSI ID", type: "number", required: true },
      { field: "peer_ips", label: "Peer IPs (comma-separated)", type: "text", required: false },
      { field: "description", label: "Description", type: "text", required: false },
    ]),
  },
  {
    name: "BGP Customer",
    description: "BGP Peering for Customers",
    vendor: "any",
    service_type: "bgp_peer_customer",
    template_id: "huawei-vrp-bgp-customer",
    icon: "🌐",
    form_schema_json: JSON.stringify([
      { field: "bgp_asn", label: "BGP ASN", type: "number", required: true },
      { field: "neighbor_ip", label: "Neighbor IP", type: "text", required: true },
      { field: "import_policy", label: "Import Policy", type: "text", required: false },
      { field: "export_policy", label: "Export Policy", type: "text", required: false },
      { field: "description", label: "Description", type: "text", required: false },
    ]),
  },
  {
    name: "VRF",
    description: "Virtual Routing and Forwarding",
    vendor: "any",
    service_type: "l3vpn_vrf",
    template_id: "huawei-vrp-l3vpn-vrf",
    icon: "🛣️",
    form_schema_json: JSON.stringify([
      { field: "vrf_name", label: "VRF Name", type: "text", required: true },
      { field: "rd", label: "Route Distinguisher", type: "text", required: true },
      { field: "rt_import", label: "RT Import", type: "text", required: false },
      { field: "rt_export", label: "RT Export", type: "text", required: false },
    ]),
  },
  {
    name: "Interface PTP",
    description: "Point-to-Point Interface",
    vendor: "any",
    service_type: "interface_subinterface",
    template_id: "huawei-vrp-subinterface-dot1q",
    icon: "🔌",
    form_schema_json: JSON.stringify([
      { field: "interface_name", label: "Interface Name", type: "text", required: true },
      { field: "vlan_id", label: "VLAN ID", type: "number", required: true },
      { field: "ip_address", label: "IP Address", type: "text", required: true },
      { field: "peer_ip", label: "Peer IP", type: "text", required: false },
    ]),
  },
  {
    name: "BGP Provider",
    description: "BGP Peering with Providers",
    vendor: "any",
    service_type: "bgp_peer_provider",
    template_id: "huawei-vrp-bgp-provider",
    icon: "🌐",
    form_schema_json: JSON.stringify([
      { field: "bgp_asn", label: "BGP ASN", type: "number", required: true },
      { field: "neighbor_ip", label: "Neighbor IP", type: "text", required: true },
      { field: "local_pref", label: "Local Preference", type: "number", required: false },
    ]),
  },
];

export async function seedServiceCatalog() {
  for (const seed of CATALOG_SEEDS) {
    const existing = await db
      .select()
      .from(serviceCatalogTable)
      .where(eq(serviceCatalogTable.name, seed.name))
      .limit(1);

    if (existing.length === 0) {
      await db.insert(serviceCatalogTable).values(seed);
    }
  }
}

export async function listServiceCatalog(status = "ACTIVE") {
  return db
    .select()
    .from(serviceCatalogTable)
    .where(eq(serviceCatalogTable.status, status))
    .orderBy((t) => t.name);
}

export async function getServiceCatalogItem(id: number) {
  return db.query.serviceCatalogTable.findFirst({
    where: eq(serviceCatalogTable.id, id),
  });
}

export function parseFormSchema(json: string | null) {
  if (!json) return [];
  try {
    return JSON.parse(json);
  } catch {
    return [];
  }
}
