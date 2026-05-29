import { readFileSync, writeFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { db, devicesTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { decrypt } from "../src/lib/crypto.js";
import { runSSHCommands } from "../src/lib/ssh.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dirname, "../../../../reports/l2-circuits/manual/device-1");

function redact(text: string): string {
  return text
    .replace(/(password|community|token|secret|private-key)\s*[:=]\s*\S+/gi, "$1=<redacted>")
    .replace(/snmp-agent\s+community\s+\S+/gi, "snmp-agent community <redacted>")
    .replace(/(cipher|simple)\s+\S+/gi, "$1 <redacted>");
}

async function main() {
  const [device] = await db.select().from(devicesTable).where(eq(devicesTable.hostname, "4WNET-BVA-BRT-RX"));
  if (!device) throw new Error("device not found");

  const ssh = {
    host: device.ipAddress,
    port: device.sshPort,
    username: device.username,
    password: decrypt(device.passwordEncrypted),
  };

  const retries: Array<[string, string[]]> = [
    ["display_mpls_l2vc_verbose.txt", ["display mpls l2vc verbose", "display mpls l2vc", "display mpls l2vpn l2vc-info"]],
    ["display_vsi_verbose.txt", ["display vsi verbose", "display vsi"]],
    ["display_mac_address_vsi.txt", ["display mac-address vsi", "display mac-address bridge-domain"]],
    ["display_mac_address_vlan.txt", ["display mac-address vlan", "display mac-address summary"]],
  ];

  for (const [file, cmds] of retries) {
    const path = join(OUT, file);
    const header = readFileSync(path, "utf8").split("\n\n")[0];
    let body = header + "\n\n";
    for (const cmd of cmds) {
      try {
        const [r] = await runSSHCommands(ssh, [cmd]);
        body += `--- command: ${cmd} ---\n${redact(r.output ?? r.error ?? "")}\n\n`;
      } catch (err) {
        body += `--- command: ${cmd} ---\n# failed: ${err instanceof Error ? err.message : String(err)}\n\n`;
      }
    }
    writeFileSync(path, body);
    console.log("updated", file);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
