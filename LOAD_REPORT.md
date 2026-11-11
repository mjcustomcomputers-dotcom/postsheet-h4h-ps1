# Hack4Hack PS1: Seed, Concurrency, and Board Latency Report

This report documents the measured seed throughput, `100`-concurrent-client board read latency, `50`-claimant final-seat contention behavior, cryptographic KDF isolation under load, and exact reproduction commands for **Post Sheet: Ability and Purpose Crew Network**.

---

## 1. Benchmark Environment and SQLite WAL Configuration

- **Application Stack:** Node.js `v24.19.0` (`node:http`, `node:sqlite`, `node:crypto`), single-process event loop, zero external cache or proxy layer between benchmark client and HTTP listener.
- **Database Engine:** Built-in SQLite (`DatabaseSync`) configured on open in `src/authority.mjs` with:
  - `PRAGMA foreign_keys = ON;`
  - `PRAGMA busy_timeout = 5000;`
  - `PRAGMA trusted_schema = OFF;`
  - `PRAGMA journal_mode = WAL;`
  - `PRAGMA synchronous = NORMAL;`
  - `PRAGMA wal_autocheckpoint = 1000;`
  - `PRAGMA max_page_count = 131072;` (`~512 MiB` hard disk ceiling)
- **Why WAL Matters Here:** Write-Ahead Logging permits concurrent `/board` read snapshots to proceed in parallel without blocking on reader locks, while `BEGIN IMMEDIATE` serializes write transactions (`claim`, `invite`, `createTeam`, `leave`, `transferLeader`) atomically at the database engine level.

---

## 2. Deterministic Dataset Seed (`10,000` Users / `2,000` Teams)

