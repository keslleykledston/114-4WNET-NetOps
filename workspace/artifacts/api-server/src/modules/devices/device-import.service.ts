import { createHash, randomBytes } from "crypto";
import { db } from "@workspace/db";
import { devicesTable } from "@workspace/db";
import { eq, or, inArray } from "drizzle-orm";
import { logAuditEvent } from "../../lib/audit.js";
import { parseImportFile } from "./device-import.parser.js";
import { validateDeviceRow, validateParsedDevice } from "./device-import.validator.js";
import type {
  ImportItem,
  ImportSummary,
  ImportPreviewResponse,
  ImportApplyRequest,
  ImportApplyResponse,
  ParsedDevice,
  FIELD_ALIASES,
  ImportMode,
} from "./device-import.types.js";

// In-memory cache for previews (temp storage)
interface PreviewCache {
  items: ImportItem[];
  summary: ImportSummary;
  createdAt: Date;
  expiresAt: Date;
}

const previewStore = new Map<string, PreviewCache>();

// Cleanup expired previews every 10 minutes
setInterval(() => {
  const now = new Date();
  for (const [token, cache] of previewStore.entries()) {
    if (cache.expiresAt < now) {
      previewStore.delete(token);
    }
  }
}, 10 * 60 * 1000);

function generatePreviewToken(): string {
  return randomBytes(16).toString("hex");
}

function generateFileHash(buffer: Buffer): string {
  return createHash("sha256").update(buffer).digest("hex");
}

export async function generateImportPreview(
  buffer: Buffer,
  filename: string,
  fieldAliases: typeof FIELD_ALIASES
): Promise<ImportPreviewResponse> {
  const fileHash = generateFileHash(buffer);
  const { headers, rows } = await parseImportFile(buffer, filename, fieldAliases);

  // Fetch existing devices for deduplication
  const existingDevices = await db.select({
    id: devicesTable.id,
    hostname: devicesTable.hostname,
    ipAddress: devicesTable.ipAddress,
  }).from(devicesTable);

  const items: ImportItem[] = [];
  const summary: ImportSummary = {
    totalRows: rows.length,
    validRows: 0,
    invalidRows: 0,
    toCreate: 0,
    toUpdate: 0,
    toSkip: 0,
    duplicates: 0,
    warnings: 0,
  };

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const rowNumber = i + 2; // +2 because of 0-index + header row

    const validation = validateDeviceRow(row);

    if (!validation.valid) {
      items.push({
        rowNumber,
        action: "invalid",
        errors: validation.errors,
        warnings: validation.warnings,
      });
      summary.invalidRows++;
      summary.warnings += validation.warnings.length;
      continue;
    }

    const device = validation.parsed!;
    summary.validRows++;
    summary.warnings += validation.warnings.length;

    // Check for duplicates
    const existingByHostname = existingDevices.find((d) => d.hostname === device.hostname);
    const existingByIP = device.ipAddress
      ? existingDevices.find((d) => d.ipAddress === device.ipAddress)
      : undefined;

    if (existingByHostname && existingByIP && existingByHostname.id === existingByIP.id) {
      // Same device, update
      items.push({
        rowNumber,
        action: "update",
        parsed: device,
        matchedDeviceId: existingByHostname.id,
        errors: [],
        warnings: validation.warnings,
      });
      summary.toUpdate++;
    } else if (existingByHostname || existingByIP) {
      // Conflict or duplicate
      summary.duplicates++;
      items.push({
        rowNumber,
        action: "skip",
        parsed: device,
        matchedDeviceId: existingByHostname?.id ?? existingByIP?.id,
        errors: ["Duplicate hostname or IP found"],
        warnings: validation.warnings,
      });
      summary.toSkip++;
    } else {
      // New device
      items.push({
        rowNumber,
        action: "create",
        parsed: device,
        errors: [],
        warnings: validation.warnings,
      });
      summary.toCreate++;
    }
  }

  const previewToken = generatePreviewToken();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 30 * 60 * 1000); // 30 min expiry

  previewStore.set(previewToken, {
    items,
    summary,
    createdAt: now,
    expiresAt,
  });

  return {
    summary,
    items,
    previewToken,
    fileHash,
    createdAt: now.toISOString(),
    expiresAt: expiresAt.toISOString(),
  };
}

