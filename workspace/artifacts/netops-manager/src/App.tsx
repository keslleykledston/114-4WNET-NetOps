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
import Users from "@/pages/users";
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
        <Route path="/provisioning" component={Provisioning} />
        <Route path="/templates" component={Templates} />
        <Route path="/audit" component={Audit} />
        <Route path="/reports" component={Reports} />
        <Route path="/integrations" component={Integrations} />
        <Route path="/scheduler" component={Scheduler} />
        <Route path="/policies" component={Policies} />
        <Route path="/config-collection" component={ConfigCollection} />
        <Route path="/snmp-history" component={SnmpHistory} />
        <Route path="/netops-operations" component={NetopsOperations} />
        <Route path="/l2-circuits" component={L2Circuits} />
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
