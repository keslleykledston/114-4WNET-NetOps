#!/usr/bin/env python3
"""Offline selftest for netops-connector-agent (no live NetOps server required)."""
from __future__ import annotations

import os
import sys
import tempfile
import unittest

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "infra", "connector-agent"))
sys.path.insert(0, ROOT)

from agent.config import load_config  # noqa: E402
from agent.heartbeat import build_heartbeat_payload  # noqa: E402
from agent.security import SecurityPolicyError, is_ssh_command_allowed, validate_ssh_command  # noqa: E402
from agent.utils import mask_string, sanitize_for_log  # noqa: E402
from agent.diagnostics import run_tcp_check  # noqa: E402
from agent.config import Config  # noqa: E402


class ConnectorAgentSelfTest(unittest.TestCase):
    def setUp(self) -> None:
        os.environ["CONNECTOR_NAME"] = "test-connector-01"
        os.environ["CONNECTOR_TOKEN"] = "nc_test_token_for_selftest_only"
        os.environ["NETOPS_SERVER_URL"] = "http://127.0.0.1:8085"
        os.environ["WG_ENABLED"] = "false"

    def test_config_loads(self) -> None:
        cfg = load_config()
        self.assertEqual(cfg.connector_name, "test-connector-01")
        self.assertIn("8085", cfg.netops_server_url)

    def test_readonly_blocks_destructive(self) -> None:
        with self.assertRaises(SecurityPolicyError):
            validate_ssh_command("system-view")
        with self.assertRaises(SecurityPolicyError):
            validate_ssh_command("display version; reload")
        self.assertFalse(is_ssh_command_allowed("configure terminal"))

    def test_readonly_allows_display(self) -> None:
        self.assertTrue(is_ssh_command_allowed("display version"))
        self.assertTrue(is_ssh_command_allowed("show ip route"))

    def test_heartbeat_payload(self) -> None:
        cfg = load_config()
        payload = build_heartbeat_payload(cfg)
        self.assertEqual(payload["connector_name"], cfg.connector_name)
        self.assertEqual(payload["status"], "ONLINE")
        self.assertEqual(payload["wireguard_status"], "DISABLED")
        self.assertIn("routes_count", payload)

    def test_secrets_masked_in_logs(self) -> None:
        raw = "community=SuperSecret123 token=nc_abcdefghijklmnopqrstuvwxyz"
        masked = mask_string(raw)
        self.assertNotIn("SuperSecret123", masked)
        data = sanitize_for_log({"password": "x", "command": "display version"})
        self.assertEqual(data["password"], "[redacted]")

    def test_tcp_check_localhost(self) -> None:
        cfg = load_config()
        # ephemeral port unlikely to listen
        result = run_tcp_check("127.0.0.1", 9, cfg)
        self.assertIn("open", result["result_json"])
        self.assertIn("duration_ms", result["result_json"])


def main() -> int:
    suite = unittest.defaultTestLoader.loadTestsFromTestCase(ConnectorAgentSelfTest)
    result = unittest.TextTestRunner(verbosity=2).run(suite)
    if result.wasSuccessful():
        print("connector-agent-selftest: OK")
        return 0
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
