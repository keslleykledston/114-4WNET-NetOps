#!/bin/bash
set -euo pipefail

WG_CONFIG_PATH="${WG_CONFIG_PATH:-/etc/netops-connector/wireguard/netops.conf}"
WG_INTERFACE="${WG_INTERFACE:-wg-netops}"

if [ ! -f "$WG_CONFIG_PATH" ]; then
  echo "[wg-up] config not found: $WG_CONFIG_PATH"
  exit 1
fi

if ! ip link show "$WG_INTERFACE" >/dev/null 2>&1; then
  ip link add dev "$WG_INTERFACE" type wireguard 2>/dev/null || true
fi

wg setconf "$WG_INTERFACE" "$WG_CONFIG_PATH"
ip link set up dev "$WG_INTERFACE"
echo "[wg-up] interface $WG_INTERFACE is up"
