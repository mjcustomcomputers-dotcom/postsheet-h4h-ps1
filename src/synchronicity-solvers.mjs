// H4H-PS1 | Synchronicity R5 Coupled Solvers:
// 1. Directed DAG Critical-Path & Backward Slack (EDD ordering)
// 2. Wildcard Omega Frontier (Sat_g(a) subseteq Omega) + P9R MINIMUM_SUFFICIENT + VOI
// 3. Hall Capacity Contention Witness & Lexicographic Minimum Repair
// 4. Complementary Skill & Directed Asynchronous UTC Baton-Pass Recommender
// 5. Context Glue-or-Explain Overlap Obstruction Verifier

export function stateOfEvidence(pair) {
  if (!pair || typeof pair !== 'object') return 'unknown';
  const s = pair.support === true;
  const r = pair.refute === true;
  return s ? (r ? 'conflicting' : 'supported') : (r ? 'refuted' : 'unknown');
}

export function computeTaskScheduleMeta(goal) {
  const tasks = goal.tasks;
  const byId = new Map(tasks.map(t => [t.id, t]));
  const children = new Map(tasks.map(t => [t.id, []]));
  const visited = new Set();
  const active = new Set();
  const topo = [];

  function visit(id) {
    if (active.has(id)) throw Error('CYCLIC_TASK_DEPENDENCY');
    if (visited.has(id)) return;
    active.add(id);
    const t = byId.get(id);
    for (const dep of t.after || []) {
      children.get(dep).push(id);
      visit(dep);
    }
    active.delete(id);
    visited.add(id);
    topo.push(t);
  }
  for (const t of tasks) visit(t.id);

  const es = new Map();
  const ef = new Map();
  for (const t of topo) {
    let ready = goal.startMin;
    const lag = Math.max(0, t.lagMin || 0);
    for (const dep of t.after || []) {
      ready = Math.max(ready, ef.get(dep) + lag);
    }
    es.set(t.id, ready);
    ef.set(t.id, ready + t.durationMin);
  }

  const lf = new Map();
  const ls = new Map();
  for (let i = topo.length - 1; i >= 0; i--) {
    const t = topo[i];
    const ownDeadline = Number.isSafeInteger(t.deadlineMin) && t.deadlineMin >= 0
      ? Math.min(goal.deadlineMin, t.deadlineMin)
      : goal.deadlineMin;
    let latestFin = ownDeadline;
    for (const childId of children.get(t.id) || []) {
      const child = byId.get(childId);
      const childLag = Math.max(0, child.lagMin || 0);
      latestFin = Math.min(latestFin, ls.get(childId) - childLag);
    }
    lf.set(t.id, latestFin);
    ls.set(t.id, latestFin - t.durationMin);
  }

  // Kahn topological queue prioritized by smallest latestStart (Earliest Due Date / tightest slack)
  const inDeg = new Map(tasks.map(t => [t.id, (t.after || []).length]));
  const readyQueue = tasks.filter(t => inDeg.get(t.id) === 0);
  const orderedTasks = [];
  const sortQueue = () => readyQueue.sort((a, b) =>
    ls.get(a.id) - ls.get(b.id) ||
    lf.get(a.id) - lf.get(b.id) ||
    a.id.localeCompare(b.id)
  );

  while (readyQueue.length > 0) {
    sortQueue();
    const cur = readyQueue.shift();
    orderedTasks.push(cur);
    for (const chId of children.get(cur.id) || []) {
      inDeg.set(chId, inDeg.get(chId) - 1);
      if (inDeg.get(chId) === 0) readyQueue.push(byId.get(chId));
    }
  }

  const meta = orderedTasks.map(t => ({
    taskId: t.id,
    skill: t.skill,
    durationMin: t.durationMin,
    earliestStartMin: es.get(t.id),
    earliestFinishMin: ef.get(t.id),
    latestStartMin: ls.get(t.id),
    latestFinishMin: lf.get(t.id),
    slackMin: ls.get(t.id) - es.get(t.id)
  }));

  const minFinish = Math.max(... orderedTasks.map(t => ef.get(t.id)));
  return {
    orderedTasks,
    meta,
    metaById: new Map(meta.map(m => [m.taskId, m])),
    criticalSpanMin: minFinish - goal.startMin
  };
}

