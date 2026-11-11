#!/usr/bin/env bash
set -euo pipefail
M="$(cd "$(dirname "$0")/.." && pwd)"
bash "$M/scripts/run-node-suite.sh" adversarial
