import test from 'node:test';
import assert from 'node:assert/strict';
import { request as httpRequest } from 'node:http';
import { createConnection } from 'node:net';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import {
  startServer,
  issueToken,
  DEMO_PERSONA_RE,
  canonicalizeRequestUrl,
  resolveSafeStaticAsset
} from '../src/server.mjs';
import { escapeHtml, buildTeamPlanWhitePaperHtml } from '../web/src/charter-whitepaper.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, '..');
const SECRET = 'r11-security-hardening-secret-key-min-32-bytes!!';
const sha256 = s => createHash('sha256').update(s).digest('hex');

function makeTempDir(prefix = 'h4h-sec11-') {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  return {
    dir,
    file: name => join(dir, name),
    cleanup: () => rmSync(dir, { recursive: true, force: true })
  };
}

async function jsonCall(base, method, path, body, token, extraHeaders = {}) {
  const headers = { ...extraHeaders };
  if (method === 'POST' && !('content-type' in headers) && !('Content-Type' in headers)) {
    headers['content-type'] = 'application/json';
  }
  if (token) headers.authorization = `Bearer ${token}`;
  const res = await fetch(`${base}${path}`, {
    method,
    headers,
    body: body !== undefined && body !== null ? (typeof body === 'string' ? body : JSON.stringify(body)) : undefined
  });
  let parsed = null;
  const text = await res.text();
  try {
    parsed = JSON.parse(text);
  } catch {
    parsed = { raw: text };
  }
  return { status: res.status, body: parsed, headers: res.headers };
}

test('SEC01 | /api/auth/demo blocks scrypt-registered account impersonation & builder-00000 hijack while allowing approved demo personas', async () => {
  const app = startServer({ secret: SECRET });
  const addr = await app.listen();
  const base = `http://127.0.0.1:${addr.port}`;
  try {
    // Seed a realistic non-demo leader like src/seed.mjs
    app.authority.createEvent('seed-event', 5);
    app.authority.createTeam({ eventId: 'seed-event', teamId: 'crew-0000', actorId: 'builder-00000' });

    // Register two real scrypt accounts (including one matching DEMO_PERSONA_RE pattern!)
    const reg1 = await jsonCall(base, 'POST', '/api/auth/register', {
      username: 'aurora-realuser',
      password: 'UltraSafePassword123!'
    });
    assert.equal(reg1.status, 201);

    const reg2 = await jsonCall(base, 'POST', '/api/auth/register', {
      username: 'melvin-sec',
      password: 'UltraSafePassword123!'
    });
    assert.equal(reg2.status, 201);

    // Attempt to impersonate registered users via unauthenticated /api/auth/demo -> 403
    const imp1 = await jsonCall(base, 'POST', '/api/auth/demo', {
      actorId: 'aurora-realuser',
      eventId: 'seed-event'
    });
    assert.equal(imp1.status, 403);
    assert.equal(imp1.body.error, 'DEMO_PERSONA_FORBIDDEN');

    const imp2 = await jsonCall(base, 'POST', '/api/auth/demo', {
      actorId: 'melvin-sec',
      eventId: 'seed-event'
    });
    assert.equal(imp2.status, 403);
    assert.equal(imp2.body.error, 'DEMO_PERSONA_FORBIDDEN');

    // Attempt to hijack seeded leader builder-00000 -> 403
    const hijack = await jsonCall(base, 'POST', '/api/auth/demo', {
      actorId: 'builder-00000',
      eventId: 'seed-event'
    });
    assert.equal(hijack.status, 403);
    assert.equal(hijack.body.error, 'DEMO_PERSONA_FORBIDDEN');

    // Approved demo personas succeed -> 200
    const okAurora = await jsonCall(base, 'POST', '/api/auth/demo', {
      actorId: 'leader-aurora',
      eventId: 'seed-event'
    });
    assert.equal(okAurora.status, 200);
    assert.ok(okAurora.body.token);

    const okPriya = await jsonCall(base, 'POST', '/api/auth/demo', {
      actorId: 'priya-wan-1234',
      eventId: 'h4h-open-crews',
      maxSize: 99
    });
    assert.equal(okPriya.status, 200);
    // Verify maxSize was clamped to <= 10
    const evRow = app.authority.db.prepare('SELECT max_size FROM events WHERE id=?').get('h4h-open-crews');
    assert.equal(evRow.max_size, 10);

    // Verify arbitrary unauthenticated event names are NOT auto-created in SQLite
    const customEv = await jsonCall(base, 'POST', '/api/auth/demo', {
      actorId: 'leader-aurora',
      eventId: 'unauth-arbitrary-ev'
    });
    assert.equal(customEv.status, 200);
    const rogueRow = app.authority.db.prepare('SELECT 1 FROM events WHERE id=?').get('unauth-arbitrary-ev');
    assert.equal(rogueRow, undefined);
  } finally {
    await app.close();
  }
});

