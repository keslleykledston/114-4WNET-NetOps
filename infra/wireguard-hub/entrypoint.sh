#!/bin/sh
set -eu
if [ ! -f /etc/wireguard/wg0.conf ]; then
  echo "netops-wg-hub: missing /etc/wireguard/wg0.conf (run tools/wireguard-hub-sync-peers.mjs)" >&2
  exit 1
fi
wg-quick up wg0
trap 'wg-quick down wg0' EXIT INT TERM
echo "netops-wg-hub: wg0 up on UDP 51820"
exec tail -f /dev/null
