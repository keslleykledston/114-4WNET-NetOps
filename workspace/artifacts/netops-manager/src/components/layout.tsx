import { Link, useLocation } from "wouter";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { getConnectorHealthSummary } from "@/features/connectors/connectors-api";
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
  PlugZap,
  Map,
  Waypoints,
  CalendarClock,
  Network,
  Users,
  GitBranch,
  KeyRound,
  BellRing,
  ClipboardList,
  ChevronLeft,
  ChevronRight,
  LogOut,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useTheme } from "./theme-provider";
import { Button } from "@/components/ui/button";
import { useAuth } from "./auth-provider";
import { useTranslation } from "@/i18n";

const navItems = [
  { href: "/", icon: LayoutDashboard, labelKey: "nav.dashboard" },
  { href: "/map", icon: Map, labelKey: "nav.map" },
  { href: "/l2-circuits", icon: Network, labelKey: "nav.l2Circuits" },
  { href: "/compliance", icon: ShieldCheck, labelKey: "nav.compliance" },
  { href: "/provisioning", icon: Rocket, labelKey: "nav.provisioning" },
  { href: "/provisioning/templates", icon: FileCode, labelKey: "nav.templateRegistry" },
  { href: "/provisioning/template-studio", icon: FileCode, labelKey: "nav.templateStudio" },
  { href: "/provisioning/service-catalog", icon: FileCode, labelKey: "nav.serviceCatalog" },
  { href: "/templates", icon: FileCode, labelKey: "nav.templates" },
  { href: "/policies", icon: ScrollText, labelKey: "nav.policies" },
  { href: "/config-collection", icon: DownloadCloud, labelKey: "nav.configCollection" },
  { href: "/snmp-history", icon: RadioTower, labelKey: "nav.snmpHistory" },
  { href: "/netops-operations", icon: Workflow, labelKey: "nav.netopsOperations" },
  { href: "/operational/bgp", icon: GitBranch, labelKey: "nav.bgpOperations" },
  { href: "/bgp/peer-drilldown", icon: GitBranch, labelKey: "nav.bgpDrilldown" },
  { href: "/bgp/announcements", icon: ClipboardList, labelKey: "nav.bgpAnnouncements" },
  { href: "/audit", icon: ShieldAlert, labelKey: "nav.audit" },
  { href: "/security/credentials", icon: KeyRound, labelKey: "nav.credentialVault" },
  { href: "/tenants/notifications", icon: BellRing, labelKey: "nav.notifications" },
  { href: "/reports", icon: FileBarChart, labelKey: "nav.reports" },
  { href: "/integrations", icon: PlugZap, labelKey: "nav.integrations" },
  { href: "/infrastructure/connectors", icon: Waypoints, labelKey: "nav.connectors" },
  { href: "/infrastructure/connector-groups", icon: Waypoints, labelKey: "nav.connectorGroups" },
  { href: "/scheduler", icon: CalendarClock, labelKey: "nav.scheduler" },
] as const;

