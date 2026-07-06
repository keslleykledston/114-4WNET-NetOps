import { Client } from "ssh2";
import type { Algorithms, AnyAuthMethod, ConnectConfig, KeyboardInteractiveCallback, Prompt } from "ssh2";
import { needsLegacySshAlgorithms } from "../modules/netops/vendor-registry.js";

export interface SSHConfig {
  host: string;
  port: number;
  username: string;
  password: string;
  vendor?: string;
  platform?: string;
}

const LEGACY_SSH_ALGORITHMS: Algorithms = {
  serverHostKey: [
    "ssh-rsa",
    "rsa-sha2-256",
    "rsa-sha2-512",
    "ecdsa-sha2-nistp256",
    "ecdsa-sha2-nistp384",
    "ecdsa-sha2-nistp521",
    "ssh-ed25519",
  ],
  kex: [
    "diffie-hellman-group-exchange-sha1",
    "diffie-hellman-group14-sha1",
    "diffie-hellman-group1-sha1",
    "diffie-hellman-group-exchange-sha256",
    "diffie-hellman-group14-sha256",
    "curve25519-sha256",
    "curve25519-sha256@libssh.org",
    "ecdh-sha2-nistp256",
    "ecdh-sha2-nistp384",
    "ecdh-sha2-nistp521",
  ],
  cipher: [
    "aes128-cbc",
    "aes192-cbc",
    "aes256-cbc",
    "3des-cbc",
    "aes128-ctr",
    "aes192-ctr",
    "aes256-ctr",
  ],
};

export interface SSHCommandResult {
  command: string;
  output: string;
  error?: string;
}

function buildConnectConfig(config: SSHConfig, readyTimeout: number): ConnectConfig {
  const authHandler: AnyAuthMethod[] = [
    {
      type: "keyboard-interactive",
      username: config.username,
      prompt: (...args) => answerKeyboardInteractive(config.password, ...args),
    },
    {
      type: "password",
      username: config.username,
      password: config.password,
    },
  ];

  return {
    host: config.host,
    port: config.port,
    username: config.username,
    password: config.password,
    readyTimeout,
    tryKeyboard: true,
    authHandler,
    ...(needsLegacySshAlgorithms(config.vendor ?? "", config.platform)
      ? { algorithms: LEGACY_SSH_ALGORITHMS }
      : {}),
  };
}

function answerKeyboardInteractive(
  password: string,
  _name: string,
  _instructions: string,
  _lang: string,
  prompts: Prompt[],
  finish: KeyboardInteractiveCallback,
): void {
  finish(prompts.map(() => password));
}

function normalizeSSHErrorMessage(message: string): string {
  if (/all configured authentication methods failed/i.test(message)) {
    return [
      "SSH authentication failed.",
      "Check username/password and whether the device allows password or keyboard-interactive SSH login.",
    ].join(" ");
  }
  return message;
}

const PASSWORD_CHANGE_PROMPT = /Change now\?\s*\[Y\/N\]:/i;
const SHELL_PROMPT_LINE = /^(<[^>\n]+>|\[[^\]\n]+\])\s*$/;
const ANSI_ESCAPE = /\u001b\[[0-9;]*[A-Za-z]/g;

function stripAnsi(value: string): string {
  return value.replace(ANSI_ESCAPE, "");
}

function normalizeShellText(value: string): string {
  return stripAnsi(value).replace(/\r/g, "");
}

function hasPromptLine(buffer: string): boolean {
  const lines = normalizeShellText(buffer)
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length === 0) return false;
  return SHELL_PROMPT_LINE.test(lines[lines.length - 1]);
}

function parseShellCommandOutput(buffer: string, command: string): string {
  const lines = normalizeShellText(buffer).split("\n");
  const output: string[] = [];
  let seenCommand = false;

  for (const line of lines) {
    const trimmed = line.trimEnd();
    const compact = trimmed.trim();

    if (!compact) continue;
    if (PASSWORD_CHANGE_PROMPT.test(compact)) continue;
    if (SHELL_PROMPT_LINE.test(compact)) continue;

    const inlinePromptMatch = compact.match(/^<[^>\n]+>(.*)$/);
    const commandText = inlinePromptMatch ? inlinePromptMatch[1].trim() : compact;

    if (!seenCommand) {
      if (commandText === command) {
        seenCommand = true;
      }
      continue;
    }

    output.push(trimmed);
  }

  return output.join("\n").trim();
}

