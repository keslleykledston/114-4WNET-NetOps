import { logger } from "../../lib/logger.js";
import { evaluateConnectorAlerts } from "./connector-alert-engine.service.js";
import { refreshConnectorOnlineStatus } from "./connectors.service.js";

const DEFAULT_INTERVAL_SECONDS = 60;

let started = false;
let running = false;

export function startConnectorHealthEvaluation() {
  if (started) return;
  started = true;

  if (process.env["CONNECTOR_HEALTH_EVAL_ENABLED"] === "false") {
    logger.info("Connector health evaluation disabled");
    return;
  }

  const raw = process.env["CONNECTOR_HEALTH_EVAL_INTERVAL"] ?? String(DEFAULT_INTERVAL_SECONDS);
  const intervalSeconds = Number(raw);
  const intervalMs =
    Number.isFinite(intervalSeconds) && intervalSeconds > 0
      ? intervalSeconds * 1000
      : DEFAULT_INTERVAL_SECONDS * 1000;

  logger.info({ intervalMs }, "Connector health evaluation started");

  const tick = async () => {
    if (running) return;
    running = true;
    try {
      await refreshConnectorOnlineStatus();
      await evaluateConnectorAlerts();
    } catch (error) {
      logger.error({ err: error }, "Connector health evaluation tick failed");
    } finally {
      running = false;
    }
  };

  setTimeout(() => {
    void tick();
  }, 15_000);

  setInterval(() => {
    void tick();
  }, intervalMs);
}
