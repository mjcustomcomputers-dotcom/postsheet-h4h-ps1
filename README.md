# Post Sheet | Ability & Purpose Crew Network (Hack4Hack PS1)

A race-safe, goal-conditioned team formation engine built on Node.js 24 (`node:sqlite` WAL + `node:crypto`) and React 19 / Vite 7. Starts from what a team is trying to build, verifies critical-path capacity and directed UTC handoffs, guarantees single-winner seat admission under 50-way burst contention, and preserves collaboration across WAN drops via signed peer relays.

## Quick Start (Node >= 24 & Python 3)

    # 1. Install & build the React frontend
    npm ci --prefix web
    npm run build --prefix web

    # 2. Seed 10,000 users / 2,000 teams & launch server on http://127.0.0.1:8788
    bash scripts/start-local.sh

Open `http://127.0.0.1:8788` in your browser. Use the **Acting as: Aurora** menu (`leader-aurora`, `builder-kai`, `builder-priya`, `relay-mateo`, or account login/registration) and **Display & A11y** controls directly in the top bar.

## Run Complete Verification Suite (102 Automated Checks = 97 Suite Assertions + 5 Load-Gate Checks)

    # 59 Gate Assertions: Baseline (28 API + 14 Planner + 1 SSE) -> 4-Check 50-Way Race -> 12-Query Python SQLite Oracle
    bash scripts/run-gates.sh scripts/baseline.sh scripts/adversarial.sh scripts/independent.sh

    # 38 Layer-B AES-GCM/P-256 Crypto, Durable Replay, Peer HTTP Relay, React Retry & Synchronicity R5 Assertions (85 total Node subtests across tests/*.test.mjs)
    node --test tests/peer-envelope.test.mjs tests/peer-receipts.test.mjs tests/peer-relay.test.mjs tests/react-operation.test.mjs tests/synchronicity-r5.test.mjs

## Key Submission Artifacts
- `DESIGN.md` — One-page engineering architecture, formulas, and trade-offs.
- `LOAD_REPORT.md` — 10,000-user / 2,000-team seed & 100-concurrent-client `p95` board benchmark report.
- `PREEXISTING_WORK.md` — Post Sheet / Synchronicity attribution and clean-room PS1 delta.
- `SOURCE_MANIFEST.json` — SHA-256 file manifest of the verified submission cut.
