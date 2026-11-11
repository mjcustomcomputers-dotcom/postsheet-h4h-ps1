#!/usr/bin/env bash
set -uo pipefail

G=$'\033[1;32m'; R=$'\033[1;31m'; Y=$'\033[1;33m'; C=$'\033[1;36m'; X=$'\033[0m'
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MISSION="$(cd "$HERE/.." && pwd)"
RUN="$(date -u +%Y%m%dT%H%M%SZ)-$$"
E="${PS1_EVIDENCE_ROOT:-$HOME/kernel-beer-labs/H4H-PS1-SUBMISSION/evidence}/$RUN"
mkdir -p "$E"

stage(){ printf '\n%s========== %s ==========%s\n' "$C" "$1" "$X"; }
gate(){
  local name="$1" script="$2" rc marker count
  [[ -f "$script" ]] || { printf 'HOLD | %s | Missing executable test source\n' "$name"; return 2; }
  bash -n "$script" > "$E/$name.syntax" 2>&1 || { printf 'FAIL | %s | Invalid Bash syntax\n' "$name"; return 1; }
  sha256sum "$script" >> "$E/test-sources.sha256"
  KB_EVIDENCE_DIR="$E" bash "$script" > "$E/$name.stdout" 2> "$E/$name.stderr"
  rc=$?
  marker="$(grep -E '^KB_GATE:PASS checks=[1-9][0-9]*$' "$E/$name.stdout" 2>/dev/null | tail -1)"
  count="${marker##*=}"
  if (( rc == 0 )) && [[ "$marker" == KB_GATE:PASS\ checks=* ]] && [[ "$count" =~ ^[1-9][0-9]*$ ]]; then
    printf '%sPASS%s | %s | %s assertions\n' "$G" "$X" "$name" "$count"
    return 0
  fi
  printf '%sFAIL%s | %s | exit=%s | missing/invalid assertion receipt\n' "$R" "$X" "$name" "$rc"
  return 1
}

BASE="${1:-}"; ADV="${2:-}"; OFFICIAL="${3:-}"
[[ -n "$BASE" && -n "$ADV" ]] || { printf 'USAGE | bash run-gates.sh BASELINE.sh ADVERSARIAL.sh [INDEPENDENT.sh]\n'; exit 2; }

BASE_RC=2; ADV_RC=2; INDEP_RC=2

stage "01 | BASELINE"
if gate baseline "$BASE"; then BASE_RC=0; else BASE_RC=$?; fi

if (( BASE_RC == 0 )); then
  stage "02 | ADVERSARIAL"
  if gate adversarial "$ADV"; then ADV_RC=0; else ADV_RC=$?; fi
fi

if (( BASE_RC == 0 && ADV_RC == 0 )) && [[ -n "$OFFICIAL" ]]; then
  stage "03 | INDEPENDENT SQL ORACLE"
  if gate independent "$OFFICIAL"; then INDEP_RC=0; else INDEP_RC=$?; fi
elif (( BASE_RC == 0 && ADV_RC == 0 )) && [[ -z "$OFFICIAL" ]]; then
  INDEP_RC=0
fi

SRC_REV="$(git -C "$MISSION" rev-parse HEAD 2>/dev/null || echo STANDALONE)"
{
  printf 'SOURCE=%s\nBASELINE_RC=%s\nADVERSARIAL_RC=%s\nINDEPENDENT_RC=%s\nEVIDENCE=%s\n' \
    "$SRC_REV" "$BASE_RC" "$ADV_RC" "$INDEP_RC" "$E"
} > "$E/gate-result.txt"
cat "$E/gate-result.txt"
(( BASE_RC == 0 && ADV_RC == 0 && INDEP_RC == 0 ))
