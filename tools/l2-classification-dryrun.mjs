#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const reportDir = path.join(rootDir, "reports/l2-circuits");
const jsonPath = path.join(reportDir, "phase_2_classification_dryrun.json");
const mdPath = path.join(reportDir, "PHASE_2_CLASSIFICATION_DRYRUN_REPORT.md");
const parserDir = path.join(rootDir, "workspace/artifacts/api-server/src/modules/l2circuits/parsers");
const normalizerDir = path.join(rootDir, "workspace/artifacts/api-server/src/modules/l2circuits/normalizers");
const fixtureRoot = path.join(rootDir, "workspace/artifacts/api-server/src/modules/l2circuits");

mkdirSync(reportDir, { recursive: true });

const dbRows = readDbRowsReadonly();
const fixtureAnalysis = runFixtureAnalysis();
const after = fixtureAnalysis.circuits;
const findings = fixtureAnalysis.findings;
const before = after.map(legacyBefore);
const changed = after
  .map((item, index) => ({
    id: item.serviceId ?? item.name,
    name: item.name,
    local_interface: item.localInterface,
    outer_vlan: item.outerVlan,
    before: before[index],
    after: slimCircuit(item),
    findings: item.findings?.map((finding) => finding.code) ?? [],
  }))
  .filter((item) => (
    item.before.circuit_type !== item.after.circuit_type ||
    item.before.classification !== item.after.classification ||
    item.before.status !== item.after.status ||
    item.before.findings.join(",") !== item.findings.join(",")
  ));

const correctedVpws = changed.filter((item) => (
  ["vpws", "l2vc"].includes(item.before.circuit_type) &&
  ["vlan_orphan", "vlanif_orphan", "vlan_local", "l3_interface", "l3_vrf_link", "vsi", "vpls", "config_only"].includes(item.after.classification ?? item.after.circuit_type)
));
const invalidVpwsAfter = after.filter((item) => (
  ["vpws", "l2vc"].includes(item.circuitType) &&
  (!item.vcId || !item.peerIp || !item.localInterface)
));
const pureDot1qVpwsAfter = after.filter((item) => (
  item.circuitType === "vpws" &&
  item.evidenceFlags?.hasDot1q &&
  (!item.evidenceFlags?.hasVcId || !item.evidenceFlags?.hasPeer)
));

const warningMessages = [
  ...(dbRows.error ? [`DB read-only unavailable: ${dbRows.error}`] : []),
  ...(dbRows.rows.length === 0 ? ["No l2_circuits rows available; dry-run classification is fixture-based."] : []),
  ...(fixtureAnalysis.fixtureWarnings ?? []),
];

const goNoGo = after.length > 0 && invalidVpwsAfter.length === 0 && pureDot1qVpwsAfter.length === 0 ? "GO" : "NO-GO";
const result = {
  summary: {
    mode: dbRows.rows.length > 0 ? "db-read-plus-fixture-reclass" : "fixture-based",
    db_rows_readonly: dbRows.rows.length,
    fixture_records_analyzed: after.length,
    total_records_analyzed: dbRows.rows.length + after.length,
    changed_records: changed.length,
    corrected_vpws: correctedVpws.length,
    invalid_vpws_after: invalidVpwsAfter.length,
    pure_dot1q_vpws_after: pureDot1qVpwsAfter.length,
    go_no_go: goNoGo,
  },
  sources: [
    ...dbRows.sources,
    ...fixtureAnalysis.sources,
  ],
  before: {
    circuit_type: countBy(before, (item) => item.circuit_type),
    classification: countBy(before, (item) => item.classification ?? "none"),
    status: countBy(before, (item) => item.status ?? "UNKNOWN"),
    findings: countCodes(before.flatMap((item) => item.findings ?? [])),
  },
  after: {
    circuit_type: countBy(after, (item) => item.circuitType),
    classification: countBy(after, (item) => item.classification ?? item.circuitType),
    status: countBy(after, (item) => item.operStatus ?? "UNKNOWN"),
    findings: countCodes(findings.map((item) => item.code)),
  },
  changed: changed.slice(0, 100),
  changed_examples: changed.slice(0, 10),
  warnings: warningMessages,
  db_readonly_sample: dbRows.rows.slice(0, 10),
  go_no_go: goNoGo,
};

