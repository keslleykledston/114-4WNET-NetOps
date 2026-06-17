import type { NavModulesMap } from "@workspace/db";

export type NavModuleDefinition = {
  id: string;
  label: string;
  group: string;
};

/** Canonical module ids — must match frontend nav-modules.ts */
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

export const NAV_MODULE_IDS = NAV_MODULE_DEFINITIONS.map((item) => item.id);

export function allModulesEnabledMap(): NavModulesMap {
  return Object.fromEntries(NAV_MODULE_IDS.map((id) => [id, true]));
}

export function defaultViewerModulesMap(): NavModulesMap {
  const enabled = new Set([
    "dashboard",
    "l2-circuits",
    "compliance",
    "reports",
    "snmp-history",
    "operational-bgp",
    "bgp-announcements",
    "audit",
  ]);
  return Object.fromEntries(NAV_MODULE_IDS.map((id) => [id, enabled.has(id)]));
}

export function defaultOperatorModulesMap(): NavModulesMap {
  const base = defaultViewerModulesMap();
  for (const id of [
    "provisioning",
    "provisioning-templates",
    "template-studio",
    "service-catalog",
    "config-collection",
    "netops-operations",
    "change-plans",
    "bgp-drilldown",
    "connectors",
    "connector-groups",
    "config-generator",
    "copilot",
  ]) {
    base[id] = true;
  }
  return base;
}

export function sanitizeModulesMap(input: unknown): NavModulesMap {
  const source = input && typeof input === "object" ? input as Record<string, unknown> : {};
  const result: NavModulesMap = {};
  for (const id of NAV_MODULE_IDS) {
    result[id] = source[id] === true;
  }
  return result;
}

export function isModuleEnabled(modules: NavModulesMap, moduleId: string): boolean {
  return modules[moduleId] === true;
}
