import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Check, X, Loader2, Circle } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useTranslation } from "@/i18n";

interface ProvisioningStep {
  stepName: string;
  status: "success" | "failed" | "pending" | "running";
  stdout?: string;
  stderr?: string;
  executedAt?: string;
  duration?: number;
}

interface ExecutionResultTimelineProps {
  steps?: ProvisioningStep[];
}

function maskSensitiveContent(text: string): string {
  return text
    .replace(/password=[^\s&]*/gi, "password=[REDACTED]")
    .replace(/community=[^\s&]*/gi, "community=[REDACTED]")
    .replace(/snmp-string=[^\s&]*/gi, "snmp-string=[REDACTED]");
}

function getStatusIcon(status: string) {
  switch (status) {
    case "success":
      return <Check className="h-5 w-5 text-green-600" />;
    case "failed":
      return <X className="h-5 w-5 text-red-600" />;
    case "running":
      return <Loader2 className="h-5 w-5 text-blue-600 animate-spin" />;
    default:
      return <Circle className="h-5 w-5 text-gray-400" />;
  }
}

function getStatusColor(status: string): string {
  switch (status) {
    case "success":
      return "bg-green-100";
    case "failed":
      return "bg-red-100";
    case "running":
      return "bg-blue-100";
    default:
      return "bg-gray-100";
  }
}

export function ExecutionResultTimeline({ steps = [] }: ExecutionResultTimelineProps) {
  const { t } = useTranslation();
  const [expandedSteps, setExpandedSteps] = useState<Set<number>>(new Set());

  const toggleStep = (idx: number) => {
    const newExpanded = new Set(expandedSteps);
    if (newExpanded.has(idx)) {
      newExpanded.delete(idx);
    } else {
      newExpanded.add(idx);
    }
    setExpandedSteps(newExpanded);
  };

  if (steps.length === 0) {
    return null;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("provisioningFeatures.timeline.title")}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {steps.map((step, idx) => (
            <div key={idx} className={`p-4 rounded-lg border ${getStatusColor(step.status)}`}>
              <div className="flex items-start gap-3">
                <div className="pt-1">
                  {getStatusIcon(step.status)}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-semibold text-sm">{step.stepName}</p>
                  </div>

                  {step.executedAt && (
                    <p className="text-xs text-gray-600 mt-1">
                      {new Date(step.executedAt).toLocaleString()}
                      {step.duration &&
                        ` (${t("provisioningFeatures.timeline.duration", { seconds: (step.duration / 1000).toFixed(2) })})`}
                    </p>
                  )}

                  {(step.stdout || step.stderr) && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => toggleStep(idx)}
                      className="mt-2 h-auto p-0 text-xs"
                    >
                      {expandedSteps.has(idx) ? t("provisioningFeatures.timeline.hideDetails") : t("provisioningFeatures.timeline.showDetails")}
                    </Button>
                  )}

                  {expandedSteps.has(idx) && (
                    <div className="mt-2 space-y-2">
                      {step.stdout && (
                        <div className="bg-slate-900 text-slate-100 p-2 rounded text-xs font-mono max-h-48 overflow-auto whitespace-pre-wrap break-words">
                          {maskSensitiveContent(step.stdout)}
                        </div>
                      )}

                      {step.stderr && (
                        <div className="bg-red-950 text-red-100 p-2 rounded text-xs font-mono max-h-48 overflow-auto whitespace-pre-wrap break-words">
                          {maskSensitiveContent(step.stderr)}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
