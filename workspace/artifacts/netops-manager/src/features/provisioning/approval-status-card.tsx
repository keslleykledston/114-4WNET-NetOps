import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertCircle, CheckCircle } from "lucide-react";
import { ProvisioningJob } from "@/lib/provisioning-api";
import { useTranslation } from "@/i18n";

interface ApprovalStatusCardProps {
  job: ProvisioningJob;
  onApprove?: () => void;
  onRequestApproval?: () => void;
  canApprove?: boolean;
  canRequestApproval?: boolean;
  isApproving?: boolean;
  executeEnabled?: boolean;
}

const statusColors: Record<string, string> = {
  draft: "bg-slate-200",
  validated: "bg-blue-200",
  pending_approval: "bg-yellow-200",
  approved: "bg-green-200",
  executing: "bg-purple-200",
  completed: "bg-green-100",
  blocked: "bg-red-200",
  failed: "bg-red-100",
};

export function ApprovalStatusCard({
  job,
  onApprove,
  onRequestApproval,
  canApprove = false,
  canRequestApproval = false,
  isApproving = false,
  executeEnabled = true,
}: ApprovalStatusCardProps) {
  const { t } = useTranslation();

  const statusLabel = (status: string) => {
    const key = `provisioningFeatures.approval.statusLabels.${status}`;
    const translated = t(key);
    return translated === key ? status : translated;
  };

  const isWindowActive =
    job.maintenanceWindowStart && job.maintenanceWindowEnd
      ? new Date() >= new Date(job.maintenanceWindowStart) && new Date() <= new Date(job.maintenanceWindowEnd)
      : true;

  const maintenanceWindow =
    job.maintenanceWindowStart && job.maintenanceWindowEnd
      ? `${new Date(job.maintenanceWindowStart).toLocaleString()} → ${new Date(job.maintenanceWindowEnd).toLocaleString()}`
      : null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span>{t("provisioningFeatures.approval.cardTitle")}</span>
          <Badge className={statusColors[job.status] || "bg-gray-200"}>{statusLabel(job.status)}</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {!executeEnabled && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{t("provisioningFeatures.approval.executeDisabled")}</AlertDescription>
          </Alert>
        )}

        {job.approvedByUserId && job.approvedAt && (
          <div className="text-sm text-gray-600">
            <p className="font-semibold">{t("provisioningFeatures.approval.approvedBy")}</p>
            <p>
              {t("provisioningFeatures.approval.approvedByUser", {
                id: job.approvedByUserId,
                at: new Date(job.approvedAt).toLocaleString(),
              })}
            </p>
          </div>
        )}

        {maintenanceWindow && (
          <div className="text-sm text-gray-600">
            <p className="font-semibold">{t("provisioningFeatures.approval.maintenanceWindow")}</p>
            <p>{maintenanceWindow}</p>
            {!isWindowActive && <p className="text-amber-600 mt-1">⚠️ {t("provisioningFeatures.approval.outsideWindow")}</p>}
            {isWindowActive && <p className="text-green-600 mt-1">✓ {t("provisioningFeatures.approval.insideWindow")}</p>}
          </div>
        )}

        <div className="flex gap-2">
          {job.status === "validated" && canRequestApproval && (
            <Button onClick={onRequestApproval} variant="outline" size="sm">
              {t("provisioningFeatures.approval.requestApproval")}
            </Button>
          )}

          {job.status === "pending_approval" && canApprove && (
            <Button onClick={onApprove} disabled={isApproving} size="sm" className="bg-green-600 hover:bg-green-700">
              {isApproving ? t("provisioningFeatures.approval.approving") : t("provisioningFeatures.approval.approve")}
            </Button>
          )}

          {job.status === "pending_approval" && !canApprove && (
            <p className="text-sm text-gray-500">{t("provisioningFeatures.approval.requiresPermission")}</p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
