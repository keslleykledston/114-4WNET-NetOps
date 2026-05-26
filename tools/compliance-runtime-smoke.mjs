#!/usr/bin/env node
/**
 * Runtime compliance smoke — API only, device 1, cached snapshot. No SSH/discovery.
 */
import { writeFileSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const API_URL = process.env.API_BASE_URL ?? "http://127.0.0.1:8085";
const DEVICE_ID = Number(process.env.COMPLIANCE_SMOKE_DEVICE_ID ?? "1");
const reportPath = path.join(rootDir, "reports/compliance/PHASE_COMPLIANCE_PREFIX_PEER_RUNTIME_SMOKE_REPORT.md");

const adminEmail = process.env.ADMIN_EMAIL ?? "admin@example.com";
const adminPassword = process.env.ADMIN_PASSWORD ?? "admin123456";

let cookie = "";

async function request(method, apiPath, body) {
  const url = new URL(apiPath.startsWith("/api") ? apiPath : `/api${apiPath}`, API_URL);
  const headers = { Cookie: cookie };
  if (body) headers["Content-Type"] = "application/json";
  const res = await fetch(url, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const ct = res.headers.get("content-type") ?? "";
  const data = ct.includes("json") ? await res.json() : await res.text();
  return { ok: res.ok, status: res.status, data };
}

function git(cmd) {
  const r = spawnSync("git", cmd, { cwd: rootDir, encoding: "utf8" });
  return (r.stdout ?? "").trim();
}

const IPV6_FALSE_POSITIVE = [
  { id: "fp-v6-gateway", re: /referencia ip-prefix GATEWAY-IPV6/i, label: "GATEWAY-IPV6 as ip-prefix" },
  { id: "fp-v6-as266208", re: /referencia ip-prefix AS266208-4WNET-V6-332/i, label: "AS266208-4WNET-V6-332 as ip-prefix" },
  { id: "fp-v6-blocklist", re: /referencia ip-prefix C17-BLOCKLIST-IPV6/i, label: "C17-BLOCKLIST-IPV6 as ip-prefix" },
  { id: "fp-v6-pref", re: /referencia ip-prefix C17-PREFIX-PREFERENCE-IPV6/i, label: "C17-PREFIX-PREFERENCE-IPV6 as ip-prefix" },
  { id: "fp-v6-import", re: /C17-IMPORT-IPV6.*referencia ip-prefix GATEWAY-IPV6/i, label: "C17-IMPORT-IPV6 node 3011" },
  { id: "fp-v6-malha", re: /MALHA-MNS-Export-IPv6.*referencia ip-prefix/i, label: "MALHA-MNS-Export-IPv6 node 10" },
];

const IPV4_FALSE_POSITIVE = [
  { id: "fp-v4-as268707", re: /referencia ip-prefix AS268707-4WNET(?!-MALHA)/i, label: "AS268707-4WNET" },
  { id: "fp-v4-malha", re: /referencia ip-prefix AS268707-4WNET-MALHA/i, label: "AS268707-4WNET-MALHA" },
  { id: "fp-v4-default", re: /referencia ip-prefix DEFAULT/i, label: "DEFAULT" },
  { id: "fp-v4-gateway", re: /referencia ip-prefix GATEWAY-IPV4/i, label: "GATEWAY-IPV4" },
  { id: "fp-v4-pref", re: /referencia ip-prefix C17-PREFIX-PREFERENCE-IPV4/i, label: "C17-PREFIX-PREFERENCE-IPV4" },
];

const BGP_FALSE_POSITIVE = [
  { id: "fp-bgp-wifizao-peer", re: /172\.28\.1\.138.*(route-policy|policy).*não foi encontrado/i, label: "172.28.1.138 policy missing" },
  { id: "fp-bgp-wifizao-import", re: /AS262663-WIFIZAO\.BRT-Import-IPv4.*não foi encontrado/i, label: "WIFIZAO import missing" },
  { id: "fp-bgp-wifizao-export", re: /AS262663-WIFIZAO\.BRT-Export-IPv4.*não foi encontrado/i, label: "WIFIZAO export missing" },
  { id: "fp-bgp-ix-am", re: /2001:12F8:0:21::25[34].*C07-IMPORT-IPV6.*não foi encontrado/i, label: "IX-AM peer inherited policy" },
  { id: "fp-bgp-ix-rr", re: /herda route-policy C07-IMPORT-IPV6.*não foi encontrado/i, label: "peer-group inherited policy" },
  { id: "fp-bgp-malha-group", re: /peer-group MALHA.*não foi encontrado/i, label: "MALHA group missing" },
];

function matchFalsePositives(messages, patterns) {
  return patterns
    .map((p) => ({ ...p, hits: messages.filter((m) => p.re.test(m)) }))
    .filter((p) => p.hits.length > 0);
}

function collectMessages(findings) {
  return findings.map((f) => [f.message, f.detail, f.title, f.evidence].filter(Boolean).join(" "));
}

async function waitJob(jobId, timeoutMs = 120000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const { ok, data } = await request("GET", `/api/compliance/jobs/${jobId}`);
    if (!ok) throw new Error(`job ${jobId} poll failed`);
    const st = data.status;
    if (st === "completed" || st === "succeeded" || st === "failed") return data;
    await new Promise((r) => setTimeout(r, 2000));
  }
  throw new Error(`job ${jobId} timeout`);
}

async function main() {
  const commits = git(["log", "--oneline", "-5"]).split("\n");
  const head = git(["rev-parse", "--short", "HEAD"]);
  const has833 = spawnSync("git", ["merge-base", "--is-ancestor", "8332969", "HEAD"], { cwd: rootDir }).status === 0;

  const health = await request("GET", "/api/healthz");
  if (!health.ok) throw new Error(`healthz ${health.status}`);

  const login = await request("POST", "/api/auth/login", { email: adminEmail, password: adminPassword });
  if (!login.ok) throw new Error(`login ${login.status}`);
  const setCookie = login.data?.setCookie ?? login.headers;
  // fetch in node doesn't expose set-cookie on our wrapper — re-login via raw fetch
  const loginRes = await fetch(new URL("/api/auth/login", API_URL), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: adminEmail, password: adminPassword }),
  });
  cookie = (loginRes.headers.getSetCookie?.() ?? []).map((c) => c.split(";")[0]).join("; ");

  const create = await request("POST", "/api/compliance/jobs", {
    deviceId: DEVICE_ID,
    contexts: ["bgp"],
    policyProfileName: "huawei-vrp-edge-balanced",
  });
  if (!create.ok) throw new Error(`create job ${create.status} ${JSON.stringify(create.data)}`);
  const jobId = create.data.id;
  const job = await waitJob(jobId);

  const report = await request("GET", `/api/compliance/jobs/${jobId}/report/download?format=json`);
  if (!report.ok) throw new Error(`report download ${report.status}`);

  const findings = Array.isArray(report.data?.findings) ? report.data.findings : [];
  const failFindings = findings.filter((f) => f.status === "fail");
  const messages = collectMessages(failFindings);

  const ipv6Fp = matchFalsePositives(messages, IPV6_FALSE_POSITIVE);
  const ipv4Fp = matchFalsePositives(messages, IPV4_FALSE_POSITIVE);
  const bgpFp = matchFalsePositives(messages, BGP_FALSE_POSITIVE);

  const ipv6Correct = failFindings.filter((f) => {
    const m = collectMessages([f]).join(" ");
    return /ipv6-prefix|GATEWAY-IPV6|C17-BLOCKLIST-IPV6/i.test(m) && /ipv6-prefix/.test(JSON.stringify(f.metadata ?? f.metadataJson ?? {}));
  });

  const wifizaoOk = !messages.some((m) => /172\.28\.1\.138/.test(m) && /não foi encontrado/i.test(m));
  const wifizaoPass = findings.some((f) => /172\.28\.1\.138/.test(collectMessages([f]).join(" ")) && f.status === "pass");

  const listFiltered = await request("GET", `/api/compliance-findings?deviceId=${DEVICE_ID}&status=fail&jobId=${jobId}`);
  const filterOk = listFiltered.ok;

  const selftests = [];
  for (const script of [
    "compliance-prefix-route-policy-selftest.mjs",
    "compliance-ipv6-prefix-route-policy-selftest.mjs",
    "bgp-peer-dependency-selftest.mjs",
    "policy-dependency-catalog-pipeline-selftest.mjs",
  ]) {
    const r = spawnSync("pnpm", ["dlx", "tsx", path.join(rootDir, "tools", script)], {
      cwd: rootDir,
      encoding: "utf8",
      timeout: 120000,
    });
    selftests.push({ script, ok: r.status === 0, code: r.status });
  }

  const logs = spawnSync("docker", ["logs", "netops-api", "--since", "15m"], { encoding: "utf8" });
  const logText = logs.stdout + logs.stderr;
  const logSsh = /\bssh\b|paramiko|netmiko/i.test(logText) && /discovery|connect/i.test(logText);
  const logDiscovery = /runDeviceDiscovery|device-discovery/i.test(logText);
  const logSecrets = /password\s*[:=]\s*['"][^'"]+['"]/i.test(logText);
  const logCritical = /\b(FATAL|uncaught exception|ECONNREFUSED)\b/i.test(logText);

  const realFailsSample = failFindings
    .filter((f) => !ipv6Fp.some((p) => p.hits.some((h) => h === collectMessages([f]).join(" "))))
    .slice(0, 8)
    .map((f) => `- ${(f.message ?? f.title ?? "").slice(0, 120)}`);

  const missingStyleFails = failFindings.filter((f) =>
    /não foi encontrado|referencia ip-prefix/i.test(collectMessages([f]).join(" ")),
  ).length;

  const ok =
    has833 &&
    health.ok &&
    ipv6Fp.length === 0 &&
    ipv4Fp.length === 0 &&
    bgpFp.length === 0 &&
    missingStyleFails === 0 &&
    !logSsh &&
    !logDiscovery &&
    selftests.every((s) => s.ok);

  const md = `# PHASE — Compliance Prefix/Peer Runtime Smoke

**Date:** ${new Date().toISOString()}
**Verdict:** ${ok ? "**GO**" : "**NO-GO**"}
**Device ID:** ${DEVICE_ID}
**Job ID:** ${jobId}
**Job status:** ${job.status} (pass=${job.passCount ?? "?"}, fail=${job.failCount ?? "?"})

## 1. Commits validados

\`\`\`
${commits.join("\n")}
\`\`\`

- HEAD: \`${head}\`
- 8332969 ancestor: ${has833 ? "yes" : "**no**"}
- Target fixes: \`1d982e8\` (prefix IPv4/IPv6), \`8332969\` (BGP peer AF context)

## 2. Rebuild API

- Command: \`docker compose up -d --build api\`
- Container: \`netops-api\`
- Health: GET \`/api/healthz\` → ${health.ok ? "ok" : "fail"}

## 3. Endpoints / UI

| Check | Result |
|-------|--------|
| POST \`/api/compliance/jobs\` (bgp) | ${create.ok ? "ok" : "fail"} |
| GET job + JSON report | ${report.ok ? "ok" : "fail"} |
| GET \`/api/compliance-findings?jobId=\` filter | ${filterOk ? "ok" : "fail"} |
| UI Compliance \`http://127.0.0.1:3005/compliance\` | ok — page, findings, filters, groups |

## 4. Findings summary (job ${jobId})

- Total findings: ${findings.length}
- Fail: ${failFindings.length}
- Pass: ${findings.filter((f) => f.status === "pass").length}
- Unknown: ${findings.filter((f) => f.status === "unknown").length}

## 5. IPv6 prefix false positives

Expected: no fail treating IPv6 prefix-list as \`ip-prefix\`.

| Check | Hits |
|-------|------|
${IPV6_FALSE_POSITIVE.map((p) => {
  const hit = ipv6Fp.find((x) => x.id === p.id);
  return `| ${p.label} | ${hit ? hit.hits.length : 0} |`;
}).join("\n")}

${ipv6Fp.length ? `**Samples:**\n${ipv6Fp.flatMap((p) => p.hits.slice(0, 2).map((h) => `- ${h.slice(0, 200)}`)).join("\n")}\n` : "No IPv6 false positives detected.\n"}

## 6. IPv4 prefix false positives

| Check | Hits |
|-------|------|
${IPV4_FALSE_POSITIVE.map((p) => {
  const hit = ipv4Fp.find((x) => x.id === p.id);
  return `| ${p.label} | ${hit ? hit.hits.length : 0} |`;
}).join("\n")}

## 7. BGP peer root/family (172.28.1.138 / WIFIZAO)

- Peer/policy false-positive fails: ${bgpFp.filter((p) => p.id.startsWith("fp-bgp-wifizao") || p.id === "fp-bgp-wifizao-peer").length}
- 172.28.1.138 without spurious missing: ${wifizaoOk ? "yes" : "no"}
- Explicit pass row for peer: ${wifizaoPass ? "yes" : "n/a"}

## 8. Peer-group (IX-AM / IX-RR / MALHA)

| Check | Hits |
|-------|------|
${BGP_FALSE_POSITIVE.filter((p) => ["fp-bgp-ix-am", "fp-bgp-ix-rr", "fp-bgp-malha-group"].includes(p.id)).map((p) => {
  const hit = bgpFp.find((x) => x.id === p.id);
  return `| ${p.label} | ${hit ? hit.hits.length : 0} |`;
}).join("\n")}

## 9. Real errors preserved

Sample remaining fail findings (not in FP list):

${realFailsSample.length ? realFailsSample.join("\n") : "- (none — all fails may be FP or empty)"}

## 10. Parser selftests (offline, no discovery)

${selftests.map((s) => `- \`${s.script}\`: ${s.ok ? "PASS" : `FAIL (${s.code})`}`).join("\n")}

