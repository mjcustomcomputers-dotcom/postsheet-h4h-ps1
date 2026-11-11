#!/usr/bin/env bash
set -euo pipefail
M="$(cd "$(dirname "$0")/.." && pwd)"
E="$KB_EVIDENCE_DIR"
if [[ ! -f "$E/race.sqlite" ]]; then
  echo "FAIL | Missing persisted concurrent HTTP race database"
  exit 2
fi
python3 "$M/tests/sql-independent.py" "$E/race.sqlite"
