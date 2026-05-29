import assert from "node:assert/strict";
import {
  normalizeInterfaceName,
  shouldMarkOperationalStale,
} from "./l2-operational-merge.js";

const liveKeys = new Set(["device:1:l2vc:100"]);

assert.equal(normalizeInterfaceName("GigabitEthernet0/0/1"), normalizeInterfaceName("GE0/0/1"));

assert.equal(
  shouldMarkOperationalStale({
    snmpCollected: true,
    sshOpsCollected: false,
    snmpMatched: false,
    liveMatched: false,
    localInterface: "GE0/0/99",
    circuitType: "vlan_local",
    circuitKey: "x",
    liveKeys,
  }),
  true,
);

assert.equal(
  shouldMarkOperationalStale({
    snmpCollected: true,
    sshOpsCollected: true,
    snmpMatched: true,
    liveMatched: false,
    localInterface: "GE0/0/1",
    circuitType: "l2vc",
    circuitKey: "missing",
    liveKeys,
  }),
  true,
);

assert.equal(
  shouldMarkOperationalStale({
    snmpCollected: true,
    sshOpsCollected: true,
    snmpMatched: false,
    liveMatched: false,
    localInterface: undefined,
    circuitType: "vlan_local",
    circuitKey: "vlan",
    liveKeys,
  }),
  false,
);

console.log("l2-operational-merge.stale.selftest: OK");
