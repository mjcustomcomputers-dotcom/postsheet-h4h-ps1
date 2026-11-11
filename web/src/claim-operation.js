// H4H PS1 | stable operation identity across lost responses / browser reload.
// Stores only a SHA-256 digest of the invite as part of the storage key; never stores invite or bearer token.
const ID=/^[A-Za-z0-9_.:@-]{1,128}$/;
const check=(v,name)=>{if(typeof v!=='string'||!ID.test(v))throw Error('INVALID_'+name);};
export async function claimKey(eventId,teamId,code,cryptoApi=globalThis.crypto){
 check(eventId,'EVENT');check(teamId,'TEAM');
 if(typeof code!=='string'||code.length<30||code.length>256)throw Error('INVALID_INVITE_CODE');
 if(!cryptoApi?.subtle)throw Error('CRYPTO_UNAVAILABLE');
 const digest=await cryptoApi.subtle.digest('SHA-256',new TextEncoder().encode(code));
 const fingerprint=Array.from(new Uint8Array(digest),v=>v.toString(16).padStart(2,'0')).join('');
 return 'h4h-ps1:claim:'+eventId+':'+teamId+':'+fingerprint;
}
export async function getOrCreateClaimOperation({eventId,teamId,code,store,cryptoApi=globalThis.crypto}){
 const key=await claimKey(eventId,teamId,code,cryptoApi);
 const existing=store.getItem(key);
 if(existing && ID.test(existing))return {key,opId:existing,reused:true};
 const opId='join-'+cryptoApi.randomUUID();
 check(opId,'OPERATION');
 store.setItem(key,opId);
 return {key,opId,reused:false};
}
export function finishClaimOperation(store,key){store.removeItem(key);}
