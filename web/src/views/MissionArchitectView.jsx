import React, { useState, useMemo } from 'react';
import TaskDagTimeline from '../components/TaskDagTimeline.jsx';
import SolarBatonHorizon from '../components/SolarBatonHorizon.jsx';
import EpistemicStencil from '../components/EpistemicStencil.jsx';
import {
  SKILLS_CATALOG,
  TIMEZONE_PRESETS,
  MISSION_SCENARIOS,
  normalizeBuilderId,
  computePartialTaskPreview,
  describePlainPlanVerdict,
  visualTasksToApi,
  visualPeopleToApi,
  tasksToDsl,
  dslToTasks,
  peopleToDsl,
  dslToPeople
} from '../presets-and-catalog.js';
import {
  SparklesIcon,
  PlayIcon,
  PlusIcon,
  TrashIcon,
  CheckCircleIcon,
  AlertTriangleIcon,
  ClockIcon,
  GlobeIcon,
  LayersIcon,
  ShieldCheckIcon,
  FileTextIcon,
  ArrowRightIcon
} from '../icons.jsx';

const NEXT_SKILL_STATE = {
  none: 'supported',
  supported: 'unknown',
  unknown: 'none'
};

const PLAIN_REPAIR_HEADINGS = {
  HALL_CAPACITY_CONTENTION_REPAIR: 'Schedule overload fix (keep current teammates)',
  EVIDENCE_REPAIR: 'Confirm unverified skill',
  COMPLEMENTARY_CANDIDATE: 'Suggested teammate for uncovered task',
  DEADLINE_EXTENSION: 'Adjust deadline or task hours'
};

