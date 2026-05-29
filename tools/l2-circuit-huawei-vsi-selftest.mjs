#!/usr/bin/env node
/**
 * Huawei VSI/VPLS multipoint — oper status, findings, peers (cases A–D).
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const parserDir = path.join(rootDir, "workspace/artifacts/api-server/src/modules/l2circuits/parsers");
const normDir = path.join(rootDir, "workspace/artifacts/api-server/src/modules/l2circuits/normalizers");

const rn141Fixture = readFileSync(
  path.join(parserDir, "__fixtures__/display-vsi-rn141-multipoint.txt"),
  "utf8",
);

function buildCaseB() {
  return rn141Fixture.replace(
    /Peer Router ID\s*:\s*10\.200\.2\.1[\s\S]*?Tunnel ID\s*:\s*0x480017c5/,
    `   *Peer Router ID         : 10.200.2.1
    Session                : up
    PW State               : up
    VC Label               : 2002
    Tunnel ID              : 0x480017c5`,
  );
}

function buildCaseC() {
  return rn141Fixture
    .replace(/Session\s*:\s*up/gi, (m, offset, str) => {
      const before = str.slice(Math.max(0, offset - 80), offset);
      return before.includes("VSI State") ? m : "Session                : down";
    })
    .replace(/PW State\s*:\s*up/gi, "PW State               : down");
}

function buildCaseD() {
  return rn141Fixture.replace(/VSI State\s*:\s*up/i, "VSI State              : down");
}

const code = `
import assert from "node:assert/strict";
import { parseHuaweiL2Circuits } from ${JSON.stringify(pathToFileURL(path.join(parserDir, "huawei-vrp-l2.ts")).href)};
import { normalizeCircuits } from ${JSON.stringify(pathToFileURL(path.join(normDir, "status.normalizer.ts")).href)};
import { enrichCircuitsWithFindings } from ${JSON.stringify(pathToFileURL(path.join(normDir, "findings.resolver.ts")).href)};

const fixtures = ${JSON.stringify({ A: rn141Fixture, B: buildCaseB(), C: buildCaseC(), D: buildCaseD() })};

function runCase(label, output) {
  const parsed = parseHuaweiL2Circuits({ "display vsi name RN-141 verbose": output });
  const vsi = parsed.find((c) => c.vsiName === "RN-141");
  assert.ok(vsi, label + ": RN-141 must exist");
  const [normalized] = normalizeCircuits([vsi]);
  const [enriched] = enrichCircuitsWithFindings([normalized]);
  const codes = enriched.findings.map((f) => f.code);
  return { vsi, normalized: enriched, codes };
}

// Case A — partial degradation
{
  const { normalized, codes, vsi } = runCase("A", fixtures.A);
  assert.equal(vsi.peers?.length, 3, "A: three peers");
  assert.equal(normalized.operStatus, "PARTIAL", "A: oper PARTIAL");
  assert.equal(normalized.pwStatus, "PARTIAL", "A: pw PARTIAL");
  assert.equal(normalized.pwSummary?.up, 2);
  assert.equal(normalized.pwSummary?.down, 1);
  assert.ok(codes.includes("PW_PARTIAL_DOWN"), "A: PW_PARTIAL_DOWN");
  assert.equal(codes.includes("CIRCUIT_DOWN"), false, "A: no CIRCUIT_DOWN");
  assert.equal(codes.includes("VSI_DOWN"), false, "A: no VSI_DOWN");
  assert.equal(vsi.peerIp, "10.200.4.1", "A: primary peer");
}

// Case B — all up
{
  const { normalized, codes } = runCase("B", fixtures.B);
  assert.equal(normalized.operStatus, "UP");
  assert.equal(codes.some((c) => c === "CIRCUIT_DOWN" || c === "VSI_DOWN" || c === "PW_PARTIAL_DOWN"), false);
}

// Case C — vsi up, all peers down
{
  const { normalized, codes } = runCase("C", fixtures.C);
  assert.equal(normalized.operStatus, "DOWN");
  assert.ok(codes.includes("CIRCUIT_DOWN"));
  assert.equal(codes.includes("VSI_DOWN"), false);
  assert.equal(codes.includes("PW_PARTIAL_DOWN"), false);
}

// Case D — vsi down
{
  const { normalized, codes } = runCase("D", fixtures.D);
  assert.equal(normalized.operStatus, "DOWN");
  assert.ok(codes.includes("VSI_DOWN"));
  assert.equal(codes.includes("PW_PARTIAL_DOWN"), false);
}

console.log(JSON.stringify({ ok: true, cases: ["A", "B", "C", "D"] }, null, 2));
`;

const result = spawnSync("pnpm", ["dlx", "tsx", "-e", code], {
  cwd: rootDir,
  encoding: "utf8",
  env: process.env,
});

if (result.status !== 0) {
  console.error(result.stdout);
  console.error(result.stderr);
  process.exit(result.status ?? 1);
}

console.log(result.stdout);
console.log("l2-circuit-huawei-vsi-selftest: OK");
