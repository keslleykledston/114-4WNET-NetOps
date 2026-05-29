from __future__ import annotations

import logging
import time

from .api import NetOpsApiClient
from .config import load_config
from .heartbeat import send_heartbeat
from .jobs import poll_and_execute_jobs
from .utils import setup_logging


def main() -> None:
    config = load_config()
    logger = setup_logging(config.log_dir, config.log_level)
    api = NetOpsApiClient(config)

    logger.info(
        "netops-connector-agent starting name=%s server=%s wg=%s",
        config.connector_name,
        config.netops_server_url,
        "enabled" if config.wg_enabled else "disabled",
    )

    last_heartbeat = 0.0
    last_poll = 0.0

    while True:
        now = time.time()
        try:
            if now - last_heartbeat >= config.heartbeat_interval:
                send_heartbeat(api, config, config.state_dir)
                last_heartbeat = now
        except Exception as exc:
            logger.error("heartbeat failed: %s", exc)

        try:
            if now - last_poll >= config.job_poll_interval:
                count = poll_and_execute_jobs(api, config)
                if count:
                    logger.info("processed %s job(s)", count)
                last_poll = now
        except Exception as exc:
            logger.error("job poll failed: %s", exc)

        time.sleep(1)


if __name__ == "__main__":
    main()
