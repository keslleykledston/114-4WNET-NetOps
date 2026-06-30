#!/usr/bin/env node
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const code = `
import { parseGlobalVlans } from "./workspace/artifacts/api-server/src/modules/l2circuits/parsers/classification.helpers.ts";
import { parseHuaweiL2Circuits } from "./workspace/artifacts/api-server/src/modules/l2circuits/parsers/huawei-vrp-l2.ts";
import { normalizeCircuits } from "./workspace/artifacts/api-server/src/modules/l2circuits/normalizers/status.normalizer.ts";
import { resolveL2Findings } from "./workspace/artifacts/api-server/src/modules/l2circuits/normalizers/findings.resolver.ts";

const summary = "Static VLAN:\\nTotal 5 static VLAN.\\n  199 893 to 1130 1842 to 1843\\n";
const globals = parseGlobalVlans(undefined, summary);
const vlan199 = parseHuaweiL2Circuits({
  "display current-configuration interface": "# hostname=EDGE_S6730\\ninterface Vlanif199\\n#",
  "display vlan summary": summary,
  "display vlan": "VLAN ID: 199\\nStatus: Enable\\nState: Up\\nDescription: VLAN 0199\\nTagged ports: 100GE0/0/5(U), XGE0/0/28(U), XGE0/0/48(U), Eth-Trunk11(U)\\nActive ports: 100GE0/0/5(U), XGE0/0/28(U), XGE0/0/48(U), Eth-Trunk11(U)\\n",
});
const vlan1842 = parseHuaweiL2Circuits({
  "display current-configuration interface": "# hostname=EDGE_S6730\\ninterface Vlanif1842\\n#",
  "display vlan summary": summary,
  "display vlan 1842": "VLAN ID: 1842\\nStatus: Enable\\nState: Up\\nDescription: VLAN 1842\\nTagged ports: Eth-Trunk2, XGigabitEthernet0/0/38, XGigabitEthernet0/0/47\\nActive ports: Eth-Trunk2, XGigabitEthernet0/0/38\\n",
});
const vlan1118 = parseHuaweiL2Circuits({
  "display current-configuration interface": "# hostname=EDGE_S6730\\ninterface Vlanif1118\\n l2 binding vsi L2L-1118\\n statistic enable both\\n#",
  "display vlan summary": summary,
  "display vsi verbose": "# hostname=EDGE_S6730\\n***VSI Name               : L2L-1118\\n    VSI ID                 : 1118\\n    VSI State              : up\\n    Peer Router ID         : 10.1.1.1\\n    Session                : up\\n    Encapsulation Type     : VLAN\\n",
});
const vlan1158 = parseHuaweiL2Circuits({
  "display current-configuration interface": "# hostname=EDGE_S6730\\ninterface Vlanif1158\\n description L2-only\\n#",
  "display vlan summary": summary,
  "display vlan": "VLAN ID: 1158\\nStatus: Enable\\nState: Up\\nDescription: VLAN 1158\\nTagged ports: XGE0/0/48(U), Eth-Trunk0(U)\\nActive ports: XGE0/0/48(U), Eth-Trunk0(U)\\n",
});

const findings199 = resolveL2Findings(normalizeCircuits(vlan199));
const findings1842 = resolveL2Findings(normalizeCircuits(vlan1842));
const findings1118 = resolveL2Findings(normalizeCircuits(vlan1118));
const findings1158 = resolveL2Findings(normalizeCircuits(vlan1158));

const binding1118 = vlan1118.find((c) => c.outerVlan === 1118);

console.log(JSON.stringify({
  globals: {
    has199: globals.globalVlans.has(199),
    has893: globals.globalVlans.has(893),
    has1118: globals.globalVlans.has(1118),
    has1130: globals.globalVlans.has(1130),
    has1131: globals.globalVlans.has(1131),
    has1842: globals.globalVlans.has(1842),
    has1843: globals.globalVlans.has(1843),
  },
  vlan199: {
    binding: vlan199.find((c) => c.outerVlan === 199)?.classification,
    findings: findings199.map((f) => f.code),
  },
  vlan1842: {
    binding: vlan1842.find((c) => c.outerVlan === 1842)?.classification,
    findings: findings1842.map((f) => f.code),
  },
  vlan1118: {
    binding: binding1118?.classification,
    findings: findings1118.map((f) => f.code),
  },
  vlan1158: {
    binding: vlan1158.find((c) => c.outerVlan === 1158)?.classification,
    findings: findings1158.map((f) => f.code),
  },
}, null, 2));
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
if (!result.stdout.includes('"vlan1158"')) {
  process.exit(1);
}
console.log("l2-vlan-summary-vsi-binding-selftest: OK");