test('SEC02 | Dummy scrypt bounds unknown-vs-registered login timing delta & async KDF semaphore keeps /health < 50ms', async () => {
  const app = startServer({ secret: SECRET });
  const addr = await app.listen();
  const base = `http://127.0.0.1:${addr.port}`;
  try {
    const reg = await jsonCall(base, 'POST', '/api/auth/register', {
      username: 'registered-bob',
      password: 'CorrectBatteryStaple99!'
    });
    assert.equal(reg.status, 201);

    // Warm-up both paths
    await jsonCall(base, 'POST', '/api/auth/login', { username: 'registered-bob', password: 'WrongPassword00!' });
    await jsonCall(base, 'POST', '/api/auth/login', { username: 'unknown-ghost-user', password: 'WrongPassword00!' });

    const regSamples = [];
    const unkSamples = [];
    for (let i = 0; i < 4; i++) {
      const t0 = performance.now();
      const r1 = await jsonCall(base, 'POST', '/api/auth/login', {
        username: 'registered-bob',
        password: `WrongPass-${i}-abcd!`
      });
      regSamples.push(performance.now() - t0);
      assert.equal(r1.status, 401);

      const t1 = performance.now();
      const r2 = await jsonCall(base, 'POST', '/api/auth/login', {
        username: `nonexistent-user-${i}`,
        password: `WrongPass-${i}-abcd!`
      });
      unkSamples.push(performance.now() - t1);
      assert.equal(r2.status, 401);
    }

    regSamples.sort((a, b) => a - b);
    unkSamples.sort((a, b) => a - b);
    const regMedian = regSamples[1];
    const unkMedian = unkSamples[1];
    // Unknown user MUST perform real scrypt work (> 2ms) rather than <0.3ms SQLite miss, and stay within bounded delta
    assert.ok(unkMedian > 2, `Expected dummy scrypt work on unknown user, got ${unkMedian.toFixed(2)}ms`);
    assert.ok(Math.abs(unkMedian - regMedian) < Math.max(80, regMedian * 2.5));

    // Concurrent login burst must NOT block event loop: GET /health stays < 50ms
    const loginBurst = Promise.all(
      Array.from({ length: 12 }, (_, i) =>
        jsonCall(base, 'POST', '/api/auth/login', {
          username: i % 2 === 0 ? 'registered-bob' : `unknown-${i}`,
          password: 'ConcurrentBurstPassword!'
        })
      )
    );

    await new Promise(r => setTimeout(r, 8));
    const healthLatencies = [];
    for (let h = 0; h < 3; h++) {
      const th = performance.now();
      const hr = await jsonCall(base, 'GET', '/health');
      const elapsed = performance.now() - th;
      assert.equal(hr.status, 200);
      healthLatencies.push(elapsed);
    }
    const maxHealthMs = Math.max(...healthLatencies);
    assert.ok(maxHealthMs < 50, `Expected /health < 50ms during scrypt burst, got ${maxHealthMs.toFixed(2)}ms`);

    const burstRes = await loginBurst;
    assert.equal(burstRes.every(r => r.status === 401), true);

    // Direct KDF queue overflow (> 4 active + 16 queued = 20) fails fast with AUTH_BUSY
    const flood = await Promise.allSettled(
      Array.from({ length: 26 }, (_, i) =>
        app.ext.authenticateAsync({ username: `flood-${i}`, password: 'FloodPassword123!' })
      )
    );
    assert.ok(
      flood.some(r => r.status === 'rejected' && r.reason?.message === 'AUTH_BUSY'),
      'Expected KDF queue > 16 to reject excess callers with AUTH_BUSY'
    );
  } finally {
    await app.close();
  }
});

test('SEC03 | ps1_peer_notes stores ZERO plaintext on disk & verifies per-event HKDF + durable P-256 across restart', async () => {
  const tmp = makeTempDir('h4h-sec03-');
  const dbPath = tmp.file('notes-sealed.sqlite');
  const canarySecretNote = 'CANARY_ZERO_PLAINTEXT_AT_REST_998877_OMEGA';

  try {
    // 1. Boot server #1, create event, publish encrypted peer note, then shut down completely
    const app1 = startServer({ dbPath, secret: SECRET });
    const addr1 = await app1.listen();
    const base1 = `http://127.0.0.1:${addr1.port}`;
    const tokAurora = issueToken('leader-aurora', SECRET);

    await jsonCall(base1, 'POST', '/api/events', { eventId: 'ev-alpha', maxSize: 4 }, tokAurora);
    await jsonCall(base1, 'POST', '/api/events', { eventId: 'ev-beta', maxSize: 4 }, tokAurora);
    const pub = await jsonCall(
      base1,
      'POST',
      '/api/peer/notes',
      { eventId: 'ev-alpha', opId: 'sec03-note-1', text: canarySecretNote, epoch: 1 },
      tokAurora
    );
    assert.equal(pub.status, 201);
    await app1.close();

    // 2. Inspect raw SQLite columns AND raw disk bytes: ZERO plaintext occurrences
    const rawDb = new DatabaseSync(dbPath);
    const row = rawDb.prepare('SELECT note_text, envelope_json FROM ps1_peer_notes WHERE op_id=?').get('sec03-note-1');
    assert.equal(row.note_text, '[SEALED_AES256_GCM]');
    assert.equal(row.note_text.includes(canarySecretNote), false);
    assert.equal(row.envelope_json.includes(canarySecretNote), false);

    const keyRow = rawDb.prepare('SELECT pub_pem, priv_der_enc FROM ps1_actor_keys WHERE actor_id=?').get('leader-aurora');
    assert.ok(keyRow.pub_pem.includes('BEGIN PUBLIC KEY'));
    assert.equal(keyRow.priv_der_enc.includes('PRIVATE KEY'), false);
    rawDb.close();

    const diskBytes = readFileSync(dbPath, 'latin1');
    assert.equal(diskBytes.includes(canarySecretNote), false, 'Plaintext note leaked into raw SQLite file bytes!');
    if (existsSync(dbPath + '-wal')) {
      const walBytes = readFileSync(dbPath + '-wal', 'latin1');
      assert.equal(walBytes.includes(canarySecretNote), false, 'Plaintext note leaked into SQLite WAL bytes!');
    }

    // 3. Cold-restart server #2 on same DB & verify decryption + persisted P-256 verification succeeds
    const app2 = startServer({ dbPath, secret: SECRET });
    const addr2 = await app2.listen();
    const base2 = `http://127.0.0.1:${addr2.port}`;
    try {
      const notesRes = await jsonCall(base2, 'GET', '/api/peer/notes?eventId=ev-alpha', null, tokAurora);
      assert.equal(notesRes.status, 200);
      assert.equal(notesRes.body.notes.length, 1);
      assert.equal(notesRes.body.notes[0].note, canarySecretNote);
      assert.equal(notesRes.body.notes[0].transportStatus, 'PEER_ARTIFACT_ONLY');

      // Exact idempotent replay of same (eventId, actorId, opId, text, epoch) -> 201 replayed: true
      const exactReplay = await jsonCall(
        base2,
        'POST',
        '/api/peer/notes',
        { eventId: 'ev-alpha', opId: 'sec03-note-1', text: canarySecretNote, epoch: 1 },
        tokAurora
      );
      assert.equal(exactReplay.status, 201);
      assert.equal(exactReplay.body.replayed, true);

      // Conflicting reuse of (eventId, actorId, opId) with mutated text or epoch -> 409 IDEMPOTENCY_KEY_REUSED
      const tamperedText = await jsonCall(
        base2,
        'POST',
        '/api/peer/notes',
        { eventId: 'ev-alpha', opId: 'sec03-note-1', text: 'TAMPERED_NOTE_BODY', epoch: 1 },
        tokAurora
      );
      assert.equal(tamperedText.status, 409);
      assert.equal(tamperedText.body.error, 'IDEMPOTENCY_KEY_REUSED');

      const badEpoch = await jsonCall(
        base2,
        'POST',
        '/api/peer/notes',
        { eventId: 'ev-alpha', opId: 'sec03-bad-epoch', text: 'valid note', epoch: -5 },
        tokAurora
      );
      assert.equal(badEpoch.status, 400);
      assert.equal(badEpoch.body.error, 'INVALID_EPOCH');

      // Cross-event HKDF isolation: transplanting envelope into ev-beta must fail closed
      const kAlpha = app2.ext.deriveEventAesKey('ev-alpha');
      const kBeta = app2.ext.deriveEventAesKey('ev-beta');
      assert.notDeepEqual(kAlpha, kBeta, 'Per-event HKDF keys must be cryptographically distinct');

      app2.authority.db
        .prepare(
          'INSERT INTO ps1_peer_notes(receipt_id,scope_ev,actor_id,op_id,envelope_json,note_text,epoch,created_at) VALUES(?,?,?,?,?,?,?,?)'
        )
        .run('transplanted-rcpt', 'ev-beta', 'leader-aurora', 'sec03-note-1', row.envelope_json, '[SEALED_AES256_GCM]', 1, Date.now());

      const crossEv = await jsonCall(base2, 'GET', '/api/peer/notes?eventId=ev-beta', null, tokAurora);
      assert.equal(crossEv.status, 500);
    } finally {
      await app2.close();
    }
  } finally {
    tmp.cleanup();
  }
});

