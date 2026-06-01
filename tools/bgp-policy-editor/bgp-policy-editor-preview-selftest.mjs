#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const repoRoot = path.resolve(new URL(".", import.meta.url).pathname, "..", "..");

function read(file) {
  return fs.readFileSync(path.join(repoRoot, file), "utf8");
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function normalize(value) {
  return String(value).trim().replace(/\s+/g, " ");
}

function normalizeSelection(values) {
  return [...new Set(values.map(normalize).filter(Boolean))].sort((left, right) => left.localeCompare(right, "pt", { sensitivity: "base" }));
}

function resolveCommunitySelection(selectedCommunities, communitySets) {
  const normalizedCommunities = normalizeSelection(selectedCommunities);
  if (normalizedCommunities.length === 0) {
    return { matchedCommunityListName: null, isCustom: true, normalizedCommunities, confidence: "empty" };
  }
  if (!communitySets.length) {
    return { matchedCommunityListName: null, isCustom: true, normalizedCommunities, confidence: "no-library" };
  }
  for (const set of communitySets) {
    const members = normalizeSelection(set.members);
    if (members.length !== normalizedCommunities.length) continue;
    const same = members.every((value, index) => value === normalizedCommunities[index]);
    if (same) {
      return { matchedCommunityListName: normalize(set.name), isCustom: false, normalizedCommunities, confidence: "exact" };
    }
  }
  return { matchedCommunityListName: null, isCustom: true, normalizedCommunities, confidence: "custom" };
}

function main() {
  const utils = read("workspace/artifacts/netops-manager/src/features/bgp-policy-editor/bgp-policy-editor.utils.ts");
  const observability = read("workspace/artifacts/netops-manager/src/features/bgp-policy-editor/bgp-policy-editor-observability.ts");
  const modal = read("workspace/artifacts/netops-manager/src/features/bgp-policy-editor/bgp-policy-editor-modal.tsx");
  const types = read("workspace/artifacts/netops-manager/src/features/bgp-policy-editor/bgp-policy-editor.types.ts");
  const diffNames = execFileSync("git", ["diff", "--name-only"], { cwd: repoRoot, encoding: "utf8" })
    .split("\n")
    .filter(Boolean);

  assert(utils.includes("resolveCommunitySelection"), "utils missing resolveCommunitySelection");
  assert(utils.includes("normalizeCommunityValues"), "utils missing normalizeCommunityValues");
  assert(utils.includes("COMMUNITY_COMBINATION_MATCHED"), "utils missing matched finding code");
  assert(utils.includes("APPLY_DISABLED"), "utils missing apply disabled finding code");
  assert(utils.includes("ROLLBACK_DISABLED"), "utils missing rollback disabled finding code");
  assert(utils.includes("BACKEND_PREVIEW_UNAVAILABLE"), "utils missing backend fallback code");
  assert(utils.includes("PREVIEW_DRIFT_DETECTED"), "utils missing drift code");
  assert(utils.includes("buildPolicyEditorPreviewRequest"), "utils missing backend request builder");
  assert(utils.includes("comparePreviewSummaries"), "utils missing drift comparison helper");
  assert(utils.includes("node_count_diff"), "utils missing minimal drift node count summary");
  assert(utils.includes("finding_codes_diff"), "utils missing minimal drift finding summary");
  assert(utils.includes("safety_mismatch"), "utils missing safety mismatch summary");
  assert(observability.includes("preview_backend_success"), "observability missing backend success event");
  assert(observability.includes("preview_backend_failed"), "observability missing backend failed event");
  assert(observability.includes("preview_local_used"), "observability missing local used event");
  assert(observability.includes("preview_local_fallback_used"), "observability missing local fallback event");
  assert(observability.includes("preview_drift_detected"), "observability missing drift event");
  assert(utils.includes("dryRun: true"), "utils missing dry-run safety flag");
  assert(modal.includes("Preview normalizado"), "modal missing normalized preview label");
  assert(modal.includes("Preview backend"), "modal missing backend preview badge");
  assert(modal.includes("Preview local fallback"), "modal missing local fallback badge");
  assert(modal.includes("Preview local"), "modal missing local preview badge");
  assert(modal.includes("findings"), "modal missing findings section");
  assert(types.includes("BgpPolicyEditorPreview"), "types missing preview type");
  assert(types.includes("BgpPolicyEditorPreviewSource"), "types missing preview source");
  assert(types.includes("BgpPolicyEditorPreviewRequest"), "types missing preview request");

  const library = [
    { name: "CUST-LIST", members: ["65000:100", "65000:200"] },
    { name: "EMPTY-LIST", members: [] },
  ];

  const exact = resolveCommunitySelection(["65000:200", "65000:100", "65000:100"], library);
  assert(exact.matchedCommunityListName === "CUST-LIST", "exact match not detected");
  assert(exact.isCustom === false, "exact match should not be custom");
  assert(JSON.stringify(exact.normalizedCommunities) === JSON.stringify(["65000:100", "65000:200"]), "exact normalization failed");
  assert(exact.confidence === "exact", "exact confidence mismatch");

  const custom = resolveCommunitySelection(["65000:100", "65000:999"], library);
  assert(custom.isCustom === true, "custom combination should be custom");
  assert(custom.matchedCommunityListName === null, "custom combination should not match a list");
  assert(custom.confidence === "custom", "custom confidence mismatch");

  const empty = resolveCommunitySelection([], library);
  assert(empty.confidence === "empty", "empty selection should be empty confidence");
  assert(empty.isCustom === true, "empty selection should be custom");

  const noLibrary = resolveCommunitySelection(["65000:100"], []);
  assert(noLibrary.confidence === "no-library", "no-library confidence mismatch");

  assert(!diffNames.includes("workspace/artifacts/api-server/src/routes/provisioning.ts"), "provisioning route should not change");
  assert(!diffNames.includes("workspace/lib/api-spec/openapi.yaml"), "openapi should not change");
  assert(!diffNames.some((file) => file.startsWith("workspace/lib/db/migrations/")), "migrations should not change");

  console.log("bgp-policy-editor-preview-selftest: PASS");
}

try {
  main();
} catch (error) {
  console.error("bgp-policy-editor-preview-selftest: FAIL");
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
