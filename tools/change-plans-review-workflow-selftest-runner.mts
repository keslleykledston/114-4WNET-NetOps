import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { canPerformReviewAction, getWorkflowStatus, isReviewableModule, reviewWorkflowSafetyTokens, validateReviewTransition } from "../workspace/artifacts/api-server/src/modules/change-plans/change-plan-review.service.ts";
import { checkPermission } from "../workspace/artifacts/api-server/src/lib/auth.ts";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

assert(checkPermission({ role: "operator", permissionsJson: null }, "bgp.announcements.plan"), "operator can plan");
assert(!checkPermission({ role: "viewer", permissionsJson: null }, "bgp.announcements.plan"), "viewer cannot plan");
assert(checkPermission({ role: "admin", permissionsJson: null }, "bgp.announcements.approve"), "admin can approve");

assert(canPerformReviewAction({ action: "submit-review", role: "operator", permissionsJson: null, fromStatus: "draft" }), "operator submits draft");
assert(!canPerformReviewAction({ action: "submit-review", role: "viewer", permissionsJson: null, fromStatus: "draft" }), "viewer cannot submit");
assert(canPerformReviewAction({ action: "request-changes", role: "admin", permissionsJson: null, fromStatus: "ready_for_review" }), "admin requests changes");
assert(canPerformReviewAction({ action: "reject", role: "admin", permissionsJson: null, fromStatus: "ready_for_review" }), "admin rejects");
assert(canPerformReviewAction({ action: "approve-manual", role: "admin", permissionsJson: null, fromStatus: "ready_for_review" }), "admin approves manual");
assert(canPerformReviewAction({ action: "submit-review", role: "operator", permissionsJson: null, fromStatus: "needs_changes" }), "operator resubmits needs_changes");

assert(validateReviewTransition({ fromStatus: "draft", toStatus: "ready_for_review", action: "submit-review" }) === "ok", "draft to ready_for_review ok");
assert(validateReviewTransition({ fromStatus: "ready_for_review", toStatus: "rejected", action: "reject", note: "" }) === "note_required", "reject requires note");
assert(validateReviewTransition({ fromStatus: "ready_for_review", toStatus: "rejected", action: "reject", note: "motivo" }) === "ok", "reject with note ok");
assert(validateReviewTransition({ fromStatus: "ready_for_review", toStatus: "approved_for_manual_implementation", action: "approve-manual" }) === "ok", "approve manual ok");
assert(validateReviewTransition({ fromStatus: "needs_changes", toStatus: "ready_for_review", action: "submit-review" }) === "ok", "needs_changes resubmit ok");
assert(validateReviewTransition({ fromStatus: "draft", toStatus: "approved_for_execution", action: "approve-manual" }) === "forbidden_status", "forbidden execution status blocked");

const reviewFile = path.join(repoRoot, "workspace/artifacts/api-server/src/modules/change-plans/change-plan-review.service.ts");
const reviewSource = readFileSync(reviewFile, "utf8");
for (const token of ["ssh2", "net-snmp", "controlledExecution", "connector-execution"]) {
  assert(!reviewSource.includes(`from "${token}`) && !reviewSource.includes(`from '${token}`), `review service must not import ${token}`);
}
assert(reviewWorkflowSafetyTokens().length > 0, "safety tokens defined");

const routesFile = path.join(repoRoot, "workspace/artifacts/api-server/src/modules/change-plans/change-plans.routes.ts");
const routesSource = readFileSync(routesFile, "utf8");
assert(!routesSource.includes("controlledExecution"), "routes must not call controlled execution");
assert(!routesSource.includes("/execute"), "routes must not expose execute");

assert(getWorkflowStatus({ workflowStatus: "ready_for_review" }) === "ready_for_review", "workflow from metadata");
assert(getWorkflowStatus({}) === "draft", "default draft");
assert(isReviewableModule("bgp_announcements"), "bgp reviewable");

console.log("change-plans-review-workflow selftest passed");