function openInteractiveShell(conn: Client): Promise<NodeJS.ReadWriteStream> {
  return new Promise((resolve, reject) => {
    conn.shell({ term: "vt100", rows: 120, cols: 240 }, (err, stream) => {
      if (err || !stream) {
        reject(err ?? new Error("Failed to open SSH shell"));
        return;
      }
      resolve(stream);
    });
  });
}

function waitForShellPrompt(
  stream: NodeJS.ReadWriteStream,
  options?: {
    timeoutMs?: number;
    declinePasswordChange?: boolean;
  },
): Promise<string> {
  const timeoutMs = options?.timeoutMs ?? 30000;

  return new Promise((resolve, reject) => {
    let buffer = "";
    let declinedPasswordChange = false;
    let finished = false;

    const cleanup = () => {
      stream.off("data", onData);
      stream.off("error", onError);
      stream.off("close", onClose);
      clearTimeout(timer);
    };

    const settle = (fn: () => void) => {
      if (finished) return;
      finished = true;
      cleanup();
      fn();
    };

    const timer = setTimeout(() => {
      settle(() => reject(new Error(`SSH shell timed out after ${timeoutMs}ms`)));
    }, timeoutMs);

    const onData = (chunk: Buffer | string) => {
      buffer += chunk.toString();

      if (options?.declinePasswordChange && !declinedPasswordChange && PASSWORD_CHANGE_PROMPT.test(buffer)) {
        declinedPasswordChange = true;
        stream.write("N\n");
      }

      if (hasPromptLine(buffer)) {
        settle(() => resolve(buffer));
      }
    };

    const onError = (error: Error) => {
      settle(() => reject(error));
    };

    const onClose = () => {
      settle(() => reject(new Error("SSH shell closed before prompt was received")));
    };

    stream.on("data", onData);
    stream.on("error", onError);
    stream.on("close", onClose);
  });
}

export async function testSSHConnection(config: SSHConfig): Promise<{ success: boolean; latencyMs: number | null; hostname: string | null; message: string }> {
  return new Promise((resolve) => {
    const start = Date.now();
    const conn = new Client();
    let resolved = false;

    const timeout = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        conn.end();
        resolve({ success: false, latencyMs: null, hostname: null, message: "Connection timed out after 10s" });
      }
    }, 10000);

    conn.on("ready", () => {
      if (!resolved) {
        resolved = true;
        clearTimeout(timeout);
        const latencyMs = Date.now() - start;
        conn.end();
        resolve({ success: true, latencyMs, hostname: null, message: "Connected successfully" });
      }
    });

    conn.on("keyboard-interactive", (...args) => {
      answerKeyboardInteractive(config.password, ...args);
    });

    conn.on("error", (err) => {
      if (!resolved) {
        resolved = true;
        clearTimeout(timeout);
        resolve({ success: false, latencyMs: null, hostname: null, message: normalizeSSHErrorMessage(err.message) });
      }
    });

    conn.connect(buildConnectConfig(config, 9000));
  });
}

export async function runSSHCommands(
  config: SSHConfig,
  commands: string[],
  options?: {
    sessionTimeoutMs?: number;
    setupTimeoutMs?: number;
    commandTimeoutMs?: number;
  },
): Promise<SSHCommandResult[]> {
  return new Promise((resolve, reject) => {
    const conn = new Client();
    const results: SSHCommandResult[] = [];
    let resolved = false;
    const sessionTimeoutMs = options?.sessionTimeoutMs ?? 600000;
    const setupTimeoutMs = options?.setupTimeoutMs ?? 15000;
    const commandTimeoutMs = options?.commandTimeoutMs ?? 300000;

    // Default 10min: large BGP route queries can take 5-8min; callers may pass lower timeouts for light read-only commands.
    const timeout = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        conn.end();
        reject(new Error(`SSH session timed out after ${sessionTimeoutMs}ms`));
      }
    }, sessionTimeoutMs);

    conn.on("ready", async () => {
      try {
        const shell = await openInteractiveShell(conn);

        await waitForShellPrompt(shell, {
          timeoutMs: setupTimeoutMs,
          declinePasswordChange: true,
        });

        shell.write("screen-length 0 temporary\n");
        await waitForShellPrompt(shell, { timeoutMs: setupTimeoutMs });

        for (const command of commands) {
          shell.write(`${command}\n`);
          const rawOutput = await waitForShellPrompt(shell, { timeoutMs: commandTimeoutMs });
          results.push({ command, output: parseShellCommandOutput(rawOutput, command) });
        }

        shell.end();
        clearTimeout(timeout);
        resolved = true;
        conn.end();
        resolve(results);
      } catch (err) {
        clearTimeout(timeout);
        resolved = true;
        conn.end();
        reject(err);
      }
    });

    conn.on("keyboard-interactive", (...args) => {
      answerKeyboardInteractive(config.password, ...args);
    });

    conn.on("error", (err) => {
      if (!resolved) {
        resolved = true;
        clearTimeout(timeout);
        reject(new Error(normalizeSSHErrorMessage(err.message)));
      }
    });

    conn.connect(buildConnectConfig(config, 15000));
  });
}

