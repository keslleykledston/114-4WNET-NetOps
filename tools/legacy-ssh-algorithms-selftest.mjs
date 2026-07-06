#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const registry = readFileSync(
  "workspace/artifacts/api-server/src/modules/netops/vendor-registry.ts",
  "utf8",
);
assert.match(registry, /needsLegacySshAlgorithms/);
assert.match(registry, /raisecom/);
assert.match(registry, /datacom/);
assert.match(registry, /zte/);

const sshTs = readFileSync("workspace/artifacts/api-server/src/lib/ssh.ts", "utf8");
assert.match(sshTs, /LEGACY_SSH_ALGORITHMS/);
assert.match(sshTs, /ssh-rsa/);

console.log("legacy-ssh-algorithms-selftest: OK");
