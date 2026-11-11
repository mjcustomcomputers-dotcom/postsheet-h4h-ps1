#!/usr/bin/env node
// Autocannon emits p90 and p97_5, not p95. p97_5 is a conservative upper bound on p95.
// Existing run can be accepted when p97_5 < 200ms; otherwise exact-p95 sampling is required.
import {readFileSync} from 'node:fs';
const [file,expectedSourceFile]=process.argv.slice(2);
if(!file){console.error('USAGE | node assess-board-load.mjs autocannon.json [source-sha.txt]');process.exit(2);}
let x;
try{x=JSON.parse(readFileSync(file,'utf8'));}catch(e){console.error('FAIL | Invalid autocannon result JSON: '+e.message);process.exit(1);}
const value=(v)=>typeof v==='number'&&Number.isFinite(v);
const p975=x.latency?.p97_5, p90=x.latency?.p90;
const total=x.requests?.total;
const errors=x.errors,timeouts=x.timeouts,non2xx=x.non2xx;
const connections=x.connections;
const duration=x.duration;
const status=x.statusCodeStats;
let source='UNRECORDED';
if(expectedSourceFile){try{source=readFileSync(expectedSourceFile,'utf8').trim();}catch{console.error('FAIL | Source fingerprint unavailable');process.exit(1);}}
console.log('SOURCE | '+source);
console.log('CLIENTS | '+connections+' DURATION_S | '+duration);
console.log('REQUESTS | '+total);
console.log('P90_MS | '+p90);
console.log('P97_5_MS | '+p975);
console.log('P95_CONSTRAINT | p95 <= observed p97.5');
console.log('ERRORS | '+errors+' TIMEOUTS | '+timeouts+' NON_2XX | '+non2xx);
if(!value(p975)||!value(total)||total<100||!value(errors)||!value(timeouts)||!value(non2xx)||connections!==100||!value(duration)||duration<10){
 console.error('FAIL | Load-run coverage, histogram or response counters invalid');
 process.exit(1);
}
if(errors||timeouts||non2xx){console.error('FAIL | Transport or HTTP response errors observed');process.exit(1);}
if(!status||Number(status['200']?.count||0)<100){console.error('FAIL | Board 200 response sample insufficient');process.exit(1);}
if(p975>=200){console.error('HOLD | p97.5 >= 200ms: exact p95 required; do not equate it to p97.5');process.exit(2);}
console.log('KB_GATE:PASS checks=5');
console.log('ACCEPTANCE | Strict p97.5<200ms proves required p95<200ms on the sampled run');
