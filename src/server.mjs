// H4H PS1 | Unified Layer-A Authority + R5 Solvers + Layer-B Peer Adapter + Static UI Host
import { createServer } from 'node:http';
import { createHmac, createHash, timingSafeEqual } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { resolve, dirname, extname, normalize } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { MembershipAuthority } from './authority.mjs';
import { planGoal } from './goal-planner.mjs';
import { recommendComplementary, contextGlueOrExplain } from './synchronicity-solvers.mjs';
import { SynchronicityExtension } from './synchronicity-ext.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const DIST_DIR = resolve(HERE, '../web/dist');

const ID_RE = /^[A-Za-z0-9_.:@-]{1,128}$/;
export const DEMO_PERSONA_RE =
  /^(leader-aurora|builder-kai|builder-priya|relay-mateo|race-leader|(aurora|priya|kai|mateo|lead|mem|claimant)-[A-Za-z0-9_-]{1,28})$/;
const DEMO_AUTO_EVENT_RE = /^(seed-event|h4h-open-crews|race-[A-Za-z0-9_-]{1,40})$/;
const FORBIDDEN_JSON_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

const b64 = o => Buffer.from(JSON.stringify(o)).toString('base64url');
const sign = (p, secret) => createHmac('sha256', secret).update(p).digest('base64url');

export function issueToken(actor, secret, ttlSec = 3600, roles = ['member']) {
  if (typeof actor !== 'string' || !ID_RE.test(actor)) throw Error('INVALID_ACTOR');
  if (typeof secret !== 'string' || Buffer.byteLength(secret) < 32) throw Error('SECRET_TOO_SHORT');
  const p = b64({ sub: actor, roles, aud: 'h4h-ps1-local', exp: Math.floor(Date.now() / 1000) + ttlSec });
  return p + '.' + sign(p, secret);
}

export function verifyToken(token, secret) {
  if (typeof token !== 'string' || token.length > 2048) throw Error('UNAUTHORIZED');
  const parts = token.split('.');
  if (parts.length !== 2) throw Error('UNAUTHORIZED');
  const expected = Buffer.from(sign(parts[0], secret));
  const got = Buffer.from(parts[1]);
  if (expected.length !== got.length || !timingSafeEqual(expected, got)) throw Error('UNAUTHORIZED');
  let p;
  try {
    p = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8'));
  } catch {
    throw Error('UNAUTHORIZED');
  }
  if (
    p.aud !== 'h4h-ps1-local' ||
    !Number.isInteger(p.exp) ||
    p.exp <= Date.now() / 1000 ||
    typeof p.sub !== 'string' ||
    !ID_RE.test(p.sub) ||
    !Array.isArray(p.roles)
  ) {
    throw Error('UNAUTHORIZED');
  }
  return p;
}

export function issueRelayWarrant({ sub, eventId, teamId, opId, codeHash }, secret, ttlSec = 600) {
  if (typeof sub !== 'string' || !ID_RE.test(sub)) throw Error('INVALID_ACTOR');
  if (typeof eventId !== 'string' || !ID_RE.test(eventId)) throw Error('INVALID_EVENT');
  if (typeof teamId !== 'string' || !ID_RE.test(teamId)) throw Error('INVALID_TEAM');
  if (typeof opId !== 'string' || !ID_RE.test(opId)) throw Error('INVALID_OPERATION');
  if (typeof codeHash !== 'string' || !/^[0-9a-f]{64}$/.test(codeHash)) throw Error('INVALID_CODE_HASH');
  if (typeof secret !== 'string' || Buffer.byteLength(secret) < 32) throw Error('SECRET_TOO_SHORT');
  const boundedTtl = Math.min(3600, Math.max(1, Math.trunc(Number(ttlSec) || 600)));
  const p = b64({
    sub,
    eventId,
    teamId,
    opId,
    codeHash,
    aud: 'h4h-ps1-relay-warrant',
    exp: Math.floor(Date.now() / 1000) + boundedTtl
  });
  return p + '.' + sign(p, secret);
}