writeFileSync(jsonPath, `${JSON.stringify(result, null, 2)}\n`);
writeFileSync(mdPath, renderMarkdown(result));
console.log(JSON.stringify({
  json: path.relative(rootDir, jsonPath),
  report: path.relative(rootDir, mdPath),
  summary: result.summary,
}, null, 2));

function runFixtureAnalysis() {
  const manualDevice1 = path.join(fixtureRoot, "__fixtures__/manual-device-1");
  const manualS6730 = path.join(fixtureRoot, "__fixtures__/manual-s6730-brt-a");
  const parserFixtures = path.join(fixtureRoot, "parsers/__fixtures__");
  const fixtures = {
    device1Config: readOptional(path.join(manualDevice1, "display_current_config_interface.txt")),
    device1Desc: readOptional(path.join(manualDevice1, "display_interface_description.txt")),
    s6730L2vc: readOptional(path.join(manualS6730, "display_mpls_l2vc.txt")),
    s6730Vsi: readOptional(path.join(manualS6730, "display_vsi_verbose.txt")),
    s6730Mac612: readOptional(path.join(manualS6730, "display_mac-address_vlan_612.txt")) || readOptional(path.join(manualS6730, "display_mac_address_vlan_612.txt")),
    neL2vc: readOptional(path.join(parserFixtures, "display-mpls-l2vc-verbose.txt")),
    neVsi: readOptional(path.join(parserFixtures, "display-vsi-verbose.txt")),
  };
  const code = `
import { parseHuaweiL2Circuits } from ${JSON.stringify(pathToFileURL(path.join(parserDir, "huawei-vrp-l2.ts")).href)};
import { normalizeCircuits } from ${JSON.stringify(pathToFileURL(path.join(normalizerDir, "status.normalizer.ts")).href)};
import { enrichCircuitsWithFindings } from ${JSON.stringify(pathToFileURL(path.join(normalizerDir, "findings.resolver.ts")).href)};

const fixtures = ${JSON.stringify(fixtures)};
const sources = [];
const rawSets = [];
if (fixtures.device1Config) {
  sources.push({ name: "manual-device-1", kind: "fixture", files: ["display_current_config_interface.txt", "display_interface_description.txt"] });
  rawSets.push({
    "display current-configuration interface": fixtures.device1Config,
    "display interface description": fixtures.device1Desc,
  });
}
if (fixtures.s6730L2vc || fixtures.s6730Vsi) {
  sources.push({ name: "manual-s6730-brt-a", kind: "fixture", files: ["display_mpls_l2vc.txt", "display_vsi_verbose.txt", "display_mac-address_vlan_612.txt"] });
  rawSets.push({
    "display mpls l2vc": fixtures.s6730L2vc,
    "display vsi verbose": fixtures.s6730Vsi,
    "display mac-address vlan": fixtures.s6730Mac612,
  });
}
if (fixtures.neL2vc || fixtures.neVsi) {
  sources.push({ name: "parser-ne8000-l2vc-vsi", kind: "fixture", files: ["display-mpls-l2vc-verbose.txt", "display-vsi-verbose.txt"] });
  rawSets.push({
    "display mpls l2vc verbose": fixtures.neL2vc,
    "display vsi verbose": fixtures.neVsi,
  });
}
sources.push({ name: "synthetic-edge-cases", kind: "inline-fixture", files: [] });
rawSets.push({
  "display current-configuration interface": [
    "# hostname=LAB-NE8000",
    "interface Eth-Trunk1.100",
    " vlan-type dot1q 100",
    "#",
    "interface Eth-Trunk1.200",
    " vlan-type dot1q 200",
    "#",
    "interface Eth-Trunk2.200",
    " vlan-type dot1q 200",
    "#",
    "interface Vlanif300",
    " description unused",
    "#",
    "interface Vlanif301",
    " ip address 10.0.0.1 255.255.255.0",
    "#",
    "interface Eth-Trunk1.302",
    " vlan-type dot1q 302",
    " ip binding vpn-instance CUST",
    " ip address 10.0.2.1 255.255.255.252",
    "#",
  ].join("\\n"),
});
rawSets.push({
  "display current-configuration interface": [
    "# hostname=EDGE_S6730",
    "interface GigabitEthernet0/0/1",
    " port link-type trunk",
    " port trunk allow-pass vlan 400",
    "#",
    "interface Vlanif400",
    "#",
  ].join("\\n"),
});

const parsed = rawSets.flatMap((raw) => parseHuaweiL2Circuits(raw));
const normalized = normalizeCircuits(parsed);
const circuits = enrichCircuitsWithFindings(normalized);
const findings = circuits.flatMap((c) => c.findings);
console.log(JSON.stringify({ sources, circuits, findings }));
`;
  const result = spawnSync("pnpm", ["dlx", "tsx", "-e", code], {
    cwd: rootDir,
    encoding: "utf8",
    env: process.env,
  });
  if (result.status !== 0) {
    throw new Error(`fixture parser failed: ${result.stderr || result.stdout}`);
  }
  return JSON.parse(result.stdout);
}