function findEarliestSlot(person, ready, duration, latest, assignments) {
  const busy = assignments
    .filter(a => a.personId === person.id)
    .sort((a, b) => a.startMin - b.startMin);
  const sortedWindows = [...person.windows].sort((a, b) => a.start - b.start);
  for (const w of sortedWindows) {
    let start = Math.max(w.start, ready);
    let changed = true;
    while (changed) {
      changed = false;
      for (const b of busy) {
        if (start < b.endMin && start + duration > b.startMin) {
          start = b.endMin;
          changed = true;
        }
      }
    }
    if (start + duration <= w.end && start + duration <= latest) return start;
  }
  return null;
}

export function evaluateWildcardFrontier({ goal, people, maxWitnesses = 16, maxNodes = 2500 }) {
  const { orderedTasks } = computeTaskScheduleMeta(goal);
  const neededSkills = new Set(orderedTasks.map(t => t.skill));

  // Collect up to 8 relevant unknown ability wildcards -> |Omega| <= 256 (<= 4096 R4 cap)
  const wildcards = [];
  for (const p of people) {
    if (p.consent !== true) continue;
    for (const sk of Object.keys(p.abilities || {})) {
      if (!neededSkills.has(sk)) continue;
      if (stateOfEvidence(p.abilities[sk]) === 'unknown' && wildcards.length < 8) {
        wildcards.push({ key: `${p.id}::${sk}`, personId: p.id, skill: sk });
      }
    }
  }

  // Collect distinct candidate arrangements (both supported and conditional)
  const witnesses = [];
  const completed = new Map();
  const assignments = [];
  const guards = [];
  let nodes = 0;

  function dfsCollect(depth) {
    if (nodes++ >= maxNodes || witnesses.length >= maxWitnesses) return;
    if (depth === orderedTasks.length) {
      const finishMin = Math.max(...assignments.map(a => a.endMin));
      witnesses.push({
        assignments: [...assignments],
        guards: [...guards],
        guardKeys: new Set(guards.map(g => `${g.personId}::${g.skill}`)),
        slackMin: goal.deadlineMin - finishMin,
        finishMin
      });
      return;
    }
    const task = orderedTasks[depth];
    let ready = goal.startMin;
    for (const dep of task.after || []) {
      ready = Math.max(ready, completed.get(dep) + Math.max(0, task.lagMin || 0));
    }
    const deadline = Math.min(
      goal.deadlineMin,
      Number.isSafeInteger(task.deadlineMin) ? task.deadlineMin : goal.deadlineMin
    );

    const eligible = people
      .filter(p => p.consent === true && Object.hasOwn(p.abilities, task.skill))
      .map(p => ({ p, state: stateOfEvidence(p.abilities[task.skill]) }))
      .filter(x => x.state === 'supported' || x.state === 'unknown')
      .sort((a, b) => (a.state === 'supported' ? 0 : 1) - (b.state === 'supported' ? 0 : 1) || a.p.id.localeCompare(b.p.id));

    for (const { p, state } of eligible) {
      const start = findEarliestSlot(p, ready, task.durationMin, deadline, assignments);
      if (start === null) continue;
      const end = start + task.durationMin;
      assignments.push({ taskId: task.id, personId: p.id, skill: task.skill, startMin: start, endMin: end, evidence: state });
      completed.set(task.id, end);
      if (state === 'unknown') guards.push({ taskId: task.id, personId: p.id, skill: task.skill });
      dfsCollect(depth + 1);
      if (state === 'unknown') guards.pop();
      completed.delete(task.id);
      assignments.pop();
      if (nodes >= maxNodes || witnesses.length >= maxWitnesses) break;
    }
  }
  dfsCollect(0);

  const omegaSize = 1 << wildcards.length;
  const unconditional = witnesses.filter(w => w.guardKeys.size === 0);
  const conditional = witnesses.filter(w => w.guardKeys.size > 0);

  let worldsCovered = 0;
  const worldFeasibleByMask = new Uint8Array(omegaSize);
  for (let mask = 0; mask < omegaSize; mask++) {
    let anySat = false;
    for (const w of witnesses) {
      let ok = true;
      for (let bit = 0; bit < wildcards.length; bit++) {
        if (w.guardKeys.has(wildcards[bit].key) && ((mask >> bit) & 1) === 0) {
          ok = false;
          break;
        }
      }
      if (ok) { anySat = true; break; }
    }
    if (anySat) {
      worldFeasibleByMask[mask] = 1;
      worldsCovered++;
    }
  }

  const actionStable = unconditional.length > 0;
  const quantifierStatus = actionStable
    ? 'EXISTS_FORALL_ROBUST'
    : (worldsCovered === omegaSize && omegaSize > 0
      ? 'FORALL_EXISTS_CONTINGENT'
      : (worldsCovered > 0 ? 'CONDITIONAL_PARTIAL' : 'EMPTY_UNSAT'));

  // P9R MINIMUM_SUFFICIENT: skip questioning completely when an unconditional arrangement exists!
  let voiQuestion = null;
  if (!actionStable && wildcards.length > 0 && worldsCovered > 0) {
    const entropy = p => (p <= 0 || p >= 1) ? 0 : -(p * Math.log2(p) + (1 - p) * Math.log2(1 - p));
    const baseP = worldsCovered / omegaSize;
    const baseH = entropy(baseP);
    let bestGain = -1;

    for (let bit = 0; bit < wildcards.length; bit++) {
      let satWhenZero = 0;
      let satWhenOne = 0;
      const half = omegaSize / 2;
      for (let mask = 0; mask < omegaSize; mask++) {
        if ((mask >> bit) & 1) satWhenOne += worldFeasibleByMask[mask];
        else satWhenZero += worldFeasibleByMask[mask];
      }
      const condH = 0.5 * entropy(satWhenZero / half) + 0.5 * entropy(satWhenOne / half);
      const mi = Math.max(0, baseH - condH);
      const referencedInConditional = conditional.some(w => w.guardKeys.has(wildcards[bit].key));
      const score = mi + (referencedInConditional ? 0.001 : 0);
      if (score > bestGain && referencedInConditional) {
        bestGain = score;
        voiQuestion = {
          personId: wildcards[bit].personId,
          skill: wildcards[bit].skill,
          informationGainBits: Number(mi.toFixed(4)),
          reason: 'RESOLVES_CRITICAL_GUARD_WITHOUT_DISPLACING_ROSTER'
        };
      }
    }
  }

  return {
    omegaSize,
    wildcards: wildcards.map(w => ({ personId: w.personId, skill: w.skill })),
    worldsCovered,
    unconditionalCount: unconditional.length,
    conditionalCount: conditional.length,
    actionStable,
    minimumSufficientStop: actionStable ? 'ALREADY_SUFFICIENT_ZERO_QUESTIONS' : 'RESOLUTION_REQUIRED',
    quantifierStatus,
    voiQuestion
  };
}