test('SEC04 | Scoped relay-warrant succeeds on /api/peer/relay-claim, fails 401 on other routes, and blocks self-relay 403', async () => {
  const app = startServer({ secret: SECRET });
  const addr = await app.listen();
  const base = `http://127.0.0.1:${addr.port}`;
  try {
    const leadTok = issueToken('leader-aurora', SECRET);
    const priyaTok = issueToken('priya-wan-44', SECRET);
    const mateoTok = issueToken('relay-mateo', SECRET);

    await jsonCall(base, 'POST', '/api/events', { eventId: 'ev-warrant', maxSize: 4 }, leadTok);
    await jsonCall(base, 'POST', '/api/teams', { eventId: 'ev-warrant', teamId: 'team-w', actorId: 'leader-aurora' }, leadTok);
    const inv = await jsonCall(
      base,
      'POST',
      '/api/invitations',
      { eventId: 'ev-warrant', teamId: 'team-w', expiresAt: Date.now() + 60000 },
      leadTok
    );
    assert.equal(inv.status, 201);

    // Mint narrow relay warrant for Priya
    const warrantRes = await jsonCall(
      base,
      'POST',
      '/api/auth/relay-warrant',
      {
        eventId: 'ev-warrant',
        teamId: 'team-w',
        opId: 'op-warrant-1',
        codeHash: sha256(inv.body.code)
      },
      priyaTok
    );
    assert.equal(warrantRes.status, 200);
    const { warrant } = warrantRes.body;
    assert.ok(warrant);

    // Warrant MUST be rejected (401) if Mateo tries to misuse it on /api/teams/leave or /api/peer/notes
    const misuseLeave = await jsonCall(
      base,
      'POST',
      '/api/teams/leave',
      { eventId: 'ev-warrant', teamId: 'team-w' },
      warrant
    );
    assert.equal(misuseLeave.status, 401);

    const misuseNotes = await jsonCall(base, 'GET', '/api/peer/notes?eventId=ev-warrant', null, warrant);
    assert.equal(misuseNotes.status, 401);

    // Warrant MUST be rejected (401) if replayed against a different opId
    const tamperedOp = await jsonCall(
      base,
      'POST',
      '/api/peer/relay-claim',
      {
        claimantWarrant: warrant,
        eventId: 'ev-warrant',
        teamId: 'team-w',
        code: inv.body.code,
        opId: 'tampered-op-id'
      },
      mateoTok
    );
    assert.equal(tamperedOp.status, 401);

    // Self-relay (actor === claimant) MUST be rejected 403 SELF_RELAY_FORBIDDEN
    const selfRelay = await jsonCall(
      base,
      'POST',
      '/api/peer/relay-claim',
      {
        claimantWarrant: warrant,
        eventId: 'ev-warrant',
        teamId: 'team-w',
        code: inv.body.code,
        opId: 'op-warrant-1'
      },
      priyaTok
    );
    assert.equal(selfRelay.status, 403);
    assert.equal(selfRelay.body.error, 'SELF_RELAY_FORBIDDEN');

    // Legitimate peer relay via Mateo succeeds -> 200 COMMITTED
    const okRelay = await jsonCall(
      base,
      'POST',
      '/api/peer/relay-claim',
      {
        claimantWarrant: warrant,
        eventId: 'ev-warrant',
        teamId: 'team-w',
        code: inv.body.code,
        opId: 'op-warrant-1'
      },
      mateoTok
    );
    assert.equal(okRelay.status, 200);
    assert.equal(okRelay.body.status, 'COMMITTED');
    assert.equal(okRelay.body.actorId, 'priya-wan-44');
    assert.equal(okRelay.body.relayedBy, 'relay-mateo');
  } finally {
    await app.close();
  }
});

test('SEC05 | /api/demo/race-50 succeeds 3 times consecutively on persistent file-backed SQLite DB & prunes stale race-* events', async () => {
  const tmp = makeTempDir('h4h-sec05-');
  const dbPath = tmp.file('race-repeat.sqlite');
  const app = startServer({ dbPath, secret: SECRET });
  const addr = await app.listen();
  const base = `http://127.0.0.1:${addr.port}`;
  try {
    // Seed an expired >10m old race-* event to verify automatic cleanup
    const oldTs = Date.now() - 900_000;
    app.authority.createEvent('race-old-expired', 2);
    app.authority.createTeam({
      eventId: 'race-old-expired',
      teamId: 'final-seat-race-old-expired',
      actorId: 'race-leader',
      now: oldTs
    });

    const tok = issueToken('leader-aurora', SECRET);
    for (let run = 1; run <= 3; run++) {
      const r = await jsonCall(base, 'POST', '/api/demo/race-50', {}, tok);
      assert.equal(r.status, 200, `Expected 200 on repeat race-50 run #${run}, got ${r.status}`);
      assert.equal(r.body.committed, 1);
      assert.equal(r.body.rejected, 49);
      assert.equal(r.body.finalMemberCount, 2);
      assert.deepEqual(r.body.invariants, { oversize: 0, orphanLeader: 0, eventMismatch: 0 });
    }

    const staleExists = app.authority.db.prepare('SELECT 1 FROM events WHERE id=?').get('race-old-expired');
    assert.equal(staleExists, undefined, 'Expected stale >10m race-* event to be pruned automatically');
  } finally {
    await app.close();
    tmp.cleanup();
  }
});

