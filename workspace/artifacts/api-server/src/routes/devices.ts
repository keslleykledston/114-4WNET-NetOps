import { Router } from "express";
import multer from "multer";
import { db } from "@workspace/db";
import { devicesTable, deviceGroupsTable } from "@workspace/db";
import { eq, sql, count, inArray } from "drizzle-orm";
import { encrypt, decrypt } from "../lib/crypto.js";
import { testSSHConnection } from "../lib/ssh.js";
import { collectSnmpSnapshot } from "../lib/snmp.js";
import { getRequestSourceIp, logAuditEvent } from "../lib/audit.js";
import { requirePermission } from "../lib/auth.js";
import {
  CreateDeviceBody,
  UpdateDeviceBody,
  GetDeviceParams,
  UpdateDeviceParams,
  DeleteDeviceParams,
  TestDeviceConnectionParams,
  GetDeviceCollectedConfigParams,
  ListDevicesQueryParams,
} from "@workspace/api-zod";
import { collectedConfigsTable } from "@workspace/db";
import { exportToCSV, exportToJSON, getExportFilename, getContentType } from "../modules/devices/devices-export.service.js";
import { generateImportPreview, applyImport } from "../modules/devices/device-import.service.js";
import { FIELD_ALIASES } from "../modules/devices/device-import.types.js";

const router = Router();

// Multer for file uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
  fileFilter: (req, file, cb) => {
    const allowed = [".csv", ".txt", ".xlsx"];
    const ext = file.originalname.toLowerCase().slice(file.originalname.lastIndexOf("."));
    if (allowed.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error("Only CSV, TXT, and XLSX files are allowed"));
    }
  },
});

function publicDevice<T extends { lastSeen?: Date | null; createdAt: Date; updatedAt: Date }>(device: T) {
  return {
    ...device,
    lastSeen: device.lastSeen?.toISOString() ?? null,
    createdAt: device.createdAt.toISOString(),
    updatedAt: device.updatedAt.toISOString(),
  };
}

router.get("/devices", async (req, res) => {
  const query = ListDevicesQueryParams.safeParse(req.query);
  const devices = await db.select({
    id: devicesTable.id,
    hostname: devicesTable.hostname,
    ipAddress: devicesTable.ipAddress,
    vendor: devicesTable.vendor,
    platform: devicesTable.platform,
    sshPort: devicesTable.sshPort,
    username: devicesTable.username,
    site: devicesTable.site,
    role: devicesTable.role,
    groupId: devicesTable.groupId,
    netboxDeviceId: devicesTable.netboxDeviceId,
    lastSeen: devicesTable.lastSeen,
    status: devicesTable.status,
    createdAt: devicesTable.createdAt,
    updatedAt: devicesTable.updatedAt,
  }).from(devicesTable);

  const filtered = devices.filter(d => {
    if (query.success) {
      if (query.data.status && d.status !== query.data.status) return false;
      if (query.data.vendor && d.vendor !== query.data.vendor) return false;
      if (query.data.site && d.site !== query.data.site) return false;
    }
    return true;
  });

  res.json(filtered.map(publicDevice));
});

router.post("/devices", async (req, res) => {
  const parsed = CreateDeviceBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request body" });
    return;
  }
  const { password, ...rest } = parsed.data;
  const [device] = await db.insert(devicesTable).values({
    ...rest,
    sshPort: rest.sshPort ?? 22,
    snmpCommunity: rest.snmpCommunity?.trim() || null,
    passwordEncrypted: encrypt(password),
    status: "unknown",
  }).returning();
  await logAuditEvent({
    action: "device_create",
    objectType: "device",
    objectId: String(device.id),
    metadata: { hostname: device.hostname, ipAddress: device.ipAddress, vendor: device.vendor, platform: device.platform, site: device.site, status: device.status },
    sourceIp: getRequestSourceIp(req),
  });
  res.status(201).json(publicDevice(device));
});

