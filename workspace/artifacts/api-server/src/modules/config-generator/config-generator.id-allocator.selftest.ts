import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

process.env["DATABASE_URL"] ??= "postgres://selftest:selftest@127.0.0.1:1/selftest";
process.env["CONFIG_GENERATOR_ENABLED"] ??= "true";
process.env["CONFIG_WRITE_ENABLED"] ??= "false";

const ranges = await import("./config-generator-id-ranges.js");
const allocator = await import("./config-generator-id-allocator.service.js");
const auth = await import("../../lib/auth.js");
const routes = fs.readFileSync(path.resolve(import.meta.dirname, "config-generator.routes.ts"), "utf8");

assert.equal(ranges.resolveVlanRangeKeyForServiceType("l2vpn_vlan"), "l2vpn");
assert.equal(ranges.resolveVlanRangeKeyForServiceType("bgp_customer_community"), "l3vpn");
assert.equal(ranges.resolveVlanRangeKeyForServiceType("datacenter"), "datacenter");
assert.equal(ranges.resolveVlanRangeKeyForServiceType("general"), "general_use");

const l2Range = ranges.getVlanRangeForServiceType("l2vpn_vlan");
assert.ok(l2Range);
assert.equal(l2Range!.rangeStart, 600);
assert.equal(l2Range!.rangeEnd, 799);

const l3Range = ranges.getVlanRangeForServiceType("bgp_customer_community");
assert.equal(l3Range!.rangeStart, 800);
assert.equal(l3Range!.rangeEnd, 999);

const dcRange = ranges.getVlanRangeForServiceType("datacenter");
assert.equal(dcRange!.rangeStart, 1000);
assert.equal(dcRange!.rangeEnd, 1200);

const generalRange = ranges.getVlanRangeForServiceType("general");
assert.equal(generalRange!.rangeStart, 1201);
assert.equal(generalRange!.rangeEnd, 4000);

assert.equal(ranges.isVlanGloballyBlocked(1), true);
assert.equal(ranges.isVlanGloballyBlocked(99, "l2vpn_vlan"), true);
assert.equal(ranges.isVlanGloballyBlocked(99, "oob_management"), false);
assert.equal(ranges.isVlanGloballyBlocked(4001), true);

const used = new Set([600, 601, 602]);
const free = allocator.nextFreeIds(used, 600, 799, 4);
assert.deepEqual(free, [603, 604, 605, 606]);
assert.equal(free.every((id) => !used.has(id)), true);

assert.equal(ranges.isVlanOutsidePreferredRange(850, "l2vpn_vlan"), true);
assert.equal(ranges.isVlanOutsidePreferredRange(650, "l2vpn_vlan"), false);

const intraRange = ranges.getVlanRangeForServiceType("intra_site_link");
assert.equal(intraRange!.rangeStart, 2);
assert.equal(intraRange!.rangeEnd, 98);

const interRange = ranges.getVlanRangeForServiceType("inter_site_link");
assert.equal(interRange!.rangeStart, 100);
assert.equal(interRange!.rangeEnd, 199);
assert.equal(interRange!.untaggedRequired, true);

assert.equal(allocator.explainSuggestion({ idType: "subinterface", value: 603, serviceType: "l2vpn_vlan" }).includes("603"), true);
assert.equal(allocator.explainSuggestion({ idType: "l2vc", value: 603, serviceType: "l2vpn_vlan", scope: "tenant" }).includes("tenant"), true);

const engineSource = fs.readFileSync(path.resolve(import.meta.dirname, "config-generator.engine.ts"), "utf8");
assert(engineSource.includes("isVlanGloballyBlocked"), "engine must block reserved VLANs");
assert(engineSource.includes("isVlanOutsidePreferredRange"), "engine must warn outside preferred range");

const inventorySource = fs.readFileSync(path.resolve(import.meta.dirname, "config-generator-id-inventory.service.ts"), "utf8");
assert(inventorySource.includes("collectedConfigsTable"), "inventory reads collected_configs");
assert(inventorySource.includes("discoverySnapshotsTable"), "inventory reads discovery_snapshots");
assert(!inventorySource.includes("ssh"), "inventory must not collect via SSH");
assert(!inventorySource.includes("snmp.createSession"), "inventory must not open SNMP sessions");

const diffSource = fs.readFileSync(path.resolve(import.meta.dirname, "config-generator-diff.service.ts"), "utf8");
assert(diffSource.includes("loadLatestBaseline"), "diff/precheck baseline preserved");

const catalog = allocator.listConfigGeneratorIdRangesCatalog();
assert.ok(catalog.ranges.length >= 10);
assert.equal(catalog.version, "2026.05");

assert(routes.includes("/config-generator/id-ranges"));
assert(routes.includes("/config-generator/id-inventory/refresh"));
assert(routes.includes("/config-generator/id-allocator/suggest"));
assert(routes.includes("/config-generator/id-allocator/validate"));
assert(routes.includes("configGenerator.validate"), "refresh requires validate permission");
assert(routes.includes("writeDisabledResponse()"), "execute must stay write-blocked");

const viewerPerms = auth.getDefaultPermissions("viewer");
assert.equal(viewerPerms.configGenerator?.validate, false);
assert.equal(viewerPerms.configGenerator?.render, false);

const operatorPerms = auth.getDefaultPermissions("operator");
assert.equal(operatorPerms.configGenerator?.validate, true);

const suggestionsSource = fs.readFileSync(path.resolve(import.meta.dirname, "config-generator-suggestions.service.ts"), "utf8");
assert(suggestionsSource.includes("suggestNextId"), "suggestions must integrate id allocator");
assert(suggestionsSource.includes("id_allocator"), "fieldOrigins must support id_allocator");

const serviceSource = fs.readFileSync(path.resolve(import.meta.dirname, "config-generator.service.ts"), "utf8");
assert(serviceSource.includes("validateRequestedId"), "render/validate must call id allocator validation");

const uiSource = fs.readFileSync(path.resolve(import.meta.dirname, "../../../../netops-manager/src/pages/config-generator.tsx"), "utf8");
assert(uiSource.includes("ConfigGeneratorIdAllocatorPanel"), "UI must render id allocator panel");

console.log("config-generator.id-allocator.selftest: OK");
