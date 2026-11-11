import test from 'node:test';
import assert from 'node:assert/strict';
import {startServer,issueToken} from '../src/server.mjs';
test('API29 SSE emits revision only after authoritative mutation',async()=>{
 const secret='sse-test-32-byte-private-key-for-fixture';
 const app=startServer({secret});
 app.authority.createEvent('event',3);
 const address=await app.listen();
 const base='http://127.0.0.1:'+address.port;
 const control=new AbortController();
 try{
  const stream=await fetch(base+'/api/events/event/stream',{signal:control.signal});
  assert.equal(stream.status,200);
  const reader=stream.body.getReader();
  const greeting=await reader.read();
  assert.ok(new TextDecoder().decode(greeting.value).includes('connected'));
  const response=await fetch(base+'/api/teams',{method:'POST',headers:{
   'content-type':'application/json',authorization:'Bearer '+issueToken('leader',secret)
  },body:JSON.stringify({eventId:'event',teamId:'team'})});
  assert.equal(response.status,201);
  const next=await reader.read();
  const text=new TextDecoder().decode(next.value);
  assert.ok(text.includes('event: board'));
  assert.ok(text.includes('ROSTER_REVISION'));
  control.abort();
 }finally{control.abort();await app.close();}
});
