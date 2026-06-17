import { env } from "../../lib/env.js";

function parseBoolean(value: string | undefined, defaultValue: boolean): boolean {
  if (value === undefined) return defaultValue;
  const normalized = value.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "off"].includes(normalized)) return false;
  return defaultValue;
}

export function isBgpAnnouncementMatrixEnabled(): boolean {
  return parseBoolean(process.env["BGP_ANNOUNCEMENT_MATRIX_ENABLED"], true);
}

export function isBgpAnnouncementPreviewEnabled(): boolean {
  return parseBoolean(process.env["BGP_ANNOUNCEMENT_PREVIEW_ENABLED"], true);
}

export function isBgpAnnouncementExecutionEnabled(): boolean {
  return parseBoolean(process.env["BGP_ANNOUNCEMENT_EXECUTION_ENABLED"], false);
}

export function isBgpUpstreamAuditEnabled(): boolean {
  return parseBoolean(process.env["BGP_UPSTREAM_AUDIT_ENABLED"], true);
}

export function isBgpCommunitySetMatchEnabled(): boolean {
  return parseBoolean(process.env["BGP_COMMUNITY_SET_MATCH_ENABLED"], true);
}

export function getBgpAnnouncementMaxCollectionAgeMinutes(): number {
  return Number.parseInt(process.env["BGP_ANNOUNCEMENT_MAX_COLLECTION_AGE_MINUTES"] ?? "", 10)
    || 30;
}

export function assertMatrixEnabled(): { ok: true } | { ok: false; status: 503; message: string } {
  if (!isBgpAnnouncementMatrixEnabled()) {
    return { ok: false, status: 503, message: "BGP Announcement Matrix disabled (BGP_ANNOUNCEMENT_MATRIX_ENABLED=false)" };
  }
  return { ok: true };
}

export function assertPreviewEnabled(): { ok: true } | { ok: false; status: 503; message: string } {
  const matrix = assertMatrixEnabled();
  if (!matrix.ok) return matrix;
  if (!isBgpAnnouncementPreviewEnabled()) {
    return { ok: false, status: 503, message: "BGP Announcement Preview disabled (BGP_ANNOUNCEMENT_PREVIEW_ENABLED=false)" };
  }
  return { ok: true };
}

export function assertExecutionEnabled(): { ok: true } | { ok: false; status: 503; message: string } {
  if (!isBgpAnnouncementExecutionEnabled() || !env.configApplyEnabled) {
    return {
      ok: false,
      status: 503,
      message: "BGP Announcement execution blocked (BGP_ANNOUNCEMENT_EXECUTION_ENABLED=false or CONFIG_APPLY_ENABLED=false)",
    };
  }
  return { ok: true };
}
