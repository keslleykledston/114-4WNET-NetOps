import { Router } from "express";
import { db } from "@workspace/db";
import { collectedConfigsTable, devicesTable } from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import {
  CollectDeviceConfigBody,
  GetCollectedConfigParams,
  ListCollectedConfigsQueryParams,
} from "@workspace/api-zod";
import { decrypt } from "../lib/crypto.js";
import { runSSHCommands, getCollectionCommands, parseConfig } from "../lib/ssh.js";

const router = Router();

router.get("/collected-configs", async (req, res) => {
  const query = ListCollectedConfigsQueryParams.safeParse(req.query);
  const configs = await db.select({
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
    .leftJoin(devicesTable, eq(collectedConfigsTable.deviceId, devicesTable.id))
    .orderBy(desc(collectedConfigsTable.collectedAt))
    .limit(200);

  const filtered = configs.filter(c => {
    if (query.success && query.data.deviceId && c.deviceId !== query.data.deviceId) return false;
    return true;
  });

  res.json(filtered.map(c => ({ ...c, collectedAt: c.collectedAt.toISOString() })));
});

router.post("/collected-configs", async (req, res) => {
  const parsed = CollectDeviceConfigBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid body" }); return; }

  const [device] = await db.select().from(devicesTable).where(eq(devicesTable.id, parsed.data.deviceId));
  if (!device) { res.status(404).json({ error: "Device not found" }); return; }

  let password: string;
  try {
    password = decrypt(device.passwordEncrypted);
  } catch {
    res.status(500).json({ error: "Failed to decrypt credentials" });
    return;
  }

  let rawConfig = "";
  let parsedVlans = null;
  let parsedInterfaces = null;
  let parsedBgp = null;
  let parsedL2vpn = null;
  let parsedL3vpn = null;

  try {
    const commands = parsed.data.commands?.length
      ? parsed.data.commands
      : getCollectionCommands(device.vendor, device.platform);

    const results = await runSSHCommands(
      { host: device.ipAddress, port: device.sshPort, username: device.username, password },
      commands
    );

    rawConfig = results.map(r => `! === ${r.command} ===\n${r.output}`).join("\n\n");

    const parsed2 = parseConfig(results.map(r => r.output), device.vendor);
    parsedVlans = JSON.stringify(parsed2.vlans);
    parsedInterfaces = JSON.stringify(parsed2.interfaces);
    parsedBgp = JSON.stringify(parsed2.bgpPeers);
    parsedL2vpn = JSON.stringify(parsed2.l2vpn);
    parsedL3vpn = JSON.stringify(parsed2.l3vpn);

    await db.update(devicesTable).set({ status: "active", lastSeen: new Date(), updatedAt: new Date() }).where(eq(devicesTable.id, device.id));
  } catch (e) {
    rawConfig = `Error collecting config: ${String(e)}`;
    await db.update(devicesTable).set({ status: "unreachable", updatedAt: new Date() }).where(eq(devicesTable.id, device.id));
  }

  const [cfg] = await db.insert(collectedConfigsTable).values({
    deviceId: device.id,
    rawConfig,
    parsedVlans,
    parsedInterfaces,
    parsedBgp,
    parsedL2vpn,
    parsedL3vpn,
  }).returning();

  res.status(201).json({
    ...cfg,
    deviceHostname: device.hostname,
    collectedAt: cfg.collectedAt.toISOString(),
  });
});

router.get("/collected-configs/:id", async (req, res) => {
  const params = GetCollectedConfigParams.safeParse({ id: Number(req.params.id) });
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
    .leftJoin(devicesTable, eq(collectedConfigsTable.deviceId, devicesTable.id))
    .where(eq(collectedConfigsTable.id, params.data.id));
  if (!cfg) { res.status(404).json({ error: "Not found" }); return; }
  res.json({ ...cfg, collectedAt: cfg.collectedAt.toISOString() });
});

export default router;
