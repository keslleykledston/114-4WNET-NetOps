import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CheckCircle, AlertCircle, Clock } from "lucide-react";
import { useState } from "react";
import { ProvisioningJob } from "@/lib/provisioning-api";
import { useTranslation } from "@/i18n";

interface PostcheckResultCardProps {
  job: ProvisioningJob;
  onRunPostcheck?: () => void;
  isRunning?: boolean;
  canRun?: boolean;
}

export function PostcheckResultCard({
  job,
  onRunPostcheck,
  isRunning = false,
  canRun = false,
}: PostcheckResultCardProps) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);

  const getStatusDisplay = (): { label: string; color: string; icon: React.ReactNode } => {
    const status = job.postcheckResult as string;

    switch (status) {
      case "passed":
        return {
          label: t("provisioningFeatures.postcheck.passed"),
          color: "bg-green-100",
          icon: <CheckCircle className="h-5 w-5 text-green-600" />,
        };
      case "failed":
        return {
          label: t("provisioningFeatures.postcheck.failed"),
          color: "bg-red-100",
          icon: <AlertCircle className="h-5 w-5 text-red-600" />,
        };
      case "partial":
        return {
          label: t("provisioningFeatures.postcheck.partial"),
          color: "bg-amber-100",
          icon: <AlertCircle className="h-5 w-5 text-amber-600" />,
        };
      default:
        return {
          label: t("provisioningFeatures.postcheck.notRun"),
          color: "bg-slate-100",
          icon: <Clock className="h-5 w-5 text-slate-400" />,
        };
    }
  };

  const statusDisplay = getStatusDisplay();

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span>{t("provisioningFeatures.postcheck.title")}</span>
          {job.postcheckResult && <Badge className={statusDisplay.color}>{statusDisplay.label}</Badge>}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-start gap-3">
          <div className="pt-0.5">{statusDisplay.icon}</div>
          <div className="flex-1">
            {job.postcheckAt && (
              <p className="text-xs text-gray-600">
                {t("provisioningFeatures.postcheck.executedAt", {
                  at: new Date(job.postcheckAt).toLocaleString(),
                })}
              </p>
            )}

            {job.status === "completed" && canRun && (
              <Button onClick={onRunPostcheck} disabled={isRunning} size="sm" className="mt-2">
                {isRunning ? t("provisioningFeatures.postcheck.running") : t("provisioningFeatures.postcheck.run")}
              </Button>
            )}
          </div>
        </div>

        {job.postcheckOutput && (
          <div className="space-y-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setExpanded(!expanded)}
              className="h-auto p-0 text-xs"
            >
              {expanded ? t("provisioningFeatures.postcheck.hideOutput") : t("provisioningFeatures.postcheck.showOutput")}
            </Button>

            {expanded && (
              <div className="bg-slate-900 text-slate-100 p-3 rounded text-xs font-mono max-h-64 overflow-auto whitespace-pre-wrap break-words">
                {job.postcheckOutput}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