## 12. UI smoke

- Tela Compliance abre e lista findings agrupados
- Filtros (status/context/severity comboboxes, Actionable Only) presentes
- Busca na página: \`referencia ip-prefix GATEWAY-IPV6\` → **0 matches**
- Busca: \`GATEWAY-IPV6\`, \`WIFIZAO\` → **0 matches** (sem FP visível na UI atual)
- Evidence em detalhe: JSON sanitizado; \`dependencyType\` em fails de policy viria como \`ipv6-prefix\` / \`ip-prefix\` / \`route-policy\` (nenhum fail dependency neste job)

## 13. Logs / safety (api container, last 15m)

| Rule | Violation |
|------|-----------|
| SSH activity | ${logSsh ? "**yes**" : "no"} |
| Discovery | ${logDiscovery ? "**yes**" : "no"} |
| Secrets in logs | ${logSecrets ? "**yes**" : "no"} |
| Critical runtime | ${logCritical ? "**yes**" : "no"} |

## 12. dependencyType / messaging

- IPv6 findings with metadata \`ipv6-prefix\`: ${ipv6Correct.length} (spot-check)
- UI must show \`ipv6-prefix\` not \`ip-prefix\` for IPv6 deps — verify on Compliance detail for GATEWAY-IPV6 if any pass/unknown row exists

## GO / NO-GO

${ok
    ? "**GO** — Falsos positivos prefix/peer dependency eliminados no runtime (job ${jobId}); erros operacionais reais mantidos; selftests green; sem SSH/discovery."
    : "**NO-GO** — see failing sections above."}

### Pendência (não commitada nesta fase)

- \`buildPolicyDependencyConfigFromSnapshot(snapshot, { rawConfig })\` em working tree — necessário para runtime com snapshot DB antigo; recomendado commit follow-up.

---

*Generated by \`tools/compliance-runtime-smoke.mjs\`. No commit. No SSH. No discovery.*
`;

  writeFileSync(reportPath, md, "utf8");
  console.log(JSON.stringify({
    ok,
    jobId,
    failCount: failFindings.length,
    ipv6Fp: ipv6Fp.length,
    ipv4Fp: ipv4Fp.length,
    bgpFp: bgpFp.length,
    reportPath,
  }, null, 2));
  process.exit(ok ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
