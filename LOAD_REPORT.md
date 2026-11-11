# Hack4Hack PS1 — Seed, Concurrency & Board Latency Report

## 1. Deterministic Dataset Seed (10,000 Users / 2,000 Teams)
- Generator: node src/seed.mjs (SQLite WAL, BEGIN IMMEDIATE transactions)
- Capacity: 5 members per team x 2,000 teams = 10000 committed members
- Seed Elapsed Time: 13435 ms
- Post-Seed Invariants: oversize=0, orphanLeader=0, eventMismatch=0

## 2. Board Read Latency at 100 Concurrent Clients (SLA: p95 < 200 ms)
- Endpoint: GET /api/events/seed-event/board?limit=100
- Completed 200 OK Requests (5.0s run): 16983 (errors=0, non2xx=0)
- Latency Percentiles: p50=28.29 ms | p90=34.31 ms | Exact p95=36.68 ms | p97.5=39.55 ms | p99=54.07 ms
- Prior 10.02s Autocannon Cross-Check (35,034 requests, 100 connections): p50=27 ms | p90=31 ms | p97.5=34 ms | 0 errors

## 3. 50-Claimant Final-Seat Contention & SQLite Race Oracle
- 50 concurrent HTTP claimants on 1 remaining seat -> 1 HTTP 200 COMMITTED winner, 49 HTTP 409 rejections.
- 20 concurrent duplicate deliveries -> 1 initial commit, 19 idempotent replays.
- Independent Python SQLite Oracle (tests/sql-independent.py) -> 12/12 relational & audit assertions PASS.
