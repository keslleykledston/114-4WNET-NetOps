export interface HuaweiVrf {
  name: string;
  rd: string | null;
}

export function parseHuaweiVrfs(output: string): HuaweiVrf[] {
  const vrfs: HuaweiVrf[] = [];
  let current: HuaweiVrf | null = null;

  for (const line of output.split(/\r?\n/)) {
    const name = line.match(/^\s*ip vpn-instance\s+(\S+)/i);
    if (name) {
      current = { name: name[1], rd: null };
      vrfs.push(current);
      continue;
    }

    const rd = line.match(/^\s*route-distinguisher\s+(\S+)/i);
    if (rd && current) current.rd = rd[1];
  }

  return vrfs;
}
