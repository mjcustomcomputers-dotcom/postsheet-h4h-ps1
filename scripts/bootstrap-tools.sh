#!/usr/bin/env bash
# Kernel Beer OS: targeted, isolated challenge tool bootstrap.
set -euo pipefail
C=$'\033[1;36m';G=$'\033[1;32m';R=$'\033[1;31m';Y=$'\033[1;33m';X=$'\033[0m'
umask 077
TOOLROOT="$HOME/kernel-beer-labs/H4H-PS1-SETUP-01/tools/autocannon"
E="$HOME/kernel-beer-labs/H4H-PS1-SETUP-01/evidence/tools-$(date -u +%Y%m%dT%H%M%SZ)-$$"
mkdir -p "$TOOLROOT" "$E"
printf '%sSTAGE%s | KERNEL BEER OS PS1 tooling\n' "$C" "$X"
for tool in node npm python3 git openssl ipfs;do
 if command -v "$tool" >/dev/null 2>&1;then
  printf 'INSTALLED | %s | %s\n' "$tool" "$(command -v "$tool")"
 else
  printf '%sHOLD%s | Missing required tool: %s\n' "$Y" "$X" "$tool"
  exit 2
 fi
done
node -e "if(Number(process.versions.node.split('.')[0])<24)process.exit(1);require('node:sqlite').DatabaseSync" ||
 { printf '%sFAIL%s | Node 24 or built-in SQLite absent\n' "$R" "$X";exit 1;}
BIN="$TOOLROOT/node_modules/.bin/autocannon"
if [[ ! -x "$BIN" ]];then
 printf '%sSTAGE%s | Install only missing HTTP load executable in isolated prefix\n' "$C" "$X"
 npm install --prefix "$TOOLROOT" --save-dev --save-exact --ignore-scripts --no-fund --no-audit autocannon \
   > "$E/npm-install.stdout" 2> "$E/npm-install.stderr" ||
   { printf '%sFAIL%s | npm installation failed; inspect %s/npm-install.stderr\n' "$R" "$X" "$E";exit 1;}
else
 printf 'REUSED | %s\n' "$BIN"
fi
"$BIN" --version > "$E/autocannon.version.txt" 2>&1 ||
 { printf '%sFAIL%s | Autocannon CLI invocation failed\n' "$R" "$X";exit 1;}
npm audit --prefix "$TOOLROOT" --json > "$E/npm-audit.json" 2> "$E/npm-audit.stderr" || true
node - "$E/npm-audit.json" <<'JS'
const fs=require('node:fs');
let report;
try{report=JSON.parse(fs.readFileSync(process.argv[2],'utf8'));}catch{
 console.error('HOLD | npm audit response unavailable');process.exit(2);
}
const v=report.metadata?.vulnerabilities;
if(!v){console.error('HOLD | Missing npm audit vulnerability metadata');process.exit(2);}
console.log('AUDIT | critical='+v.critical+' high='+v.high+' moderate='+v.moderate+' low='+v.low);
if(v.critical>0||v.high>0){console.error('HOLD | Tool dependency advisories require mitigation before acceptance load');process.exit(2);}
JS
(cd "$E" && find . -maxdepth 1 -type f ! -name SHA256SUMS -print0 |
 sort -z | xargs -0 -r sha256sum > SHA256SUMS)
printf '%sTOOLS%s | Node/SQLite/Autocannon available; no Kubo daemon restart\n' "$G" "$X"
printf '%sEVIDENCE%s | %s\n' "$C" "$X" "$E"
printf 'COPY/PASTE NEXT | cat "%s/autocannon.version.txt"\n' "$E"
