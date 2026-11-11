import test from 'node:test';
import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
import {claimKey,getOrCreateClaimOperation,finishClaimOperation} from '../web/src/claim-operation.js';
function store(){const m=new Map();return {getItem:k=>m.get(k)??null,setItem:(k,v)=>m.set(k,v),removeItem:k=>m.delete(k),size:()=>m.size};}
const input={eventId:'event-1',teamId:'team-a',code:'A'.repeat(43),cryptoApi:webcrypto};
test('UI01 | lost response retains operation ID on retry and reload',async()=>{
 const storage=store();
 const a=await getOrCreateClaimOperation({...input,store:storage});
 const b=await getOrCreateClaimOperation({...input,store:storage});
 assert.equal(a.opId,b.opId);
 assert.equal(a.reused,false);assert.equal(b.reused,true);
 assert.equal(storage.size(),1);
});
test('UI02 | invitation code never persisted as plaintext',async()=>{
 const storage=store();
 const a=await getOrCreateClaimOperation({...input,store:storage});
 assert.equal(a.key.includes(input.code),false);
 assert.equal(storage.getItem(a.key).includes(input.code),false);
 assert.equal(a.key.includes('h4h-ps1:claim:event-1:team-a:'),true);
});
test('UI03 | distinct invitation codes do not collide as operation identity',async()=>{
 const storage=store();
 const a=await getOrCreateClaimOperation({...input,store:storage});
 const b=await getOrCreateClaimOperation({...input,code:'B'.repeat(43),store:storage});
 assert.notEqual(a.key,b.key);assert.notEqual(a.opId,b.opId);
});
test('UI04 | distinct events and teams produce isolated operation identities',async()=>{
 const storage=store();
 const a=await getOrCreateClaimOperation({...input,store:storage});
 const b=await getOrCreateClaimOperation({...input,eventId:'event-2',store:storage});
 const c=await getOrCreateClaimOperation({...input,teamId:'team-b',store:storage});
 assert.equal(new Set([a.key,b.key,c.key]).size,3);
});
test('UI05 | authenticated success clears retained operation ID',async()=>{
 const storage=store();
 const a=await getOrCreateClaimOperation({...input,store:storage});
 finishClaimOperation(storage,a.key);
 assert.equal(storage.getItem(a.key),null);
});
test('UI06 | invalid IDs and invitation codes rejected before storage',async()=>{
 const storage=store();
 await assert.rejects(claimKey('bad event','team-a',input.code,webcrypto),/INVALID_EVENT/);
 await assert.rejects(claimKey('event-1','team-a','short',webcrypto),/INVALID_INVITE_CODE/);
 assert.equal(storage.size(),0);
});
