// H4H PS1 | Unified Layer-A Authority + R5 Solvers + Layer-B Peer Adapter + Static UI Host
import { createServer } from 'node:http';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { resolve, dirname, extname, normalize } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { MembershipAuthority } from './authority.mjs';
import { planGoal } from './goal-planner.mjs';
import { recommendComplementary, contextGlueOrExplain } from './synchronicity-solvers.mjs';
import { SynchronicityExtension } from './synchronicity-ext.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const DIST_DIR = resolve(HERE, '../web/dist');

const b64 = o => Buffer.from(JSON.stringify(o)).toString('base64url');
const sign = (p, secret) => createHmac('sha256', secret).update(p).digest('base64url');

export function issueToken(actor, secret, ttlSec = 3600, roles = ['member']) {
  if (typeof actor !== 'string' || !/^[A-Za-z0-9_.:@-]{1,128}$/.test(actor)) throw Error('INVALID_ACTOR');
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
  try { p = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8')); } catch { throw Error('UNAUTHORIZED'); }
  if (p.aud !== 'h4h-ps1-local' || !Number.isInteger(p.exp) || p.exp <= Date.now() / 1000 ||
      typeof p.sub !== 'string' || !/^[A-Za-z0-9_.:@-]{1,128}$/.test(p.sub) || !Array.isArray(p.roles)) {
    throw Error('UNAUTHORIZED');
  }
  return p;
}

const errStatus = {
  UNAUTHORIZED: 401,
  LEADER_REQUIRED: 403,
  NOT_MEMBER: 403,
  NO_EVENT: 404,
  NO_TEAM: 404,
  ACCOUNT_EXISTS: 409,
  TARGET_NOT_TEAM_MEMBER: 409,
  ONE_TEAM_PER_EVENT: 409,
  TEAM_FULL: 409,
  IDEMPOTENCY_KEY_REUSED: 409,
  INVITE_INVALID_OR_USED: 409,
  INVITE_EXPIRED: 410
};

const apiHeaders = {
  'content-type': 'application/json; charset=utf-8',
  'cache-control': 'no-store',
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'no-referrer',
  'content-security-policy': "default-src 'none'; frame-ancestors 'none'"
};

const mimeByExt = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml'
};

function readJson(req, limitBytes = 16384) {
  return new Promise((resolveBody, reject) => {
    let bytes = 0, s = '', done = false;
    req.on('data', c => {
      if (done) return;
      bytes += c.length;
      if (bytes > limitBytes) { done = true; reject(Error('PAYLOAD_TOO_LARGE')); req.destroy(); return; }
      s += c.toString('utf8');
    });
    req.on('end', () => {
      if (done) return;
      try {
        const x = JSON.parse(s);
        if (!x || Array.isArray(x) || typeof x !== 'object') throw Error();
        resolveBody(x);
      } catch { reject(Error('INVALID_JSON')); }
    });
    req.on('error', e => { if (!done) { done = true; reject(e); } });
  });
}