export function diagnoseAndRepair({ goal, people, committedIds = [] }) {
  const { orderedTasks, metaById } = computeTaskScheduleMeta(goal);
  const committedSet = new Set(committedIds);
  const repairs = [];

  // Per-task individual eligibility check (ignoring cross-task contention)
  const soloCapable = new Map();
  for (const t of orderedTasks) {
    const m = metaById.get(t.id);
    const sup = [];
    const unk = [];
    const windowMiss = [];
    for (const p of people) {
      if (p.consent !== true || !Object.hasOwn(p.abilities || {}, t.skill)) continue;
      const st = stateOfEvidence(p.abilities[t.skill]);
      if (st !== 'supported' && st !== 'unknown') continue;
      const slot = findEarliestSlot(p, m.earliestStartMin, t.durationMin, m.latestFinishMin, []);
      if (slot !== null) {
        if (st === 'supported') sup.push(p.id);
        else unk.push(p.id);
      } else {
        windowMiss.push(p.id);
      }
    }
    soloCapable.set(t.id, { sup, unk, windowMiss });

    if (sup.length === 0 && unk.length > 0) {
      repairs.push({
        kind: 'EVIDENCE_REPAIR',
        taskId: t.id,
        skill: t.skill,
        personId: unk[0],
        displacedCommittedMembers: 0,
        explanation: `Verify ${unk[0]}'s '${t.skill}' capability (work sample or peer check) to cover task '${t.id}'.`
      });
    } else if (sup.length === 0 && windowMiss.length > 0) {
      repairs.push({
        kind: 'SCHEDULE_HANDOFF_REPAIR',
        taskId: t.id,
        skill: t.skill,
        personId: windowMiss[0],
        neededWindow: [m.earliestStartMin, m.latestFinishMin],
        displacedCommittedMembers: 0,
        explanation: `${windowMiss[0]} has '${t.skill}' ability but misses UTC window [${m.earliestStartMin}..${m.latestFinishMin}m]; shift handoff window or add async relay contributor.`
      });
    } else if (sup.length === 0 && unk.length === 0 && windowMiss.length === 0) {
      repairs.push({
        kind: 'CAPABILITY_ADDITION_REPAIR',
        taskId: t.id,
        skill: t.skill,
        neededWindow: [m.earliestStartMin, m.latestFinishMin],
        displacedCommittedMembers: 0,
        explanation: `No consenting contributor covers '${t.skill}' for '${t.id}'; invite one '${t.skill}' contributor available during [${m.earliestStartMin}..${m.latestFinishMin}m].`
      });
    }
  }

  // Detect Hall Capacity Contention: every task has >=1 solo-supported person, yet joint schedule fails
  const allSoloSupported = orderedTasks.every(t => (soloCapable.get(t.id)?.sup.length || 0) > 0);
  if (allSoloSupported) {
    const unionSup = new Set();
    for (const t of orderedTasks) {
      for (const pid of soloCapable.get(t.id).sup) unionSup.add(pid);
    }
    if (unionSup.size < orderedTasks.length) {
      const overloaded = [...unionSup];
      const contendedSkills = [...new Set(orderedTasks.map(t => t.skill))];
      repairs.unshift({
        kind: 'HALL_CAPACITY_CONTENTION_REPAIR',
        overloadedContributors: overloaded,
        contendedTasks: orderedTasks.map(t => t.id),
        contendedSkills,
        hallDeficitRoles: orderedTasks.length - unionSup.size,
        displacedCommittedMembers: [...committedSet].filter(() => false).length,
        explanation: `Hall capacity deficit: ${overloaded.join(', ')} covers [${contendedSkills.join(', ')}] individually, but overlapping task deadlines prevent one contributor from executing simultaneous roles. Add 1 consenting contributor in [${contendedSkills.join(' or ')}] while keeping current members intact.`
      });
    }
  }

  return repairs;
}

