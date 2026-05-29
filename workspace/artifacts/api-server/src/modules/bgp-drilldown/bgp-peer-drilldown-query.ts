export type ParsedDrilldownQuery = {
  source: "snapshot";
  includePolicies: boolean;
  includePolicyObjects: boolean;
  snapshotId?: number;
  jobId?: number;
  forceRecompute: boolean;
};

function parseBool(value: unknown, defaultValue: boolean): boolean {
  if (value === undefined || value === null || value === "") return defaultValue;
  const raw = String(value).toLowerCase();
  if (raw === "true" || raw === "1") return true;
  if (raw === "false" || raw === "0") return false;
  return defaultValue;
}

function parseOptionalId(value: unknown): number | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
}

export function parseDrilldownQueryParams(
  query: Record<string, unknown>,
): ParsedDrilldownQuery | "invalid_source" | "invalid_id" {
  const source = query.source === undefined ? "snapshot" : String(query.source);
  if (source !== "snapshot") return "invalid_source";

  const snapshotId = parseOptionalId(query.snapshot_id ?? query.snapshotId);
  const jobId = parseOptionalId(query.job_id ?? query.jobId);
  if ((query.snapshot_id !== undefined || query.snapshotId !== undefined) && snapshotId === undefined) return "invalid_id";
  if ((query.job_id !== undefined || query.jobId !== undefined) && jobId === undefined) return "invalid_id";

  return {
    source: "snapshot",
    includePolicies: parseBool(query.include_policies ?? query.includePolicies, true),
    includePolicyObjects: parseBool(query.include_policy_objects ?? query.includePolicyObjects, true),
    snapshotId,
    jobId,
    forceRecompute: parseBool(query.force_recompute ?? query.forceRecompute, false),
  };
}
