import { Router } from "express";
import { db } from "@workspace/db";
import { deviceGroupsTable, devicesTable } from "@workspace/db";
import { eq, sql, count } from "drizzle-orm";
import {
  CreateDeviceGroupBody,
  UpdateDeviceGroupBody,
  GetDeviceGroupParams,
  UpdateDeviceGroupParams,
  DeleteDeviceGroupParams,
} from "@workspace/api-zod";

const router = Router();

router.get("/device-groups", async (req, res) => {
  const groups = await db.select({
    id: deviceGroupsTable.id,
    name: deviceGroupsTable.name,
    description: deviceGroupsTable.description,
    createdAt: deviceGroupsTable.createdAt,
    deviceCount: sql<number>`count(${devicesTable.id})::int`,
  })
    .from(deviceGroupsTable)
    .leftJoin(devicesTable, eq(devicesTable.groupId, deviceGroupsTable.id))
    .groupBy(deviceGroupsTable.id);

  res.json(groups.map(g => ({ ...g, createdAt: g.createdAt.toISOString() })));
});

router.post("/device-groups", async (req, res) => {
  const parsed = CreateDeviceGroupBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid request body" }); return; }
  const [group] = await db.insert(deviceGroupsTable).values(parsed.data).returning();
  res.status(201).json({ ...group, deviceCount: 0, createdAt: group.createdAt.toISOString() });
});

router.get("/device-groups/:id", async (req, res) => {
  const params = GetDeviceGroupParams.safeParse({ id: Number(req.params.id) });
  if (!params.success) { res.status(400).json({ error: "Invalid ID" }); return; }

  const [group] = await db.select({
    id: deviceGroupsTable.id,
    name: deviceGroupsTable.name,
    description: deviceGroupsTable.description,
    createdAt: deviceGroupsTable.createdAt,
    deviceCount: sql<number>`count(${devicesTable.id})::int`,
  })
    .from(deviceGroupsTable)
    .leftJoin(devicesTable, eq(devicesTable.groupId, deviceGroupsTable.id))
    .where(eq(deviceGroupsTable.id, params.data.id))
    .groupBy(deviceGroupsTable.id);

  if (!group) { res.status(404).json({ error: "Not found" }); return; }
  res.json({ ...group, createdAt: group.createdAt.toISOString() });
});

router.patch("/device-groups/:id", async (req, res) => {
  const params = UpdateDeviceGroupParams.safeParse({ id: Number(req.params.id) });
  if (!params.success) { res.status(400).json({ error: "Invalid ID" }); return; }
  const parsed = UpdateDeviceGroupBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid body" }); return; }
  const [updated] = await db.update(deviceGroupsTable).set(parsed.data).where(eq(deviceGroupsTable.id, params.data.id)).returning();
  if (!updated) { res.status(404).json({ error: "Not found" }); return; }
  res.json({ ...updated, deviceCount: 0, createdAt: updated.createdAt.toISOString() });
});

router.delete("/device-groups/:id", async (req, res) => {
  const params = DeleteDeviceGroupParams.safeParse({ id: Number(req.params.id) });
  if (!params.success) { res.status(400).json({ error: "Invalid ID" }); return; }
  await db.delete(deviceGroupsTable).where(eq(deviceGroupsTable.id, params.data.id));
  res.status(204).end();
});

export default router;
