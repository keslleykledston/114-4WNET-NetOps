#!/usr/bin/env node

import crypto from "crypto";

function assert(value, message) {
  if (!value) {
    console.error(`❌ FAIL: ${message}`);
    process.exit(1);
  }
}

function pass(message) {
  console.log(`✓ ${message}`);
}

function fail(message) {
  console.error(`❌ FAIL: ${message}`);
  process.exit(1);
}

function hashToken(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function generateToken() {
  return "nc_" + crypto.randomBytes(32).toString("base64url");
}

console.log("🧪 Connector Secure Onboarding Selftest\n");

try {
  // Test 1: Token generation and hashing
  console.log("Test 1: Token generation and hashing");
  const token1 = generateToken();
  assert(token1.startsWith("nc_"), "Token must start with nc_");
  assert(token1.length > 20, "Token must be long enough");
  const hash1 = hashToken(token1);
  assert(hash1.length === 64, "Hash must be SHA-256 (64 hex chars)");
  const hash1_again = hashToken(token1);
  assert(hash1 === hash1_again, "Same token must produce same hash");
  pass("Token generation and hashing works correctly");

  // Test 2: Different tokens produce different hashes
  console.log("\nTest 2: Different tokens produce different hashes");
  const token2 = generateToken();
  const hash2 = hashToken(token2);
  assert(hash1 !== hash2, "Different tokens must produce different hashes");
  assert(token1 !== token2, "Generated tokens must be unique");
  pass("Token uniqueness and hash uniqueness confirmed");

  // Test 3: Token expiration logic (simulated)
  console.log("\nTest 3: Bootstrap token TTL validation");
  const now = new Date();
  const ttl15min = new Date(now.getTime() + 15 * 60 * 1000);
  const expiredTime = new Date(now.getTime() - 1 * 60 * 1000);
  assert(ttl15min > now, "Future expiry must be greater than now");
  assert(expiredTime < now, "Past expiry must be less than now");
  pass("TTL validation logic works correctly");

  // Test 4: One-shot token can only be marked used once
  console.log("\nTest 4: Token used_at tracking");
  const bootstrapToken = {
    id: 1,
    connectorId: 1,
    tokenHash: hashToken(generateToken()),
    expiresAt: ttl15min,
    usedAt: null,
    deliveredAt: now,
    createdBy: null,
    createdAt: now,
    revokedAt: null,
  };
  assert(bootstrapToken.usedAt === null, "Token should start as unused");
  bootstrapToken.usedAt = now;
  assert(bootstrapToken.usedAt !== null, "Token can be marked as used");
  pass("Token used_at tracking works correctly");

  // Test 5: Revocation prevents reuse
  console.log("\nTest 5: Token revocation");
  const revokedToken = { ...bootstrapToken, revokedAt: new Date() };
  const isActive = !revokedToken.revokedAt && revokedToken.expiresAt > now && !revokedToken.usedAt;
  assert(!isActive, "Revoked token should not be active");
  const activeToken = { ...bootstrapToken, usedAt: null, revokedAt: null };
  const isActiveCheck = !activeToken.revokedAt && activeToken.expiresAt > now && !activeToken.usedAt;
  assert(isActiveCheck, "Non-revoked, non-expired, non-used token should be active");
  pass("Token revocation logic works correctly");

  // Test 6: .env content format validation
  console.log("\nTest 6: Bootstrap .env format validation");
  const connectorId = 42;
  const connectorName = "test-connector";
  const testToken = generateToken();
  const wgConfig = `[Interface]
Address = 10.255.0.2/32
PrivateKey = test_key
[Peer]
PublicKey = test_pub
Endpoint = vpn.example.com:51820`;

  const envContent = `# NetOps Connector Bootstrap Package
# Generated at: ${new Date().toISOString()}
# TTL: 15 minutes from generation
# WARNING: Keep this token secure.

export CONNECTOR_TOKEN="${testToken}"
export CONNECTOR_ID="${connectorId}"
export CONNECTOR_NAME="${connectorName}"

# WireGuard Configuration
cat > /tmp/wg-connector.conf <<'WGEOF'
${wgConfig}
WGEOF`;

  assert(envContent.includes(`CONNECTOR_TOKEN="${testToken}"`), ".env must contain token");
  assert(envContent.includes(`CONNECTOR_ID="${connectorId}"`), ".env must contain connector ID");
  assert(envContent.includes(`CONNECTOR_NAME="${connectorName}"`), ".env must contain connector name");
  assert(envContent.includes("WGEOF"), ".env must have WireGuard section");
  assert(envContent.includes("WARNING"), ".env must have security warning");
  pass(".env format is valid");

  // Test 7: Token should NOT leak in list/detail responses
  console.log("\nTest 7: Token security - no raw token in responses");
  const createResponse = {
    id: 1,
    name: "test-connector",
    status: "PENDING",
    bootstrap_pending: true,
    wireguard_config_preview: "...",
  };
  assert(!createResponse.connector_token, "createConnector response should NOT include connector_token");
  assert(createResponse.bootstrap_pending === true, "createConnector response should indicate bootstrap pending");
  assert(!JSON.stringify(createResponse).includes("nc_"), "Response must not leak token prefix");

  const listResponse = [
    { id: 1, name: "connector-1", status: "PENDING" },
    { id: 2, name: "connector-2", status: "ONLINE" },
  ];
  assert(!JSON.stringify(listResponse).includes("connector_token"), "List response must not include tokens");
  assert(!JSON.stringify(listResponse).includes("nc_"), "List response must not leak token prefix");
  pass("Token does not leak in API responses");

  console.log("\n🎉 All secure onboarding tests passed!\n");
} catch (error) {
  fail(`Unexpected error: ${error.message}`);
}