export function Layout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const isFullscreenMap = location === "/map";
  const { theme, setTheme } = useTheme();
  const { user, logout } = useAuth();
  const { t, locale, setLocale } = useTranslation();
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
          {!sidebarCollapsed ? <span className="text-[13px] font-bold tracking-tight text-sidebar-foreground">{t("app.brandName")}</span> : null}
          <Button
            variant="ghost"
            size="icon"
            className="ml-auto h-7 w-7 text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
            onClick={() => setSidebarCollapsed((current) => !current)}
            aria-label={sidebarCollapsed ? t("layout.expandSidebar") : t("layout.collapseSidebar")}
          >
            {sidebarCollapsed ? <ChevronRight className="h-3.5 w-3.5" /> : <ChevronLeft className="h-3.5 w-3.5" />}
          </Button>
        </div>
        
        <nav className={["flex-1 overflow-y-auto py-3 space-y-0.5 scrollbar-thin scrollbar-track-sidebar scrollbar-thumb-sidebar-accent", sidebarCollapsed ? "px-1" : "px-2"].join(" ")}>
          {navItems.map((item) => {
            const isActive = location === item.href || (item.href !== "/" && location.startsWith(item.href));
            const Icon = item.icon;
            const label =
              item.href === "/infrastructure/connectors" && openConnectorAlerts > 0
                ? t("nav.connectorAlerts", { count: openConnectorAlerts })
                : t(item.labelKey);

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
                  data-testid={`link-nav-${item.labelKey.split(".").pop()}`}
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
                <div className="text-[11px] font-semibold tracking-[0.18em] text-sidebar-foreground/60 px-3 py-2 mb-1">{t("layout.administration")}</div>
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
                  title={sidebarCollapsed ? t("nav.users") : undefined}
                >
                  {location === "/users" ? <span className="absolute left-0 top-1.5 bottom-1.5 w-0.5 rounded-full bg-primary" /> : null}
                  <Users className="h-4 w-4 shrink-0" />
                  {!sidebarCollapsed ? <span className="truncate">{t("nav.users")}</span> : null}
                </div>
              </Link>
            </div>
          )}
        </nav>
        
        <div className="p-4 border-t border-sidebar-border">
          {!sidebarCollapsed ? (
            <div className="mb-3 rounded-lg border border-sidebar-border bg-sidebar-accent/40 p-3 text-[11px] text-sidebar-foreground">
              <div className="font-semibold text-[12px]">{user?.name ?? t("layout.user")}</div>
              <div className="truncate opacity-80">{user?.email ?? t("layout.noSession")}</div>
              <div className="mt-1 uppercase tracking-[0.18em] opacity-70">{user?.role ?? "viewer"}</div>
            </div>
          ) : null}
          <Button
            variant="outline"
            className={cn(
              "w-full text-[12px] text-sidebar-foreground bg-transparent border-sidebar-border hover:bg-sidebar-accent",
              sidebarCollapsed ? "justify-center px-0" : "justify-start",
            )}
            onClick={() => setLocale(locale === "pt-BR" ? "en" : "pt-BR")}
            data-testid="button-toggle-language"
            title={sidebarCollapsed ? (locale === "pt-BR" ? t("layout.languageEn") : t("layout.languagePt")) : undefined}
          >
            <span className={cn("text-[11px] font-semibold", sidebarCollapsed ? "" : "mr-2")}>
              {locale === "pt-BR" ? t("layout.languagePt") : t("layout.languageEn")}
            </span>
            {!sidebarCollapsed ? (
              <span className="text-[11px] opacity-70">↔ {locale === "pt-BR" ? t("layout.languageEn") : t("layout.languagePt")}</span>
            ) : null}
          </Button>
          <Button 
            variant="outline" 
            className={cn(
              "mt-2 w-full text-[12px] text-sidebar-foreground bg-transparent border-sidebar-border hover:bg-sidebar-accent",
              sidebarCollapsed ? "justify-center px-0" : "justify-start",
            )}
            onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
            data-testid="button-toggle-theme"
            title={sidebarCollapsed ? t("layout.toggleTheme") : undefined}
          >
            <Settings className={cn("h-3.5 w-3.5", sidebarCollapsed ? "" : "mr-2")} />
            {!sidebarCollapsed ? t("layout.toggleTheme") : null}
          </Button>
          <Button
            variant="outline"
            className={cn(
              "mt-2 w-full text-[12px] text-sidebar-foreground bg-transparent border-sidebar-border hover:bg-sidebar-accent",
              sidebarCollapsed ? "justify-center px-0" : "justify-start",
            )}
            onClick={() => void logout()}
            title={sidebarCollapsed ? t("layout.logout") : undefined}
          >
            <LogOut className={cn("h-3.5 w-3.5", sidebarCollapsed ? "" : "mr-2")} />
            {!sidebarCollapsed ? t("layout.logout") : null}
          </Button>
        </div>
      </aside>
      
      {/* Main Content */}
      <main className={cn("flex-1 bg-background", isFullscreenMap ? "flex min-h-0 flex-col overflow-hidden" : "overflow-y-auto")}>
        {isFullscreenMap ? children : <div className="p-8">{children}</div>}
      </main>
    </div>
  );
}
