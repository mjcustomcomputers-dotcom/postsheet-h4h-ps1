import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {generateKeyPairSync,randomBytes} from 'node:crypto';
import {startPeerRelay} from '../src/peer-relay.mjs';
import {PeerReceiptLedger} from '../src/peer-receipts.mjs';
import {sealPeerArtifact,openPeerArtifact} from '../src/peer-envelope.mjs';
import {issueToken} from '../src/server.mjs';

const secret='r9-loopback-test-secret-exactly-more-than-32-bytes';
const keys=generateKeyPairSync('ec',{namedCurve:'prime256v1'});
const aes=randomBytes(32);
const publicPEM=keys.publicKey.export({type:'spki',format:'pem'});
const policy=({eventId,actorId,recipientId,scope})=>eventId==='ev'&&actorId==='alice'&&recipientId==='bob'&&scope==='team-notes';
const packet=(opId='op1',opts={})=>sealPeerArtifact({eventId:'ev',actorId:'alice',opId,scope:'team-notes',plaintext:'encrypted team note',
 key:aes,privateKey:keys.privateKey,publicKey:keys.publicKey,...opts});
const validReceiver=(e,receipt)=>openPeerArtifact(e,{key:aes,expectedEvent:'ev',expectedScope:'team-notes',
 authorizedActor:(actor,pem,scope)=>actor==='alice'&&pem===publicPEM&&scope==='team-notes',
 seen:receipt,now:e.createdAt+1});
const temp=()=>{const dir=mkdtempSync(join(tmpdir(),'h4h-r9-'));return {dir,db:join(dir,'relay.sqlite'),receipts:join(dir,'receipts.sqlite'),
 remove:()=>rmSync(dir,{recursive:true,force:true})};};
