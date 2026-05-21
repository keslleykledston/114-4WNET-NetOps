import { Client } from "ssh2";
import type { AnyAuthMethod, ConnectConfig, KeyboardInteractiveCallback, Prompt } from "ssh2";

export interface SSHConfig {
  host: string;
  port: number;
  username: string;
  password: string;
}

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

export async function runSSHCommands(config: SSHConfig, commands: string[]): Promise<SSHCommandResult[]> {
  return new Promise((resolve, reject) => {
    const conn = new Client();
    const results: SSHCommandResult[] = [];
    let resolved = false;

    const timeout = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        conn.end();
        reject(new Error("SSH session timed out"));
      }
    }, 60000);

    conn.on("ready", async () => {
      try {
        for (const command of commands) {
          const result = await runSingleCommand(conn, command);
          results.push(result);
        }
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
  const base = ["show running-config", "show interfaces", "show ip bgp summary"];
  const vlanCmds = ["show vlan brief"];
  const vpnCmds = ["show mpls l2transport vc", "show ip vrf"];

  if (vendor === "huawei" || platform === "vrp") {
    return [
      "display current-configuration",
      "display interface brief",
      "display bgp peer",
      "display vlan",
      "display mpls l2vpn",
      "display ip vpn-instance",
    ];
  }
  if (vendor === "juniper" || platform === "junos") {
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

  const vlans = parseVlans(allOutput, vendor);
  const interfaces = parseInterfaces(allOutput, vendor);
  const bgpPeers = parseBgp(allOutput, vendor);
  const l2vpn = parseL2vpn(allOutput, vendor);
  const l3vpn = parseL3vpn(allOutput, vendor);

  return { vlans, interfaces, bgpPeers, l2vpn, l3vpn };
}

function parseVlans(output: string, vendor: string): Array<{ id: string; name?: string }> {
  const vlans: Array<{ id: string; name?: string }> = [];
  if (vendor === "huawei") {
    const matches = output.matchAll(/vlan\s+(\d+)\s*\n(?:\s+description\s+(.+))?/gi);
    for (const m of matches) vlans.push({ id: m[1], name: m[2]?.trim() });
  } else {
    // Cisco show vlan brief
    const matches = output.matchAll(/^(\d+)\s+(\S+)\s+active/gim);
    for (const m of matches) vlans.push({ id: m[1], name: m[2] });
  }
  return vlans;
}

function parseInterfaces(output: string, _vendor: string): Array<{ name: string; description?: string; ip?: string; state: string }> {
  const ifaces: Array<{ name: string; description?: string; ip?: string; state: string }> = [];
  const matches = output.matchAll(/^(GigabitEthernet|FastEthernet|TenGigabitEthernet|Loopback|Vlan|Ethernet|Bundle-Ether|GE|XGE)[\d\/\.]+/gim);
  for (const m of matches) {
    ifaces.push({ name: m[0].trim(), state: "unknown" });
  }
  return ifaces.slice(0, 50);
}

function parseBgp(output: string, vendor: string): Array<{ neighbor: string; asn: string; state: string; prefixesReceived?: string }> {
  const peers: Array<{ neighbor: string; asn: string; state: string; prefixesReceived?: string }> = [];
  if (vendor === "huawei") {
    const matches = output.matchAll(/(\d+\.\d+\.\d+\.\d+)\s+\d+\s+(\d+)\s+\w+\s+\w+\s+(\w+)/g);
    for (const m of matches) peers.push({ neighbor: m[1], asn: m[2], state: m[3] });
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
