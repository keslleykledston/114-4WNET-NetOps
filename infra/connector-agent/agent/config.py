from __future__ import annotations

import os
from dataclasses import dataclass

from dotenv import load_dotenv

load_dotenv()


@dataclass(frozen=True)
class Config:
    connector_name: str
    connector_token: str
    netops_server_url: str
    heartbeat_interval: int
    job_poll_interval: int
    job_timeout: int
    wg_enabled: bool
    wg_interface: str
    wg_config_path: str
    lan_interface: str
    wan_interface: str
    ssh_connect_timeout: int
    ssh_command_timeout: int
    snmp_timeout: int
    snmp_retries: int
    snmp_max_lines: int
    log_level: str
    log_dir: str
    state_dir: str
    agent_version: str


def _env_bool(key: str, default: bool = False) -> bool:
    raw = os.getenv(key, str(default)).strip().lower()
    return raw in ("1", "true", "yes", "on")


def _env_int(key: str, default: int) -> int:
    try:
        return int(os.getenv(key, str(default)))
    except ValueError:
        return default


def load_config() -> Config:
    connector_name = os.getenv("CONNECTOR_NAME", "").strip()
    connector_token = os.getenv("CONNECTOR_TOKEN", "").strip()
    netops_server_url = os.getenv("NETOPS_SERVER_URL", "").strip().rstrip("/")

    missing = []
    if not connector_name:
        missing.append("CONNECTOR_NAME")
    if not connector_token or connector_token == "change-me":
        missing.append("CONNECTOR_TOKEN")
    if not netops_server_url:
        missing.append("NETOPS_SERVER_URL")
    if missing:
        raise ValueError(f"Missing or invalid required env: {', '.join(missing)}")

    return Config(
        connector_name=connector_name,
        connector_token=connector_token,
        netops_server_url=netops_server_url,
        heartbeat_interval=_env_int("HEARTBEAT_INTERVAL", 60),
        job_poll_interval=_env_int("JOB_POLL_INTERVAL", 10),
        job_timeout=_env_int("JOB_TIMEOUT", 60),
        wg_enabled=_env_bool("WG_ENABLED", False),
        wg_interface=os.getenv("WG_INTERFACE", "wg-netops").strip(),
        wg_config_path=os.getenv("WG_CONFIG_PATH", "/etc/netops-connector/wireguard/netops.conf").strip(),
        lan_interface=os.getenv("LAN_INTERFACE", "eth0").strip(),
        wan_interface=os.getenv("WAN_INTERFACE", "eth0").strip(),
        ssh_connect_timeout=_env_int("SSH_CONNECT_TIMEOUT", 10),
        ssh_command_timeout=_env_int("SSH_COMMAND_TIMEOUT", 60),
        snmp_timeout=_env_int("SNMP_TIMEOUT", 5),
        snmp_retries=_env_int("SNMP_RETRIES", 1),
        snmp_max_lines=_env_int("SNMP_MAX_LINES", 500),
        log_level=os.getenv("LOG_LEVEL", "INFO").upper(),
        log_dir=os.getenv("LOG_DIR", "/var/log/netops-connector"),
        state_dir=os.getenv("STATE_DIR", "/var/run/netops-connector"),
        agent_version=os.getenv("AGENT_VERSION", "1.0.0"),
    )


def api_base_url(config: Config) -> str:
    base = config.netops_server_url
    if base.endswith("/api"):
        return base
    return f"{base}/api"
