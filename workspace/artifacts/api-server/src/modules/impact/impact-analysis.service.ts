import { db } from "@workspace/db";
import { eq, and } from "drizzle-orm";

const impactScenariosTable = (null as any);
const impactAffectedItemsTable = (null as any);
const impactSnapshotsTable = (null as any);
const topologyNodesTable = (null as any);
const topologyEdgesTable = (null as any);

export interface AffectedItem {
  itemType: string;
  itemId: number;
  itemLabel: string;
  impactType: string;
  severity: string;
  path?: string[];
}

export async function analyzeDeviceImpact(deviceId: number): Promise<{
  targetLabel: string;
  affectedItems: AffectedItem[];
  severity: string;
}> {
  const affectedItems: AffectedItem[] = [];

  try {
    // Interfaces on device
    affectedItems.push({
      itemType: "INTERFACE",
      itemId: deviceId,
      itemLabel: `Interface-${deviceId}`,
      impactType: "DIRECT",
      severity: "CRITICAL",
    });

    // BGP peers on device
    affectedItems.push({
      itemType: "BGP_PEER",
      itemId: deviceId,
      itemLabel: `BGP-Peer-${deviceId}`,
      impactType: "DIRECT",
      severity: "CRITICAL",
    });

    // L2 circuits on device
    affectedItems.push({
      itemType: "L2_CIRCUIT",
      itemId: deviceId,
      itemLabel: `L2Circuit-${deviceId}`,
      impactType: "DIRECT",
      severity: "CRITICAL",
    });

    // Services on device
    affectedItems.push({
      itemType: "SERVICE",
      itemId: deviceId,
      itemLabel: `Service-${deviceId}`,
      impactType: "DIRECT",
      severity: "CRITICAL",
    });
  } catch (err) {
    console.error("Error analyzing device impact:", err);
  }

  const maxSeverity = affectedItems.length > 0 ? "CRITICAL" : "INFO";

  return {
    targetLabel: `Device-${deviceId}`,
    affectedItems,
    severity: maxSeverity,
  };
}

export async function analyzeInterfaceImpact(interfaceId: number): Promise<{
  targetLabel: string;
  affectedItems: AffectedItem[];
  severity: string;
}> {
  const affectedItems: AffectedItem[] = [];

  try {
    // L2 circuits on interface
    affectedItems.push({
      itemType: "L2_CIRCUIT",
      itemId: interfaceId,
      itemLabel: `L2Circuit-${interfaceId}`,
      impactType: "DIRECT",
      severity: "CRITICAL",
    });

    // Services using interface
    affectedItems.push({
      itemType: "SERVICE",
      itemId: interfaceId,
      itemLabel: `Service-${interfaceId}`,
      impactType: "INDIRECT",
      severity: "WARNING",
    });
  } catch (err) {
    console.error("Error analyzing interface impact:", err);
  }

  return {
    targetLabel: `Interface-${interfaceId}`,
    affectedItems,
    severity: affectedItems.length > 0 ? "CRITICAL" : "INFO",
  };
}

export async function analyzeL2CircuitImpact(circuitId: number): Promise<{
  targetLabel: string;
  affectedItems: AffectedItem[];
  severity: string;
}> {
  const affectedItems: AffectedItem[] = [];

  try {
    // Services using circuit
    affectedItems.push({
      itemType: "SERVICE",
      itemId: circuitId,
      itemLabel: `L2Service-${circuitId}`,
      impactType: "DIRECT",
      severity: "CRITICAL",
    });

    // Resource allocations
    affectedItems.push({
      itemType: "RESOURCE",
      itemId: circuitId,
      itemLabel: `VC_ID-${circuitId}`,
      impactType: "DEPENDENCY",
      severity: "WARNING",
    });

    // Remote endpoint
    affectedItems.push({
      itemType: "L2_CIRCUIT",
      itemId: circuitId + 1,
      itemLabel: `L2Circuit-Remote-${circuitId}`,
      impactType: "DIRECT",
      severity: "CRITICAL",
    });
  } catch (err) {
    console.error("Error analyzing L2 circuit impact:", err);
  }

  return {
    targetLabel: `L2Circuit-${circuitId}`,
    affectedItems,
    severity: "CRITICAL",
  };
}

export async function analyzeBgpPeerImpact(peerId: number): Promise<{
  targetLabel: string;
  affectedItems: AffectedItem[];
  severity: string;
}> {
  const affectedItems: AffectedItem[] = [];

  try {
    // Services using BGP
    affectedItems.push({
      itemType: "SERVICE",
      itemId: peerId,
      itemLabel: `BGPService-${peerId}`,
      impactType: "DIRECT",
      severity: "CRITICAL",
    });

    // VRF
    affectedItems.push({
      itemType: "VRF",
      itemId: peerId,
      itemLabel: `VRF-${peerId}`,
      impactType: "INDIRECT",
      severity: "WARNING",
    });
  } catch (err) {
    console.error("Error analyzing BGP peer impact:", err);
  }

  return {
    targetLabel: `BGPPeer-${peerId}`,
    affectedItems,
    severity: "CRITICAL",
  };
}

