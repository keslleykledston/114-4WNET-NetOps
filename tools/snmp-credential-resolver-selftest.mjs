#!/usr/bin/env node
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const {
  resolveSnmpCredential,
  describeSnmpCredentialResolution,
} = await import(
  path.join(
    root,
    "workspace/artifacts/api-server/src/modules/netops/snmp/snmp-credential-resolver.ts"
  ),
);

// A) device.snmp_community -> source=device, length>0
{
  const res = resolveSnmpCredential({
    device: { snmpCommunity: "public", snmpProfileId: null },
    env: { snmpCommunity: "ignored", labFallbackAllowed: true },
    nodeEnv: "production",
  });
  assert.equal(res.source, "device");
  assert.equal(res.available, true);
  assert.equal(res.length, "public".length);

  const described = describeSnmpCredentialResolution(res);
  assert.equal(described.source, "device");
  assert.equal(described.available, true);
  assert.equal(described.length, "public".length);
  assert.equal(described.errorCode, undefined);
  assert.ok(!JSON.stringify(described).toLowerCase().includes("value"));
}

// B) device empty + env lab -> source=env
{
  const res = resolveSnmpCredential({
    device: { snmpCommunity: "", snmpProfileId: null },
    env: { snmpCommunity: "labCommunity", labFallbackAllowed: true },
    nodeEnv: "production",
  });
  assert.equal(res.source, "env");
  assert.equal(res.available, true);
  assert.equal(res.length, "labCommunity".length);
}

// C) production + env fallback forbidden -> no env use
{
  const res = resolveSnmpCredential({
    device: { snmpCommunity: "", snmpProfileId: null },
    env: { snmpCommunity: "labCommunity", labFallbackAllowed: false },
    nodeEnv: "production",
  });
  assert.equal(res.source, "none");
  assert.equal(res.available, false);
  assert.equal(res.length, 0);
  assert.equal(res.errorCode, "SNMP_CREDENTIAL_NOT_CONFIGURED");
}

// D) profile disabled -> SNMP_CREDENTIAL_DISABLED
{
  const res = resolveSnmpCredential({
    device: { snmpCommunity: "", snmpProfileId: 1 },
    profiles: {
      credentialProfilesById: {
        "1": { id: 1, enabled: false, snmpCommunity: "public" },
      },
    },
    nodeEnv: "production",
  });
  assert.equal(res.source, "device_profile");
  assert.equal(res.available, false);
  assert.equal(res.errorCode, "SNMP_CREDENTIAL_DISABLED");
}

// E) profile id inexistente -> SNMP_CREDENTIAL_PROFILE_NOT_FOUND
{
  const res = resolveSnmpCredential({
    device: { snmpCommunity: "", snmpProfileId: 999 },
    profiles: {
      credentialProfilesById: {},
    },
    nodeEnv: "production",
  });
  assert.equal(res.source, "device_profile");
  assert.equal(res.available, false);
  assert.equal(res.errorCode, "SNMP_CREDENTIAL_PROFILE_NOT_FOUND");
}

// F) none -> SNMP_CREDENTIAL_NOT_CONFIGURED
{
  const res = resolveSnmpCredential({
    device: { snmpCommunity: "", snmpProfileId: null },
    tenant: { snmpProfileId: null },
    env: { snmpCommunity: null, labFallbackAllowed: false },
    nodeEnv: "production",
  });
  assert.equal(res.source, "none");
  assert.equal(res.available, false);
  assert.equal(res.errorCode, "SNMP_CREDENTIAL_NOT_CONFIGURED");
}

// G) describe nunca contém value
{
  const res = resolveSnmpCredential({
    device: { snmpCommunity: "secretValue", snmpProfileId: null },
    nodeEnv: "production",
  });
  const described = describeSnmpCredentialResolution(res);
  assert.equal(described.source, "device");
  assert.equal((described).value, undefined);
  assert.equal((described).errorCode, undefined);
}

console.log("snmp-credential-resolver-selftest: PASS");