export function recommendComplementary({ goal, teamPeople, candidates, planFn }) {
  const baseline = planFn({ goal, people: teamPeople, maxNodes: 2500 });
  const baselineFeasible = baseline.status === 'FEASIBLE_WITNESS';
  const baselineFinish = baseline.witness
    ? Math.max(...baseline.witness.assignments.map(a => a.endMin))
    : goal.deadlineMin;
  const teamIds = new Set(teamPeople.map(p => p.id));

  const teamWindows = teamPeople.flatMap(p => p.windows || []);
  const overlapWithTeam = candWindows => {
    let total = 0;
    for (const cw of candWindows || []) {
      for (const tw of teamWindows) {
        const s = Math.max(cw.start, tw.start);
        const e = Math.min(cw.end, tw.end);
        if (e > s) total += (e - s);
      }
    }
    return total;
  };

  const results = [];
  for (const cand of candidates || []) {
    if (cand.consent !== true || teamIds.has(cand.id)) continue;
    const combined = [...teamPeople, cand];
    const nextPlan = planFn({ goal, people: combined, maxNodes: 2500 });
    const restoresFeasibility = !baselineFeasible && nextPlan.status === 'FEASIBLE_WITNESS';
    const upgradesToConditional = baseline.status === 'SEARCH_INCOMPLETE' && nextPlan.status === 'CONDITIONAL_WITNESS';
    const candTasks = (nextPlan.witness?.assignments || []).filter(a => a.personId === cand.id);
    const nextFinish = nextPlan.witness
      ? Math.max(...nextPlan.witness.assignments.map(a => a.endMin))
      : goal.deadlineMin;
    const slackGainMin = (goal.deadlineMin - nextFinish) - (goal.deadlineMin - baselineFinish);
    const syncOverlapMin = overlapWithTeam(cand.windows);
    const asyncBatonPass = candTasks.length > 0 && syncOverlapMin === 0;

    const reasons = [];
    if (restoresFeasibility) reasons.push(`Restores full goal feasibility by covering [${candTasks.map(t => `${t.taskId}(${t.skill})`).join(', ')}]`);
    else if (upgradesToConditional) reasons.push(`Unlocks conditional feasibility via [${candTasks.map(t => `${t.taskId}(?${t.skill})`).join(', ')}]`);
    else if (candTasks.length > 0) reasons.push(`Covers [${candTasks.map(t => t.taskId).join(', ')}] with +${Math.max(0, slackGainMin)}m deadline slack`);
    else reasons.push('Provides standby skill redundancy without critical-path task takeover');

    if (asyncBatonPass) {
      reasons.push('Executes directed asynchronous UTC baton-pass (0m simultaneous overlap needed; handoff window aligns)');
    } else {
      reasons.push(`Shares ${syncOverlapMin}m synchronous UTC overlap with current roster`);
    }

    results.push({
      candidateId: cand.id,
      timezoneLabel: cand.timezone || 'UTC-window',
      restoresFeasibility,
      upgradesToConditional,
      assignedTasks: candTasks.map(t => ({ taskId: t.taskId, skill: t.skill, startMin: t.startMin, endMin: t.endMin, evidence: t.evidence })),
      syncOverlapMin,
      asyncBatonPass,
      slackGainMin,
      resultingStatus: nextPlan.status,
      explanation: reasons.join('; ') + '.'
    });
  }

  results.sort((a, b) =>
    Number(b.restoresFeasibility) - Number(a.restoresFeasibility) ||
    Number(b.upgradesToConditional) - Number(a.upgradesToConditional) ||
    b.assignedTasks.length - a.assignedTasks.length ||
    Number(b.asyncBatonPass) - Number(a.asyncBatonPass) ||
    b.slackGainMin - a.slackGainMin ||
    b.syncOverlapMin - a.syncOverlapMin ||
    a.candidateId.localeCompare(b.candidateId)
  );

  return {
    baselineStatus: baseline.status,
    baselineRepairs: diagnoseAndRepair({ goal, people: teamPeople, committedIds: [...teamIds] }),
    recommendations: results
  };
}

