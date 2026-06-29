import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Lock } from "lucide-react";
import { useTranslation } from "@/i18n";

interface ExecutionPlanCardProps {
  executionPlanJson?: string | null;
}

interface ExecutionPlan {
  commands?: string[];
  timestamp?: string;
}

export function ExecutionPlanCard({ executionPlanJson }: ExecutionPlanCardProps) {
  const { t } = useTranslation();
  let plan: ExecutionPlan | null = null;

  if (executionPlanJson) {
    try {
      plan = JSON.parse(executionPlanJson);
    } catch {
      // Invalid JSON
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Lock className="h-4 w-4" />
          {t("provisioningFeatures.executionPlan.title")}
          <Badge variant="outline" className="bg-green-50">
            {t("provisioningFeatures.executionPlan.locked")}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {!plan ? (
          <p className="text-sm text-gray-500">{t("provisioningFeatures.executionPlan.noPlan")}</p>
        ) : (
          <>
            {plan.timestamp && (
              <p className="text-xs text-gray-500">
                {t("provisioningFeatures.executionPlan.lockedAt", {
                  at: new Date(plan.timestamp).toLocaleString(),
                })}
              </p>
            )}

            {plan.commands && plan.commands.length > 0 ? (
              <ol className="list-decimal list-inside space-y-2">
                {plan.commands.map((cmd, idx) => (
                  <li key={idx} className="text-sm text-gray-700 font-mono break-words">
                    {cmd}
                  </li>
                ))}
              </ol>
            ) : (
              <p className="text-sm text-gray-500">{t("provisioningFeatures.executionPlan.noCommands")}</p>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
