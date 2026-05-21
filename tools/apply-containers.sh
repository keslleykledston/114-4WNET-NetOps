#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

if [ "$#" -eq 0 ]; then
  set -- api web
fi

for service in "$@"; do
  case "$service" in
    api|web|migrate)
      ;;
    *)
      echo "Refusing unknown or unsafe service: $service" >&2
      echo "Allowed: api web migrate" >&2
      exit 2
      ;;
  esac
done

echo "Applying changes to containers: $*"
echo "Database volume will not be removed."

export DOCKER_BUILDKIT=1
export COMPOSE_DOCKER_CLI_BUILD=1

docker compose up -d --build "$@"
docker compose ps
