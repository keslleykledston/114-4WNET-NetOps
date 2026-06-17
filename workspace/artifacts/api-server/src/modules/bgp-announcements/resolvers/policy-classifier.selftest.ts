import assert from "node:assert/strict";
import { classifyPolicy, shouldIncludeInAnnouncementMatrix } from "./policy-classifier.js";

const parsedConfig = {
  dependency_graph: {
    bgp_policy_bindings: [
      {
        routePolicy: "AS262663-WIFIZAO.BRT-Import-IPv4",
        consumerType: "bgp_peer",
        direction: "import",
      },
      {
        routePolicy: "AS262663-WIFIZAO.BRT-Export-IPv4",
        consumerType: "bgp_peer",
        direction: "export",
      },
    ],
  },
} as any;

const networks = [
  { prefix: "10.0.0.0/24", family: "ipv4", routePolicyName: "ORIGIN-FOO", raw: "" },
] as any;

function run(): void {
  const origin = classifyPolicy("ORIGIN-FOO", networks, parsedConfig);
  assert.equal(origin.policyClass, "origin_target");
  assert.equal(shouldIncludeInAnnouncementMatrix(origin), true);

  const customerImport = classifyPolicy("AS262663-WIFIZAO.BRT-Import-IPv4", [], parsedConfig);
  assert.equal(customerImport.policyClass, "customer_import_target");
  assert.equal(shouldIncludeInAnnouncementMatrix(customerImport), true);

  const customerExport = classifyPolicy("AS262663-WIFIZAO.BRT-Export-IPv4", [], parsedConfig);
  assert.equal(customerExport.policyClass, "customer_export");
  assert.equal(shouldIncludeInAnnouncementMatrix(customerExport), false);

  const upstreamExport = classifyPolicy("C01-EXPORT", [], parsedConfig);
  assert.equal(upstreamExport.policyClass, "upstream_export_audit");
  assert.equal(shouldIncludeInAnnouncementMatrix(upstreamExport), false);

  console.log("BGP policy classifier selftest PASS");
}

run();
