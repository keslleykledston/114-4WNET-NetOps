import { writeFileSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { db, devicesTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { decrypt } from "../src/lib/crypto.js";
import { runSSHCommands } from "../src/lib/ssh.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dirname, "../../../../reports/l2-circuits/manual/device-1");

const COMMANDS: Array<[string, string]> = [
  ["display mpls l2vc verbose", "display_mpls_l2vc_verbose.txt"],
  ["display vsi verbose", "display_vsi_verbose.txt"],
  [
    "display current-configuration | include vsi|l2vc|xconnect|vlan-type|dot1q",
    "display_current_config_l2_include.txt",
  ],
  ["display current-configuration interface", "display_current_config_interface.txt"],
  ["display interface description", "display_interface_description.txt"],
  ["display mac-address vsi", "display_mac_address_vsi.txt"],
  ["display mac-address vlan", "display_mac_address_vlan.txt"],
];

function redact(text: string): string {
  return text
    .replace(/(password|community|token|secret|private-key)\s*[:=]\s*\S+/gi, "$1=<redacted>")
    .replace(/snmp-agent\s+community\s+\S+/gi, "snmp-agent community <redacted>")
    .replace(/(cipher|simple)\s+\S+/gi, "$1 <redacted>");
}

function header(device: { id: number; hostname: string }, command: string): string {
  return [
    `# device_id=${device.id} hostname=${device.hostname}`,
    `# collected_at=${new Date().toISOString()}`,
    `# collector=noc_readonly_script`,
    `# command=${command}`,
    "",
  ].join("\n");
}

async function main() {
  const hostname = process.argv[2] ?? "4WNET-BVA-BRT-RX";
  const [device] = await db.select().from(devicesTable).where(eq(devicesTable.hostname, hostname));
  if (!device) throw new Error(`Device not found: ${hostname}`);

  const ssh = {
    host: device.ipAddress,
    port: device.sshPort,
    username: device.username,
    password: decrypt(device.passwordEncrypted),
  };

  console.log(`Collecting ${device.hostname} (${device.ipAddress}) device_id=${device.id}`);
  mkdirSync(OUT, { recursive: true });

  for (const [cmd, file] of COMMANDS) {
    console.log(`CMD: ${cmd}`);
    let output = "";
    let usedCmd = cmd;

    try {
      const [result] = await runSSHCommands(ssh, [cmd]);
      output = result.output ?? "";
      if (result.error) output += `\n# ssh_error: ${result.error}\n`;

      if (file.includes("l2_include") && output.trim().length < 30) {
        console.log("  fallback: display current-configuration + filter");
        const [fb] = await runSSHCommands(ssh, ["display current-configuration"]);
        output = (fb.output ?? "")
          .split(/\r?\n/)
          .filter((line) => /vsi|l2vc|xconnect|vlan-type|dot1q/i.test(line))
          .join("\n");
        usedCmd = "display current-configuration (filtered: vsi|l2vc|xconnect|vlan-type|dot1q)";
      }
    } catch (err) {
      output = `# collection_failed: ${err instanceof Error ? err.message : String(err)}\n`;
    }

    const body = header(device, usedCmd) + redact(output);
    writeFileSync(join(OUT, file), body, "utf8");
    console.log(`  saved ${file} (${body.length} bytes)`);
  }

  console.log(`Done: ${OUT}`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
