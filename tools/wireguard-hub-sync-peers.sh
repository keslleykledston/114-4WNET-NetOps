#!/usr/bin/env bash
# Gera infra/wireguard-hub/secrets/wg0.conf a partir do .env e connectors no Postgres.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
set -a
# shellcheck disable=SC1091
[ -f .env ] && source .env
set +a

: "${NETOPS_WG_HUB_PRIVATE_KEY:?Defina NETOPS_WG_HUB_PRIVATE_KEY no .env}"
NETOPS_WG_SERVER_ADDRESS="${NETOPS_WG_SERVER_ADDRESS:-10.255.0.1}"
NETOPS_WG_PORT="${NETOPS_WG_PORT:-51820}"
SECRETS_DIR="$ROOT/infra/wireguard-hub/secrets"
CONF="$SECRETS_DIR/wg0.conf"
mkdir -p "$SECRETS_DIR"
chmod 700 "$SECRETS_DIR"

ADDR="$NETOPS_WG_SERVER_ADDRESS"
[[ "$ADDR" == */* ]] || ADDR="${ADDR}/24"

{
  echo "[Interface]"
  echo "Address = $ADDR"
  echo "ListenPort = $NETOPS_WG_PORT"
  echo "PrivateKey = $NETOPS_WG_HUB_PRIVATE_KEY"
  echo "PostUp = iptables -A FORWARD -i %i -j ACCEPT; iptables -t nat -A POSTROUTING -o eth0 -j MASQUERADE 2>/dev/null || true"
  echo "PostDown = iptables -D FORWARD -i %i -j ACCEPT; iptables -t nat -D POSTROUTING -o eth0 -j MASQUERADE 2>/dev/null || true"
  echo ""
} > "$CONF"

PEERS="$(
  docker exec netops-db psql -U "${POSTGRES_USER:-netops}" -d "${POSTGRES_DB:-netops}" -t -A -F $'\t' -c \
    "SELECT name, wireguard_ip, wireguard_public_key FROM connectors
     WHERE wireguard_public_key IS NOT NULL AND wireguard_ip IS NOT NULL ORDER BY id;"
)"

COUNT=0
while IFS=$'\t' read -r name ip pubkey; do
  [ -z "$pubkey" ] && continue
  ip="${ip%%/*}"
  {
    echo "# $name"
    echo "[Peer]"
    echo "PublicKey = $pubkey"
    echo "AllowedIPs = ${ip}/32"
    echo ""
  } >> "$CONF"
  COUNT=$((COUNT + 1))
done <<< "$PEERS"

chmod 600 "$CONF"
echo "Wrote $CONF with $COUNT peer(s)."
