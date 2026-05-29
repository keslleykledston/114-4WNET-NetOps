from __future__ import annotations

import logging

from .api import NetOpsApiClient
from .config import Config
from .executor import execute_job
from .utils import sanitize_for_log

logger = logging.getLogger("netops-connector")


def poll_and_execute_jobs(api: NetOpsApiClient, config: Config) -> int:
    jobs = api.get_pending_jobs()
    if not jobs:
        return 0

    processed = 0
    for job in jobs:
        job_id = job.get("id")
        logger.info("received job %s", sanitize_for_log({"id": job_id, "type": job.get("job_type"), "target": job.get("target_ip")}))
        result = execute_job(job, config)
        api.post_job_result(job_id, result)
        logger.info(
            "job id=%s completed success=%s exit=%s duration_ms=%s",
            job_id,
            result.get("success"),
            result.get("exit_code"),
            (result.get("result_json") or {}).get("duration_ms"),
        )
        processed += 1
    return processed
