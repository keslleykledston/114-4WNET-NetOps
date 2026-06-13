import type { AnnouncementChangePreview } from "../../bgp-announcements/bgp-announcement.types.js";
import { logicalDiffItemsToStrings } from "../../bgp-announcements/announcement-prepend-preview.service.js";
import type {
  ChangePlanCreateInput,
  ChangePlanItemRecord,
  ChangePlanRollbackDocument,
} from "../change-plans.types.js";

const AUDIT_ROLES = new Set(["provider", "upstream", "ix", "cdn", "ibgp", "unknown"]);

export function buildBgpAnnouncementPreviewTitle(preview: AnnouncementChangePreview): string {
  return `BGP Announcement — ${preview.targetName} (${preview.actionType})`;
}

export function buildBgpAnnouncementPreviewDescription(preview: AnnouncementChangePreview): string {
  const upstream = preview.upstreamCircuitId ? ` upstream C${preview.upstreamCircuitId}` : "";
  return `Draft de mudança a partir do preview #${preview.id ?? "?"} — target ${preview.targetRole}${upstream}. Sem execução automática.`;
}

export function buildBgpAnnouncementPreviewRollback(): ChangePlanRollbackDocument {
  return {
    valid: false,
    script: [],
    steps: [],
    dependencies: [],
    warnings: [
      "Rollback documental apenas — nenhum comando será executado automaticamente.",
      "Objetos globais protegidos não devem ser removidos.",
      "Upstreams são auditoria, não alvo de edição nesta fase.",
    ],
  };
}

function protectedGlobalItems(preview: AnnouncementChangePreview): ChangePlanItemRecord[] {
  return preview.protectedGlobals.map((item) => ({
    itemType: item.objectKind,
    itemName: item.objectName,
    classification: "global",
    usageCount: item.consumerCount,
    willBeRemoved: false,
    reason: item.reason,
    users: item.consumers.map((consumer) => ({ label: consumer })),
    metadata: {
      dependencyProtection: item.dependencyProtection,
      dependencyScope: item.dependencyScope,
    },
  }));
}

export function buildChangePlanInputFromBgpPreview(input: {
  preview: AnnouncementChangePreview;
  previewId: number;
  hostname?: string | null;
  createdBy?: string | null;
}): ChangePlanCreateInput {
  const { preview, previewId } = input;
  const rollback = buildBgpAnnouncementPreviewRollback();

  const beforeState: Record<string, unknown[]> = {
    "announcement-state": [preview.currentState],
    communities: preview.currentState.communities.map((community) => ({ name: community })),
  };

  const afterState: Record<string, unknown[]> = {
    "announcement-state": [preview.proposedState],
    communities: preview.proposedState.communities.map((community) => ({ name: community })),
  };

  const findings = [
    ...preview.validation.errors.map((entry) => `ERROR: ${entry}`),
    ...preview.validation.warnings.map((entry) => `WARNING: ${entry}`),
    ...preview.riskAssessment.reasons.map((entry) => `RISK: ${entry}`),
  ];

  return {
    module: "bgp_announcements",
    changeType: preview.actionType,
    deviceId: preview.deviceId,
    hostname: input.hostname ?? null,
    createdBy: input.createdBy ?? null,
    sourceObjectType: "bgp_announcement_change_preview",
    sourceObjectId: String(previewId),
    metadata: {
      sourceType: "bgp_announcement_change_preview",
      sourcePreviewId: previewId,
      snapshotId: preview.snapshotId,
      targetId: preview.targetId,
      targetName: preview.targetName,
      targetRole: preview.targetRole,
      targetEditMode: preview.targetEditMode,
      actionType: preview.actionType,
      upstreamCircuitId: preview.upstreamCircuitId,
      riskLevel: preview.riskAssessment.level,
      workflowStatus: "draft",
      ticketMarkdown: preview.ticketMarkdown,
      logicalDiff: logicalDiffItemsToStrings(preview.logicalDiff),
      title: buildBgpAnnouncementPreviewTitle(preview),
      description: buildBgpAnnouncementPreviewDescription(preview),
    },
    snapshot: {
      deviceId: preview.deviceId,
      hostname: input.hostname ?? null,
      peerIp: null,
      timestamp: preview.createdAt ?? new Date().toISOString(),
      routePolicies: preview.affectedPolicies.map((name) => ({ name, direction: "import" })),
      prefixLists: [],
      ipv6PrefixLists: [],
      communityFilters: [],
      communityLists: [],
      asPathFilters: [],
      extcommunityFilters: [],
      globalPreserved: preview.protectedGlobals.map((item) => ({
        type: item.objectKind,
        name: item.objectName,
        reason: item.reason,
      })),
      suggestedScript: [],
      suggestedRollback: rollback,
      validations: {
        before: [`Preview validation: ${preview.validation.status}`],
        after: logicalDiffItemsToStrings(preview.logicalDiff),
      },
      findings,
      impact: {
        recommendation: preview.riskAssessment.blocked ? "skip" : "review",
        riskLevel: preview.riskAssessment.level,
        blockedReasons: preview.validation.errors,
        warnings: [
          ...preview.validation.warnings,
          ...preview.riskAssessment.reasons,
          "Nenhum comando foi executado.",
        ],
      },
      sourceModule: "bgp_announcements",
      sourceAnalysisId: previewId,
    },
    items: protectedGlobalItems(preview),
    beforeState,
    afterState,
    rollback,
  };
}

export function isPreviewEligibleForChangePlan(preview: AnnouncementChangePreview): {
  ok: boolean;
  errors: string[];
  warnings: string[];
} {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (preview.riskAssessment.blocked || preview.validation.status === "blocked") {
    errors.push("Preview bloqueado — não é possível criar plano.");
  }
  if (preview.validation.status === "unsupported_preview") {
    errors.push("Preview unsupported — ação sem compilador seguro.");
  }
  if (preview.targetEditMode !== "editable_future") {
    errors.push(`targetEditMode=${preview.targetEditMode} não permite plano.`);
  }
  if (AUDIT_ROLES.has(preview.targetRole)) {
    errors.push(`targetRole=${preview.targetRole} é audit-only.`);
  }
  if (/export/i.test(preview.targetName)) {
    errors.push("Export policy não é alvo de plano nesta fase.");
  }

  const targetsProtectedGlobal = preview.protectedGlobals.some(
    (item) => item.dependencyProtection === "protected_global"
      && preview.affectedPolicies.some((policy) => policy.includes(item.objectName)),
  );
  if (targetsProtectedGlobal) {
    errors.push("Objeto global protegido não pode ser alvo de alteração.");
  }

  if (preview.riskAssessment.level === "high") {
    warnings.push("Risco alto — revisão manual obrigatória antes de qualquer execução futura.");
  }
  if (preview.validation.warnings.length > 0) {
    warnings.push(...preview.validation.warnings);
  }

  return { ok: errors.length === 0, errors, warnings };
}
