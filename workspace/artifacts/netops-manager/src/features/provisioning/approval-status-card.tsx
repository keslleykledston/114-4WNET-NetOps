import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertCircle, CheckCircle } from "lucide-react";
import { ProvisioningJob } from "@/lib/provisioning-api";

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

const statusLabels: Record<string, string> = {
  draft: "Rascunho",
  validated: "Validado",
  pending_approval: "Aguardando Aprovação",
  approved: "Aprovado",
  executing: "Executando",
  completed: "Concluído",
  blocked: "Bloqueado",
  failed: "Falhou",
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
  const isWindowActive = job.maintenanceWindowStart && job.maintenanceWindowEnd
    ? new Date() >= new Date(job.maintenanceWindowStart) && new Date() <= new Date(job.maintenanceWindowEnd)
    : true;

  const maintenanceWindow = job.maintenanceWindowStart && job.maintenanceWindowEnd
    ? `${new Date(job.maintenanceWindowStart).toLocaleString('pt-BR')} → ${new Date(job.maintenanceWindowEnd).toLocaleString('pt-BR')}`
    : null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span>Status de Aprovação</span>
          <Badge className={statusColors[job.status] || "bg-gray-200"}>
            {statusLabels[job.status] || job.status}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {!executeEnabled && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              Execução desabilitada: PROVISIONING_EXECUTE_ENABLED=false. Configure no servidor para habilitar.
            </AlertDescription>
          </Alert>
        )}

        {job.approvedByUserId && job.approvedAt && (
          <div className="text-sm text-gray-600">
            <p className="font-semibold">Aprovado</p>
            <p>Usuário #{job.approvedByUserId} em {new Date(job.approvedAt).toLocaleString('pt-BR')}</p>
          </div>
        )}

        {maintenanceWindow && (
          <div className="text-sm text-gray-600">
            <p className="font-semibold">Janela de Manutenção</p>
            <p>{maintenanceWindow}</p>
            {!isWindowActive && (
              <p className="text-amber-600 mt-1">⚠️ Fora da janela de manutenção</p>
            )}
            {isWindowActive && (
              <p className="text-green-600 mt-1">✓ Dentro da janela de manutenção</p>
            )}
          </div>
        )}

        <div className="flex gap-2">
          {job.status === "validated" && canRequestApproval && (
            <Button
              onClick={onRequestApproval}
              variant="outline"
              size="sm"
            >
              Solicitar Aprovação
            </Button>
          )}

          {job.status === "pending_approval" && canApprove && (
            <Button
              onClick={onApprove}
              disabled={isApproving}
              size="sm"
              className="bg-green-600 hover:bg-green-700"
            >
              {isApproving ? "Aprovando..." : "Aprovar"}
            </Button>
          )}

          {job.status === "pending_approval" && !canApprove && (
            <p className="text-sm text-gray-500">Requer permissão de admin/operator para aprovar</p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
