from __future__ import annotations

import time
from typing import Any

from lxml import etree
from lxml.etree import _Element
from ncclient import manager

from .config import Config

WRITE_RPC_NAMES = {
    "edit-config",
    "copy-config",
    "delete-config",
    "lock",
    "unlock",
    "commit",
    "discard-changes",
    "validate",
    "create-subscription",
}

HUAWEI_MODELS = {"NE8000", "NE40", "S6730"}


def _duration_ms(start: float) -> int:
    return int((time.time() - start) * 1000)


def _normalize_text(value: Any) -> str:
    return str(value or "").strip()


def _device_params(payload: dict[str, Any]) -> dict[str, Any]:
    vendor = _normalize_text(payload.get("vendor")).lower()
    platform = _normalize_text(payload.get("platform")).upper()
    if "huawei" in vendor or platform in HUAWEI_MODELS:
        return {"name": "huawei"}
    return {}


def _netconf_port(payload: dict[str, Any], target_port: int | None) -> int:
    raw = payload.get("port", target_port or 830)
    try:
        port = int(raw)
    except (TypeError, ValueError):
        port = 830
    return port if port > 0 else 830


def _connect(target_ip: str, username: str, password: str, port: int, config: Config, payload: dict[str, Any]):
    kwargs = {
        "host": target_ip,
        "port": port,
        "username": username,
        "password": password,
        "hostkey_verify": False,
        "allow_agent": False,
        "look_for_keys": False,
        "timeout": max(config.job_timeout, 15),
        "banner_timeout": max(config.ssh_connect_timeout, 5),
        "auth_timeout": max(config.ssh_connect_timeout, 5),
    }
    params = _device_params(payload)
    if params:
        kwargs["device_params"] = params
    return manager.connect(**kwargs)


def _response_xml_text(response: Any) -> str:
    xml_text = getattr(response, "xml", None) or getattr(response, "data_xml", None) or str(response)
    try:
        parsed = etree.fromstring(xml_text.encode("utf-8") if isinstance(xml_text, str) else xml_text)
        return etree.tostring(parsed, encoding="unicode", pretty_print=True)
    except Exception:
        return str(xml_text)


def _success_result(start: float, operation: str, stdout: str, payload: dict[str, Any]) -> dict[str, Any]:
    return {
        "success": True,
        "stdout": stdout,
        "stderr": "",
        "exit_code": 0,
        "result_json": {
            "duration_ms": _duration_ms(start),
            "executor": "netops-connector-agent",
            "operation": operation,
            "vendor": payload.get("vendor"),
            "platform": payload.get("platform"),
            "port": payload.get("port", 830),
        },
    }


def _error_result(start: float, operation: str, exc: Exception, payload: dict[str, Any]) -> dict[str, Any]:
    return {
        "success": False,
        "stdout": "",
        "stderr": str(exc),
        "exit_code": 1,
        "result_json": {
            "duration_ms": _duration_ms(start),
            "executor": "netops-connector-agent",
            "operation": operation,
            "vendor": payload.get("vendor"),
            "platform": payload.get("platform"),
            "port": payload.get("port", 830),
            "error": type(exc).__name__,
        },
    }


def _reject_write_rpc(rpc_name: str) -> None:
    if rpc_name in WRITE_RPC_NAMES:
        raise ValueError(f"NETCONF RPC '{rpc_name}' is write-capable and blocked in read-only mode")


def _rpc_operation_name(request: _Element) -> str:
    name = etree.QName(request).localname
    if name == "rpc":
        child = next(iter(request), None)
        if child is not None:
            return etree.QName(child).localname
    return name


def _dispatch_rpc(session, rpc_value: str):
    if rpc_value.startswith("<"):
        request = etree.fromstring(rpc_value.encode("utf-8"))
        rpc_name = _rpc_operation_name(request)
        _reject_write_rpc(rpc_name)
        if etree.QName(request).localname == "rpc":
            request = next(iter(request), None)
            if request is None:
                raise ValueError("NETCONF rpc wrapper requires one child element")
        return session.dispatch(request)

    rpc_name = rpc_value.lower()
    _reject_write_rpc(rpc_name)
    if rpc_name == "get":
        return session.get()
    if rpc_name == "get-config":
        return session.get_config(source="running")
    if rpc_name == "get-schema":
        raise ValueError("get-schema requires a vendor-specific XML payload in this version")
    raise ValueError(f"Unsupported NETCONF RPC: {rpc_value}")


def run_netconf_get(target_ip: str, target_port: int | None, payload: dict[str, Any], config: Config) -> dict[str, Any]:
    start = time.time()
    username = _normalize_text(payload.get("username"))
    password = _normalize_text(payload.get("password"))
    if not username:
        raise ValueError("NETCONF payload requires username")
    if not password:
        raise ValueError("NETCONF payload requires password")

    port = _netconf_port(payload, target_port)
    try:
        with _connect(target_ip, username, password, port, config, payload) as session:
            response = session.get()
            stdout = _response_xml_text(response)
            return _success_result(start, "get", stdout, {**payload, "port": port})
    except Exception as exc:
        return _error_result(start, "get", exc, {**payload, "port": port})


def run_netconf_get_config(target_ip: str, target_port: int | None, payload: dict[str, Any], config: Config) -> dict[str, Any]:
    start = time.time()
    username = _normalize_text(payload.get("username"))
    password = _normalize_text(payload.get("password"))
    if not username:
        raise ValueError("NETCONF payload requires username")
    if not password:
        raise ValueError("NETCONF payload requires password")

    port = _netconf_port(payload, target_port)
    try:
        with _connect(target_ip, username, password, port, config, payload) as session:
            source = _normalize_text(payload.get("source")) or "running"
            response = session.get_config(source=source)
            stdout = _response_xml_text(response)
            return _success_result(start, "get-config", stdout, {**payload, "port": port, "source": source})
    except Exception as exc:
        return _error_result(start, "get-config", exc, {**payload, "port": port})


def run_netconf_rpc(target_ip: str, target_port: int | None, payload: dict[str, Any], config: Config) -> dict[str, Any]:
    start = time.time()
    username = _normalize_text(payload.get("username"))
    password = _normalize_text(payload.get("password"))
    if not username:
        raise ValueError("NETCONF payload requires username")
    if not password:
        raise ValueError("NETCONF payload requires password")

    rpc_value = _normalize_text(payload.get("rpc"))
    if not rpc_value:
        raise ValueError("NETCONF payload requires rpc")

    port = _netconf_port(payload, target_port)
    try:
        with _connect(target_ip, username, password, port, config, payload) as session:
            response = _dispatch_rpc(session, rpc_value)
            stdout = _response_xml_text(response)
            return _success_result(start, rpc_value if not rpc_value.startswith("<") else "rpc", stdout, {**payload, "port": port})
    except Exception as exc:
        return _error_result(start, rpc_value, exc, {**payload, "port": port})
