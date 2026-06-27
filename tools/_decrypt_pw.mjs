import { decrypt } from "/app/workspace/artifacts/api-server/src/lib/crypto.ts";
import { writeFileSync } from "node:fs";

const enc = process.env.ENC;
if (!enc) {
  console.error("ENC missing");
  process.exit(1);
}
writeFileSync("/tmp/netops_pw", decrypt(enc), { mode: 0o600 });
