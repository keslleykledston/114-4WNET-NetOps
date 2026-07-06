import { Router } from "express";
import { requirePermission } from "../../lib/auth.js";
import {
  getAnnouncementCommunitySetHandler,
  getAnnouncementCommunitySetsHandler,
  getAnnouncementChangePlanByIdHandler,
  getAnnouncementApprovalByIdHandler,
  getAnnouncementApprovalsHandler,
  getAnnouncementChangePlansHandler,
  getAnnouncementHistoryHandler,
  getAnnouncementMatrixDiffHandler,
  getAnnouncementMatrixLatestHandler,
  getAnnouncementExecutionByIdHandler,
  getAnnouncementExecutionsHandler,
  getAnnouncementRollbackByIdHandler,
  getAnnouncementRollbacksHandler,
  getAnnouncementUpstreamAuditByCircuitHandler,
  getAnnouncementUpstreamsAuditHandler,
  postAnnouncementChangePlanCancelHandler,
  postAnnouncementChangePlanDryRunHandler,
  postAnnouncementChangePlanExecuteHandler,
  postAnnouncementChangePlanPostcheckHandler,
  postAnnouncementChangePlanRequestApprovalHandler,
  postAnnouncementChangePlansHandler,
  postAnnouncementApprovalApproveHandler,
  postAnnouncementApprovalRejectHandler,
  postAnnouncementPreviewChangeHandler,
  postAnnouncementMatrixRefreshHandler,
  postAnnouncementCommunitySetsExactMatchHandler,
  postAnnouncementCommunitySetsResolveHandler,
  postAnnouncementRollbackApproveHandler,
  postAnnouncementRollbackDryRunHandler,
  postAnnouncementRollbackExecuteHandler,
  postAnnouncementRollbackPostcheckHandler,
  postAnnouncementRollbackRejectHandler,
  postAnnouncementRollbackRequestHandler,
  postAnnouncementUpstreamsAuditRunHandler,
} from "./bgp-announcements.controller.js";

const router = Router();

router.get("/bgp/announcements/matrix/latest", requirePermission("bgp_announcements.view"), getAnnouncementMatrixLatestHandler);
router.post("/bgp/announcements/matrix/refresh", requirePermission("bgp_announcements.preview"), postAnnouncementMatrixRefreshHandler);
router.get("/bgp/announcements/matrix/diff", requirePermission("bgp_announcements.view"), getAnnouncementMatrixDiffHandler);
router.get("/bgp/announcements/history", requirePermission("bgp_announcements.view"), getAnnouncementHistoryHandler);
router.get("/bgp/community-sets", requirePermission("bgp_announcements.view"), getAnnouncementCommunitySetsHandler);
router.get("/bgp/community-sets/:name", requirePermission("bgp_announcements.view"), getAnnouncementCommunitySetHandler);
router.post("/bgp/community-sets/resolve", requirePermission("bgp_announcements.preview"), postAnnouncementCommunitySetsResolveHandler);
router.post("/bgp/community-sets/find-exact-match", requirePermission("bgp_announcements.preview"), postAnnouncementCommunitySetsExactMatchHandler);
router.get("/bgp/upstreams/audit", requirePermission("bgp_announcements.view"), getAnnouncementUpstreamsAuditHandler);
router.get("/bgp/upstreams/:circuitId/audit", requirePermission("bgp_announcements.view"), getAnnouncementUpstreamAuditByCircuitHandler);
router.post("/bgp/upstreams/audit/run", requirePermission("bgp_announcements.preview"), postAnnouncementUpstreamsAuditRunHandler);
router.post("/bgp/announcements/preview-change", requirePermission("bgp_announcements.preview"), postAnnouncementPreviewChangeHandler);
router.post("/bgp/announcements/change-plans", requirePermission("bgp_announcements.change_plan.create"), postAnnouncementChangePlansHandler);
router.get("/bgp/announcements/change-plans", requirePermission("bgp_announcements.view"), getAnnouncementChangePlansHandler);
router.get("/bgp/announcements/change-plans/:id", requirePermission("bgp_announcements.view"), getAnnouncementChangePlanByIdHandler);
router.post("/bgp/announcements/change-plans/:id/cancel", requirePermission("bgp_announcements.change_plan.create"), postAnnouncementChangePlanCancelHandler);
router.post("/bgp/announcements/change-plans/:id/request-approval", requirePermission("bgp_announcements.approval.request"), postAnnouncementChangePlanRequestApprovalHandler);
router.post("/bgp/announcements/change-plans/:id/dry-run", requirePermission("bgp_announcements.dry_run.execute"), postAnnouncementChangePlanDryRunHandler);
router.post("/bgp/announcements/change-plans/:id/execute", requirePermission("bgp_announcements.execute.real"), postAnnouncementChangePlanExecuteHandler);
router.post("/bgp/announcements/change-plans/:id/postcheck", requirePermission("bgp_announcements.preview"), postAnnouncementChangePlanPostcheckHandler);
router.post("/bgp/announcements/change-plans/:id/rollback/request", requirePermission("bgp_announcements.rollback.request"), postAnnouncementRollbackRequestHandler);
router.get("/bgp/announcements/approvals", requirePermission("bgp_announcements.approval.request"), getAnnouncementApprovalsHandler);
router.get("/bgp/announcements/approvals/:id", requirePermission("bgp_announcements.approval.request"), getAnnouncementApprovalByIdHandler);
router.post("/bgp/announcements/approvals/:id/approve", requirePermission("bgp_announcements.approval.review"), postAnnouncementApprovalApproveHandler);
router.post("/bgp/announcements/approvals/:id/reject", requirePermission("bgp_announcements.approval.review"), postAnnouncementApprovalRejectHandler);
router.get("/bgp/announcements/executions", requirePermission("bgp_announcements.dry_run.execute"), getAnnouncementExecutionsHandler);
router.get("/bgp/announcements/executions/:id", requirePermission("bgp_announcements.dry_run.execute"), getAnnouncementExecutionByIdHandler);
router.get("/bgp/announcements/rollbacks", requirePermission("bgp_announcements.rollback.request"), getAnnouncementRollbacksHandler);
router.get("/bgp/announcements/rollbacks/:id", requirePermission("bgp_announcements.rollback.request"), getAnnouncementRollbackByIdHandler);
router.post("/bgp/announcements/rollbacks/:id/approve", requirePermission("bgp_announcements.rollback.review"), postAnnouncementRollbackApproveHandler);
router.post("/bgp/announcements/rollbacks/:id/reject", requirePermission("bgp_announcements.rollback.review"), postAnnouncementRollbackRejectHandler);
router.post("/bgp/announcements/rollbacks/:id/dry-run", requirePermission("bgp_announcements.rollback.dry_run"), postAnnouncementRollbackDryRunHandler);
router.post("/bgp/announcements/rollbacks/:id/execute", requirePermission("bgp_announcements.rollback.execute"), postAnnouncementRollbackExecuteHandler);
router.post("/bgp/announcements/rollbacks/:id/postcheck", requirePermission("bgp_announcements.rollback.postcheck"), postAnnouncementRollbackPostcheckHandler);

export default router;
