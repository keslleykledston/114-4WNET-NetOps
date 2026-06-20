#!/usr/bin/env bash
set -euo pipefail

pwd
find . -maxdepth 3 -type f | sort | sed 's#^\\./##' | head -300
find . -maxdepth 3 -type d | sort | sed 's#^\\./##' | head -200
rg -n "VSI|vsi|VPLS|vpls|l2circuits|l2-circuits|tenant|history|alarm|snapshot|discovery" . || true
