import test from 'node:test';
import assert from 'node:assert/strict';
import { planGoal } from '../src/goal-planner.mjs';
import {
  stateOfEvidence,
  mergeIntervals,
  computeTaskScheduleMeta,
  evaluateWildcardFrontier,
  diagnoseAndRepair,
  recommendComplementary
} from '../src/synchronicity-solvers.mjs';
import { MembershipAuthority } from '../src/authority.mjs';

const good = { support: true, refute: false };
const unknown = { support: false, refute: false };
const refuted = { support: false, refute: true };

/**
 * Clean-room independent event-point schedule oracle for differential verification (EXP-10).
 */
function exactScheduleOracle(goal, people, allowUnknown = true) {
  const tasks = goal.tasks;
  const scheduled = new Map();
  let foundRobust = false;
  let foundConditional = false;

  function startsFor(person, ready, dur, due) {
    const wins = mergeIntervals(person.windows || []);
    const busy = [...scheduled.values()].filter(a => a.personId === person.id);
    const pts = new Set();
    for (const w of wins) {
      if (w.end - w.start < dur) continue;
      const s0 = Math.max(w.start, ready);
      if (s0 + dur <= w.end && s0 + dur <= due) pts.add(s0);
      for (const b of busy) {
        const s1 = Math.max(w.start, ready, b.endMin);
        if (s1 + dur <= w.end && s1 + dur <= due) pts.add(s1);
      }
    }
    return [...pts]
      .sort((a, b) => a - b)
      .filter(s => {
        const e = s + dur;
        return (
          e <= due &&
          wins.some(w => s >= w.start && e <= w.end) &&
          !busy.some(b => s < b.endMin && e > b.startMin)
        );
      });
  }

  function dfs(hasUnk) {
    if (foundRobust) return;
    if (scheduled.size === tasks.length) {
      if (!hasUnk) foundRobust = true;
      else foundConditional = true;
      return;
    }
    const readyTasks = tasks.filter(
      t => !scheduled.has(t.id) && (t.after || []).every(d => scheduled.has(d))
    );
    for (const t of readyTasks) {
      let r = goal.startMin;
      const lag = Math.max(0, t.lagMin || 0);
      for (const d of t.after || []) r = Math.max(r, scheduled.get(d).endMin + lag);
      const due = Number.isSafeInteger(t.deadlineMin)
        ? Math.min(goal.deadlineMin, t.deadlineMin)
        : goal.deadlineMin;
      for (const p of people) {
        if (p.consent !== true || !Object.hasOwn(p.abilities || {}, t.skill)) continue;
        const st = stateOfEvidence(p.abilities[t.skill]);
        if (st !== 'supported' && !(allowUnknown && st === 'unknown')) continue;
        for (const s of startsFor(p, r, t.durationMin, due)) {
          scheduled.set(t.id, { taskId: t.id, personId: p.id, startMin: s, endMin: s + t.durationMin });
          dfs(hasUnk || st === 'unknown');
          scheduled.delete(t.id);
          if (foundRobust) return;
        }
      }
    }
  }

  dfs(false);
  return foundRobust ? 'FEASIBLE_WITNESS' : foundConditional ? 'CONDITIONAL_WITNESS' : 'INFEASIBLE';
}

test('R6_EXP01 | Feasible sequential dependency chain emits zero false Hall contention repairs', () => {
  const goal = {
    id: 'exp01-seq-feasible',
    startMin: 0,
    deadlineMin: 240,
    tasks: [
      { id: 'api', skill: 'backend', durationMin: 60, after: [] },
      { id: 'deploy', skill: 'devops', durationMin: 60, after: ['api'] }
    ]
  };
  const people = [
    { id: 'aurora', abilities: { backend: good, devops: good }, windows: [{ start: 0, end: 240 }], consent: true }
  ];
  const plan = planGoal({ goal, people });
  assert.equal(plan.status, 'FEASIBLE_WITNESS');
  assert.deepEqual(plan.repairs, []);
  assert.deepEqual(diagnoseAndRepair({ goal, people }), []);
  const rec = recommendComplementary({ goal, teamPeople: people, candidates: [], planFn: planGoal });
  assert.deepEqual(rec.baselineRepairs, []);
});

