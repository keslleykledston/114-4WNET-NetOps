import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertTriangle, Loader2 } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "@/i18n";

interface RollbackPreviewCardProps {
  jobId: number;
  onLoadPreview?: () => void;
  rollbackPreview?: string | null;
  onRollback?: () => void;
  canRollback?: boolean;
  isLoadingPreview?: boolean;
  isRollingBack?: boolean;
}

export function RollbackPreviewCard({
  onLoadPreview,
  rollbackPreview,
  onRollback,
  canRollback = false,
  isLoadingPreview = false,
  isRollingBack = false,
}: RollbackPreviewCardProps) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <AlertTriangle className="h-5 w-5 text-amber-600" />
          {t("provisioningFeatures.rollback.title")}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <Alert>
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>{t("provisioningFeatures.rollback.warning")}</AlertDescription>
        </Alert>

        {!rollbackPreview ? (
          <Button onClick={onLoadPreview} disabled={isLoadingPreview} variant="outline" size="sm">
            {isLoadingPreview ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                {t("provisioningFeatures.rollback.loading")}
              </>
            ) : (
              t("provisioningFeatures.rollback.viewPreview")
            )}
          </Button>
        ) : (
          <>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setExpanded(!expanded)}
              className="h-auto p-0 text-xs"
            >
              {expanded ? t("provisioningFeatures.rollback.hidePlan") : t("provisioningFeatures.rollback.showPlan")}
            </Button>

            {expanded && (
              <pre className="bg-slate-900 text-slate-100 p-3 rounded text-xs font-mono max-h-64 overflow-auto whitespace-pre-wrap break-words">
                {rollbackPreview}
              </pre>
            )}

            {canRollback && (
              <Button onClick={onRollback} disabled={isRollingBack} variant="destructive" size="sm">
                {isRollingBack ? t("provisioningFeatures.rollback.executing") : t("provisioningFeatures.rollback.execute")}
              </Button>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
