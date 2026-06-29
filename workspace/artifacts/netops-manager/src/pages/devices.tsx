import { useEffect } from "react";
import { useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useTranslation } from "@/i18n";

export default function DevicesLegacyRedirect() {
  const [, setLocation] = useLocation();
  const { t } = useTranslation();

  useEffect(() => {
    setLocation("/netops-operations", { replace: true });
  }, [setLocation]);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>{t("devices.title")}</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          {t("devices.redirecting")}
        </CardContent>
      </Card>
    </div>
  );
}