function runSingleCommand(conn: Client, command: string): Promise<SSHCommandResult> {
  return new Promise((resolve) => {
    conn.exec(command, (err, stream) => {
      if (err) {
        resolve({ command, output: "", error: err.message });
        return;
      }
      let output = "";
      let errOutput = "";
      stream.on("data", (data: Buffer) => { output += data.toString(); });
      stream.stderr.on("data", (data: Buffer) => { errOutput += data.toString(); });
      stream.on("close", () => {
        resolve({ command, output: output.trim(), error: errOutput || undefined });
      });
    });
  });
}

export function getCollectionCommands(vendor: string, platform: string): string[] {
  const vendorKey = normalizeVendorForParsing(vendor, platform);
  const base = ["show running-config", "show interfaces", "show ip bgp summary"];
  const vlanCmds = ["show vlan brief"];
  const vpnCmds = ["show mpls l2transport vc", "show ip vrf"];

  if (vendorKey === "huawei") {
    return [
      "display current-configuration",
      "display interface brief",
      "display bgp peer",
      "display vlan",
      "display mpls l2vpn",
      "display ip vpn-instance",
    ];
  }
  if (vendorKey === "raisecom") {
    return [
      "show running-config",
      "show interface",
      "show ip interface brief",
      "show ip bgp summary",
      "show bgp all summary",
      "show vlan",
      "show mpls l2vc",
      "show ip vrf",
    ];
  }
  if (vendorKey === "juniper") {
    return [
      "show configuration",
      "show interfaces terse",
      "show bgp summary",
      "show l2vpn connections",
      "show route table bgp.l3vpn.0",
    ];
  }
  return [...base, ...vlanCmds, ...vpnCmds];
}

export interface ParsedConfig {
  vlans: Array<{ id: string; name?: string }>;
  interfaces: Array<{ name: string; description?: string; ip?: string; state: string }>;
  bgpPeers: Array<{ neighbor: string; asn: string; state: string; prefixesReceived?: string }>;
  l2vpn: Array<{ name: string; vc?: string; state?: string }>;
  l3vpn: Array<{ name: string; rd?: string; interfaces?: string[] }>;
}

export function parseConfig(rawOutputs: string[], vendor: string): ParsedConfig {
  const allOutput = rawOutputs.join("\n");
  const vendorKey = normalizeVendorForParsing(vendor);

  const vlans = parseVlans(allOutput, vendorKey);
  const interfaces = parseInterfaces(allOutput, vendorKey);
  const bgpPeers = parseBgp(allOutput, vendorKey);
  const l2vpn = parseL2vpn(allOutput, vendorKey);
  const l3vpn = parseL3vpn(allOutput, vendorKey);

  return { vlans, interfaces, bgpPeers, l2vpn, l3vpn };
}

function normalizeVendorForParsing(vendor: string, platform?: string): "huawei" | "raisecom" | "juniper" | "generic" {
  const vendorLower = vendor.trim().toLowerCase();
  const platformLower = String(platform ?? "").trim().toLowerCase();
  if (vendorLower.includes("huawei") || platformLower === "vrp") return "huawei";
  if (vendorLower.includes("raisecom") || platformLower === "ros") return "raisecom";
  if (vendorLower.includes("juniper") || platformLower === "junos") return "juniper";
  return "generic";
}

