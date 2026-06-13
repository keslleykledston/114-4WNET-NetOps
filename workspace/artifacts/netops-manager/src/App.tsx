import { useEffect } from "react";
import { Switch, Route, Router as WouterRouter, useLocation } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/components/theme-provider";
import { AuthProvider, useAuth } from "@/components/auth-provider";
import { Layout } from "@/components/layout";
import LoginPage from "@/pages/login";
import Dashboard from "@/pages/dashboard";
import Devices from "@/pages/devices";
import DeviceDetail from "@/pages/device-detail";
import Compliance from "@/pages/compliance";
import Provisioning from "@/pages/provisioning";
import ProvisioningTemplatesPage from "@/pages/provisioning-templates";
import ProvisioningTemplateDetailPage from "@/pages/provisioning-template-detail";
import TemplateStudioPage from "@/pages/template-studio";
import ServiceCatalogPage from "@/pages/service-catalog";
import Templates from "@/pages/templates";
import Audit from "@/pages/audit";
import Reports from "@/pages/reports";
import Integrations from "@/pages/integrations";
import Scheduler from "@/pages/scheduler";
import Policies from "@/pages/policies";
import ConfigCollection from "@/pages/config-collection";
import SnmpHistory from "@/pages/snmp-history";
import NetopsOperations from "@/pages/netops-operations";
import L2Circuits from "@/pages/l2-circuits";
import BgpPeerDrilldownPage from "@/pages/bgp-peer-drilldown";
import OperationalBgpPage from "@/pages/operational-bgp";
import Users from "@/pages/users";
import ConnectorsPage from "@/pages/connectors";
import ConnectorDetailPage from "@/pages/connector-detail";
import ConnectorDashboardPage from "@/pages/connector-dashboard";
import ConnectorGroupsPage from "@/pages/connector-groups";
import CredentialVaultPage from "@/pages/credential-vault";
import NotificationsPage from "@/pages/notifications";
import ConfigGeneratorPage from "@/pages/config-generator";
import BgpAnnouncementsPage from "@/pages/bgp-announcements";
import NotFound from "@/pages/not-found";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: false,
      refetchOnWindowFocus: false,
    },
  },
});

function Router() {
  const { user, loading } = useAuth();
  const [location, setLocation] = useLocation();

  useEffect(() => {
    if (!loading && !user && location !== "/login") {
      setLocation("/login");
    }
    if (!loading && user && location === "/login") {
      setLocation("/");
    }
  }, [loading, location, setLocation, user]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background text-foreground">
        Carregando sessão...
      </div>
    );
  }

  if (!user) {
    return <LoginPage />;
  }

  return (
    <Layout>
      <Switch>
        <Route path="/" component={Dashboard} />
        <Route path="/devices" component={Devices} />
        <Route path="/devices/:id" component={DeviceDetail} />
        <Route path="/compliance" component={Compliance} />
        {/* Provisioning MVP uses Config Generator preview-only flow. Keep legacy apply/execute out of main route. */}
        <Route path="/provisioning" component={Provisioning} />
        <Route path="/provisioning/templates" component={ProvisioningTemplatesPage} />
        <Route path="/provisioning/templates/:id" component={ProvisioningTemplateDetailPage} />
        <Route path="/provisioning/template-studio" component={TemplateStudioPage} />
        <Route path="/provisioning/service-catalog" component={ServiceCatalogPage} />
        <Route path="/templates" component={Templates} />
        <Route path="/audit" component={Audit} />
        <Route path="/reports" component={Reports} />
        <Route path="/integrations" component={Integrations} />
        <Route path="/infrastructure/connectors/dashboard" component={ConnectorDashboardPage} />
        <Route path="/infrastructure/connector-groups" component={ConnectorGroupsPage} />
        <Route path="/infrastructure/connectors/:id" component={ConnectorDetailPage} />
        <Route path="/infrastructure/connectors" component={ConnectorsPage} />
        <Route path="/security/credentials" component={CredentialVaultPage} />
        <Route path="/tenants/notifications" component={NotificationsPage} />
        <Route path="/config-generator" component={ConfigGeneratorPage} />
        <Route path="/scheduler" component={Scheduler} />
        <Route path="/policies" component={Policies} />
        <Route path="/config-collection" component={ConfigCollection} />
        <Route path="/snmp-history" component={SnmpHistory} />
        <Route path="/netops-operations" component={NetopsOperations} />
        <Route path="/bgp-announcements" component={BgpAnnouncementsPage} />
        <Route path="/l2-circuits" component={L2Circuits} />
        <Route path="/bgp/peer-drilldown" component={BgpPeerDrilldownPage} />
        <Route path="/operational/bgp" component={OperationalBgpPage} />
        <Route path="/bgp/operations" component={OperationalBgpPage} />
        <Route path="/users" component={Users} />
        <Route component={NotFound} />
      </Switch>
    </Layout>
  );
}

function App() {
  return (
    <ThemeProvider defaultTheme="dark" storageKey="netops-theme">
      <AuthProvider>
        <QueryClientProvider client={queryClient}>
          <TooltipProvider>
            <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
              <Router />
            </WouterRouter>
            <Toaster />
          </TooltipProvider>
        </QueryClientProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}

export default App;
