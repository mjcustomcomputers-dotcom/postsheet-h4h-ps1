import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes,generateKeyPairSync} from 'node:crypto';
import {sealPeerArtifact,openPeerArtifact} from '../src/peer-envelope.mjs';

const keys=generateKeyPairSync('ec',{namedCurve:'prime256v1'});
const aes=randomBytes(32);
const namedKey=keys.publicKey.export({type:'spki',format:'pem'});
const consent=(actor,pub,scope)=>actor==='builder-A'&&scope==='team-notes'&&pub===namedKey;
const input=()=>({eventId:'event-1',actorId:'builder-A',opId:'op-1',scope:'team-notes',
 plaintext:'task evidence only',key:aes,privateKey:keys.privateKey,publicKey:keys.publicKey});
const open=(e,extras={})=>openPeerArtifact(e,{key:aes,expectedEvent:'event-1',expectedScope:'team-notes',
 authorizedActor:consent,now:e.createdAt+1,...extras});

test('per-author P-256 signature and AES-GCM round-trip; never grants membership',()=>{
 const e=sealPeerArtifact(input()); const a=open(e);
 assert.equal(a.plaintext.toString(),'task evidence only');
 assert.equal(a.transportStatus,'PEER_ARTIFACT_ONLY');
 assert.equal(e.ciphertext.includes('task evidence only'),false);
});
test('tampering signed scope and artifact bytes is detected',()=>{
 const e=sealPeerArtifact(input());
 assert.throws(()=>open({...e,scope:'other'}),/SCOPE_MISMATCH/);
 assert.throws(()=>open({...e,ciphertext:'AQ'}),/ENVELOPE_DIGEST_MISMATCH/);
});
test('unauthorized identity and unknown public keys are rejected',()=>{
 const e=sealPeerArtifact(input());
 assert.throws(()=>open(e,{authorizedActor:()=>false}),/ACTOR_UNAUTHORIZED/);
 const other=generateKeyPairSync('ec',{namedCurve:'prime256v1'});
 assert.throws(()=>open({...e,publicKey:other.publicKey.export({type:'spki',format:'pem'})}),/ACTOR_UNAUTHORIZED/);
});
test('replay identity is scoped to event actor and operation',()=>{
 const e=sealPeerArtifact(input());const seen=new Set();
 open(e,{seen});
 assert.throws(()=>open(e,{seen}),/REPLAY_DETECTED/);
});
test('expiry and future clock boundaries are enforced',()=>{
 const e=sealPeerArtifact(input());
 assert.throws(()=>open(e,{now:e.expiresAt}),/ENVELOPE_EXPIRED_OR_FUTURE/);
 assert.throws(()=>open(e,{now:e.createdAt-1}),/ENVELOPE_EXPIRED_OR_FUTURE/);
});
test('wrong AES key fails authenticated decryption',()=>{
 const e=sealPeerArtifact(input());
 assert.throws(()=>open(e,{key:randomBytes(32)}),/DECRYPTION_FAILED/);
});
test('ciphertext over 64 KiB and weak key rejected',()=>{
 assert.throws(()=>sealPeerArtifact({...input(),plaintext:Buffer.alloc(65537)}),/PAYLOAD_TOO_LARGE/);
 assert.throws(()=>sealPeerArtifact({...input(),key:Buffer.alloc(16)}),/INVALID_AES_KEY/);
});
test('idempotent transport: same operation does not become separate admission',()=>{
 const e=sealPeerArtifact(input());const a=open(e);
 assert.equal(a.opId,'op-1');
 assert.equal('membership' in a,false);
});
