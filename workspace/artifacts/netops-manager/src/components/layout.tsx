import { Link, useLocation } from "wouter";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { getConnectorHealthSummary } from "@/features/connectors/connectors-api";
import type { LucideIcon } from "lucide-react";
import {
  ShieldCheck,
  Rocket,
  FileCode,
  ScrollText,
  DownloadCloud,
  LayoutDashboard,
  Settings,
  Activity,
  RadioTower,
  Workflow,
  ShieldAlert,
  FileBarChart,
  History,
  PlugZap,
  Waypoints,
  CalendarClock,
  Network,
  Users,
  GitBranch,
  KeyRound,
  BellRing,
  ChevronLeft,
  ChevronRight,
  LogOut,
  Bot,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useTheme } from "./theme-provider";
import { Button } from "@/components/ui/button";
import { useAuth } from "./auth-provider";

type NavChildItem = {
  href: string;
  label: string;
  icon?: LucideIcon;
};

type NavItem = {
  href: string;
  icon: LucideIcon;
  label: string;
  children?: NavChildItem[];
};

const navItems: NavItem[] = [
  { href: "/", icon: LayoutDashboard, label: "Dashboard" },
  { href: "/l2-circuits", icon: Network, label: "L2 Circuits" },
  { href: "/compliance", icon: ShieldCheck, label: "Compliance" },
  // Provisioning MVP uses Config Generator preview-only flow. Legacy apply/execute stays off the main path.
  { href: "/provisioning", icon: Rocket, label: "Provisioning" },
  { href: "/provisioning/templates", icon: FileCode, label: "Template Registry" },
  { href: "/provisioning/template-studio", icon: FileCode, label: "Template Studio" },
  { href: "/provisioning/service-catalog", icon: FileCode, label: "Service Catalog" },
  { href: "/templates", icon: FileCode, label: "Templates" },
  { href: "/policies", icon: ScrollText, label: "Policies" },
  { href: "/config-collection", icon: DownloadCloud, label: "Config Collection" },
  { href: "/snmp-history", icon: RadioTower, label: "SNMP History" },
  { href: "/netops-operations", icon: Workflow, label: "NetOps Operations" },
  { href: "/copilot", icon: Bot, label: "Copiloto IA" },
  { href: "/operational/bgp", icon: GitBranch, label: "BGP Operations" },
  { href: "/bgp-announcements", icon: GitBranch, label: "BGP Announcements" },
  { href: "/bgp/peer-drilldown", icon: GitBranch, label: "BGP Drilldown" },
  {
    href: "/audit",
    icon: ShieldAlert,
    label: "Audit",
    children: [
      { href: "/audit", label: "Audit Trail" },
      { href: "/audit/operational-logs", label: "Operational Logs", icon: Activity },
      { href: "/audit/bgp-removals", label: "BGP Removals", icon: History },
    ],
  },
  { href: "/security/credentials", icon: KeyRound, label: "Credential Vault" },
  { href: "/tenants/notifications", icon: BellRing, label: "Notifications" },
  { href: "/reports", icon: FileBarChart, label: "Reports" },
  { href: "/integrations", icon: PlugZap, label: "Integrations" },
  { href: "/infrastructure/connectors", icon: Waypoints, label: "Conectores" },
  { href: "/infrastructure/connector-groups", icon: Waypoints, label: "Connector Groups" },
  { href: "/scheduler", icon: CalendarClock, label: "Scheduler" },
];

function isNavChildActive(location: string, child: NavChildItem, parentHref: string): boolean {
  if (child.href === parentHref) {
    return location === parentHref;
  }
  return location === child.href || location.startsWith(`${child.href}/`);
}

function isNavItemActive(location: string, item: NavItem): boolean {
  if (item.children?.length) {
    return item.children.some((child) => isNavChildActive(location, child, item.href));
  }
  return location === item.href || (item.href !== "/" && location.startsWith(item.href));
}

