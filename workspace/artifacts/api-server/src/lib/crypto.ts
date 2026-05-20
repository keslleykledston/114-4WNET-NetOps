import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "crypto";

const SECRET = process.env["SESSION_SECRET"] ?? "netops-default-secret-key-32bytes!";
const KEY = scryptSync(SECRET, "netops-salt", 32);

export function encrypt(text: string): string {
  const iv = randomBytes(16);
  const cipher = createCipheriv("aes-256-cbc", KEY, iv);
  const encrypted = Buffer.concat([cipher.update(text, "utf8"), cipher.final()]);
  return iv.toString("hex") + ":" + encrypted.toString("hex");
}

export function decrypt(encryptedText: string): string {
  const [ivHex, dataHex] = encryptedText.split(":");
  if (!ivHex || !dataHex) throw new Error("Invalid encrypted format");
  const iv = Buffer.from(ivHex, "hex");
  const data = Buffer.from(dataHex, "hex");
  const decipher = createDecipheriv("aes-256-cbc", KEY, iv);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
}
