import { splitHuaweiConfigBlocks } from "./config-blocks.js";

export interface HuaweiVrf {
  name: string;
  rd: string | null;
}

export function parseHuaweiVrfs(output: string): HuaweiVrf[] {
  const vrfs: HuaweiVrf[] = [];
  const blocks = splitHuaweiConfigBlocks(output);

  for (const block of blocks.length > 0 ? blocks : [{ type: "unknown" as const, header: "", lines: output.split(/\r?\n/), raw: output, startLine: 1, endLine: output.split(/\r?\n/).length }]) {
    let current: HuaweiVrf | null = null;

    for (const line of block.lines) {
      const name = line.match(/^\s*ip vpn-instance\s+(\S+)/i);
      if (name) {
        current = { name: name[1], rd: null };
        vrfs.push(current);
        continue;
      }

      const rd = line.match(/^\s*route-distinguisher\s+(\S+)/i);
      if (rd && current) current.rd = rd[1];
    }
  }

  return vrfs;
}
