#!/usr/bin/env node
import assert from "node:assert/strict";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const parserDir = path.join(rootDir, "workspace/artifacts/api-server/src/modules/l2circuits/parsers");
const normalizerDir = path.join(rootDir, "workspace/artifacts/api-server/src/modules/l2circuits/normalizers");

const code = `
import assert from "node:assert/strict";
import { parseHuaweiL2Circuits } from ${JSON.stringify(pathToFileURL(path.join(parserDir, "huawei-vrp-l2.ts")).href)};
import { normalizeCircuits } from ${JSON.stringify(pathToFileURL(path.join(normalizerDir, "status.normalizer.ts")).href)};
import { resolveL2Findings } from ${JSON.stringify(pathToFileURL(path.join(normalizerDir, "findings.resolver.ts")).href)};

function findingsFor(circuits) {
  return resolveL2Findings(normalizeCircuits(circuits));
}

const dot1qOrphan = parseHuaweiL2Circuits({
  "display current-configuration interface": "# hostname=LAB-NE8000\\ninterface Eth-Trunk1.100\\n vlan-type dot1q 100\\n#",
});
assert.equal(dot1qOrphan[0].circuitType, "vlan_orphan");
assert.equal(dot1qOrphan[0].classification, "vlan_orphan");
assert.equal(dot1qOrphan.some((c) => c.circuitType === "vpws"), false);
assert.ok(findingsFor(dot1qOrphan).some((f) => f.code === "VLAN_ORPHAN"));

const dot1qLocal = parseHuaweiL2Circuits({
  "display current-configuration interface": "interface Eth-Trunk1.200\\n vlan-type dot1q 200\\n#\\ninterface Eth-Trunk2.200\\n vlan-type dot1q 200\\n#",
});
assert.equal(dot1qLocal.every((c) => c.classification === "vlan_local"), true);
assert.ok(findingsFor(dot1qLocal).some((f) => f.code === "VLAN_MULTI_INTERFACE_LOCAL"));

const vlanifOrphan = parseHuaweiL2Circuits({
  "display current-configuration interface": "# hostname=EDGE_S6730\\nvlan batch 300\\ninterface Vlanif300\\n description unused\\n#",
});
assert.equal(vlanifOrphan[0].classification, "vlanif_orphan");
assert.ok(findingsFor(vlanifOrphan).some((f) => f.code === "VLANIF_ORPHAN"));

const vlanifL3 = parseHuaweiL2Circuits({
  "display current-configuration interface": "interface Vlanif301\\n ip address 10.0.0.1 255.255.255.0\\n#",
});
assert.equal(vlanifL3[0].classification, "l3_interface");
assert.equal(vlanifL3[0].l2Transport, "l3");

const subifL3 = parseHuaweiL2Circuits({
  "display current-configuration interface": "interface Eth-Trunk1.302\\n vlan-type dot1q 302\\n ip binding vpn-instance CUST\\n ip address 10.0.2.1 255.255.255.252\\n#",
});
assert.equal(subifL3[0].classification, "l3_vrf_link");
assert.equal(subifL3[0].circuitType, "l3_vrf_link");

const vlanifVpws = parseHuaweiL2Circuits({
  "display mpls l2vc": "# hostname=EDGE_S6730\\n*client interface       : Vlanif15 is up\\n  VC ID                  : 15\\n  VC type                : VLAN\\n  destination            : 10.200.5.1\\n  VC state               : up\\n  AC status              : up\\n  session state          : up\\n  remote forwarding state: forwarding\\n",
});
assert.equal(vlanifVpws[0].circuitType, "vpws");
assert.equal(vlanifVpws[0].classification, "vpws");
assert.equal(vlanifVpws[0].vcId, "15");
assert.equal(vlanifVpws[0].peerIp, "10.200.5.1");
assert.equal(vlanifVpws[0].localInterface, "Vlanif15");

const noPeerNoVpws = parseHuaweiL2Circuits({
  "display mpls l2vc": "# hostname=EDGE_S6730\\n*client interface       : Vlanif16 is up\\n  VC ID                  : 16\\n  VC type                : VLAN\\n  VC state               : up\\n",
  "display current-configuration interface": "interface Eth-Trunk1.16\\n vlan-type dot1q 16\\n#",
});
assert.equal(noPeerNoVpws.some((c) => c.circuitType === "vpws"), false);

const vsi = parseHuaweiL2Circuits({
  "display vsi verbose": "# hostname=EDGE_S6730\\n***VSI Name               : SERVICOS_CDS\\n    VSI ID                 : 601\\n    VSI State              : up\\n    Peer Router ID         : 10.200.4.1\\n    Session                : up\\n    Encapsulation Type     : VLAN\\n    P2P VSI                : disable\\n",
});
assert.equal(vsi[0].classification, "vsi");
assert.equal(vsi[0].l2Transport, "multipoint");

const trunkMissingBatch = parseHuaweiL2Circuits({
  "display current-configuration interface": "# hostname=EDGE_S6730\\ninterface GigabitEthernet0/0/1\\n port link-type trunk\\n port trunk allow-pass vlan 400\\n#\\ninterface Vlanif400\\n#",
});
assert.ok(trunkMissingBatch.some((c) => c.classification === "vlan_not_in_switch_batch"));
assert.ok(findingsFor(trunkMissingBatch).some((f) => f.code === "VLAN_NOT_IN_SWITCH_BATCH"));

const trunkPresentBatch = parseHuaweiL2Circuits({
  "display current-configuration interface": "# hostname=EDGE_S6730\\nvlan batch 401\\ninterface GigabitEthernet0/0/1\\n port link-type trunk\\n port trunk allow-pass vlan 401\\n#\\ninterface Vlanif401\\n#",
});
assert.equal(trunkPresentBatch[0].classification, "vlan_local");
assert.equal(findingsFor(trunkPresentBatch).some((f) => f.code === "VLAN_NOT_IN_SWITCH_BATCH"), false);

const routerNoBatch = parseHuaweiL2Circuits({
  "display current-configuration interface": "# hostname=LAB-NE8000\\ninterface Eth-Trunk1.402\\n vlan-type dot1q 402\\n#",
});
assert.equal(findingsFor(routerNoBatch).some((f) => f.code === "VLAN_NOT_IN_SWITCH_BATCH"), false);
assert.ok(findingsFor(routerNoBatch).some((f) => f.code === "ROUTER_L2_VLAN_ANOMALY"));

console.log(JSON.stringify({
  dot1qOrphan: dot1qOrphan[0].classification,
  dot1qLocal: dot1qLocal.length,
  vlanifOrphan: vlanifOrphan[0].classification,
  vlanifL3: vlanifL3[0].classification,
  vpws: vlanifVpws[0].name,
  vsi: vsi[0].name,
  missingBatch: trunkMissingBatch.map((c) => c.classification),
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
console.log("l2-classification-selftest: OK");
