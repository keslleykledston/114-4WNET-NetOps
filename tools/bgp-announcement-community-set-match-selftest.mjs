#!/usr/bin/env node

import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const {
  buildAnnouncementCommunitySetLibrary,
  findExactCommunitySetMatch,
} = await import(path.join(
  rootDir,
  "workspace/artifacts/api-server/src/modules/bgp-announcements/bgp-announcements.audit.service.ts",
));

const rawConfig = `
ip community-list CLIENTES|2G
 community 64777:51003
 community 64777:50101
ip community-list CLIENTES|2G-EXTRA
 community 64777:51003
 community 64777:50101
 community 64777:51667
route-policy A permit node 10
 apply community community-list CLIENTES|2G
route-policy B permit node 10
 apply community community-list CLIENTES|2G
`;

const sets = buildAnnouncementCommunitySetLibrary(rawConfig);
const set = sets.find((item) => item.name === "CLIENTES|2G");
assert.ok(set);
assert.equal(set.normalizedCommunities.join(","), "64777:50101,64777:51003");
assert.equal(set.isShared, true);
assert.equal(set.usedByPolicies.length, 2);

const match = findExactCommunitySetMatch(["64777:51003", "64777:50101", "64777:50101"], sets);
assert.equal(match.matched, true);
assert.equal(match.matchType, "exact");
assert.equal(match.communityListName, "CLIENTES|2G");
assert.equal(match.normalizedHash, set.normalizedHash);

const miss = findExactCommunitySetMatch(["64777:51003", "64777:50101", "64777:51666"], sets);
assert.equal(miss.matched, false);
assert.equal(miss.matchType, "none");
assert.ok((miss.nearestMatches ?? []).length > 0);

console.log(JSON.stringify({
  ok: true,
  sets: sets.map((item) => ({
    name: item.name,
    normalizedCommunities: item.normalizedCommunities,
    normalizedHash: item.normalizedHash,
    semanticSummary: item.semanticSummary,
    usageCount: item.usageCount,
    usedByPolicies: item.usedByPolicies,
    isShared: item.isShared,
  })),
  match,
  miss,
}, null, 2));
console.log("bgp-announcement-community-set-match-selftest: PASS");