- **Generator:** `node src/seed.mjs <sqlite-path>`
- **Dataset Shape:** `1` event (`seed-event`, `max_team_size = 5`), `2,000` teams (`team-0000` through `team-1999`), and `10,000` distinct committed builders (`builder-00000` through `builder-09999`, `5` members per team with `1` designated leader per team).
- **Measured Seed Elapsed Time:** `13,435 ms` (`~744` committed members/sec including audit and membership index maintenance).
- **On-Disk Footprint:** `~7.83 MiB` main SQLite database file (`h4h-ps1.sqlite`).
- **Post-Seed Relational Invariants:**
  - `oversize_teams = 0` (`COUNT(*) > max_size`)
  - `orphan_leader_teams = 0` (every team's `leader` is a current row in `membership`)
  - `duplicate_event_memberships = 0` (`UNIQUE(event_id, user_id)` strictly satisfied across all `10,000` rows)

---

## 3. Board Read Latency at `100` Concurrent Clients (Target SLA: `p95 < 200 ms`)

The Hack4Hack PS1 brief requires `GET /board` to sustain `p95 < 200 ms` with `100` concurrent users against a `10,000`-participant, `2,000`-team database.

We measured `GET /api/events/seed-event/board?limit=100` using two independent load harnesses:

| Metric | Exact Per-Request Harness (`scripts/exact-p95-bench.mjs`) | Autocannon Cross-Check (`100` Connections) | PS1 Target SLA |
| --- | --- | --- | --- |
| **Concurrency** | `100` in-flight async workers | `100` pipelined TCP connections | `100` concurrent users |
| **Window Duration** | `5.00 s` | `10.02 s` | Sustained burst |
| **Completed `200 OK` Responses** | `16,983` | `35,034` | `> 0` |
| **Throughput** | `3,396.6 req/sec` | `3,496.4 req/sec` | Unspecified |
| **HTTP / Socket Errors (`non-2xx`)** | `0` (`0.00%`) | `0` (`0.00%`) | `0` |
| **`p50` (Median Latency)** | `28.29 ms` | `27.00 ms` | - |
| **`p90` Latency** | `34.31 ms` | `31.00 ms` | - |
| **Exact `p95` Latency** | **`36.68 ms`** | `~32.50 ms` | **`< 200.00 ms` (`5.4x` headroom)** |
| **`p97.5` Latency** | `39.55 ms` | `34.00 ms` | - |
| **`p99` Latency** | `54.07 ms` | `46.00 ms` | - |

### Event-Loop Protection During Concurrent `scrypt` Login Floods (`SEC02`)
Password hashing (`N = 16384, r = 8, p = 1`) is offloaded to libuv worker threads via asynchronous `crypto.scrypt` behind a `maxConcurrentKdf = 4` semaphore (`> 16` queued requests shed load cleanly with `429 AUTH_BUSY`). During simultaneous password-login bursts in `tests/security-hardening.test.mjs` (`SEC02`), concurrent `GET /health` probes remain below `50 ms` (observed `< 15 ms`), confirming that authentication traffic cannot starve board reads.

---

## 4. Scarce-Seat Contention, Replay Storms, and Independent SQLite Oracle

| Contention Scenario | Test Coordinate | Workload | Observed Outcome |
| --- | --- | --- | --- |
| **50-Way Final-Seat Race** | `tests/api-adversarial.test.mjs` (`ADV01`) & `/api/demo/race-50` (`SEC05`) | Team at `4/5` (or `1/2`) capacity; `50` independent HTTP clients fire simultaneous `POST /api/invitations/claim` requests for the `1` remaining seat | **Exact `1` HTTP `200` winner**, **`49` HTTP `409` rejections** (`TEAM_FULL` / `INVITE_INVALID_OR_USED`), completed in `76 ms` (`21.4 ms` in-process `/api/demo/race-50`), `0` oversize rows |
| **20-Way Duplicate Retry Storm** | `tests/api-adversarial.test.mjs` (`ADV02`) | `20` concurrent deliveries of the identical `(actorId, opId, code)` claim payload | **`1` authoritative commit**, **`19` idempotent replays** (`replayed: true`), `1` membership row, `1` admission audit event |
| **Cross-Team Double-Book Race** | `tests/api-adversarial.test.mjs` (`ADV03`) | One user simultaneously claims valid invites into two different teams in the same event | **Exact `1` team joined**, second claim rejected with `409 ONE_TEAM_PER_EVENT` |
| **100-Way Multi-Team Chaos Burst** | `docs/adversarial-deep-audit.mjs` | `100` concurrent mixed claim/leave/invite operations across persistent SQLite WAL | `oversize = 0`, `orphanLeader = 0`, `eventMismatch = 0` |
| **Independent Python SQLite Oracle** | `tests/sql-independent.py` (`scripts/independent.sh`) | Separate Python 3 process inspects raw SQLite B-trees after baseline and adversarial suites | **`12 / 12` relational, uniqueness, invite-consumption, and audit-integrity assertions PASS** |

Raw machine-generated benchmark and audit logs are preserved in [`docs/local-receipts/`](./docs/local-receipts/):
- [`KB-R6-LOAD-RECOVERY-20261110T230518Z.txt`](./docs/local-receipts/KB-R6-LOAD-RECOVERY-20261110T230518Z.txt)
- [`KB-R10-DEEP-ADVERSARIAL-AUDIT.txt`](./docs/local-receipts/KB-R10-DEEP-ADVERSARIAL-AUDIT.txt)
- [`KB-R11-SECURITY-PENTEST.txt`](./docs/local-receipts/KB-R11-SECURITY-PENTEST.txt)
- [`KB-R12-FINAL-SEAL.txt`](./docs/local-receipts/KB-R12-FINAL-SEAL.txt)

---

## 5. Exact Commands to Reproduce Locally

Run the following commands from the repository root on any machine with Node.js >= 24 and Python 3:

```bash
# 1. Seed 10,000 users across 2,000 teams into a fresh SQLite WAL database
node src/seed.mjs /tmp/repro-seed.sqlite

# 2. Launch the server against the 10,000-user database
PS1_AUTH_SECRET="repro-benchmark-32-byte-secret-key-0001" \
PS1_SQLITE_PATH="/tmp/repro-seed.sqlite" \
PS1_BIND="127.0.0.1" \
PS1_PORT="8788" \
node src/server.mjs &
SRV_PID=$!
sleep 1

# 3. Execute the 100-concurrent-client exact p95 latency gate (asserts p95 < 200 ms)
node scripts/exact-p95-bench.mjs "http://127.0.0.1:8788/api/events/seed-event/board?limit=100" 100 5000

# 4. Stop background server and run the 50-way race and 12-query Python SQLite oracle
kill "$SRV_PID"
bash scripts/run-gates.sh scripts/baseline.sh scripts/adversarial.sh scripts/independent.sh
```
