from __future__ import annotations

import logging
import socket
import time
from typing import Any

import paramiko

from .config import Config
from .security import SecurityPolicyError, validate_ssh_command
from .utils import run_command

logger = logging.getLogger("netops-connector")


def _duration_ms(start: float) -> int:
    return int((time.time() - start) * 1000)


def run_ping(target_ip: str, config: Config, payload: dict[str, Any]) -> dict[str, Any]:
    start = time.time()
    count = int(payload.get("count", 4))
    proc = run_command(["ping", "-c", str(count), "-W", "2", target_ip], timeout=config.job_timeout)
    success = proc.returncode == 0
    return {
        "success": success,
        "stdout": proc.stdout,
        "stderr": proc.stderr,
        "exit_code": proc.returncode,
        "result_json": {"duration_ms": _duration_ms(start), "executor": "netops-connector-agent"},
    }


def run_traceroute(target_ip: str, config: Config) -> dict[str, Any]:
    start = time.time()
    proc = run_command(
        ["traceroute", "-n", "-w", "2", "-q", "1", target_ip],
        timeout=max(config.job_timeout, 120),
    )
    success = proc.returncode == 0
    return {
        "success": success,
        "stdout": proc.stdout,
        "stderr": proc.stderr,
        "exit_code": proc.returncode,
        "result_json": {"duration_ms": _duration_ms(start), "executor": "netops-connector-agent"},
    }


def run_tcp_check(target_ip: str, target_port: int, config: Config) -> dict[str, Any]:
    start = time.time()
    port = target_port or 22
    sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    sock.settimeout(config.ssh_connect_timeout)
    try:
        sock.connect((target_ip, port))
        open_ok = True
        err = ""
    except OSError as exc:
        open_ok = False
        err = str(exc)
    finally:
        sock.close()
    duration = _duration_ms(start)
    return {
        "success": open_ok,
        "stdout": f"TCP {target_ip}:{port} open={open_ok} duration_ms={duration}",
        "stderr": err,
        "exit_code": 0 if open_ok else 1,
        "result_json": {"open": open_ok, "duration_ms": duration, "executor": "netops-connector-agent"},
    }


def run_route_check(target_ip: str, config: Config) -> dict[str, Any]:
    start = time.time()
    proc = run_command(["ip", "route", "get", target_ip], timeout=config.job_timeout)
    success = proc.returncode == 0
    return {
        "success": success,
        "stdout": proc.stdout,
        "stderr": proc.stderr,
        "exit_code": proc.returncode,
        "result_json": {"duration_ms": _duration_ms(start), "executor": "netops-connector-agent"},
    }


def run_wg_status(config: Config) -> dict[str, Any]:
    start = time.time()
    if not config.wg_enabled:
        return {
            "success": True,
            "stdout": "WireGuard DISABLED (WG_ENABLED=false)",
            "stderr": "",
            "exit_code": 0,
            "result_json": {"wireguard_status": "DISABLED", "duration_ms": _duration_ms(start)},
        }
    wg = run_command(["wg", "show", config.wg_interface], timeout=15)
    ip_show = run_command(["ip", "addr", "show", config.wg_interface], timeout=15)
    combined = f"=== wg show ===\n{wg.stdout}\n=== ip addr ===\n{ip_show.stdout}"
    if wg.returncode != 0 and ip_show.returncode != 0:
        return {
            "success": False,
            "stdout": combined,
            "stderr": wg.stderr + ip_show.stderr,
            "exit_code": 1,
            "result_json": {"wireguard_status": "DOWN", "duration_ms": _duration_ms(start)},
        }
    status = "UP" if wg.returncode == 0 else "DOWN"
    return {
        "success": True,
        "stdout": combined,
        "stderr": wg.stderr + ip_show.stderr,
        "exit_code": 0,
        "result_json": {"wireguard_status": status, "duration_ms": _duration_ms(start)},
    }


