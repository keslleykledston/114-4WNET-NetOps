#!/usr/bin/env python3
"""Parse ping output → latency/jitter summary (Linux + Huawei heuristics)."""
from __future__ import annotations

import json
import re
import sys


def parse_linux_rtt(text: str) -> dict | None:
    m = re.search(
        r"rtt min/avg/max/(?:mdev|stddev)\s*=\s*([\d.]+)/([\d.]+)/([\d.]+)/([\d.]+)\s*ms",
        text,
        re.I,
    )
    if not m:
        return None
    return {
        "min_ms": float(m.group(1)),
        "avg_ms": float(m.group(2)),
        "max_ms": float(m.group(3)),
        "jitter_ms": float(m.group(4)),
        "jitter_label": "mdev",
    }


def parse_packet_loss(text: str) -> float | None:
    m = re.search(r"(\d+(?:\.\d+)?)\s*%\s*packet loss", text, re.I)
    return float(m.group(1)) if m else None


def parse_huawei(text: str) -> dict | None:
    # Huawei: min/avg/max RTT lines or "round-trip min/avg/max = X/Y/Z ms"
    m = re.search(
        r"(?:round-trip|round trip).*?min(?:imum)?[/\s]+avg(?:erage)?[/\s]+max(?:imum)?\s*[=:]\s*([\d.]+)/([\d.]+)/([\d.]+)\s*ms",
        text,
        re.I | re.S,
    )
    if m:
        return {
            "min_ms": float(m.group(1)),
            "avg_ms": float(m.group(2)),
            "max_ms": float(m.group(3)),
            "jitter_ms": round(float(m.group(3)) - float(m.group(1)), 3),
            "jitter_label": "max-min",
        }
    times = [float(x) for x in re.findall(r"time[=<]\s*([\d.]+)\s*ms", text, re.I)]
    if len(times) >= 2:
        avg = sum(times) / len(times)
        jitter = sum(abs(t - avg) for t in times) / len(times)
        return {
            "min_ms": min(times),
            "avg_ms": round(avg, 3),
            "max_ms": max(times),
            "jitter_ms": round(jitter, 3),
            "jitter_label": "mean-deviation",
        }
    return None


def summarize(text: str, target: str = "") -> dict:
    stats = parse_linux_rtt(text) or parse_huawei(text)
    loss = parse_packet_loss(text)
    out: dict = {"target": target, "ok": bool(stats)}
    if stats:
        out.update(stats)
    if loss is not None:
        out["packet_loss_pct"] = loss
    transmitted = re.search(r"(\d+)\s+packets?\s+transmitted", text, re.I)
    received = re.search(r"(\d+)\s+received", text, re.I)
    if transmitted and received:
        out["packets_tx"] = int(transmitted.group(1))
        out["packets_rx"] = int(received.group(1))
    return out


def format_telegram(summary: dict, raw: str) -> str:
    if not summary.get("ok"):
        return f"Ping sem estatísticas parseáveis.\n\n{raw[:1500]}"

    lines = [
        f"🎯 {summary.get('target', '?')}",
        f"📶 latência média: {summary['avg_ms']} ms",
        f"   min / max: {summary['min_ms']} / {summary['max_ms']} ms",
        f"📊 jitter ({summary.get('jitter_label', 'mdev')}): {summary['jitter_ms']} ms",
    ]
    if "packet_loss_pct" in summary:
        lines.append(f"📉 perda: {summary['packet_loss_pct']}%")
    if "packets_tx" in summary:
        lines.append(f"📦 pacotes: {summary['packets_rx']}/{summary['packets_tx']}")
    return "\n".join(lines)


if __name__ == "__main__":
    target = ""
    raw = sys.stdin.read()
    args = [a for a in sys.argv[1:] if a != "--json"]
    if args:
        if args[0] == "-":
            target = args[1] if len(args) > 1 else ""
        else:
            raw = open(args[0], encoding="utf-8").read()
            target = args[1] if len(args) > 1 else ""
    summary = summarize(raw, target)
    if "--json" in sys.argv:
        print(json.dumps(summary, indent=2))
    else:
        print(format_telegram(summary, raw))