test('R6_EXP02 | Sequential late-window overrun emits SCHEDULE_HANDOFF_REPAIR and never HALL_CAPACITY_CONTENTION_REPAIR', () => {
  const goal = {
    id: 'exp02-seq-window-shift',
    startMin: 0,
    deadlineMin: 140,
    tasks: [
      { id: 't1', skill: 'backend', durationMin: 60, after: [] },
      { id: 't2', skill: 'devops', durationMin: 60, after: ['t1'] }
    ]
  };
  const people = [
    { id: 'aurora', abilities: { backend: good, devops: good }, windows: [{ start: 20, end: 130 }], consent: true }
  ];
  const res = planGoal({ goal, people });
  assert.equal(res.status, 'SEARCH_INCOMPLETE');
  assert.equal(res.repairs.some(r => r.kind === 'HALL_CAPACITY_CONTENTION_REPAIR'), false);
  assert.equal(res.repairs.some(r => r.kind === 'SCHEDULE_HANDOFF_REPAIR'), true);
});

test('R6_EXP03 | Mixed sequential + parallel tasks isolate exact overloaded contributor and hallDeficitRoles = 1', () => {
  const goal = {
    id: 'exp03-mixed-seq-par',
    startMin: 0,
    deadlineMin: 120,
    tasks: [
      { id: 'seq-1', skill: 'devops', durationMin: 40, after: [] },
      { id: 'seq-2', skill: 'devops', durationMin: 40, after: ['seq-1'] },
      { id: 'par-a', skill: 'backend', durationMin: 100, deadlineMin: 100, after: [] },
      { id: 'par-b', skill: 'database', durationMin: 100, deadlineMin: 100, after: [] }
    ]
  };
  const people = [
    { id: 'sanjay', abilities: { devops: good }, windows: [{ start: 0, end: 120 }], consent: true },
    { id: 'aurora', abilities: { backend: good, database: good }, windows: [{ start: 0, end: 120 }], consent: true }
  ];
  const res = planGoal({ goal, people });
  const hall = res.repairs.find(r => r.kind === 'HALL_CAPACITY_CONTENTION_REPAIR');
  assert.ok(hall);
  assert.deepEqual(hall.overloadedContributors, ['aurora']);
  assert.deepEqual(hall.contendedTasks, ['par-a', 'par-b']);
  assert.equal(hall.hallDeficitRoles, 1);
});

test('R6_EXP04 | Control: genuine simultaneous parallel Hall contention reports hallDeficitRoles = 1', () => {
  const goal = {
    id: 'exp04-true-hall',
    startMin: 0,
    deadlineMin: 100,
    tasks: [
      { id: 'api', skill: 'backend', durationMin: 100, deadlineMin: 100 },
      { id: 'db', skill: 'database', durationMin: 100, deadlineMin: 100 }
    ]
  };
  const people = [
    { id: 'aurora', abilities: { backend: good, database: good }, windows: [{ start: 0, end: 100 }], consent: true }
  ];
  const res = planGoal({ goal, people });
  assert.equal(res.classification, 'INFEASIBLE_WITHIN_SCOPE');
  const hall = res.repairs.find(r => r.kind === 'HALL_CAPACITY_CONTENTION_REPAIR');
  assert.ok(hall);
  assert.equal(hall.hallDeficitRoles, 1);
});

