#!/usr/bin/env node
import assert from "node:assert/strict";

const API = process.env.API_BASE_URL || "http://127.0.0.1:8085";
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || "admin@example.com";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "admin123456";

let authToken = "";

async function req(path, opts = {}) {
  const res = await fetch(`${API}${path}`, {
    headers: {
      "Content-Type": "application/json",
      ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
      ...opts.headers,
    },
    credentials: "include",
    ...opts,
  });
  if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`);
  return res.json();
}

async function main() {
  const login = await req("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD }),
  });
  authToken = login.token ?? "";

  await req("/api/topology/rebuild", {
    method: "POST",
    body: JSON.stringify({ scope: "global" }),
  });

  const graph = await req("/api/topology/graph");
  assert(Array.isArray(graph.devices), "devices");
  assert(Array.isArray(graph.links), "links");
  assert(graph.stats && typeof graph.stats.nodeCount === "number", "stats.nodeCount");
  assert(graph.nodes.length === graph.devices.length, "nodes alias");
  assert(graph.edges.length === graph.links.length, "edges alias");

  const scoped = await req("/api/topology/graph?scope=global");
  assert(scoped.generatedAt, "scoped graph");

  console.log("net-loom-map-smoke: OK");
}

main().catch((err) => {
  console.error("FAILED:", err.message);
  process.exit(1);
});
