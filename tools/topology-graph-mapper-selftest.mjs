#!/usr/bin/env node
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const { mapTopologyToGraph, filterGraphByScope } = await import(
  pathToFileURL(path.join(
    rootDir,
    "workspace/artifacts/api-server/src/modules/topology/topology-graph.mapper.ts",
  )).href
);

const deviceNode = {
  id: 1,
  nodeType: "DEVICE",
  refId: 10,
  label: "PE1",
  metadataJson: {
    hostname: "PE1",
    vendor: "Huawei",
    platform: "NE8000",
    site: "Manaus",
    role: "Core",
    status: "up",
    ipAddress: "10.0.0.1",
  },
  createdAt: new Date(),
  updatedAt: new Date(),
};

const peerNode = {
  id: 2,
  nodeType: "BGP_PEER",
  refId: 10,
  label: "10.0.0.2 (AS65001)",
  metadataJson: {
    deviceId: 10,
    peerIp: "10.0.0.2",
    remoteAs: "65001",
    state: "Established",
    role: "provider",
  },
  createdAt: new Date(),
  updatedAt: new Date(),
};

const remoteDevice = {
  id: 3,
  nodeType: "DEVICE",
  refId: 20,
  label: "PE2",
  metadataJson: {
    hostname: "PE2",
    vendor: "Huawei",
    platform: "NE8000",
    site: "Boa Vista",
    role: "Backbone",
    status: "up",
    ipAddress: "10.0.0.2",
  },
  createdAt: new Date(),
  updatedAt: new Date(),
};

const l2A = {
  id: 4,
  nodeType: "L2_CIRCUIT",
  refId: 100,
  label: "VC-100",
  metadataJson: { deviceId: 10, vcId: "100", localInterface: "Eth1", operStatus: "up" },
  createdAt: new Date(),
  updatedAt: new Date(),
};

const l2B = {
  id: 5,
  nodeType: "L2_CIRCUIT",
  refId: 101,
  label: "VC-100-Z",
  metadataJson: { deviceId: 20, vcId: "100", localInterface: "Eth2", operStatus: "up" },
  createdAt: new Date(),
  updatedAt: new Date(),
};

const edges = [
  {
    id: 1,
    sourceNodeId: 1,
    targetNodeId: 2,
    edgeType: "HAS_BGP_PEER",
    confidence: 100,
    metadataJson: { peerIp: "10.0.0.2" },
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  {
    id: 2,
    sourceNodeId: 4,
    targetNodeId: 5,
    edgeType: "CONNECTED_TO",
    confidence: 90,
    metadataJson: { vcId: "100" },
    createdAt: new Date(),
    updatedAt: new Date(),
  },
];

const deviceIndex = [
  { id: 10, ipAddress: "10.0.0.1", hostname: "PE1" },
  { id: 20, ipAddress: "10.0.0.2", hostname: "PE2" },
];

const graph = mapTopologyToGraph(
  [deviceNode, peerNode, remoteDevice, l2A, l2B],
  edges,
  deviceIndex,
);

assert.ok(graph.devices.length >= 2, "expected device nodes");
assert.ok(graph.links.some((l) => l.edgeType === "bgp"), "expected bgp link");
assert.ok(graph.links.some((l) => l.edgeType === "service"), "expected l2 service link");
assert.equal(graph.nodes.length, graph.devices.length);
assert.equal(graph.edges.length, graph.links.length);

const siteFiltered = filterGraphByScope(graph, "site", "Manaus");
assert.ok(siteFiltered.devices.every((d) => d.site === "Manaus" || d.type === "bgp"));

console.log("topology-graph-mapper-selftest: OK");
