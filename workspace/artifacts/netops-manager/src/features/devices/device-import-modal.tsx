import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertCircle, Upload, Loader2 } from "lucide-react";
import { useTranslation } from "@/i18n";
import {
  usePreviewDeviceImport,
  useApplyDeviceImport,
  type DeviceImportPreviewResponse,
  type DeviceImportApplyResponse,
} from "@workspace/api-client-react";

interface DeviceImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

type Step = "upload" | "preview" | "apply" | "done";

interface PreviewState {
  data: DeviceImportPreviewResponse | null;
  loading: boolean;
  error: string | null;
}

export function DeviceImportModal({
  isOpen,
  onClose,
  onSuccess,
}: DeviceImportModalProps) {
  const { t } = useTranslation();
  const [step, setStep] = useState<Step>("upload");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<PreviewState>({
    data: null,
    loading: false,
    error: null,
  });
  const [mode, setMode] = useState<"create_only" | "update_existing" | "upsert">(
    "upsert"
  );
  const [applying, setApplying] = useState(false);
  const [applyError, setApplyError] = useState<string | null>(null);
  const [applyResult, setApplyResult] = useState<DeviceImportApplyResponse | null>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      setFile(selectedFile);
    }
  };

  const previewMutation = usePreviewDeviceImport();
  const applyMutation = useApplyDeviceImport();

  const handlePreview = async () => {
    if (!file) return;

    setPreview({ data: null, loading: true, error: null });

    try {
      const formData = new FormData();
      formData.append("file", file);

      const response = await previewMutation.mutateAsync({
        data: formData as any,
      });

      setPreview({ data: response, loading: false, error: null });
      setStep("preview");
    } catch (err) {
      setPreview({
        data: null,
        loading: false,
        error: err instanceof Error ? err.message : t("deviceImport.errors.uploadFailed"),
      });
    }
  };

  const handleApply = async () => {
    if (!preview.data) return;

    setApplying(true);
    setApplyError(null);

    try {
      const response = await applyMutation.mutateAsync({
        data: {
          previewToken: preview.data.previewToken,
          mode,
        },
      });

      setApplyResult(response);
      setStep("done");
    } catch (err) {
      setApplyError(
        err instanceof Error ? err.message : t("deviceImport.errors.applyFailed")
      );
    } finally {
      setApplying(false);
    }
  };

  const handleClose = () => {
    if (step === "done" && applyResult?.success) {
      onSuccess?.();
    }
    setStep("upload");
    setFile(null);
    setPreview({ data: null, loading: false, error: null });
    setApplyResult(null);
    setApplyError(null);
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t("deviceImport.title")}</DialogTitle>
        </DialogHeader>

        {step === "upload" && (
          <div className="space-y-4">
            <div className="border-2 border-dashed border-slate-700 rounded-lg p-8 text-center">
              <Upload className="mx-auto h-12 w-12 text-slate-400 mb-4" />
              <label className="cursor-pointer">
                <span className="text-sm font-medium text-slate-200">
                  {t("deviceImport.selectFile")}
                </span>
                <input
                  type="file"
                  accept=".csv,.txt,.xlsx"
                  onChange={handleFileChange}
                  className="hidden"
                />
              </label>
              <p className="text-xs text-slate-500 mt-2">
                {t("deviceImport.fileHint")}
              </p>
              {file && (
                <p className="text-sm text-slate-300 mt-4">
                  {file.name}
                </p>
              )}
            </div>

            {preview.error && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{preview.error}</AlertDescription>
              </Alert>
            )}

            <div className="flex gap-2 justify-end">
              <Button
                variant="outline"
                onClick={handleClose}
              >
                {t("deviceImport.cancel")}
              </Button>
              <Button
                onClick={handlePreview}
                disabled={!file || preview.loading}
              >
                {preview.loading && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                )}
                {t("deviceImport.preview")}
              </Button>
            </div>
          </div>
        )}

        {step === "preview" && preview.data && (
          <div className="space-y-4 max-h-96 overflow-y-auto">
            <div className="bg-slate-900 border border-slate-800 rounded p-4">
              <h3 className="text-sm font-medium text-slate-200 mb-3">
                {t("deviceImport.summary")}
              </h3>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div>
                  <span className="text-slate-400">{t("deviceImport.labels.total")}</span>{" "}
                  <span className="text-slate-200 font-mono">
                    {preview.data.summary.totalRows}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400">{t("deviceImport.labels.valid")}</span>{" "}
                  <span className="text-green-400 font-mono">
                    {preview.data.summary.validRows}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400">{t("deviceImport.labels.invalid")}</span>{" "}
                  <span className="text-red-400 font-mono">
                    {preview.data.summary.invalidRows}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400">{t("deviceImport.labels.toCreate")}</span>{" "}
                  <span className="text-blue-400 font-mono">
                    {preview.data.summary.toCreate}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400">{t("deviceImport.labels.toUpdate")}</span>{" "}
                  <span className="text-yellow-400 font-mono">
                    {preview.data.summary.toUpdate}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400">{t("deviceImport.labels.toSkip")}</span>{" "}
                  <span className="text-slate-400 font-mono">
                    {preview.data.summary.toSkip}
                  </span>
                </div>
              </div>
            </div>

            {preview.data.summary.invalidRows > 0 && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  {t("deviceImport.invalidRowsAlert", { count: preview.data.summary.invalidRows })}
                </AlertDescription>
              </Alert>
            )}

            {preview.data.summary.duplicates > 0 && (
              <Alert>
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  {t("deviceImport.duplicatesAlert", { count: preview.data.summary.duplicates })}
                </AlertDescription>
              </Alert>
            )}

            <div>
              <label className="text-sm font-medium text-slate-300 mb-2 block">
                {t("deviceImport.importMode")}
              </label>
              <select
                value={mode}
                onChange={(e) =>
                  setMode(e.target.value as typeof mode)
                }
                className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded text-sm text-slate-200"
              >
                <option value="upsert">
                  {t("deviceImport.modes.upsert")}
                </option>
                <option value="create_only">
                  {t("deviceImport.modes.create_only")}
                </option>
                <option value="update_existing">
                  {t("deviceImport.modes.update_existing")}
                </option>
              </select>
            </div>

            <div className="flex gap-2 justify-end">
              <Button
                variant="outline"
                onClick={() => setStep("upload")}
              >
                {t("deviceImport.back")}
              </Button>
              <Button
                onClick={handleClose}
              >
                {t("deviceImport.cancel")}
              </Button>
              <Button
                onClick={handleApply}
                disabled={applying || preview.data.summary.invalidRows > 0}
              >
                {applying && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                )}
                {t("deviceImport.apply")}
              </Button>
            </div>
          </div>
        )}

        {step === "done" && applyResult && (
          <div className="space-y-4">
            {applyResult.success ? (
              <Alert className="bg-green-950 border border-green-800">
                <AlertCircle className="h-4 w-4 text-green-400" />
                <AlertDescription className="text-green-200">
                  {t("deviceImport.successMessage")}
                </AlertDescription>
              </Alert>
            ) : (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  {t("deviceImport.completedWithErrors")}
                </AlertDescription>
              </Alert>
            )}

            <div className="bg-slate-900 border border-slate-800 rounded p-4">
              <h3 className="text-sm font-medium text-slate-200 mb-3">
                {t("deviceImport.result")}
              </h3>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div>
                  <span className="text-slate-400">{t("deviceImport.labels.created")}</span>{" "}
                  <span className="text-green-400 font-mono">
                    {applyResult.summary.created}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400">{t("deviceImport.labels.updated")}</span>{" "}
                  <span className="text-yellow-400 font-mono">
                    {applyResult.summary.updated}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400">{t("deviceImport.labels.skipped")}</span>{" "}
                  <span className="text-slate-400 font-mono">
                    {applyResult.summary.skipped}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400">{t("deviceImport.labels.failed")}</span>{" "}
                  <span className="text-red-400 font-mono">
                    {applyResult.summary.failed}
                  </span>
                </div>
              </div>
            </div>

            {applyResult.errors.length > 0 && (
              <div className="max-h-40 overflow-y-auto space-y-1">
                <h3 className="text-sm font-medium text-slate-300">{t("deviceImport.errorsTitle")}</h3>
                {applyResult.errors.slice(0, 10).map((err, idx) => (
                  <div
                    key={idx}
                    className="text-xs text-red-300 bg-red-950 bg-opacity-20 p-2 rounded"
                  >
                    {t("deviceImport.rowLabel", { rowNumber: err.rowNumber })} {err.message}
                  </div>
                ))}
                {applyResult.errors.length > 10 && (
                  <div className="text-xs text-slate-400">
                    {t("deviceImport.moreErrors", { count: applyResult.errors.length - 10 })}
                  </div>
                )}
              </div>
            )}

            <div className="flex gap-2 justify-end">
              <Button onClick={handleClose}>
                {t("deviceImport.close")}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
