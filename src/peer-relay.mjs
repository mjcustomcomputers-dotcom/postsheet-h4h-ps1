// H4H-PS1 R9 | durable encrypted peer HTTP relay; independent of Layer-A admission.
import {createServer} from 'node:http';
import {DatabaseSync} from 'node:sqlite';
import {createHash} from 'node:crypto';
import {verifyToken} from './server.mjs';

const ID=/^[A-Za-z0-9_.:@-]{1,128}$/;
const valid=(x,name)=>{if(typeof x!=='string'||!ID.test(x))throw Error('INVALID_'+name);return x;};
const hash=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
const headers={'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff','referrer-policy':'no-referrer'};
const json=(res,code,body)=>{if(res.destroyed)return;res.writeHead(code,headers);res.end(JSON.stringify(body));};
function parseBody(req,maxBytes=120000){
 return new Promise((resolve,reject)=>{
  let size=0,parts=[],finished=false;
  req.on('data',chunk=>{
   if(finished)return;
   size+=chunk.length;
   if(size>maxBytes){finished=true;reject(Error('PAYLOAD_TOO_LARGE'));req.destroy();return;}
   parts.push(chunk);
  });
  req.on('end',()=>{
   if(finished)return;
   try{
    const value=JSON.parse(Buffer.concat(parts).toString('utf8'));
    if(!value||Array.isArray(value)||typeof value!=='object')throw Error();
    resolve(value);
   }catch{reject(Error('INVALID_JSON'));}
  });
  req.on('error',error=>{if(!finished){finished=true;reject(error);}});
 });
}
export class PeerRelayQueue {
 constructor(path){
  if(typeof path!=='string'||path.length===0||path===':memory:')throw Error('DURABLE_PATH_REQUIRED');
  this.db=new DatabaseSync(path);
  this.db.exec('PRAGMA busy_timeout=5000; PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;');
  this.db.exec(`
   CREATE TABLE IF NOT EXISTS peer_deliveries(
    delivery_id TEXT PRIMARY KEY,
    event_id TEXT NOT NULL, sender_id TEXT NOT NULL, recipient_id TEXT NOT NULL,
    scope TEXT NOT NULL, op_id TEXT NOT NULL, payload TEXT NOT NULL,
    payload_hash TEXT NOT NULL, expires_at INTEGER NOT NULL,
    accepted_at INTEGER NOT NULL, acknowledged_at INTEGER
   );
   CREATE INDEX IF NOT EXISTS peer_inbox
   ON peer_deliveries(event_id,recipient_id,acknowledged_at,expires_at,accepted_at);
  `);
  this.get=this.db.prepare('SELECT delivery_id,payload_hash,acknowledged_at FROM peer_deliveries WHERE delivery_id=?');
  this.pendingCount=this.db.prepare('SELECT COUNT(*) AS n FROM peer_deliveries WHERE event_id=? AND recipient_id=? AND acknowledged_at IS NULL AND expires_at>?');
  this.insert=this.db.prepare('INSERT INTO peer_deliveries(delivery_id,event_id,sender_id,recipient_id,scope,op_id,payload,payload_hash,expires_at,accepted_at) VALUES(?,?,?,?,?,?,?,?,?,?) ON CONFLICT(delivery_id) DO NOTHING');
  this.read=this.db.prepare('SELECT delivery_id,payload,accepted_at FROM peer_deliveries WHERE event_id=? AND recipient_id=? AND acknowledged_at IS NULL AND expires_at>? ORDER BY accepted_at,delivery_id LIMIT ?');
  this.ackStmt=this.db.prepare('UPDATE peer_deliveries SET acknowledged_at=? WHERE delivery_id=? AND event_id=? AND recipient_id=? AND acknowledged_at IS NULL AND expires_at>?');
  this.ackRead=this.db.prepare('SELECT acknowledged_at FROM peer_deliveries WHERE delivery_id=? AND event_id=? AND recipient_id=?');
  this.pruneStmt=this.db.prepare('DELETE FROM peer_deliveries WHERE expires_at<=?');
 }
 put(senderId,recipientId,envelope,now=Date.now()){
  valid(senderId,'SENDER');valid(recipientId,'RECIPIENT');
  if(!envelope||typeof envelope!=='object'||Array.isArray(envelope))throw Error('INVALID_ENVELOPE');
  for(const field of ['eventId','actorId','opId','scope'])valid(envelope[field],field.toUpperCase());
  if(envelope.actorId!==senderId)throw Error('ACTOR_MISMATCH');
  if(envelope.version!==1||typeof envelope.ciphertext!=='string'||!envelope.ciphertext||typeof envelope.signature!=='string'||!envelope.signature||typeof envelope.iv!=='string'||typeof envelope.tag!=='string')throw Error('INVALID_ENVELOPE');
  if(!Number.isSafeInteger(envelope.createdAt)||!Number.isSafeInteger(envelope.expiresAt)||envelope.createdAt>now+30000||envelope.expiresAt<=now||envelope.expiresAt-envelope.createdAt>86400000)throw Error('ENVELOPE_EXPIRED_OR_FUTURE');
  const serialized=JSON.stringify(envelope);
  if(Buffer.byteLength(serialized)>100000)throw Error('PAYLOAD_TOO_LARGE');
  const deliveryId=hash([envelope.eventId,senderId,recipientId,envelope.opId]);
  const payloadHash=hash(envelope);
  this.db.exec('BEGIN IMMEDIATE');
  try{
   const previous=this.get.get(deliveryId);
   if(previous){
    if(previous.payload_hash!==payloadHash)throw Error('IDEMPOTENCY_KEY_REUSED');
    this.db.exec('COMMIT');
    return {deliveryId,status:previous.acknowledged_at===null?'QUEUED':'ACKNOWLEDGED',replayed:true};
   }
   if(this.pendingCount.get(envelope.eventId,recipientId,now).n>=1000)throw Error('QUEUE_CAPACITY');
   const inserted=this.insert.run(deliveryId,envelope.eventId,senderId,recipientId,envelope.scope,envelope.opId,serialized,payloadHash,envelope.expiresAt,now);
   if(inserted.changes!==1)throw Error('QUEUE_CONFLICT');
   this.db.exec('COMMIT');
   return {deliveryId,status:'QUEUED',replayed:false};
  }catch(error){this.db.exec('ROLLBACK');throw error;}
 }
 inbox(eventId,recipientId,now=Date.now(),limit=25){
  valid(eventId,'EVENT');valid(recipientId,'RECIPIENT');
  if(!Number.isSafeInteger(limit)||limit<1||limit>25)throw Error('INVALID_LIMIT');
  return this.read.all(eventId,recipientId,now,limit).map(x=>({deliveryId:x.delivery_id,envelope:JSON.parse(x.payload),acceptedAt:x.accepted_at}));
 }
 acknowledge(eventId,recipientId,deliveryId,now=Date.now()){
  valid(eventId,'EVENT');valid(recipientId,'RECIPIENT');
  if(typeof deliveryId!=='string'||!/^[0-9a-f]{64}$/.test(deliveryId))throw Error('INVALID_DELIVERY_ID');
  const r=this.ackStmt.run(now,deliveryId,eventId,recipientId,now);
  if(r.changes===1)return {status:'ACKNOWLEDGED',deliveryId,replayed:false};
  const previous=this.ackRead.get(deliveryId,eventId,recipientId);
  if(previous&&previous.acknowledged_at!==null)return {status:'ACKNOWLEDGED',deliveryId,replayed:true};
  throw Error('DELIVERY_NOT_PENDING');
 }
 purge(now=Date.now()){return this.pruneStmt.run(now).changes;}
 close(){this.db.close();}
}
export function startPeerRelay({dbPath,secret,host='127.0.0.1',port=0,authorizeRoute}={}){
 if(host!=='127.0.0.1'&&host!=='::1')throw Error('LOOPBACK_BIND_REQUIRED');
 if(typeof secret!=='string'||Buffer.byteLength(secret)<32)throw Error('SECRET_TOO_SHORT');
 if(typeof authorizeRoute!=='function')throw Error('ROUTE_POLICY_REQUIRED');
 const queue=new PeerRelayQueue(dbPath);
 const http=createServer(async(req,res)=>{
  const pathname=new URL(req.url||'/', 'http://localhost');
  try{
   if(req.method==='GET'&&pathname.pathname==='/health'){json(res,200,{status:'up',component:'peer-relay'});return;}
   const m=/^Bearer (.{1,2048})$/.exec(req.headers.authorization||'');
   if(!m)throw Error('UNAUTHORIZED');
   const actor=verifyToken(m[1],secret);
   if(!actor.roles.includes('member'))throw Error('UNAUTHORIZED');
   if(req.method==='POST'&&pathname.pathname==='/peer/envelopes'){
    const body=await parseBody(req);
    const envelope=body.envelope;
    if(!envelope||typeof envelope!=='object')throw Error('INVALID_ENVELOPE');
    const recipientId=valid(body.recipientId,'RECIPIENT');
    if(!authorizeRoute({eventId:envelope.eventId,actorId:actor.sub,recipientId,scope:envelope.scope}))throw Error('ROUTE_FORBIDDEN');
    const result=queue.put(actor.sub,recipientId,envelope);
    json(res,result.replayed?200:201,result);return;
   }
   if(req.method==='GET'&&pathname.pathname==='/peer/inbox'){
    const eventId=valid(pathname.searchParams.get('eventId'),'EVENT');
    const limit=Number(pathname.searchParams.get('limit')||25);
    json(res,200,{recipientId:actor.sub,deliveries:queue.inbox(eventId,actor.sub,Date.now(),limit)});return;
   }
   if(req.method==='POST'&&pathname.pathname==='/peer/ack'){
    const body=await parseBody(req);
    json(res,200,queue.acknowledge(body.eventId,actor.sub,body.deliveryId));return;
   }
   json(res,404,{error:'ROUTE_NOT_FOUND'});
  }catch(e){
   const code=String(e.message||'UNKNOWN');
   const status=code==='UNAUTHORIZED'?401:code==='ROUTE_FORBIDDEN'?403:
    ['IDEMPOTENCY_KEY_REUSED','ACTOR_MISMATCH','DELIVERY_NOT_PENDING'].includes(code)?409:
    code==='PAYLOAD_TOO_LARGE'?413:code==='QUEUE_CAPACITY'?429:code==='ENVELOPE_EXPIRED_OR_FUTURE'?410:
    code.startsWith('INVALID_')?400:500;
   json(res,status,{error:status===500?'INTERNAL_ERROR':code});
  }
 });
 return {queue,http,listen:()=>new Promise(resolve=>http.listen(port,host,()=>resolve(http.address()))),
 close:()=>new Promise((resolve,reject)=>http.close(error=>{queue.close();if(error)reject(error);else resolve();}))};
}
// The relay stores encrypted bytes only. Recipients authenticate author/key and decrypt
// with openPeerArtifact; acknowledgement follows successful durable receipt insertion.
// Neither queueing nor acknowledgement performs membership admission.
