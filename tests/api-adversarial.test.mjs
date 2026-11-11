import test from 'node:test';
import assert from 'node:assert/strict';
import {startServer,issueToken} from '../src/server.mjs';

const secret='adversarial-lab-only-32-byte-secret-000';
async function setup(maxSize=2,dbPath=':memory:'){
 const app=startServer({secret,dbPath});
 app.authority.createEvent('event',maxSize);
 app.authority.createTeam({eventId:'event',teamId:'team',actorId:'leader'});
 const addr=await app.listen();
 const host='http://127.0.0.1:'+addr.port;
 async function post(actor,path,payload){
  const res=await fetch(host+path,{method:'POST',headers:{'content-type':'application/json',
    authorization:'Bearer '+issueToken(actor,secret)},body:JSON.stringify(payload)});
  return {status:res.status,body:await res.json()};
 }
 return {app,post,close:()=>app.close()};
}
test('ADV01 | fifty independent HTTP clients contest the final seat',async()=>{
 const f=await setup(2,process.env.KB_EVIDENCE_DIR ? process.env.KB_EVIDENCE_DIR+'/race.sqlite' : ':memory:');
 try{
  const codes=[];
  for(let i=0;i<50;i++){
   const r=await f.post('leader','/api/invitations',{eventId:'event',teamId:'team',expiresAt:Date.now()+60000});
   assert.equal(r.status,201);
   codes.push(r.body.code);
  }
  const started=Date.now();
  const results=await Promise.all(codes.map((code,i)=>
   f.post('candidate'+i,'/api/invitations/claim',{eventId:'event',teamId:'team',code,opId:'race-'+i})));
  const winners=results.filter(r=>r.status===200&&r.body.status==='COMMITTED');
  const rejected=results.filter(r=>r.status===409);
  assert.equal(results.length,50,'all 50 client operations returned');
  assert.equal(winners.length,1,'one authoritative winner');
  assert.equal(rejected.length,49,'all competitors rejected');
  assert.equal(f.app.authority.board('event')[0].members,2,'team did not overfill');
  assert.deepEqual(f.app.authority.invariants('event'),{oversize:0,orphanLeader:0,eventMismatch:0});
  assert.equal(f.app.authority.audit('event').filter(x=>x.action==='MEMBER_ADMITTED').length,1);
  console.log('OBSERVED 50 HTTP requests; 1 winner; 49 rejected; elapsed_ms='+String(Date.now()-started));
 }finally{await f.close();}
});
test('ADV02 | 20 duplicate concurrent deliveries preserve one operation',async()=>{
 const f=await setup();
 try{
  const inv=await f.post('leader','/api/invitations',{eventId:'event',teamId:'team',expiresAt:Date.now()+60000});
  const cmd={eventId:'event',teamId:'team',code:inv.body.code,opId:'same-operation'};
  const r=await Promise.all(Array.from({length:20},()=>f.post('candidate','/api/invitations/claim',cmd)));
  assert.equal(r.filter(x=>x.status===200).length,20);
  assert.equal(r.filter(x=>x.body.replayed===false).length,1);
  assert.equal(r.filter(x=>x.body.replayed===true).length,19);
  assert.equal(f.app.authority.audit('event').filter(x=>x.action==='MEMBER_ADMITTED').length,1);
 }finally{await f.close();}
});
test('ADV03 | concurrent cross-team claims cannot double-book one user',async()=>{
 const f=await setup();
 try{
  f.app.authority.createTeam({eventId:'event',teamId:'team2',actorId:'leader2'});
  const a=await f.post('leader','/api/invitations',{eventId:'event',teamId:'team',expiresAt:Date.now()+60000});
  const b=await f.post('leader2','/api/invitations',{eventId:'event',teamId:'team2',expiresAt:Date.now()+60000});
  const r=await Promise.all([
   f.post('candidate','/api/invitations/claim',{eventId:'event',teamId:'team',code:a.body.code,opId:'one'}),
   f.post('candidate','/api/invitations/claim',{eventId:'event',teamId:'team2',code:b.body.code,opId:'two'})
  ]);
  assert.equal(r.filter(x=>x.status===200).length,1);
  assert.equal(r.filter(x=>x.status===409).length,1);
  assert.equal(f.app.authority.db.prepare('SELECT COUNT(*) AS n FROM membership WHERE event_id=? AND user_id=?').get('event','candidate').n,1);
 }finally{await f.close();}
});
test('ADV04 | client-forged clock cannot resurrect expired invitation',async()=>{
 const f=await setup();
 try{
  const inv=await f.post('leader','/api/invitations',{eventId:'event',teamId:'team',expiresAt:Date.now()+20});
  assert.equal(inv.status,201);
  await new Promise(resolve=>setTimeout(resolve,40));
  const r=await f.post('candidate','/api/invitations/claim',{
   eventId:'event',teamId:'team',code:inv.body.code,opId:'forged-time',now:1
  });
  assert.equal(r.status,410);
  assert.equal(f.app.authority.board('event')[0].members,1);
 }finally{await f.close();}
});
