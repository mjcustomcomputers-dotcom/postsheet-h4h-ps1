// H4H-PS1 | Additive Auth, Team Roster, Leader Transfer, Encrypted Peer Collaboration & Relayed Claims.
// Lazily initializes ps1_* tables on first extension call so core MembershipAuthority SQLite oracle stays exact.
import { randomBytes, scryptSync, timingSafeEqual, createHash, generateKeyPairSync } from 'node:crypto';
import { sealPeerArtifact, openPeerArtifact } from './peer-envelope.mjs';

const ID = /^[A-Za-z0-9_.:@-]{1,128}$/;
const validId = (v, label) => {
  if (typeof v !== 'string' || !ID.test(v)) throw Error('INVALID_' + label);
  return v;
};
const sha256 = s => createHash('sha256').update(s).digest('hex');

export class SynchronicityExtension {
  constructor(authority, secret) {
    this.authority = authority;
    this.db = authority.db;
    this.groupAesKey = createHash('sha256').update('peer-aes:' + secret).digest();
    this.actorKeys = new Map();
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

  actorKeyPair(actorId) {
    validId(actorId, 'ACTOR');
    if (!this.actorKeys.has(actorId)) {
      this.actorKeys.set(actorId, generateKeyPairSync('ec', { namedCurve: 'prime256v1' }));
    }
    return this.actorKeys.get(actorId);
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
    const derived = scryptSync(password, salt, 32).toString('hex');
    this.db.prepare(
      'INSERT INTO ps1_accounts(username,salt_hex,hash_hex,timezone,skills_csv,created_at) VALUES(?,?,?,?,?,?)'
    ).run(username, salt, derived, tz, sk, Date.now());
    return { actorId: username, timezone: tz, skills: sk };
  }

  authenticate({ username, password }) {
    this.ensureSchema();
    validId(username, 'ACTOR');
    if (typeof password !== 'string' || !password) throw Error('UNAUTHORIZED');
    const row = this.db.prepare('SELECT salt_hex,hash_hex,timezone,skills_csv FROM ps1_accounts WHERE username=?').get(username);
    if (!row) throw Error('UNAUTHORIZED');
    const got = scryptSync(password, row.salt_hex, 32);
    const exp = Buffer.from(row.hash_hex, 'hex');
    if (got.length !== exp.length || !timingSafeEqual(got, exp)) throw Error('UNAUTHORIZED');
    return { actorId: username, timezone: row.timezone, skills: row.skills_csv };
  }

  revokeToken(rawToken) {
    if (typeof rawToken !== 'string' || !rawToken) return;
    this.ensureSchema();
    this.db.prepare('INSERT OR IGNORE INTO ps1_revoked_tokens(token_hash,revoked_at) VALUES(?,?)')
      .run(sha256(rawToken), Date.now());
  }

  isRevoked(rawToken) {
    if (typeof rawToken !== 'string' || !rawToken) return true;
    if (!this._schemaReady) {
      const tbl = this.db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='ps1_revoked_tokens'").get();
      if (!tbl) return false;
      this._schemaReady = true;
    }
    return !!this.db.prepare('SELECT 1 FROM ps1_revoked_tokens WHERE token_hash=?').get(sha256(rawToken));
  }

  teamDetails(evId, teamId) {
    validId(evId, 'EVENT');
    validId(teamId, 'TEAM');
    const t = this.db.prepare(
      'SELECT t.id, t.leader, t.created_at, e.max_size FROM teams t INNER JOIN events e ON e.id = t.event_id WHERE t.id=? AND e.id=?'
    ).get(teamId, evId);
    if (!t) throw Error('NO_TEAM');
    const members = this.db.prepare(
      'SELECT user_id, joined_at FROM membership WHERE team_id=? ORDER BY joined_at, user_id'
    ).all(teamId).map(m => ({
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
    const kp = this.actorKeyPair(actorId);
    const pubPem = kp.publicKey.export({ type: 'spki', format: 'pem' });
    const env = sealPeerArtifact({
      eventId,
      actorId,
      opId,
      scope: 'team-notes',
      plaintext: text.trim(),
      key: this.groupAesKey,
      privateKey: kp.privateKey,
      publicKey: kp.publicKey,
      createdAt: now,
      ttlMs: 3600000
    });
    const receiptId = sha256(JSON.stringify([eventId, actorId, opId]));
    const existing = this.db.prepare('SELECT envelope_json FROM ps1_peer_notes WHERE receipt_id=?').get(receiptId);
    if (existing) {
      return {
        receiptId,
        opId,
        actorId,
        replayed: true,
        transportStatus: 'PEER_ARTIFACT_ONLY',
        digest: JSON.parse(existing.envelope_json).digest
      };
    }
    const opened = openPeerArtifact(env, {
      key: this.groupAesKey,
      expectedEvent: eventId,
      expectedScope: 'team-notes',
      authorizedActor: (act, pem, sc) => act === actorId && pem === pubPem && sc === 'team-notes',
      now: now + 1
    });
    this.db.prepare(
      'INSERT INTO ps1_peer_notes(receipt_id,scope_ev,actor_id,op_id,envelope_json,note_text,epoch,created_at) VALUES(?,?,?,?,?,?,?,?)'
    ).run(receiptId, eventId, actorId, opId, JSON.stringify(env), opened.plaintext.toString('utf8'), Number(epoch) || 1, now);
    return { receiptId, opId, actorId, replayed: false, transportStatus: opened.transportStatus, digest: env.digest };
  }

  listPeerNotes(eventId, limit = 25) {
    this.ensureSchema();
    validId(eventId, 'EVENT');
    return this.db.prepare(
      'SELECT receipt_id, actor_id, op_id, envelope_json, note_text, epoch, created_at FROM ps1_peer_notes WHERE scope_ev=? ORDER BY created_at DESC LIMIT ?'
    ).all(eventId, Math.min(50, Math.max(1, Number(limit) || 25))).map(r => ({
      receiptId: r.receipt_id,
      actorId: r.actor_id,
      opId: r.op_id,
      note: r.note_text,
      epoch: r.epoch,
      createdAt: r.created_at,
      digest: JSON.parse(r.envelope_json).digest,
      transportStatus: 'PEER_ARTIFACT_ONLY'
    }));
  }

  relayClaim({ relayActorId, claimantActorId, eventId, teamId, code, opId, now = Date.now() }) {
    this.ensureSchema();
    validId(relayActorId, 'RELAY_ACTOR');
    validId(claimantActorId, 'ACTOR');
    const result = this.authority.claim({ eventId, teamId, actorId: claimantActorId, code, opId, now });
    const rKey = sha256(JSON.stringify([eventId, claimantActorId, opId]));
    this.db.prepare(
      'INSERT OR IGNORE INTO ps1_relayed_claims(relay_key,scope_ev,team_id,claimant_id,relay_actor_id,op_id,relayed_at) VALUES(?,?,?,?,?,?,?)'
    ).run(rKey, eventId, teamId, claimantActorId, relayActorId, opId, now);
    if (!result.replayed) {
      this.authority.log(eventId, teamId, claimantActorId, opId, 'PEER_RELAYED_ADMISSION', now, { relayedBy: relayActorId });
    }
    return { ...result, relayedBy: relayActorId, authorityPath: 'RELAYED_VIA_PEER' };
  }
}
