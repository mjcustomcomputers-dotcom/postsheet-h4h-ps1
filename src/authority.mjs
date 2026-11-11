// H4H-PS1: event-wide authoritative membership; Node >=24 node:sqlite.
import {DatabaseSync} from 'node:sqlite';
import {randomBytes,createHash} from 'node:crypto';
const hash=s=>createHash('sha256').update(s).digest('hex');
const valid=(s,n)=>{if(typeof s!=='string'||!/^[A-Za-z0-9_.:@-]{1,128}$/.test(s))throw Error('INVALID_'+n);return s;};
const positive=(n,k)=>{if(!Number.isSafeInteger(n)||n<=0)throw Error('INVALID_'+k);return n;};
export class MembershipAuthority {
 constructor(path=':memory:'){
  this.db=new DatabaseSync(path);
  this.db.exec('PRAGMA foreign_keys=ON;PRAGMA busy_timeout=5000;');
  if(path!==':memory:')this.db.exec('PRAGMA journal_mode=WAL');
  this.db.exec([
   'CREATE TABLE IF NOT EXISTS events(id TEXT PRIMARY KEY,max_size INTEGER NOT NULL CHECK(max_size BETWEEN 1 AND 100))',
   'CREATE TABLE IF NOT EXISTS teams(id TEXT PRIMARY KEY,event_id TEXT NOT NULL REFERENCES events(id),leader TEXT NOT NULL,created_at INTEGER NOT NULL)',
   'CREATE INDEX IF NOT EXISTS team_event ON teams(event_id,id)',
   'CREATE TABLE IF NOT EXISTS membership(event_id TEXT NOT NULL REFERENCES events(id),user_id TEXT NOT NULL,team_id TEXT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,joined_at INTEGER NOT NULL,PRIMARY KEY(event_id,user_id))',
   'CREATE INDEX IF NOT EXISTS membership_team ON membership(team_id,joined_at,user_id)',
   'CREATE TABLE IF NOT EXISTS invites(code_hash TEXT PRIMARY KEY,event_id TEXT NOT NULL REFERENCES events(id),team_id TEXT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,expires_at INTEGER NOT NULL,used_by TEXT)',
   'CREATE TABLE IF NOT EXISTS operations(event_id TEXT NOT NULL,actor_id TEXT NOT NULL,op_id TEXT NOT NULL,request_hash TEXT NOT NULL,result TEXT NOT NULL,PRIMARY KEY(event_id,actor_id,op_id))',
   'CREATE TABLE IF NOT EXISTS audit(id INTEGER PRIMARY KEY AUTOINCREMENT,event_id TEXT NOT NULL,team_id TEXT NOT NULL,actor_id TEXT NOT NULL,op_id TEXT NOT NULL,action TEXT NOT NULL,at INTEGER NOT NULL,detail TEXT NOT NULL)',
   'CREATE INDEX IF NOT EXISTS audit_event ON audit(event_id,id)'
  ].join(';')+';');
 }
 close(){this.db.close();}
 tx(f){this.db.exec('BEGIN IMMEDIATE');try{const r=f();this.db.exec('COMMIT');return r;}catch(e){this.db.exec('ROLLBACK');throw e;}}
 log(eventId,teamId,actorId,opId,action,now,detail={}){
  this.db.prepare('INSERT INTO audit(event_id,team_id,actor_id,op_id,action,at,detail) VALUES(?,?,?,?,?,?,?)')
   .run(eventId,teamId,actorId,opId,action,now,JSON.stringify(detail));
 }
 createEvent(eventId,maxSize){
  valid(eventId,'EVENT');positive(maxSize,'SIZE');if(maxSize>100)throw Error('SIZE_LIMIT');
  this.db.prepare('INSERT INTO events(id,max_size) VALUES(?,?)').run(eventId,maxSize);
 }
 createTeam({eventId,teamId,actorId,now=Date.now()}){
  valid(eventId,'EVENT');valid(teamId,'TEAM');valid(actorId,'ACTOR');positive(now,'TIME');
  return this.tx(()=>{
   if(!this.db.prepare('SELECT 1 FROM events WHERE id=?').get(eventId))throw Error('NO_EVENT');
   if(this.db.prepare('SELECT 1 FROM membership WHERE event_id=? AND user_id=?').get(eventId,actorId))throw Error('ONE_TEAM_PER_EVENT');
   this.db.prepare('INSERT INTO teams(id,event_id,leader,created_at) VALUES(?,?,?,?)').run(teamId,eventId,actorId,now);
   this.db.prepare('INSERT INTO membership(event_id,user_id,team_id,joined_at) VALUES(?,?,?,?)').run(eventId,actorId,teamId,now);
   this.log(eventId,teamId,actorId,'create:'+teamId,'TEAM_CREATED',now);
   return {status:'CREATED',teamId};
  });
 }
 invite({eventId,teamId,actorId,expiresAt,now=Date.now()}){
  valid(eventId,'EVENT');valid(teamId,'TEAM');valid(actorId,'ACTOR');positive(now,'TIME');positive(expiresAt,'EXPIRY');
  if(expiresAt<=now)throw Error('INVITE_EXPIRED');
  const code=randomBytes(32).toString('base64url');
  return this.tx(()=>{
   const t=this.db.prepare('SELECT leader FROM teams WHERE id=? AND event_id=?').get(teamId,eventId);
   if(!t)throw Error('NO_TEAM');if(t.leader!==actorId)throw Error('LEADER_REQUIRED');
   this.db.prepare('INSERT INTO invites(code_hash,event_id,team_id,expires_at,used_by) VALUES(?,?,?,?,NULL)').run(hash(code),eventId,teamId,expiresAt);
   this.log(eventId,teamId,actorId,'invite:'+hash(code).slice(0,12),'INVITE_CREATED',now,{expiresAt});
   return {code,expiresAt};
  });
 }
 claim({eventId,teamId,actorId,code,opId,now=Date.now()}){
  [eventId,teamId,actorId,opId].forEach((x,i)=>valid(x,['EVENT','TEAM','ACTOR','OPERATION'][i]));
  if(typeof code!=='string'||code.length<30||code.length>256)throw Error('INVALID_CODE');
  positive(now,'TIME');
  const requestHash=hash(JSON.stringify([eventId,teamId,actorId,hash(code)]));
  return this.tx(()=>{
   const old=this.db.prepare('SELECT request_hash,result FROM operations WHERE event_id=? AND actor_id=? AND op_id=?').get(eventId,actorId,opId);
   if(old){if(old.request_hash!==requestHash)throw Error('IDEMPOTENCY_KEY_REUSED');return {...JSON.parse(old.result),replayed:true};}
   const t=this.db.prepare('SELECT e.max_size FROM teams t JOIN events e ON e.id=t.event_id WHERE t.id=? AND t.event_id=?').get(teamId,eventId);
   if(!t)throw Error('NO_TEAM');
   const inv=this.db.prepare('SELECT expires_at,used_by FROM invites WHERE code_hash=? AND team_id=? AND event_id=?').get(hash(code),teamId,eventId);
   if(!inv||inv.used_by!==null)throw Error('INVITE_INVALID_OR_USED');
   if(now>=inv.expires_at)throw Error('INVITE_EXPIRED');
   if(this.db.prepare('SELECT 1 FROM membership WHERE event_id=? AND user_id=?').get(eventId,actorId))throw Error('ONE_TEAM_PER_EVENT');
   if(this.db.prepare('SELECT COUNT(*) AS n FROM membership WHERE team_id=?').get(teamId).n>=t.max_size)throw Error('TEAM_FULL');
   this.db.prepare('INSERT INTO membership(event_id,user_id,team_id,joined_at) VALUES(?,?,?,?)').run(eventId,actorId,teamId,now);
   this.db.prepare('UPDATE invites SET used_by=? WHERE code_hash=?').run(actorId,hash(code));
   const result={status:'COMMITTED',eventId,teamId,actorId,opId,replayed:false};
   this.db.prepare('INSERT INTO operations(event_id,actor_id,op_id,request_hash,result) VALUES(?,?,?,?,?)').run(eventId,actorId,opId,requestHash,JSON.stringify(result));
   this.log(eventId,teamId,actorId,opId,'MEMBER_ADMITTED',now);
   return result;
  });
 }
 leave({eventId,teamId,actorId,now=Date.now()}){
  [eventId,teamId,actorId].forEach((x,i)=>valid(x,['EVENT','TEAM','ACTOR'][i]));positive(now,'TIME');
  return this.tx(()=>{
   const t=this.db.prepare('SELECT leader FROM teams WHERE id=? AND event_id=?').get(teamId,eventId);
   if(!t||!this.db.prepare('SELECT 1 FROM membership WHERE event_id=? AND team_id=? AND user_id=?').get(eventId,teamId,actorId))throw Error('NOT_MEMBER');
   this.db.prepare('DELETE FROM membership WHERE event_id=? AND team_id=? AND user_id=?').run(eventId,teamId,actorId);
   const next=this.db.prepare('SELECT user_id FROM membership WHERE team_id=? ORDER BY joined_at,user_id LIMIT 1').get(teamId);
   this.log(eventId,teamId,actorId,'leave:'+actorId,'MEMBER_LEFT',now);
   if(!next){this.db.prepare('DELETE FROM teams WHERE id=?').run(teamId);this.log(eventId,teamId,actorId,'close:'+teamId,'TEAM_DELETED',now);return {status:'TEAM_DELETED'};}
   if(t.leader===actorId){this.db.prepare('UPDATE teams SET leader=? WHERE id=?').run(next.user_id,teamId);this.log(eventId,teamId,actorId,'succession:'+teamId,'LEADER_TRANSFERRED',now,{newLeader:next.user_id});return {status:'LEADER_TRANSFERRED',leader:next.user_id};}
   return {status:'MEMBER_LEFT',leader:t.leader};
  });
 }
 board(eventId,limit=100,offset=0){
  valid(eventId,'EVENT');positive(limit,'LIMIT');
  if(limit>100||!Number.isSafeInteger(offset)||offset<0)throw Error('INVALID_PAGINATION');
  return this.db.prepare('SELECT t.id AS team_id,t.leader,e.max_size,COUNT(m.user_id) AS members FROM teams t JOIN events e ON e.id=t.event_id LEFT JOIN membership m ON m.team_id=t.id WHERE t.event_id=? GROUP BY t.id ORDER BY t.id LIMIT ? OFFSET ?').all(eventId,limit,offset);
 }
 audit(eventId){valid(eventId,'EVENT');return this.db.prepare('SELECT id,team_id,actor_id,op_id,action,at,detail FROM audit WHERE event_id=? ORDER BY id').all(eventId);}
 invariants(eventId){
  valid(eventId,'EVENT');
  const oversize=this.db.prepare('SELECT t.id FROM teams t JOIN events e ON e.id=t.event_id JOIN membership m ON m.team_id=t.id WHERE t.event_id=? GROUP BY t.id HAVING COUNT(*)>MAX(e.max_size)').all(eventId);
  const orphanLeader=this.db.prepare('SELECT t.id FROM teams t LEFT JOIN membership m ON m.team_id=t.id AND m.user_id=t.leader WHERE t.event_id=? AND m.user_id IS NULL').all(eventId);
  const eventMismatch=this.db.prepare('SELECT m.user_id FROM membership m JOIN teams t ON t.id=m.team_id WHERE m.event_id=? AND m.event_id<>t.event_id').all(eventId);
  return {oversize:oversize.length,orphanLeader:orphanLeader.length,eventMismatch:eventMismatch.length};
 }
}
