import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/components/auth-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Eye, FileText, RefreshCw } from "lucide-react";
import { ChangePlanDetailsModal } from "@/features/change-plans/change-plan-details-modal";
import { listChangePlans } from "@/features/change-plans/change-plan-api";
import type { ChangePlanSummary, ChangePlanWorkflowStatus } from "@/features/change-plans/change-plan-types";
import {
  WORKFLOW_STATUS_LABELS,
  workflowStatusTone,
} from "@/features/change-plans/change-plan-workflow-utils";
import { cn } from "@/lib/utils";

const WORKFLOW_STATUSES: ChangePlanWorkflowStatus[] = [
  "draft",
  "ready_for_review",
  "needs_changes",
  "rejected",
  "approved_for_manual_implementation",
  "archived",
];

function parseHighlight(search: string): number | null {
  const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  const raw = params.get("highlight");
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : null;
}

export default function ChangePlansPage() {
  const { user } = useAuth();
  const [location, setLocation] = useLocation();
  const [moduleFilter, setModuleFilter] = useState("bgp_announcements");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [items, setItems] = useState<ChangePlanSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);

  const highlightId = useMemo(() => {
    const idx = location.indexOf("?");
    return idx >= 0 ? parseHighlight(location.slice(idx)) : null;
  }, [location]);

  const loadPlans = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await listChangePlans({
        module: moduleFilter === "all" ? undefined : moduleFilter,
        workflowStatus: statusFilter === "all" ? undefined : (statusFilter as ChangePlanWorkflowStatus),
        limit: 200,
      });
      setItems(result.items);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao carregar change plans");
    } finally {
      setLoading(false);
    }
  }, [moduleFilter, statusFilter]);

  useEffect(() => {
    void loadPlans();
  }, [loadPlans]);

  useEffect(() => {
    if (highlightId) {
      setSelectedId(highlightId);
      setDetailOpen(true);
    }
  }, [highlightId]);

  const openDetail = (id: number) => {
    setSelectedId(id);
    setDetailOpen(true);
    const base = location.split("?")[0] || "/change-plans";
    setLocation(`${base}?highlight=${id}`);
  };

  const closeDetail = (open: boolean) => {
    setDetailOpen(open);
    if (!open) {
      setSelectedId(null);
      setLocation("/change-plans");
    }
  };

  const onPlanUpdated = () => {
    void loadPlans();
  };

  return (
    <div className="space-y-6 p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Change Plans</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Workflow documental de revisão — nenhum comando será executado pelo sistema.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => void loadPlans()} disabled={loading}>
          <RefreshCw className={cn("mr-2 h-4 w-4", loading && "animate-spin")} />
          Atualizar
        </Button>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <FileText className="h-4 w-4" />
            Planos de mudança
          </CardTitle>
          <CardDescription>
            {user?.role === "viewer"
              ? "Somente leitura — operadores enviam drafts para revisão; admins aprovam implementação manual."
              : "BGP Announcements em destaque — revise tickets e diffs antes de qualquer implementação manual."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-3">
            <Select value={moduleFilter} onValueChange={setModuleFilter}>
              <SelectTrigger className="w-[220px]">
                <SelectValue placeholder="Módulo" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="bgp_announcements">BGP Announcements</SelectItem>
                <SelectItem value="all">Todos os módulos</SelectItem>
              </SelectContent>
            </Select>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[240px]">
                <SelectValue placeholder="Status workflow" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os status</SelectItem>
                {WORKFLOW_STATUSES.map((status) => (
                  <SelectItem key={status} value={status}>
                    {WORKFLOW_STATUS_LABELS[status]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {error ? (
            <div className="rounded-md border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200">{error}</div>
          ) : null}

          <div className="rounded-md border border-border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>ID</TableHead>
                  <TableHead>Módulo</TableHead>
                  <TableHead>Device</TableHead>
                  <TableHead>Workflow</TableHead>
                  <TableHead>Risco</TableHead>
                  <TableHead>Origem</TableHead>
                  <TableHead>Criado</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
                      Carregando...
                    </TableCell>
                  </TableRow>
                ) : items.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
                      Nenhum change plan encontrado.
                    </TableCell>
                  </TableRow>
                ) : (
                  items.map((plan) => {
                    const workflow = plan.workflowStatus ?? "draft";
                    const isBgp = plan.module === "bgp_announcements";
                    return (
                      <TableRow
                        key={plan.id}
                        className={cn(
                          highlightId === plan.id && "bg-sky-500/10",
                          isBgp && "border-l-2 border-l-sky-500/40",
                        )}
                      >
                        <TableCell className="font-mono text-xs">#{plan.id}</TableCell>
                        <TableCell>
                          <Badge variant={isBgp ? "default" : "outline"} className="text-[10px]">
                            {plan.module}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-xs">
                          <div className="font-mono">{plan.hostname ?? "—"}</div>
                          <div className="text-muted-foreground">#{plan.deviceId}</div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className={cn("text-[10px]", workflowStatusTone(workflow))}>
                            {WORKFLOW_STATUS_LABELS[workflow]}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-xs">{plan.riskLevel ?? "—"}</TableCell>
                        <TableCell className="text-xs font-mono max-w-[140px] truncate">
                          {plan.sourceObjectType ?? "—"}
                          {plan.sourceObjectId ? ` #${plan.sourceObjectId}` : ""}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {new Date(plan.createdAt).toLocaleString()}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button variant="ghost" size="sm" onClick={() => openDetail(plan.id)}>
                            <Eye className="mr-1 h-4 w-4" />
                            Ver
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <ChangePlanDetailsModal
        changePlanId={selectedId}
        open={detailOpen}
        onOpenChange={closeDetail}
        userRole={user?.role ?? "viewer"}
        onUpdated={onPlanUpdated}
      />
    </div>
  );
}
