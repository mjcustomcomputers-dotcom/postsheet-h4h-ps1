import test from 'node:test';
import assert from 'node:assert/strict';
import {planGoal,evidenceState} from '../src/goal-planner.mjs';

const good={support:true,refute:false};
const unknown={support:false,refute:false};
const conflicting={support:true,refute:true};
const p=(id,abilities,windows=[{start:0,end:100}],consent=true)=>({id,abilities,windows,consent});
const g=(tasks,deadlineMin=100)=>({id:'demo',startMin:0,deadlineMin,tasks});

test('PLAN01 four-state evidence support only',()=>assert.equal(evidenceState(good),'supported'));
test('PLAN02 four-state evidence conflict',()=>assert.equal(evidenceState(conflicting),'conflicting'));
test('PLAN03 four-state missing evidence unknown',()=>assert.equal(evidenceState(unknown),'unknown'));
test('PLAN04 parallel work then integration has four-hour dependency bound',()=>{
 const goal=g([{id:'api',skill:'backend',durationMin:120},{id:'ui',skill:'frontend',durationMin:180},
 {id:'integration',skill:'integrate',durationMin:60,after:['api','ui']}],500);
 const people=[p('a',{backend:good},[{start:0,end:500}]),p('b',{frontend:good},[{start:0,end:500}]),p('c',{integrate:good},[{start:0,end:500}])];
 const res=planGoal({goal,people});
 assert.equal(res.status,'FEASIBLE_WITNESS');
 assert.equal(Math.max(...res.witness.assignments.map(x=>x.endMin)),240);
});
test('PLAN05 skill union cannot double-book a person on simultaneous critical tasks',()=>{
 const goal=g([{id:'backend',skill:'backend',durationMin:100,deadlineMin:100},
                  {id:'database',skill:'database',durationMin:100,deadlineMin:100}]);
 const people=[p('a',{backend:good,database:good}),p('b',{frontend:good})];
 const res=planGoal({goal,people});
 assert.equal(res.status,'SEARCH_INCOMPLETE');
 assert.equal(res.witness,null);
});
test('PLAN06 additional consenting database specialist restores witness',()=>{
 const goal=g([{id:'backend',skill:'backend',durationMin:100,deadlineMin:100},
                  {id:'database',skill:'database',durationMin:100,deadlineMin:100}]);
 const people=[p('a',{backend:good,database:good}),p('b',{frontend:good}),p('c',{database:good})];
 const res=planGoal({goal,people});
 assert.equal(res.status,'FEASIBLE_WITNESS');
 assert.equal(new Set(res.witness.assignments.map(x=>x.personId)).size,2);
});
test('PLAN07 irrelevant unknown secondary ability creates no question',()=>{
 const goal=g([{id:'api',skill:'backend',durationMin:10},{id:'ui',skill:'frontend',durationMin:10}]);
 const res=planGoal({goal,people:[p('a',{backend:good,frontend:unknown}),p('b',{frontend:good})]});
 assert.equal(res.status,'FEASIBLE_WITNESS');
 assert.equal(res.witness.guards.length,0);
});
test('PLAN08 unknown critical ability makes conditional witness',()=>{
 const res=planGoal({goal:g([{id:'api',skill:'backend',durationMin:10}]),people:[p('a',{backend:unknown})]});
 assert.equal(res.status,'CONDITIONAL_WITNESS');
 assert.equal(res.nextResolution.required,'TASK_ABILITY_CONFIRMATION');
});
test('PLAN09 conflicting evidence cannot silently count as confirmed ability',()=>{
 const res=planGoal({goal:g([{id:'api',skill:'backend',durationMin:10}]),people:[p('a',{backend:conflicting})]});
 assert.equal(res.status,'SEARCH_INCOMPLETE');
});
test('PLAN10 unavailable person cannot satisfy timed requirement',()=>{
 const goal=g([{id:'api',skill:'backend',durationMin:10,deadlineMin:30}],30);
 const res=planGoal({goal,people:[p('a',{backend:good},[{start:40,end:100}])]});
 assert.equal(res.status,'SEARCH_INCOMPLETE');
});
test('PLAN11 consent is a hard input',()=>{
 const res=planGoal({goal:g([{id:'api',skill:'backend',durationMin:10}]),people:[p('a',{backend:good},[{start:0,end:100}],false)]});
 assert.equal(res.status,'SEARCH_INCOMPLETE');
});
test('PLAN12 cyclic dependency rejected',()=>{
 const goal=g([{id:'a',skill:'api',durationMin:10,after:['b']},{id:'b',skill:'api',durationMin:10,after:['a']}]);
 assert.throws(()=>planGoal({goal,people:[p('worker',{api:good})]}),/CYCLIC/);
});
test('PLAN13 small search budget preserves incomplete state',()=>{
 const goal=g([{id:'a',skill:'api',durationMin:10},{id:'b',skill:'frontend',durationMin:10}]);
 const res=planGoal({goal,people:[p('a',{api:unknown,frontend:unknown})],maxNodes:1});
 assert.equal(res.status,'SEARCH_INCOMPLETE');
 assert.equal(res.search.exhausted,true);
});

test('PLAN14 absent skill differs from explicitly unknown skill',()=>{
 const goal=g([{id:'backend',skill:'backend',durationMin:20}]);
 const noClaim=planGoal({goal,people:[p('frontend-only',{frontend:good})]});
 assert.equal(noClaim.status,'SEARCH_INCOMPLETE');
 assert.equal(noClaim.witness,null);
 const explicitUnknown=planGoal({goal,people:[p('learning-builder',{backend:unknown})]});
 assert.equal(explicitUnknown.status,'CONDITIONAL_WITNESS');
 assert.equal(explicitUnknown.nextResolution.required,'TASK_ABILITY_CONFIRMATION');
});
