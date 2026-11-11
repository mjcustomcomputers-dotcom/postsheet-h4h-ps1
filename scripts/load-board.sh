#!/usr/bin/env bash
# Kernel Beer OS | H4H-PS1 | actual LOCAL board load; explicit resource/target gate.
set -euo pipefail
C=$'\033[1;36m';G=$'\033[1;32m';R=$'\033[1;31m';Y=$'\033[1;33m';X=$'\033[0m'
M="$(cd "$(dirname "$0")/.." && pwd)"
ROOT="$(git -C "$M" rev-parse --show-toplevel)"
URL="${1:-}"
CLIENTS=100
DURATION=10
T="$HOME/kernel-beer-labs/H4H-PS1-SETUP-01/tools/autocannon/node_modules/.bin/autocannon"
E="$HOME/kernel-beer-labs/H4H-PS1-SETUP-01/evidence/load-$(date -u +%Y%m%dT%H%M%SZ)-$$"
mkdir -p "$E"
echo "========== KERNEL BEER OS | PS1 REAL BOARD LOAD =========="
if [[ "${KB_PS1_LOAD_APPROVED:-0}" != "1" ]]; then
 printf '%sHOLD%s | Explicit user load budget approval required: KB_PS1_LOAD_APPROVED=1\n' "$Y" "$X"
 exit 2
fi
if [[ -z "$URL" ]]; then echo "USAGE | KB_PS1_LOAD_APPROVED=1 bash scripts/load-board.sh http://127.0.0.1:8788/api/events/seed-event/board"; exit 2; fi
node - "$URL" <<'JS'
const {URL}=require('node:url');
let u;
try{u=new URL(process.argv[2]);}catch{process.exit(1);}
if(u.protocol!=='http:'||!['127.0.0.1','localhost','[::1]'].includes(u.hostname)||!u.pathname.endsWith('/board'))process.exit(1);
JS
if [[ ! -x "$T" ]]; then
 printf '%sHOLD%s | autocannon missing at isolated tool path; run bootstrap-tools.sh\n' "$Y" "$X"
 exit 2
fi
grep -E 'MemAvailable|SwapFree' /proc/meminfo > "$E/resources-before.txt"
df -Pk "$ROOT" >> "$E/resources-before.txt"
git -C "$ROOT" rev-parse HEAD > "$E/source-sha.txt"
printf '%sMETHOD%s | 100 concurrent HTTP board clients, 10 seconds; local-only\n' "$C" "$X"
"$T" -c "$CLIENTS" -d "$DURATION" --json "$URL" >"$E/autocannon.json" 2>"$E/autocannon.stderr"
node "$M/scripts/assess-board-load.mjs" "$E/autocannon.json" "$E/source-sha.txt" | tee "$E/assessment.txt"

(cd "$E" && sha256sum resources-before.txt source-sha.txt autocannon.json autocannon.stderr > SHA256SUMS)
printf '%sEVIDENCE%s | %s\n' "$C" "$X" "$E"
printf 'COPY/PASTE NEXT | cat "%s/autocannon.json"\n' "$E"
