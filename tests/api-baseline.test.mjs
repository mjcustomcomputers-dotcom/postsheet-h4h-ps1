import test from 'node:test';
import assert from 'node:assert/strict';
import {startServer,issueToken} from '../src/server.mjs';

const secret='test-only-32-byte-key-never-for-production-000';
async function fixture(size=2){
 const app=startServer({secret});
 app.authority.createEvent('ev',size);
 const addr=await app.listen();
 const root='http://127.0.0.1:'+addr.port;
 async function api(actor,path,body,method='POST',token){
  const headers={'content-type':'application/json'};
  if(actor)headers.authorization='Bearer '+(token||issueToken(actor,secret));
  const r=await fetch(root+path,{method,headers,body:method==='POST'?JSON.stringify(body):undefined});
  const json=await r.json();
  return {status:r.status,json,headers:r.headers};
 }
 return {app,root,api,stop:()=>app.close()};
}
const create=(f,leader='a',teamId='team')=>f.api(leader,'/api/teams',{eventId:'ev',teamId});
const invite=(f,actor='a',teamId='team',expiresAt=Date.now()+60000)=>
 f.api(actor,'/api/invitations',{eventId:'ev',teamId,expiresAt});
const claim=(f,actor,code,opId='op',teamId='team')=>
 f.api(actor,'/api/invitations/claim',{eventId:'ev',teamId,code,opId});
async function withFixture(name,fn,size=2){
 await test(name,async()=>{
  const f=await fixture(size);
  try{await fn(f);}finally{await f.stop();}
 });
}
await withFixture('API01 health returns 200',async f=>{assert.equal((await f.api(null,'/health',null,'GET')).status,200);});
await withFixture('API02 missing authorization denied',async f=>{assert.equal((await create(f,null)).status,401);});
await withFixture('API03 malformed bearer denied',async f=>{assert.equal((await f.api('a','/api/teams',{eventId:'ev',teamId:'t'},'POST','bad.token')).status,401);});
await withFixture('API04 team creation authenticated',async f=>{assert.equal((await create(f)).status,201);});
await withFixture('API05 second team in event rejected',async f=>{await create(f);assert.equal((await create(f,'a','other')).status,409);});
await withFixture('API06 board lists one team',async f=>{await create(f);const r=await f.api(null,'/api/events/ev/board',null,'GET');assert.equal(r.json.teams.length,1);});
await withFixture('API07 board member count starts one',async f=>{await create(f);const r=await f.api(null,'/api/events/ev/board',null,'GET');assert.equal(r.json.teams[0].members,1);});
await withFixture('API08 board page limit bounded',async f=>{assert.equal((await f.api(null,'/api/events/ev/board?limit=101',null,'GET')).status,400);});
await withFixture('API09 leader creates invite',async f=>{await create(f);const r=await invite(f);assert.equal(r.status,201);assert.ok(r.json.code.length>=30);});
await withFixture('API10 ordinary user cannot invite',async f=>{await create(f);assert.equal((await invite(f,'b')).status,403);});
await withFixture('API11 past expiry rejected',async f=>{await create(f);assert.equal((await invite(f,'a','team',Date.now()-100)).status,410);});
await withFixture('API12 invited actor admitted',async f=>{await create(f);const i=await invite(f);assert.equal((await claim(f,'b',i.json.code)).json.status,'COMMITTED');});
await withFixture('API13 duplicate operation returns replayed result',async f=>{await create(f);const i=await invite(f);await claim(f,'b',i.json.code);assert.equal((await claim(f,'b',i.json.code)).json.replayed,true);});
await withFixture('API14 same id different request is conflict',async f=>{await create(f);const i=await invite(f);await claim(f,'b',i.json.code);const j=await invite(f);assert.equal((await claim(f,'b',j.json.code)).status,409);});
await withFixture('API15 consumed invitation rejected',async f=>{await create(f);const i=await invite(f);await claim(f,'b',i.json.code);assert.equal((await claim(f,'c',i.json.code,'different')).status,409);},3);
await withFixture('API16 invalid code rejected',async f=>{await create(f);assert.equal((await claim(f,'b','bad')).status,400);});
await withFixture('API17 team capacity enforced',async f=>{await create(f);const i=await invite(f);const j=await invite(f);await claim(f,'b',i.json.code);assert.equal((await claim(f,'c',j.json.code,'op2')).status,409);});
await withFixture('API18 event-wide uniqueness across teams',async f=>{await create(f);await create(f,'c','team2');const i=await invite(f);await claim(f,'b',i.json.code);const j=await invite(f,'c','team2');assert.equal((await claim(f,'b',j.json.code,'else','team2')).status,409);});
await withFixture('API19 actor field cannot spoof identity',async f=>{await create(f);const i=await invite(f);const r=await f.api('b','/api/invitations/claim',{eventId:'ev',teamId:'team',actorId:'administrator',code:i.json.code,opId:'spooftest'});assert.equal(r.json.actorId,'b');});
await withFixture('API20 audit contains authoritative admission',async f=>{await create(f);const i=await invite(f);await claim(f,'b',i.json.code);assert.ok(f.app.authority.audit('ev').some(x=>x.action==='MEMBER_ADMITTED'));});
await withFixture('API21 leader succession on withdrawal',async f=>{await create(f);const i=await invite(f);await claim(f,'b',i.json.code);const r=await f.api('a','/api/teams/leave',{eventId:'ev',teamId:'team'});assert.equal(r.json.leader,'b');});
await withFixture('API22 delete after final departure',async f=>{await create(f);const r=await f.api('a','/api/teams/leave',{eventId:'ev',teamId:'team'});assert.equal(r.json.status,'TEAM_DELETED');assert.equal((await f.api(null,'/api/events/ev/board',null,'GET')).json.teams.length,0);});
await withFixture('API23 invariants persist after admission',async f=>{await create(f);const i=await invite(f);await claim(f,'b',i.json.code);assert.deepEqual(f.app.authority.invariants('ev'),{oversize:0,orphanLeader:0,eventMismatch:0});});
await withFixture('API24 no permissive CORS header',async f=>{const r=await f.api(null,'/health',null,'GET');assert.equal(r.headers.get('access-control-allow-origin'),null);});
await withFixture('API25 access response disables caching',async f=>{const r=await f.api(null,'/health',null,'GET');assert.equal(r.headers.get('cache-control'),'no-store');});
await withFixture('API26 no plaintext invitation in database',async f=>{await create(f);const i=await invite(f);assert.equal(f.app.authority.db.prepare('SELECT 1 FROM invites WHERE code_hash=?').get(i.json.code),undefined);});
await withFixture('API27 unsupported route rejected',async f=>{assert.equal((await f.api(null,'/api/nope',null,'GET')).status,404);});
await withFixture('API28 invalid team input blocked',async f=>{assert.equal((await f.api('a','/api/teams',{eventId:'ev',teamId:'not valid'})).status,400);});
