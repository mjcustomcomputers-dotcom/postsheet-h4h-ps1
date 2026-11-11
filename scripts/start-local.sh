#!/usr/bin/env bash
set -euo pipefail
umask 077
C=$'\033[1;36m'; G=$'\033[1;32m'; X=$'\033[0m'
M="$(cd "$(dirname "$0")/.." && pwd)"
KEYDIR="$HOME/.config/kernel-beer/H4H-PS1"
DATADIR="${PS1_DATA_DIR:-$HOME/.local/share/h4h-ps1}"
DB="$DATADIR/seed-event.sqlite"
mkdir -p "$KEYDIR" "$DATADIR"
chmod 700 "$KEYDIR"
if [[ ! -f "$KEYDIR/auth.key" ]]; then
  openssl rand -hex 32 > "$KEYDIR/auth.key.new"
  chmod 600 "$KEYDIR/auth.key.new"
  mv "$KEYDIR/auth.key.new" "$KEYDIR/auth.key"
fi
if [[ ! -f "$DB" ]]; then
  printf '%sSTAGE%s | Materializing 10,000-user / 2,000-team SQLite dataset\n' "$C" "$X"
  node "$M/src/seed.mjs" "$DB"
else
  python3 - "$DB" <<'PY'
import sqlite3, sys
d = sqlite3.connect(sys.argv[1])
teams = d.execute("SELECT COUNT(*) FROM teams").fetchone()[0]
people = d.execute("SELECT COUNT(*) FROM membership").fetchone()[0]
d.close()
print(f"REUSED | Dataset ready ({teams} teams, {people} members)")
PY
fi
if [[ ! -f "$M/web/dist/index.html" ]]; then
  npm run build --prefix "$M/web"
fi
export PS1_AUTH_SECRET="$(cat "$KEYDIR/auth.key")"
export PS1_SQLITE_PATH="$DB"
export PS1_BIND="${PS1_BIND:-127.0.0.1}"
export PS1_PORT="${PS1_PORT:-8788}"
printf '%sREADY%s | Open http://%s:%s in your browser\n' "$G" "$X" "$PS1_BIND" "$PS1_PORT"
exec node "$M/src/server.mjs"
