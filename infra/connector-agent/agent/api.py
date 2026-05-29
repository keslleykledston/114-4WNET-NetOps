from __future__ import annotations

import logging
from typing import Any

import requests

from .config import Config, api_base_url

logger = logging.getLogger("netops-connector")


class NetOpsApiClient:
    def __init__(self, config: Config):
        self.config = config
        self.base = api_base_url(config)
        self.session = requests.Session()
        self.session.headers.update(
            {
                "Authorization": f"Bearer {config.connector_token}",
                "Content-Type": "application/json",
                "User-Agent": f"netops-connector-agent/{config.agent_version}",
            }
        )

    def post_heartbeat(self, payload: dict[str, Any]) -> dict[str, Any]:
        url = f"{self.base}/connectors/heartbeat"
        resp = self.session.post(url, json=payload, timeout=30)
        resp.raise_for_status()
        return resp.json()

    def get_pending_jobs(self) -> list[dict[str, Any]]:
        url = f"{self.base}/connectors/jobs/pending"
        resp = self.session.get(url, timeout=30)
        resp.raise_for_status()
        data = resp.json()
        if isinstance(data, list):
            return data
        return data.get("jobs", [])

    def post_job_result(self, job_id: int | str, payload: dict[str, Any]) -> dict[str, Any]:
        url = f"{self.base}/connectors/jobs/{job_id}/result"
        resp = self.session.post(url, json=payload, timeout=60)
        resp.raise_for_status()
        return resp.json()

    def health_ping(self) -> bool:
        try:
            root = self.config.netops_server_url.replace("/api", "")
            resp = self.session.get(f"{root}/api/healthz", timeout=10)
            return resp.status_code == 200
        except requests.RequestException:
            return False