test('R6_EXP05 | >8 wildcards prioritizes viable u9, avoids false FORALL_EXISTS_CONTINGENT, and exposes truncation metadata', () => {
  const goal = {
    id: 'exp05-nine-wildcards',
    startMin: 0,
    deadlineMin: 120,
    tasks: [{ id: 'api', skill: 'backend', durationMin: 60, deadlineMin: 60 }]
  };
  const people = [
    ...Array.from({ length: 8 }, (_, i) => ({
      id: `u${i + 1}`,
      abilities: { backend: unknown },
      windows: [{ start: 80, end: 120 }],
      consent: true
    })),
    { id: 'u9', abilities: { backend: unknown }, windows: [{ start: 0, end: 60 }], consent: true }
  ];
  const frontier = evaluateWildcardFrontier({ goal, people });
  assert.equal(frontier.quantifierStatus, 'CONDITIONAL_PARTIAL');
  assert.equal(frontier.worldsCovered, 256);
  assert.equal(frontier.omegaSize, 512);
  assert.equal(frontier.voiQuestion?.personId, 'u9');
  assert.equal(frontier.voiQuestion?.informationGainBits, 1);
  assert.equal(frontier.truncation.exceededEightWildcards, true);
  assert.equal(frontier.truncation.totalUnknowns, 9);

  // Also verify >12 all-viable wildcards set wildcardsTruncated=true and never claim FORALL_EXISTS_CONTINGENT
  const people13 = Array.from({ length: 13 }, (_, i) => ({
    id: `v${String(i + 1).padStart(2, '0')}`,
    abilities: { backend: unknown },
    windows: [{ start: 0, end: 60 }],
    consent: true
  }));
  const f13 = evaluateWildcardFrontier({ goal, people: people13 });
  assert.equal(f13.truncated, true);
  assert.equal(f13.truncation.wildcardsTruncated, true);
  assert.notEqual(f13.quantifierStatus, 'FORALL_EXISTS_CONTINGENT');
});

test('R6_EXP06 | Two viable wildcards produce exact 3/4 world coverage and 0.3113-bit Shannon VOI', () => {
  const goal = { id: 'exp06-two-unk', startMin: 0, deadlineMin: 120, tasks: [{ id: 'ui', skill: 'frontend', durationMin: 60 }] };
  const people = [
    { id: 'u1', abilities: { frontend: unknown }, windows: [{ start: 0, end: 120 }], consent: true },
    { id: 'u2', abilities: { frontend: unknown }, windows: [{ start: 0, end: 120 }], consent: true }
  ];
  const f = evaluateWildcardFrontier({ goal, people });
  assert.equal(f.omegaSize, 4);
  assert.equal(f.worldsCovered, 3);
  assert.equal(f.quantifierStatus, 'CONDITIONAL_PARTIAL');
  assert.equal(f.voiQuestion?.informationGainBits, 0.3113);
});

test('R6_EXP07 | Budget exhaustion after conditional witness reports CONDITIONAL_BUDGET_LIMITED while full budget finds ROBUST_FEASIBLE', () => {
  const goal = {
    id: 'exp07-budget-cond',
    startMin: 0,
    deadlineMin: 60,
    tasks: [
      { id: 't1', skill: 'backend', durationMin: 60 },
      { id: 't2', skill: 'frontend', durationMin: 60 },
      { id: 't3', skill: 'devops', durationMin: 60 },
      { id: 't4', skill: 'qa', durationMin: 60 }
    ]
  };
  const people = [
    { id: 'a-two', abilities: { backend: good, frontend: good }, windows: [{ start: 0, end: 60 }], consent: true },
    { id: 'b-three', abilities: { backend: good, devops: good, qa: good }, windows: [{ start: 0, end: 60 }], consent: true },
    { id: 'c-dev', abilities: { devops: good }, windows: [{ start: 0, end: 60 }], consent: true },
    { id: 'd-qa', abilities: { qa: good }, windows: [{ start: 0, end: 60 }], consent: true },
    { id: 'u-front', abilities: { frontend: unknown }, windows: [{ start: 0, end: 60 }], consent: true }
  ];
  const capped = planGoal({ goal, people, maxNodes: 5 });
  assert.equal(capped.status, 'CONDITIONAL_WITNESS');
  assert.equal(capped.classification, 'CONDITIONAL_BUDGET_LIMITED');
  assert.equal(capped.search.exhausted, true);

  const full = planGoal({ goal, people, maxNodes: 5000 });
  assert.equal(full.status, 'FEASIBLE_WITNESS');
  assert.equal(full.classification, 'ROBUST_FEASIBLE');
});

