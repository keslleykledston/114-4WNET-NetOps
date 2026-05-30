from __future__ import annotations

import logging
import re
import subprocess
from typing import Any

SECRET_KEYS = re.compile(
    r"(password|token|community|secret|authorization|credential|private[_-]?key)",
    re.I,
)
SECRET_VALUE_PATTERNS = [
    re.compile(r"(?i)(password|community|token|secret)\s*[:=]\s*\S+"),
    re.compile(r"Bearer\s+\S+"),
    re.compile(r"nc_[A-Za-z0-9_-]{20,}"),
]


def mask_string(value: str) -> str:
    out = value
    for pattern in SECRET_VALUE_PATTERNS:
        out = pattern.sub(lambda m: m.group(0).split("=")[0] + "=[redacted]" if "=" in m.group(0) else "[redacted]", out)
    return out


def sanitize_for_log(data: Any) -> Any:
    if isinstance(data, dict):
        return {
            k: "[redacted]" if SECRET_KEYS.search(str(k)) else sanitize_for_log(v)
            for k, v in data.items()
        }
    if isinstance(data, list):
        return [sanitize_for_log(item) for item in data]
    if isinstance(data, str):
        return mask_string(data)
    return data


def setup_logging(log_dir: str, level: str) -> logging.Logger:
    import os

    os.makedirs(log_dir, exist_ok=True)
    logger = logging.getLogger("netops-connector")
    logger.setLevel(getattr(logging, level, logging.INFO))
    logger.handlers.clear()

    fmt = logging.Formatter("%(asctime)s %(levelname)s %(message)s")
    fh = logging.FileHandler(f"{log_dir}/agent.log")
    fh.setFormatter(fmt)
    sh = logging.StreamHandler()
    sh.setFormatter(fmt)
    logger.addHandler(fh)
    logger.addHandler(sh)
    return logger


def run_command(
    args: list[str],
    timeout: int,
    *,
    check: bool = False,
    env: dict[str, str] | None = None,
) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        args,
        capture_output=True,
        text=True,
        timeout=timeout,
        check=check,
        env=env,
    )
