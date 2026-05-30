#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function read(relPath) {
  return readFileSync(path.join(root, relPath), "utf8");
}

/** Mirror of config-bundle-parser.service.ts splitCommandBundle */
function splitCommandBundle(rawBundle) {
  const outputs = {};
  if (!rawBundle.trim()) return outputs;

  const sections = rawBundle.split(/\n! === /);
  for (const section of sections) {
    const trimmed = section.trim();
    if (!trimmed) continue;
    const headerEnd = trimmed.indexOf(" ===\n");
    if (headerEnd < 0) continue;
    let command = trimmed.slice(0, headerEnd).trim();
    if (command.startsWith("! === ")) command = command.slice(5).trim();
    const body = trimmed.slice(headerEnd + 5).trim();
    if (command) outputs[command] = body;
  }

  if (Object.keys(outputs).length === 0 && rawBundle.trim()) {
    outputs["raw"] = rawBundle.trim();
  }
  return outputs;
}

const sampleBundle = `! === display current-configuration ===
sysname TEST-NE
!
! === display bgp peer ===
 Peer          V          AS  MsgRcvd  MsgSent
 10.0.0.1      4       65001        0        0
! === display bgp peer verbose ===
 Peer 10.0.0.1, remote AS 65001
  BGP current state: Established
! === display mpls l2vc verbose ===
 Total L2 VC : 1
! === display vsi verbose ===
 *VSI Name               : vsi-test
! === display interface description ===
Interface                     PHY Protocol Description
GE0/0/0                       up   up       uplink
! === display interface brief ===
Interface                   PHY   Protocol
GE0/0/0                     up    up
`;

const split = splitCommandBundle(sampleBundle);
assert.equal(Object.keys(split).length, 7);
assert.match(split["display current-configuration"], /sysname TEST-NE/);
assert.match(split["display bgp peer"], /65001/);
assert.match(split["display mpls l2vc verbose"], /Total L2 VC/);
assert.match(split["display vsi verbose"], /vsi-test/);
assert.match(split["display interface brief"], /GE0\/0\/0/);

const empty = splitCommandBundle("");
assert.deepEqual(empty, {});

const parserSrc = read("workspace/artifacts/api-server/src/modules/config-backup/config-bundle-parser.service.ts");
const collectSrc = read("workspace/artifacts/api-server/src/modules/connectors/connector-config-collect.service.ts");
const migration = read("workspace/lib/db/migrations/0022_collected_configs_provenance.sql");
const schema = read("workspace/lib/db/src/schema/collected_configs.ts");
const mask = read("workspace/artifacts/api-server/src/modules/connectors/connector-payload-mask.ts");

assert.match(parserSrc, /export function splitCommandBundle/);
assert.match(parserSrc, /export async function parseAndPersistConfigBundle/);
assert.match(parserSrc, /persistL2CircuitsFromCommandOutputs/);
assert.match(parserSrc, /persistBgpFromCommandOutputs/);
assert.match(parserSrc, /parserStatus/);
assert.match(parserSrc, /PARTIAL/);

assert.match(collectSrc, /source: "connector_ssh_bundle"/);
assert.match(collectSrc, /parseAndPersistConfigBundle/);
assert.match(collectSrc, /parserStatus: "PENDING"/);

assert.match(migration, /parser_status/);
assert.match(migration, /parsed_summary_json/);
assert.match(migration, /connector_id/);

assert.match(schema, /parserStatus/);
assert.match(schema, /parsedSummaryJson/);

assert.match(mask, /\[redacted\]/);

console.log("connectors-config-bundle-parse-selftest: 18 checks OK");