test('R6_EXP08 | Lawler/Jackson Earliest Due Date (lf) sort solves 1-person 2-task schedule where minimum-slack (ls) fails', () => {
  const goal = {
    id: 'exp08-jackson-edd',
    startMin: 0,
    deadlineMin: 100,
    tasks: [
      { id: 't-long', skill: 'backend', durationMin: 60, deadlineMin: 95 },
      { id: 't-short', skill: 'backend', durationMin: 20, deadlineMin: 58 }
    ]
  };
  const people = [{ id: 'aurora', abilities: { backend: good }, windows: [{ start: 0, end: 100 }], consent: true }];
  const res = planGoal({ goal, people });
  assert.equal(res.status, 'FEASIBLE_WITNESS');
  assert.equal(res.classification, 'ROBUST_FEASIBLE');
  const shortAsg = res.witness.assignments.find(a => a.taskId === 't-short');
  const longAsg = res.witness.assignments.find(a => a.taskId === 't-long');
  assert.deepEqual([shortAsg.startMin, shortAsg.endMin], [0, 20]);
  assert.deepEqual([longAsg.startMin, longAsg.endMin], [20, 80]);
});

test('R6_EXP09 | Ready-task & delayed event-point branching solves narrow-window downstream specialist handoff', () => {
  const goal = {
    id: 'exp09-delayed-specialist',
    startMin: 0,
    deadlineMin: 180,
    tasks: [
      { id: 'a-doc', skill: 'backend', durationMin: 50, deadlineMin: 110, after: [] },
      { id: 'b-core', skill: 'backend', durationMin: 50, deadlineMin: 180, after: [] },
      { id: 'c-deploy', skill: 'devops', durationMin: 60, deadlineMin: 180, after: ['b-core'] }
    ]
  };
  const people = [
    { id: 'aurora', abilities: { backend: good }, windows: [{ start: 0, end: 120 }], consent: true },
    { id: 'sanjay', abilities: { devops: good }, windows: [{ start: 50, end: 110 }], consent: true }
  ];
  const res = planGoal({ goal, people });
  assert.equal(res.status, 'FEASIBLE_WITNESS');
  assert.equal(res.classification, 'ROBUST_FEASIBLE');
  assert.ok(res.search.nodes <= 12);
});

test('R6_EXP10 | 100 seeded tight-deadline random DAGs match clean-room event-point schedule oracle 100%', () => {
  let seed = 42424242;
  const rand = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  const rInt = (lo, hi) => lo + Math.floor(rand() * (hi - lo + 1));
  const skills = ['backend', 'frontend', 'database', 'devops'];

  for (let run = 0; run < 100; run++) {
    const tCount = rInt(2, 4);
    const horizon = 120;
    const tasks = [];
    for (let i = 0; i < tCount; i++) {
      const dur = rInt(2, 5) * 10;
      const after = [];
      for (let j = 0; j < i; j++) {
        if (rand() < 0.35) after.push(`t${j}`);
      }
      tasks.push({
        id: `t${i}`,
        skill: skills[rInt(0, skills.length - 1)],
        durationMin: dur,
        lagMin: after.length > 0 && rand() < 0.25 ? 10 : 0,
        deadlineMin: rand() < 0.4 ? Math.max(dur + 10, rInt(50, horizon)) : horizon,
        after
      });
    }
    const pCount = rInt(1, 3);
    const people = [];
    for (let k = 0; k < pCount; k++) {
      const abilities = {};
      for (const sk of skills) {
        const u = rand();
        if (u < 0.4) abilities[sk] = good;
        else if (u < 0.55) abilities[sk] = unknown;
        else if (u < 0.65) abilities[sk] = refuted;
      }
      if (Object.keys(abilities).length === 0) abilities.backend = good;
      const s = rInt(0, 4) * 15;
      const e = Math.min(horizon, s + rInt(3, 6) * 15);
      people.push({ id: `p${k}`, abilities, windows: [{ start: s, end: Math.max(s + 20, e) }], consent: true });
    }
    const goal = { id: `fuzz-${run}`, startMin: 0, deadlineMin: horizon, tasks };
    const actual = planGoal({ goal, people, maxNodes: 5000 });
    const oracle = exactScheduleOracle(goal, people, true);
    if (oracle === 'FEASIBLE_WITNESS') {
      assert.equal(actual.status, 'FEASIBLE_WITNESS', `Missed robust witness on fuzz-${run}`);
    } else if (oracle === 'CONDITIONAL_WITNESS') {
      assert.equal(actual.status, 'CONDITIONAL_WITNESS', `Missed conditional witness on fuzz-${run}`);
    } else {
      assert.equal(actual.status, 'SEARCH_INCOMPLETE', `False positive witness on fuzz-${run}`);
    }
  }
});