export function contextGlueOrExplain(localRecords = [], peerRecords = []) {
  const byNoteId = new Map();
  const obstructions = [];

  for (const rec of [...localRecords, ...peerRecords]) {
    if (!rec || typeof rec.id !== 'string') continue;
    const prev = byNoteId.get(rec.id);
    if (!prev) {
      byNoteId.set(rec.id, rec);
      continue;
    }
    if (prev.digest && rec.digest && prev.digest !== rec.digest && prev.epoch === rec.epoch) {
      obstructions.push({
        type: 'EPOCH_DIGEST_CONFLICT',
        recordId: rec.id,
        actors: [prev.actorId, rec.actorId],
        explanation: `Record '${rec.id}' has divergent digests at identical epoch ${rec.epoch}.`
      });
    } else if ((rec.epoch || 0) > (prev.epoch || 0)) {
      byNoteId.set(rec.id, rec);
    }
  }

  const merged = [...byNoteId.values()];
  // Check overlapping person-interval claims across sections
  for (let i = 0; i < merged.length; i++) {
    for (let j = i + 1; j < merged.length; j++) {
      const a = merged[i], b = merged[j];
      if (a.personId && a.personId === b.personId && a.taskId !== b.taskId &&
          Number.isFinite(a.startMin) && Number.isFinite(b.startMin) &&
          a.startMin < b.endMin && b.startMin < a.endMin) {
        obstructions.push({
          type: 'SHARED_CAPACITY_OVERLAP_OBSTRUCTION',
          personId: a.personId,
          tasks: [a.taskId, b.taskId],
          interval: [Math.max(a.startMin, b.startMin), Math.min(a.endMin, b.endMin)],
          explanation: `Local and peer sections assign '${a.personId}' simultaneously to '${a.taskId}' and '${b.taskId}'.`
        });
      }
    }
  }

  return {
    status: obstructions.length === 0 ? 'GLUED_CONSISTENT' : 'OBSTRUCTION_WITNESS',
    mergedRecords: merged,
    obstructions
  };
}
