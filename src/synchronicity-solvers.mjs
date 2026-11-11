// H4H-PS1 | Synchronicity R5/R12 Coupled Solvers:
// 1. Directed DAG Critical-Path & Backward Slack (Lawler/Jackson EDD ordering)
// 2. Wildcard Omega Frontier (Sat_g(a) subseteq Omega) + P9R MINIMUM_SUFFICIENT + VOI
// 3. Hall Capacity Contention Witness (Parallel-Only) & Lexicographic Minimum Repair
// 4. Complementary Skill & Directed Asynchronous UTC Baton-Pass Recommender (Interval-Union Overlap)
// 5. Context Glue-or-Explain Overlap Obstruction Verifier

export function stateOfEvidence(pair) {
  if (!pair || typeof pair !== 'object') return 'unknown';
  const s = pair.support === true;
  const r = pair.refute === true;
  return s ? (r ? 'conflicting' : 'supported') : (r ? 'refuted' : 'unknown');
}

export function mergeIntervals(intervals) {
  if (!Array.isArray(intervals) || intervals.length === 0) return [];
  const sorted = intervals
    .filter(w => Number.isFinite(w.start) && Number.isFinite(w.end) && w.end > w.start)
    .map(w => ({ start: w.start, end: w.end }))
    .sort((a, b) => a.start - b.start || a.end - b.end);
  if (sorted.length === 0) return [];
  const out = [sorted[0]];
  for (let i = 1; i < sorted.length; i++) {
    const last = out[out.length - 1];
    if (sorted[i].start <= last.end) last.end = Math.max(last.end, sorted[i].end);
    else out.push({ ...sorted[i] });
  }
  return out;
}

export function candidateEventStarts(person, ready, duration, latest, assignments) {
  const windows = mergeIntervals(person.windows || []);
  const busy = assignments
    .filter(a => a.personId === person.id)
    .sort((a, b) => a.startMin - b.startMin);

  const rawPoints = new Set();
  for (const w of windows) {
    if (w.end - w.start < duration) continue;
    const base = Math.max(w.start, ready);
    if (base + duration <= w.end && base + duration <= latest) rawPoints.add(base);
    for (const b of busy) {
      const s = Math.max(w.start, ready, b.endMin);
      if (s + duration <= w.end && s + duration <= latest) rawPoints.add(s);
    }
  }

  const valid = [];
  for (const s of [...rawPoints].sort((a, b) => a - b)) {
    const e = s + duration;
    if (e > latest) continue;
    if (!windows.some(w => s >= w.start && e <= w.end)) continue;
    if (busy.some(b => s < b.endMin && e > b.startMin)) continue;
    valid.push(s);
  }
  return valid;
}