test('SEC06 | Split multi-byte UTF-8 JSON chunks reassemble cleanly; text/plain POST -> 415; __proto__/constructor keys -> 400', async () => {
  const app = startServer({ secret: SECRET });
  const addr = await app.listen();
  const base = `http://127.0.0.1:${addr.port}`;
  const tok = issueToken('leader-aurora', SECRET);

  try {
    await jsonCall(base, 'POST', '/api/events', { eventId: 'ev-utf8', maxSize: 4 }, tok);

    // 1. Split 4-byte emoji UTF-8 sequence (🚀 = F0 9F 9A 80) mid-character across TCP chunks
    const unicodeText = 'Handoff 🚀⚡日本語テスト verified';
    const rawBuf = Buffer.from(
      JSON.stringify({ eventId: 'ev-utf8', opId: 'utf8-split-op', text: unicodeText, epoch: 1 }),
      'utf8'
    );
    const rocketIdx = rawBuf.indexOf(Buffer.from([0xf0, 0x9f, 0x9a, 0x80]));
    assert.ok(rocketIdx > 0);
    const part1 = rawBuf.subarray(0, rocketIdx + 2); // Split right inside 4-byte emoji!
    const part2 = rawBuf.subarray(rocketIdx + 2);

    const chunkedRes = await new Promise((resolveRes, rejectRes) => {
      const req = httpRequest(
        {
          hostname: '127.0.0.1',
          port: addr.port,
          path: '/api/peer/notes',
          method: 'POST',
          headers: {
            'content-type': 'application/json; charset=utf-8',
            'content-length': rawBuf.length,
            authorization: `Bearer ${tok}`
          }
        },
        res => {
          const bufs = [];
          res.on('data', d => bufs.push(d));
          res.on('end', () => {
            resolveRes({ status: res.statusCode, body: JSON.parse(Buffer.concat(bufs).toString('utf8')) });
          });
        }
      );
      req.on('error', rejectRes);
      req.write(part1);
      setTimeout(() => {
        req.write(part2);
        req.end();
      }, 12);
    });
    assert.equal(chunkedRes.status, 201);

    const readBack = await jsonCall(base, 'GET', '/api/peer/notes?eventId=ev-utf8', null, tok);
    assert.equal(readBack.status, 200);
    assert.equal(readBack.body.notes[0].note, unicodeText);
    assert.equal(readBack.body.notes[0].note.includes('\uFFFD'), false);

    // 2. Non-JSON Content-Type: text/plain POST -> 415 UNSUPPORTED_MEDIA_TYPE
    const plainRes = await jsonCall(
      base,
      'POST',
      '/api/teams',
      '{"eventId":"ev-utf8","teamId":"bad-ct"}',
      tok,
      { 'content-type': 'text/plain' }
    );
    assert.equal(plainRes.status, 415);

    // 3. __proto__ and constructor.prototype keys -> 400 INVALID_JSON
    const protoRaw = '{"eventId":"ev-utf8","teamId":"p1","__proto__":{"polluted":true}}';
    const protoRes = await jsonCall(base, 'POST', '/api/teams', protoRaw, tok);
    assert.equal(protoRes.status, 400);
    assert.equal(protoRes.body.error, 'INVALID_JSON');
    assert.equal(({}).polluted, undefined);

    const ctorRaw = '{"eventId":"ev-utf8","nested":{"constructor":{"prototype":{"pwned":1}}}}';
    const ctorRes = await jsonCall(base, 'POST', '/api/teams', ctorRaw, tok);
    assert.equal(ctorRes.status, 400);
    assert.equal(ctorRes.body.error, 'INVALID_JSON');
  } finally {
    await app.close();
  }
});

test('SEC07 | Duplicate teamId across two different actors or events returns clean 409 TEAM_EXISTS (never 500)', async () => {
  const app = startServer({ secret: SECRET });
  const addr = await app.listen();
  const base = `http://127.0.0.1:${addr.port}`;
  try {
    const tokA = issueToken('actor-alpha', SECRET);
    const tokB = issueToken('actor-bravo', SECRET);
    const tokC = issueToken('actor-charlie', SECRET);

    await jsonCall(base, 'POST', '/api/events', { eventId: 'ev-1', maxSize: 4 }, tokA);
    await jsonCall(base, 'POST', '/api/events', { eventId: 'ev-2', maxSize: 4 }, tokA);

    const first = await jsonCall(base, 'POST', '/api/teams', { eventId: 'ev-1', teamId: 'shared-crew' }, tokA);
    assert.equal(first.status, 201);

    // Same event, different actor -> 409 TEAM_EXISTS
    const dupSameEv = await jsonCall(base, 'POST', '/api/teams', { eventId: 'ev-1', teamId: 'shared-crew' }, tokB);
    assert.equal(dupSameEv.status, 409);
    assert.equal(dupSameEv.body.error, 'TEAM_EXISTS');

    // Different event, different actor (global PK on teams.id) -> 409 TEAM_EXISTS (never 500!)
    const dupCrossEv = await jsonCall(base, 'POST', '/api/teams', { eventId: 'ev-2', teamId: 'shared-crew' }, tokC);
    assert.equal(dupCrossEv.status, 409);
    assert.equal(dupCrossEv.body.error, 'TEAM_EXISTS');
  } finally {
    await app.close();
  }
});

