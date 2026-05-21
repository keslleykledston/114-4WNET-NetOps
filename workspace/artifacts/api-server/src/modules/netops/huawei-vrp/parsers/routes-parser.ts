// Routes parser for BGP received/advertised routes

export interface PrefixRoute {
  prefix: string;
  asPath: string;
  origin?: string;
}

export interface ParsedRoutes {
  rows: PrefixRoute[];
  reportedTotal: number | null;
}

const RE_TOTAL_ROUTES = /Total\s+Number\s+of\s+Routes\s*:\s*(\d+)/i;
const RE_NETWORK_PREFIXLEN = /Network\s*:\s*([0-9a-fA-F:]+)\s+.*?PrefixLen\s*:\s*(\d+)/i;
const RE_PATH_OGN = /Path\/Ogn\s*:\s*(.+)$/i;

function parseReportedTotal(text: string): number | null {
  const match = RE_TOTAL_ROUTES.exec(text);
  if (!match) return null;
  try {
    return parseInt(match[1], 10);
  } catch {
    return null;
  }
}

function normalizePathOgnTail(s: string): string {
  let t = (s || "").trim();
  t = t.replace(/\s+i\s*$/i, "i");
  return t;
}

function pathFromAttrTail(parts: string[]): string | null {
  if (!parts.length) return null;

  let lastAs = -1;
  for (let j = parts.length - 1; j >= 0; j -= 1) {
    if (/^\d+[a-zA-Z?]$/.test(parts[j])) {
      lastAs = j;
      break;
    }
  }

  if (lastAs < 0) return null;

  let firstAs = lastAs;
  let j = lastAs - 1;
  while (j >= 0 && /^\d+$/.test(parts[j])) {
    firstAs = j;
    j -= 1;
  }

  let seg = parts.slice(firstAs, lastAs + 1);
  while (seg.length > 1 && seg[0] === "0") {
    seg = seg.slice(1);
  }

  return seg.length ? seg.join(" ") : null;
}

function isValidCidr(cidr: string): boolean {
  const match = /^([0-9a-fA-F:.]+)\/(\d+)$/.test(cidr);
  return match;
}

function parseHuaweiNetworkPrefixlenPathOgn(text: string): PrefixRoute[] {
  const rows: PrefixRoute[] = [];
  let pending: [string, number] | null = null;

  for (const rawLine of text.split("\n")) {
    const t = rawLine.trimEnd();
    const st = t.trim();

    if (!st || st.startsWith("BGP ") || st.includes("Local router ID")) {
      continue;
    }
    if (RE_TOTAL_ROUTES.test(st)) {
      continue;
    }

    const mPo = RE_PATH_OGN.exec(t);
    if (mPo && pending) {
      const [addr, plen] = pending;
      pending = null;
      const prefix = `${addr}/${plen}`;
      if (!isValidCidr(prefix)) {
        continue;
      }
      const asPath = normalizePathOgnTail(mPo[1]);
      rows.push({ prefix, asPath });
      continue;
    }

    const mNet = RE_NETWORK_PREFIXLEN.exec(t);
    if (mNet) {
      const addr = mNet[1].trim();
      try {
        const plen = parseInt(mNet[2], 10);
        pending = [addr, plen];
      } catch {
        continue;
      }
    }
  }

  return rows;
}

function parseClassicAdvertisedTableLines(text: string): PrefixRoute[] {
  const rows: PrefixRoute[] = [];
  let pathColIdx: number | null = null;

  for (const line of text.split("\n")) {
    const raw = line.trimEnd();
    const t = raw.trim();

    if (!t || t.startsWith("BGP ") || t.includes("Local router ID")) {
      continue;
    }
    if (RE_TOTAL_ROUTES.test(t)) {
      continue;
    }

    if (t.includes("Network") && t.includes("NextHop") && t.includes("Path/Ogn")) {
      try {
        pathColIdx = raw.indexOf("Path/Ogn");
      } catch {
        pathColIdx = null;
      }
      continue;
    }

    if (t.startsWith("---") || (t.includes("Network") && t.includes("NextHop"))) {
      continue;
    }

    if (/^Status\s+codes/i.test(t)) {
      continue;
    }
    if (/^RPKI\s+validation/i.test(t)) {
      continue;
    }
    if (/^\s*Origin\s*:/i.test(t)) {
      continue;
    }

    if (RE_NETWORK_PREFIXLEN.test(t) && t.includes("PrefixLen")) {
      continue;
    }

    const m = /^\s*([\*\>dDrRsShxiaSs\?]+)\s+(\S+)\s+(\S+)\s+(.*)$/.exec(raw);
    if (!m) {
      continue;
    }

    const prefix = m[2].trim();
    const rest = (m[4] || "").trim();

    if (!isValidCidr(prefix)) {
      continue;
    }

    let asPath = "";
    if (pathColIdx !== null && raw.length > pathColIdx) {
      let colTail = raw.substring(pathColIdx).trim();
      if (colTail.toLowerCase().startsWith("path/ogn")) {
        colTail = colTail.substring(8).trim();
      }
      asPath = normalizePathOgnTail(colTail);
    }

    if (!asPath) {
      const parts = rest.split(/\s+/);
      asPath = pathFromAttrTail(parts) || "";
    }

    rows.push({ prefix, asPath });
  }

  return rows;
}

export function parseHuaweiRoutes(output: string): ParsedRoutes {
  const reportedTotal = parseReportedTotal(output);
  const blockRows = parseHuaweiNetworkPrefixlenPathOgn(output);

  if (blockRows.length > 0) {
    return { rows: blockRows, reportedTotal };
  }

  const classicRows = parseClassicAdvertisedTableLines(output);
  return { rows: classicRows, reportedTotal };
}