router.get("/devices/stats", async (req, res) => {
  const devices = await db.select().from(devicesTable);
  const total = devices.length;
  const active = devices.filter(d => d.status === "active").length;
  const unreachable = devices.filter(d => d.status === "unreachable").length;
  const unknown = devices.filter(d => d.status === "unknown").length;

  const byVendor = Object.entries(
    devices.reduce((acc, d) => { acc[d.vendor] = (acc[d.vendor] ?? 0) + 1; return acc; }, {} as Record<string, number>)
  ).map(([key, count]) => ({ key, count }));

  const bySite = Object.entries(
    devices.reduce((acc, d) => { acc[d.site] = (acc[d.site] ?? 0) + 1; return acc; }, {} as Record<string, number>)
  ).map(([key, count]) => ({ key, count }));

  res.json({ total, active, unreachable, unknown, byVendor, bySite });
});

router.get("/devices/:id", async (req, res) => {
  const params = GetDeviceParams.safeParse({ id: Number(req.params.id) });
  if (!params.success) { res.status(400).json({ error: "Invalid ID" }); return; }

  const [device] = await db.select({
    id: devicesTable.id,
    hostname: devicesTable.hostname,
    ipAddress: devicesTable.ipAddress,
    vendor: devicesTable.vendor,
    platform: devicesTable.platform,
    sshPort: devicesTable.sshPort,
    username: devicesTable.username,
    site: devicesTable.site,
    role: devicesTable.role,
    groupId: devicesTable.groupId,
    netboxDeviceId: devicesTable.netboxDeviceId,
    lastSeen: devicesTable.lastSeen,
    status: devicesTable.status,
    createdAt: devicesTable.createdAt,
    updatedAt: devicesTable.updatedAt,
  }).from(devicesTable).where(eq(devicesTable.id, params.data.id));

  if (!device) { res.status(404).json({ error: "Device not found" }); return; }
  res.json(publicDevice(device));
});

router.patch("/devices/:id", async (req, res) => {
  const params = UpdateDeviceParams.safeParse({ id: Number(req.params.id) });
  if (!params.success) { res.status(400).json({ error: "Invalid ID" }); return; }
  const parsed = UpdateDeviceBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid body" }); return; }

  const updateData: Record<string, unknown> = { updatedAt: new Date() };
  const { password, ...rest } = parsed.data as { password?: string; [key: string]: unknown };
  Object.assign(updateData, rest);
  if ("snmpCommunity" in rest) {
    updateData.snmpCommunity = typeof rest.snmpCommunity === "string" && rest.snmpCommunity.trim().length > 0
      ? rest.snmpCommunity.trim()
      : null;
  }
  if (password) updateData.passwordEncrypted = encrypt(password);

  const [updated] = await db.update(devicesTable)
    .set(updateData)
    .where(eq(devicesTable.id, params.data.id))
    .returning();
  if (!updated) { res.status(404).json({ error: "Not found" }); return; }
  res.json(publicDevice(updated));
  await logAuditEvent({
    action: "device_update",
    objectType: "device",
    objectId: String(updated.id),
    metadata: { hostname: updated.hostname, ipAddress: updated.ipAddress, vendor: updated.vendor, platform: updated.platform, site: updated.site, status: updated.status },
    sourceIp: getRequestSourceIp(req),
  });
});

router.delete("/devices/:id", async (req, res) => {
  const params = DeleteDeviceParams.safeParse({ id: Number(req.params.id) });
  if (!params.success) { res.status(400).json({ error: "Invalid ID" }); return; }
  await logAuditEvent({
    action: "device_delete",
    objectType: "device",
    objectId: String(params.data.id),
    metadata: { deleted: true },
    sourceIp: getRequestSourceIp(req),
  });
  await db.delete(devicesTable).where(eq(devicesTable.id, params.data.id));
  res.status(204).end();
});