function ContributorListEditor({
  title,
  subtitle,
  people,
  horizonMin,
  activeLinkId,
  onLinkHover,
  onTriggerPulse,
  onChange,
  addDefaultLabel = 'Add person'
}) {
  function updatePerson(idx, patch, toastMsg) {
    const next = people.map((p, i) => (i === idx ? { ...p, ...patch } : p));
    onTriggerPulse?.();
    onChange(next, toastMsg);
  }

  function cycleSkill(idx, skillId) {
    const person = people[idx];
    const current = person.skills?.[skillId] || 'none';
    const nextState = NEXT_SKILL_STATE[current];
    const nextSkills = { ...(person.skills || {}) };
    if (nextState === 'none') delete nextSkills[skillId];
    else nextSkills[skillId] = nextState;
    const stateLabel =
      nextState === 'supported'
        ? '✓ Verified'
        : nextState === 'unknown'
          ? 'Unverified (quick check)'
          : '- Not listed';
    updatePerson(idx, { skills: nextSkills }, `${person.id} · ${skillId} -> ${stateLabel}`);
  }

  function addPerson() {
    const n = people.length + 1;
    const newId = `${addDefaultLabel.toLowerCase().includes('candidate') ? 'cand' : 'member'}-${n}`;
    const next = [
      ...people,
      {
        id: newId,
        timezone: TIMEZONE_PRESETS[0].value,
        startMin: 0,
        endMin: horizonMin,
        skills: { backend: 'supported' }
      }
    ];
    onTriggerPulse?.();
    onChange(next, `Added '${newId}' to ${title.split('(')[0].trim()}.`);
  }

  function removePerson(idx) {
    const removed = people[idx];
    const next = people.filter((_, i) => i !== idx);
    onTriggerPulse?.();
    onChange(next, `Removed '${removed?.id || 'person'}' from ${title.split('(')[0].trim()}.`);
  }

  return (
    <div className="surface-card">
      <div className="row-between wrap-gap">
        <div>
          <h3 className="card-subtitle">{title}</h3>
          <p className="muted-copy small-copy">{subtitle}</p>
        </div>
        <button type="button" className="btn btn-secondary btn-compact" onClick={addPerson}>
          <PlusIcon size={15} /> {addDefaultLabel}
        </button>
      </div>

      <div className="skill-legend-bar" aria-label="Skill state legend">
        <span>Click any skill tag to change state:</span>
        <span className="skill-badge skill-verified">✓ Verified</span>
        <span className="skill-badge skill-unknown">Unverified (quick check)</span>
        <span className="skill-badge skill-none">- Not listed</span>
      </div>

      <div className="contributor-cards-stack">
        {people.map((person, idx) => {
          const startPct = Math.min(95, Math.max(0, Math.round((person.startMin / Math.max(60, horizonMin)) * 100)));
          const widthPct = Math.max(
            4,
            Math.min(100 - startPct, Math.round(((person.endMin - person.startMin) / Math.max(60, horizonMin)) * 100))
          );
          const isLinked =
            activeLinkId && normalizeBuilderId(activeLinkId) === normalizeBuilderId(person.id);

          return (
            <div
              key={`${person.id}-${idx}`}
              data-reactive-surface="true"
              data-link-id={person.id}
              onMouseEnter={() => onLinkHover?.(person.id)}
              onMouseLeave={() => onLinkHover?.(null)}
              onFocus={() => onLinkHover?.(person.id)}
              className={`contributor-card ${isLinked ? 'is-linked-ridge' : ''}`}
            >
              <div className="contributor-header-row">
                <label className="field-label compact-grow">
                  <span>Name / ID</span>
                  <input
                    type="text"
                    value={person.id}
                    onChange={e => updatePerson(idx, { id: e.target.value.replace(/[^A-Za-z0-9_.:@-]/g, '') })}
                  />
                </label>

                <label className="field-label compact-grow">
                  <span>Time Zone</span>
                  <select
                    value={TIMEZONE_PRESETS.some(t => t.value === person.timezone) ? person.timezone : 'custom'}
                    onChange={e => {
                      const chosen = TIMEZONE_PRESETS.find(t => t.value === e.target.value);
                      if (chosen) {
                        updatePerson(idx, {
                          timezone: chosen.value,
                          startMin: Math.round(horizonMin * chosen.defaultStartRatio),
                          endMin: Math.round(horizonMin * chosen.defaultEndRatio)
                        });
                      }
                    }}
                  >
                    {TIMEZONE_PRESETS.map(tz => (
                      <option key={tz.value} value={tz.value}>{tz.value}</option>
                    ))}
                    {!TIMEZONE_PRESETS.some(t => t.value === person.timezone) && (
                      <option value="custom">{person.timezone}</option>
                    )}
                  </select>
                </label>

                {people.length > 1 && (
                  <button
                    type="button"
                    className="btn btn-ghost icon-btn self-end"
                    onClick={() => removePerson(idx)}
                    aria-label={`Remove ${person.id}`}
                  >
                    <TrashIcon size={16} />
                  </button>
                )}
              </div>

              <div className="pill-row" role="group" aria-label={`Skills for ${person.id}`}>
                {SKILLS_CATALOG.map(sk => {
                  const st = person.skills?.[sk.id] || 'none';
                  const stText =
                    st === 'supported' ? 'Verified' : st === 'unknown' ? 'Unverified' : 'Not listed';
                  return (
                    <button
                      key={sk.id}
                      type="button"
                      className={`skill-state-btn state-${st}`}
                      onClick={() => cycleSkill(idx, sk.id)}
                      aria-label={`${person.id} ${sk.short}: ${stText}. Click to change.`}
                    >
                      {st === 'supported' ? '✓ ' : st === 'unknown' ? '? ' : '- '}
                      {sk.short}
                    </button>
                  );
                })}
              </div>

              <div className="wake-editor-box">
                <div className="row-between small-copy wrap-gap">
                  <span>
                    <ClockIcon size={13} /> Available hours: <strong>{person.startMin}m .. {person.endMin}m</strong> ({Math.max(0, person.endMin - person.startMin)}m)
                  </span>
                  <div className="pill-row">
                    <button
                      type="button"
                      className="micro-preset-btn"
                      onClick={() =>
                        updatePerson(
                          idx,
                          { startMin: 0, endMin: Math.round(horizonMin * 0.5) },
                          `${person.id}: Set hours to first half (0..${Math.round(horizonMin * 0.5)}m)`
                        )
                      }
                    >
                      First half (0-50%)
                    </button>
                    <button
                      type="button"
                      className="micro-preset-btn"
                      onClick={() =>
                        updatePerson(
                          idx,
                          { startMin: Math.round(horizonMin * 0.5), endMin: horizonMin },
                          `${person.id}: Set hours to second half (${Math.round(horizonMin * 0.5)}..${horizonMin}m)`
                        )
                      }
                    >
                      Second half (50-100%)
                    </button>
                    <button
                      type="button"
                      className="micro-preset-btn"
                      onClick={() =>
                        updatePerson(
                          idx,
                          { startMin: 0, endMin: horizonMin },
                          `${person.id}: Set hours to full window (0..${horizonMin}m)`
                        )
                      }
                    >
                      All hours
                    </button>
                  </div>
                </div>

                <div className="wake-track interactive-wake" aria-hidden="true">
                  <div className="wake-fill" style={{ left: `${startPct}%`, width: `${widthPct}%` }} />
                </div>

                <div className="dual-range-row">
                  <label className="range-field">
                    <span>Start ({person.startMin}m)</span>
                    <input
                      type="range"
                      min={0}
                      max={Math.max(15, horizonMin - 15)}
                      step={15}
                      value={Math.min(person.startMin, horizonMin - 15)}
                      onChange={e => {
                        const s = Number(e.target.value);
                        updatePerson(idx, { startMin: s, endMin: Math.max(s + 15, person.endMin) });
                      }}
                    />
                  </label>
                  <label className="range-field">
                    <span>End ({person.endMin}m)</span>
                    <input
                      type="range"
                      min={15}
                      max={horizonMin}
                      step={15}
                      value={Math.min(Math.max(15, person.endMin), horizonMin)}
                      onChange={e => {
                        const endVal = Number(e.target.value);
                        updatePerson(idx, { endMin: endVal, startMin: Math.min(person.startMin, endVal - 15) });
                      }}
                    />
                  </label>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function MissionArchitectView({
  theme = 'h4h-glass',
  motion = 'spring',
  activeLinkId = null,
  onLinkHover,
  pulseTrigger = 0,
  onTriggerPulse,
  activeScenarioKey,
  omegaMode,
  onSelectScenario,
  onToggleOmegaMode,
  goalDescription,
  onChangeGoalDescription,
  horizonHours,
  onChangeHorizonHours,
  tasks,
  onChangeTasks,
  teamPeople,
  onChangeTeamPeople,
  candidates,
  onChangeCandidates,
  plan,
  beforeSnapshot,
  recs,
  solving,
  lockingPlan,
  onRunSolveAndRecommend,
  onAddCandidateToTeam,
  onVerifyPersonSkill,
  onLockPlanAndMintInvite,
  onOpenCharterExport,
  onNotify
}) {
  const [showDsl, setShowDsl] = useState(false);
  const [showProof, setShowProof] = useState(false);
  const [dslTasksDraft, setDslTasksDraft] = useState('');
  const [dslTeamDraft, setDslTeamDraft] = useState('');
  const [dslCandDraft, setDslCandDraft] = useState('');

  const horizonMin = Math.max(60, Math.round(Number(horizonHours || 4) * 60));

  const partialPreview = useMemo(
    () => computePartialTaskPreview(tasks, teamPeople, horizonMin, plan),
    [tasks, teamPeople, horizonMin, plan]
  );
  const plainVerdict = useMemo(
    () => describePlainPlanVerdict(plan, tasks, partialPreview),
    [plan, tasks, partialPreview]
  );

  function openDslInspector() {
    const nextOpen = !showDsl;
    if (nextOpen) {
      setDslTasksDraft(tasksToDsl(tasks));
      setDslTeamDraft(peopleToDsl(teamPeople));
      setDslCandDraft(peopleToDsl(candidates));
    }
    setShowDsl(nextOpen);
    onNotify?.(nextOpen ? 'Opened text DSL & API JSON editor.' : 'Closed text DSL editor.', 'info');
  }

  function applyDslChanges() {
    const nextTasks = dslToTasks(dslTasksDraft);
    const nextTeam = dslToPeople(dslTeamDraft, horizonMin);
    const nextCand = dslToPeople(dslCandDraft, horizonMin);
    const resolvedTasks = nextTasks.length > 0 ? nextTasks : tasks;
    const resolvedTeam = nextTeam.length > 0 ? nextTeam : teamPeople;
    if (nextTasks.length > 0) onChangeTasks(resolvedTasks);
    if (nextTeam.length > 0) onChangeTeamPeople(resolvedTeam);
    onChangeCandidates(nextCand);
    onTriggerPulse?.();
    onRunSolveAndRecommend({
      tasks: resolvedTasks,
      teamPeople: resolvedTeam,
      candidates: nextCand,
      toastMessage: 'Applied text schedule edits and re-checked the plan.'
    });
  }

  function updateTask(idx, patch, toastMsg) {
    const next = tasks.map((t, i) => (i === idx ? { ...t, ...patch } : t));
    onChangeTasks(next);
    onTriggerPulse?.();
    onRunSolveAndRecommend({ tasks: next, toastMessage: toastMsg });
  }

  function toggleTaskDep(idx, depId) {
    const cur = tasks[idx].after || [];
    const removing = cur.includes(depId);
    const nextAfter = removing ? cur.filter(x => x !== depId) : [...cur, depId];
    updateTask(
      idx,
      { after: nextAfter },
      removing
        ? `Removed dependency '${tasks[idx].id} after:${depId}'.`
        : `Added dependency '${tasks[idx].id} after:${depId}'.`
    );
  }

  function addTask() {
    if (tasks.length >= 8) return;
    const n = tasks.length + 1;
    const prevId = tasks.length > 0 ? [tasks[tasks.length - 1].id] : [];
    const newId = `task-${n}`;
    const next = [
      ...tasks,
      {
        id: newId,
        title: `Task ${n}`,
        skill: 'integrate',
        durationMin: 60,
        lagMin: 0,
        after: prevId
      }
    ];
    onChangeTasks(next);
    onTriggerPulse?.();
    onRunSolveAndRecommend({
      tasks: next,
      toastMessage: `Added task '${newId}' and re-checked the schedule.`
    });
  }

  function removeTask(idx) {
    const removedId = tasks[idx].id;
    const next = tasks
      .filter((_, i) => i !== idx)
      .map(t => ({ ...t, after: (t.after || []).filter(d => d !== removedId) }));
    onChangeTasks(next);
    onTriggerPulse?.();
    onRunSolveAndRecommend({
      tasks: next,
      toastMessage: `Removed task '${removedId}' and re-checked the schedule.`
    });
  }

  function handleHorizonChange(nextHrs) {
    const clamped = Math.max(1, Math.min(168, Number(nextHrs) || 1));
    onChangeHorizonHours(clamped);
    onRunSolveAndRecommend({ horizonHours: clamped });
  }

  function handleTeamPeopleEdit(nextTeam, toastMsg) {
    onChangeTeamPeople(nextTeam);
    onRunSolveAndRecommend({ teamPeople: nextTeam, toastMessage: toastMsg });
  }

  function handleCandidatesEdit(nextCands, toastMsg) {
    onChangeCandidates(nextCands);
    onRunSolveAndRecommend({ candidates: nextCands, toastMessage: toastMsg });
  }

  const currentScenario = MISSION_SCENARIOS[activeScenarioKey];

  const statusTone =
    plainVerdict.tone === 'ok'
      ? 'tone-ok'
      : 'tone-warn';

  return (
    <section aria-labelledby="architect-heading" className="view-section">
      {/* Calm-at-Rest Solar Terminator & Bounded 850ms Handoff Horizon */}
      <SolarBatonHorizon
        mode="architect"
        theme={theme}
        motion={motion}
        horizonMin={horizonMin}
        teamPeople={teamPeople}
        candidates={candidates}
        recommendations={recs?.recommendations || []}
        pulseTrigger={pulseTrigger}
        activeLinkId={activeLinkId}
      />

      {/* Plain-Language Header & 4 Example Scenarios */}
      <div className="surface-card hero-strip">
        <div className="row-between wrap-gap">
          <div className="prose-measure">
            <span className="eyebrow-tag">STEP 2 · SCHEDULE, TIME ZONES &amp; SKILL FIT</span>
            <h2 id="architect-heading" className="view-title">Plan the work</h2>
            <p className="muted-copy">
              List the tasks, check everyone's available hours across time zones, and see who completes the schedule without replacing current teammates.
            </p>
          </div>

          <div className="pill-row">
            <button
              type="button"
              className="btn btn-secondary btn-compact"
              onClick={onOpenCharterExport}
            >
              <FileTextIcon size={15} /> Preview / Print Plan
            </button>
            <button
              type="button"
              className="btn btn-secondary btn-compact"
              aria-expanded={showDsl}
              onClick={openDslInspector}
            >
              <LayersIcon size={15} /> {showDsl ? 'Hide Text / JSON' : 'Text / JSON'}
            </button>
            <button
              type="button"
              className="btn btn-primary btn-compact"
              disabled={solving}
              onClick={() => {
                onTriggerPulse?.();
                onRunSolveAndRecommend({ explicitEvaluate: true });
              }}
            >
              <PlayIcon size={15} /> {solving ? 'Checking...' : 'Check plan & suggestions'}
            </button>
          </div>
        </div>

        {/* 4 Plain-Language Scenario Buttons */}
        <div className="scenario-cards-grid" role="group" aria-label="Example team planning scenarios">
          {Object.values(MISSION_SCENARIOS).map(sc => {
            const active = activeScenarioKey === sc.id;
            return (
              <button
                key={sc.id}
                type="button"
                aria-pressed={active}
                data-reactive-surface="true"
                className={`scenario-card ${active ? 'active' : ''}`}
                onClick={() => {
                  onTriggerPulse?.();
                  onSelectScenario(sc.id);
                }}
              >
                <div className="row-between">
                  <span className="scenario-code">Example {sc.code}</span>
                  {active && <span className="badge-pill">Active</span>}
                </div>
                <strong className="scenario-title">{sc.title}</strong>
                <span className="scenario-sub">{sc.subtitle}</span>
              </button>
            );
          })}
        </div>

        {currentScenario && (
          <div className="scenario-explainer">
            <p className="prose-measure">
              <strong>{currentScenario.title}:</strong> {currentScenario.summary}
            </p>

            {/* Scenario 3 Sub-Mode Switcher */}
            {activeScenarioKey === 'omega' && (
              <div className="pill-row top-gap-sm" role="group" aria-label="Compare unverified skill with and without backup">
                <button
                  type="button"
                  aria-pressed={omegaMode === 'contingent'}
                  className={`btn btn-compact ${omegaMode === 'contingent' ? 'btn-primary' : 'btn-secondary'}`}
                  onClick={() => {
                    onTriggerPulse?.();
                    onToggleOmegaMode('contingent');
                  }}
                >
                  Case 3A: No backup for frontend (prompts 1 quick check)
                </button>
                <button
                  type="button"
                  aria-pressed={omegaMode === 'robust'}
                  className={`btn btn-compact ${omegaMode === 'robust' ? 'btn-primary' : 'btn-secondary'}`}
                  onClick={() => {
                    onTriggerPulse?.();
                    onToggleOmegaMode('robust');
                  }}
                >
                  Case 3B: Kai covers frontend with verified work (asks 0 questions)
                </button>
              </div>
            )}

            {/* Scenario 4 Early Setup Unlock */}
            {activeScenarioKey === 'prereq' && (
              <div className="pill-row top-gap-sm">
                <button
                  type="button"
                  className="btn btn-primary btn-compact"
                  onClick={() => {
                    onTriggerPulse?.();
                    onVerifyPersonSkill('aurora', 'devops');
                  }}
                >
                  <CheckCircleIcon size={15} /> Confirm Aurora's cloud setup skill (keeps all 3 teammates)
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Optional Text / JSON Inspector */}
      {showDsl && (
        <div className="surface-card dsl-drawer" role="region" aria-label="Text schedule and API JSON inspector">
          <div className="row-between wrap-gap">
            <h3>Text Schedule &amp; API Request Payload</h3>
            <button type="button" className="btn btn-primary btn-compact" onClick={applyDslChanges}>
              Apply Text &amp; Re-Check
            </button>
          </div>
          <div className="dsl-grid">
            <label className="field-label">
              <span>Tasks (<code>id,skill,durationMin,dep1|dep2,lagMin</code>)</span>
              <textarea rows={4} spellCheck={false} value={dslTasksDraft} onChange={e => setDslTasksDraft(e.target.value)} />
            </label>
            <label className="field-label">
              <span>People in Plan (<code>id@start-end:skill|?unverified</code>)</span>
              <textarea rows={4} spellCheck={false} value={dslTeamDraft} onChange={e => setDslTeamDraft(e.target.value)} />
            </label>
            <label className="field-label">
              <span>Candidate Pool</span>
              <textarea rows={4} spellCheck={false} value={dslCandDraft} onChange={e => setDslCandDraft(e.target.value)} />
            </label>
          </div>
          <details className="json-preview-details">
            <summary>Inspect <code>POST /api/plan</code> JSON Body</summary>
            <pre className="code-block">
              {JSON.stringify(
                {
                  goal: {
                    id: 'mission-goal',
                    description: goalDescription,
                    startMin: 0,
                    deadlineMin: horizonMin,
                    tasks: visualTasksToApi(tasks)
                  },
                  people: visualPeopleToApi(teamPeople, horizonMin),
                  maxNodes: 5000
                },
                null,
                2
              )}
            </pre>
          </details>
        </div>
      )}

      {/* Honest Plain-Language Plan Result + Level-3 Engineering Proof Toggle */}
      {plan && (
        <div className={`surface-card verdict-banner ${statusTone}`} role="region" aria-label="Plan readiness summary">
          <div className="row-between wrap-gap">
            <div>
              <span className="eyebrow-tag">PLAN CHECK RESULT (PREVIEW UNTIL TEAM IS CREATED ON SERVER)</span>
              <h3 className="verdict-headline">
                {plainVerdict.tone === 'ok' ? (
                  <CheckCircleIcon size={20} />
                ) : (
                  <AlertTriangleIcon size={20} />
                )}
                <span>{plainVerdict.headline}</span>
              </h3>
              <p className="muted-copy small-copy small-top">{plainVerdict.detail}</p>
            </div>

            <div className="pill-row">
              <span className="badge-pill">
                {plainVerdict.coveredCount} of {plainVerdict.totalCount} tasks covered
              </span>
              <button
                type="button"
                aria-expanded={showProof}
                className="btn btn-secondary btn-compact"
                onClick={() => setShowProof(v => !v)}
              >
                {showProof ? 'Hide Engineering Proof' : 'Engineering Proof'}
              </button>
            </div>
          </div>

          {/* Ready -> Create team & single-use invite on server */}
          {plan.status === 'FEASIBLE_WITNESS' && (
            <div className="subcard tone-ok top-gap-sm">
              <div className="row-between wrap-gap">
                <div className="prose-measure">
                  <strong>All tasks and hours fit together:</strong> Create this team on the server and generate a single-use invite link in Step 3.
                </div>
                <div className="pill-row">
                  <button
                    type="button"
                    className="btn btn-primary"
                    disabled={lockingPlan}
                    onClick={onLockPlanAndMintInvite}
                  >
                    <ShieldCheckIcon size={16} />
                    {lockingPlan ? 'Creating team & invite...' : 'Create team & invite -> Step 3'}
                    <ArrowRightIcon size={14} />
                  </button>
                  <button
                    type="button"
                    className="btn btn-secondary btn-compact"
                    onClick={onOpenCharterExport}
                  >
                    <FileTextIcon size={14} /> Preview / Print Plan
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Backup covers unverified skill -> zero unnecessary questions */}
          {plan.frontier?.actionStable && (plan.frontier?.wildcards?.length || 0) > 0 && (
            <div className="subcard tone-ok top-gap-sm">
              <strong>Zero extra questions needed:</strong> Even though{' '}
              <code>{plan.frontier.wildcards.map(w => `${w.personId} (${w.skill})`).join(', ')}</code> is unverified, a teammate with verified work already covers every required task.
            </div>
          )}

          {/* One quick skill check */}
          {plan.frontier?.voiQuestion && (
            <div className="subcard tone-warn top-gap-sm">
              <div className="row-between wrap-gap">
                <div className="prose-measure">
                  <strong>
                    Quick skill check needed: {plan.frontier.voiQuestion.personId} ({plan.frontier.voiQuestion.skill})
                  </strong>
                  <p className="small-top small-copy">
                    Confirming <code>{plan.frontier.voiQuestion.personId}</code>'s <code>{plan.frontier.voiQuestion.skill}</code> skill with a 5-minute sample locks the schedule ({plan.frontier.voiQuestion.reason}).
                  </p>
                </div>
                <button
                  type="button"
                  className="btn btn-primary btn-compact"
                  onClick={() => {
                    onTriggerPulse?.();
                    onVerifyPersonSkill(plan.frontier.voiQuestion.personId, plan.frontier.voiQuestion.skill);
                  }}
                >
                  <CheckCircleIcon size={15} /> Confirm {plan.frontier.voiQuestion.skill} skill
                </button>
              </div>
            </div>
          )}

          {/* Plain-language bottleneck explanations */}
          {(plan.repairs || []).length > 0 && (
            <div className="repairs-stack top-gap-sm">
              {plan.repairs.map((rep, i) => (
                <div key={i} className="subcard tone-warn">
                  <div className="row-between wrap-gap">
                    <strong>{PLAIN_REPAIR_HEADINGS[rep.kind] || 'How to unblock this plan'}</strong>
                    <span className="status-chip chip-ok">
                      Keeps current teammates ({rep.displacedCommittedMembers ?? 0} replaced)
                    </span>
                  </div>
                  <p className="prose-measure small-top small-copy">{rep.explanation || rep.action}</p>
                  {rep.kind === 'EVIDENCE_REPAIR' && rep.personId && rep.skill && (
                    <button
                      type="button"
                      className="btn btn-secondary btn-compact top-gap-xs"
                      onClick={() => {
                        onTriggerPulse?.();
                        onVerifyPersonSkill(rep.personId, rep.skill);
                      }}
                    >
                      Confirm {rep.personId}'s {rep.skill} skill
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Level-3 Engineering Proof Sub-Panel (CRR-10 Static Anchor) */}
          {showProof && (
            <div className="subcard engineering-proof-box top-gap-sm" role="region" aria-label="Level 3 Engineering Proof">
              <div className="row-between wrap-gap">
                <strong>Engineering Proof (<code>/api/plan</code> Solver Witness)</strong>
                <div className="pill-row">
                  <EpistemicStencil
                    kind={plan.status === 'CONDITIONAL_WITNESS' ? 'VOI_PROVISIONAL' : 'SQLITE_AUTHORITY'}
                    compact
                  />
                </div>
              </div>
              <div className="telemetry-cluster top-gap-xs">
                <div className="metric-pill">
                  <span className="metric-label">Status</span>
                  <strong className="metric-value mono-cell">{plan.status}</strong>
                </div>
                <div className="metric-pill">
                  <span className="metric-label">Classification</span>
                  <strong className="metric-value mono-cell">{plan.classification}</strong>
                </div>
                <div className="metric-pill">
                  <span className="metric-label">Search Nodes</span>
                  <strong className="metric-value mono-cell">{plan.search?.nodes ?? 0} / {plan.search?.limit ?? 5000}</strong>
                </div>
                <div className="metric-pill">
                  <span className="metric-label">Wildcard |Omega|</span>
                  <strong className="metric-value mono-cell">
                    {plan.frontier ? `${plan.frontier.worldsCovered} / ${plan.frontier.omegaSize}` : '1 / 1'}
                  </strong>
                </div>
                <div className="metric-pill">
                  <span className="metric-label">Quantifier</span>
                  <strong className="metric-value mono-cell">{plan.frontier?.quantifierStatus || 'DETERMINISTIC'}</strong>
                </div>
                <div className="metric-pill">
                  <span className="metric-label">P9R Policy</span>
                  <strong className="metric-value mono-cell">{plan.frontier?.minimumSufficientStop || 'BOUNDED'}</strong>
                </div>
                {plan.frontier?.voiQuestion && (
                  <div className="metric-pill">
                    <span className="metric-label">Shannon VOI</span>
                    <strong className="metric-value mono-cell">{plan.frontier.voiQuestion.informationGainBits} bits</strong>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Suggested People to Complete the Plan */}
      {recs && (
        <div className="surface-card" role="region" aria-label="Suggested people to complete your plan">
          <div className="row-between wrap-gap">
            <div>
              <span className="eyebrow-tag">SUGGESTED TEAMMATES</span>
              <h3 className="card-subtitle">
                People who unblock or strengthen this plan
              </h3>
            </div>
            <span className="badge-pill">{(recs.recommendations || []).length} candidates</span>
          </div>

          {(recs.recommendations || []).length === 0 ? (
            <p className="muted-copy top-gap-sm">
              Everyone in the candidate pool is already included in your plan preview.
            </p>
          ) : (
            <div className="rec-cards-grid top-gap-sm">
              {recs.recommendations.map((r, rankIdx) => {
                const isLinked =
                  activeLinkId && normalizeBuilderId(activeLinkId) === normalizeBuilderId(r.candidateId);
                return (
                  <article
                    key={r.candidateId}
                    data-reactive-surface="true"
                    data-link-id={r.candidateId}
                    onMouseEnter={() => onLinkHover?.(r.candidateId)}
                    onMouseLeave={() => onLinkHover?.(null)}
                    onFocus={() => onLinkHover?.(r.candidateId)}
                    className={`rec-card ${r.restoresFeasibility ? 'rec-featured' : ''} ${
                      isLinked ? 'is-linked-ridge' : ''
                    }`}
                  >
                    <div className="row-between wrap-gap">
                      <div>
                        <span className="rank-badge">#{rankIdx + 1}</span>{' '}
                        <strong className="crew-id">{r.candidateId}</strong>
                        <span className="muted-copy"> · <GlobeIcon size={13} /> {r.timezoneLabel}</span>
                      </div>
                      <button
                        type="button"
                        className={`btn btn-compact ${r.restoresFeasibility ? 'btn-primary' : 'btn-secondary'}`}
                        onClick={() => {
                          onTriggerPulse?.();
                          onAddCandidateToTeam(r.candidateId);
                        }}
                      >
                        <SparklesIcon size={14} /> Try in plan
                      </button>
                    </div>

                    <div className="tag-cluster top-gap-xs">
                      {r.restoresFeasibility && (
                        <span className="status-chip chip-ok">✓ Completes all tasks</span>
                      )}
                      {r.upgradesToConditional && (
                        <span className="status-chip chip-warn">Covers hours (needs 1 skill check)</span>
                      )}
                      {r.asyncBatonPass && (
                        <span className="baton-pill">Clean time-zone handoff (0m overlap)</span>
                      )}
                      {r.slackGainMin > 0 && (
                        <span className="status-chip chip-ok">+{r.slackGainMin}m buffer</span>
                      )}
                      <span className="status-chip chip-neutral">Replaces 0 teammates</span>
                    </div>

                    <p className="prose-measure muted-copy small-top">{r.explanation}</p>
                  </article>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Goal + Task Timeline & Dependencies */}
      <div className="surface-card">
        <div className="mission-meta-grid">
          <label className="field-label">
            <span>What is your team building?</span>
            <input
              type="text"
              value={goalDescription}
              maxLength={240}
              onChange={e => onChangeGoalDescription(e.target.value)}
            />
          </label>

          <label className="field-label">
            <span>Total Time Window: <strong>{horizonHours} hours ({horizonMin} minutes)</strong></span>
            <div className="inline-slider-group">
              <input
                type="range"
                min={1}
                max={48}
                step={1}
                value={Math.min(48, Math.max(1, Number(horizonHours) || 4))}
                onChange={e => handleHorizonChange(Number(e.target.value))}
              />
              <input
                type="number"
                min={1}
                max={168}
                value={horizonHours}
                onChange={e => handleHorizonChange(Number(e.target.value))}
                className="compact-num-in"
                aria-label="Time window in hours"
              />
            </div>
          </label>
        </div>

        <TaskDagTimeline
          tasks={tasks}
          teamPeople={teamPeople}
          horizonMin={horizonMin}
          plan={plan}
          beforeSnapshot={beforeSnapshot}
          activeLinkId={activeLinkId}
          onLinkHover={onLinkHover}
          onNotify={onNotify}
        />
      </div>

      {/* Task Editor */}
      <div className="surface-card">
        <div className="row-between wrap-gap">
          <div>
            <h3 className="card-subtitle">Tasks &amp; Handoff Order ({tasks.length} / 8 tasks)</h3>
            <p className="muted-copy small-copy">
              Set the skill, duration, handoff gap, and which earlier tasks must finish first.
            </p>
          </div>
          <button
            type="button"
            className="btn btn-secondary btn-compact"
            disabled={tasks.length >= 8}
            onClick={addTask}
          >
            <PlusIcon size={15} /> Add task
          </button>
        </div>

        <div className="tasks-editor-grid top-gap-sm">
          {tasks.map((task, idx) => {
            const otherTasks = tasks.filter((_, i) => i !== idx);
            const isLinked = activeLinkId === task.id;
            return (
              <div
                key={idx}
                data-reactive-surface="true"
                data-link-id={task.id}
                onMouseEnter={() => onLinkHover?.(task.id)}
                onMouseLeave={() => onLinkHover?.(null)}
                onFocus={() => onLinkHover?.(task.id)}
                className={`task-editor-card ${isLinked ? 'is-linked-ridge' : ''}`}
              >
                <div className="row-between">
                  <span className="eyebrow-tag">TASK {idx + 1}</span>
                  {tasks.length > 1 && (
                    <button
                      type="button"
                      className="btn btn-ghost icon-btn"
                      onClick={() => removeTask(idx)}
                      aria-label={`Delete task ${task.id}`}
                    >
                      <TrashIcon size={15} />
                    </button>
                  )}
                </div>

                <div className="task-fields-row">
                  <label className="field-label">
                    <span>Task Name / ID</span>
                    <input
                      type="text"
                      value={task.id}
                      onChange={e => updateTask(idx, { id: e.target.value.replace(/[^A-Za-z0-9_.:@-]/g, '') })}
                    />
                  </label>

                  <label className="field-label">
                    <span>Needed Skill</span>
                    <select value={task.skill} onChange={e => updateTask(idx, { skill: e.target.value })}>
                      {SKILLS_CATALOG.map(sk => (
                        <option key={sk.id} value={sk.id}>{sk.label} ({sk.id})</option>
                      ))}
                    </select>
                  </label>
                </div>

                <div className="task-fields-row">
                  <label className="field-label">
                    <span>Duration: <strong>{task.durationMin}m</strong></span>
                    <input
                      type="range"
                      min={15}
                      max={Math.min(360, horizonMin)}
                      step={15}
                      value={Math.min(task.durationMin, horizonMin)}
                      onChange={e => updateTask(idx, { durationMin: Number(e.target.value) })}
                    />
                  </label>

                  <label className="field-label">
                    <span>Handoff Gap (min)</span>
                    <input
                      type="number"
                      min={0}
                      max={240}
                      step={5}
                      value={task.lagMin || 0}
                      onChange={e => updateTask(idx, { lagMin: Math.max(0, Number(e.target.value) || 0) })}
                    />
                  </label>
                </div>

                {otherTasks.length > 0 && (
                  <fieldset className="deps-fieldset">
                    <legend>Starts After</legend>
                    <div className="pill-row">
                      {otherTasks.map(ot => {
                        const checked = (task.after || []).includes(ot.id);
                        return (
                          <button
                            key={ot.id}
                            type="button"
                            aria-pressed={checked}
                            className={`chip-toggle ${checked ? 'active' : ''}`}
                            onClick={() => toggleTaskDep(idx, ot.id)}
                          >
                            {checked ? '✓ ' : ''}after {ot.id}
                          </button>
                        );
                      })}
                    </div>
                  </fieldset>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Two-Column People in Plan & Candidate Pool */}
      <div className="two-col-studio">
        <ContributorListEditor
          title={`People in Plan Preview (${teamPeople.length})`}
          subtitle="Teammates currently included in the schedule check"
          people={teamPeople}
          horizonMin={horizonMin}
          activeLinkId={activeLinkId}
          onLinkHover={onLinkHover}
          onTriggerPulse={onTriggerPulse}
          onChange={handleTeamPeopleEdit}
          addDefaultLabel="Add teammate"
        />

        <ContributorListEditor
          title={`Candidate Pool (${candidates.length})`}
          subtitle="Additional people ranked by schedule and skill fit"
          people={candidates}
          horizonMin={horizonMin}
          activeLinkId={activeLinkId}
          onLinkHover={onLinkHover}
          onTriggerPulse={onTriggerPulse}
          onChange={handleCandidatesEdit}
          addDefaultLabel="Add candidate"
        />
      </div>
    </section>
  );
}
