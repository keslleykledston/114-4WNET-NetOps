import { and, eq } from "drizzle-orm";
import { configTemplatesTable, db } from "@workspace/db";
import { SERVICE_TEMPLATES } from "./provisioning-templates.js";

/**
 * Ensures built-in v0.4.0 service templates exist in config_templates (idempotent).
 */
export async function ensureServiceTemplatesInDb(): Promise<{ created: number; skipped: number }> {
  let created = 0;
  let skipped = 0;

  for (const def of SERVICE_TEMPLATES) {
    const [existing] = await db
      .select()
      .from(configTemplatesTable)
      .where(and(
        eq(configTemplatesTable.name, def.name),
        eq(configTemplatesTable.vendor, def.vendor),
      ))
      .limit(1);

    if (existing) {
      skipped += 1;
      continue;
    }

    await db.insert(configTemplatesTable).values({
      name: def.name,
      description: def.description,
      type: def.configTemplateType,
      vendor: def.vendor,
      platform: def.platform,
      template: def.template,
      parameters: JSON.stringify({
        serviceType: def.serviceType,
        requiredParameters: def.requiredParameters,
        optionalParameters: def.optionalParameters,
        parameterSchema: def.parameterSchema,
      }),
    });
    created += 1;
  }

  return { created, skipped };
}
