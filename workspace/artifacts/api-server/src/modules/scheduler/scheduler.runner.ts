import { logger } from "../../lib/logger.js";
import { runDueScheduledJobs } from "./scheduler.service.js";

const DEFAULT_INTERVAL_MS = 60_000;

let started = false;
let running = false;

export function startScheduler() {
  if (started) return;
  started = true;

  if (process.env["SCHEDULER_ENABLED"] === "false") {
    logger.info("Scheduler disabled");
    return;
  }

  const intervalMs = Number(process.env["SCHEDULER_INTERVAL_MS"] ?? DEFAULT_INTERVAL_MS);
  const pollIntervalMs = Number.isFinite(intervalMs) && intervalMs > 0 ? intervalMs : DEFAULT_INTERVAL_MS;

  logger.info({ pollIntervalMs }, "Scheduler started");

  setTimeout(() => {
    void tick();
  }, 10_000);

  setInterval(() => {
    void tick();
  }, pollIntervalMs);
}

async function tick() {
  if (running) return;
  running = true;
  try {
    await runDueScheduledJobs();
  } catch (error) {
    logger.error({ err: error }, "Scheduler tick failed");
  } finally {
    running = false;
  }
}
