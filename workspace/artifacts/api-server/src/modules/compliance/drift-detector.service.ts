import { desc, eq } from "drizzle-orm";
import { db, collectedConfigsTable, devicesTable, complianceDriftsTable, type ComplianceDrift } from "@workspace/db";
import { buildExpectedState, getGlobalRequirements } from "./expected-state-builder.js";

function fieldExistsInConfig(fieldName: string, config: string): boolean {
  const searchPatterns: Record<string, RegExp> = {
    description: /description\s+["']?[\w\-\.]+["']?/i,
    import_policy: /route-policy\s+\S+\s+import/i,
    export_policy: /route-policy\s+\S+\s+export/i,
    community_filter: /community-filter|community-list/i,
    max_prefix: /maximum-prefix|max-prefix/i,
    rd: /vpn-target|route-distinguisher|rd\s+[\d:]+/i,
    rt_import: /vpn-target\s+[\d:]+\s+import|rt\s+\S+\s+import/i,
    rt_export: /vpn-target\s+[\d:]+\s+export|rt\s+\S+\s+export/i,
    vc_id: /vc-id|vc\s+\d+/i,
    peer_ip: /peer\s+[\d\.]+|neighbor\s+[\d\.]+/i,
    status_not_down: /admin-up|up/i,
    vsi_state: /vsi.*up/i,
    pw_active: /pseudo-wire|pw.*active/i,
    shutdown_disabled: /undo\s+shutdown|no\s+shutdown/i,
    encapsulation: /dot1q|dot1Q|qinq|qinQ/i,
    ntp: /ntp\s+server|ntp-service\s+enable/i,
    snmp: /snmp-agent.*community/i,
    aaa: /aaa|radius|tacacs|local-user/i,
  };

  const pattern = searchPatterns[fieldName];
  if (!pattern) {
    return config.toLowerCase().includes(fieldName.toLowerCase());
  }

  return pattern.test(config);
}

interface DriftDifference {
  fieldName: string;
  expected: boolean;
  found: boolean;
}

function generateDriftSummary(differences: DriftDifference[]): string {
  const missing = differences.filter((d) => d.expected && !d.found);
  if (missing.length === 0) {
    return "";
  }

  const lines = ["Drift Summary:", "Missing fields:"];
  for (const diff of missing) {
    lines.push(`  - ${diff.fieldName} (expected but not found)`);
  }

  return lines.join("\n");
}

export async function detectDriftForDevice(deviceId: number): Promise<ComplianceDrift | null> {
  const [device] = await db.select().from(devicesTable).where(eq(devicesTable.id, deviceId)).limit(1);
  if (!device) {
    return null;
  }

  const [collectedConfig] = await db
    .select()
    .from(collectedConfigsTable)
    .where(eq(collectedConfigsTable.deviceId, deviceId))
    .orderBy(desc(collectedConfigsTable.collectedAt))
    .limit(1);

  if (!collectedConfig || !collectedConfig.rawConfig) {
    return null;
  }

  const expectedStates = await buildExpectedState(deviceId);
  const globalReqs = getGlobalRequirements();

  const driftLog: DriftDifference[] = [];
  const expectedStateJson: Record<string, unknown> = {};
  const actualStateJson: Record<string, unknown> = {};

  // Check service-level requirements
  for (const state of expectedStates) {
    for (const [fieldName, req] of Object.entries(state.requirements)) {
      const exists = fieldExistsInConfig(fieldName, collectedConfig.rawConfig);
      driftLog.push({ fieldName, expected: req.required, found: exists });
      expectedStateJson[`${state.serviceType}.${fieldName}`] = req.required;
      actualStateJson[`${state.serviceType}.${fieldName}`] = exists;
    }
  }

  // Check global requirements
  for (const [fieldName, req] of Object.entries(globalReqs)) {
    const exists = fieldExistsInConfig(fieldName, collectedConfig.rawConfig);
    driftLog.push({ fieldName, expected: req.required, found: exists });
    expectedStateJson[`global.${fieldName}`] = req.required;
    actualStateJson[`global.${fieldName}`] = exists;
  }

  const driftSummary = generateDriftSummary(driftLog);

  // Only insert if there is actual drift
  if (!driftSummary) {
    return null;
  }

  const [drift] = await db
    .insert(complianceDriftsTable)
    .values({
      deviceId,
      expectedStateJson,
      actualStateJson,
      driftSummary,
    })
    .returning();

  return drift;
}

export async function getLatestDriftForDevice(deviceId: number): Promise<ComplianceDrift | null> {
  const [drift] = await db
    .select()
    .from(complianceDriftsTable)
    .where(eq(complianceDriftsTable.deviceId, deviceId))
    .orderBy(desc(complianceDriftsTable.createdAt))
    .limit(1);

  return drift || null;
}
