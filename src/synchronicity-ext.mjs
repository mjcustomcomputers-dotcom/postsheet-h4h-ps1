// H4H-PS1 | Additive Auth, Team Roster, Leader Transfer, Encrypted Peer Collaboration & Relayed Claims.
// Lazily initializes ps1_* tables on first extension call so core MembershipAuthority SQLite oracle stays exact.
import {
  randomBytes,
  scrypt,
  scryptSync,
  hkdfSync,
  createCipheriv,
  createDecipheriv,
  createPublicKey,
  createPrivateKey,
  timingSafeEqual,
  createHash,
  generateKeyPairSync
} from 'node:crypto';
import { sealPeerArtifact, openPeerArtifact } from './peer-envelope.mjs';

const ID = /^[A-Za-z0-9_.:@-]{1,128}$/;
const isSafeId = v => typeof v === 'string' && ID.test(v) && v !== '.' && v !== '..' && !v.includes('..');
const validId = (v, label) => {
  if (!isSafeId(v)) throw Error('INVALID_' + label);
  return v;
};
const sha256 = s => createHash('sha256').update(s).digest('hex');

const SCRYPT_OPTS = { N: 16384, r: 8, p: 1, maxmem: 33554432 };
const SEALED_NOTE_SENTINEL = '[SEALED_AES256_GCM]';
const MAX_TOKEN_TTL_MS = 7_200_000;
const MAX_REVOKED_TOKENS = 8192;

export class SynchronicityExtension {
  constructor(authority, secret) {
    this.authority = authority;
    this.db = authority.db;
    this.secret = String(secret || '');
    this.keyWrapKey = Buffer.from(
      hkdfSync(
        'sha256',
        this.secret,
        Buffer.from('ps1-actor-keywrap-salt-v1'),
        Buffer.from('h4h-ps1-actor-p256-wrap-v1'),
        32
      )
    );
    this.dummySaltHex = randomBytes(16).toString('hex');
    this.dummyHashBuf = randomBytes(32);
    this.actorKeys = new Map();
    this.maxCachedActorKeys = 512;
    this.activeKdf = 0;
    this.maxConcurrentKdf = 4;
    this.maxQueuedKdf = 16;
    this.kdfWaiters = [];
    this._schemaReady = false;
  }

