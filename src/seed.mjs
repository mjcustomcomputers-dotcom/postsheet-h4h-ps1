// H4H-PS1: bounded deterministic 10k-person / 2k-team seed, actual SQLite data.
import {MembershipAuthority} from './authority.mjs';
import {existsSync,mkdirSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
const dest=process.argv[2];
if(!dest || !dest.endsWith('.sqlite')) {
 console.error('USAGE | node src/seed.mjs /absolute/path/to/fresh-seed.sqlite');
 process.exit(2);
}
const path=resolve(dest);
if(existsSync(path)) {
 console.error('FAIL | destination already exists; preserve prior run: '+path);
 process.exit(3);
}
mkdirSync(dirname(path),{recursive:true});
const began=performance.now();
const a=new MembershipAuthority(path);
try{
 a.createEvent('seed-event',5);
 for(let team=0;team<2000;team++){
  const tid='crew-'+String(team).padStart(4,'0');
  const leader='builder-'+String(team*5).padStart(5,'0');
  a.createTeam({eventId:'seed-event',teamId:tid,actorId:leader});
  for(let seat=1;seat<5;seat++){
   const who='builder-'+String(team*5+seat).padStart(5,'0');
   const code=a.invite({eventId:'seed-event',teamId:tid,actorId:leader,expiresAt:Date.now()+3600000}).code;
   a.claim({eventId:'seed-event',teamId:tid,actorId:who,code,opId:'seed-'+tid+'-'+seat});
  }
 }
 const teamCount=a.db.prepare('SELECT COUNT(*) AS n FROM teams').get().n;
 const memberCount=a.db.prepare('SELECT COUNT(*) AS n FROM membership').get().n;
 const invariants=a.invariants('seed-event');
 if(teamCount!==2000||memberCount!==10000||Object.values(invariants).some(x=>x!==0))
  throw Error('SEED_POSTCONDITION_FAILED');
 console.log(JSON.stringify({result:'SEED_CREATED',file:path,event:'seed-event',teams:teamCount,members:memberCount,
  teamCapacity:5,invariants,elapsedMs:Math.round(performance.now()-began)}));
}finally{a.close();}