def _validate_oid(oid: str) -> None:
    if not oid or not all(part.isdigit() for part in oid.strip().split(".")):
        raise ValueError("Invalid SNMP OID")


def run_snmp_get(target_ip: str, payload: dict[str, Any], config: Config) -> dict[str, Any]:
    start = time.time()
    oid = str(payload.get("oid", "")).strip()
    _validate_oid(oid)
    community = str(payload.get("community", "public"))
    version = str(payload.get("version", "2c"))
    vflag = "-v2c" if version in ("2c", "2", "v2c") else "-v1"
    proc = run_command(
        [
            "snmpget",
            vflag,
            "-c",
            community,
            "-t",
            str(config.snmp_timeout),
            "-r",
            str(config.snmp_retries),
            target_ip,
            oid,
        ],
        timeout=config.job_timeout,
    )
    return {
        "success": proc.returncode == 0,
        "stdout": proc.stdout,
        "stderr": proc.stderr if proc.returncode != 0 else "",
        "exit_code": proc.returncode,
        "result_json": {"duration_ms": _duration_ms(start), "executor": "netops-connector-agent", "truncated": False},
    }


def run_snmp_walk(target_ip: str, payload: dict[str, Any], config: Config) -> dict[str, Any]:
    start = time.time()
    oid = str(payload.get("oid", "")).strip()
    _validate_oid(oid)
    community = str(payload.get("community", "public"))
    version = str(payload.get("version", "2c"))
    vflag = "-v2c" if version in ("2c", "2", "v2c") else "-v1"
    proc = run_command(
        [
            "snmpwalk",
            vflag,
            "-c",
            community,
            "-t",
            str(config.snmp_timeout),
            "-r",
            str(config.snmp_retries),
            target_ip,
            oid,
        ],
        timeout=max(config.job_timeout, 120),
    )
    lines = proc.stdout.splitlines()
    truncated = len(lines) > config.snmp_max_lines
    stdout = "\n".join(lines[: config.snmp_max_lines])
    if truncated:
        stdout += f"\n... truncated ({len(lines)} lines, max {config.snmp_max_lines})"
    return {
        "success": proc.returncode == 0,
        "stdout": stdout,
        "stderr": proc.stderr if proc.returncode != 0 else ("truncated output" if truncated else ""),
        "exit_code": proc.returncode,
        "result_json": {
            "duration_ms": _duration_ms(start),
            "executor": "netops-connector-agent",
            "truncated": truncated,
            "line_count": len(lines),
        },
    }


def run_ssh_command(target_ip: str, payload: dict[str, Any], config: Config) -> dict[str, Any]:
    start = time.time()
    command = str(payload.get("command", "")).strip()
    username = str(payload.get("username", "")).strip()
    password = str(payload.get("password", ""))
    port = int(payload.get("port", 22))
    if not username:
        raise ValueError("SSH payload requires username")
    if not command:
        raise ValueError("SSH payload requires command")

    try:
        validate_ssh_command(command)
    except SecurityPolicyError as exc:
        return {
            "success": False,
            "stdout": "",
            "stderr": str(exc),
            "exit_code": exc.exit_code,
            "result_json": {"duration_ms": _duration_ms(start), "blocked": True},
        }

    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    try:
        client.connect(
            target_ip,
            port=port,
            username=username,
            password=password,
            timeout=config.ssh_connect_timeout,
            allow_agent=False,
            look_for_keys=False,
        )
        _stdin, stdout, stderr = client.exec_command(command, timeout=config.ssh_command_timeout)
        out = stdout.read().decode("utf-8", errors="replace")
        err = stderr.read().decode("utf-8", errors="replace")
        exit_code = stdout.channel.recv_exit_status()
        return {
            "success": exit_code == 0,
            "stdout": out,
            "stderr": err,
            "exit_code": exit_code,
            "result_json": {"duration_ms": _duration_ms(start), "executor": "netops-connector-agent"},
        }
    finally:
        client.close()
