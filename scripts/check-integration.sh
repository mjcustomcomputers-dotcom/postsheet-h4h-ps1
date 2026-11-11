#!/usr/bin/env bash
set -uo pipefail

ROOT="$(git rev-parse --show-toplevel)" || exit 1
M="$ROOT/missions/H4H-PS1"
CONFIG="$M/infrastructure/TEST-INTEGRATION.env"

source "$CONFIG"

G=$'\033[1;32m'
R=$'\033[1;31m'
Y=$'\033[1;33m'
C=$'\033[1;36m'
X=$'\033[0m'

printf '\n%s========== KERNEL BEER OS | PS1 INTEGRATION ==========%s\n' "$C" "$X"

ERRORS=0
READY=0

for FIELD in \
  BASELINE_ENTRYPOINT \
  ADVERSARIAL_ENTRYPOINT \
  INDEPENDENT_ENTRYPOINT
do
  VALUE="${!FIELD:-}"

  if [[ -z "$VALUE" ]]; then
    printf '%sHOLD%s | %s | Source path not assigned\n' \
      "$Y" "$X" "$FIELD"
    continue
  fi

  if [[ "$VALUE" = /* || "$VALUE" == *..* ]]; then
    printf '%sFAIL%s | %s | Unsafe relative path\n' \
      "$R" "$X" "$FIELD"
    ERRORS=$((ERRORS+1))
    continue
  fi

  FILE="$M/$VALUE"

  if [[ ! -f "$FILE" ]]; then
    printf '%sFAIL%s | %s | Missing: %s\n' \
      "$R" "$X" "$FIELD" "$FILE"
    ERRORS=$((ERRORS+1))
    continue
  fi

  if ! bash -n "$FILE"; then
    printf '%sFAIL%s | %s | Shell syntax error\n' \
      "$R" "$X" "$FIELD"
    ERRORS=$((ERRORS+1))
    continue
  fi

  printf '%sPASS%s | %s | %s\n' \
    "$G" "$X" "$FIELD" "$FILE"

  READY=$((READY+1))
done

printf '\n%s========== FINAL RESULT ==========%s\n' "$C" "$X"
printf 'SOURCE | %s\n' "$(git rev-parse HEAD)"
printf 'METHOD | Source-bound application test integration\n'
printf 'ENTRYPOINTS | %s/3 verified\n' "$READY"
printf 'ISSUES | %s invalid configurations\n' "$ERRORS"

if (( ERRORS > 0 )); then
  printf 'RESULT | Integration configuration requires repair\n'
  exit 1
elif (( READY < 3 )); then
  printf 'RESULT | Application integration pending\n'
  exit 2
fi

printf 'RESULT | All application test entrypoints identified\n'
printf 'COPY/PASTE NEXT | bash "%s/scripts/run-gates.sh" "%s/%s" "%s/%s" "%s/%s"\n' \
  "$M" \
  "$M" "$BASELINE_ENTRYPOINT" \
  "$M" "$ADVERSARIAL_ENTRYPOINT" \
  "$M" "$INDEPENDENT_ENTRYPOINT"
printf '========== END ==========\n'
