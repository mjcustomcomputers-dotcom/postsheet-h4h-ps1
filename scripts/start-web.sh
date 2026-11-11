#!/usr/bin/env bash
set -euo pipefail
M="$(cd "$(dirname "$0")/.." && pwd)"
W="$M/web"
E="$HOME/kernel-beer-labs/H4H-PS1-SETUP-01/evidence/web-$(date -u +%Y%m%dT%H%M%SZ)-$$"
mkdir -p "$E"
echo '========== KERNEL BEER OS | H4H PS1 | REACT CLIENT =========='
if [[ ! -x "$W/node_modules/.bin/vite" ]];then
  echo 'METHOD | Install only missing React/Vite dependencies in isolated project web directory'
  (cd "$W" && npm install --ignore-scripts --no-fund) >"$E/npm-install.stdout" 2>"$E/npm-install.stderr" ||
  { echo "FAIL | React installation; see $E/npm-install.stderr";exit 1;}
fi
(cd "$W" && npm audit --json) >"$E/npm-audit.json" 2>"$E/npm-audit.stderr" || true
node - "$E/npm-audit.json" <<'JS'
const fs=require('node:fs');
let x;try{x=JSON.parse(fs.readFileSync(process.argv[2],'utf8'));}catch{console.error('HOLD | npm audit unavailable');process.exit(2);}
const v=x.metadata?.vulnerabilities;
if(!v){console.error('HOLD | dependency audit metadata missing');process.exit(2);}
console.log('AUDIT | critical='+v.critical+' high='+v.high+' moderate='+v.moderate+' low='+v.low);
if(v.critical||v.high){console.error('HOLD | Critical/high dependency advisories');process.exit(2);}
JS
echo 'URL | http://127.0.0.1:5173/'
echo "EVIDENCE | $E"
cd "$W"
exec npm run dev
