// H4H PS1 | durable Layer-B peer-receipt ledger.
// Persist verified operation identity using one SQLite UNIQUE constraint.
// The ledger records reception only; Layer-A retains all membership authority.
import {DatabaseSync} from 'node:sqlite';
import {createHash} from 'node:crypto';

const ID=/^[A-Za-z0-9_.:@-]{1,128}$/;
const digest=s=>createHash('sha256').update(s).digest('hex');
export function peerReceiptId(eventId,actorId,opId) {
 for(const item of [eventId,actorId,opId]){
  if(typeof item!=='string'||!ID.test(item))throw Error('INVALID_RECEIPT_IDENTITY');
 }
 // Length-prefix/canonical array prevents delimiter ambiguities.
 return digest(JSON.stringify([eventId,actorId,opId]));
}
const validateComposite=key=>{
 if(typeof key!=='string')throw Error('INVALID_RECEIPT_IDENTITY');
 // Legacy peer-envelope interface uses colon-delimited IDs.
 // IDs may themselves contain ':', therefore the new object API is authoritative.
 if(!/^[0-9a-f]{64}$/.test(key))throw Error('INVALID_RECEIPT_IDENTITY');
 return key;
};
export class PeerReceiptLedger {
 constructor(path){
  if(typeof path!=='string'||!path||path===':memory:')throw Error('DURABLE_PATH_REQUIRED');
  this.db=new DatabaseSync(path);
  this.db.exec('PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000; PRAGMA journal_mode=WAL;');
  this.db.exec('CREATE TABLE IF NOT EXISTS peer_receipts (receipt_id TEXT PRIMARY KEY,expires_at INTEGER NOT NULL,accepted_at INTEGER NOT NULL) WITHOUT ROWID;');
  this.read=this.db.prepare('SELECT 1 FROM peer_receipts WHERE receipt_id=?');
  this.insert=this.db.prepare('INSERT INTO peer_receipts(receipt_id,expires_at,accepted_at) VALUES(?,?,?) ON CONFLICT(receipt_id) DO NOTHING');
  this.pruneStmt=this.db.prepare('DELETE FROM peer_receipts WHERE expires_at<=?');
 }
 has(key){return !!this.read.get(validateComposite(key));}
 add(key,expiresAt){
  validateComposite(key);
  if(!Number.isSafeInteger(expiresAt)||expiresAt<=0)throw Error('INVALID_RECEIPT_EXPIRY');
  const at=Date.now();
  const result=this.insert.run(key,expiresAt,at);
  if(result.changes!==1)throw Error('REPLAY_DETECTED');
  return true;
 }
 pruneExpired(now=Date.now()){
  if(!Number.isSafeInteger(now)||now<=0)throw Error('INVALID_TIME');
  return this.pruneStmt.run(now).changes;
 }
 close(){this.db.close();}
}
