import { useEffect } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/components/auth-provider";
import { useUserModules } from "@/features/user-profiles/user-profiles-api";
import { isPathModuleEnabled } from "@/features/user-profiles/nav-modules";

export function ModuleAccessGuard({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [location, setLocation] = useLocation();
  const { data } = useUserModules(Boolean(user));

  useEffect(() => {
    if (!user || !data) return;
    if (location === "/login") return;
    const allowed = isPathModuleEnabled(location, data.modules, user.role === "admin");
    if (!allowed) {
      setLocation("/");
    }
  }, [user, data, location, setLocation]);

  return <>{children}</>;
}
