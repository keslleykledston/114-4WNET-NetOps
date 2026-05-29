import { writeFileSync, mkdirSync } from "fs";
import { join } from "path";
import pg from "pg";
import { decrypt } from "/app/workspace/artifacts/api-server/src/lib/crypto.js";
import { runSSHCommands } from "/app/workspace/artifacts/api-server/src/lib/ssh.js";

const OUT = "/tmp/l2-manual-device-1";
const HOSTNAME = process.argv[2] ?? "4WNET-BVA-BRT-RX";

const COMMANDS = [
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

function redact(text) {
  return text
    .replace(/(password|community|token|secret|private-key)\s*[:=]\s*\S+/gi, "$1=<redacted>")
    .replace(/snmp-agent\s+community\s+\S+/gi, "snmp-agent community <redacted>")
    .replace(/(cipher|simple)\s+\S+/gi, "$1 <redacted>");
}

function header(device, command) {
  return [
    `# device_id=${device.id} hostname=${device.hostname}`,
    `# collected_at=${new Date().toISOString()}`,
    `# collector=noc_readonly_script`,
    `# command=${command}`,
    "",
  ].join("\n");
}

async function main() {
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  const { rows } = await client.query(
    "SELECT id, hostname, ip_address, ssh_port, username, password_encrypted FROM devices WHERE hostname = $1",
    [HOSTNAME],
  );
  await client.end();
  if (rows.length === 0) throw new Error(`Device not found: ${HOSTNAME}`);
  const device = rows[0];

  const ssh = {
    host: device.ip_address,
    port: device.ssh_port ?? 22,
    username: device.username,
    password: decrypt(device.password_encrypted),
  };

  console.log(`Collecting ${device.hostname} (${device.ip_address}) id=${device.id}`);
  mkdirSync(OUT, { recursive: true });

  for (const [cmd, file] of COMMANDS) {
    console.log(`CMD: ${cmd}`);
    let output = "";
    let usedCmd = cmd;
    try {
      const [result] = await runSSHCommands(ssh, [cmd]);
      output = result.output ?? "";
      if (file.includes("l2_include") && output.trim().length < 30) {
        console.log("  fallback filter on current-configuration");
        const [fb] = await runSSHCommands(ssh, ["display current-configuration"]);
        output = (fb.output ?? "")
          .split(/\r?\n/)
          .filter((line) => /vsi|l2vc|xconnect|vlan-type|dot1q/i.test(line))
          .join("\n");
        usedCmd = "display current-configuration (filtered)";
      }
    } catch (err) {
      output = `# collection_failed: ${err instanceof Error ? err.message : String(err)}\n`;
    }
    writeFileSync(join(OUT, file), header(device, usedCmd) + redact(output));
    console.log(`  saved ${file}`);
  }
  console.log(`OUTPUT=${OUT}`);
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
