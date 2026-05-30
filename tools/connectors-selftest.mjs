#!/usr/bin/env node
import assert from "node:assert/strict";
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createPublicKey,
  generateKeyPairSync,
  randomBytes,
  scryptSync,
} from "node:crypto";

function hashConnectorToken(token) {
  return createHash("sha256").update(token).digest("hex");
}

function maskConnectorToken(token) {
  if (token.length <= 12) return "nc_****";
  return `${token.slice(0, 8)}…${token.slice(-4)}`;
}

function assertReadOnlySshCommand(command) {
  const trimmed = command.trim();
  if (!trimmed) throw new Error("empty");
  if (/\bconfigure\s+terminal\b/i.test(trimmed) || /\breload\b/i.test(trimmed)) {
    throw new Error("blocked");
  }
  if (!/^(display|show|ping|tracert|traceroute)/i.test(trimmed)) {
    throw new Error("prefix");
  }
}

function isReadOnlySshCommand(command) {
  try {
    assertReadOnlySshCommand(command);
    return true;
  } catch {
    return false;
  }
}

function generateWireGuardKeyPair() {
  const { privateKey: keyObject } = generateKeyPairSync("x25519");
  const privateJwk = keyObject.export({ format: "jwk" });
  const publicJwk = createPublicKey(keyObject).export({ format: "jwk" });
  return {
    privateKey: Buffer.from(privateJwk.d, "base64url").toString("base64"),
    publicKey: Buffer.from(publicJwk.x, "base64url").toString("base64"),
  };
}

function encryptWireGuardPrivateKey(plain, secret) {
  const salt = randomBytes(16).toString("hex");
  const key = scryptSync(secret, salt, 32);
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `wgenc$${salt}$${iv.toString("hex")}$${tag.toString("hex")}$${encrypted.toString("hex")}`;
}

function decryptWireGuardPrivateKey(payload, secret) {
  const [, salt, ivHex, tagHex, dataHex] = payload.split("$");
  const key = scryptSync(secret, salt, 32);
  const iv = Buffer.from(ivHex, "hex");
  const tag = Buffer.from(tagHex, "hex");
  const data = Buffer.from(dataHex, "hex");
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
}

const token = "nc_test_token_value_1234567890";
assert.equal(hashConnectorToken(token).length, 64);
assert.ok(maskConnectorToken(token).includes("…"));
assert.throws(() => assertReadOnlySshCommand("configure terminal"));
assert.doesNotThrow(() => assertReadOnlySshCommand("display version"));
assert.equal(isReadOnlySshCommand("show ip route"), true);

const keys = generateWireGuardKeyPair();
assert.ok(keys.privateKey.length > 20);
const enc = encryptWireGuardPrivateKey(keys.privateKey, "test-secret-32bytes-minimum-length!!");
assert.equal(decryptWireGuardPrivateKey(enc, "test-secret-32bytes-minimum-length!!"), keys.privateKey);

console.log("connectors-selftest: OK");