test('R6_EXP11 | Merged interval-union synchronous overlap prevents multi-member double-counting and preserves asyncBatonPass', () => {
  const goal = { id: 'exp11-overlap', startMin: 0, deadlineMin: 240, tasks: [{ id: 'api', skill: 'backend', durationMin: 60 }] };
  const team = [
    { id: 'aurora', abilities: { backend: good }, windows: [{ start: 0, end: 60 }, { start: 30, end: 180 }], consent: true },
    { id: 'kai', abilities: { frontend: good }, windows: [{ start: 0, end: 60 }], consent: true },
    { id: 'noor', abilities: { design: good }, windows: [{ start: 0, end: 60 }], consent: true }
  ];
  const candidates = [
    { id: 'cand-clustered', abilities: { devops: good }, windows: [{ start: 0, end: 60 }], consent: true },
    { id: 'cand-broad-120m', abilities: { devops: good }, windows: [{ start: 60, end: 180 }], consent: true },
    { id: 'cand-baton-0m', abilities: { devops: good }, windows: [{ start: 180, end: 240 }], consent: true }
  ];
  const rec = recommendComplementary({ goal, teamPeople: team, candidates, planFn: planGoal });
  assert.equal(rec.recommendations[0].candidateId, 'cand-broad-120m');
  assert.equal(rec.recommendations[0].syncOverlapMin, 120);
  const clustered = rec.recommendations.find(r => r.candidateId === 'cand-clustered');
  const baton = rec.recommendations.find(r => r.candidateId === 'cand-baton-0m');
  assert.equal(clustered.syncOverlapMin, 60);
  assert.equal(baton.syncOverlapMin, 0);
  for (const r of rec.recommendations) {
    assert.ok(r.syncOverlapMin <= goal.deadlineMin);
    assert.equal(r.asyncBatonPass, r.assignedTasks.length > 0 && r.syncOverlapMin === 0);
  }
});

test('R6_EXP12 | Unconditional-first versatility discovery keeps planGoal and evaluateWildcardFrontier 100% consistent even at maxWitnesses = 1', () => {
  const goal = {
    id: 'exp12-consistency',
    startMin: 0,
    deadlineMin: 240,
    tasks: [
      { id: 't1', skill: 'backend', durationMin: 60 },
      { id: 't2', skill: 'frontend', durationMin: 60 },
      { id: 't3', skill: 'qa', durationMin: 10 },
      { id: 't4', skill: 'qa', durationMin: 10 },
      { id: 't5', skill: 'qa', durationMin: 10 },
      { id: 't6', skill: 'qa', durationMin: 10 }
    ]
  };
  const people = [
    { id: 'a-versatile', abilities: { backend: good, frontend: good }, windows: [{ start: 0, end: 60 }], consent: true },
    { id: 'z-specialist', abilities: { backend: good }, windows: [{ start: 0, end: 60 }], consent: true },
    { id: 'm-unknown', abilities: { frontend: unknown }, windows: [{ start: 0, end: 60 }], consent: true },
    { id: 'q1', abilities: { qa: good }, windows: [{ start: 0, end: 240 }], consent: true },
    { id: 'q2', abilities: { qa: good }, windows: [{ start: 0, end: 240 }], consent: true }
  ];
  const res = planGoal({ goal, people });
  assert.equal(res.status, 'FEASIBLE_WITNESS');
  assert.equal(res.frontier.actionStable, true);
  assert.equal(res.frontier.quantifierStatus, 'EXISTS_FORALL_ROBUST');
  assert.equal(res.frontier.voiQuestion, null);

  // Direct call with maxWitnesses = 1 still discovers the 0-guard witness first
  const directMin = evaluateWildcardFrontier({ goal, people, maxWitnesses: 1 });
  assert.equal(directMin.actionStable, true);
  assert.equal(directMin.quantifierStatus, 'EXISTS_FORALL_ROBUST');
  assert.equal(directMin.voiQuestion, null);
});

