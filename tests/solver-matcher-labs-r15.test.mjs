import test from 'node:test';
import assert from 'node:assert/strict';
import { planGoal } from '../src/goal-planner.mjs';
import {
  stateOfEvidence,
  mergeIntervals,
  maxSchedulableTaskSubset,
  evaluateWildcardFrontier,
  diagnoseAndRepair,
  recommendComplementary
} from '../src/synchronicity-solvers.mjs';
import { startServer, issueToken } from '../src/server.mjs';
import {
  MISSION_SCENARIOS,
  BUILDER_DIRECTORY,
  normalizeBuilderId,
  computePartialTaskPreview,
  visualTasksToApi,
  visualPeopleToApi,
  saveCustomCrewOverlayEntry,
  loadCustomCrewOverlay,
  reconstructSeatedTeamPeople,
  mergeCandidatePoolWithDirectory
} from '../web/src/presets-and-catalog.js';
import { derivePlanExportModel } from '../web/src/charter-whitepaper.js';

const good = { support: true, refute: false };
const unknown = { support: false, refute: false };

function makePrng(seed = 20261115) {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

/**
 * Zero-pruning brute-force world-enumeration oracle over all 2^m unknown pairs.
 */
function bruteForceWorldOracle(goal, people) {
  const neededSkills = new Set(goal.tasks.map(t => t.skill));
  const unknowns = [];
  for (const p of people) {
    if (p.consent !== true) continue;
    for (const sk of Object.keys(p.abilities || {})) {
      if (!neededSkills.has(sk)) continue;
      if (stateOfEvidence(p.abilities[sk]) === 'unknown') {
        unknowns.push({ key: `${p.id}::${sk}`, personId: p.id, skill: sk });
      }
    }
  }
  unknowns.sort((a, b) => a.key.localeCompare(b.key));
  const omegaSize = 1 << unknowns.length;

  function exactSupportedSolve(worldPeople) {
    const scheduled = new Map();
    let solved = false;

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

    function dfs() {
      if (solved) return;
      if (scheduled.size === goal.tasks.length) {
        solved = true;
        return;
      }
      const readyTasks = goal.tasks.filter(
        t => !scheduled.has(t.id) && (t.after || []).every(d => scheduled.has(d))
      );
      for (const t of readyTasks) {
        let ready = goal.startMin;
        const lag = Math.max(0, t.lagMin || 0);
        for (const d of t.after || []) ready = Math.max(ready, scheduled.get(d).endMin + lag);
        const due = Number.isSafeInteger(t.deadlineMin)
          ? Math.min(goal.deadlineMin, t.deadlineMin)
          : goal.deadlineMin;
        for (const p of worldPeople) {
          if (p.consent !== true || !Object.hasOwn(p.abilities || {}, t.skill)) continue;
          if (stateOfEvidence(p.abilities[t.skill]) !== 'supported') continue;
          for (const s of startsFor(p, ready, t.durationMin, due)) {
            scheduled.set(t.id, { taskId: t.id, personId: p.id, startMin: s, endMin: s + t.durationMin });
            dfs();
            scheduled.delete(t.id);
            if (solved) return;
          }
        }
      }
    }

    dfs();
    return solved;
  }

  let worldsCovered = 0;
  const worldMask = new Uint8Array(omegaSize);
  for (let mask = 0; mask < omegaSize; mask++) {
    const worldPeople = people.map(p => {
      const nextAbilities = {};
      for (const [sk, val] of Object.entries(p.abilities || {})) {
        const bitIdx = unknowns.findIndex(u => u.personId === p.id && u.skill === sk);
        if (bitIdx >= 0) {
          nextAbilities[sk] = (mask >> bitIdx) & 1 ? good : { support: false, refute: true };
        } else {
          nextAbilities[sk] = val;
        }
      }
      return { ...p, abilities: nextAbilities };
    });
    if (exactSupportedSolve(worldPeople)) {
      worldMask[mask] = 1;
      worldsCovered++;
    }
  }

  const unconditional = worldMask[0] === 1;
  const quantifierStatus = unconditional
    ? 'EXISTS_FORALL_ROBUST'
    : worldsCovered === omegaSize && omegaSize > 0
      ? 'FORALL_EXISTS_CONTINGENT'
      : worldsCovered > 0
        ? 'CONDITIONAL_PARTIAL'
        : 'EMPTY_UNSAT';

  let maxMi = 0;
  if (!unconditional && unknowns.length > 0 && worldsCovered > 0) {
    const entropy = p => (p <= 0 || p >= 1 ? 0 : -(p * Math.log2(p) + (1 - p) * Math.log2(1 - p)));
    const baseH = entropy(worldsCovered / omegaSize);
    const half = omegaSize / 2;
    for (let bit = 0; bit < unknowns.length; bit++) {
      let s0 = 0;
      let s1 = 0;
      for (let mask = 0; mask < omegaSize; mask++) {
        if ((mask >> bit) & 1) s1 += worldMask[mask];
        else s0 += worldMask[mask];
      }
      const mi = Math.max(0, baseH - (0.5 * entropy(s0 / half) + 0.5 * entropy(s1 / half)));
      if (mi > maxMi) maxMi = mi;
    }
  }

  return {
    omegaSize,
    worldsCovered,
    quantifierStatus,
    maxInformationGainBits: Number(maxMi.toFixed(4))
  };
}

test('LAB01_multi_hole_stepwise_assembly | 30 multi-hole 3..5-task missions assemble monotonically from 1 founder to FEASIBLE_WITNESS', () => {
  const rand = makePrng(15012026);
  const skillsPool = ['backend', 'frontend', 'database', 'devops', 'integrate'];

  for (let trial = 0; trial < 30; trial++) {
    const k = 3 + (trial % 3); // 3, 4, or 5 tasks
    const chosenSkills = skillsPool.slice(0, k);
    const horizon = 480;
    const tasks = [];

    for (let i = 0; i < k; i++) {
      const sk = chosenSkills[i];
      const isLateBaton = i === k - 1;
      const deps = isLateBaton
        ? tasks.slice(0, Math.min(2, i)).map(t => t.id)
        : i === 2 && rand() > 0.5
          ? [tasks[0].id]
          : [];
      tasks.push({
        id: `m${trial}-t${i + 1}`,
        skill: sk,
        durationMin: isLateBaton ? 90 : 60 + (i % 2) * 30,
        lagMin: isLateBaton ? 15 : 0,
        after: deps
      });
    }

    const goal = {
      id: `lab01-goal-${trial}`,
      startMin: 0,
      deadlineMin: horizon,
      tasks
    };

    const founder = {
      id: 'aurora-founder',
      timezone: 'UTC-6',
      abilities: { [chosenSkills[0]]: good },
      windows: [{ start: 0, end: 240 }],
      consent: true
    };

    const candidates = [];
    for (let i = 1; i < k; i++) {
      const sk = chosenSkills[i];
      const isLateBaton = i === k - 1;
      candidates.push({
        id: isLateBaton ? `baton-${sk}-${trial}` : `spec-${sk}-${trial}`,
        timezone: isLateBaton ? 'UTC+5:30' : 'UTC-6',
        abilities: { [sk]: good },
        windows: [isLateBaton ? { start: 240, end: 480 } : { start: 0, end: 240 }],
        consent: true
      });
    }
    // Add redundant decoys who only duplicate founder's skill or unrequested skill
    candidates.push({
      id: `decoy-dup-${trial}`,
      timezone: 'UTC-6',
      abilities: { [chosenSkills[0]]: good },
      windows: [{ start: 0, end: 240 }],
      consent: true
    });
    candidates.push({
      id: `decoy-unused-${trial}`,
      timezone: 'UTC+1',
      abilities: { design: good },
      windows: [{ start: 120, end: 360 }],
      consent: true
    });

    let roster = [founder];
    let pool = [...candidates];
    let prevSupported = maxSchedulableTaskSubset(goal, roster).supportedCount;
    assert.equal(prevSupported, 1, `trial ${trial}: founder starts at 1/${k}`);

    for (let step = 1; step < k; step++) {
      const recOut = recommendComplementary({
        goal,
        teamPeople: roster,
        candidates: pool,
        planFn: planGoal
      });
      assert.ok(recOut.recommendations.length > 0);
      const top = recOut.recommendations[0];

      // Never mislabel a critical missing-skill contributor as standby redundancy
      assert.ok(
        !top.explanation.includes('standby skill redundancy'),
        `trial ${trial} step ${step}: unexpected standby label: ${top.explanation}`
      );

      if (step < k - 1) {
        assert.equal(top.advancesPartialPlan, true, `trial ${trial} step ${step}: expected advancesPartialPlan=true`);
        assert.ok(top.supportedTaskGain >= 1);
        assert.ok(top.assignedTasks.length >= 1);
      } else {
        assert.equal(top.restoresFeasibility, true, `trial ${trial} final step: expected restoresFeasibility=true`);
      }

      const picked = pool.find(c => c.id === top.candidateId);
      assert.ok(picked);
      roster = [...roster, picked];
      pool = pool.filter(c => c.id !== top.candidateId);

      const nowSub = maxSchedulableTaskSubset(goal, roster);
      assert.ok(
        nowSub.supportedCount > prevSupported,
        `trial ${trial} step ${step}: expected monotonic coverage ${nowSub.supportedCount} > ${prevSupported}`
      );
      prevSupported = nowSub.supportedCount;
    }

    const finalPlan = planGoal({ goal, people: roster });
    assert.equal(finalPlan.status, 'FEASIBLE_WITNESS');
    assert.equal(finalPlan.witness.assignments.length, k);
  }
});

test('LAB02_higher_order_hall_3_and_4_way | 3-task/2-person and 4-task/3-person parallel Hall deficits emit HALL_CAPACITY_CONTENTION_REPAIR', () => {
  // Case A: 3 parallel 60m tasks in [0..60m] with 2 omniskilled contributors -> every pair (2 tasks) is solvable!
  const goal3 = {
    id: 'hall-3-way',
    startMin: 0,
    deadlineMin: 60,
    tasks: [
      { id: 't1', skill: 'backend', durationMin: 60, after: [] },
      { id: 't2', skill: 'frontend', durationMin: 60, after: [] },
      { id: 't3', skill: 'database', durationMin: 60, after: [] }
    ]
  };
  const people2 = [
    { id: 'p1', abilities: { backend: good, frontend: good, database: good }, windows: [{ start: 0, end: 60 }], consent: true },
    { id: 'p2', abilities: { backend: good, frontend: good, database: good }, windows: [{ start: 0, end: 60 }], consent: true }
  ];
  const rep3 = diagnoseAndRepair({ goal: goal3, people: people2 });
  assert.equal(rep3[0]?.kind, 'HALL_CAPACITY_CONTENTION_REPAIR');
  assert.equal(rep3[0]?.hallDeficitRoles, 1);
  assert.deepEqual(rep3[0]?.contendedTasks, ['t1', 't2', 't3']);
  assert.ok(!rep3.some(r => String(r.explanation).includes('Sequential dependency chain')));

  // Case B: 4 parallel 60m tasks in [0..60m] with 2 omniskilled contributors -> hallDeficitRoles = 2 (4 - 2)
  const goal4By2 = {
    id: 'hall-4-by-2',
    startMin: 0,
    deadlineMin: 60,
    tasks: [
      { id: 'q1', skill: 'backend', durationMin: 60, after: [] },
      { id: 'q2', skill: 'frontend', durationMin: 60, after: [] },
      { id: 'q3', skill: 'database', durationMin: 60, after: [] },
      { id: 'q4', skill: 'devops', durationMin: 60, after: [] }
    ]
  };
  const people2All = [
    { id: 'p1', abilities: { backend: good, frontend: good, database: good, devops: good }, windows: [{ start: 0, end: 60 }], consent: true },
    { id: 'p2', abilities: { backend: good, frontend: good, database: good, devops: good }, windows: [{ start: 0, end: 60 }], consent: true }
  ];
  const rep4By2 = diagnoseAndRepair({ goal: goal4By2, people: people2All });
  assert.equal(rep4By2[0]?.kind, 'HALL_CAPACITY_CONTENTION_REPAIR');
  assert.equal(rep4By2[0]?.hallDeficitRoles, 2);

  // Case C: 4 parallel 60m tasks in [0..60m] with 3 omniskilled contributors -> every pair & triple<=3 is solvable, k=4 fails!
  const people3All = [
    ...people2All,
    { id: 'p3', abilities: { backend: good, frontend: good, database: good, devops: good }, windows: [{ start: 0, end: 60 }], consent: true }
  ];
  const rep4By3 = diagnoseAndRepair({ goal: goal4By2, people: people3All });
  assert.equal(rep4By3[0]?.kind, 'HALL_CAPACITY_CONTENTION_REPAIR');
  assert.equal(rep4By3[0]?.hallDeficitRoles, 1);
  assert.deepEqual(rep4By3[0]?.contendedTasks, ['q1', 'q2', 'q3', 'q4']);

  // Case D: True sequential chain still emits SCHEDULE_HANDOFF_REPAIR with sequential explanation
  const seqGoal = {
    id: 'true-seq-chain',
    startMin: 0,
    deadlineMin: 140,
    tasks: [
      { id: 's1', skill: 'backend', durationMin: 60, after: [] },
      { id: 's2', skill: 'devops', durationMin: 60, after: ['s1'] }
    ]
  };
  const seqPeople = [
    { id: 'aurora', abilities: { backend: good, devops: good }, windows: [{ start: 20, end: 130 }], consent: true }
  ];
  const repSeq = diagnoseAndRepair({ goal: seqGoal, people: seqPeople });
  assert.equal(repSeq.length, 1);
  assert.equal(repSeq[0].kind, 'SCHEDULE_HANDOFF_REPAIR');
  assert.ok(repSeq[0].explanation.includes('Sequential dependency chain'));
});

test('LAB03_delayed_window_wildcard_frontier_oracle | 40 delayed-window & multi-ready-task unknown guard DAGs match 2^m brute-force oracle', () => {
  // Targeted adversarial delayed-window guard DAG that previously broke under rIdx/sIdx pruning:
  // a-doc (backend 40m, lf=90) and b-core (backend 40m, lf=120) both ready at t=0;
  // c-int (integrate 40m, after:['b-core']) has u1@early [40..80] (requires b-core FIRST!) and u2@late [80..120].
  const adversarialGoal = {
    id: 'delayed-frontier-guard-dag',
    startMin: 0,
    deadlineMin: 120,
    tasks: [
      { id: 'a-doc', skill: 'backend', durationMin: 40, deadlineMin: 90, after: [] },
      { id: 'b-core', skill: 'backend', durationMin: 40, deadlineMin: 120, after: [] },
      { id: 'c-int', skill: 'integrate', durationMin: 40, deadlineMin: 120, after: ['b-core'] }
    ]
  };
  const adversarialPeople = [
    { id: 'aurora', abilities: { backend: good }, windows: [{ start: 0, end: 120 }], consent: true },
    { id: 'u1-early', abilities: { integrate: unknown }, windows: [{ start: 40, end: 80 }], consent: true },
    { id: 'u2-late', abilities: { integrate: unknown }, windows: [{ start: 80, end: 120 }], consent: true }
  ];
  const advFrontier = evaluateWildcardFrontier({ goal: adversarialGoal, people: adversarialPeople, maxNodes: 4000 });
  const advOracle = bruteForceWorldOracle(adversarialGoal, adversarialPeople);
  assert.equal(advFrontier.omegaSize, 4);
  assert.equal(advFrontier.worldsCovered, 3, 'both u1-early (via b-core first) and u2-late must be discovered');
  assert.equal(advFrontier.worldsCovered, advOracle.worldsCovered);
  assert.equal(advFrontier.quantifierStatus, advOracle.quantifierStatus);
  assert.equal(advFrontier.voiQuestion.informationGainBits, advOracle.maxInformationGainBits);

  // 39 additional seeded random delayed-window / multi-ready-task DAGs with 2..4 unknowns
  const rand = makePrng(99152026);
  const skills = ['backend', 'frontend', 'integrate'];
  for (let i = 0; i < 39; i++) {
    const horizon = 120;
    const taskCount = 3;
    const tasks = [];
    for (let t = 0; t < taskCount; t++) {
      const sk = skills[t % skills.length];
      const dur = 30 + (Math.floor(rand() * 2) * 10);
      const after = t === 2 && rand() > 0.25 ? [tasks[Math.floor(rand() * 2)].id] : [];
      const dl = t === 0 && rand() > 0.4 ? 80 + Math.floor(rand() * 3) * 10 : horizon;
      tasks.push({ id: `t${t + 1}`, skill: sk, durationMin: dur, deadlineMin: dl, after });
    }
    const goal = { id: `lab03-${i}`, startMin: 0, deadlineMin: horizon, tasks };

    const people = [
      {
        id: 'sup-base',
        abilities: { backend: good },
        windows: [{ start: 0, end: horizon }],
        consent: true
      }
    ];
    const unkCount = 2 + (i % 3); // 2, 3, or 4 unknowns
    for (let u = 0; u < unkCount; u++) {
      const sk = skills[1 + (u % 2)];
      const wStart = Math.floor(rand() * 5) * 15;
      const wEnd = Math.min(horizon, wStart + 45 + Math.floor(rand() * 3) * 15);
      people.push({
        id: `unk-${u + 1}`,
        abilities: { [sk]: unknown },
        windows: [{ start: wStart, end: wEnd }],
        consent: true
      });
    }

    const frontier = evaluateWildcardFrontier({ goal, people, maxNodes: 4000, maxWitnesses: 64 });
    const oracle = bruteForceWorldOracle(goal, people);

    assert.equal(frontier.omegaSize, oracle.omegaSize, `case ${i}: omegaSize`);
    assert.equal(frontier.worldsCovered, oracle.worldsCovered, `case ${i}: worldsCovered`);
    assert.equal(frontier.quantifierStatus, oracle.quantifierStatus, `case ${i}: quantifierStatus`);
    if (oracle.worldsCovered > 0 && oracle.quantifierStatus !== 'EXISTS_FORALL_ROBUST') {
      assert.ok(frontier.voiQuestion, `case ${i}: expected voiQuestion`);
      assert.equal(
        frontier.voiQuestion.informationGainBits,
        oracle.maxInformationGainBits,
        `case ${i}: informationGainBits`
      );
    }
  }
});

test('LAB04_partial_preview_and_ui_solver_parity | computePartialTaskPreview, visualTasksToApi, derivePlanExportModel & planGoal align on Jackson lf & versatility', () => {
  // 1) Jackson lf ordering: t-long (dur 60, deadline 95 -> ls=35, lf=95) vs t-short (dur 20, deadline 58 -> ls=38, lf=58)
  // Plus a 3rd uncovered task (integrate) so plan.witness is null and computePartialTaskPreview runs its own scheduler!
  const visualTasks = [
    { id: 't-long', title: 'Long Backend', skill: 'backend', durationMin: 60, deadlineMin: 95, after: [] },
    { id: 't-short', title: 'Urgent Short Backend', skill: 'backend', durationMin: 20, deadlineMin: 58, after: [] },
    { id: 't-missing', title: 'Uncovered Integration', skill: 'integrate', durationMin: 30, after: ['t-short'] }
  ];
  const visualTeam = [
    { id: 'aurora', timezone: 'UTC-6', startMin: 0, endMin: 100, skills: { backend: 'supported' } }
  ];

  const apiTasks = visualTasksToApi(visualTasks);
  assert.equal(apiTasks[0].deadlineMin, 95);
  assert.equal(apiTasks[1].deadlineMin, 58);

  const apiPeople = visualPeopleToApi(visualTeam, 100);
  const sub = maxSchedulableTaskSubset({ id: 'g', startMin: 0, deadlineMin: 100, tasks: apiTasks }, apiPeople);
  assert.equal(sub.supportedCount, 2, 'Jackson lf order schedules t-short [0..20] then t-long [20..80]');

  const previewMap = computePartialTaskPreview(visualTasks, visualTeam, 100, null);
  assert.equal(previewMap.size, 2, 'computePartialTaskPreview must also cover both t-short and t-long');
  assert.equal(previewMap.get('t-short').startMin, 0);
  assert.equal(previewMap.get('t-long').startMin, 20);

  // 2) Specialist-first versatility in computePartialTaskPreview & derivePlanExportModel:
  // 'aurora' has {backend, frontend}, 'kai' has {frontend} only. On [ui(frontend), api(backend)] in [0..60m] + missing integrate,
  // specialist 'kai' MUST take 'ui' so versatile 'aurora' remains free to cover 'api'!
  const versTasks = [
    { id: 'ui', skill: 'frontend', durationMin: 60, deadlineMin: 60, after: [] },
    { id: 'api', skill: 'backend', durationMin: 60, deadlineMin: 60, after: [] },
    { id: 'e2e', skill: 'integrate', durationMin: 30, after: ['ui', 'api'] }
  ];
  const versTeam = [
    { id: 'aurora', timezone: 'UTC-6', startMin: 0, endMin: 60, skills: { backend: 'supported', frontend: 'supported' } },
    { id: 'kai', timezone: 'UTC-6', startMin: 0, endMin: 60, skills: { frontend: 'supported' } }
  ];
  const versPreview = computePartialTaskPreview(versTasks, versTeam, 120, null);
  assert.equal(versPreview.get('ui')?.personId, 'kai');
  assert.equal(versPreview.get('api')?.personId, 'aurora');

  const exportModel = derivePlanExportModel({
    eventId: 'seed-event',
    teamId: 'plan-preview',
    allowServerTeamBinding: false,
    goalDescription: 'Versatility export check',
    horizonHours: 2,
    tasks: versTasks,
    teamPeople: versTeam,
    plan: { status: 'SEARCH_INCOMPLETE', classification: 'INFEASIBLE_WITHIN_SCOPE', witness: null, criticalPath: [] }
  });
  const uiRow = exportModel.scheduleRows.find(r => r.taskId === 'ui');
  const apiRow = exportModel.scheduleRows.find(r => r.taskId === 'api');
  assert.ok(uiRow.assignee.includes('kai'));
  assert.ok(apiRow.assignee.includes('aurora'));
});

test('LAB05_directory_completeness_and_roundtrip | 100% of scenario people exist in BUILDER_DIRECTORY and custom crew round-trip reconstructs tasks & seated roster', () => {
  const dirIds = new Set(BUILDER_DIRECTORY.map(b => normalizeBuilderId(b.plannerId || b.id)));
  for (const [scKey, sc] of Object.entries(MISSION_SCENARIOS)) {
    const pools = [sc.teamPeople || [], sc.robustTeamPeople || [], sc.candidates || []];
    for (const pool of pools) {
      for (const person of pool) {
        const cid = normalizeBuilderId(person.id);
        assert.ok(dirIds.has(cid), `scenario '${scKey}' person '${person.id}' (${cid}) missing from BUILDER_DIRECTORY`);
      }
    }
  }

  // Merge directory candidate pool check: solo [aurora] gets all remaining directory builders
  const mergedPool = mergeCandidatePoolWithDirectory(
    [{ id: 'aurora', startMin: 0, endMin: 240, skills: { backend: 'supported' } }],
    [],
    480
  );
  assert.equal(mergedPool.length, BUILDER_DIRECTORY.length - 1);
  assert.ok(mergedPool.some(c => c.id === 'devon'));
  assert.ok(mergedPool.some(c => c.id === 'liam'));

  // Custom overlay persistence + seated server member reconstruction round-trip
  const customTasks = [
    { id: 'custom-api', skill: 'backend', durationMin: 75, lagMin: 0, after: [] },
    { id: 'custom-ops', skill: 'devops', durationMin: 45, lagMin: 10, after: ['custom-api'] }
  ];
  const customTeam = [
    { id: 'aurora', timezone: 'UTC-6 · Hot Springs', startMin: 0, endMin: 240, skills: { backend: 'supported' } },
    { id: 'sanjay-steward', timezone: 'UTC+0 · London', startMin: 0, endMin: 180, skills: { devops: 'supported' } }
  ];
  saveCustomCrewOverlayEntry('seed-event', '00-custom-lab05', {
    mission: 'Round-trip custom crew check',
    skills: ['backend', 'devops'],
    scenarioKey: 'prereq',
    horizonHours: 6,
    tasks: customTasks,
    teamPeople: customTeam
  });

  const loadedMap = loadCustomCrewOverlay();
  const saved = loadedMap['seed-event::00-custom-lab05'];
  assert.ok(saved);
  assert.equal(saved.horizonHours, 6);
  assert.equal(saved.tasks.length, 2);
  assert.equal(saved.tasks[1].id, 'custom-ops');

  // Simulate seated server members including a newly joined 3rd teammate ('priya-claim-991a')
  const serverMembers = [
    { userId: 'aurora-plan-12ab', isLeader: true },
    { userId: 'mem-sanjay-12ab0', isLeader: false },
    { userId: 'priya-claim-991a', isLeader: false }
  ];
  const reconstructed = reconstructSeatedTeamPeople(serverMembers, saved.teamPeople, 360);
  assert.deepEqual(
    reconstructed.map(p => p.id),
    ['aurora', 'sanjay-steward', 'priya']
  );
});

test('LAB06_full_http_recommendations_multi_hole | POST /api/recommendations on solo [aurora] 3-task baton goal returns advancesPartialPlan=true for Kai & Priya', async () => {
  const secret = 'r15-solver-matcher-labs-http-secret-32bytes!!';
  const app = startServer({ secret, dbPath: ':memory:', port: 0, host: '127.0.0.1' });
  const addr = await app.listen();
  const base = `http://127.0.0.1:${addr.port}`;
  try {
    const tok = issueToken('leader-aurora', secret);
    const sc = MISSION_SCENARIOS.baton;
    const horizonMin = sc.horizonHours * 60;
    const soloAurora = visualPeopleToApi([sc.teamPeople[0]], horizonMin);
    const dirCands = visualPeopleToApi(
      mergeCandidatePoolWithDirectory([sc.teamPeople[0]], sc.candidates, horizonMin),
      horizonMin
    );

    const res = await fetch(`${base}/api/recommendations`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${tok}`
      },
      body: JSON.stringify({
        goal: {
          id: 'baton-solo-founder',
          startMin: 0,
          deadlineMin: horizonMin,
          tasks: visualTasksToApi(sc.tasks)
        },
        teamPeople: soloAurora,
        candidates: dirCands
      })
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.baselineStatus, 'SEARCH_INCOMPLETE');

    const byId = new Map(body.recommendations.map(r => [r.candidateId, r]));
    const kaiRec = byId.get('kai');
    const priyaRec = byId.get('priya');

    assert.ok(kaiRec, 'kai must be ranked in recommendations');
    assert.equal(kaiRec.advancesPartialPlan, true);
    assert.ok(kaiRec.assignedTasks.some(t => t.taskId === 'ui'));
    assert.ok(kaiRec.explanation.includes('Advances schedule from 1/3 to 2/3 tasks'));

    assert.ok(priyaRec, 'priya must be ranked in recommendations');
    assert.equal(priyaRec.advancesPartialPlan, true);
    assert.equal(priyaRec.asyncBatonPass, true);
    assert.equal(priyaRec.syncOverlapMin, 0);
    assert.ok(priyaRec.assignedTasks.some(t => t.taskId === 'integration'));
    assert.ok(
      priyaRec.explanation.includes('Advances schedule from 1/3 to 2/3 tasks by covering [integration(integrate)]'),
      `expected baton advance explanation, got: ${priyaRec.explanation}`
    );

    // Top 2 recommendations on solo [aurora] 3-task baton goal must advance the partial plan (never standby decoys)
    assert.equal(body.recommendations[0].advancesPartialPlan, true);
    assert.equal(body.recommendations[1].advancesPartialPlan, true);
    const parallelBatonRes = await fetch(`${base}/api/recommendations`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${tok}`
      },
      body: JSON.stringify({
        goal: {
          id: 'baton-multi-hole-handoff',
          startMin: 0,
          deadlineMin: 480,
          tasks: [
            { id: 'api', skill: 'backend', durationMin: 120, after: [] },
            { id: 'ui', skill: 'frontend', durationMin: 180, after: [] },
            { id: 'integration', skill: 'integrate', durationMin: 90, lagMin: 15, after: ['api'] }
          ]
        },
        teamPeople: soloAurora,
        candidates: dirCands
      })
    });
    assert.equal(parallelBatonRes.status, 200);
    const pBody = await parallelBatonRes.json();
    const pById = new Map(pBody.recommendations.map(r => [r.candidateId, r]));
    const pPriya = pById.get('priya');
    const pKai = pById.get('kai');
    assert.ok(pPriya && pKai);
    assert.equal(pPriya.advancesPartialPlan, true);
    assert.equal(pPriya.asyncBatonPass, true);
    assert.equal(pPriya.syncOverlapMin, 0);
    assert.ok(pPriya.assignedTasks.some(t => t.taskId === 'integration'));
    assert.ok(pPriya.explanation.includes('Advances schedule from 1/3 to 2/3 tasks by covering [integration(integrate)]'));
    assert.equal(pKai.advancesPartialPlan, true);
    assert.ok(pKai.assignedTasks.some(t => t.taskId === 'ui'));
  } finally {
    await app.close();
  }
});
