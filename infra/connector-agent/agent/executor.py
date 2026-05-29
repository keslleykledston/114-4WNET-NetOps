from __future__ import annotations

import logging
from typing import Any

from .config import Config
from .diagnostics import (
    run_ping,
    run_route_check,
    run_snmp_get,
    run_snmp_walk,
    run_ssh_command,
    run_tcp_check,
    run_traceroute,
    run_wg_status,
)

logger = logging.getLogger("netops-connector")


def execute_job(job: dict[str, Any], config: Config) -> dict[str, Any]:
    job_id = job.get("id")
    job_type = str(job.get("job_type", "")).upper()
    target_ip = job.get("target_ip") or ""
    target_port = job.get("target_port")
    payload = job.get("payload_json") or {}
    if not isinstance(payload, dict):
        payload = {}

    if isinstance(target_ip, str):
        target_ip = target_ip.strip()
    else:
        target_ip = str(target_ip or "").strip()

    if not target_ip and job_type not in ("WG_STATUS",):
        if isinstance(payload.get("target_ip"), str):
            target_ip = payload["target_ip"].strip()

    logger.info("executing job id=%s type=%s target=%s", job_id, job_type, target_ip or "-")

    try:
        if job_type == "PING":
            if not target_ip:
                raise ValueError("PING requires target_ip")
            return run_ping(target_ip, config, payload)
        if job_type == "TRACEROUTE":
            if not target_ip:
                raise ValueError("TRACEROUTE requires target_ip")
            return run_traceroute(target_ip, config)
        if job_type == "TCP_CHECK":
            if not target_ip:
                raise ValueError("TCP_CHECK requires target_ip")
            port = target_port or payload.get("port") or payload.get("target_port") or 22
            return run_tcp_check(target_ip, int(port), config)
        if job_type == "ROUTE_CHECK":
            if not target_ip:
                raise ValueError("ROUTE_CHECK requires target_ip")
            return run_route_check(target_ip, config)
        if job_type == "WG_STATUS":
            return run_wg_status(config)
        if job_type == "SNMP_GET":
            if not target_ip:
                raise ValueError("SNMP_GET requires target_ip")
            return run_snmp_get(target_ip, payload, config)
        if job_type == "SNMP_WALK":
            if not target_ip:
                raise ValueError("SNMP_WALK requires target_ip")
            return run_snmp_walk(target_ip, payload, config)
        if job_type == "SSH_COMMAND":
            if not target_ip:
                raise ValueError("SSH_COMMAND requires target_ip")
            return run_ssh_command(target_ip, payload, config)
        raise ValueError(f"Unsupported job_type: {job_type}")
    except Exception as exc:
        logger.exception("job id=%s failed: %s", job_id, exc)
        return {
            "success": False,
            "stdout": "",
            "stderr": str(exc),
            "exit_code": 1,
            "result_json": {"executor": "netops-connector-agent", "error": type(exc).__name__},
        }
