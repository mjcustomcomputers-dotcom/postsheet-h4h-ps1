// H4H-PS1 | R5/R12 Goal-Conditioned Planning Engine (100% backwards-compatible with R4/R5 tests).
import {
  stateOfEvidence,
  candidateEventStarts,
  computeTaskScheduleMeta,
  evaluateWildcardFrontier,
  diagnoseAndRepair
} from './synchronicity-solvers.mjs';

const identifier = s => typeof s === 'string' && /^[A-Za-z0-9_.:@-]{1,128}$/.test(s);
const minute = v => Number.isSafeInteger(v) && v >= 0;

export function evidenceState(pair) {
  return stateOfEvidence(pair);
}

function validate(goal, people, maxNodes) {
  if (!goal || !Array.isArray(goal.tasks) || goal.tasks.length < 1 || goal.tasks.length > 8) throw Error('INVALID_TASK_SCOPE');
  if (!Array.isArray(people) || people.length > 24 || people.length < 1) throw Error('INVALID_PERSON_SCOPE');
  if (!minute(goal.startMin) || !minute(goal.deadlineMin) || goal.deadlineMin <= goal.startMin) throw Error('INVALID_GOAL_TIME');
  if (!Number.isSafeInteger(maxNodes) || maxNodes < 1 || maxNodes > 100000) throw Error('INVALID_SEARCH_BUDGET');
  const ids = new Set();
  for (const task of goal.tasks) {
    if (!identifier(task.id) || !identifier(task.skill) || !minute(task.durationMin) || task.durationMin === 0 ||
        ids.has(task.id) || !Array.isArray(task.after || []) || (task.lagMin !== undefined && (!minute(task.lagMin) || task.lagMin > 10080))) {
      throw Error('INVALID_TASK');
    }
    ids.add(task.id);
  }
  for (const t of goal.tasks) {
    for (const dep of t.after || []) {
      if (!ids.has(dep) || dep === t.id) throw Error('INVALID_DEPENDENCY');
    }
  }
  const persons = new Set();
  for (const p of people) {
    if (!identifier(p.id) || persons.has(p.id) || !p.abilities || typeof p.abilities !== 'object' || !Array.isArray(p.windows)) {
      throw Error('INVALID_PERSON');
    }
    persons.add(p.id);
    for (const w of p.windows) {
      if (!minute(w.start) || !minute(w.end) || w.end <= w.start) throw Error('INVALID_WINDOW');
    }
  }
}