  ensureSchema() {
    if (this._schemaReady) return;
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS ps1_accounts(
        username TEXT PRIMARY KEY,
        salt_hex TEXT NOT NULL,
        hash_hex TEXT NOT NULL,
        timezone TEXT NOT NULL DEFAULT 'UTC+0',
        skills_csv TEXT NOT NULL DEFAULT '',
        created_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS ps1_revoked_tokens(
        token_hash TEXT PRIMARY KEY,
        revoked_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS ps1_revoked_at ON ps1_revoked_tokens(revoked_at);
      CREATE TABLE IF NOT EXISTS ps1_actor_keys(
        actor_id TEXT PRIMARY KEY,
        pub_pem TEXT NOT NULL,
        priv_der_enc TEXT NOT NULL,
        created_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS ps1_peer_notes(
        receipt_id TEXT PRIMARY KEY,
        scope_ev TEXT NOT NULL,
        actor_id TEXT NOT NULL,
        op_id TEXT NOT NULL,
        envelope_json TEXT NOT NULL,
        note_text TEXT NOT NULL,
        epoch INTEGER NOT NULL DEFAULT 1,
        created_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS ps1_relayed_claims(
        relay_key TEXT PRIMARY KEY,
        scope_ev TEXT NOT NULL,
        team_id TEXT NOT NULL,
        claimant_id TEXT NOT NULL,
        relay_actor_id TEXT NOT NULL,
        op_id TEXT NOT NULL,
        relayed_at INTEGER NOT NULL
      );
    `);
    this._schemaReady = true;
  }

  deriveEventAesKey(eventId) {
    validId(eventId, 'EVENT');
    return Buffer.from(
      hkdfSync(
        'sha256',
        this.secret,
        Buffer.from('event:' + eventId),
        Buffer.from('h4h-ps1-layer-b-aes256gcm-v1'),
        32
      )
    );
  }

  _wrapPrivateKeyDer(privDerBuf) {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.keyWrapKey, iv);
    const ct = Buffer.concat([cipher.update(privDerBuf), cipher.final()]);
    const tag = cipher.getAuthTag();
    return `${iv.toString('base64url')}.${ct.toString('base64url')}.${tag.toString('base64url')}`;
  }

  _unwrapPrivateKeyDer(encStr) {
    const parts = String(encStr || '').split('.');
    if (parts.length !== 3) throw Error('ACTOR_KEY_CORRUPT');
    const decipher = createDecipheriv('aes-256-gcm', this.keyWrapKey, Buffer.from(parts[0], 'base64url'));
    decipher.setAuthTag(Buffer.from(parts[2], 'base64url'));
    return Buffer.concat([decipher.update(Buffer.from(parts[1], 'base64url')), decipher.final()]);
  }

  _cacheActorKeyEntry(actorId, entry) {
    if (this.actorKeys.has(actorId)) {
      this.actorKeys.delete(actorId);
    } else {
      while (this.actorKeys.size >= this.maxCachedActorKeys) {
        const oldest = this.actorKeys.keys().next().value;
        this.actorKeys.delete(oldest);
      }
    }
    this.actorKeys.set(actorId, entry);
    return entry;
  }

  actorKeyPair(actorId) {
    this.ensureSchema();
    validId(actorId, 'ACTOR');
    if (this.actorKeys.has(actorId)) {
      return this._cacheActorKeyEntry(actorId, this.actorKeys.get(actorId));
    }
    const row = this.db
      .prepare('SELECT pub_pem, priv_der_enc FROM ps1_actor_keys WHERE actor_id=?')
      .get(actorId);
    if (row) {
      const privDer = this._unwrapPrivateKeyDer(row.priv_der_enc);
      const publicKey = createPublicKey(row.pub_pem);
      const privateKey = createPrivateKey({ key: privDer, format: 'der', type: 'pkcs8' });
      return this._cacheActorKeyEntry(actorId, { publicKey, privateKey, pubPem: row.pub_pem });
    }
    const { publicKey, privateKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
    const pubPem = publicKey.export({ type: 'spki', format: 'pem' });
    const privDer = privateKey.export({ type: 'pkcs8', format: 'der' });
    const enc = this._wrapPrivateKeyDer(privDer);
    this.db
      .prepare('INSERT INTO ps1_actor_keys(actor_id,pub_pem,priv_der_enc,created_at) VALUES(?,?,?,?)')
      .run(actorId, pubPem, enc, Date.now());
    return this._cacheActorKeyEntry(actorId, { publicKey, privateKey, pubPem });
  }

  actorPublicKeyPem(actorId) {
    this.ensureSchema();
    validId(actorId, 'ACTOR');
    if (this.actorKeys.has(actorId)) {
      return this.actorKeys.get(actorId).pubPem;
    }
    const row = this.db.prepare('SELECT pub_pem FROM ps1_actor_keys WHERE actor_id=?').get(actorId);
    return row ? row.pub_pem : null;
  }

  hasRegisteredAccount(username) {
    if (typeof username !== 'string' || !ID.test(username)) return false;
    if (!this._schemaReady) {
      const tbl = this.db
        .prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='ps1_accounts'")
        .get();
      if (!tbl) return false;
      this._schemaReady = true;
    }
    return !!this.db.prepare('SELECT 1 FROM ps1_accounts WHERE username=?').get(username);
  }

  _acquireKdfSlot() {
    if (this.activeKdf < this.maxConcurrentKdf) {
      this.activeKdf += 1;
      return Promise.resolve();
    }
    if (this.kdfWaiters.length >= this.maxQueuedKdf) {
      return Promise.reject(Error('AUTH_BUSY'));
    }
    return new Promise(resolveSlot => {
      this.kdfWaiters.push(resolveSlot);
    });
  }

  _releaseKdfSlot() {
    const next = this.kdfWaiters.shift();
    if (next) {
      next();
    } else {
      this.activeKdf = Math.max(0, this.activeKdf - 1);
    }
  }

  async _scryptAsync(password, saltHex) {
    await this._acquireKdfSlot();
    try {
      return await new Promise((resolveBuf, rejectBuf) => {
        scrypt(password, saltHex, 32, SCRYPT_OPTS, (err, derivedKey) => {
          if (err) rejectBuf(err);
          else resolveBuf(derivedKey);
        });
      });
    } finally {
      this._releaseKdfSlot();
    }
  }

  ensureEvent(evId, maxSize = 4) {
    validId(evId, 'EVENT');
    if (!Number.isSafeInteger(maxSize) || maxSize < 1 || maxSize > 100) throw Error('INVALID_SIZE');
    const row = this.db.prepare('SELECT id, max_size FROM events WHERE id=?').get(evId);
    if (row) return { id: row.id, maxSize: row.max_size, created: false };
    this.authority.createEvent(evId, maxSize);
    return { id: evId, maxSize, created: true };
  }

  register({ username, password, timezone = 'UTC+0', skills = '' }) {
    this.ensureSchema();
    validId(username, 'ACTOR');
    if (typeof password !== 'string' || password.length < 8 || password.length > 128) throw Error('INVALID_PASSWORD');
    const tz = String(timezone || 'UTC+0').slice(0, 32);
    const sk = String(skills || '').slice(0, 256);
    if (this.db.prepare('SELECT 1 FROM ps1_accounts WHERE username=?').get(username)) throw Error('ACCOUNT_EXISTS');
    const salt = randomBytes(16).toString('hex');
    const derived = scryptSync(password, salt, 32, SCRYPT_OPTS).toString('hex');
    this.db
      .prepare('INSERT INTO ps1_accounts(username,salt_hex,hash_hex,timezone,skills_csv,created_at) VALUES(?,?,?,?,?,?)')
      .run(username, salt, derived, tz, sk, Date.now());
    return { actorId: username, timezone: tz, skills: sk };
  }

  async registerAsync({ username, password, timezone = 'UTC+0', skills = '' }) {
    this.ensureSchema();
    validId(username, 'ACTOR');
    if (typeof password !== 'string' || password.length < 8 || password.length > 128) throw Error('INVALID_PASSWORD');
    const tz = String(timezone || 'UTC+0').slice(0, 32);
    const sk = String(skills || '').slice(0, 256);
    if (this.db.prepare('SELECT 1 FROM ps1_accounts WHERE username=?').get(username)) throw Error('ACCOUNT_EXISTS');
    const salt = randomBytes(16).toString('hex');
    const derived = (await this._scryptAsync(password, salt)).toString('hex');
    if (this.db.prepare('SELECT 1 FROM ps1_accounts WHERE username=?').get(username)) throw Error('ACCOUNT_EXISTS');
    try {
      this.db
        .prepare('INSERT INTO ps1_accounts(username,salt_hex,hash_hex,timezone,skills_csv,created_at) VALUES(?,?,?,?,?,?)')
        .run(username, salt, derived, tz, sk, Date.now());
    } catch (e) {
      if (String(e.message || '').includes('UNIQUE')) throw Error('ACCOUNT_EXISTS');
      throw e;
    }
    return { actorId: username, timezone: tz, skills: sk };
  }

  authenticate({ username, password }) {
    this.ensureSchema();
    validId(username, 'ACTOR');
    if (typeof password !== 'string' || !password || password.length > 128) throw Error('UNAUTHORIZED');
    const row = this.db
      .prepare('SELECT salt_hex,hash_hex,timezone,skills_csv FROM ps1_accounts WHERE username=?')
      .get(username);
    if (!row) {
      const dummyGot = scryptSync(password, this.dummySaltHex, 32, SCRYPT_OPTS);
      timingSafeEqual(dummyGot, this.dummyHashBuf);
      throw Error('UNAUTHORIZED');
    }
    const got = scryptSync(password, row.salt_hex, 32, SCRYPT_OPTS);
    const exp = Buffer.from(row.hash_hex, 'hex');
    if (got.length !== exp.length || !timingSafeEqual(got, exp)) throw Error('UNAUTHORIZED');
    return { actorId: username, timezone: row.timezone, skills: row.skills_csv };
  }

  async authenticateAsync({ username, password }) {
    this.ensureSchema();
    validId(username, 'ACTOR');
    if (typeof password !== 'string' || !password || password.length > 128) throw Error('UNAUTHORIZED');
    const row = this.db
      .prepare('SELECT salt_hex,hash_hex,timezone,skills_csv FROM ps1_accounts WHERE username=?')
      .get(username);
    if (!row) {
      const dummyGot = await this._scryptAsync(password, this.dummySaltHex);
      timingSafeEqual(dummyGot, this.dummyHashBuf);
      throw Error('UNAUTHORIZED');
    }
    const got = await this._scryptAsync(password, row.salt_hex);
    const exp = Buffer.from(row.hash_hex, 'hex');
    if (got.length !== exp.length || !timingSafeEqual(got, exp)) throw Error('UNAUTHORIZED');
    return { actorId: username, timezone: row.timezone, skills: row.skills_csv };
  }

  revokeToken(rawToken, now = Date.now()) {
    if (typeof rawToken !== 'string' || !rawToken || rawToken.length > 2048) return;
    this.ensureSchema();
    this.db.prepare('DELETE FROM ps1_revoked_tokens WHERE revoked_at < ?').run(now - MAX_TOKEN_TTL_MS);
    const cnt = this.db.prepare('SELECT COUNT(*) AS n FROM ps1_revoked_tokens').get()?.n || 0;
    if (cnt >= MAX_REVOKED_TOKENS) {
      const drop = cnt - MAX_REVOKED_TOKENS + 1;
      this.db
        .prepare(
          'DELETE FROM ps1_revoked_tokens WHERE token_hash IN (SELECT token_hash FROM ps1_revoked_tokens ORDER BY revoked_at ASC LIMIT ?)'
        )
        .run(drop);
    }
    this.db
      .prepare('INSERT OR IGNORE INTO ps1_revoked_tokens(token_hash,revoked_at) VALUES(?,?)')
      .run(sha256(rawToken), now);
  }

  isRevoked(rawToken) {
    if (typeof rawToken !== 'string' || !rawToken) return true;
    if (!this._schemaReady) {
      const tbl = this.db
        .prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='ps1_revoked_tokens'")
        .get();
      if (!tbl) return false;
      this._schemaReady = true;
    }
    return !!this.db.prepare('SELECT 1 FROM ps1_revoked_tokens WHERE token_hash=?').get(sha256(rawToken));
  }

  teamDetails(evId, teamId) {
    validId(evId, 'EVENT');
    validId(teamId, 'TEAM');
    const t = this.db
      .prepare(
        'SELECT t.id, t.leader, t.created_at, e.max_size FROM teams t INNER JOIN events e ON e.id = t.event_id WHERE t.id=? AND e.id=?'
      )
      .get(teamId, evId);
    if (!t) throw Error('NO_TEAM');
    const members = this.db
      .prepare('SELECT user_id, joined_at FROM membership WHERE team_id=? ORDER BY joined_at, user_id')
      .all(teamId)
      .map(m => ({
        userId: m.user_id,
        joinedAt: m.joined_at,
        isLeader: m.user_id === t.leader
      }));
    return { teamId: t.id, leader: t.leader, maxSize: t.max_size, createdAt: t.created_at, members };
  }

  transferLeader({ eventId, teamId, actorId, newLeaderId, now = Date.now() }) {
    validId(eventId, 'EVENT');
    validId(teamId, 'TEAM');
    validId(actorId, 'ACTOR');
    validId(newLeaderId, 'TARGET_MEMBER');
    return this.authority.tx(() => {
      const t = this.db.prepare('SELECT leader FROM teams WHERE id=? AND event_id=?').get(teamId, eventId);
      if (!t) throw Error('NO_TEAM');
      if (t.leader !== actorId) throw Error('LEADER_REQUIRED');
      if (!this.db.prepare('SELECT 1 FROM membership WHERE team_id=? AND user_id=?').get(teamId, newLeaderId)) {
        throw Error('TARGET_NOT_TEAM_MEMBER');
      }
      if (newLeaderId === actorId) return { status: 'LEADER_UNCHANGED', teamId, leader: actorId };
      this.db.prepare('UPDATE teams SET leader=? WHERE id=?').run(newLeaderId, teamId);
      this.authority.log(eventId, teamId, actorId, 'transfer:' + teamId + ':' + newLeaderId, 'LEADER_TRANSFERRED', now, {
        previousLeader: actorId,
        newLeader: newLeaderId
      });
      return { status: 'LEADER_TRANSFERRED', teamId, previousLeader: actorId, leader: newLeaderId };
    });
  }

  publishPeerNote({ eventId, actorId, opId, text, epoch = 1, now = Date.now() }) {
    this.ensureSchema();
    validId(eventId, 'EVENT');
    validId(actorId, 'ACTOR');
    validId(opId, 'OPERATION');
    if (typeof text !== 'string' || !text.trim() || text.length > 4000) throw Error('INVALID_NOTE');
    const normEpoch = epoch === undefined ? 1 : Number(epoch);
    if (!Number.isSafeInteger(normEpoch) || normEpoch < 1 || normEpoch > 1_000_000) throw Error('INVALID_EPOCH');
    const trimmedText = text.trim();
    const eventKey = this.deriveEventAesKey(eventId);
    const kp = this.actorKeyPair(actorId);
    const pubPem = kp.pubPem || kp.publicKey.export({ type: 'spki', format: 'pem' });
    const receiptId = sha256(JSON.stringify([eventId, actorId, opId]));
    const existing = this.db
      .prepare('SELECT envelope_json, epoch FROM ps1_peer_notes WHERE receipt_id=?')
      .get(receiptId);
    if (existing) {
      const existingEnv = JSON.parse(existing.envelope_json);
      const openedExisting = openPeerArtifact(existingEnv, {
        key: eventKey,
        expectedEvent: eventId,
        expectedScope: 'team-notes',
        authorizedActor: (act, pem, sc) => act === actorId && pem === pubPem && sc === 'team-notes',
        now: existingEnv.createdAt + 1
      });
      if (openedExisting.plaintext.toString('utf8') !== trimmedText || existing.epoch !== normEpoch) {
        throw Error('IDEMPOTENCY_KEY_REUSED');
      }
      return {
        receiptId,
        opId,
        actorId,
        replayed: true,
        transportStatus: 'PEER_ARTIFACT_ONLY',
        digest: existingEnv.digest
      };
    }
    const env = sealPeerArtifact({
      eventId,
      actorId,
      opId,
      scope: 'team-notes',
      plaintext: trimmedText,
      key: eventKey,
      privateKey: kp.privateKey,
      publicKey: kp.publicKey,
      createdAt: now,
      ttlMs: 3600000
    });
    const opened = openPeerArtifact(env, {
      key: eventKey,
      expectedEvent: eventId,
      expectedScope: 'team-notes',
      authorizedActor: (act, pem, sc) => act === actorId && pem === pubPem && sc === 'team-notes',
      now: now + 1
    });
    this.db
      .prepare(
        'INSERT INTO ps1_peer_notes(receipt_id,scope_ev,actor_id,op_id,envelope_json,note_text,epoch,created_at) VALUES(?,?,?,?,?,?,?,?)'
      )
      .run(receiptId, eventId, actorId, opId, JSON.stringify(env), SEALED_NOTE_SENTINEL, normEpoch, now);
    return { receiptId, opId, actorId, replayed: false, transportStatus: opened.transportStatus, digest: env.digest };
  }

  listPeerNotes(eventId, limit = 25) {
    this.ensureSchema();
    validId(eventId, 'EVENT');
    const eventKey = this.deriveEventAesKey(eventId);
    return this.db
      .prepare(
        'SELECT receipt_id, actor_id, op_id, envelope_json, note_text, epoch, created_at FROM ps1_peer_notes WHERE scope_ev=? ORDER BY created_at DESC LIMIT ?'
      )
      .all(eventId, Math.min(50, Math.max(1, Number(limit) || 25)))
      .map(r => {
        const env = JSON.parse(r.envelope_json);
        const storedPubPem = this.actorPublicKeyPem(r.actor_id);
        const opened = openPeerArtifact(env, {
          key: eventKey,
          expectedEvent: eventId,
          expectedScope: 'team-notes',
          authorizedActor: (act, pem, sc) =>
            act === r.actor_id && Boolean(storedPubPem) && pem === storedPubPem && sc === 'team-notes',
          now: env.createdAt + 1
        });
        return {
          receiptId: r.receipt_id,
          actorId: r.actor_id,
          opId: r.op_id,
          note: opened.plaintext.toString('utf8'),
          epoch: r.epoch,
          createdAt: r.created_at,
          digest: env.digest,
          transportStatus: 'PEER_ARTIFACT_ONLY'
        };
      });
  }

  relayClaim({ relayActorId, claimantActorId, eventId, teamId, code, opId, now = Date.now() }) {
    this.ensureSchema();
    validId(relayActorId, 'RELAY_ACTOR');
    validId(claimantActorId, 'ACTOR');
    const result = this.authority.claim({ eventId, teamId, actorId: claimantActorId, code, opId, now });
    const rKey = sha256(JSON.stringify([eventId, claimantActorId, opId]));
    this.db
      .prepare(
        'INSERT OR IGNORE INTO ps1_relayed_claims(relay_key,scope_ev,team_id,claimant_id,relay_actor_id,op_id,relayed_at) VALUES(?,?,?,?,?,?,?)'
      )
      .run(rKey, eventId, teamId, claimantActorId, relayActorId, opId, now);
    if (!result.replayed) {
      this.authority.log(eventId, teamId, claimantActorId, opId, 'PEER_RELAYED_ADMISSION', now, {
        relayedBy: relayActorId
      });
    }
    return { ...result, relayedBy: relayActorId, authorityPath: 'RELAYED_VIA_PEER' };
  }
}