test('R6_EXP13 | Guard-set signature deduplication preserves distinct conditional candidates across QA permutations and flags maxWitnesses cap', () => {
  const goal = {
    id: 'exp13-guard-dedup',
    startMin: 0,
    deadlineMin: 240,
    tasks: [
      { id: 't1', skill: 'backend', durationMin: 60 },
      { id: 't2', skill: 'qa', durationMin: 10 },
      { id: 't3', skill: 'qa', durationMin: 10 },
      { id: 't4', skill: 'qa', durationMin: 10 },
      { id: 't5', skill: 'qa', durationMin: 10 }
    ]
  };
  const people = [
    { id: 'u1', abilities: { backend: unknown }, windows: [{ start: 0, end: 60 }], consent: true },
    { id: 'u2', abilities: { backend: unknown }, windows: [{ start: 0, end: 60 }], consent: true },
    { id: 'q1', abilities: { qa: good }, windows: [{ start: 0, end: 240 }], consent: true },
    { id: 'q2', abilities: { qa: good }, windows: [{ start: 0, end: 240 }], consent: true }
  ];
  const f = evaluateWildcardFrontier({ goal, people, maxWitnesses: 16, maxNodes: 2500 });
  assert.equal(f.worldsCovered, 3);
  assert.equal(f.omegaSize, 4);
  assert.equal(f.conditionalCount, 2);
  assert.equal(f.voiQuestion?.informationGainBits, 0.3113);
  assert.equal(f.truncated, false);

  const capped = evaluateWildcardFrontier({ goal, people, maxWitnesses: 1, maxNodes: 2500 });
  assert.equal(capped.truncated, true);
  assert.equal(capped.truncation.maxWitnessesHit, true);
});

test('R6_EXP14 | Control: 50 random DAG critical-path DP bounds & cross-event TEAM_EXISTS SQLite serialization invariants', () => {
  let seed = 99887766;
  const rand = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  for (let d = 0; d < 50; d++) {
    const n = 2 + Math.floor(rand() * 5);
    const tasks = [];
    for (let i = 0; i < n; i++) {
      const after = [];
      for (let j = 0; j < i; j++) if (rand() < 0.4) after.push(`t${j}`);
      tasks.push({
        id: `t${i}`,
        skill: 'backend',
        durationMin: 15 + Math.floor(rand() * 4) * 15,
        lagMin: after.length ? 10 : 0,
        after
      });
    }
    const goal = { id: `dp-${d}`, startMin: 0, deadlineMin: 400, tasks };
    const { metaById } = computeTaskScheduleMeta(goal);
    for (const t of tasks) {
      const m = metaById.get(t.id);
      assert.equal(m.earliestFinishMin - m.earliestStartMin, t.durationMin);
      assert.equal(m.latestFinishMin - m.latestStartMin, t.durationMin);
      for (const dep of t.after) {
        assert.ok(m.earliestStartMin >= metaById.get(dep).earliestFinishMin + (t.lagMin || 0));
      }
    }
  }

  const auth = new MembershipAuthority(':memory:');
  try {
    auth.createEvent('ev-a', 4);
    auth.createEvent('ev-b', 4);
    auth.createTeam({ eventId: 'ev-a', teamId: 'shared-id', actorId: 'lead-1' });
    assert.throws(
      () => auth.createTeam({ eventId: 'ev-b', teamId: 'shared-id', actorId: 'lead-2' }),
      /TEAM_EXISTS/
    );
    assert.deepEqual(auth.invariants('ev-a'), { oversize: 0, orphanLeader: 0, eventMismatch: 0 });
    assert.deepEqual(auth.invariants('ev-b'), { oversize: 0, orphanLeader: 0, eventMismatch: 0 });
  } finally {
    auth.close();
  }
});