export function Layout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const { theme, setTheme } = useTheme();
  const { user, logout } = useAuth();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const connectorSummaryQuery = useQuery({
    queryKey: ["connector-health-summary"],
    queryFn: getConnectorHealthSummary,
    refetchInterval: 60_000,
    enabled: Boolean(user),
  });
  const openConnectorAlerts = connectorSummaryQuery.data?.openAlerts ?? 0;

  return (
    <div className="flex h-screen overflow-hidden bg-background text-foreground">
      {/* Sidebar */}
      <aside
        className={[
          "flex flex-shrink-0 flex-col border-r border-border bg-sidebar transition-all duration-200",
          sidebarCollapsed ? "w-12" : "w-[220px]",
        ].join(" ")}
      >
        <div className="h-12 flex items-center px-4 border-b border-sidebar-border gap-2">
          <Activity className="h-4 w-4 text-primary" />
          {!sidebarCollapsed ? <span className="text-[13px] font-bold tracking-tight text-sidebar-foreground">NetOps Manager</span> : null}
          <Button
            variant="ghost"
            size="icon"
            className="ml-auto h-7 w-7 text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
            onClick={() => setSidebarCollapsed((current) => !current)}
            aria-label={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {sidebarCollapsed ? <ChevronRight className="h-3.5 w-3.5" /> : <ChevronLeft className="h-3.5 w-3.5" />}
          </Button>
        </div>
        
        <nav className={["flex-1 overflow-y-auto py-3 space-y-0.5 scrollbar-thin scrollbar-track-sidebar scrollbar-thumb-sidebar-accent", sidebarCollapsed ? "px-1" : "px-2"].join(" ")}>
          {navItems
            .map((item) => {
            const isActive = isNavItemActive(location, item);
            const Icon = item.icon;
            const label =
              item.href === "/infrastructure/connectors" && openConnectorAlerts > 0
                ? `${item.label} (${openConnectorAlerts})`
                : item.label;

            if (item.children?.length && !sidebarCollapsed) {
              return (
                <div key={item.href} className="space-y-0.5">
                  <Link href={item.href}>
                    <div
                      className={cn(
                        "relative flex items-center rounded-lg transition-colors cursor-pointer text-[13px] font-medium min-h-9 gap-2.5 px-3 py-2",
                        isActive
                          ? "bg-[#1e2a45] text-primary"
                          : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                      )}
                      data-testid={`link-nav-${item.label.toLowerCase().replace(/\s+/g, "-")}`}
                    >
                      {isActive ? <span className="absolute left-0 top-1.5 bottom-1.5 w-0.5 rounded-full bg-primary" /> : null}
                      <Icon className="h-4 w-4 shrink-0" />
                      <span className="truncate">{label}</span>
                    </div>
                  </Link>
                  {item.children.map((child) => {
                    const childActive = isNavChildActive(location, child, item.href);
                    const ChildIcon = child.icon;
                    return (
                      <Link key={child.href} href={child.href}>
                        <div
                          className={cn(
                            "relative flex items-center rounded-lg transition-colors cursor-pointer text-[12px] font-medium min-h-8 gap-2 pl-9 pr-3 py-1.5",
                            childActive
                              ? "bg-[#1e2a45]/80 text-primary"
                              : "text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                          )}
                          data-testid={`link-nav-${child.label.toLowerCase().replace(/\s+/g, "-")}`}
                        >
                          {childActive ? <span className="absolute left-3 top-1.5 bottom-1.5 w-0.5 rounded-full bg-primary" /> : null}
                          {ChildIcon ? <ChildIcon className="h-3.5 w-3.5 shrink-0 opacity-80" /> : null}
                          <span className="truncate">{child.label}</span>
                        </div>
                      </Link>
                    );
                  })}
                </div>
              );
            }

            return (
              <Link key={item.href} href={item.href}>
                <div
                  className={cn(
                    "relative flex items-center rounded-lg transition-colors cursor-pointer text-[13px] font-medium min-h-9",
                    sidebarCollapsed ? "justify-center px-2 gap-0" : "gap-2.5 px-3 py-2",
                    isActive
                      ? "bg-[#1e2a45] text-primary"
                      : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                  )}
                  data-testid={`link-nav-${item.label.toLowerCase().replace(/\s+/g, "-")}`}
                  title={sidebarCollapsed ? label : undefined}
                >
                  {isActive ? <span className="absolute left-0 top-1.5 bottom-1.5 w-0.5 rounded-full bg-primary" /> : null}
                  <Icon className="h-4 w-4 shrink-0" />
                  {!sidebarCollapsed ? <span className="truncate">{label}</span> : null}
                </div>
              </Link>
            );
          })}

        {user?.role === "admin" && (
            <div className="pt-4 border-t border-sidebar-border">
              {!sidebarCollapsed ? (
                <div className="text-[11px] font-semibold tracking-[0.18em] text-sidebar-foreground/60 px-3 py-2 mb-1">ADMINISTRATION</div>
              ) : null}
              <Link href="/users">
                <div
                  className={cn(
                    "relative flex items-center rounded-lg transition-colors cursor-pointer text-[13px] font-medium min-h-9",
                    sidebarCollapsed ? "justify-center px-2 gap-0" : "gap-2.5 px-3 py-2",
                    location === "/users"
                      ? "bg-[#1e2a45] text-primary"
                      : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                  )}
                  title={sidebarCollapsed ? "Users" : undefined}
                >
                  {location === "/users" ? <span className="absolute left-0 top-1.5 bottom-1.5 w-0.5 rounded-full bg-primary" /> : null}
                  <Users className="h-4 w-4 shrink-0" />
                  {!sidebarCollapsed ? <span className="truncate">Users</span> : null}
                </div>
              </Link>
            </div>
          )}
        </nav>
        
        <div className="p-4 border-t border-sidebar-border">
          {!sidebarCollapsed ? (
            <div className="mb-3 rounded-lg border border-sidebar-border bg-sidebar-accent/40 p-3 text-[11px] text-sidebar-foreground">
              <div className="font-semibold text-[12px]">{user?.name ?? "Usuário"}</div>
              <div className="truncate opacity-80">{user?.email ?? "sem sessão"}</div>
              <div className="mt-1 uppercase tracking-[0.18em] opacity-70">{user?.role ?? "viewer"}</div>
            </div>
          ) : null}
          <Button 
            variant="outline" 
            className={cn(
              "w-full text-[12px] text-sidebar-foreground bg-transparent border-sidebar-border hover:bg-sidebar-accent",
              sidebarCollapsed ? "justify-center px-0" : "justify-start",
            )}
            onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
            data-testid="button-toggle-theme"
            title={sidebarCollapsed ? "Toggle Theme" : undefined}
          >
            <Settings className={cn("h-3.5 w-3.5", sidebarCollapsed ? "" : "mr-2")} />
            {!sidebarCollapsed ? "Toggle Theme" : null}
          </Button>
          <Button
            variant="outline"
            className={cn(
              "mt-2 w-full text-[12px] text-sidebar-foreground bg-transparent border-sidebar-border hover:bg-sidebar-accent",
              sidebarCollapsed ? "justify-center px-0" : "justify-start",
            )}
            onClick={() => void logout()}
            title={sidebarCollapsed ? "Logout" : undefined}
          >
            <LogOut className={cn("h-3.5 w-3.5", sidebarCollapsed ? "" : "mr-2")} />
            {!sidebarCollapsed ? "Logout" : null}
          </Button>
        </div>
      </aside>
      
      {/* Main Content */}
      <main className="flex-1 overflow-y-auto bg-background">
        <div className="p-8">
          {children}
        </div>
      </main>
    </div>
  );
}
