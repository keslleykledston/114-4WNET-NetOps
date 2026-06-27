#!/usr/bin/env bash
# Publica skills NetOps no gateway Telegram (profile default ou netops).
set -euo pipefail

REPO_ROOT="${NETOPS_REPO_ROOT:-$(cd "$(dirname "$0")/../.." && pwd)}"
HERMES_BIN="${HERMES_BIN:-$HOME/.hermes/hermes-agent/venv/bin/hermes}"
HERMES_ROOT="${HERMES_ROOT:-$HOME/.hermes}"
MODE="${1:-bridge}"

usage() {
  cat <<EOF
Usage: telegram-setup.sh [bridge|netops]

  bridge  — symlink skills + quick_commands no gateway default (padrão)
  netops  — gateway passa a usar profile netops (HERMES_HOME=profiles/netops)

Repo: $REPO_ROOT
EOF
}

if [[ "${1:-}" == "-h" || "${1:-}" == "--help" ]]; then
  usage
  exit 0
fi

if [[ "$MODE" != "bridge" && "$MODE" != "netops" ]]; then
  echo "Modo inválido: $MODE" >&2
  usage
  exit 2
fi

echo "==> Instalando/atualizando profile netops"
"$HERMES_BIN" profile install "$REPO_ROOT/hermes" --name netops --force -y

_link_skills() {
  local target_dir="$1"
  mkdir -p "$target_dir"
  for skill_dir in "$REPO_ROOT/hermes/skills"/*/; do
    name=$(basename "$skill_dir")
    ln -sfn "$skill_dir" "$target_dir/$name"
  done
  echo "    skills em $target_dir"
}

_merge_quick_commands() {
  local config_file="$1"
  python3 - "$config_file" "$REPO_ROOT/hermes/config.yaml" <<'PY'
import sys
from pathlib import Path

try:
    import yaml
except ImportError:
    print("PyYAML necessário: pip install pyyaml", file=sys.stderr)
    sys.exit(1)

target = Path(sys.argv[1])
overlay = Path(sys.argv[2])

data = {}
if target.exists():
    data = yaml.safe_load(target.read_text()) or {}
overlay_data = yaml.safe_load(overlay.read_text()) or {}
qc = overlay_data.get("quick_commands") or {}
if qc:
    data["quick_commands"] = {**(data.get("quick_commands") or {}), **qc}
    target.write_text(yaml.safe_dump(data, sort_keys=False, allow_unicode=True))
    print(f"    quick_commands mesclados em {target}")
PY
}

_link_bundles() {
  local target_dir="$1"
  mkdir -p "$target_dir"
  for bundle in "$REPO_ROOT/hermes/skill-bundles"/*.yaml; do
    [[ -f "$bundle" ]] || continue
    ln -sfn "$bundle" "$target_dir/$(basename "$bundle")"
  done
  echo "    bundles em $target_dir"
}

_append_soul_snippet() {
  local soul_file="$1"
  local marker="<!-- netops-telegram -->"
  if [[ -f "$soul_file" ]] && grep -q "$marker" "$soul_file" 2>/dev/null; then
    echo "    SOUL já contém snippet NetOps"
    return
  fi
  cat >>"$soul_file" <<'SNIP'

<!-- netops-telegram -->
## NetOps (Telegram)

Comandos: `/health` `/devices` `/flags` `/ndiag` `/nssh` `/nq` `/ntest` `/nop`
Ping/latência/jitter: `hermes/scripts/netops-diag.sh intent "<frase>"`
Guia: `hermes/TELEGRAM.md`
SNIP
  echo "    snippet NetOps adicionado a $soul_file"
}

_copy_netops_env_hints() {
  local dst="$1"
  touch "$dst"
  for kv in "NETOPS_REPO_ROOT=$REPO_ROOT" "NETOPS_API_URL=http://127.0.0.1:8080"; do
    key="${kv%%=*}"
    if ! grep -q "^${key}=" "$dst" 2>/dev/null; then
      echo "$kv" >>"$dst"
    fi
  done
  echo "    NETOPS_* vars em $dst (credenciais Telegram: configure manualmente)"
}

if [[ "$MODE" == "bridge" ]]; then
  echo "==> Modo bridge: publicando no gateway default ($HERMES_ROOT)"
  _link_skills "$HERMES_ROOT/skills"
  _link_bundles "$HERMES_ROOT/skill-bundles"
  _merge_quick_commands "$HERMES_ROOT/config.yaml"
  _append_soul_snippet "$HERMES_ROOT/SOUL.md"

elif [[ "$MODE" == "netops" ]]; then
  echo "==> Modo netops: gateway no profile netops"
  NETOPS_HOME="$HERMES_ROOT/profiles/netops"
  _copy_netops_env_hints "$NETOPS_HOME/.env"
  _merge_quick_commands "$NETOPS_HOME/config.yaml"

  SERVICE="$HOME/.config/systemd/user/hermes-gateway.service"
  if [[ -f "$SERVICE" ]]; then
    if grep -q 'HERMES_HOME=' "$SERVICE"; then
      sed -i "s|Environment=.*HERMES_HOME=.*|Environment=\"HERMES_HOME=$NETOPS_HOME\"|" "$SERVICE" || \
        sed -i "s|Environment=\"HERMES_HOME=.*\"|Environment=\"HERMES_HOME=$NETOPS_HOME\"|" "$SERVICE"
    else
      sed -i "/Environment=\"PATH=/a Environment=\"HERMES_HOME=$NETOPS_HOME\"" "$SERVICE"
    fi
    echo "    systemd atualizado: HERMES_HOME=$NETOPS_HOME"
  fi
fi

echo "==> Reiniciando gateway"
if "$HERMES_BIN" gateway status 2>/dev/null | grep -q "running"; then
  "$HERMES_BIN" gateway restart 2>/dev/null || "$HERMES_BIN" gateway stop && sleep 2 && "$HERMES_BIN" gateway start
else
  "$HERMES_BIN" gateway start 2>/dev/null || "$HERMES_BIN" gateway run &
fi

sleep 2
echo ""
echo "✓ Telegram NetOps pronto (modo: $MODE)"
echo ""
echo "Comandos no Telegram:"
echo "  /health /devices /flags /docker     — instantâneo"
echo "  /ndiag /nop /nssh /nq /ntest       — sub-agentes"
echo ""
echo "Guia: $REPO_ROOT/hermes/TELEGRAM.md"
