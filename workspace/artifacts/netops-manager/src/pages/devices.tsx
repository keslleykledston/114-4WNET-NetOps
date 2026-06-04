import { useEffect } from "react";
import { useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function DevicesLegacyRedirect() {
  const [, setLocation] = useLocation();

  useEffect(() => {
    setLocation("/netops-operations", { replace: true });
  }, [setLocation]);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Devices</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          Redirecting to NetOps Operations...
        </CardContent>
      </Card>
    </div>
  );
}