router.post("/devices/:id/test-connection", async (req, res) => {
  const params = TestDeviceConnectionParams.safeParse({ id: Number(req.params.id) });
  if (!params.success) { res.status(400).json({ error: "Invalid ID" }); return; }

  const [device] = await db.select().from(devicesTable).where(eq(devicesTable.id, params.data.id));
  if (!device) { res.status(404).json({ error: "Device not found" }); return; }

  let password: string;
  try {
    password = decrypt(device.passwordEncrypted);
  } catch {
    res.status(500).json({ error: "Failed to decrypt credentials" });
    return;
  }

  const result = await testSSHConnection({
    host: device.ipAddress,
    port: device.sshPort,
    username: device.username,
    password,
  });

  await db.update(devicesTable).set({
    status: result.success ? "active" : "unreachable",
    lastSeen: result.success ? new Date() : undefined,
    updatedAt: new Date(),
  }).where(eq(devicesTable.id, device.id));
  await logAuditEvent({
    action: "device_test_connection",
    objectType: "device",
    objectId: String(device.id),
    metadata: { success: result.success, latencyMs: result.latencyMs, message: result.message, hostname: result.hostname },
    sourceIp: getRequestSourceIp(req),
  });

  res.json(result);
});

router.post("/devices/:id/test-connectivity", async (req, res) => {
  const params = TestDeviceConnectionParams.safeParse({ id: Number(req.params.id) });
  if (!params.success) { res.status(400).json({ error: "Invalid ID" }); return; }

  const [device] = await db.select().from(devicesTable).where(eq(devicesTable.id, params.data.id));
  if (!device) { res.status(404).json({ error: "Device not found" }); return; }

  let password: string;
  try {
    password = decrypt(device.passwordEncrypted);
  } catch {
    res.status(500).json({ error: "Failed to decrypt credentials" });
    return;
  }

  const [sshResult, snmpResult] = await Promise.all([
    testSSHConnection({
      host: device.ipAddress,
      port: device.sshPort,
      username: device.username,
      password,
    }),
    device.snmpCommunity ? collectSnmpSnapshot({
      id: device.id,
      hostname: device.hostname,
      ipAddress: device.ipAddress,
      vendor: device.vendor,
      platform: device.platform,
      snmpCommunity: device.snmpCommunity,
    }) : Promise.resolve({ success: false, errorMessage: "No SNMP community configured" })
  ]);

  await logAuditEvent({
    action: "device_test_connectivity",
    objectType: "device",
    objectId: String(device.id),
    metadata: {
      ssh: { success: sshResult.success, latencyMs: sshResult.latencyMs, message: sshResult.message },
      snmp: { success: snmpResult.success, message: snmpResult.errorMessage ?? "ok" },
    },
    sourceIp: getRequestSourceIp(req),
  });

  const sshOk = sshResult.success;
  const snmpOk = snmpResult.success;

  let status: string;
  if (sshOk && snmpOk) {
    status = "active";
  } else if (!sshOk && !snmpOk) {
    status = "fail";
  } else {
    status = "pending";
  }

  await db.update(devicesTable).set({
    status,
    lastSeen: (sshOk || snmpOk) ? new Date() : undefined,
    updatedAt: new Date(),
  }).where(eq(devicesTable.id, device.id));

  res.json({
    status,
    ssh: { success: sshOk, message: sshResult.message ?? (sshOk ? "SSH OK" : "SSH failed") },
    snmp: { success: snmpOk, message: snmpResult.errorMessage ?? (snmpOk ? "SNMP OK" : "SNMP failed") }
  });
});

