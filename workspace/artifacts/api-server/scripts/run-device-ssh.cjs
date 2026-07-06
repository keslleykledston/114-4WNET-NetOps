#!/usr/bin/env node
/** Read-only SSH via NetOps connector. Run from api-server dir inside netops-api container. */
const { db, devicesTable } = require("../../../lib/db/dist/index.js");
const { eq } = require("drizzle-orm");

async function loadExecutor() {
  return import("./src/modules/connectors/connector-execution.service.ts");
}

async function main() {
  const deviceArg = process.argv[2];
  const command = process.argv.slice(3).join(" ").trim();
  if (!deviceArg || !command) {
    console.error("Usage: node run-device-ssh.cjs <device_id> \"<display command>\"");
    process.exit(1);
  }

  const { executeSshCommandForDevice } = await loadExecutor();
  const deviceId = Number(deviceArg);
  const [device] = Number.isInteger(deviceId)
    ? await db.select().from(devicesTable).where(eq(devicesTable.id, deviceId)).limit(1)
    : await db.select().from(devicesTable).where(eq(devicesTable.hostname, deviceArg)).limit(1);

  if (!device) {
    console.error("Device not found:", deviceArg);
    process.exit(1);
  }

  console.error(`# device=${device.hostname} ip=${device.ipAddress} cmd=${command}`);
  const result = await executeSshCommandForDevice(device, command, { timeoutSeconds: 120 });
  process.stdout.write(result.stdout || "");
  if (result.stderr) process.stderr.write(result.stderr);
  process.exit(result.success ? 0 : 1);
}

main().catch((err) => {
  console.error(err.stack || err.message || err);
  process.exit(1);
});
