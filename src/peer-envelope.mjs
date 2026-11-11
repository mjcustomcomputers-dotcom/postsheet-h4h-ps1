// H4H-PS1 R4: Layer-B encrypted peer artifact; Layer-A membership remains authoritative.
import {randomBytes,createHash,createCipheriv,createDecipheriv,sign,verify,createPublicKey} from 'node:crypto';
const ID=/^[A-Za-z0-9_.:@-]{1,128}$/;
const checkId=(value,name)=>{if(typeof value!=='string'||!ID.test(value))throw Error('INVALID_'+name);return value;};
const b64=b=>Buffer.from(b).toString('base64url');
const from64=s=>{if(typeof s!=='string'||!s||!(/^[A-Za-z0-9_-]+$/.test(s)))throw Error('INVALID_ENCODING');const b=Buffer.from(s,'base64url');if(b64(b)!==s)throw Error('INVALID_ENCODING');return b;};
const digest=buffer=>createHash('sha256').update(buffer).digest('hex');
const canonical=({eventId,actorId,opId,scope,createdAt,expiresAt,iv,ciphertext,tag})=>JSON.stringify([eventId,actorId,opId,scope,createdAt,expiresAt,iv,ciphertext,tag]);
const validEnvelope=e=>{
 if(!e||typeof e!=='object'||Array.isArray(e)||e.version!==1)throw Error('INVALID_ENVELOPE');
 for(const [k,label] of [['eventId','EVENT'],['actorId','ACTOR'],['opId','OPERATION'],['scope','SCOPE']])checkId(e[k],label);
 if(!Number.isSafeInteger(e.createdAt)||!Number.isSafeInteger(e.expiresAt)||e.createdAt<=0||e.expiresAt<=e.createdAt)throw Error('INVALID_EXPIRY');
 if(!e.iv||!e.ciphertext||!e.tag||!e.signature||!e.publicKey)throw Error('INVALID_ENVELOPE');
 if(typeof e.publicKey!=='string'||e.publicKey.length>2048||typeof e.signature!=='string'||e.signature.length>256||e.ciphertext.length>90000)throw Error('INVALID_ENVELOPE');
 if(from64(e.iv).length!==12||from64(e.tag).length!==16||from64(e.ciphertext).length>65536)throw Error('INVALID_ENVELOPE');
 return e;
};
export function sealPeerArtifact({eventId,actorId,opId,scope,plaintext,key,privateKey,publicKey,createdAt=Date.now(),ttlMs=600000}){
 for(const [value,label] of [[eventId,'EVENT'],[actorId,'ACTOR'],[opId,'OPERATION'],[scope,'SCOPE']])checkId(value,label);
 if(!Buffer.isBuffer(key)||key.length!==32)throw Error('INVALID_AES_KEY');
 if(!privateKey||!publicKey||privateKey.asymmetricKeyType!=='ec'||privateKey.asymmetricKeyDetails?.namedCurve!=='prime256v1'||publicKey.asymmetricKeyType!=='ec'||publicKey.asymmetricKeyDetails?.namedCurve!=='prime256v1')throw Error('INVALID_SIGNING_KEY');
 if(!Number.isSafeInteger(ttlMs)||ttlMs<1||ttlMs>86400000||!Number.isSafeInteger(createdAt)||createdAt<=0||!Number.isSafeInteger(createdAt+ttlMs))throw Error('INVALID_EXPIRY');
 const bytes=Buffer.isBuffer(plaintext)?plaintext:Buffer.from(plaintext);
 if(bytes.length>65536)throw Error('PAYLOAD_TOO_LARGE');
 const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',key,iv);
 const ciphertext=Buffer.concat([cipher.update(bytes),cipher.final()]);
 const e={version:1,eventId,actorId,opId,scope,createdAt,expiresAt:createdAt+ttlMs,iv:b64(iv),ciphertext:b64(ciphertext),tag:b64(cipher.getAuthTag()),publicKey:publicKey.export({type:'spki',format:'pem'})};
 const sig=sign('sha256',Buffer.from(canonical(e)),privateKey);
 return {...e,signature:b64(sig),digest:digest(Buffer.from(canonical(e)))};
}
export function openPeerArtifact(envelope,{key,expectedEvent,expectedScope,authorizedActor,now=Date.now(),seen}={}){
 const e=validEnvelope(envelope);
 if(!Buffer.isBuffer(key)||key.length!==32)throw Error('INVALID_AES_KEY');
 if(!Number.isSafeInteger(now)||now<e.createdAt||now>=e.expiresAt)throw Error('ENVELOPE_EXPIRED_OR_FUTURE');
 if(e.eventId!==checkId(expectedEvent,'EXPECTED_EVENT')||e.scope!==checkId(expectedScope,'EXPECTED_SCOPE'))throw Error('SCOPE_MISMATCH');
 if(typeof authorizedActor!=='function'||!authorizedActor(e.actorId,e.publicKey,e.scope))throw Error('ACTOR_UNAUTHORIZED');
 const message=Buffer.from(canonical(e));
 if(e.digest!==digest(message))throw Error('ENVELOPE_DIGEST_MISMATCH');
 let pub;try{pub=createPublicKey(e.publicKey);}catch{throw Error('INVALID_SIGNING_KEY');}
 if(pub.asymmetricKeyType!=='ec'||pub.asymmetricKeyDetails?.namedCurve!=='prime256v1')throw Error('INVALID_SIGNING_KEY');
 if(!verify('sha256',message,pub,from64(e.signature)))throw Error('SIGNATURE_INVALID');
 const receiptId=digest(Buffer.from(JSON.stringify([e.eventId,e.actorId,e.opId])));
 if(seen&&seen.has(receiptId))throw Error('REPLAY_DETECTED');
 const decipher=createDecipheriv('aes-256-gcm',key,from64(e.iv));
 decipher.setAuthTag(from64(e.tag));
 let plaintext;try{plaintext=Buffer.concat([decipher.update(from64(e.ciphertext)),decipher.final()]);}catch{throw Error('DECRYPTION_FAILED');}
 if(seen)seen.add(receiptId,e.expiresAt);
 return {eventId:e.eventId,actorId:e.actorId,opId:e.opId,scope:e.scope,plaintext,transportStatus:'PEER_ARTIFACT_ONLY'};
}
// Pass PeerReceiptLedger as seen for cross-restart and multi-process replay exclusion.
// This module never grants membership, permission or a server-side commit.