export function verifyRelayWarrant(token, secret) {
  if (typeof token !== 'string' || token.length > 2048) throw Error('UNAUTHORIZED');
  const parts = token.split('.');
  if (parts.length !== 2) throw Error('UNAUTHORIZED');
  const expected = Buffer.from(sign(parts[0], secret));
  const got = Buffer.from(parts[1]);
  if (expected.length !== got.length || !timingSafeEqual(expected, got)) throw Error('UNAUTHORIZED');
  let p;
  try {
    p = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8'));
  } catch {
    throw Error('UNAUTHORIZED');
  }
  if (
    p.aud !== 'h4h-ps1-relay-warrant' ||
    !Number.isInteger(p.exp) ||
    p.exp <= Date.now() / 1000 ||
    typeof p.sub !== 'string' ||
    !ID_RE.test(p.sub) ||
    typeof p.eventId !== 'string' ||
    typeof p.teamId !== 'string' ||
    typeof p.opId !== 'string' ||
    typeof p.codeHash !== 'string' ||
    !/^[0-9a-f]{64}$/.test(p.codeHash)
  ) {
    throw Error('UNAUTHORIZED');
  }
  return p;
}

function parseTokenAudience(rawToken) {
  if (typeof rawToken !== 'string' || rawToken.length > 2048) return '';
  const dot = rawToken.indexOf('.');
  if (dot <= 0) return '';
  try {
    const p = JSON.parse(Buffer.from(rawToken.slice(0, dot), 'base64url').toString('utf8'));
    return typeof p?.aud === 'string' ? p.aud : '';
  } catch {
    return '';
  }
}

const errStatus = {
  UNAUTHORIZED: 401,
  LEADER_REQUIRED: 403,
  NOT_MEMBER: 403,
  DEMO_PERSONA_FORBIDDEN: 403,
  SELF_RELAY_FORBIDDEN: 403,
  NO_EVENT: 404,
  NO_TEAM: 404,
  ACCOUNT_EXISTS: 409,
  TEAM_EXISTS: 409,
  TARGET_NOT_TEAM_MEMBER: 409,
  ONE_TEAM_PER_EVENT: 409,
  TEAM_FULL: 409,
  IDEMPOTENCY_KEY_REUSED: 409,
  INVITE_INVALID_OR_USED: 409,
  INVITE_EXPIRED: 410,
  UNSUPPORTED_MEDIA_TYPE: 415,
  TOO_MANY_REQUESTS: 429,
  AUTH_BUSY: 429
};

const commonSecurityHeaders = {
  'cache-control': 'no-store',
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'no-referrer',
  'cross-origin-opener-policy': 'same-origin',
  'cross-origin-resource-policy': 'same-origin',
  'permissions-policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=()'
};

const apiHeaders = {
  ...commonSecurityHeaders,
  'content-type': 'application/json; charset=utf-8',
  'content-security-policy': "default-src 'none'; frame-ancestors 'none'"
};

const mimeByExt = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml'
};

function hasForbiddenProtoKeys(node, depth = 0) {
  if (depth > 32) return true;
  if (!node || typeof node !== 'object') return false;
  if (Array.isArray(node)) {
    for (let i = 0; i < node.length; i++) {
      if (hasForbiddenProtoKeys(node[i], depth + 1)) return true;
    }
    return false;
  }
  const ownKeys = Object.getOwnPropertyNames(node);
  for (let i = 0; i < ownKeys.length; i++) {
    const k = ownKeys[i];
    if (FORBIDDEN_JSON_KEYS.has(k)) return true;
    if (hasForbiddenProtoKeys(node[k], depth + 1)) return true;
  }
  return false;
}