function parseVlans(output: string, vendor: "huawei" | "raisecom" | "juniper" | "generic"): Array<{ id: string; name?: string }> {
  const vlans: Array<{ id: string; name?: string }> = [];
  if (vendor === "huawei") {
    const matches = output.matchAll(/vlan\s+(\d+)\s*\n(?:\s+description\s+(.+))?/gi);
    for (const m of matches) vlans.push({ id: m[1], name: m[2]?.trim() });
  } else if (vendor === "raisecom") {
    const matches = output.matchAll(/^(\d+)\s+(\S+)\s+(?:active|enable|enabled)/gim);
    for (const m of matches) vlans.push({ id: m[1], name: m[2] });
  } else {
    // Cisco show vlan brief
    const matches = output.matchAll(/^(\d+)\s+(\S+)\s+active/gim);
    for (const m of matches) vlans.push({ id: m[1], name: m[2] });
  }
  return vlans;
}

function parseInterfaces(output: string, vendor: "huawei" | "raisecom" | "juniper" | "generic"): Array<{ name: string; description?: string; ip?: string; state: string }> {
  const ifaces: Array<{ name: string; description?: string; ip?: string; state: string }> = [];
  if (vendor === "raisecom") {
    const matches = output.matchAll(/^(\S+)\s+is\s+(up|down),\s*line protocol is\s+(up|down)/gim);
    for (const m of matches) {
      ifaces.push({ name: m[1].trim(), state: m[3].toLowerCase() });
    }
  } else {
    const matches = output.matchAll(/^(GigabitEthernet|FastEthernet|TenGigabitEthernet|Loopback|Vlan|Ethernet|Bundle-Ether|GE|XGE)[\d\/\.]+/gim);
    for (const m of matches) {
      ifaces.push({ name: m[0].trim(), state: "unknown" });
    }
  }
  return ifaces.slice(0, 50);
}

function parseBgp(output: string, vendor: "huawei" | "raisecom" | "juniper" | "generic"): Array<{ neighbor: string; asn: string; state: string; prefixesReceived?: string }> {
  const peers: Array<{ neighbor: string; asn: string; state: string; prefixesReceived?: string }> = [];
  if (vendor === "huawei") {
    const matches = output.matchAll(/(\d+\.\d+\.\d+\.\d+)\s+\d+\s+(\d+)\s+\w+\s+\w+\s+(\w+)/g);
    for (const m of matches) peers.push({ neighbor: m[1], asn: m[2], state: m[3] });
  } else if (vendor === "raisecom") {
    const matches = output.matchAll(/(\d+\.\d+\.\d+\.\d+)\s+\d+\s+(\d+)\s+\d+\s+\d+\s+\d+\s+\d+\s+\S+\s+([A-Za-z0-9()/-]+)/g);
    for (const m of matches) {
      const stateToken = m[3];
      const isEstablished = /^\d+$/.test(stateToken);
      peers.push({
        neighbor: m[1],
        asn: m[2],
        state: isEstablished ? "Established" : stateToken,
        prefixesReceived: isEstablished ? stateToken : undefined,
      });
    }
  } else {
    const matches = output.matchAll(/(\d+\.\d+\.\d+\.\d+)\s+\d+\s+(\d+)\s+\d+\s+\d+\s+\d+\s+\d+\s+\d+\s+(Established|Active|Idle|Connect)\s+(\d+)/g);
    for (const m of matches) peers.push({ neighbor: m[1], asn: m[2], state: m[3], prefixesReceived: m[4] });
  }
  return peers;
}

function parseL2vpn(output: string, _vendor: string): Array<{ name: string; vc?: string; state?: string }> {
  const l2: Array<{ name: string; vc?: string; state?: string }> = [];
  const matches = output.matchAll(/l2vpn[^\n]*name[:\s]+(\S+)|vc[:\s]+(\d+)[^\n]*(UP|DOWN)/gi);
  for (const m of matches) l2.push({ name: m[1] ?? "unknown", vc: m[2], state: m[3] });
  return l2;
}

function parseL3vpn(output: string, _vendor: string): Array<{ name: string; rd?: string; interfaces?: string[] }> {
  const l3: Array<{ name: string; rd?: string; interfaces?: string[] }> = [];
  const matches = output.matchAll(/(?:vrf definition|ip vrf|vpn-instance)\s+(\S+)/gi);
  for (const m of matches) {
    if (m[1] !== "Mgmt-vrf") l3.push({ name: m[1] });
  }
  return l3;
}
