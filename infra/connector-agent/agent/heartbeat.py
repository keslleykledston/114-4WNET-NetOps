from __future__ import annotations

import logging
import os
import socket
import time
from typing import Any

from .config import Config
from .utils import run_command

logger = logging.getLogger("netops-connector")


def _read_proc_stat_cpu() -> float | None:
    try:
        with open("/proc/stat", encoding="utf-8") as f:
            line = f.readline()
        parts = line.split()
        if len(parts) < 5:
            return None
        idle = int(parts[4])
        total = sum(int(x) for x in parts[1:8])
        if total == 0:
            return None
        return round(100.0 * (1 - idle / total), 1)
    except OSError:
        return None


def _read_memory_usage() -> float | None:
    try:
        mem_total = mem_avail = None
        with open("/proc/meminfo", encoding="utf-8") as f:
            for line in f:
                if line.startswith("MemTotal:"):
                    mem_total = int(line.split()[1])
                elif line.startswith("MemAvailable:"):
                    mem_avail = int(line.split()[1])
        if not mem_total:
            return None
        used = mem_total - (mem_avail or 0)
        return round(100.0 * used / mem_total, 1)
    except OSError:
        return None


def _count_routes() -> int:
    try:
        proc = run_command(["ip", "route", "show"], timeout=10)
        if proc.returncode != 0:
            return 0
        return len([ln for ln in proc.stdout.splitlines() if ln.strip()])
    except Exception:
        return 0


def _wg_status(config: Config) -> tuple[str, str | None]:
    if not config.wg_enabled:
        return "DISABLED", None
    try:
        proc = run_command(["wg", "show", config.wg_interface], timeout=10)
        if proc.returncode != 0:
            return "DOWN", None
        ip_proc = run_command(["ip", "-4", "addr", "show", config.wg_interface], timeout=10)
        wg_ip = None
        for line in ip_proc.stdout.splitlines():
            line = line.strip()
            if line.startswith("inet "):
                wg_ip = line.split()[1].split("/")[0]
                break
        return "UP", wg_ip
    except Exception:
        return "DOWN", None


def _lan_ip(interface: str) -> str | None:
    try:
        proc = run_command(["ip", "-4", "addr", "show", interface], timeout=10)
        for line in proc.stdout.splitlines():
            line = line.strip()
            if line.startswith("inet "):
                return line.split()[1].split("/")[0]
    except Exception:
        pass
    return None


def build_heartbeat_payload(config: Config) -> dict[str, Any]:
    wg_status, wg_ip = _wg_status(config)
    payload: dict[str, Any] = {
        "connector_name": config.connector_name,
        "status": "ONLINE",
        "version": config.agent_version,
        "wireguard_status": wg_status,
        "hostname": socket.gethostname(),
        "lan_interface": config.lan_interface,
        "wan_interface": config.wan_interface,
        "lan_ip": _lan_ip(config.lan_interface),
        "wg_ip": wg_ip,
        "routes_count": _count_routes(),
        "nat_enabled": False,
        "cpu_usage": _read_proc_stat_cpu(),
        "memory_usage": _read_memory_usage(),
    }
    return payload


def send_heartbeat(api_client, config: Config, state_dir: str) -> None:
    payload = build_heartbeat_payload(config)
    api_client.post_heartbeat(payload)
    os.makedirs(state_dir, exist_ok=True)
    with open(f"{state_dir}/last_heartbeat", "w", encoding="utf-8") as f:
        f.write(str(time.time()))
    logger.info(
        "heartbeat sent status=ONLINE wg=%s routes=%s",
        payload.get("wireguard_status"),
        payload.get("routes_count"),
    )