test('SEC08 | Spoofed X-Forwarded-For is ignored when PS1_TRUST_PROXY is unset; COOP/CORP/Permissions-Policy/HSTS/no-CORS enforced', async () => {
  const prevTrust = process.env.PS1_TRUST_PROXY;
  delete process.env.PS1_TRUST_PROXY;
  const app = startServer({ secret: SECRET, enforceRateLimit: true });
  const addr = await app.listen();
  const base = `http://127.0.0.1:${addr.port}`;

  try {
    // 1. Verify security headers on API & HTTPS-forwarded responses
    const health = await jsonCall(base, 'GET', '/health', null, null, { 'x-forwarded-proto': 'https' });
    assert.equal(health.status, 200);
    assert.equal(health.headers.get('cross-origin-opener-policy'), 'same-origin');
    assert.equal(health.headers.get('cross-origin-resource-policy'), 'same-origin');
    assert.equal(
      health.headers.get('permissions-policy'),
      'camera=(), microphone=(), geolocation=(), payment=(), usb=()'
    );
    assert.equal(health.headers.get('cache-control'), 'no-store');
    assert.equal(health.headers.get('strict-transport-security'), 'max-age=63072000; includeSubDomains');
    assert.equal(health.headers.get('access-control-allow-origin'), null);

    // 2. Send 21 login attempts each with a DIFFERENT spoofed X-Forwarded-For IP:
    // Because PS1_TRUST_PROXY is unset, all 21 share socket IP 127.0.0.1 and hit 429 on #21!
    const statuses = [];
    let retryAfterHeader = null;
    for (let i = 1; i <= 21; i++) {
      const r = await jsonCall(
        base,
        'POST',
        '/api/auth/login',
        { username: 'nobody', password: '' },
        null,
        { 'x-forwarded-for': `203.0.113.${i}`, 'cf-connecting-ip': `198.51.100.${i}` }
      );
      statuses.push(r.status);
      if (r.status === 429) retryAfterHeader = r.headers.get('retry-after');
    }
    assert.equal(statuses.slice(0, 20).every(s => s === 401), true);
    assert.equal(statuses[20], 429, 'Expected 21st request to be rate-limited despite spoofed X-Forwarded-For');
    assert.equal(retryAfterHeader, '10');

    // 3. Pre-fill rateBuckets to 4,096 capacity with single-shot decoy IPs, then verify PS1_TRUST_PROXY=1
    // ignores forged CF-Connecting-IP & left-side XFF hops AND survives 500 full-table eviction scans
    process.env.PS1_TRUST_PROXY = '1';
    for (let batch = 0; batch < 41; batch++) {
      const batchRes = await Promise.all(
        Array.from({ length: 100 }, (_, k) => {
          const i = batch * 100 + k;
          const oct2 = Math.floor(i / 250) + 1;
          const oct3 = (i % 250) + 1;
          return jsonCall(
            base,
            'POST',
            '/api/auth/demo',
            { actorId: 'leader-aurora', eventId: 'seed-event' },
            null,
            { 'x-forwarded-for': `10.${oct2}.${oct3}.1` }
          );
        })
      );
      assert.equal(batchRes.every(r => r.status === 200), true);
    }

    const paasStatuses = [];
    for (let i = 1; i <= 21; i++) {
      const r = await jsonCall(
        base,
        'POST',
        '/api/auth/login',
        { username: 'nobody', password: '' },
        null,
        {
          'cf-connecting-ip': `198.51.100.${i}`,
          'x-forwarded-for': `192.0.2.${i}, 203.0.113.99`
        }
      );
      paasStatuses.push(r.status);
    }
    assert.equal(paasStatuses.slice(0, 20).every(s => s === 401), true);
    assert.equal(
      paasStatuses[20],
      429,
      'PS1_TRUST_PROXY=1 must ignore forged CF-Connecting-IP and lock onto rightmost XFF hop'
    );

    // 4. Fire 500 additional new decoy IPs while table is at 4,096 cap (500 eviction scans in <150ms << 3000ms refill)
    for (let batch = 0; batch < 5; batch++) {
      const burst = await Promise.all(
        Array.from({ length: 100 }, (_, k) => {
          const i = batch * 100 + k;
          const oct2 = Math.floor(i / 250) + 50;
          const oct3 = (i % 250) + 1;
          return jsonCall(
            base,
            'POST',
            '/api/auth/demo',
            { actorId: 'leader-aurora', eventId: 'seed-event' },
            null,
            { 'x-forwarded-for': `10.${oct2}.${oct3}.2` }
          );
        })
      );
      assert.equal(burst.every(r => r.status === 200), true);
    }
    const stillBlocked = await jsonCall(
      base,
      'POST',
      '/api/auth/login',
      { username: 'nobody', password: '' },
      null,
      { 'x-forwarded-for': '203.0.113.99' }
    );
    assert.equal(
      stillBlocked.status,
      429,
      'Exhausted 429 rate bucket must survive 500 full-table decoy IP eviction scans'
    );

    // 5. Explicit Cloudflare mode (PS1_TRUST_PROXY=cloudflare) honors CF-Connecting-IP
    process.env.PS1_TRUST_PROXY = 'cloudflare';
    const cfStatuses = [];
    for (let i = 1; i <= 21; i++) {
      const r = await jsonCall(
        base,
        'POST',
        '/api/auth/login',
        { username: 'nobody', password: '' },
        null,
        { 'cf-connecting-ip': '198.51.100.200', 'x-forwarded-for': `172.16.0.${i}` }
      );
      cfStatuses.push(r.status);
    }
    assert.equal(cfStatuses.slice(0, 20).every(s => s === 401), true);
    assert.equal(cfStatuses[20], 429);
  } finally {
    if (prevTrust !== undefined) process.env.PS1_TRUST_PROXY = prevTrust;
    else delete process.env.PS1_TRUST_PROXY;
    await app.close();
  }
});

test('SEC09 | Exported white-paper HTML escapes single quotes and embeds strict self-contained meta CSP', () => {
  assert.equal(escapeHtml("O'Reilly & <script>\"xss\"</script>"), 'O&#39;Reilly &amp; &lt;script&gt;&quot;xss&quot;&lt;/script&gt;');

  const html = buildTeamPlanWhitePaperHtml({
    eventId: "ev-'onload=alert(1)'",
    teamId: "crew-'<img src=x onerror=alert(1)>",
    goalDescription: "Ship 'secure' charter <script>evil()</script>",
    horizonHours: 6,
    tasks: [{ id: "t1-'quote'", skill: 'backend', durationMin: 60, after: [] }],
    teamPeople: [{ id: "aurora-'lead'", timezone: 'UTC-5', skills: { backend: 'supported' } }],
    plan: { status: 'FEASIBLE_WITNESS', classification: 'FEASIBLE' }
  });

  assert.ok(
    html.includes('<meta http-equiv="Content-Security-Policy" content="default-src \'none\'; style-src \'unsafe-inline\'">'),
    'Exported HTML must embed strict self-contained Content-Security-Policy meta tag'
  );
  assert.equal(html.includes('<script>'), false);
  assert.equal(html.includes('<img src=x'), false);
  assert.ok(html.includes('&#39;onload=alert(1)&#39;'));
});

