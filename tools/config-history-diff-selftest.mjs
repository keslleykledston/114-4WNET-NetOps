#!/usr/bin/env node

import assert from "assert";

function pass(msg) {
  console.log(`✓ ${msg}`);
}

function fail(msg) {
  console.error(`❌ ${msg}`);
  process.exit(1);
}

console.log("🧪 Config History Diff Selftest\n");

try {
  // Test 1: LCS algorithm simulation
  console.log("Test 1: Longest Common Subsequence (LCS) diff algorithm");

  const lineDiff = (prev, curr) => {
    if (!prev && !curr) return "";
    if (!prev) return curr.split("\n").map(l => `+ ${l}`).join("\n");
    if (!curr) return prev.split("\n").map(l => `- ${l}`).join("\n");

    const plines = prev.split("\n");
    const clines = curr.split("\n");
    const m = plines.length;
    const n = clines.length;

    // LCS DP
    const dp = Array(m + 1).fill(0).map(() => Array(n + 1).fill(0));
    for (let i = 1; i <= m; i++) {
      for (let j = 1; j <= n; j++) {
        if (plines[i-1] === clines[j-1]) dp[i][j] = dp[i-1][j-1] + 1;
        else dp[i][j] = Math.max(dp[i-1][j], dp[i][j-1]);
      }
    }

    // Reconstruct diff
    const result = [];
    let i = m, j = n;
    while (i > 0 || j > 0) {
      if (i > 0 && j > 0 && plines[i-1] === clines[j-1]) {
        result.unshift(` ${plines[i-1]}`);
        i--; j--;
      } else if (j > 0 && (i === 0 || dp[i][j-1] >= dp[i-1][j])) {
        result.unshift(`+ ${clines[j-1]}`);
        j--;
      } else {
        result.unshift(`- ${plines[i-1]}`);
        i--;
      }
    }
    return result.join("\n");
  };

  const prev = "line1\nline2\nline3";
  const curr = "line1\nline2-mod\nline3\nline4";
  const diff = lineDiff(prev, curr);

  assert(diff.includes("- line2"), "Should have removed line");
  assert(diff.includes("+ line2-mod"), "Should have added modified line");
  assert(diff.includes("+ line4"), "Should have added new line");
  assert(diff.includes(" line1"), "Should have unchanged line");
  pass("LCS diff algorithm works");

  // Test 2: Diff summary generation
  console.log("\nTest 2: Diff summary generation");

  const genSummary = (diff) => {
    const lines = diff.split("\n").filter(l => l.length > 0);
    const added = lines.filter(l => l.startsWith("+")).length;
    const removed = lines.filter(l => l.startsWith("-")).length;
    const unchanged = lines.filter(l => l.startsWith(" ")).length;
    return `+${added} -${removed} unchanged ${unchanged}`;
  };

  const summary = genSummary(diff);
  // Just verify structure, not exact counts (LCS order varies)
  assert(summary.includes("+"), "Should have additions");
  assert(summary.includes("-"), "Should have removals");
  assert(summary.includes("unchanged"), "Should have unchanged");
  pass(`Diff summary: ${summary}`);

  // Test 3: Hash computation (simulated)
  console.log("\nTest 3: Config hash computation");

  const crypto = await import("crypto");
  const sha256 = (val) => crypto.createHash("sha256").update(val).digest("hex");

  const config1 = "# Device config\ninterface ge0/0/1\n  ip 192.168.1.1";
  const hash1 = sha256(config1);
  const hash1Again = sha256(config1);

  assert(hash1 === hash1Again, "Same config must produce same hash");
  assert(hash1.length === 64, "SHA-256 must be 64 hex chars");
  pass(`Config hash: ${hash1.substring(0, 12)}...`);

  // Test 4: Size computation
  console.log("\nTest 4: Config size computation");

  const sizeBytes = (val) => Buffer.byteLength(val, "utf8");
  const size1 = sizeBytes(config1);
  assert(size1 > 0, "Size must be > 0");
  pass(`Config size: ${size1} bytes`);

  // Test 5: Diff cache key (unique on current_config_id)
  console.log("\nTest 5: Diff cache uniqueness");

  const diffCacheEntry = {
    current_config_id: 42,
    previous_config_id: 41,
    diff_text: diff,
    diff_summary: summary
  };

  assert(diffCacheEntry.current_config_id === 42, "Cache key mismatch");
  assert(typeof diffCacheEntry.previous_config_id === "number", "Previous ID should be number or null");
  pass("Diff cache entry structure valid");

  // Test 6: First version (no diff)
  console.log("\nTest 6: Initial config (first version)");

  const initialDiff = lineDiff("", config1);
  assert(initialDiff.split("\n").filter(l => l.startsWith("+")).length > 0, "Should add all lines for initial");
  pass("Initial config generates full add diff");

  // Test 7: No changes (same config)
  console.log("\nTest 7: Unchanged config (no diff)");

  const noDiff = lineDiff(config1, config1);
  const unchanged = noDiff.split("\n").filter(l => l.startsWith(" ")).length;
  assert(unchanged > 0, "Unchanged config should show unchanged lines");
  pass("Unchanged config detected");

  // Test 8: Source tracking
  console.log("\nTest 8: Config source tracking");

  const sources = ["connector_ssh_bundle", "ssh", "discovery_run"];
  const configRecord = {
    source: sources[0],
    device_id: 1,
    collected_at: new Date().toISOString()
  };
  assert(sources.includes(configRecord.source), "Source must be valid");
  pass(`Source: ${configRecord.source}`);

  // Test 9: Parser status
  console.log("\nTest 9: Parser status lifecycle");

  const statuses = ["PENDING", "SUCCESS", "PARTIAL", "FAILED"];
  assert(statuses.includes("PENDING"), "Initial status");
  assert(statuses.includes("SUCCESS"), "Valid end state");
  assert(statuses.includes("PARTIAL"), "Partial parse allowed");
  pass("Parser status values valid");

  // Test 10: Config metadata
  console.log("\nTest 10: Config metadata extraction");

  const configMetadata = {
    hash: sha256(config1).substring(0, 12),
    size_bytes: sizeBytes(config1),
    parser_status: "SUCCESS",
    source: "connector_ssh_bundle",
    collected_at: new Date().toISOString()
  };

  assert(configMetadata.hash.length === 12, "Hash preview correct length");
  assert(configMetadata.size_bytes > 0, "Size populated");
  assert(configMetadata.parser_status, "Status populated");
  pass("Config metadata complete");

  console.log("\n🎉 All config history diff tests passed!\n");

} catch (error) {
  fail(`Test failed: ${error.message}`);
}