async function fixture(t){
 const srv=startPeerRelay({dbPath:t.db,secret,authorizeRoute:policy});
 const address=await srv.listen(),base='http://127.0.0.1:'+address.port;
 async function call(actor,method,path,body){
  const headers={'content-type':'application/json'};
  if(actor)headers.authorization='Bearer '+issueToken(actor,secret);
  const response=await fetch(base+path,{method,headers,body:body===undefined?undefined:JSON.stringify(body)});
  return {status:response.status,body:await response.json()};
 }
 return {srv,call,close:()=>srv.close()};
}
test('NET01 signed encrypted artifact delivered over real loopback HTTP; receiver verifies and acks',async()=>{
 const t=temp(),f=await fixture(t);
 try{
  const e=packet();
  const queued=await f.call('alice','POST','/peer/envelopes',{recipientId:'bob',envelope:e});
  assert.equal(queued.status,201);
  const inbox=await f.call('bob','GET','/peer/inbox?eventId=ev');
  assert.equal(inbox.status,200);assert.equal(inbox.body.deliveries.length,1);
  assert.equal(inbox.body.deliveries[0].envelope.ciphertext.includes('encrypted team note'),false);
  const ledger=new PeerReceiptLedger(t.receipts);
  const opened=validReceiver(inbox.body.deliveries[0].envelope,ledger);
  assert.equal(opened.plaintext.toString(),'encrypted team note');
  assert.equal(opened.transportStatus,'PEER_ARTIFACT_ONLY');
  ledger.close();
  const ack=await f.call('bob','POST','/peer/ack',{eventId:'ev',deliveryId:queued.body.deliveryId});
  assert.equal(ack.status,200);
  assert.equal((await f.call('bob','GET','/peer/inbox?eventId=ev')).body.deliveries.length,0);
 }finally{await f.close();t.remove();}
});
test('NET02 offline receiver obtains queued artifact after relay restart',async()=>{
 const t=temp();let f=await fixture(t);
 try{
  const result=await f.call('alice','POST','/peer/envelopes',{recipientId:'bob',envelope:packet()});
  assert.equal(result.status,201);
  await f.close();
  f=await fixture(t);
  const result2=await f.call('bob','GET','/peer/inbox?eventId=ev');
  assert.equal(result2.body.deliveries.length,1);
  assert.equal(result2.body.deliveries[0].deliveryId,result.body.deliveryId);
 }finally{await f.close();t.remove();}
});
test('NET03 duplicate delivery is idempotent; changed ciphertext under same operation conflicts',async()=>{
 const t=temp(),f=await fixture(t);
 try{
  const e=packet();
  const a=await f.call('alice','POST','/peer/envelopes',{recipientId:'bob',envelope:e});
  const retry=await f.call('alice','POST','/peer/envelopes',{recipientId:'bob',envelope:e});
  assert.equal(a.status,201);assert.equal(retry.status,200);assert.equal(retry.body.replayed,true);
  const altered=await f.call('alice','POST','/peer/envelopes',{recipientId:'bob',envelope:packet()});
  assert.equal(altered.status,409);
  assert.equal((await f.call('bob','GET','/peer/inbox?eventId=ev')).body.deliveries.length,1);
 }finally{await f.close();t.remove();}
});
test('NET04 sender token cannot read or acknowledge recipient inbox',async()=>{
 const t=temp(),f=await fixture(t);
 try{
  const a=await f.call('alice','POST','/peer/envelopes',{recipientId:'bob',envelope:packet()});
  assert.equal(a.status,201);
  const other=await f.call('alice','GET','/peer/inbox?eventId=ev&recipientId=bob');
  assert.equal(other.body.deliveries.length,0);
  const ack=await f.call('alice','POST','/peer/ack',{eventId:'ev',deliveryId:a.body.deliveryId});
  assert.equal(ack.status,409);
  assert.equal((await f.call('bob','GET','/peer/inbox?eventId=ev')).body.deliveries.length,1);
 }finally{await f.close();t.remove();}
});
test('NET05 route policy and sender identity enforce scope',async()=>{
 const t=temp(),f=await fixture(t);
 try{
  const forbidden=await f.call('alice','POST','/peer/envelopes',{recipientId:'charlie',envelope:packet()});
  assert.equal(forbidden.status,403);
  const impersonation=await f.call('charlie','POST','/peer/envelopes',{recipientId:'bob',envelope:packet()});
  assert.equal(impersonation.status,403);
  const noAuth=await f.call(null,'POST','/peer/envelopes',{recipientId:'bob',envelope:packet()});
  assert.equal(noAuth.status,401);
 }finally{await f.close();t.remove();}
});
test('NET06 expired or future-dated artifact rejected before queueing',async()=>{
 const t=temp(),f=await fixture(t);
 try{
  const expired=packet('expired',{createdAt:Date.now()-1000,ttlMs:100});
  assert.equal((await f.call('alice','POST','/peer/envelopes',{recipientId:'bob',envelope:expired})).status,410);
  const future=packet('future',{createdAt:Date.now()+120000});
  assert.equal((await f.call('alice','POST','/peer/envelopes',{recipientId:'bob',envelope:future})).status,410);
 }finally{await f.close();t.remove();}
});
test('NET07 invalid signature delivered as opaque data remains unacknowledged on failed receipt verification',async()=>{
 const t=temp(),f=await fixture(t);
 try{
  const e={...packet(),signature:'AQ'};
  const queued=await f.call('alice','POST','/peer/envelopes',{recipientId:'bob',envelope:e});
  assert.equal(queued.status,201);
  const inbox=await f.call('bob','GET','/peer/inbox?eventId=ev');
  const ledger=new PeerReceiptLedger(t.receipts);
  assert.throws(()=>validReceiver(inbox.body.deliveries[0].envelope,ledger),/SIGNATURE_INVALID/);
  assert.equal(ledger.db.prepare('SELECT COUNT(*) AS n FROM peer_receipts').get().n,0);
  ledger.close();
  assert.equal((await f.call('bob','GET','/peer/inbox?eventId=ev')).body.deliveries.length,1);
 }finally{await f.close();t.remove();}
});
test('NET08 bounded inbox and sealed artifact only',async()=>{
 const t=temp(),f=await fixture(t);
 try{
  for(let i=0;i<3;i++)assert.equal((await f.call('alice','POST','/peer/envelopes',{recipientId:'bob',envelope:packet('op'+i)})).status,201);
  const r=await f.call('bob','GET','/peer/inbox?eventId=ev&limit=2');
  assert.equal(r.status,200);assert.equal(r.body.deliveries.length,2);
  const bad=await f.call('bob','GET','/peer/inbox?eventId=ev&limit=1000');
  assert.equal(bad.status,400);
  assert.equal('membership' in r.body.deliveries[0],false);
 }finally{await f.close();t.remove();}
});
test('NET09 loopback bind and required authorization policy enforced',()=>{
 const t=temp();
 try{
  assert.throws(()=>startPeerRelay({dbPath:t.db,secret,host:'0.0.0.0',authorizeRoute:policy}),/LOOPBACK_BIND_REQUIRED/);
  assert.throws(()=>startPeerRelay({dbPath:t.db,secret}),/ROUTE_POLICY_REQUIRED/);
 }finally{t.remove();}
});