router.get("/devices/:id/collected-config", async (req, res) => {
  const params = GetDeviceCollectedConfigParams.safeParse({ id: Number(req.params.id) });
  if (!params.success) { res.status(400).json({ error: "Invalid ID" }); return; }

  const [cfg] = await db.select({
    id: collectedConfigsTable.id,
    deviceId: collectedConfigsTable.deviceId,
    deviceHostname: devicesTable.hostname,
    rawConfig: collectedConfigsTable.rawConfig,
    parsedVlans: collectedConfigsTable.parsedVlans,
    parsedInterfaces: collectedConfigsTable.parsedInterfaces,
    parsedBgp: collectedConfigsTable.parsedBgp,
    parsedL2vpn: collectedConfigsTable.parsedL2vpn,
    parsedL3vpn: collectedConfigsTable.parsedL3vpn,
    collectedAt: collectedConfigsTable.collectedAt,
  })
    .from(collectedConfigsTable)
    .innerJoin(devicesTable, eq(collectedConfigsTable.deviceId, devicesTable.id))
    .where(eq(collectedConfigsTable.deviceId, params.data.id))
    .orderBy(sql`${collectedConfigsTable.collectedAt} DESC`)
    .limit(1);

  if (!cfg) { res.status(404).json({ error: "No collected config found" }); return; }
  res.json({ ...cfg, collectedAt: cfg.collectedAt.toISOString() });
});

// Export endpoints
router.post("/devices/export", requirePermission("devices.export"), async (req, res) => {
  const { ids, format = "csv" } = req.body;

  if (!Array.isArray(ids) || ids.length === 0) {
    res.status(400).json({ error: "No devices selected" });
    return;
  }

  if (!["csv", "xlsx", "json"].includes(format)) {
    res.status(400).json({ error: "Invalid format. Use csv, xlsx, or json" });
    return;
  }

  try {
    const devices = await db.select().from(devicesTable).where(inArray(devicesTable.id, ids));

    if (devices.length === 0) {
      res.status(404).json({ error: "No devices found" });
      return;
    }

    let buffer: Buffer;
    if (format === "json") {
      const user = req.headers["x-user-email"] || "unknown";
      buffer = exportToJSON(devices, String(user));
    } else {
      buffer = exportToCSV(devices);
    }

    const filename = getExportFilename(format as "csv" | "xlsx" | "json");
    const contentType = getContentType(format as "csv" | "xlsx" | "json");

    await logAuditEvent({
      action: "device_export",
      objectType: "device",
      objectId: ids.join(","),
      metadata: { format, count: devices.length },
      sourceIp: getRequestSourceIp(req),
    });

    res.setHeader("Content-Type", contentType);
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.send(buffer);
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : "Export failed" });
  }
});

// Import endpoints
router.post("/devices/import/preview", requirePermission("devices.import"), upload.single("file"), async (req, res) => {
  if (!req.file) {
    res.status(400).json({ error: "No file uploaded" });
    return;
  }

  try {
    const preview = await generateImportPreview(req.file.buffer, req.file.originalname || "import.csv", FIELD_ALIASES);

    await logAuditEvent({
      action: "device_import_preview",
      objectType: "device",
      objectId: preview.fileHash,
      metadata: {
        totalRows: preview.summary.totalRows,
        validRows: preview.summary.validRows,
        invalidRows: preview.summary.invalidRows,
      },
      sourceIp: getRequestSourceIp(req),
    });

    res.json(preview);
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : "Preview failed" });
  }
});

router.post("/devices/import/apply", requirePermission("devices.import"), async (req, res) => {
  const { previewToken, mode = "upsert" } = req.body;

  if (!previewToken) {
    res.status(400).json({ error: "Missing previewToken" });
    return;
  }

  if (!["create_only", "update_existing", "upsert"].includes(mode)) {
    res.status(400).json({ error: "Invalid mode. Use: create_only, update_existing, or upsert" });
    return;
  }

  try {
    // userId can be 0 (will be logged in audit with sourceIp instead)
    const result = await applyImport(previewToken, mode as any, 0, getRequestSourceIp(req));

    res.status(result.success ? 200 : 400).json(result);
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : "Apply failed" });
  }
});

export default router;