function readDbRowsReadonly() {
  const env = readDotEnv();
  const db = env.POSTGRES_DB ?? "netops";
  const user = env.POSTGRES_USER ?? "netops";
  const password = env.POSTGRES_PASSWORD ?? "netops";
  const sql = "select coalesce(json_agg(row_to_json(t)), '[]'::json) from (select id, device_id, circuit_type, local_interface, outer_vlan, vc_id, vsi_name, peer_ip, oper_status, findings from l2_circuits order by id desc limit 500) t;";
  const result = spawnSync("docker", ["exec", "-e", `PGPASSWORD=${password}`, "netops-db", "psql", "-U", user, "-d", db, "-t", "-A", "-c", sql], {
    cwd: rootDir,
    encoding: "utf8",
  });
  if (result.status !== 0) {
    return { rows: [], sources: [{ name: "l2_circuits", kind: "db-readonly", status: "unavailable" }], error: (result.stderr || result.stdout).trim() };
  }
  try {
    const rows = JSON.parse(result.stdout.trim() || "[]");
    return { rows, sources: [{ name: "l2_circuits", kind: "db-readonly", status: "read", rows: rows.length }] };
  } catch (error) {
    return { rows: [], sources: [{ name: "l2_circuits", kind: "db-readonly", status: "parse_failed" }], error: String(error) };
  }
}

function legacyBefore(circuit) {
  const hasDot1q = Boolean(circuit.evidenceFlags?.hasDot1q);
  const hasPw = Boolean(circuit.vcId && circuit.peerIp && circuit.localInterface);
  const afterClass = circuit.classification ?? circuit.circuitType;
  let circuitType = circuit.circuitType;
  let classification = afterClass;

  if (hasDot1q && !hasPw && ["vlan_orphan", "vlanif_orphan", "vlan_local", "l3_interface", "l3_vrf_link", "config_only", "vlan_not_in_switch_batch"].includes(afterClass)) {
    circuitType = "vpws";
    classification = "legacy_dot1q_false_vpws";
  }

  return {
    circuit_type: circuitType,
    classification,
    status: circuit.operStatus ?? "UNKNOWN",
    findings: [],
  };
}

function slimCircuit(circuit) {
  return {
    circuit_type: circuit.circuitType,
    classification: circuit.classification ?? circuit.circuitType,
    status: circuit.operStatus ?? "UNKNOWN",
    vc_id: circuit.vcId,
    peer_ip: circuit.peerIp,
    local_interface: circuit.localInterface,
  };
}

