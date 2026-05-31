import { logger } from "../../lib/logger.js";
import { snapshotComplianceTrends } from "./compliance-trends.service.js";

const DEFAULT_INTERVAL_SECONDS = 86400; // 24h

let started = false;
let running = false;

export function startComplianceTrendRunner() {
  if (started) return;
  started = true;

  if (process.env["COMPLIANCE_TREND_ENABLED"] === "false") {
    logger.info("Compliance trend runner disabled");
    return;
  }

  const raw = process.env["COMPLIANCE_TREND_INTERVAL"] ?? String(DEFAULT_INTERVAL_SECONDS);
  const intervalSeconds = Number(raw);
  const intervalMs =
    Number.isFinite(intervalSeconds) && intervalSeconds > 0
      ? intervalSeconds * 1000
      : DEFAULT_INTERVAL_SECONDS * 1000;

  logger.info({ intervalMs }, "Compliance trend runner started");

  const tick = async () => {
    if (running) return;
    running = true;
    try {
      await snapshotComplianceTrends();
    } catch (error) {
      logger.error({ err: error }, "Compliance trend snapshot failed");
    } finally {
      running = false;
    }
  };

  // Initial delay: 30s after startup
  setTimeout(() => {
    void tick();
  }, 30_000);

  // Then run every 24h (or configured interval)
  setInterval(() => {
    void tick();
  }, intervalMs);
}
