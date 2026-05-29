#!/bin/bash
set -euo pipefail

WG_INTERFACE="${WG_INTERFACE:-wg-netops}"

if ip link show "$WG_INTERFACE" >/dev/null 2>&1; then
  ip link set down dev "$WG_INTERFACE" 2>/dev/null || true
  ip link delete dev "$WG_INTERFACE" 2>/dev/null || true
  echo "[wg-down] removed $WG_INTERFACE"
fi
