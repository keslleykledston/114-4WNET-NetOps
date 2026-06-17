import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Copy, Download, FileText, Loader2, Package } from "lucide-react";
import {
  useConfigGeneratorChangeRequestPreview,
  useGenerateConfigGeneratorChangeRequestPreviewMutation,
  type ConfigGeneratorChangeRequestPreview,
} from "@/features/config-generator/config-generator-api";

type Props = {
  runId: number | null;
  canGenerate?: boolean;
  onCopy?: (text: string) => void;
  onDownload?: (filename: string, text: string) => void;
};

function riskVariant(level?: string): "default" | "secondary" | "destructive" | "outline" {
  if (level === "blocked" || level === "high") return "destructive";
  if (level === "medium") return "secondary";
  return "outline";
}

function PreviewBody({ preview }: { preview: ConfigGeneratorChangeRequestPreview }) {
  return (
    <div className="space-y-4 text-sm">
      <div className="flex flex-wrap gap-2">
        <Badge variant="outline">{preview.status}</Badge>
        <Badge variant={riskVariant(preview.riskLevel)}>risk: {preview.riskLevel}</Badge>
        <Badge variant="outline">score {preview.riskAssessment.score}</Badge>
      </div>
      <div>
        <p className="font-medium">{preview.summary.title}</p>
        <p className="text-muted-foreground">{preview.summary.description}</p>
      </div>
      <div className="grid gap-2 md:grid-cols-2">
        <div>
          <p className="font-medium">Escopo</p>
          <p className="text-muted-foreground">Tenant: {preview.scope.tenant}</p>
          <p className="text-muted-foreground">Device: {preview.scope.device}</p>
          <p className="text-muted-foreground">VLANs: {preview.scope.vlans.join(", ") || "—"}</p>
        </div>
        <div>
          <p className="font-medium">Validações</p>
          <p className="text-muted-foreground">Erros: {preview.validations.errors.length}</p>
          <p className="text-muted-foreground">Warnings: {preview.validations.warnings.length}</p>
          <p className="text-muted-foreground">Diff blocking: {preview.diff.blocking ? "sim" : "não"}</p>
        </div>
      </div>
      {preview.riskAssessment.factors.length > 0 ? (
        <div>
          <p className="font-medium mb-1">Fatores de risco</p>
          <ul className="list-disc pl-5 text-muted-foreground space-y-1">
            {preview.riskAssessment.factors.map((factor) => (
              <li key={`${factor.code}-${factor.message}`}>[{factor.severity}] {factor.message}</li>
            ))}
          </ul>
        </div>
      ) : null}
      {preview.riskLevel === "blocked" ? (
        <Alert variant="destructive">
          <AlertTitle>Pacote bloqueado</AlertTitle>
          <AlertDescription>Revise conflitos/validações antes de considerar execução futura. Nenhuma aprovação ou apply está disponível nesta fase.</AlertDescription>
        </Alert>
      ) : null}
      <div>
        <p className="font-medium mb-1">Ticket markdown</p>
        <Textarea readOnly value={preview.ticketMarkdown} className="min-h-48 font-mono text-xs" />
      </div>
    </div>
  );
}

export function ConfigGeneratorChangeRequestPreviewPanel({
  runId,
  canGenerate = false,
  onCopy,
  onDownload,
}: Props) {
  const previewQuery = useConfigGeneratorChangeRequestPreview(runId, Boolean(runId));
  const generateMutation = useGenerateConfigGeneratorChangeRequestPreviewMutation();

  const preview = generateMutation.data?.preview ?? previewQuery.data?.preview ?? null;

  const handleGenerate = () => {
    if (!runId) return;
    generateMutation.mutate({ id: runId });
  };

  const handleCopy = () => {
    if (!preview?.ticketMarkdown || !onCopy) return;
    onCopy(preview.ticketMarkdown);
  };

  const handleDownload = () => {
    if (!preview?.ticketMarkdown || !onDownload || !runId) return;
    onDownload(`change-request-preview-${runId}.md`, preview.ticketMarkdown);
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
        <div>
          <CardTitle className="flex items-center gap-2 text-base">
            <Package className="h-4 w-4" />
            Pacote de mudança
          </CardTitle>
          <CardDescription>Change Request Preview — documentação revisável, sem execução em device.</CardDescription>
        </div>
        {canGenerate && runId ? (
          <Button size="sm" variant="outline" disabled={generateMutation.isPending} onClick={handleGenerate}>
            {generateMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="mr-2 h-4 w-4" />}
            Gerar pacote
          </Button>
        ) : null}
      </CardHeader>
      <CardContent className="space-y-4">
        {!runId ? (
          <p className="text-sm text-muted-foreground">Gere ou carregue um preview/run para consolidar o pacote.</p>
        ) : previewQuery.isLoading && !preview ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : preview ? (
          <>
            <PreviewBody preview={preview} />
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="outline" onClick={handleCopy} disabled={!onCopy}>
                <Copy className="mr-2 h-4 w-4" />
                Copiar markdown
              </Button>
              <Button size="sm" variant="outline" onClick={handleDownload} disabled={!onDownload}>
                <Download className="mr-2 h-4 w-4" />
                Baixar .md
              </Button>
            </div>
          </>
        ) : (
          <p className="text-sm text-muted-foreground">Nenhum pacote salvo para este run. Operador pode gerar preview.</p>
        )}
      </CardContent>
    </Card>
  );
}
