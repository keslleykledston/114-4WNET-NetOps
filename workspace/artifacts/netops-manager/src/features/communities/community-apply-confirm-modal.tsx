import { useEffect, useMemo, useState } from "react";
import { AlertCircle, CheckCircle2, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useTranslation } from "@/i18n";

interface CommunityApplyConfirmModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  warnings: string[];
  missingRefs: string[];
  candidateConfigText: string;
  candidateSha256: string;
  onConfirm: () => Promise<void> | void;
  isPending?: boolean;
}

export function CommunityApplyConfirmModal({
  open,
  onOpenChange,
  warnings,
  missingRefs,
  candidateConfigText,
  candidateSha256,
  onConfirm,
  isPending = false,
}: CommunityApplyConfirmModalProps) {
  const { t } = useTranslation();
  const [confirmedChange, setConfirmedChange] = useState(false);
  const [acceptedRisk, setAcceptedRisk] = useState(false);

  useEffect(() => {
    if (!open) {
      setConfirmedChange(false);
      setAcceptedRisk(false);
    }
  }, [open]);

  const requiresRiskAck = missingRefs.length > 0;
  const canConfirm = confirmedChange && (!requiresRiskAck || acceptedRisk) && !isPending;
  const commandPreview = useMemo(
    () => ["system-view", "[config]", "quit", "commit", "quit"].join("\n"),
    [],
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-full max-w-2xl max-h-[90vh] overflow-hidden rounded-2xl border border-[#252840] bg-[#10131a] p-0 text-foreground shadow-2xl">
        <DialogHeader className="flex items-center justify-between gap-2 border-b border-[#252840] px-6 py-4 text-left">
          <div className="flex items-center gap-2.5">
            <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-brand-blue/20 bg-[#161922]">
              <ShieldAlert className="h-3.5 w-3.5 text-brand-blue" />
            </span>
            <div>
              <DialogTitle className="text-[15px] font-semibold text-foreground">{t("communities.applyModal.title")}</DialogTitle>
              <DialogDescription className="text-[12px] text-muted-foreground">
                {t("communities.applyModal.description")}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="max-h-[calc(90vh-168px)] overflow-y-auto px-6 py-5">
          <div className="space-y-4">
            {warnings.length > 0 ? (
              <Alert className="border-amber-500/25 bg-amber-500/10 text-amber-100">
                <AlertCircle className="h-4 w-4 text-amber-300" />
                <AlertTitle className="text-amber-100">{t("communities.applyModal.warnings")}</AlertTitle>
                <AlertDescription className="space-y-1 text-amber-100/90">
                  {warnings.map((warning) => (
                    <div key={warning}>{warning}</div>
                  ))}
                </AlertDescription>
              </Alert>
            ) : null}

            {missingRefs.length > 0 ? (
              <Alert className="border-red-500/30 bg-red-500/10 text-red-100">
                <ShieldAlert className="h-4 w-4 text-red-300" />
                <AlertTitle className="text-red-100">{t("communities.applyModal.alertMissingRefs")}</AlertTitle>
                <AlertDescription className="space-y-2 text-red-100/90">
                  <p>{t("communities.applyModal.missingRefsDesc")}</p>
                  <div className="flex flex-wrap gap-2">
                    {missingRefs.map((ref) => (
                      <span key={ref} className="rounded-full border border-red-500/20 bg-red-500/10 px-2.5 py-1 font-mono text-[10px] text-red-100">
                        {ref}
                      </span>
                    ))}
                  </div>
                </AlertDescription>
              </Alert>
            ) : null}

            <div className="grid gap-4 md:grid-cols-2">
              <div className="rounded-lg border border-[#252840] bg-[#11141c] p-3">
                <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{t("communities.applyModal.sshCommands")}</div>
                <pre className="mt-2 overflow-auto rounded-lg border border-[#252840] bg-[#0f111a] p-3 text-[11px] leading-5 text-foreground">
                  {commandPreview}
                </pre>
              </div>
              <div className="rounded-lg border border-[#252840] bg-[#11141c] p-3">
                <div className="text-[11px] uppercase tracking-wide text-muted-foreground">SHA-256</div>
                <div className="mt-2 break-all font-mono text-[10px] text-foreground">{candidateSha256}</div>
                <div className="mt-3 text-xs text-muted-foreground">
                  {t("communities.applyModal.sha256Hint")}
                </div>
              </div>
            </div>

            <div className="rounded-lg border border-[#252840] bg-[#11141c] p-3">
              <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{t("communities.applyModal.generatedConfig")}</div>
              <pre className="mt-2 max-h-72 overflow-auto rounded-lg border border-[#252840] bg-[#0f111a] p-3 text-[11px] leading-5 text-foreground">
                {candidateConfigText}
              </pre>
            </div>

            <div className="space-y-3 rounded-lg border border-[#252840] bg-[#11141c] p-3">
              <label className="flex items-start gap-3 text-sm text-foreground">
                <Checkbox checked={confirmedChange} onCheckedChange={(checked) => setConfirmedChange(Boolean(checked))} />
                <span>{t("communities.applyModal.confirmRead")}</span>
              </label>
              {requiresRiskAck ? (
                <label className="flex items-start gap-3 text-sm text-foreground">
                  <Checkbox checked={acceptedRisk} onCheckedChange={(checked) => setAcceptedRisk(Boolean(checked))} />
                  <span>{t("communities.applyModal.acceptRisk")}</span>
                </label>
              ) : null}
            </div>
          </div>
        </div>

        <DialogFooter className="border-t border-[#252840] px-6 py-4">
          <Button variant="outline" onClick={() => onOpenChange(false)} className="border-[#252840] text-muted-foreground hover:bg-[#1a1d2e] hover:text-foreground">
            {t("communities.applyModal.cancel")}
          </Button>
          <Button
            onClick={() => void onConfirm()}
            disabled={!canConfirm}
            className="bg-brand-blue text-white hover:bg-brand-blue-hover"
          >
            <CheckCircle2 className="mr-2 h-4 w-4" />
            {t("communities.applyModal.confirmApply")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
