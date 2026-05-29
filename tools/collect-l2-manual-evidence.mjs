#!/usr/bin/env node
/**
 * NOC read-only manual L2 evidence collection — single Huawei device.
 * Usage: DATABASE_URL=... node tools/collect-l2-manual-evidence.mjs [device_id|hostname]
 */
import { writeFileSync, mkdirSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import pg from "pg";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, "..");
const OUT_DIR = join(REPO_ROOT, "reports/l2-circuits/manual/device-1");

const COMMANDS = [
  {
    cmd: "display mpls l2vc verbose",
    file: "display_mpls_l2vc_verbose.txt",
  },
  {
    cmd: "display vsi verbose",
    file: "display_vsi_verbose.txt",
  },
  {
    cmd: "display current-configuration | include vsi|l2vc|xconnect|vlan-type|dot1q",
    file: "display_current_config_l2_include.txt",
    fallbackCmd: "display current-configuration",
    fallbackFilter: /vsi|l2vc|xconnect|vlan-type|dot1q/i,
  },
  {
    cmd: "display current-configuration interface",
    file: "display_current_config_interface.txt",
  },
  {
    cmd: "display interface description",
    file: "display_interface_description.txt",
  },
  {
    cmd: "display mac-address vsi",
    file: "display_mac_address_vsi.txt",
  },
  {
    cmd: "display mac-address vlan",
    file: "display_mac_address_vlan.txt",
  },
];

function redactOutput(text) {
  return text
    .replace(/(password|community|token|secret|private-key)\s*[:=]\s*\S+/gi, "$1=<redacted>")
    .replace(/snmp-agent\s+community\s+\S+/gi, "snmp-agent community <redacted>")
    .replace(/(cipher|simple)\s+\S+/gi, "$1 <redacted>");
}

function fileHeader(device, command) {
  return [
    `# device_id=${device.id} hostname=${device.hostname}`,
    `# collected_at=${new Date().toISOString()}`,
    `# collector=noc_readonly_script`,
    `# command=${command}`,
    "",
  ].join("\n");
}

async function loadDevice(client, arg) {
  const byId = /^\d+$/.test(arg ?? "");
  const q = byId
    ? "SELECT id, hostname, ip_address, ssh_port, username, password_encrypted, vendor, platform FROM devices WHERE id = $1"
    : "SELECT id, hostname, ip_address, ssh_port, username, password_encrypted, vendor, platform FROM devices WHERE hostname = $1";
  const { rows } = await client.query(q, [arg ?? "1"]);
  if (rows.length === 0) throw new Error(`Device not found: ${arg ?? "1"}`);
  return rows[0];
}

async function decryptPassword(encrypted) {
  const { decrypt } = await import(
    join(REPO_ROOT, "workspace/artifacts/api-server/src/lib/crypto.ts")
  );
  return decrypt(encrypted);
}

async function runSshCommands(sshConfig, commands) {
  const { runSSHCommands } = await import(
    join(REPO_ROOT, "workspace/artifacts/api-server/src/lib/ssh.ts")
  );
  return runSSHCommands(sshConfig, commands);
}

async function main() {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    console.error("DATABASE_URL required");
    process.exit(1);
  }

  const target = process.argv[2] ?? "4WNET-BVA-BRT-RX";
  const pgClient = new pg.Client({ connectionString: dbUrl });
  await pgClient.connect();

  let device;
  try {
    device = await loadDevice(pgClient, target);
  } finally {
    await pgClient.end();
  }

  if (!device.ip_address?.trim()) throw new Error("Device missing ip_address");
  if (!device.password_encrypted?.trim()) throw new Error("Device missing password_encrypted");

  const password = await decryptPassword(device.password_encrypted);
  const sshConfig = {
    host: device.ip_address.trim(),
    port: device.ssh_port ?? 22,
    username: device.username.trim(),
    password,
  };

  console.log(`Collecting L2 evidence: ${device.hostname} (${device.ip_address}) device_id=${device.id}`);

  mkdirSync(OUT_DIR, { recursive: true });

  for (const item of COMMANDS) {
    console.log(`Running: ${item.cmd}`);
    let output = "";
    let usedCommand = item.cmd;

    try {
      const [result] = await runSshCommands(sshConfig, [item.cmd]);
      output = result.output || "";
      if (result.error) output += `\n# ssh_error: ${result.error}\n`;

      if (item.fallbackCmd && (!output.trim() || /Error:|Invalid|Unrecognized/i.test(output))) {
        console.log(`  Fallback: ${item.fallbackCmd} + local filter`);
        const [fb] = await runSshCommands(sshConfig, [item.fallbackCmd]);
        const lines = (fb.output || "").split(/\r?\n/);
        output = lines.filter((l) => item.fallbackFilter.test(l)).join("\n");
        usedCommand = `${item.fallbackCmd} (filtered: vsi|l2vc|xconnect|vlan-type|dot1q)`;
      }
    } catch (err) {
      output = `# collection_failed: ${err instanceof Error ? err.message : String(err)}\n`;
      console.error(`  FAILED: ${err instanceof Error ? err.message : err}`);
    }

    const sanitized = redactOutput(output);
    const body = fileHeader(device, usedCommand) + sanitized;
    const outPath = join(OUT_DIR, item.file);
    writeFileSync(outPath, body, "utf8");
    const lineCount = sanitized.split(/\r?\n/).filter(Boolean).length;
    console.log(`  Saved ${item.file} (${lineCount} lines, ${body.length} bytes)`);
  }

  console.log("Done. Review files for redaction before commit.");
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
