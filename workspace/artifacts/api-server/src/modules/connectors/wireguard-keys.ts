import {
  createCipheriv,
  createDecipheriv,
  createPublicKey,
  generateKeyPairSync,
  randomBytes,
  scryptSync,
} from "node:crypto";

/** Generate WireGuard-compatible base64 key pair (X25519). */
export function generateWireGuardKeyPair(): { privateKey: string; publicKey: string } {
  const { privateKey: keyObject } = generateKeyPairSync("x25519");
  const privateJwk = keyObject.export({ format: "jwk" }) as { d: string };
  const publicJwk = createPublicKey(keyObject).export({ format: "jwk" }) as { x: string };
  const privateKey = Buffer.from(privateJwk.d, "base64url").toString("base64");
  const publicKey = Buffer.from(publicJwk.x, "base64url").toString("base64");
  return { privateKey, publicKey };
}

export function encryptWireGuardPrivateKey(plain: string, secret: string): string {
  const salt = randomBytes(16).toString("hex");
  const key = scryptSync(secret, salt, 32);
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `wgenc$${salt}$${iv.toString("hex")}$${tag.toString("hex")}$${encrypted.toString("hex")}`;
}

export function decryptWireGuardPrivateKey(payload: string, secret: string): string {
  const [scheme, salt, ivHex, tagHex, dataHex] = payload.split("$");
  if (scheme !== "wgenc" || !salt || !ivHex || !tagHex || !dataHex) {
    throw new Error("Invalid encrypted WireGuard private key format");
  }
  const key = scryptSync(secret, salt, 32);
  const iv = Buffer.from(ivHex, "hex");
  const tag = Buffer.from(tagHex, "hex");
  const data = Buffer.from(dataHex, "hex");
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
}