export function startServer({ dbPath = ':memory:', secret, host = '127.0.0.1', port = 0, enableDemo = true } = {}) {
  if (typeof secret !== 'string' || Buffer.byteLength(secret) < 32) throw Error('SECRET_TOO_SHORT');
  const authority = new MembershipAuthority(dbPath);
  const ext = new SynchronicityExtension(authority, secret);
  const streamClients = new Set();

  const publish = evId => {
    const data = 'event: board\ndata: ' + JSON.stringify({ eventId: evId, type: 'ROSTER_REVISION', revision: Date.now() }) + '\n\n';
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
    function respond(status, data) {
      if (res.destroyed) return;
      res.writeHead(status, apiHeaders);
      res.end(JSON.stringify(data));
    }
    const parsedUrl = new URL(req.url || '/', 'http://localhost');
    const route = parsedUrl.pathname;

    try {
      if (req.method === 'GET' && route === '/health') {
        respond(200, { status: 'up' });
        return;
      }

      const boardMatch = route.match(/^\/api\/events\/([A-Za-z0-9_.:@-]{1,128})\/board$/);
      if (req.method === 'GET' && boardMatch) {
        const limit = Number(parsedUrl.searchParams.get('limit') || 100);
        const offset = Number(parsedUrl.searchParams.get('offset') || 0);
        respond(200, { teams: authority.board(boardMatch[1], limit, offset) });
        return;
      }

      const teamDetailMatch = route.match(/^\/api\/events\/([A-Za-z0-9_.:@-]{1,128})\/teams\/([A-Za-z0-9_.:@-]{1,128})$/);
      if (req.method === 'GET' && teamDetailMatch) {
        respond(200, ext.teamDetails(teamDetailMatch[1], teamDetailMatch[2]));
        return;
      }

      const auditMatch = route.match(/^\/api\/events\/([A-Za-z0-9_.:@-]{1,128})\/audit$/);
      if (req.method === 'GET' && auditMatch) {
        requireBearer(req);
        const rows = authority.audit(auditMatch[1]).slice(-100);
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
        if (streamClients.size >= 100) { respond(503, { error: 'STREAM_CAPACITY' }); return; }
        res.writeHead(200, {
          ...apiHeaders,
          'content-type': 'text/event-stream; charset=utf-8',
          'connection': 'keep-alive',
          'x-accel-buffering': 'no'
        });
        res.write(': connected\n\n');
        const client = { eventId: streamMatch[1], res };
        streamClients.add(client);
        req.on('close', () => streamClients.delete(client));
        return;
      }

      // Static React UI serving for non-/api GET routes when web/dist is built
      if (req.method === 'GET' && !route.startsWith('/api/')) {
        if (existsSync(resolve(DIST_DIR, 'index.html'))) {
          const cleanRel = route === '/' ? 'index.html' : normalize(route).replace(/^(\.\.(\/|\\|$))+/, '').replace(/^\/+/, '');
          const candidate = resolve(DIST_DIR, cleanRel);
          const target = (candidate.startsWith(DIST_DIR) && existsSync(candidate) && extname(candidate))
            ? candidate
            : (extname(cleanRel) ? null : resolve(DIST_DIR, 'index.html'));
          if (target && existsSync(target)) {
            const extType = mimeByExt[extname(target)] || 'application/octet-stream';
            res.writeHead(200, {
              'content-type': extType,
              'cache-control': 'no-store',
              'x-content-type-options': 'nosniff',
              'referrer-policy': 'no-referrer',
              'content-security-policy': "default-src 'self'; connect-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; frame-ancestors 'none'"
            });
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

      // Public account registration / login / optional demo persona routes
      if (route === '/api/auth/register') {
        const payload = await readJson(req);
        const acc = ext.register(payload);
        respond(201, { ...acc, token: issueToken(acc.actorId, secret, 7200) });
        return;
      }
      if (route === '/api/auth/login') {
        const payload = await readJson(req);
        const acc = ext.authenticate(payload);
        respond(200, { ...acc, token: issueToken(acc.actorId, secret, 7200) });
        return;
      }
      if (route === '/api/auth/demo' && enableDemo && process.env.PS1_DEMO_AUTH !== '0') {
        const payload = await readJson(req);
        const persona = String(payload.actorId || 'leader-aurora');
        const evId = String(payload.eventId || 'seed-event');
        ext.ensureEvent(evId, Number(payload.maxSize || 4));
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

      if (route === '/api/events') {
        const r = ext.ensureEvent(payload.eventId, Number(payload.maxSize || 4));
        respond(r.created ? 201 : 200, r);
        return;
      }
      if (route === '/api/plan') {
        respond(200, planGoal({ goal: payload.goal, people: payload.people, maxNodes: Math.min(5000, payload.maxNodes || 5000) }));
        return;
      }
      if (route === '/api/recommendations') {
        respond(200, recommendComplementary({
          goal: payload.goal,
          teamPeople: payload.teamPeople || [],
          candidates: payload.candidates || [],
          planFn: planGoal
        }));
        return;
      }
      if (route === '/api/teams') {
        const result = authority.createTeam({ eventId: payload.eventId, teamId: payload.teamId, actorId, now: Date.now() });
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
        respond(201, authority.invite({ eventId: payload.eventId, teamId: payload.teamId, expiresAt: payload.expiresAt, actorId, now: Date.now() }));
        return;
      }
      if (route === '/api/invitations/claim') {
        const result = authority.claim({ eventId: payload.eventId, teamId: payload.teamId, code: payload.code, opId: payload.opId, actorId, now: Date.now() });
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
        respond(201, ext.publishPeerNote({
          eventId: payload.eventId,
          actorId,
          opId: payload.opId,
          text: payload.text,
          epoch: payload.epoch || 1
        }));
        return;
      }
      if (route === '/api/peer/glue') {
        respond(200, contextGlueOrExplain(payload.localRecords || [], payload.peerRecords || []));
        return;
      }
      if (route === '/api/peer/relay-claim') {
        if (typeof payload.claimantToken !== 'string' || ext.isRevoked(payload.claimantToken)) throw Error('UNAUTHORIZED');
        const claimant = verifyToken(payload.claimantToken, secret);
        if (!claimant.roles.includes('member')) throw Error('UNAUTHORIZED');
        const result = ext.relayClaim({
          relayActorId: actorId,
          claimantActorId: claimant.sub,
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
        const raceEv = 'race-' + Date.now();
        authority.createEvent(raceEv, 2);
        authority.createTeam({ eventId: raceEv, teamId: 'final-seat-crew', actorId: 'race-leader' });
        const codes = [];
        for (let i = 0; i < 50; i++) {
          codes.push(authority.invite({ eventId: raceEv, teamId: 'final-seat-crew', actorId: 'race-leader', expiresAt: Date.now() + 60000 }).code);
        }
        const t0 = performance.now();
        let committed = 0, rejected = 0, winner = null;
        await Promise.all(codes.map((code, i) => Promise.resolve().then(() => {
          try {
            const r = authority.claim({ eventId: raceEv, teamId: 'final-seat-crew', actorId: 'claimant-' + i, code, opId: 'race50-' + i });
            if (r.status === 'COMMITTED') { committed++; winner = r.actorId; }
          } catch {
            rejected++;
          }
        })));
        const inv = authority.invariants(raceEv);
        respond(200, {
          eventId: raceEv,
          teamId: 'final-seat-crew',
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
      const status = errStatus[code] || (code === 'PAYLOAD_TOO_LARGE' ? 413 : code === 'INVALID_JSON' ? 400 :
        (code.startsWith('INVALID_') || code === 'CYCLIC_TASK_DEPENDENCY') ? 400 : 500);
      respond(status, { error: status === 500 ? 'INTERNAL_ERROR' : code });
    }
  });

  return {
    http,
    authority,
    ext,
    listen: () => new Promise(r => http.listen(port, host, () => r(http.address()))),
    close: () => new Promise(r => {
      for (const client of streamClients) client.res.end();
      http.close(() => { authority.close(); r(); });
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
      try { app.ext.ensureEvent('seed-event', 5); } catch {}
    }
    app.listen().then(addr => console.log('H4H_PS1_HTTP_READY ' + addr.address + ':' + addr.port));
  }
}
