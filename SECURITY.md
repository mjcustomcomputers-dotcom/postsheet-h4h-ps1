# Security Architecture Brief (PSS-H4H-SEC-HARDENING-R11)

## 1. Threat Model & Trust Boundaries
Post Sheet x Synchronicity separates **authoritative seat mutation** (Layer A) from **peer-forwarded collaboration and offline transport** (Layer B):
- **Untrusted:** Browser clients, peer relay nodes (`relay-mateo`), invite-code bearers, and reverse-proxy headers unless `PS1_TRUST_PROXY=1` is explicitly enabled.
- **Trusted:** Single-writer Node 24 authority process (`src/server.mjs`), `PS1_AUTH_SECRET` (>= 32 bytes entropy), and the local SQLite database (`src/authority.mjs`).

## 2. Layer-A SQLite Serialization & Disk Safety (`src/authority.mjs`)
- Every membership mutation (`createTeam`, `invite`, `claim`, `leave`, `transferLeader`) executes inside an explicit `BEGIN IMMEDIATE` transaction with `PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000; PRAGMA trusted_schema=OFF;`.
- File-backed databases enforce `PRAGMA journal_mode=WAL; PRAGMA synchronous=NORMAL; PRAGMA wal_autocheckpoint=1000; PRAGMA max_page_count=131072` (~512 MiB ceiling).
- Single-use invitations store only `SHA-256(code)` (`invites.code_hash`); plaintext invite codes are never persisted at rest.
- Duplicate `teamId` collisions return deterministic `409 TEAM_EXISTS` (never `500`), and `GET /api/events/:id/audit` reads bounded `ORDER BY id DESC LIMIT 100`.

## 3. Layer-B Per-Event HKDF Sealing & Zero Plaintext at Rest (`src/synchronicity-ext.mjs`)
- Layer-B `AES-256-GCM` keys are derived per event via RFC 5869 `crypto.hkdfSync('sha256', secret, 'event:' + eventId, 'h4h-ps1-layer-b-aes256gcm-v1', 32)`.
- Actor `P-256` ECDSA signing keys are persisted in `ps1_actor_keys` with PKCS#8 DER private keys wrapped under a separate HKDF `AES-256-GCM` key-wrap key, while in-memory key caching is capped at `512` entries (LRU eviction).
- `ps1_peer_notes.note_text` stores only the sentinel `'[SEALED_AES256_GCM]'` (zero plaintext notes on disk). On read, `listPeerNotes` verifies the `P-256` signature, event binding, scope (`team-notes`), and `AES-256-GCM` authentication tag via `openPeerArtifact`.

## 4. Least-Privilege Relay Warrants & Demo Namespace Isolation (`src/server.mjs`)
- **Scoped Relay Warrants (`POST /api/auth/relay-warrant`):** Disconnected claimants mint a narrow 10-minute warrant (`aud: 'h4h-ps1-relay-warrant'`) cryptographically bound to `{ sub, eventId, teamId, opId, codeHash }`. Standard `verifyToken` (`aud: 'h4h-ps1-local'`) rejects relay warrants (`401`) on all other routes, and `/api/peer/relay-claim` blocks self-relay (`actorId === claimantSub` -> `403 SELF_RELAY_FORBIDDEN`).
- **Demo Persona Isolation (`/api/auth/demo`):** Restricted to `DEMO_PERSONA_RE` (`403 DEMO_PERSONA_FORBIDDEN` for seeded `builder-00000` leaders or arbitrary IDs) and strictly blocked whenever `ps1_accounts` holds a registered account of the same username (`403`). Disable completely in production via `PS1_DEMO_AUTH=0`.

## 5. Non-Blocking `scrypt` Semaphore & Anti-Enumeration
- `/api/auth/register` and `/api/auth/login` run async `crypto.scrypt` (`N=16384, r=8, p=1, maxmem=32 MiB`) on libuv worker threads behind a `maxConcurrentKdf = 4` semaphore (`>16` queued -> `429 AUTH_BUSY`), keeping `GET /health` and `/board` responsive (`<50 ms`) under login floods.
- Unknown-username logins execute a full dummy `scrypt` against a boot-time random salt followed by `timingSafeEqual` before returning `401 UNAUTHORIZED`, neutralizing timing-based username enumeration.
- Revoked tokens in `ps1_revoked_tokens` are automatically pruned past `7,200,000 ms` (max token TTL).

## 6. HTTP Parser, Headers, Rate Limiting & Container Sandboxing
- **Parser Hardening:** `readJson` enforces `Content-Type: application/json*` (`415`), reassembles multi-byte UTF-8 chunks safely via `Buffer.concat`, enforces `16 KiB` / `32 KiB` body caps (`413`), and rejects own keys `__proto__`, `constructor`, and `prototype` at any nesting depth (`400 INVALID_JSON`).
- **Timeouts & Headers:** `headersTimeout=10s`, `requestTimeout=15s`, `keepAliveTimeout=5s`, `maxHeadersCount=64`; strict CSP (`default-src 'self'`, zero external CDNs/workers), `COOP: same-origin`, `CORP: same-origin`, `Permissions-Policy`, `Cache-Control: no-store`, conditional `HSTS`, no `Access-Control-Allow-Origin`, in-memory-only Bearer storage in React, and self-contained `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'">` in exported HTML charters.
- **Proxy-Safe Rate Limits & Container Lockdown:** Client IP defaults to `req.socket.remoteAddress` unless `PS1_TRUST_PROXY=1`; token buckets cap auth (`20/min`), demo (`120/min`), race-50 (`10/min`), mutations (`240/min`), and non-loopback SSE streams (`6/IP`, `100` global). `Dockerfile` + `docker-compose.hardened.yml` run `USER node` on a read-only rootfs with `cap_drop: [ALL]`, `no-new-privileges`, `pids_limit: 128`, and `0700` `/data`.