test('SEC10 | Defensive SQLite pragmas, bounded 512-key LRU, revoked-token pruning, bounded recentAudit & hardened Docker artifacts', () => {
  const tmp = makeTempDir('h4h-sec10-');
  const dbPath = tmp.file('pragmas.sqlite');
  const app = startServer({ dbPath, secret: SECRET });

  try {
    // 1. Verify SQLite pragmas on file-backed DB
    const fk = app.authority.db.prepare('PRAGMA foreign_keys').get().foreign_keys;
    const trusted = app.authority.db.prepare('PRAGMA trusted_schema').get().trusted_schema;
    const jMode = String(app.authority.db.prepare('PRAGMA journal_mode').get().journal_mode).toLowerCase();
    const maxPages = app.authority.db.prepare('PRAGMA max_page_count').get().max_page_count;
    assert.equal(fk, 1);
    assert.equal(trusted, 0);
    assert.equal(jMode, 'wal');
    assert.equal(maxPages, 131072);
    assert.equal(app.http.headersTimeout, 10000);
    assert.equal(app.http.requestTimeout, 15000);
    assert.equal(app.http.keepAliveTimeout, 5000);
    assert.equal(app.http.maxHeadersCount, 64);

    // 2. Verify bounded recentAudit(eventId, 100) returns chronological tail
    app.authority.createEvent('ev-audit', 5);
    for (let i = 0; i < 135; i++) {
      app.authority.log('ev-audit', 't', 'actor', `op-${i}`, 'TEST_ACTION', 1000 + i, { idx: i });
    }
    const recent = app.authority.recentAudit('ev-audit', 100);
    assert.equal(recent.length, 100);
    assert.equal(JSON.parse(recent[0].detail).idx, 35);
    assert.equal(JSON.parse(recent[99].detail).idx, 134);

    // 3. Verify revoked-token pruning (> 7,200,000 ms pruned automatically) and 8,192-row ceiling
    const now = Date.now();
    app.ext.revokeToken('expired-tok-old', now - 7_500_000);
    assert.equal(app.ext.isRevoked('expired-tok-old'), true);
    app.ext.revokeToken('fresh-tok-new', now);
    assert.equal(app.ext.isRevoked('expired-tok-old'), false);
    assert.equal(app.ext.isRevoked('fresh-tok-new'), true);

    // 4. Verify in-memory actorKeys Map is strictly capped at <= 512 entries
    for (let i = 0; i < 530; i++) {
      app.ext._cacheActorKeyEntry(`synthetic-actor-${i}`, { pubPem: `pem-${i}` });
    }
    assert.equal(app.ext.actorKeys.size, 512);
    assert.equal(app.ext.actorKeys.has('synthetic-actor-0'), false);
    assert.equal(app.ext.actorKeys.has('synthetic-actor-529'), true);

    // 5. Verify hardened container, Render config, DEMO_PERSONA_RE UI parity & security docs
    const dockerfile = readFileSync(join(REPO_ROOT, 'Dockerfile'), 'utf8');
    assert.ok(dockerfile.includes('USER node'));
    assert.ok(dockerfile.includes('chmod -R a-w /app'));
    assert.ok(dockerfile.includes('HEALTHCHECK'));
    assert.ok(dockerfile.includes('PS1_DEMO_AUTH=1'));
    assert.ok(dockerfile.includes('.ps1_boot_secret'));
    assert.equal((dockerfile.match(/^FROM\s+/gm) || []).length, 2, 'Dockerfile must have exact 2-stage builder -> runtime');
    assert.equal((dockerfile.match(/^CMD\s+/gm) || []).length, 1, 'Dockerfile must have a single CMD block');

    const renderYaml = readFileSync(join(REPO_ROOT, 'render.yaml'), 'utf8');
    assert.ok(renderYaml.includes('key: PS1_DEMO_AUTH') && renderYaml.includes('value: "1"'));

    const compose = readFileSync(join(REPO_ROOT, 'docker-compose.hardened.yml'), 'utf8');
    assert.ok(compose.includes('read_only: true'));
    assert.ok(compose.includes('no-new-privileges:true'));
    assert.ok(compose.includes('127.0.0.1:8788:8788'));
    assert.ok(compose.includes('PS1_DEMO_AUTH: "1"'));

    const secDoc = readFileSync(join(REPO_ROOT, 'SECURITY.md'), 'utf8');
    assert.ok(secDoc.includes('## 1. Threat Model & Trust Boundaries'));
    assert.ok(secDoc.includes('PS1_DEMO_AUTH=0'));
    assert.ok(secDoc.includes('hkdfSync'));
    assert.ok(secDoc.includes('relay-warrant'));

    // Verify 100% UI-minted demo persona parity against DEMO_PERSONA_RE while blocking seeded builder-00000..09999
    const uiDemoSamples = [
      'leader-aurora',
      'builder-kai',
      'builder-priya',
      'relay-mateo',
      'race-leader',
      'lead-baton-1234',
      'lead-hall-1234',
      'lead-scarce-1234',
      'mem-1234-00-0',
      'aurora-plan-1234',
      'aurora-lead-1234ab',
      'priya-open-1234ab',
      'priya-claim-1234ab',
      'priya-wan-1234ab',
      'claimant-0',
      'claimant-49'
    ];
    for (const sample of uiDemoSamples) {
      assert.equal(DEMO_PERSONA_RE.test(sample), true, `UI persona '${sample}' must pass DEMO_PERSONA_RE`);
    }
    for (const forbidden of ['builder-00000', 'builder-04999', 'builder-09999', 'admin', 'root']) {
      assert.equal(DEMO_PERSONA_RE.test(forbidden), false, `Non-demo actor '${forbidden}' must fail DEMO_PERSONA_RE`);
    }
  } finally {
    app.authority.close();
    tmp.cleanup();
  }
});

function rawTcpHttp(port, rawLines) {
  return new Promise((resolveWire, rejectWire) => {
    const sock = createConnection({ host: '127.0.0.1', port }, () => {
      sock.write(rawLines.join('\r\n') + '\r\n\r\n');
    });
    const chunks = [];
    sock.on('data', c => chunks.push(c));
    sock.on('end', () => {
      const txt = Buffer.concat(chunks).toString('utf8');
      const headEnd = txt.indexOf('\r\n\r\n');
      const head = headEnd === -1 ? txt : txt.slice(0, headEnd);
      const body = headEnd === -1 ? '' : txt.slice(headEnd + 4);
      const statusMatch = head.match(/^HTTP\/1\.[01]\s+(\d{3})/);
      resolveWire({
        status: statusMatch ? Number(statusMatch[1]) : 0,
        head,
        body
      });
    });
    sock.on('error', rejectWire);
  });
}

