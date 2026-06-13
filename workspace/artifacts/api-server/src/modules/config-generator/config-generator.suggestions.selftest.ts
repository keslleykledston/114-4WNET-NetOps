import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const catalog = await import("./config-generator.catalog.js");
const engine = await import("./config-generator.engine.js");
const suggestions = await import("./config-generator-suggestions.service.js");

const globalRows = suggestions.buildGlobalDependencyRows(
  "ip-prefix RFC5735\nroute-policy WORLD_BASELINE\ncommunity-filter baseline\n",
  {
    communities: [{ name: "65000:1" }],
    communityLists: [{ name: "WORLD" }],
    prefixLists: [{ name: "RFC5735" }],
    asPathFilters: [],
    extcommunityFilters: [],
    aclFilters: [],
  } as never,
  ["65000:1"],
);

assert.equal(globalRows.some((row) => row.classification === "global"), true);
assert.equal(globalRows.some((row) => row.name === "RFC5735" && row.status === "present"), true);

const fieldOrigins = suggestions.buildFieldOriginsFromSuggestions({
  customerName: "CLIENTE_X",
  localAsn: 273309,
  ipv4Prefixes: ["203.0.113.0/24"],
});
assert.equal(fieldOrigins.customerName, "manual");
assert.equal(fieldOrigins.localAsn, "manual");
assert.equal(fieldOrigins.ipv4Prefixes, "manual");
assert.deepEqual(suggestions.buildFieldOriginsFromSuggestions({}), {});

const compatibility = engine.validateConfigGeneratorTemplateCompatibility({
  vendor: "cisco",
  platform: "ios",
  device: {
    deviceId: 1,
    hostname: "PE-01",
    vendor: "huawei",
    platform: "vrp",
    tenantId: 10,
    tenantName: "Tenant A",
    connectorId: null,
    connectorGroupId: null,
    latestConfig: null,
    interfaceNames: [],
    routePolicyNames: [],
    interfaceStates: [],
  },
});
assert.equal(compatibility.length > 0, true);
assert.equal(compatibility[0]?.code, "TEMPLATE_VENDOR_MISMATCH");

const sanitized = engine.sanitizeConfigGeneratorValueForStorage({
  md5: "secret-md5",
  nested: { password: "abc", token: "xyz" },
});
assert.equal((sanitized as { md5?: string }).md5, "<SECRET_NOT_STORED>");
assert.equal(((sanitized as { nested?: { password?: string } }).nested?.password), "<SECRET_NOT_STORED>");

assert.equal(catalog.CONFIG_GENERATOR_GLOBAL_OBJECTS.includes("RFC5735"), true);

const routeSource = fs.readFileSync(path.resolve(process.cwd(), "../artifacts/api-server/src/modules/config-generator/config-generator.routes.ts"), "utf8");
assert(routeSource.includes("suggestions/scope"), "suggestions route missing");
assert(routeSource.includes("env.configGeneratorEnabled"), "suggestions route missing feature flag gate");

console.log("config-generator.suggestions.selftest: OK");
