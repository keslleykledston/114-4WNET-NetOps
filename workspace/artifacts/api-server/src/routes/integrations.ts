import { Router } from "express";
import { desc, eq } from "drizzle-orm";
import { db, integrationSettingsTable } from "@workspace/db";

const router = Router();

const DEFAULT_INTEGRATIONS = [
  {
    name: "netbox",
    enabled: false,
    configJson: {
      readiness: "future",
      baseUrl: null,
      tokenConfigured: false,
      notes: "Integração preparada para fase futura",
    },
  },
  {
    name: "future_webhook",
    enabled: false,
    configJson: {
      readiness: "future",
      notes: "Integração preparada para fase futura",
    },
  },
  {
    name: "future_zabbix",
    enabled: false,
    configJson: {
      readiness: "future",
      notes: "Integração preparada para fase futura",
    },
  },
];

async function ensureSeededIntegrations() {
  const existing = await db.select().from(integrationSettingsTable);
  const existingNames = new Set(existing.map((row) => row.name));
  const missing = DEFAULT_INTEGRATIONS.filter((item) => !existingNames.has(item.name));
  if (missing.length > 0) {
    await db.insert(integrationSettingsTable).values(missing.map((item) => ({
      ...item,
      configJson: item.configJson as Record<string, unknown>,
    })));
  }
}

router.get("/integrations", async (_req, res) => {
  await ensureSeededIntegrations();
  const rows = await db.select().from(integrationSettingsTable).orderBy(desc(integrationSettingsTable.createdAt));
  res.json(rows.map((row) => ({
    id: row.id,
    name: row.name,
    enabled: row.enabled,
    configJson: row.configJson,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  })));
});

router.get("/integrations/:name", async (req, res) => {
  await ensureSeededIntegrations();
  const name = req.params.name.trim();
  const [row] = await db.select().from(integrationSettingsTable).where(eq(integrationSettingsTable.name, name));
  if (!row) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  res.json({
    id: row.id,
    name: row.name,
    enabled: row.enabled,
    configJson: row.configJson,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  });
});

router.patch("/integrations/:name", async (req, res) => {
  await ensureSeededIntegrations();
  const name = req.params.name.trim();
  const body = req.body && typeof req.body === "object" ? req.body as Record<string, unknown> : {};

  const configJson = body.configJson && typeof body.configJson === "object" && !Array.isArray(body.configJson)
    ? body.configJson as Record<string, unknown>
    : undefined;
  if (configJson && Object.keys(configJson).some((key) => /token|secret|password|community/i.test(key))) {
    res.status(400).json({ error: "Secrets are not accepted through this endpoint." });
    return;
  }

  const enabled = typeof body.enabled === "boolean" ? body.enabled : undefined;

  const updateData: Record<string, unknown> = { updatedAt: new Date() };
  if (enabled !== undefined) updateData.enabled = enabled;
  if (configJson !== undefined) updateData.configJson = configJson;

  const [updated] = await db.update(integrationSettingsTable)
    .set(updateData)
    .where(eq(integrationSettingsTable.name, name))
    .returning();

  if (!updated) {
    res.status(404).json({ error: "Not found" });
    return;
  }

  res.json({
    id: updated.id,
    name: updated.name,
    enabled: updated.enabled,
    configJson: updated.configJson,
    createdAt: updated.createdAt.toISOString(),
    updatedAt: updated.updatedAt.toISOString(),
  });
});

export default router;
