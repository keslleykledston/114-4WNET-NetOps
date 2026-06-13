import type { AuthRole } from "@/components/auth-provider";
import type { ChangePlanWorkflowStatus, ReviewAction } from "./change-plan-types";

export const WORKFLOW_STATUS_LABELS: Record<ChangePlanWorkflowStatus, string> = {
  draft: "Draft",
  ready_for_review: "Pronto para revisão",
  needs_changes: "Precisa de ajustes",
  rejected: "Rejeitado",
  approved_for_manual_implementation: "Aprovado (manual)",
  archived: "Arquivado",
};

export function workflowStatusTone(status: ChangePlanWorkflowStatus | null | undefined): string {
  switch (status) {
    case "ready_for_review":
      return "border-sky-500/30 bg-sky-500/10 text-sky-200";
    case "needs_changes":
      return "border-amber-500/30 bg-amber-500/10 text-amber-200";
    case "rejected":
      return "border-red-500/30 bg-red-500/10 text-red-200";
    case "approved_for_manual_implementation":
      return "border-emerald-500/30 bg-emerald-500/10 text-emerald-200";
    case "archived":
      return "border-slate-500/30 bg-slate-500/10 text-slate-300";
    default:
      return "border-slate-600/30 bg-slate-600/10 text-slate-300";
  }
}

export function canSubmitReview(role: AuthRole, status: ChangePlanWorkflowStatus): boolean {
  return (role === "operator" || role === "admin") && (status === "draft" || status === "needs_changes");
}

export function canReview(role: AuthRole, status: ChangePlanWorkflowStatus): boolean {
  return role === "admin" && status === "ready_for_review";
}

export function canArchive(role: AuthRole, status: ChangePlanWorkflowStatus): boolean {
  if (status === "draft") return role === "operator" || role === "admin";
  if (status === "rejected" || status === "approved_for_manual_implementation") return role === "admin";
  return false;
}

export function availableReviewActions(role: AuthRole, status: ChangePlanWorkflowStatus): ReviewAction[] {
  const actions: ReviewAction[] = [];
  if (canSubmitReview(role, status)) actions.push("submit-review");
  if (canReview(role, status)) {
    actions.push("request-changes", "reject", "approve-manual");
  }
  if (canArchive(role, status)) actions.push("archive");
  return actions;
}

export const REVIEW_ACTION_LABELS: Record<ReviewAction, string> = {
  "submit-review": "Enviar para revisão",
  "request-changes": "Solicitar ajustes",
  reject: "Rejeitar",
  "approve-manual": "Aprovar para implementação manual",
  archive: "Arquivar",
};

export function reviewActionRequiresNote(action: ReviewAction): boolean {
  return action === "reject" || action === "request-changes";
}
