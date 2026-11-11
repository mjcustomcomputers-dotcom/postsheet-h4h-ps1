#!/usr/bin/env bash
set -uo pipefail
M="$(cd "$(dirname "$0")/.." && pwd)"
KIND="$1"
case "$KIND" in
 baseline) TEST="$M/tests/api-baseline.test.mjs"; EXTRA="$M/tests/planner.test.mjs $M/tests/sse.test.mjs";;
 adversarial) TEST="$M/tests/api-adversarial.test.mjs"; EXTRA="";;
 *) echo "FAIL | Unsupported gate $KIND";exit 2;;
esac
TMP="$(mktemp)"
trap 'rm -f "$TMP"' EXIT
node --test --test-reporter=tap "$TEST" $EXTRA >"$TMP" 2>&1
RC=$?
cat "$TMP"
if ((RC!=0));then echo "FAIL | $KIND | node exit=$RC";exit "$RC";fi
COUNT="$(awk '/^# tests [0-9]+$/{n=$3}END{print n+0}' "$TMP")"
PASSED="$(awk '/^# pass [0-9]+$/{n=$3}END{print n+0}' "$TMP")"
FAILED="$(awk '/^# fail [0-9]+$/{n=$3}END{print n+0}' "$TMP")"
if ((COUNT<1||FAILED!=0||PASSED!=COUNT));then
 echo "FAIL | $KIND | tests=$COUNT pass=$PASSED fail=$FAILED"
 exit 1
fi
printf 'KB_GATE:PASS checks=%s\n' "$COUNT"
