#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../../../" && pwd)"

echo "Running static validation for network map..."
pnpm -C "$ROOT_DIR/workspace" exec tsc -p artifacts/netops-manager/tsconfig.json --noEmit

echo "Checking for project lint/test commands..."
if pnpm -C "$ROOT_DIR/workspace" run --silent 2>/dev/null | grep -Eq '(^|[[:space:]])(lint|test)([[:space:]]|$)'; then
  echo "lint/test scripts found. Run them manually if needed:"
  pnpm -C "$ROOT_DIR/workspace" run
else
  echo "No lint/test scripts detected in workspace package.json."
fi

echo "Static validation done."
