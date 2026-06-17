from __future__ import annotations

import logging
import re
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


ANSI_ESCAPE_RE = re.compile(r"\x1b\[[0-9;]*[A-Za-z]")
PASSWORD_CHANGE_RE = re.compile(r"Change now\?\s*\[Y/N\]:", re.IGNORECASE)
MORE_RE = re.compile(r"(?:----\s*More\s*----|More:)", re.IGNORECASE)
SHELL_PROMPT_RE = re.compile(r"^(?:<[^>\r\n]+>|\[[^\]\r\n]+\])\s*$")


def _normalize_shell_text(value: str) -> str:
    return ANSI_ESCAPE_RE.sub("", value).replace("\r", "")


def _has_shell_prompt(buffer: str) -> bool:
    lines = [line.strip() for line in _normalize_shell_text(buffer).split("\n") if line.strip()]
    return bool(lines and SHELL_PROMPT_RE.match(lines[-1]))


def _parse_shell_command_output(buffer: str, command: str) -> str:
    output: list[str] = []
    seen_command = False

    for line in _normalize_shell_text(buffer).split("\n"):
        trimmed = line.rstrip()
        compact = trimmed.strip()
        if not compact:
            continue
        if PASSWORD_CHANGE_RE.search(compact):
            continue
        if SHELL_PROMPT_RE.match(compact):
            continue

        inline_prompt = re.match(r"^<[^>\n]+>(.*)$", compact)
        command_text = inline_prompt.group(1).strip() if inline_prompt else compact

        if not seen_command:
            if command_text == command:
                seen_command = True
            continue

        output.append(trimmed)

    return "\n".join(output).strip()


def _wait_for_shell_prompt(
    channel: paramiko.Channel,
    timeout: int,
    *,
    decline_password_change: bool = False,
) -> str:
    deadline = time.time() + timeout
    buffer = ""
    declined_password_change = False

    while time.time() < deadline:
        if channel.recv_ready():
            chunk = channel.recv(65535).decode(errors="replace")
            buffer += chunk

            if decline_password_change and not declined_password_change and PASSWORD_CHANGE_RE.search(buffer):
                channel.send("N\n")
                declined_password_change = True

            if MORE_RE.search(buffer):
                channel.send(" ")
                buffer = MORE_RE.sub("", buffer)

            if _has_shell_prompt(buffer):
                return buffer
        else:
            time.sleep(0.05)

    raise TimeoutError(f"SSH shell timed out after {timeout}s waiting for device prompt")


def _open_ssh_shell(target_ip: str, payload: dict[str, Any], config: Config) -> tuple[paramiko.SSHClient, paramiko.Channel]:
    username = str(payload.get("username", "")).strip()
    password = str(payload.get("password", ""))
    port = int(payload.get("port", 22))
    if not username:
        raise ValueError("SSH payload requires username")

    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    client.connect(
        target_ip,
        port=port,
        username=username,
        password=password,
        timeout=config.ssh_connect_timeout,
        banner_timeout=config.ssh_connect_timeout,
        auth_timeout=config.ssh_connect_timeout,
        look_for_keys=False,
        allow_agent=False,
    )
    channel = client.invoke_shell(term="vt100", width=240, height=120)
    channel.settimeout(0.0)
    _wait_for_shell_prompt(channel, config.ssh_connect_timeout, decline_password_change=True)
    return client, channel


def _run_ssh_commands_interactive(target_ip: str, payload: dict[str, Any], config: Config, commands: list[str]) -> list[dict[str, str]]:
    for command in commands:
        validate_ssh_command(command)

    client, channel = _open_ssh_shell(target_ip, payload, config)
    try:
        setup_command = "screen-length 0 temporary"
        try:
            validate_ssh_command(setup_command)
            channel.send(f"{setup_command}\n")
            _wait_for_shell_prompt(channel, config.ssh_connect_timeout)
        except Exception as exc:
            logger.warning("failed to configure terminal paging: %s", exc)

        results: list[dict[str, str]] = []
        for command in commands:
            channel.send(f"{command}\n")
            raw = _wait_for_shell_prompt(channel, config.ssh_command_timeout)
            results.append({"command": command, "output": _parse_shell_command_output(raw, command), "error": ""})
        return results
    finally:
        try:
            channel.close()
        finally:
            client.close()


def run_ssh_command(target_ip: str, payload: dict[str, Any], config: Config) -> dict[str, Any]:
    start = time.time()
    command = str(payload.get("command", "")).strip()
    if not command:
        raise ValueError("SSH payload requires command")

    try:
        results = _run_ssh_commands_interactive(target_ip, payload, config, [command])
    except SecurityPolicyError as exc:
        return {
            "success": False,
            "stdout": "",
            "stderr": str(exc),
            "exit_code": exc.exit_code,
            "result_json": {"duration_ms": _duration_ms(start), "blocked": True},
        }
    result = results[0]
    return {
        "success": not result["error"],
        "stdout": result["output"],
        "stderr": result["error"],
        "exit_code": 0 if not result["error"] else 1,
        "result_json": {"duration_ms": _duration_ms(start), "executor": "netops-connector-agent"},
    }


def run_ssh_config_bundle(target_ip: str, payload: dict[str, Any], config: Config) -> dict[str, Any]:
    start = time.time()
    raw_commands = payload.get("commands")
    if not isinstance(raw_commands, list):
        raise ValueError("SSH_CONFIG_BUNDLE requires commands")
    commands = [str(command).strip() for command in raw_commands if str(command).strip()]
    if not commands:
        raise ValueError("SSH_CONFIG_BUNDLE requires commands")

    try:
        results = _run_ssh_commands_interactive(target_ip, payload, config, commands)
    except SecurityPolicyError as exc:
        return {
            "success": False,
            "stdout": "",
            "stderr": str(exc),
            "exit_code": exc.exit_code,
            "result_json": {"duration_ms": _duration_ms(start), "blocked": True},
        }

    sections = [f"! === {item['command']} ===\n{item['output']}".rstrip() for item in results]
    errors = [f"{item['command']}: {item['error']}" for item in results if item["error"]]
    return {
        "success": len(errors) == 0,
        "stdout": "\n".join(sections).strip(),
        "stderr": "\n".join(errors),
        "exit_code": 0 if len(errors) == 0 else 1,
        "result_json": {
            "duration_ms": _duration_ms(start),
            "executor": "netops-connector-agent",
            "command_count": len(commands),
            "interactive_shell": True,
        },
    }