test('SEC11 | Raw wire-level path traversal, double-encoding, sibling-prefix, dotfile, symlink & Windows device probes blocked', async () => {
  const tmp = makeTempDir('h4h-sec11-jail-');
  const distDir = join(tmp.dir, 'dist');
  const siblingSecretDir = join(tmp.dir, 'dist-secret');
  mkdirSync(join(distDir, 'assets'), { recursive: true });
  mkdirSync(join(distDir, 'dir.js'), { recursive: true });
  mkdirSync(siblingSecretDir, { recursive: true });

  writeFileSync(join(distDir, 'index.html'), '<!doctype html><title>JailTest</title>', 'utf8');
  writeFileSync(join(distDir, 'assets', 'app.js'), 'console.log("ok");', 'utf8');
  writeFileSync(join(distDir, '.env'), 'SECRET=SHOULD_NEVER_SERVE', 'utf8');
  writeFileSync(join(distDir, 'leak.sqlite'), 'SQLITE_SHOULD_NEVER_SERVE', 'utf8');
  writeFileSync(join(siblingSecretDir, 'stolen.js'), 'TOP_SECRET_SIBLING', 'utf8');
  const outsideSecret = join(tmp.dir, 'outside-secret.js');
  writeFileSync(outsideSecret, 'OUTSIDE_JAIL_SECRET', 'utf8');

  let symlinkCreated = false;
  try {
    symlinkSync(outsideSecret, join(distDir, 'assets', 'sym-escape.js'));
    symlinkCreated = true;
  } catch {
    // Windows without Developer Mode / symlink privilege skips symlink creation cleanly
  }

  const app = startServer({ secret: SECRET, distDir });
  const addr = await app.listen();

  try {
    // 1. Legitimate SPA entry & allowlisted asset succeed (GET + HEAD)
    const rootGet = await rawTcpHttp(addr.port, ['GET / HTTP/1.1', 'Host: localhost', 'Connection: close']);
    assert.equal(rootGet.status, 200);
    assert.ok(rootGet.body.includes('<title>JailTest</title>'));
    assert.match(rootGet.head, /x-frame-options:\s*DENY/i);

    const rootHead = await rawTcpHttp(addr.port, ['HEAD / HTTP/1.1', 'Host: localhost', 'Connection: close']);
    assert.equal(rootHead.status, 200);
    assert.equal(rootHead.body, '');

    const assetGet = await rawTcpHttp(addr.port, ['GET /assets/app.js HTTP/1.1', 'Host: localhost', 'Connection: close']);
    assert.equal(assetGet.status, 200);
    assert.equal(assetGet.body, 'console.log("ok");');

    // 2. Wire-level traversal, encoding, backslash, null-byte, semicolon, and Windows device probes -> 400 INVALID_PATH
    const badWireTargets = [
      '/../../package.json',
      '/../dist-secret/stolen.js',
      '/%2e%2e/dist-secret/stolen.js',
      '/%2e%2e%2fpackage.json',
      '/%2e%2e%5cpackage.json',
      '/%252e%252e%252fpackage.json',
      '/assets/..%5c..%5coutside-secret.js',
      '/assets/%00app.js',
      '/..;/api/events/seed-event/board',
      '//evil.example/assets/app.js',
      'http://evil.example/health',
      '/assets/CON.js',
      '/assets/NUL.txt',
      '/assets/app.js::$DATA'
    ];
    for (const target of badWireTargets) {
      const r = await rawTcpHttp(addr.port, [`GET ${target} HTTP/1.1`, 'Host: localhost', 'Connection: close']);
      assert.equal(r.status, 400, `Expected 400 INVALID_PATH for wire target '${target}', got ${r.status}`);
      assert.ok(!r.body.includes('SECRET') && !r.body.includes('<title>JailTest</title>'));
    }

    // 3. Dotfiles, non-allowlisted extensions (.sqlite), directories (dir.js), and scanner paths -> 404 JSON (never 200 SPA fallback or 500 EISDIR)
    const scannerTargets = [
      '/.env',
      '/.git/HEAD',
      '/.git/config',
      '/.wrangler/config/default.toml',
      '/leak.sqlite',
      '/dir.js',
      '/etc/passwd',
      '/proc/self/environ',
      '/wp-admin'
    ];
    for (const target of scannerTargets) {
      const r = await rawTcpHttp(addr.port, [`GET ${target} HTTP/1.1`, 'Host: localhost', 'Connection: close']);
      assert.equal(r.status, 404, `Expected 404 ROUTE_NOT_FOUND for scanner target '${target}', got ${r.status}`);
      assert.ok(!r.body.includes('SHOULD_NEVER_SERVE') && !r.body.includes('<title>JailTest</title>'));
    }

    // 4. Symlink escape inside dist/assets -> blocked (404)
    if (symlinkCreated) {
      const symRes = await rawTcpHttp(addr.port, ['GET /assets/sym-escape.js HTTP/1.1', 'Host: localhost', 'Connection: close']);
      assert.equal(symRes.status, 404);
      assert.ok(!symRes.body.includes('OUTSIDE_JAIL_SECRET'));
    }

    // 5. Direct unit assertions on resolveSafeStaticAsset & canonicalizeRequestUrl
    assert.equal(resolveSafeStaticAsset(distDir, '/../dist-secret/stolen.js'), null);
    assert.throws(() => canonicalizeRequestUrl('/%c0%afetc/passwd'), /INVALID_PATH/);
    assert.throws(() => canonicalizeRequestUrl('/' + 'a'.repeat(2100)), /URI_TOO_LONG/);
  } finally {
    await app.close();
    tmp.cleanup();
  }
});