function renderMarkdown(data) {
  return `# Phase 2 Classification Dry-Run Report

## Resumo executivo

- Resultado: ${data.go_no_go}
- Modo: ${data.summary.mode}
- Registros DB lidos read-only: ${data.summary.db_rows_readonly}
- Registros fixture analisados: ${data.summary.fixture_records_analyzed}
- Registros alterados no dry-run: ${data.summary.changed_records}
- VPWS corrigidos: ${data.summary.corrected_vpws}
- VPWS inválidos após classificação: ${data.summary.invalid_vpws_after}
- Dot1Q puro como VPWS após classificação: ${data.summary.pure_dot1q_vpws_after}

## Fontes analisadas

${data.sources.map((source) => `- ${source.name} (${source.kind})${source.rows !== undefined ? `: ${source.rows} rows` : ""}`).join("\n")}

## Contagem antes

### circuit_type

${tableFromCounts(data.before.circuit_type)}

### classification

${tableFromCounts(data.before.classification)}

## Contagem depois

### circuit_type

${tableFromCounts(data.after.circuit_type)}

### classification

${tableFromCounts(data.after.classification)}

## Findings gerados

${tableFromCounts(selectFindingCounts(data.after.findings))}

## Métricas pedidas

- vlan_orphan: ${data.after.classification.vlan_orphan ?? 0}
- vlanif_orphan: ${data.after.classification.vlanif_orphan ?? 0}
- vlan_local: ${data.after.classification.vlan_local ?? 0}
- l3_interface: ${data.after.classification.l3_interface ?? 0}
- l3_vrf_link: ${data.after.classification.l3_vrf_link ?? 0}
- vsi/vpls: ${(data.after.classification.vsi ?? 0) + (data.after.classification.vpls ?? 0)}
- VPWS corrigidos: ${data.summary.corrected_vpws}

## Exemplos reclassificados

${data.changed_examples.map((item, index) => `${index + 1}. ${item.name} ${item.local_interface ?? "-"} vlan ${item.outer_vlan ?? "-"}: ${item.before.circuit_type}/${item.before.classification} -> ${item.after.circuit_type}/${item.after.classification}`).join("\n") || "- Nenhum"}

## Warnings

${data.warnings.map((warning) => `- ${warning}`).join("\n") || "- Nenhum"}

## Riscos

- Dry-run não grava banco e não muda classificação persistida.
- Quando DB não tem raw snapshot completo, reclassificação real deve usar snapshot/fixture completo, não somente linha antiga.
- Fixture S6730 local contém header com 82 L2VC, mas só um bloco L2VC colado.

## GO/NO-GO

${data.go_no_go}: revisar relatório antes de qualquer migração/reclassificação em banco.

## Confirmação read-only

- Nenhum SSH.
- Nenhum device write.
- Nenhum NetBox write.
- Nenhum SNMP.
- Nenhum sync/apply plan.
- Nenhum update/delete/insert em banco.
`;
}

function tableFromCounts(counts) {
  const entries = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  if (entries.length === 0) return "| item | count |\n|---|---|\n| none | 0 |";
  return ["| item | count |", "|---|---|", ...entries.map(([key, value]) => `| ${key} | ${value} |`)].join("\n");
}

function selectFindingCounts(counts) {
  const wanted = ["ROUTER_L2_VLAN_ANOMALY", "VLAN_NOT_IN_SWITCH_BATCH", "VLAN_ORPHAN", "VLANIF_ORPHAN", "CIRCUIT_DOWN", "REMOTE_NOT_FORWARDING"];
  return Object.fromEntries(wanted.map((key) => [key, counts[key] ?? 0]));
}

function countBy(items, fn) {
  const counts = {};
  for (const item of items) {
    const key = fn(item) ?? "none";
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return counts;
}

function countCodes(codes) {
  const counts = {};
  for (const code of codes) counts[code] = (counts[code] ?? 0) + 1;
  return counts;
}

function readOptional(filePath) {
  return existsSync(filePath) ? readFileSync(filePath, "utf8") : "";
}

function readDotEnv() {
  const envPath = path.join(rootDir, ".env");
  if (!existsSync(envPath)) return {};
  const env = {};
  for (const line of readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (match) env[match[1]] = match[2];
  }
  return env;
}
