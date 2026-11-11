import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {generateKeyPairSync,randomBytes} from 'node:crypto';
import {PeerReceiptLedger,peerReceiptId} from '../src/peer-receipts.mjs';
import {sealPeerArtifact,openPeerArtifact} from '../src/peer-envelope.mjs';

const identity=generateKeyPairSync('ec',{namedCurve:'prime256v1'});
const key=randomBytes(32);
const pub=identity.publicKey.export({format:'pem',type:'spki'});
const input=(opId='op-1')=>({eventId:'event-1',actorId:'builder-1',opId,scope:'team-notes',
 key,privateKey:identity.privateKey,publicKey:identity.publicKey,plaintext:'verified note'});
const accept=(envelope,seen)=>openPeerArtifact(envelope,{key,expectedEvent:'event-1',expectedScope:'team-notes',
 authorizedActor:(actor,pem,scope)=>actor==='builder-1'&&pem===pub&&scope==='team-notes',seen,now:envelope.createdAt+1});
function tempLedger(){
 const dir=mkdtempSync(join(tmpdir(),'h4h-receipt-'));
 return {path:join(dir,'receipts.sqlite'),cleanup:()=>rmSync(dir,{recursive:true,force:true})};
}
test('RCP01 persisted replay survives database close and reopen',()=>{
 const t=tempLedger(),packet=sealPeerArtifact(input());
 try{
  let ledger=new PeerReceiptLedger(t.path);
  assert.equal(accept(packet,ledger).plaintext.toString(),'verified note');
  ledger.close();
  ledger=new PeerReceiptLedger(t.path);
  assert.throws(()=>accept(packet,ledger),/REPLAY_DETECTED/);
  ledger.close();
 }finally{t.cleanup();}
});
test('RCP02 two open ledger connections admit operation once',()=>{
 const t=tempLedger(),packet=sealPeerArtifact(input());
 try{
  const a=new PeerReceiptLedger(t.path),b=new PeerReceiptLedger(t.path);
  assert.equal(accept(packet,a).opId,'op-1');
  assert.throws(()=>accept(packet,b),/REPLAY_DETECTED/);
  a.close();b.close();
 }finally{t.cleanup();}
});
test('RCP03 forged ciphertext does not consume receipt',()=>{
 const t=tempLedger(),packet=sealPeerArtifact(input());
 try{
  const l=new PeerReceiptLedger(t.path);
  assert.throws(()=>accept({...packet,tag:'AQ'},l),/INVALID_ENVELOPE|ENVELOPE_DIGEST_MISMATCH/);
  assert.equal(accept(packet,l).opId,'op-1');
  l.close();
 }finally{t.cleanup();}
});
test('RCP04 different operation keys are independent',()=>{
 const t=tempLedger();
 try{
  const l=new PeerReceiptLedger(t.path);
  accept(sealPeerArtifact(input('op-1')),l);
  accept(sealPeerArtifact(input('op-2')),l);
  assert.equal(l.db.prepare('SELECT COUNT(*) AS n FROM peer_receipts').get().n,2);
  l.close();
 }finally{t.cleanup();}
});
test('RCP05 pruning only expired records retains active replay guard',()=>{
 const t=tempLedger();
 try{
  const l=new PeerReceiptLedger(t.path);
  const now=Date.now();
  l.add(peerReceiptId('event-1','builder-1','old'),now-100);
  const live=peerReceiptId('event-1','builder-1','live');
  l.add(live,now+100000);
  assert.equal(l.pruneExpired(now),1);
  assert.equal(l.has(live),true);
  assert.throws(()=>l.add(live,now+100000),/REPLAY_DETECTED/);
  l.close();
 }finally{t.cleanup();}
});
test('RCP06 receipt identity is delimiter-safe and scope-independent',()=>{
 assert.notEqual(peerReceiptId('a:b','c','d'),peerReceiptId('a','b:c','d'));
 assert.notEqual(peerReceiptId('a','b','c:d'),peerReceiptId('a:b','c','d'));
});
test('RCP07 invalid receipt key and memory-only database rejected',()=>{
 assert.throws(()=>new PeerReceiptLedger(':memory:'),/DURABLE_PATH_REQUIRED/);
 const t=tempLedger();
 try{
  const l=new PeerReceiptLedger(t.path);
  assert.throws(()=>l.has('untrusted'),/INVALID_RECEIPT_IDENTITY/);
  l.close();
 }finally{t.cleanup();}
});