test('SEC12 | Malformed URL crash immunity, CL.TE framing guard, TRACE/OPTIONS 405, dot-ID block & /api/peer/glue DoS cap', async () => {
  const app = startServer({ secret: SECRET });
  const addr = await app.listen();
  const base = `http://127.0.0.1:${addr.port}`;

  try {
    // 1. Malformed URL that throws in new URL() MUST NOT crash the async HTTP listener
    const badUrlRes = await rawTcpHttp(addr.port, ['GET http://[::1]:bad/ HTTP/1.1', 'Host: localhost', 'Connection: close']);
    assert.equal(badUrlRes.status, 400);

    // Server remains 100% alive afterward
    const alive = await rawTcpHttp(addr.port, ['HEAD /health HTTP/1.1', 'Host: localhost', 'Connection: close']);
    assert.equal(alive.status, 200);
    assert.equal(alive.body, '');

    // 2. HTTP Request Smuggling probe (both Transfer-Encoding and Content-Length) -> 400
    const smuggle = await rawTcpHttp(addr.port, [
      'POST /api/auth/login HTTP/1.1',
      'Host: localhost',
      'Content-Type: application/json',
      'Content-Length: 2',
      'Transfer-Encoding: chunked',
      'Connection: close'
    ]);
    assert.equal(smuggle.status, 400);

    // 3. Unsupported HTTP verbs (TRACE, OPTIONS, DELETE, PUT) -> 405 with Allow: GET, HEAD, POST
    for (const verb of ['TRACE', 'OPTIONS', 'DELETE', 'PUT']) {
      const r = await rawTcpHttp(addr.port, [`${verb} /health HTTP/1.1`, 'Host: localhost', 'Connection: close']);
      assert.equal(r.status, 405, `Expected 405 for ${verb}, got ${r.status}`);
      assert.match(r.head, /allow:\s*GET, HEAD, POST/i);
    }

    // 4. Dot / double-dot identifiers rejected across token minting & API routes
    assert.throws(() => issueToken('..', SECRET), /INVALID_ACTOR/);
    assert.throws(() => issueToken('a..b', SECRET), /INVALID_ACTOR/);
    const tok = issueToken('leader-aurora', SECRET);
    const badEv = await jsonCall(base, 'POST', '/api/events', { eventId: '..', maxSize: 4 }, tok);
    assert.equal(badEv.status, 400);

    // 5. /api/peer/glue O(N^2) array flooding capped at <= 128 records & /api/recommendations capped at <= 64 candidates
    const flood = Array.from({ length: 130 }, (_, i) => ({ id: `r-${i}` }));
    const glueFlood = await jsonCall(base, 'POST', '/api/peer/glue', { localRecords: flood, peerRecords: [] }, tok);
    assert.equal(glueFlood.status, 400);
    assert.equal(glueFlood.body.error, 'INVALID_RECORDS_SCOPE');

    const candFlood = Array.from({ length: 65 }, (_, i) => ({
      id: `cand-${i}`,
      consent: true,
      abilities: { backend: { support: true, refute: false } },
      windows: [{ start: 0, end: 120 }]
    }));
    const recFlood = await jsonCall(
      base,
      'POST',
      '/api/recommendations',
      {
        goal: {
          id: 'g1',
          startMin: 0,
          deadlineMin: 180,
          tasks: [{ id: 't1', skill: 'backend', durationMin: 60, after: [] }]
        },
        teamPeople: [],
        candidates: candFlood
      },
      tok
    );
    assert.equal(recFlood.status, 400);
    assert.equal(recFlood.body.error, 'INVALID_CANDIDATE_SCOPE');

    // 6. RFC 9112 duplicate Content-Length & non-chunked Transfer-Encoding rejected with 400 + Connection: close
    const dupCl = await rawTcpHttp(addr.port, [
      'POST /api/auth/login HTTP/1.1',
      'Host: localhost',
      'Content-Type: application/json',
      'Content-Length: 2, 2',
      'Connection: close'
    ]);
    assert.equal(dupCl.status, 400);
    assert.match(dupCl.head, /connection:\s*close/i);

    const nonChunkedTe = await rawTcpHttp(addr.port, [
      'POST /api/auth/login HTTP/1.1',
      'Host: localhost',
      'Content-Type: application/json',
      'Transfer-Encoding: gzip',
      'Connection: close'
    ]);
    assert.equal(nonChunkedTe.status, 400);
    assert.match(nonChunkedTe.head, /connection:\s*close/i);

    // 7. Sub-payload window/ability/dependency fan-out caps block 32 KiB quadratic amplification
    const manyWindows = Array.from({ length: 65 }, (_, i) => ({ start: i * 2, end: i * 2 + 1 }));
    const winFlood = await jsonCall(
      base,
      'POST',
      '/api/plan',
      {
        goal: {
          id: 'g-win',
          startMin: 0,
          deadlineMin: 300,
          tasks: [{ id: 't1', skill: 'backend', durationMin: 10, after: [] }]
        },
        people: [
          {
            id: 'p1',
            consent: true,
            abilities: { backend: { support: true, refute: false } },
            windows: manyWindows
          }
        ]
      },
      tok
    );
    assert.equal(winFlood.status, 400);
    assert.equal(winFlood.body.error, 'INVALID_PERSON');

    const dupDep = await jsonCall(
      base,
      'POST',
      '/api/plan',
      {
        goal: {
          id: 'g-dep',
          startMin: 0,
          deadlineMin: 300,
          tasks: [
            { id: 't1', skill: 'backend', durationMin: 10, after: [] },
            { id: 't2', skill: 'backend', durationMin: 10, after: ['t1', 't1'] }
          ]
        },
        people: [
          {
            id: 'p1',
            consent: true,
            abilities: { backend: { support: true, refute: false } },
            windows: [{ start: 0, end: 200 }]
          }
        ]
      },
      tok
    );
    assert.equal(dupDep.status, 400);
    assert.equal(dupDep.body.error, 'INVALID_DEPENDENCY');

    // 8. Oversized rejected Content-Type closes socket immediately instead of polite stream draining
    const rejectedLarge = await rawTcpHttp(addr.port, [
      'POST /api/auth/login HTTP/1.1',
      'Host: localhost',
      'Content-Type: text/plain',
      'Content-Length: 1048576',
      'Connection: keep-alive'
    ]);
    assert.equal(rejectedLarge.status, 415);
    assert.match(rejectedLarge.head, /connection:\s*close/i);

    // 9. Fair max-min SSE eviction prevents multi-stream hoarders from 503-starving a new single-stream viewer
    const prevTrustSse = process.env.PS1_TRUST_PROXY;
    process.env.PS1_TRUST_PROXY = '1';
    const openSockets = [];
    try {
      for (let ipIdx = 1; ipIdx <= 20; ipIdx++) {
        for (let c = 0; c < 5; c++) {
          await new Promise((resOpen, rejOpen) => {
            const s = createConnection({ host: '127.0.0.1', port: addr.port }, () => {
              s.write(
                `GET /api/events/seed-event/stream HTTP/1.1\r\nHost: localhost\r\nX-Forwarded-For: 198.18.0.${ipIdx}\r\n\r\n`
              );
            });
            openSockets.push(s);
            s.once('data', buf => {
              assert.match(buf.toString('utf8'), /^HTTP\/1\.1 200/);
              resOpen();
            });
            s.once('error', rejOpen);
          });
        }
      }
      // 101st viewer from a brand-new IP (0 active streams) evicts 1 hoarder tab and connects with 200 (never 503)
      const freshJudgeHead = await new Promise((resOpen, rejOpen) => {
        const s = createConnection({ host: '127.0.0.1', port: addr.port }, () => {
          s.write(
            'GET /api/events/seed-event/stream HTTP/1.1\r\nHost: localhost\r\nX-Forwarded-For: 203.0.113.250\r\n\r\n'
          );
        });
        openSockets.push(s);
        s.once('data', buf => resOpen(buf.toString('utf8')));
        s.once('error', rejOpen);
      });
      assert.match(freshJudgeHead, /^HTTP\/1\.1 200/);
    } finally {
      for (const s of openSockets) s.destroy();
      if (prevTrustSse !== undefined) process.env.PS1_TRUST_PROXY = prevTrustSse;
      else delete process.env.PS1_TRUST_PROXY;
    }
  } finally {
    await app.close();
  }
});
