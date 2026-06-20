#!/usr/bin/env bash
set -euo pipefail

node tools/l2-circuit-huawei-vsi-selftest.mjs
node tools/l2-s6730-parser-selftest.mjs
node tools/vsi-vpls-parser-selftest.mjs
node tools/vsi-vpls-status-selftest.mjs
node tools/vsi-vpls-config-selftest.mjs
node tools/vsi-vpls-config-summary-selftest.mjs
cd workspace
pnpm run typecheck