export async function applyImport(
  previewToken: string,
  mode: ImportMode,
  userId: number,
  sourceIp: string | null
): Promise<ImportApplyResponse> {
  const cache = previewStore.get(previewToken);

  if (!cache) {
    return {
      success: false,
      summary: { created: 0, updated: 0, skipped: 0, failed: 0 },
      errors: [{ rowNumber: 0, message: "Preview token expired or invalid" }],
    };
  }

  const { items, summary } = cache;
  const errors: Array<{ rowNumber: number; message: string }> = [];
  let createdCount = 0;
  let updatedCount = 0;
  let skippedCount = 0;
  let failedCount = 0;

  // Process items based on mode
  const itemsToProcess = items.filter((item) => {
    if (item.action === "invalid") return false; // Skip invalid
    if (mode === "create_only" && item.action === "update") return false;
    if (mode === "update_existing" && item.action === "create") return false;
    return true;
  });

  for (const item of itemsToProcess) {
    try {
      if (item.action === "create") {
        if (!item.parsed!.ipAddress) {
          failedCount++;
          errors.push({
            rowNumber: item.rowNumber,
            message: "IP address required for creation",
          });
          continue;
        }
        const newDevice = {
          hostname: item.parsed!.hostname,
          ipAddress: item.parsed!.ipAddress,
          vendor: item.parsed!.vendor || "unknown",
          platform: item.parsed!.platform || "unknown",
          role: item.parsed!.role || null,
          site: item.parsed!.site || "unknown",
          status: item.parsed!.status || "unknown",
          sshPort: item.parsed!.sshPort ?? 22,
          snmpCommunity: item.parsed!.notes || null,
          passwordEncrypted: "",
          username: "admin",
        };
        await db.insert(devicesTable).values(newDevice);
        createdCount++;
      } else if (item.action === "update" && item.matchedDeviceId) {
        // Update non-credential fields only
        const updateData: any = {
          hostname: item.parsed!.hostname,
          updatedAt: new Date(),
        };
        if (item.parsed!.ipAddress) updateData.ipAddress = item.parsed!.ipAddress;
        if (item.parsed!.vendor) updateData.vendor = item.parsed!.vendor;
        if (item.parsed!.platform) updateData.platform = item.parsed!.platform;
        if (item.parsed!.role !== undefined) updateData.role = item.parsed!.role;
        if (item.parsed!.site !== undefined) updateData.site = item.parsed!.site;
        if (item.parsed!.status !== undefined) updateData.status = item.parsed!.status;
        if (item.parsed!.sshPort) updateData.sshPort = item.parsed!.sshPort;

        await db.update(devicesTable)
          .set(updateData)
          .where(eq(devicesTable.id, item.matchedDeviceId));
        updatedCount++;
      } else if (item.action === "skip") {
        skippedCount++;
      }
    } catch (error) {
      failedCount++;
      errors.push({
        rowNumber: item.rowNumber,
        message: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }

  // Clean up preview cache
  previewStore.delete(previewToken);

  // Audit logging
  await logAuditEvent({
    action: "device_import_apply",
    objectType: "device",
    objectId: `bulk-import-${createdCount}+${updatedCount}`,
    metadata: {
      total_rows: summary.totalRows,
      created: createdCount,
      updated: updatedCount,
      skipped: skippedCount,
      failed: failedCount,
      mode,
    },
    sourceIp,
  });

  return {
    success: errors.length === 0,
    summary: {
      created: createdCount,
      updated: updatedCount,
      skipped: skippedCount,
      failed: failedCount,
    },
    errors,
  };
}