export function planGoal({ goal, people, maxNodes = 5000, includeDiagnostics = true }) {
  validate(goal, people, maxNodes);
  const sched = computeTaskScheduleMeta(goal);
  const tasks = sched.orderedTasks;
  const completed = new Map();
  const assignments = [];
  const unknown = [];
  const residuals = [];
  const visitedStates = new Set();
  let nodes = 0, exhausted = false, best = null, foundSupported = false;

  // Count how many goal skills each person holds so specialists leave versatile contributors free
  const goalSkillSet = new Set(tasks.map(t => t.skill));
  const versatility = new Map(people.map(p => [
    p.id,
    Object.keys(p.abilities || {}).filter(sk => goalSkillSet.has(sk) && evidenceState(p.abilities[sk]) === 'supported').length
  ]));

  const candidates = task => people
    .filter(p => p.consent === true && Object.hasOwn(p.abilities, task.skill))
    .map(p => ({ p, state: evidenceState(p.abilities[task.skill]) }))
    .filter(x => x.state === 'supported' || x.state === 'unknown')
    .sort((a, b) =>
      (a.state === 'supported' ? 0 : 1) - (b.state === 'supported' ? 0 : 1) ||
      (versatility.get(a.p.id) || 0) - (versatility.get(b.p.id) || 0) ||
      a.p.id.localeCompare(b.p.id)
    );

  function stateSignature() {
    return assignments
      .map(a => `${a.taskId}@${a.personId}:${a.startMin}-${a.endMin}:${a.evidence[0]}`)
      .sort()
      .join(';');
  }

  function dfs() {
    if (nodes++ >= maxNodes) { exhausted = true; return false; }
    if (completed.size === tasks.length) {
      const witness = { assignments: [...assignments], guards: [...unknown] };
      if (unknown.length === 0) { best = witness; foundSupported = true; return true; }
      if (!best || witness.guards.length < best.guards.length) best = witness;
      return false;
    }

    const sig = stateSignature();
    if (visitedStates.has(sig)) return false;
    visitedStates.add(sig);

    // Ready tasks ordered by Lawler/Jackson EDD (lf, ls, id); tries primary ready task + earliest start first,
    // then branches to feasible delayed event-point starts or alternative ready tasks within maxNodes
    const readyTasks = tasks.filter(
      t => !completed.has(t.id) && (t.after || []).every(dep => completed.has(dep))
    );

    for (let rIdx = 0; rIdx < readyTasks.length; rIdx++) {
      const task = readyTasks[rIdx], after = task.after || [];
      let ready = goal.startMin;
      for (const dep of after) {
        const end = completed.get(dep);
        ready = Math.max(ready, end + Math.max(0, task.lagMin || 0));
      }
      const deadline = Math.min(goal.deadlineMin, minute(task.deadlineMin) ? task.deadlineMin : goal.deadlineMin);
      const possible = candidates(task);
      if (possible.length === 0) {
        residuals.push({ taskId: task.id, reason: 'NO_CONSENTING_CANDIDATE_WITH_SUPPORTED_OR_UNKNOWN_ABILITY' });
        return false;
      }

      let placed = false;
      for (const { p, state } of possible) {
        const starts = candidateEventStarts(p, ready, task.durationMin, deadline, assignments);
        for (const start of starts) {
          placed = true;
          const end = start + task.durationMin;
          const a = { taskId: task.id, personId: p.id, skill: task.skill, startMin: start, endMin: end, evidence: state };
          assignments.push(a); completed.set(task.id, end);
          if (state === 'unknown') unknown.push({ taskId: task.id, personId: p.id, required: 'TASK_ABILITY_CONFIRMATION' });
          if (dfs()) return true;
          if (state === 'unknown') unknown.pop();
          completed.delete(task.id); assignments.pop();
          if (exhausted) break;
        }
        if (exhausted) break;
      }
      if (!placed && rIdx === 0) {
        residuals.push({ taskId: task.id, reason: 'NO_SCHEDULE_SLOT_BEFORE_DEADLINE' });
      }
      if (exhausted) break;
    }
    return false;
  }

  dfs();
  const enrich = Boolean(includeDiagnostics) && maxNodes >= 50;
  const frontier = enrich
    ? evaluateWildcardFrontier({
        goal,
        people,
        maxNodes: Math.min(1500, maxNodes),
        knownRobustWitness: foundSupported ? best : null
      })
    : null;
  const repairs = (!foundSupported && enrich) ? diagnoseAndRepair({ goal, people, alreadyFeasible: false }) : [];

  if (foundSupported) {
    return {
      status: 'FEASIBLE_WITNESS',
      classification: 'ROBUST_FEASIBLE',
      goal: goal.id || null,
      witness: best,
      criticalPath: sched.meta,
      frontier,
      repairs: [],
      search: { nodes, limit: maxNodes, exhausted },
      residuals: []
    };
  }
  if (best) {
    return {
      status: 'CONDITIONAL_WITNESS',
      classification: exhausted ? 'CONDITIONAL_BUDGET_LIMITED' : 'CONDITIONAL_GUARDED',
      goal: goal.id || null,
      witness: best,
      criticalPath: sched.meta,
      frontier,
      repairs,
      search: { nodes, limit: maxNodes, exhausted },
      nextResolution: best.guards[0] || null,
      residuals: []
    };
  }
  return {
    status: 'SEARCH_INCOMPLETE',
    classification: exhausted ? 'BUDGET_EXHAUSTED' : 'INFEASIBLE_WITHIN_SCOPE',
    goal: goal.id || null,
    witness: null,
    criticalPath: sched.meta,
    frontier,
    repairs,
    search: { nodes, limit: maxNodes, exhausted },
    residuals: [...new Map(residuals.map(r => [r.taskId + ':' + r.reason, r])).values()].slice(0, 8)
  };
}