function readJson(req, limitBytes = 16384) {
  const ct = String(req.headers['content-type'] || '').trim().toLowerCase();
  if (!ct.startsWith('application/json')) {
    req.resume();
    return Promise.reject(Error('UNSUPPORTED_MEDIA_TYPE'));
  }
  return new Promise((resolveBody, reject) => {
    const chunks = [];
    let bytes = 0;
    let done = false;
    req.on('data', c => {
      if (done) return;
      const buf = Buffer.isBuffer(c) ? c : Buffer.from(c);
      bytes += buf.length;
      if (bytes > limitBytes) {
        done = true;
        reject(Error('PAYLOAD_TOO_LARGE'));
        req.destroy();
        return;
      }
      chunks.push(buf);
    });
    req.on('end', () => {
      if (done) return;
      try {
        const s = Buffer.concat(chunks, bytes).toString('utf8');
        const x = JSON.parse(s);
        if (!x || Array.isArray(x) || typeof x !== 'object' || hasForbiddenProtoKeys(x)) throw Error();
        resolveBody(x);
      } catch {
        reject(Error('INVALID_JSON'));
      }
    });
    req.on('error', e => {
      if (!done) {
        done = true;
        reject(e);
      }
    });
  });
}

function isLoopbackIp(ip) {
  return ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1';
}

function getClientIp(req) {
  const sockIp = String(req.socket?.remoteAddress || '127.0.0.1').trim();
  if (process.env.PS1_TRUST_PROXY === '1') {
    const cfIp = typeof req.headers['cf-connecting-ip'] === 'string' ? req.headers['cf-connecting-ip'].trim() : '';
    if (cfIp) return cfIp;
    const xff = typeof req.headers['x-forwarded-for'] === 'string' ? req.headers['x-forwarded-for'] : '';
    if (xff) {
      const parts = xff
        .split(',')
        .map(s => s.trim())
        .filter(Boolean);
      if (parts.length > 0) return parts[parts.length - 1];
    }
  }
  return sockIp;
}

