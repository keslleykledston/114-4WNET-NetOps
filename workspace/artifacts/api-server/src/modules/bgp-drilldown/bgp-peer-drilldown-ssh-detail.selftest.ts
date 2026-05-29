import assert from "node:assert/strict";
import {
  BGP_DRILLDOWN_SSH_DETAIL_DISABLED,
  buildSshDetailCommands,
  isAllowedSshDetailCommand,
  isSafePeerIdentifier,
  isSafePolicyObjectName,
  parseSshDetailRequest,
  sanitizeSshDetailText,
} from "./bgp-peer-drilldown-ssh-detail.js";
import { env } from "../../lib/env.js";
import type { BgpPeerDrilldownResult } from "./bgp-peer-drilldown.types.js";

const sampleDrilldown = {
  contractVersion: "bgp-peer-drilldown-v1",
  deviceId: 1,
  peer: "172.28.1.138",
  source: "ssh_full_config",
  collectedAt: new Date(0).toISOString(),
  configBuildSource: "raw_config",
  snapshotId: 1,
  root: {
    peer: "172.28.1.138",
    asNumber: 262663,
    description: "peer",
    group: null,
    connectInterface: null,
    timers: null,
    passwordPresent: false,
    source: "ssh_full_config",
    status: "FOUND",
  },
  families: [],
  effectivePolicies: [
    {
      afiSafi: "ipv4_unicast",
      vrf: null,
      direction: "import",
      policyName: "AS262663-WIFIZAO.BRT-Import-IPv4",
      source: "peer",
      inheritedFromGroup: false,
      inheritedGroup: null,
      status: "FOUND",
    },
  ],
  policies: [],
  dependencies: [
    {
      fromType: "route-policy",
      fromName: "AS262663-WIFIZAO.BRT-Import-IPv4",
      fromNode: 10,
      dependencyType: "ip-prefix",
      dependencyName: "AS262663-IN",
      status: "FOUND",
      evidence: "if-match ip-prefix AS262663-IN",
      source: "ssh_running_config",
      direction: "import",
      afiSafi: "ipv4_unicast",
    },
    {
      fromType: "route-policy",
      fromName: "AS262663-WIFIZAO.BRT-Import-IPv4",
      fromNode: 20,
      dependencyType: "community-filter",
      dependencyName: "CUST-CF",
      status: "FOUND",
      evidence: "if-match community-filter CUST-CF",
      source: "ssh_running_config",
      direction: "import",
      afiSafi: "ipv4_unicast",
    },
  ],
  runtime: null,
  routeTables: {
    received: { requested: false, available: false, prefixCount: null },
    accepted: { requested: false, available: false, prefixCount: null },
    advertised: { requested: false, available: false, prefixCount: null },
  },
  warnings: [],
  rawEvidenceRefs: [],
} satisfies BgpPeerDrilldownResult;

function run(): void {
  assert.equal(env.bgpDrilldownSshDetailEnabled, false, "flag must default false");
  assert.equal(BGP_DRILLDOWN_SSH_DETAIL_DISABLED, "BGP_DRILLDOWN_SSH_DETAIL_DISABLED");

  assert.deepEqual(parseSshDetailRequest({}), {
    includePeerVerbose: true,
    includeRoutePolicies: true,
    includePolicyObjects: true,
  });
  assert.equal(parseSshDetailRequest(null), null);

  assert.equal(isSafePeerIdentifier("172.28.1.138"), true);
  assert.equal(isSafePeerIdentifier("2001:db8::1"), true);
  assert.equal(isSafePeerIdentifier("peer-name_1"), true);
  assert.equal(isSafePeerIdentifier("172.28.1.138;reset"), false);
  assert.equal(isSafePeerIdentifier("peer\nsave"), false);

  assert.equal(isSafePolicyObjectName("AS262663-WIFIZAO.BRT-Import-IPv4"), true);
  assert.equal(isSafePolicyObjectName("POLICY|reset"), false);
  assert.equal(isSafePolicyObjectName("undo"), false);

  assert.equal(isAllowedSshDetailCommand("display bgp peer 172.28.1.138"), true);
  assert.equal(isAllowedSshDetailCommand("display bgp peer 172.28.1.138 verbose"), true);
  assert.equal(isAllowedSshDetailCommand("display route-policy AS262663-WIFIZAO.BRT-Import-IPv4"), true);
  assert.equal(isAllowedSshDetailCommand("display ip ip-prefix AS262663-IN"), true);
  assert.equal(isAllowedSshDetailCommand("display ip community-filter CUST-CF"), true);
  assert.equal(isAllowedSshDetailCommand("display bgp routing-table peer 172.28.1.138 received-routes"), false);
  assert.equal(isAllowedSshDetailCommand("display bgp routing-table peer 172.28.1.138 accepted-routes"), false);
  assert.equal(isAllowedSshDetailCommand("display bgp routing-table peer 172.28.1.138 advertised-routes"), false);
  assert.equal(isAllowedSshDetailCommand("display route-policy X; reboot"), false);

  const built = buildSshDetailCommands(sampleDrilldown, {
    includePeerVerbose: true,
    includeRoutePolicies: true,
    includePolicyObjects: true,
  });
  assert.deepEqual(built.commands, [
    "display bgp peer 172.28.1.138",
    "display bgp peer 172.28.1.138 verbose",
    "display route-policy AS262663-WIFIZAO.BRT-Import-IPv4",
    "display ip ip-prefix AS262663-IN",
    "display ip community-filter CUST-CF",
  ]);

  assert.equal(
    sanitizeSshDetailText("password cipher abc\nsnmp-agent community private"),
    "password cipher <redacted>\nsnmp-agent community <redacted>",
  );

  console.log("BGP drilldown D4 SSH detail selftest PASS");
}

run();
