#!/usr/bin/env node

import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const { buildAnnouncementTimelapse } = await import(path.join(rootDir, "workspace/artifacts/api-server/src/modules/bgp-announcements/bgp-announcements.timeline-utils.ts"));

const timeline = buildAnnouncementTimelapse([
  {
    id: 1,
    deviceId: 44,
    targetPolicyName: "ORIGIN-DEMO",
    family: "ipv4",
    prefix: "45.169.160.0/23",
    upstreamCircuitId: "10",
    upstreamName: "C10",
    eventType: "cell_state_changed",
    oldState: "—",
    newState: "On",
    oldCommunity: null,
    newCommunity: "64777:51001",
    snapshotId: 101,
    detectedAt: "2026-06-01T08:00:00.000Z",
    createdAt: "2026-06-01T08:00:00.000Z",
  },
  {
    id: 2,
    deviceId: 44,
    targetPolicyName: "ORIGIN-DEMO",
    family: "ipv4",
    prefix: "45.169.160.0/23",
    upstreamCircuitId: "10",
    upstreamName: "C10",
    eventType: "cell_state_changed",
    oldState: "On",
    newState: "P1",
    oldCommunity: "64777:51001",
    newCommunity: "64777:51002",
    snapshotId: 102,
    detectedAt: "2026-06-03T11:20:00.000Z",
    createdAt: "2026-06-03T11:20:00.000Z",
  },
  {
    id: 3,
    deviceId: 44,
    targetPolicyName: "ORIGIN-DEMO",
    family: "ipv4",
    prefix: "45.169.160.0/23",
    upstreamCircuitId: "10",
    upstreamName: "C10",
    eventType: "cell_state_changed",
    oldState: "P1",
    newState: "P2",
    oldCommunity: "64777:51002",
    newCommunity: "64777:51003",
    snapshotId: 103,
    detectedAt: "2026-06-05T15:40:00.000Z",
    createdAt: "2026-06-05T15:40:00.000Z",
  },
  {
    id: 4,
    deviceId: 44,
    targetPolicyName: "ORIGIN-DEMO",
    family: "ipv4",
    prefix: "45.169.160.0/23",
    upstreamCircuitId: "10",
    upstreamName: "C10",
    eventType: "cell_state_changed",
    oldState: "P2",
    newState: "Off",
    oldCommunity: "64777:51003",
    newCommunity: "64777:51067",
    snapshotId: 104,
    detectedAt: "2026-06-06T09:10:00.000Z",
    createdAt: "2026-06-06T09:10:00.000Z",
  },
]);

assert.equal(timeline[0].newState, "On");
assert.equal(timeline[1].newState, "P1");
assert.equal(timeline[2].newState, "P2");
assert.equal(timeline[3].newState, "Off");
assert.equal(timeline.every((event) => typeof event.snapshotId === "number"), true);

console.log(JSON.stringify({
  ok: true,
  timeline,
}, null, 2));
console.log("bgp-announcement-timelapse-selftest: PASS");
