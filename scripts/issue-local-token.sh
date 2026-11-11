#!/usr/bin/env bash
set -euo pipefail
M="$(cd "$(dirname "$0")/.." && pwd)"
KEY="$HOME/.config/kernel-beer/H4H-PS1/auth.key"
if [[ ! -f "$KEY" ]]; then echo 'HOLD | Launch local server first to initialize session key';exit 2;fi
ACTOR="$1"
PS1_AUTH_SECRET="$(cat "$KEY")" node "$M/src/server.mjs" token "$ACTOR"