export function startServer({
  dbPath = ':memory:',
  secret,
  host = '127.0.0.1',
  port = 0,
  enableDemo = true,
  enforceRateLimit = false
} = {}) {
  if (typeof secret !== 'string' || Buffer.byteLength(secret) < 32) throw Error('SECRET_TOO_SHORT');
  const authority = new MembershipAuthority(dbPath);
  const ext = new SynchronicityExtension(authority, secret);
  const streamClients = new Set();
  const sseByIp = new Map();
  const rateBuckets = new Map();

  function consumeRateToken(bucketKey, capacityPerMin, now = Date.now()) {
    let b = rateBuckets.get(bucketKey);
    const refillPerMs = capacityPerMin / 60000;
    if (!b) {
      if (rateBuckets.size >= 4096) {
        const oldestKey = rateBuckets.keys().next().value;
        rateBuckets.delete(oldestKey);
      }
      b = { tokens: capacityPerMin, last: now };
      rateBuckets.set(bucketKey, b);
    } else {
      const elapsed = Math.max(0, now - b.last);
      b.tokens = Math.min(capacityPerMin, b.tokens + elapsed * refillPerMs);
      b.last = now;
    }
    if (b.tokens < 1) return false;
    b.tokens -= 1;
    return true;
  }

  const publish = evId => {
    const data =
      'event: board\ndata: ' +
      JSON.stringify({ eventId: evId, type: 'ROSTER_REVISION', revision: Date.now() }) +
      '\n\n';
    for (const client of streamClients) {
      if (client.eventId === evId && !client.res.destroyed) client.res.write(data);
    }
  };

  function requireBearer(req) {
    const bearer = /^Bearer (.+)$/.exec(req.headers.authorization || '');
    if (!bearer) throw Error('UNAUTHORIZED');
    const raw = bearer[1];
    if (ext.isRevoked(raw)) throw Error('UNAUTHORIZED');
    const identity = verifyToken(raw, secret);
    if (!identity.roles.includes('member')) throw Error('UNAUTHORIZED');
    return { identity, raw };
  }

  const http = createServer(async (req, res) => {
    const isHttps = String(req.headers['x-forwarded-proto'] || '').trim().toLowerCase() === 'https';

    function withDynamicSecurityHeaders(baseHeaders, extraHeaders = {}) {
      const h = { ...baseHeaders, ...extraHeaders };
      if (isHttps) {
        h['strict-transport-security'] = 'max-age=63072000; includeSubDomains';
      }
      return h;
    }

    function respond(status, data, extraHeaders = {}) {
      if (res.destroyed) return;
      res.writeHead(status, withDynamicSecurityHeaders(apiHeaders, extraHeaders));
      res.end(JSON.stringify(data));
    }

    const parsedUrl = new URL(req.url || '/', 'http://localhost');
    const route = parsedUrl.pathname;
    const clientIp = getClientIp(req);

    try {
      if (req.method === 'GET' && route === '/health') {
        respond(200, { status: 'up' });
        return;
      }

      const boardMatch = route.match(/^\/api\/events\/([A-Za-z0-9_.:@-]{1,128})\/board$/);
      if (req.method === 'GET' && boardMatch) {
        const limit = Number(parsedUrl.searchParams.get('limit') || 100);
        const offset = Number(parsedUrl.searchParams.get('offset') || 0);
        const teams = authority.board(boardMatch[1], limit, offset);
        if (parsedUrl.searchParams.get('meta') === '1') {
          const evId = boardMatch[1];
          const totalTeams = authority.db.prepare('SELECT COUNT(*) AS n FROM teams WHERE event_id=?').get(evId)?.n || 0;
          const totalMembers =
            authority.db.prepare('SELECT COUNT(*) AS n FROM membership WHERE event_id=?').get(evId)?.n || 0;
          const evRow = authority.db.prepare('SELECT max_size FROM events WHERE id=?').get(evId);
          respond(200, { teams, totalTeams, totalMembers, maxSize: evRow?.max_size ?? null });
          return;
        }
        respond(200, { teams });
        return;
      }

      const teamDetailMatch = route.match(
        /^\/api\/events\/([A-Za-z0-9_.:@-]{1,128})\/teams\/([A-Za-z0-9_.:@-]{1,128})$/
      );
      if (req.method === 'GET' && teamDetailMatch) {
        respond(200, ext.teamDetails(teamDetailMatch[1], teamDetailMatch[2]));
        return;
      }

      const auditMatch = route.match(/^\/api\/events\/([A-Za-z0-9_.:@-]{1,128})\/audit$/);
      if (req.method === 'GET' && auditMatch) {
        requireBearer(req);
        const rows = authority.recentAudit(auditMatch[1], 100);
        respond(200, { eventId: auditMatch[1], audit: rows });
        return;
      }

      if (req.method === 'GET' && route === '/api/peer/notes') {
        requireBearer(req);
        const evId = parsedUrl.searchParams.get('eventId') || '';
        respond(200, { notes: ext.listPeerNotes(evId, 25) });
        return;
      }

      const streamMatch = route.match(/^\/api\/events\/([A-Za-z0-9_.:@-]{1,128})\/stream$/);
      if (req.method === 'GET' && streamMatch) {
        if (streamClients.size >= 100) {
          respond(503, { error: 'STREAM_CAPACITY' });
          return;
        }
        const ipStreams = sseByIp.get(clientIp) || 0;
        if (!isLoopbackIp(clientIp) && ipStreams >= 6) {
          respond(429, { error: 'TOO_MANY_REQUESTS' }, { 'retry-after': '10' });
          return;
        }
        sseByIp.set(clientIp, ipStreams + 1);
        res.writeHead(
          200,
          withDynamicSecurityHeaders(apiHeaders, {
            'content-type': 'text/event-stream; charset=utf-8',
            connection: 'keep-alive',
            'x-accel-buffering': 'no'
          })
        );
        res.write(': connected\n\n');
        const keepalive = setInterval(() => {
          if (!res.destroyed) res.write(': keepalive\n\n');
        }, 25000);
        keepalive.unref?.();

        let cleaned = false;
        const client = {
          eventId: streamMatch[1],
          res,
          cleanup() {
            if (cleaned) return;
            cleaned = true;
            clearInterval(keepalive);
            streamClients.delete(client);
            const cur = (sseByIp.get(clientIp) || 1) - 1;
            if (cur <= 0) sseByIp.delete(clientIp);
            else sseByIp.set(clientIp, cur);
          }
        };
        streamClients.add(client);
        req.on('close', () => client.cleanup());
        return;
      }

      // Static React UI serving for non-/api GET routes when web/dist is built
      if (req.method === 'GET' && !route.startsWith('/api/')) {
        if (existsSync(resolve(DIST_DIR, 'index.html'))) {
          const cleanRel =
            route === '/'
              ? 'index.html'
              : normalize(route)
                  .replace(/^(\.\.(\/|\\|$))+/, '')
                  .replace(/^[\/\\]+/, '');
          const candidate = resolve(DIST_DIR, cleanRel);
          const target =
            candidate.startsWith(DIST_DIR) && existsSync(candidate) && extname(candidate)
              ? candidate
              : extname(cleanRel)
                ? null
                : resolve(DIST_DIR, 'index.html');
          if (target && existsSync(target)) {
            const extType = mimeByExt[extname(target)] || 'application/octet-stream';
            res.writeHead(
              200,
              withDynamicSecurityHeaders(commonSecurityHeaders, {
                'content-type': extType,
                'content-security-policy':
                  "default-src 'self'; connect-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; frame-ancestors 'none'"
              })
            );
            res.end(readFileSync(target));
            return;
          }
        }
        respond(404, { error: 'ROUTE_NOT_FOUND' });
        return;
      }

      if (req.method !== 'POST') {
        respond(404, { error: 'ROUTE_NOT_FOUND' });
        return;
      }

      // Per-IP token-bucket rate limiting (bypassed on loopback when port === 0 unless enforceRateLimit is set, or PS1_RATE_LIMIT === '0')
      const bypassLoopback =
        process.env.PS1_RATE_LIMIT === '0' || (!enforceRateLimit && port === 0 && isLoopbackIp(clientIp));
      if (!bypassLoopback) {
        let bucketGroup = 'mut';
        let limitPerMin = 240;
        if (route === '/api/auth/login' || route === '/api/auth/register') {
          bucketGroup = 'auth';
          limitPerMin = 20;
        } else if (route === '/api/auth/demo') {
          bucketGroup = 'demo';
          limitPerMin = 120;
        } else if (route === '/api/demo/race-50') {
          bucketGroup = 'race50';
          limitPerMin = 10;
        }
        if (!consumeRateToken(`${bucketGroup}:${clientIp}`, limitPerMin)) {
          req.resume();
          respond(429, { error: 'TOO_MANY_REQUESTS' }, { 'retry-after': '10' });
          return;
        }
      }

      // Public account registration / login / optional demo persona routes
      if (route === '/api/auth/register') {
        const payload = await readJson(req);
        const acc = await ext.registerAsync(payload);
        respond(201, { ...acc, token: issueToken(acc.actorId, secret, 7200) });
        return;
      }
      if (route === '/api/auth/login') {
        const payload = await readJson(req);
        const acc = await ext.authenticateAsync(payload);
        respond(200, { ...acc, token: issueToken(acc.actorId, secret, 7200) });
        return;
      }
      if (route === '/api/auth/demo' && enableDemo && process.env.PS1_DEMO_AUTH !== '0') {
        const payload = await readJson(req);
        const persona = String(payload.actorId || 'leader-aurora');
        const evId = String(payload.eventId || 'seed-event');
        if (!ID_RE.test(persona)) throw Error('INVALID_ACTOR');
        if (!ID_RE.test(evId)) throw Error('INVALID_EVENT');
        if (!DEMO_PERSONA_RE.test(persona) || ext.hasRegisteredAccount(persona)) {
          throw Error('DEMO_PERSONA_FORBIDDEN');
        }
        const clampedSize = Math.min(10, Math.max(1, Math.trunc(Number(payload.maxSize) || 4)));
        if (DEMO_AUTO_EVENT_RE.test(evId)) {
          ext.ensureEvent(evId, clampedSize);
        }
        respond(200, { actorId: persona, eventId: evId, token: issueToken(persona, secret, 7200) });
        return;
      }

      // Authenticated POST routes
      const { identity, raw } = requireBearer(req);
      const actorId = identity.sub;

      if (route === '/api/auth/logout') {
        ext.revokeToken(raw);
        respond(200, { status: 'REVOKED', actorId });
        return;
      }

      const payload = await readJson(req, 32768);

      if (route === '/api/auth/relay-warrant') {
        const warrant = issueRelayWarrant(
          {
            sub: actorId,
            eventId: payload.eventId,
            teamId: payload.teamId,
            opId: payload.opId,
            codeHash: payload.codeHash
          },
          secret,
          600
        );
        respond(200, { warrant, actorId, expiresInSec: 600 });
        return;
      }
      if (route === '/api/events') {
        const r = ext.ensureEvent(payload.eventId, Number(payload.maxSize || 4));
        respond(r.created ? 201 : 200, r);
        return;
      }
      if (route === '/api/plan') {
        respond(
          200,
          planGoal({ goal: payload.goal, people: payload.people, maxNodes: Math.min(5000, payload.maxNodes || 5000) })
        );
        return;
      }
      if (route === '/api/recommendations') {
        respond(
          200,
          recommendComplementary({
            goal: payload.goal,
            teamPeople: payload.teamPeople || [],
            candidates: payload.candidates || [],
            planFn: planGoal
          })
        );
        return;
      }
      if (route === '/api/teams') {
        const result = authority.createTeam({
          eventId: payload.eventId,
          teamId: payload.teamId,
          actorId,
          now: Date.now()
        });
        publish(payload.eventId);
        respond(201, result);
        return;
      }
      if (route === '/api/teams/transfer') {
        const result = ext.transferLeader({
          eventId: payload.eventId,
          teamId: payload.teamId,
          actorId,
          newLeaderId: payload.newLeaderId,
          now: Date.now()
        });
        publish(payload.eventId);
        respond(200, result);
        return;
      }
      if (route === '/api/invitations') {
        respond(
          201,
          authority.invite({
            eventId: payload.eventId,
            teamId: payload.teamId,
            expiresAt: payload.expiresAt,
            actorId,
            now: Date.now()
          })
        );
        return;
      }
      if (route === '/api/invitations/claim') {
        const result = authority.claim({
          eventId: payload.eventId,
          teamId: payload.teamId,
          code: payload.code,
          opId: payload.opId,
          actorId,
          now: Date.now()
        });
        if (!result.replayed) publish(payload.eventId);
        respond(200, result);
        return;
      }
      if (route === '/api/teams/leave') {
        const result = authority.leave({ eventId: payload.eventId, teamId: payload.teamId, actorId, now: Date.now() });
        publish(payload.eventId);
        respond(200, result);
        return;
      }
      if (route === '/api/peer/notes') {
        respond(
          201,
          ext.publishPeerNote({
            eventId: payload.eventId,
            actorId,
            opId: payload.opId,
            text: payload.text,
            epoch: payload.epoch || 1
          })
        );
        return;
      }
      if (route === '/api/peer/glue') {
        respond(200, contextGlueOrExplain(payload.localRecords || [], payload.peerRecords || []));
        return;
      }
      if (route === '/api/peer/relay-claim') {
        const rawClaimant = payload.claimantWarrant || payload.claimantToken;
        if (typeof rawClaimant !== 'string' || !rawClaimant || ext.isRevoked(rawClaimant)) {
          throw Error('UNAUTHORIZED');
        }
        let claimantSub = '';
        if (parseTokenAudience(rawClaimant) === 'h4h-ps1-relay-warrant') {
          const w = verifyRelayWarrant(rawClaimant, secret);
          if (typeof payload.code !== 'string') throw Error('INVALID_CODE');
          const actualCodeHash = createHash('sha256').update(payload.code).digest('hex');
          if (
            w.eventId !== payload.eventId ||
            w.teamId !== payload.teamId ||
            w.opId !== payload.opId ||
            w.codeHash !== actualCodeHash
          ) {
            throw Error('UNAUTHORIZED');
          }
          claimantSub = w.sub;
        } else {
          const claimant = verifyToken(rawClaimant, secret);
          if (!claimant.roles.includes('member')) throw Error('UNAUTHORIZED');
          claimantSub = claimant.sub;
        }
        if (actorId === claimantSub) throw Error('SELF_RELAY_FORBIDDEN');

        const result = ext.relayClaim({
          relayActorId: actorId,
          claimantActorId: claimantSub,
          eventId: payload.eventId,
          teamId: payload.teamId,
          code: payload.code,
          opId: payload.opId,
          now: Date.now()
        });
        if (!result.replayed) publish(payload.eventId);
        respond(200, result);
        return;
      }
      if (route === '/api/demo/race-50' && enableDemo && process.env.PS1_DEMO_AUTH !== '0') {
        const cutoff = Date.now() - 600_000;
        authority.tx(() => {
          const stale = authority.db
            .prepare("SELECT DISTINCT event_id FROM teams WHERE event_id LIKE 'race-%' AND created_at < ?")
            .all(cutoff);
          for (const row of stale) {
            const staleEv = row.event_id;
            authority.db.prepare('DELETE FROM operations WHERE event_id=?').run(staleEv);
            authority.db.prepare('DELETE FROM audit WHERE event_id=?').run(staleEv);
            authority.db.prepare('DELETE FROM teams WHERE event_id=?').run(staleEv);
            authority.db.prepare('DELETE FROM events WHERE id=?').run(staleEv);
          }
        });

        const raceEv = 'race-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8);
        const raceTeam = 'final-seat-' + raceEv;
        authority.createEvent(raceEv, 2);
        authority.createTeam({ eventId: raceEv, teamId: raceTeam, actorId: 'race-leader' });
        const codes = [];
        for (let i = 0; i < 50; i++) {
          codes.push(
            authority.invite({
              eventId: raceEv,
              teamId: raceTeam,
              actorId: 'race-leader',
              expiresAt: Date.now() + 60000
            }).code
          );
        }
        const t0 = performance.now();
        let committed = 0;
        let rejected = 0;
        let winner = null;
        await Promise.all(
          codes.map((code, i) =>
            Promise.resolve().then(() => {
              try {
                const r = authority.claim({
                  eventId: raceEv,
                  teamId: raceTeam,
                  actorId: 'claimant-' + i,
                  code,
                  opId: 'race50-' + i
                });
                if (r.status === 'COMMITTED') {
                  committed++;
                  winner = r.actorId;
                }
              } catch {
                rejected++;
              }
            })
          )
        );
        const inv = authority.invariants(raceEv);
        respond(200, {
          eventId: raceEv,
          teamId: raceTeam,
          contenders: 50,
          committed,
          rejected,
          winner,
          finalMemberCount: authority.board(raceEv, 5, 0)[0]?.members || 0,
          invariants: inv,
          elapsedMs: Number((performance.now() - t0).toFixed(2))
        });
        return;
      }

      respond(404, { error: 'ROUTE_NOT_FOUND' });
    } catch (e) {
      const code = String(e.message || 'UNKNOWN');
      const status =
        errStatus[code] ||
        (code === 'PAYLOAD_TOO_LARGE'
          ? 413
          : code === 'INVALID_JSON'
            ? 400
            : code.startsWith('INVALID_') || code === 'CYCLIC_TASK_DEPENDENCY'
              ? 400
              : 500);
      const extra = status === 429 ? { 'retry-after': '10' } : {};
      respond(status, { error: status === 500 ? 'INTERNAL_ERROR' : code }, extra);
    }
  });

  http.headersTimeout = 10000;
  http.requestTimeout = 15000;
  http.keepAliveTimeout = 5000;
  http.maxHeadersCount = 64;

  return {
    http,
    authority,
    ext,
    listen: () => new Promise(r => http.listen(port, host, () => r(http.address()))),
    close: () =>
      new Promise(r => {
        for (const client of Array.from(streamClients)) {
          client.cleanup?.();
          client.res.end();
        }
        http.close(() => {
          authority.close();
          r();
        });
      })
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const secret = process.env.PS1_AUTH_SECRET || '';
  if (process.argv[2] === 'token') {
    console.log(issueToken(process.argv[3], secret, 3600));
  } else {
    const app = startServer({
      secret,
      dbPath: process.env.PS1_SQLITE_PATH || './h4h-ps1.sqlite',
      host: process.env.PS1_BIND || '127.0.0.1',
      port: Number(process.env.PS1_PORT || 8788)
    });
    if (process.env.PS1_AUTO_EVENT !== '0') {
      try {
        app.ext.ensureEvent('seed-event', 5);
      } catch {}
    }
    app.listen().then(addr => console.log('H4H_PS1_HTTP_READY ' + addr.address + ':' + addr.port));
  }
}