export function computeTaskScheduleMeta(goal) {
  const tasks = goal.tasks;
  const byId = new Map(tasks.map(t => [t.id, t]));
  const children = new Map(tasks.map(t => [t.id, []]));
  const ancestors = new Map(tasks.map(t => [t.id, new Set()]));
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
      ancestors.get(id).add(dep);
      for (const anc of ancestors.get(dep)) ancestors.get(id).add(anc);
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

  // Kahn topological queue prioritized by Lawler/Jackson Earliest Due Date (lf), then latestStart (ls)
  const inDeg = new Map(tasks.map(t => [t.id, (t.after || []).length]));
  const readyQueue = tasks.filter(t => inDeg.get(t.id) === 0);
  const orderedTasks = [];
  const sortQueue = () => readyQueue.sort((a, b) =>
    lf.get(a.id) - lf.get(b.id) ||
    ls.get(a.id) - ls.get(b.id) ||
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

  const minFinish = Math.max(...orderedTasks.map(t => ef.get(t.id)));
  return {
    orderedTasks,
    ancestors,
    meta,
    metaById: new Map(meta.map(m => [m.taskId, m])),
    criticalSpanMin: minFinish - goal.startMin
  };
}

export function maxSchedulableTaskSubset(goal, people, maxNodes = 800) {
  const { orderedTasks, metaById } = computeTaskScheduleMeta(goal);
  const goalSkillSet = new Set(orderedTasks.map(t => t.skill));
  const consenting = (people || []).filter(p => p && p.consent === true);
  if (orderedTasks.length === 0 || consenting.length === 0) {
    return { supportedCount: 0, coveredCount: 0, assignments: [] };
  }

  const versatility = new Map(
    consenting.map(p => [
      p.id,
      Object.keys(p.abilities || {}).filter(
        sk => goalSkillSet.has(sk) && stateOfEvidence(p.abilities[sk]) === 'supported'
      ).length
    ])
  );

  function solveMaxSubset(allowUnknown) {
    let best = [];
    let bestSupCount = -1;
    let bestFinish = Infinity;
    let nodes = 0;
    const completed = new Map();
    const current = [];
    const visited = new Set();

    function dfs(idx) {
      if (nodes++ >= maxNodes) return;
      const curSup = current.reduce((acc, a) => acc + (a.evidence === 'supported' ? 1 : 0), 0);
      const curFin = current.length > 0 ? Math.max(...current.map(a => a.endMin)) : 0;
      if (
        current.length > best.length ||
        (current.length === best.length && curSup > bestSupCount) ||
        (current.length === best.length && curSup === bestSupCount && curFin < bestFinish)
      ) {
        best = [...current];
        bestSupCount = curSup;
        bestFinish = curFin;
      }
      if (best.length === orderedTasks.length && (!allowUnknown || bestSupCount === orderedTasks.length)) {
        return;
      }
      if (idx >= orderedTasks.length) return;
      if (current.length + (orderedTasks.length - idx) < best.length) return;

      const sig = `${idx}|` + current
        .map(a => `${a.taskId}@${a.personId}:${a.startMin}-${a.endMin}:${a.evidence[0]}`)
        .sort()
        .join(';');
      if (visited.has(sig)) return;
      visited.add(sig);

      const task = orderedTasks[idx];
      const deps = task.after || [];
      let ready = goal.startMin;
      const lag = Math.max(0, task.lagMin || 0);
      for (const dep of deps) {
        const depEnd = completed.has(dep)
          ? completed.get(dep)
          : (metaById.get(dep)?.earliestFinishMin ?? goal.startMin);
        ready = Math.max(ready, depEnd + lag);
      }

      const deadline = Math.min(
        goal.deadlineMin,
        Number.isSafeInteger(task.deadlineMin) && task.deadlineMin >= 0
          ? task.deadlineMin
          : goal.deadlineMin
      );
      const eligible = consenting
        .filter(p => Object.hasOwn(p.abilities || {}, task.skill))
        .map(p => ({ p, state: stateOfEvidence(p.abilities[task.skill]) }))
        .filter(x => x.state === 'supported' || (allowUnknown && x.state === 'unknown'))
        .sort(
          (a, b) =>
            (a.state === 'supported' ? 0 : 1) - (b.state === 'supported' ? 0 : 1) ||
            (versatility.get(a.p.id) || 0) - (versatility.get(b.p.id) || 0) ||
            a.p.id.localeCompare(b.p.id)
        );

      for (const { p, state } of eligible) {
        const starts = candidateEventStarts(p, ready, task.durationMin, deadline, current);
        for (const start of starts) {
          const end = start + task.durationMin;
          current.push({
            taskId: task.id,
            personId: p.id,
            skill: task.skill,
            startMin: start,
            endMin: end,
            evidence: state
          });
          completed.set(task.id, end);
          dfs(idx + 1);
          completed.delete(task.id);
          current.pop();
          if (nodes >= maxNodes) return;
          if (best.length === orderedTasks.length && (!allowUnknown || bestSupCount === orderedTasks.length)) {
            return;
          }
        }
      }

      // Option to leave `task` uncovered so independent parallel/downstream tasks can still be scheduled
      dfs(idx + 1);
    }

    dfs(0);
    return best;
  }

  const supBest = solveMaxSubset(false);
  const covBest = solveMaxSubset(true);
  const chosen = covBest.length > supBest.length ? covBest : supBest;
  return {
    supportedCount: supBest.length,
    coveredCount: Math.max(supBest.length, covBest.length),
    assignments: chosen
  };
}

function findSupportedWitness(goal, people, maxNodes = 1500) {
  const { orderedTasks } = computeTaskScheduleMeta(goal);
  const goalSkillSet = new Set(orderedTasks.map(t => t.skill));
  const versatility = new Map(
    people.map(p => [
      p.id,
      Object.keys(p.abilities || {}).filter(
        sk => goalSkillSet.has(sk) && stateOfEvidence(p.abilities[sk]) === 'supported'
      ).length
    ])
  );

  const completed = new Map();
  const assignments = [];
  const visitedStates = new Set();
  let nodes = 0;

  function stateSig() {
    return assignments
      .map(a => `${a.taskId}@${a.personId}:${a.startMin}-${a.endMin}`)
      .sort()
      .join(';');
  }

  function dfs() {
    if (nodes++ >= maxNodes) return null;
    if (completed.size === orderedTasks.length) {
      return { assignments: [...assignments], guards: [] };
    }
    const sig = stateSig();
    if (visitedStates.has(sig)) return null;
    visitedStates.add(sig);

    const readyTasks = orderedTasks.filter(
      t => !completed.has(t.id) && (t.after || []).every(dep => completed.has(dep))
    );

    for (const task of readyTasks) {
      let ready = goal.startMin;
      for (const dep of task.after || []) {
        ready = Math.max(ready, completed.get(dep) + Math.max(0, task.lagMin || 0));
      }
      const deadline = Math.min(
        goal.deadlineMin,
        Number.isSafeInteger(task.deadlineMin) && task.deadlineMin >= 0 ? task.deadlineMin : goal.deadlineMin
      );
      const supportedCandidates = people
        .filter(
          p =>
            p.consent === true &&
            Object.hasOwn(p.abilities || {}, task.skill) &&
            stateOfEvidence(p.abilities[task.skill]) === 'supported'
        )
        .sort(
          (a, b) =>
            (versatility.get(a.id) || 0) - (versatility.get(b.id) || 0) ||
            a.id.localeCompare(b.id)
        );
      if (supportedCandidates.length === 0) return null;

      for (const p of supportedCandidates) {
        const starts = candidateEventStarts(p, ready, task.durationMin, deadline, assignments);
        for (const start of starts) {
          const end = start + task.durationMin;
          assignments.push({
            taskId: task.id,
            personId: p.id,
            skill: task.skill,
            startMin: start,
            endMin: end,
            evidence: 'supported'
          });
          completed.set(task.id, end);
          const hit = dfs();
          if (hit) return hit;
          completed.delete(task.id);
          assignments.pop();
          if (nodes >= maxNodes) return null;
        }
      }
    }
    return null;
  }

  return dfs();
}

export function evaluateWildcardFrontier({
  goal,
  people,
  maxWitnesses = 64,
  maxNodes = 2500,
  knownRobustWitness = null
}) {
  const { orderedTasks, metaById } = computeTaskScheduleMeta(goal);
  const neededSkills = new Set(orderedTasks.map(t => t.skill));

  const versatility = new Map(
    people.map(p => [
      p.id,
      Object.keys(p.abilities || {}).filter(
        sk => neededSkills.has(sk) && stateOfEvidence(p.abilities[sk]) === 'supported'
      ).length
    ])
  );

  // Collect all consenting unknown ability pairs on neededSkills, prioritizing window-viable pairs first
  const allUnknowns = [];
  for (const p of people) {
    if (p.consent !== true) continue;
    for (const sk of Object.keys(p.abilities || {})) {
      if (!neededSkills.has(sk)) continue;
      if (stateOfEvidence(p.abilities[sk]) === 'unknown') {
        const viable = orderedTasks.some(t => {
          if (t.skill !== sk) return false;
          const m = metaById.get(t.id);
          return candidateEventStarts(p, m.earliestStartMin, t.durationMin, m.latestFinishMin, []).length > 0;
        });
        allUnknowns.push({ key: `${p.id}::${sk}`, personId: p.id, skill: sk, viable });
      }
    }
  }
  allUnknowns.sort((a, b) => Number(b.viable) - Number(a.viable) || a.key.localeCompare(b.key));
  const MAX_OMEGA_BITS = 12; // |Omega| <= 4096 R4/R12 bound
  const wildcards = allUnknowns.slice(0, MAX_OMEGA_BITS);
  const wildcardKeySet = new Set(wildcards.map(w => w.key));
  const wildcardsTruncated = allUnknowns.length > MAX_OMEGA_BITS;
  const exceededEightWildcards = allUnknowns.length > 8;

  const witnesses = [];
  const seenGuardSigs = new Set();

  // Unconditional-first (0-guard, specialist versatility-ordered) witness discovery so maxWitnesses cap never misses EXISTS_FORALL_ROBUST
  const robustSeed =
    knownRobustWitness || findSupportedWitness(goal, people, Math.min(800, Math.max(16, maxNodes)));
  if (robustSeed && Array.isArray(robustSeed.assignments) && robustSeed.assignments.length === orderedTasks.length) {
    const finishMin = Math.max(...robustSeed.assignments.map(a => a.endMin));
    witnesses.push({
      assignments: [...robustSeed.assignments],
      guards: [],
      guardKeys: new Set(),
      slackMin: goal.deadlineMin - finishMin,
      finishMin
    });
    seenGuardSigs.add('');
  }

  const completed = new Map();
  const assignments = [];
  const guards = [];
  const visitedFrontierStates = new Set();
  let nodes = 0;
  let nodesExhausted = false;
  let maxWitnessesHit = false;

  function frontierStateSig() {
    const asgPart = assignments
      .map(a => `${a.taskId}@${a.personId}:${a.startMin}-${a.endMin}`)
      .sort()
      .join(';');
    const guardPart = [...new Set(guards.map(g => `${g.personId}::${g.skill}`))]
      .sort()
      .join('|');
    return `${asgPart}#${guardPart}`;
  }

  function dfsCollect() {
    if (witnesses.length >= maxWitnesses) {
      maxWitnessesHit = true;
      return false;
    }
    if (nodes++ >= maxNodes) {
      nodesExhausted = true;
      return false;
    }
    if (completed.size === orderedTasks.length) {
      const guardKeys = new Set(guards.map(g => `${g.personId}::${g.skill}`));
      const sig = [...guardKeys].sort().join('|');
      if (!seenGuardSigs.has(sig)) {
        if (witnesses.length >= maxWitnesses) {
          maxWitnessesHit = true;
          return true;
        }
        seenGuardSigs.add(sig);
        const finishMin = Math.max(...assignments.map(a => a.endMin));
        witnesses.push({
          assignments: [...assignments],
          guards: [...guards],
          guardKeys,
          slackMin: goal.deadlineMin - finishMin,
          finishMin
        });
      }
      return true;
    }

    const stateKey = frontierStateSig();
    if (visitedFrontierStates.has(stateKey)) {
      return false;
    }
    visitedFrontierStates.add(stateKey);

    const readyTasks = orderedTasks.filter(
      t => !completed.has(t.id) && (t.after || []).every(dep => completed.has(dep))
    );

    let anyCompleteUnderReady = false;
    for (let rIdx = 0; rIdx < readyTasks.length; rIdx++) {
      const task = readyTasks[rIdx];
      let ready = goal.startMin;
      for (const dep of task.after || []) {
        ready = Math.max(ready, completed.get(dep) + Math.max(0, task.lagMin || 0));
      }
      const deadline = Math.min(
        goal.deadlineMin,
        Number.isSafeInteger(task.deadlineMin) && task.deadlineMin >= 0 ? task.deadlineMin : goal.deadlineMin
      );

      const eligible = people
        .filter(p => p.consent === true && Object.hasOwn(p.abilities || {}, task.skill))
        .map(p => ({ p, state: stateOfEvidence(p.abilities[task.skill]) }))
        .filter(x => x.state === 'supported' || x.state === 'unknown')
        .sort(
          (a, b) =>
            (a.state === 'supported' ? 0 : 1) - (b.state === 'supported' ? 0 : 1) ||
            (versatility.get(a.p.id) || 0) - (versatility.get(b.p.id) || 0) ||
            a.p.id.localeCompare(b.p.id)
        );

      for (const { p, state } of eligible) {
        const starts = candidateEventStarts(p, ready, task.durationMin, deadline, assignments);
        for (let sIdx = 0; sIdx < starts.length; sIdx++) {
          const start = starts[sIdx];
          const end = start + task.durationMin;
          assignments.push({
            taskId: task.id,
            personId: p.id,
            skill: task.skill,
            startMin: start,
            endMin: end,
            evidence: state
          });
          completed.set(task.id, end);
          if (state === 'unknown') guards.push({ taskId: task.id, personId: p.id, skill: task.skill });
          if (dfsCollect()) {
            anyCompleteUnderReady = true;
          }
          if (state === 'unknown') guards.pop();
          completed.delete(task.id);
          assignments.pop();
          if (nodesExhausted || maxWitnessesHit) break;
        }
        if (nodesExhausted || maxWitnessesHit) break;
      }
      if (nodesExhausted || maxWitnessesHit) break;
    }
    return anyCompleteUnderReady;
  }

  if (witnesses.length < maxWitnesses) {
    dfsCollect();
  }

  const omegaSize = 1 << wildcards.length;
  const unconditional = witnesses.filter(w => w.guardKeys.size === 0);
  const conditional = witnesses.filter(w => w.guardKeys.size > 0);
  const truncated = Boolean(wildcardsTruncated || maxWitnessesHit || nodesExhausted);

  let worldsCovered = 0;
  const worldFeasibleByMask = new Uint8Array(omegaSize);
  for (let mask = 0; mask < omegaSize; mask++) {
    let anySat = false;
    for (const w of witnesses) {
      let hasUnindexedGuard = false;
      for (const gk of w.guardKeys) {
        if (!wildcardKeySet.has(gk)) {
          hasUnindexedGuard = true;
          break;
        }
      }
      if (hasUnindexedGuard) continue;

      let ok = true;
      for (let bit = 0; bit < wildcards.length; bit++) {
        if (w.guardKeys.has(wildcards[bit].key) && ((mask >> bit) & 1) === 0) {
          ok = false;
          break;
        }
      }
      if (ok) {
        anySat = true;
        break;
      }
    }
    if (anySat) {
      worldFeasibleByMask[mask] = 1;
      worldsCovered++;
    }
  }

  const actionStable = unconditional.length > 0;
  const quantifierStatus = actionStable
    ? 'EXISTS_FORALL_ROBUST'
    : worldsCovered === omegaSize && omegaSize > 0
      ? 'FORALL_EXISTS_CONTINGENT'
      : worldsCovered > 0
        ? 'CONDITIONAL_PARTIAL'
        : truncated
          ? 'SEARCH_TRUNCATED'
          : 'EMPTY_UNSAT';

  // P9R MINIMUM_SUFFICIENT: skip questioning completely when an unconditional arrangement exists
  let voiQuestion = null;
  if (!actionStable && wildcards.length > 0 && worldsCovered > 0) {
    const entropy = p => (p <= 0 || p >= 1 ? 0 : -(p * Math.log2(p) + (1 - p) * Math.log2(1 - p)));
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
    truncated,
    truncation: {
      wildcardsTruncated,
      exceededEightWildcards,
      totalUnknowns: allUnknowns.length,
      indexedWildcards: wildcards.length,
      maxWitnesses,
      maxWitnessesHit,
      maxNodes,
      nodesExhausted
    },
    minimumSufficientStop: actionStable ? 'ALREADY_SUFFICIENT_ZERO_QUESTIONS' : 'RESOLUTION_REQUIRED',
    quantifierStatus,
    voiQuestion
  };
}

export function diagnoseAndRepair({ goal, people, committedIds = [], alreadyFeasible = false }) {
  if (alreadyFeasible) return [];
  if (findSupportedWitness(goal, people, 1500)) return [];

  const { orderedTasks, ancestors, metaById } = computeTaskScheduleMeta(goal);
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
      const starts = candidateEventStarts(p, m.earliestStartMin, t.durationMin, m.latestFinishMin, []);
      if (starts.length > 0) {
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

  // Separate concurrent parallel Hall contention from sequential dependency window shifts
  const allSoloSupported = orderedTasks.every(t => (soloCapable.get(t.id)?.sup.length || 0) > 0);
  if (allSoloSupported && orderedTasks.length > 1) {
    const contendedTaskIds = new Set();
    const overloadedIds = new Set();

    for (let i = 0; i < orderedTasks.length; i++) {
      for (let j = i + 1; j < orderedTasks.length; j++) {
        const ta = orderedTasks[i];
        const tb = orderedTasks[j];
        // Strictly sequential tasks (ta -> tb or tb -> ta) cannot contend simultaneously for parallel roles
        if (ancestors.get(ta.id).has(tb.id) || ancestors.get(tb.id).has(ta.id)) continue;

        const subGoal = {
          id: 'pair-check',
          startMin: goal.startMin,
          deadlineMin: Math.min(
            goal.deadlineMin,
            Math.max(metaById.get(ta.id).latestFinishMin, metaById.get(tb.id).latestFinishMin)
          ),
          tasks: [
            { ...ta, after: [], deadlineMin: metaById.get(ta.id).latestFinishMin },
            { ...tb, after: [], deadlineMin: metaById.get(tb.id).latestFinishMin }
          ]
        };
        if (!findSupportedWitness(subGoal, people, 200)) {
          contendedTaskIds.add(ta.id);
          contendedTaskIds.add(tb.id);
          for (const pid of soloCapable.get(ta.id).sup) overloadedIds.add(pid);
          for (const pid of soloCapable.get(tb.id).sup) overloadedIds.add(pid);
        }
      }
    }

    // Higher-order (k >= 3) Hall marriage subset check when pairwise (k = 2) checks all pass
    // (e.g., 3 parallel 60m tasks across 2 qualified people in [0..60m]: every pair is solvable, but k=3 fails!)
    if (contendedTaskIds.size === 0 && orderedTasks.length >= 3) {
      let bestHallDeficit = 0;
      let bestHallSubset = null;
      let bestHallUnion = null;

      const totalMasks = 1 << orderedTasks.length;
      for (let mask = 0; mask < totalMasks; mask++) {
        const subset = [];
        for (let b = 0; b < orderedTasks.length; b++) {
          if ((mask >> b) & 1) subset.push(orderedTasks[b]);
        }
        if (subset.length < 3) continue;

        let mutuallyConcurrent = true;
        for (let i = 0; i < subset.length && mutuallyConcurrent; i++) {
          for (let j = i + 1; j < subset.length; j++) {
            if (
              ancestors.get(subset[i].id).has(subset[j].id) ||
              ancestors.get(subset[j].id).has(subset[i].id)
            ) {
              mutuallyConcurrent = false;
              break;
            }
          }
        }
        if (!mutuallyConcurrent) continue;

        const unionSup = new Set();
        for (const t of subset) {
          for (const pid of soloCapable.get(t.id).sup) unionSup.add(pid);
        }
        if (unionSup.size >= subset.length) continue;

        const subGoal = {
          id: 'hall-subset-check',
          startMin: goal.startMin,
          deadlineMin: Math.min(
            goal.deadlineMin,
            Math.max(...subset.map(t => metaById.get(t.id).latestFinishMin))
          ),
          tasks: subset.map(t => ({
            ...t,
            after: [],
            deadlineMin: metaById.get(t.id).latestFinishMin
          }))
        };
        if (!findSupportedWitness(subGoal, people, 250)) {
          const deficit = subset.length - unionSup.size;
          if (
            deficit > bestHallDeficit ||
            (deficit === bestHallDeficit && bestHallSubset && subset.length < bestHallSubset.length)
          ) {
            bestHallDeficit = deficit;
            bestHallSubset = subset;
            bestHallUnion = unionSup;
          }
        }
      }

      if (bestHallSubset && bestHallUnion) {
        for (const t of bestHallSubset) contendedTaskIds.add(t.id);
        for (const pid of bestHallUnion) overloadedIds.add(pid);
      }
    }

    if (contendedTaskIds.size > 0 && overloadedIds.size < contendedTaskIds.size) {
      const contendedList = orderedTasks.filter(t => contendedTaskIds.has(t.id));
      const contendedSkills = [...new Set(contendedList.map(t => t.skill))];
      const overloaded = [...overloadedIds];
      const deficit = contendedList.length - overloaded.length;
      repairs.unshift({
        kind: 'HALL_CAPACITY_CONTENTION_REPAIR',
        overloadedContributors: overloaded,
        contendedTasks: contendedList.map(t => t.id),
        contendedSkills,
        hallDeficitRoles: deficit,
        displacedCommittedMembers: [...committedSet].filter(() => false).length,
        explanation: `Hall capacity deficit: ${overloaded.join(', ')} covers [${contendedSkills.join(', ')}] individually, but overlapping task deadlines prevent ${overloaded.length === 1 ? 'one contributor' : `${overloaded.length} contributors`} from executing ${contendedList.length} simultaneous roles. Add ${deficit} consenting contributor in [${contendedSkills.join(' or ')}] while keeping current members intact.`
      });
    } else {
      const hasDependencyChain = orderedTasks.some(t => (t.after || []).length > 0);
      const lastTask = orderedTasks[orderedTasks.length - 1];
      const mLast = metaById.get(lastTask.id);
      repairs.push({
        kind: 'SCHEDULE_HANDOFF_REPAIR',
        taskId: lastTask.id,
        skill: lastTask.skill,
        personId: soloCapable.get(lastTask.id).sup[0],
        neededWindow: [mLast.earliestStartMin, mLast.latestFinishMin],
        displacedCommittedMembers: 0,
        explanation: hasDependencyChain
          ? `Sequential dependency chain shifts '${lastTask.id}' past available contributor window; extend availability to [${mLast.earliestStartMin}..${mLast.latestFinishMin}m] or add a late-window '${lastTask.skill}' handoff contributor.`
          : `Cumulative task durations exceed available contributor window before [${mLast.earliestStartMin}..${mLast.latestFinishMin}m]; extend availability or add a '${lastTask.skill}' contributor.`
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
  const totalGoalTasks = Array.isArray(goal.tasks) ? goal.tasks.length : 0;
  const basePartial = !baselineFeasible ? maxSchedulableTaskSubset(goal, teamPeople) : null;

  // Merged interval-union wall-clock overlap guarantees syncOverlapMin <= horizonMin and preserves asyncBatonPass
  const mergedTeamWindows = mergeIntervals(teamPeople.flatMap(p => p.windows || []));
  const overlapWithTeam = candWindows => {
    const mergedCand = mergeIntervals(candWindows || []);
    let total = 0;
    for (const cw of mergedCand) {
      for (const tw of mergedTeamWindows) {
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

    let candTasks = (nextPlan.witness?.assignments || []).filter(a => a.personId === cand.id);
    let partialTaskGain = 0;
    let supportedTaskGain = 0;
    let nextPartial = null;

    if (restoresFeasibility && basePartial) {
      partialTaskGain = Math.max(0, totalGoalTasks - basePartial.coveredCount);
      supportedTaskGain = Math.max(0, totalGoalTasks - basePartial.supportedCount);
    } else if (upgradesToConditional && basePartial) {
      partialTaskGain = Math.max(0, totalGoalTasks - basePartial.coveredCount);
      const witnessSup = (nextPlan.witness?.assignments || []).reduce(
        (acc, a) => acc + (a.evidence === 'supported' ? 1 : 0),
        0
      );
      supportedTaskGain = Math.max(0, witnessSup - basePartial.supportedCount);
    } else if (!nextPlan.witness && basePartial) {
      nextPartial = maxSchedulableTaskSubset(goal, combined);
      partialTaskGain = Math.max(0, nextPartial.coveredCount - basePartial.coveredCount);
      supportedTaskGain = Math.max(0, nextPartial.supportedCount - basePartial.supportedCount);
      if (partialTaskGain > 0 || supportedTaskGain > 0) {
        candTasks = nextPartial.assignments.filter(a => a.personId === cand.id);
      }
    }

    const advancesPartialPlan =
      !restoresFeasibility &&
      !upgradesToConditional &&
      (supportedTaskGain > 0 || partialTaskGain > 0);

    const nextFinish = nextPlan.witness
      ? Math.max(...nextPlan.witness.assignments.map(a => a.endMin))
      : goal.deadlineMin;
    const slackGainMin = (goal.deadlineMin - nextFinish) - (goal.deadlineMin - baselineFinish);
    const syncOverlapMin = overlapWithTeam(cand.windows);
    const asyncBatonPass = candTasks.length > 0 && syncOverlapMin === 0;

    const reasons = [];
    if (restoresFeasibility) {
      reasons.push(`Restores full goal feasibility by covering [${candTasks.map(t => `${t.taskId}(${t.skill})`).join(', ')}]`);
    } else if (upgradesToConditional) {
      reasons.push(`Unlocks conditional feasibility via [${candTasks.map(t => `${t.taskId}(?${t.skill})`).join(', ')}]`);
    } else if (advancesPartialPlan && basePartial && nextPartial) {
      const fromCnt = partialTaskGain > 0 ? basePartial.coveredCount : basePartial.supportedCount;
      const toCnt = partialTaskGain > 0 ? nextPartial.coveredCount : nextPartial.supportedCount;
      const taskLabels = candTasks.map(t => `${t.taskId}(${t.evidence === 'unknown' ? '?' : ''}${t.skill})`).join(', ');
      reasons.push(`Advances schedule from ${fromCnt}/${totalGoalTasks} to ${toCnt}/${totalGoalTasks} tasks by covering [${taskLabels}]`);
    } else if (candTasks.length > 0) {
      reasons.push(`Covers [${candTasks.map(t => t.taskId).join(', ')}] with +${Math.max(0, slackGainMin)}m deadline slack`);
    } else {
      reasons.push('Provides standby skill redundancy without critical-path task takeover');
    }

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
      advancesPartialPlan,
      partialTaskGain,
      supportedTaskGain,
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
    Number(b.advancesPartialPlan || false) - Number(a.advancesPartialPlan || false) ||
    (b.supportedTaskGain || 0) - (a.supportedTaskGain || 0) ||
    b.assignedTasks.length - a.assignedTasks.length ||
    Number(b.asyncBatonPass) - Number(a.asyncBatonPass) ||
    b.slackGainMin - a.slackGainMin ||
    b.syncOverlapMin - a.syncOverlapMin ||
    a.candidateId.localeCompare(b.candidateId)
  );

  return {
    baselineStatus: baseline.status,
    baselineRepairs: baselineFeasible
      ? []
      : diagnoseAndRepair({ goal, people: teamPeople, committedIds: [...teamIds] }),
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