test('NET10 lost acknowledgment response is idempotently recoverable',async()=>{
 const t=temp(),f=await fixture(t);
 try{
  const packet1=packet('lost-ack');
  const send=await f.call('alice','POST','/peer/envelopes',{recipientId:'bob',envelope:packet1});
  assert.equal(send.status,201);
  const once=await f.call('bob','POST','/peer/ack',{eventId:'ev',deliveryId:send.body.deliveryId});
  assert.equal(once.status,200);assert.equal(once.body.replayed,false);
  const retry=await f.call('bob','POST','/peer/ack',{eventId:'ev',deliveryId:send.body.deliveryId});
  assert.equal(retry.status,200);assert.equal(retry.body.replayed,true);
 }finally{await f.close();t.remove();}
});
test('NET11 retransmission after acknowledged delivery cannot resurrect the queue item',async()=>{
 const t=temp(),f=await fixture(t);
 try{
  const e=packet('ack-done');
  const a=await f.call('alice','POST','/peer/envelopes',{recipientId:'bob',envelope:e});
  await f.call('bob','POST','/peer/ack',{eventId:'ev',deliveryId:a.body.deliveryId});
  const retry=await f.call('alice','POST','/peer/envelopes',{recipientId:'bob',envelope:e});
  assert.equal(retry.status,200);
  assert.equal(retry.body.status,'ACKNOWLEDGED');
  assert.equal(retry.body.replayed,true);
  assert.equal((await f.call('bob','GET','/peer/inbox?eventId=ev')).body.deliveries.length,0);
 }finally{await f.close();t.remove();}
});
test('NET12 queue cap rejects new traffic and preserves idempotent retries',async()=>{
 const t=temp(),f=await fixture(t);
 try{
  const e=packet('cap-test');
  const first=await f.call('alice','POST','/peer/envelopes',{recipientId:'bob',envelope:e});
  assert.equal(first.status,201);
  const sql=f.srv.queue.db.prepare('INSERT INTO peer_deliveries(delivery_id,event_id,sender_id,recipient_id,scope,op_id,payload,payload_hash,expires_at,accepted_at) VALUES(?,?,?,?,?,?,?,?,?,?)');
  for(let i=1;i<1000;i++)sql.run(i.toString(16).padStart(64,'0'),'ev','alice','bob','team-notes','other'+i,'{}','z'.repeat(64),Date.now()+600000,Date.now());
  const denied=await f.call('alice','POST','/peer/envelopes',{recipientId:'bob',envelope:packet('over-cap')});
  assert.equal(denied.status,429);
  const retry=await f.call('alice','POST','/peer/envelopes',{recipientId:'bob',envelope:e});
  assert.equal(retry.status,200);assert.equal(retry.body.replayed,true);
 }finally{await f.close();t.remove();}
});
