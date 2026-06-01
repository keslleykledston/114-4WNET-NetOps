import { and, eq, inArray } from "drizzle-orm";
import {
  db,
  serviceCatalogTable,
  serviceRequestsTable,
  devicesTable,
  type ServiceRequest,
  type ServiceCatalog,
} from "@workspace/db";

export interface ExpectedStateRequirement {
  field: string;
  required: boolean;
  description?: string;
}

export interface ExpectedState {
  serviceType: string;
  catalogName: string;
  requestId: number;
  requirements: Record<string, ExpectedStateRequirement>;
}

const REQUIREMENT_TEMPLATES: Record<string, Record<string, ExpectedStateRequirement>> = {
  bgp_peer_customer: {
    description: { field: "description", required: true, description: "Peer description" },
    import_policy: { field: "import_policy", required: true, description: "Import route-policy" },
    export_policy: { field: "export_policy", required: true, description: "Export route-policy" },
    community_filter: { field: "community_filter", required: true, description: "Community filter" },
  },
  bgp_peer_provider: {
    description: { field: "description", required: true, description: "Peer description" },
    max_prefix: { field: "max_prefix", required: true, description: "Maximum prefix limit" },
  },
  l3vpn_vrf: {
    rd: { field: "rd", required: true, description: "Route Distinguisher" },
    rt_import: { field: "rt_import", required: true, description: "RT Import" },
    rt_export: { field: "rt_export", required: true, description: "RT Export" },
  },
  l2vpn_vpws: {
    vc_id: { field: "vc_id", required: true, description: "VC ID" },
    peer_ip: { field: "peer_ip", required: true, description: "Peer IP address" },
    status_not_down: { field: "status", required: true, description: "Status not DOWN" },
  },
  l2vpn_vpls: {
    vsi_state: { field: "vsi_state", required: true, description: "VSI state UP" },
    pw_active: { field: "pw_active", required: true, description: "PW active" },
  },
  interface_subinterface: {
    description: { field: "description", required: true, description: "Interface description" },
    shutdown_disabled: { field: "shutdown", required: true, description: "Shutdown must be disabled" },
    encapsulation: { field: "encapsulation", required: true, description: "Dot1Q encapsulation" },
  },
};

const GLOBAL_REQUIREMENTS: Record<string, ExpectedStateRequirement> = {
  ntp: { field: "ntp", required: true, description: "NTP must be configured" },
  snmp: { field: "snmp", required: true, description: "SNMP configuration" },
  aaa: { field: "aaa", required: true, description: "AAA authentication" },
};

export async function buildExpectedState(deviceId: number): Promise<ExpectedState[]> {
  const [device] = await db
    .select()
    .from(devicesTable)
    .where(eq(devicesTable.id, deviceId))
    .limit(1);

  if (!device) {
    return [];
  }

  const requests = await db
    .select({
      id: serviceRequestsTable.id,
      serviceCatalogId: serviceRequestsTable.serviceCatalogId,
      status: serviceRequestsTable.status,
      payloadJson: serviceRequestsTable.payloadJson,
    })
    .from(serviceRequestsTable)
    .where(
      and(
        eq(serviceRequestsTable.deviceId, deviceId),
        inArray(serviceRequestsTable.status, ["APPROVED", "PROVISIONED", "ACTIVE"])
      )
    );

  const catalogIds = [...new Set(requests.map((r) => r.serviceCatalogId))];
  const catalogs = await db
    .select()
    .from(serviceCatalogTable)
    .where(inArray(serviceCatalogTable.id, catalogIds));

  const catalogMap = new Map<number, ServiceCatalog>();
  for (const catalog of catalogs) {
    catalogMap.set(catalog.id, catalog);
  }

  const states: ExpectedState[] = [];
  for (const request of requests) {
    const catalog = catalogMap.get(request.serviceCatalogId);
    if (!catalog) continue;

    const template = REQUIREMENT_TEMPLATES[catalog.serviceType as keyof typeof REQUIREMENT_TEMPLATES];
    const requirements = template || {};

    states.push({
      serviceType: catalog.serviceType,
      catalogName: catalog.name,
      requestId: request.id,
      requirements,
    });
  }

  return states;
}

export function getGlobalRequirements(): Record<string, ExpectedStateRequirement> {
  return { ...GLOBAL_REQUIREMENTS };
}
