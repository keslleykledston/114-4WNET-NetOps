/** Module ids must match api-server src/lib/nav-modules.ts */
export type NavModuleDefinition = {
  id: string;
  label: string;
  group: string;
};

export const NAV_MODULE_DEFINITIONS: NavModuleDefinition[] = [
  { id: "dashboard", label: "Dashboard", group: "Geral" },
  { id: "l2-circuits", label: "L2 Circuits", group: "Operações" },
  { id: "compliance", label: "Compliance", group: "Operações" },
  { id: "provisioning", label: "Provisioning", group: "Provisionamento" },
  { id: "provisioning-templates", label: "Template Registry", group: "Provisionamento" },
  { id: "template-studio", label: "Template Studio", group: "Provisionamento" },
  { id: "service-catalog", label: "Service Catalog", group: "Provisionamento" },
  { id: "templates", label: "Templates", group: "Provisionamento" },
  { id: "policies", label: "Policies", group: "Provisionamento" },
  { id: "config-collection", label: "Config Collection", group: "Inventário" },
  { id: "config-generator", label: "Config Generator", group: "Inventário" },
  { id: "snmp-history", label: "SNMP History", group: "Inventário" },
  { id: "netops-operations", label: "NetOps Operations", group: "Inventário" },
  { id: "copilot", label: "Copiloto IA", group: "Assistente" },
  { id: "operational-bgp", label: "BGP Operations", group: "BGP" },
  { id: "bgp-announcements", label: "BGP Announcements", group: "BGP" },
  { id: "change-plans", label: "Change Plans", group: "BGP" },
  { id: "bgp-drilldown", label: "BGP Drilldown", group: "BGP" },
  { id: "audit", label: "Audit", group: "Governança" },
  { id: "security-credentials", label: "Credential Vault", group: "Segurança" },
  { id: "notifications", label: "Notifications", group: "Governança" },
  { id: "reports", label: "Reports", group: "Governança" },
  { id: "integrations", label: "Integrations", group: "Integrações" },
  { id: "connectors", label: "Conectores", group: "Integrações" },
  { id: "connector-groups", label: "Connector Groups", group: "Integrações" },
  { id: "scheduler", label: "Scheduler", group: "Automação" },
  { id: "users", label: "Usuários", group: "Administração" },
  { id: "user-profiles", label: "Perfis de usuário", group: "Administração" },
];

export type NavModulesMap = Record<string, boolean>;

export const HREF_TO_MODULE_ID: Record<string, string> = {
  "/": "dashboard",
  "/l2-circuits": "l2-circuits",
  "/compliance": "compliance",
  "/provisioning": "provisioning",
  "/provisioning/templates": "provisioning-templates",
  "/provisioning/template-studio": "template-studio",
  "/provisioning/service-catalog": "service-catalog",
  "/templates": "templates",
  "/policies": "policies",
  "/config-collection": "config-collection",
  "/config-generator": "config-generator",
  "/snmp-history": "snmp-history",
  "/netops-operations": "netops-operations",
  "/copilot": "copilot",
  "/operational/bgp": "operational-bgp",
  "/bgp/operations": "operational-bgp",
  "/bgp-announcements": "bgp-announcements",
  "/change-plans": "change-plans",
  "/bgp/peer-drilldown": "bgp-drilldown",
  "/audit": "audit",
  "/audit/operational-logs": "audit",
  "/audit/bgp-removals": "audit",
  "/security/credentials": "security-credentials",
  "/tenants/notifications": "notifications",
  "/reports": "reports",
  "/integrations": "integrations",
  "/infrastructure/connectors": "connectors",
  "/infrastructure/connectors/dashboard": "connectors",
  "/infrastructure/connector-groups": "connector-groups",
  "/scheduler": "scheduler",
  "/devices": "netops-operations",
  "/users": "users",
  "/user-profiles": "user-profiles",
};

export function resolveModuleIdForPath(pathname: string): string | null {
  if (HREF_TO_MODULE_ID[pathname]) return HREF_TO_MODULE_ID[pathname];
  const entries = Object.entries(HREF_TO_MODULE_ID).sort((a, b) => b[0].length - a[0].length);
  for (const [href, moduleId] of entries) {
    if (href !== "/" && (pathname === href || pathname.startsWith(`${href}/`))) {
      return moduleId;
    }
  }
  return null;
}

export function isPathModuleEnabled(pathname: string, modules: NavModulesMap | null, isAdmin: boolean): boolean {
  if (isAdmin) return true;
  if (!modules) return true;
  const moduleId = resolveModuleIdForPath(pathname);
  if (!moduleId) return true;
  return modules[moduleId] === true;
}

export function isNavHrefEnabled(href: string, modules: NavModulesMap | null, isAdmin: boolean): boolean {
  return isPathModuleEnabled(href, modules, isAdmin);
}