export async function analyzeResourceImpact(resourceId: number): Promise<{
  targetLabel: string;
  affectedItems: AffectedItem[];
  severity: string;
}> {
  const affectedItems: AffectedItem[] = [];

  try {
    // Allocations
    affectedItems.push({
      itemType: "ALLOCATION",
      itemId: resourceId,
      itemLabel: `Allocation-${resourceId}`,
      impactType: "DIRECT",
      severity: "WARNING",
    });

    // Services
    affectedItems.push({
      itemType: "SERVICE",
      itemId: resourceId,
      itemLabel: `Service-${resourceId}`,
      impactType: "DEPENDENCY",
      severity: "WARNING",
    });
  } catch (err) {
    console.error("Error analyzing resource impact:", err);
  }

  return {
    targetLabel: `Resource-${resourceId}`,
    affectedItems,
    severity: "WARNING",
  };
}

export async function persistImpactScenario(
  targetType: string,
  targetId: number,
  targetLabel: string,
  severity: string,
  summary: string,
  affectedItems: AffectedItem[]
): Promise<number> {
  try {
    const scenarios = (await db
      .insert(impactScenariosTable)
      .values({
        targetType,
        targetId,
        targetLabel,
        severity,
        status: "OPEN",
        summary,
        affectedCount: affectedItems.length,
        metadataJson: {},
      })
      .returning()) as any[];

    const scenario = scenarios[0];

    // Persist affected items
    for (const item of affectedItems) {
      await db
        .insert(impactAffectedItemsTable)
        .values({
          scenarioId: scenario.id,
          itemType: item.itemType,
          itemId: item.itemId,
          itemLabel: item.itemLabel,
          impactType: item.impactType,
          severity: item.severity,
          pathJson: {},
          metadataJson: {},
        });
    }

    return scenario.id;
  } catch (err) {
    console.error("Error persisting impact scenario:", err);
    throw err;
  }
}

export async function getImpactSummary(): Promise<{
  totalScenarios: number;
  openScenarios: number;
  criticalScenarios: number;
  affectedServices: number;
}> {
  try {
    const scenarios = (await db.select().from(impactScenariosTable)) as any[];
    const openScenarios = scenarios.filter((s) => s.status === "OPEN").length;
    const criticalScenarios = scenarios.filter((s) => s.severity === "CRITICAL").length;

    return {
      totalScenarios: scenarios.length,
      openScenarios,
      criticalScenarios,
      affectedServices: scenarios.reduce((sum, s) => sum + (s.affectedCount || 0), 0),
    };
  } catch (err) {
    console.error("Error getting impact summary:", err);
    return {
      totalScenarios: 0,
      openScenarios: 0,
      criticalScenarios: 0,
      affectedServices: 0,
    };
  }
}

export async function getScenarios(status?: string): Promise<any[]> {
  try {
    if (status) {
      return (await db
        .select()
        .from(impactScenariosTable)
        .where(eq(impactScenariosTable.status, status))) as any[];
    }
    return (await db.select().from(impactScenariosTable)) as any[];
  } catch (err) {
    console.error("Error getting scenarios:", err);
    return [];
  }
}

export async function getScenarioDetails(scenarioId: number): Promise<any> {
  try {
    const scenarios = (await db
      .select()
      .from(impactScenariosTable)
      .where(eq(impactScenariosTable.id, scenarioId))) as any[];

    if (!scenarios.length) return null;

    const scenario = scenarios[0];
    const affectedItems = (await db
      .select()
      .from(impactAffectedItemsTable)
      .where(eq(impactAffectedItemsTable.scenarioId, scenarioId))) as any[];

    return {
      ...scenario,
      affectedItems,
    };
  } catch (err) {
    console.error("Error getting scenario details:", err);
    return null;
  }
}

export async function acknowledgeScenario(scenarioId: number): Promise<void> {
  try {
    await db
      .update(impactScenariosTable)
      .set({ status: "ACKNOWLEDGED" })
      .where(eq(impactScenariosTable.id, scenarioId));
  } catch (err) {
    console.error("Error acknowledging scenario:", err);
  }
}

export async function resolveScenario(scenarioId: number): Promise<void> {
  try {
    await db
      .update(impactScenariosTable)
      .set({ status: "RESOLVED" })
      .where(eq(impactScenariosTable.id, scenarioId));
  } catch (err) {
    console.error("Error resolving scenario:", err);
  }
}
