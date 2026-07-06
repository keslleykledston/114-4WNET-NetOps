#!/usr/bin/env node
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const {
  inventoryNodeId,
  parseInventoryNodeId,
  physicalInterfaces,
  isInterfaceInUse,
} = await import(pathToFileURL(path.join(
  root,
  "workspace/artifacts/netops-manager/src/lib/network-map/inventory-bridge.ts",
)).href);

assert.equal(inventoryNodeId(42), "device:42");
assert.equal(parseInventoryNodeId("device:42"), 42);
assert.equal(parseInventoryNodeId("d1"), null);

const physical = physicalInterfaces([
  { name: "Eth1", kind: "physical", adminStatus: "up", operStatus: "up", ipv4: [], ipv6: [], source: "snmp" },
  { name: "Vlan1", kind: "vlanif", adminStatus: "up", operStatus: "up", ipv4: [], ipv6: [], source: "snmp" },
]);
assert.equal(physical.length, 1);
assert.equal(physical[0].name, "Eth1");

const links = [
  {
    id: "l1",
    source: "device:1",
    target: "device:2",
    edgeType: "planned",
    intfA: "100GE0/1/0",
    intfB: "100GE0/1/1",
    capacity: "10G",
    status: "PLANNED",
    origin: "planned",
    confidence: 50,
  },
];
assert.equal(isInterfaceInUse(links, "device:1", "100GE0/1/0", "source"), true);
assert.equal(isInterfaceInUse(links, "device:1", "100GE0/1/1", "source"), false);

console.log("network-map-inventory-bridge-selftest: OK");
