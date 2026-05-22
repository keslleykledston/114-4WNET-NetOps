import type { RawDeviceRow, ImportFormat, FIELD_ALIASES } from "./device-import.types.js";

function detectDelimiter(content: string): string {
  const sample = content.split("\n").slice(0, 5).join("\n");
  const commas = (sample.match(/,/g) || []).length;
  const semis = (sample.match(/;/g) || []).length;
  const tabs = (sample.match(/\t/g) || []).length;

  if (semis > commas && semis > tabs) return ";";
  if (tabs > commas && tabs > semis) return "\t";
  return ",";
}

function parseCSVLine(line: string, delimiter: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    const nextChar = line[i + 1];

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === delimiter && !inQuotes) {
      result.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }

  result.push(current.trim());
  return result;
}

async function parseXLSX(buffer: Buffer): Promise<string[][]> {
  try {
    const XLSX = await import("xlsx");
    const workbook = XLSX.read(buffer, { type: "buffer" });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows: string[][] = XLSX.utils.sheet_to_json<string[]>(sheet, {
      header: 1,
      defval: "",
      blankrows: false,
    }) as any;
    return rows;
  } catch (error) {
    throw new Error(`Failed to parse XLSX: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function parseCSV(content: string): string[][] {
  const lines = content.split("\n").filter((l) => l.trim());
  const delimiter = detectDelimiter(content);
  return lines.map((line) => parseCSVLine(line, delimiter));
}

function normalizeHeaders(headers: string[]): string[] {
  return headers.map((h) => h.toLowerCase().trim().replace(/\s+/g, "_"));
}

function mapHeaders(
  rawHeaders: string[],
  fieldAliases: typeof FIELD_ALIASES
): Map<number, string> {
  const mapping = new Map<number, string>();
  const normalizedHeaders = normalizeHeaders(rawHeaders);

  normalizedHeaders.forEach((header, idx) => {
    if (fieldAliases[header]) {
      mapping.set(idx, fieldAliases[header]);
    }
  });

  return mapping;
}

function rowToObject(values: string[], headerMapping: Map<number, string>): RawDeviceRow {
  const obj: RawDeviceRow = {};

  values.forEach((value, idx) => {
    const fieldName = headerMapping.get(idx);
    if (fieldName && value) {
      obj[fieldName] = value;
    }
  });

  return obj;
}

export async function parseImportFile(
  buffer: Buffer,
  filename: string,
  fieldAliases: typeof FIELD_ALIASES
): Promise<{ headers: string[]; rows: RawDeviceRow[] }> {
  let rawRows: string[][] = [];

  if (filename.toLowerCase().endsWith(".xlsx")) {
    rawRows = await parseXLSX(buffer);
  } else if (filename.toLowerCase().endsWith(".csv") || filename.toLowerCase().endsWith(".txt")) {
    rawRows = parseCSV(buffer.toString("utf-8"));
  } else {
    throw new Error("Unsupported file format. Use CSV, TXT, or XLSX.");
  }

  if (rawRows.length < 2) {
    throw new Error("File must have header row + at least 1 data row");
  }

  const headers = rawRows[0];
  if (!headers || headers.length === 0) {
    throw new Error("No headers found in file");
  }

  const headerMapping = mapHeaders(headers, fieldAliases);
  if (headerMapping.size === 0) {
    throw new Error("No recognized columns found. Check headers.");
  }

  const dataRows = rawRows
    .slice(1)
    .filter((row) => row && row.some((cell) => cell))
    .map((values) => rowToObject(values, headerMapping));

  return { headers, rows: dataRows };
}
