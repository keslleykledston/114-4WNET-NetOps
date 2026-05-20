import { Link, useLocation } from "wouter";
import { 
  Server, 
  ShieldCheck, 
  Rocket, 
  FileCode, 
  ScrollText, 
  DownloadCloud, 
  LayoutDashboard,
  Settings,
  Activity
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useTheme } from "./theme-provider";
import { Button } from "@/components/ui/button";

const navItems = [
  { href: "/", icon: LayoutDashboard, label: "Dashboard" },
  { href: "/devices", icon: Server, label: "Devices" },
  { href: "/compliance", icon: ShieldCheck, label: "Compliance" },
  { href: "/provisioning", icon: Rocket, label: "Provisioning" },
  { href: "/templates", icon: FileCode, label: "Templates" },
  { href: "/policies", icon: ScrollText, label: "Policies" },
  { href: "/config-collection", icon: DownloadCloud, label: "Config Collection" },
];

export function Layout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const { theme, setTheme } = useTheme();

  return (
    <div className="flex h-screen overflow-hidden bg-background text-foreground">
      {/* Sidebar */}
      <aside className="w-64 flex-shrink-0 border-r border-border bg-sidebar flex flex-col">
        <div className="h-14 flex items-center px-4 border-b border-sidebar-border gap-2">
          <Activity className="h-5 w-5 text-primary" />
          <span className="font-bold tracking-tight text-sidebar-foreground">NetOps Manager</span>
        </div>
        
        <nav className="flex-1 overflow-y-auto py-4 px-2 space-y-1">
          {navItems.map((item) => {
            const isActive = location === item.href || (item.href !== "/" && location.startsWith(item.href));
            const Icon = item.icon;
            
            return (
              <Link key={item.href} href={item.href}>
                <div 
                  className={cn(
                    "flex items-center gap-3 px-3 py-2 rounded-md transition-colors cursor-pointer text-sm font-medium",
                    isActive 
                      ? "bg-sidebar-primary text-sidebar-primary-foreground" 
                      : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                  )}
                  data-testid={`link-nav-${item.label.toLowerCase().replace(/\s+/g, '-')}`}
                >
                  <Icon className="h-4 w-4" />
                  {item.label}
                </div>
              </Link>
            );
          })}
        </nav>
        
        <div className="p-4 border-t border-sidebar-border">
          <Button 
            variant="outline" 
            className="w-full justify-start text-sidebar-foreground bg-transparent border-sidebar-border hover:bg-sidebar-accent"
            onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
            data-testid="button-toggle-theme"
          >
            <Settings className="mr-2 h-4 w-4" />
            Toggle Theme
          </Button>
        </div>
      </aside>
      
      {/* Main Content */}
      <main className="flex-1 overflow-y-auto bg-background">
        <div className="p-6">
          {children}
        </div>
      </main>
    </div>
  );
}