import React, { useState } from 'react';
import TaskDagTimeline from '../components/TaskDagTimeline.jsx';
import SolarBatonHorizon from '../components/SolarBatonHorizon.jsx';
import EpistemicStencil from '../components/EpistemicStencil.jsx';
import {
  SKILLS_CATALOG,
  TIMEZONE_PRESETS,
  MISSION_SCENARIOS,
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

function ContributorListEditor({
  title,
  subtitle,
  people,
  horizonMin,
  onChange,
  addDefaultLabel = 'Add Builder'
}) {
  function updatePerson(idx, patch) {
    const next = people.map((p, i) => (i === idx ? { ...p, ...patch } : p));
    onChange(next);
  }

  function cycleSkill(idx, skillId) {
    const person = people[idx];
    const current = person.skills?.[skillId] || 'none';
    const nextState = NEXT_SKILL_STATE[current];
    const nextSkills = { ...(person.skills || {}) };
    if (nextState === 'none') delete nextSkills[skillId];
    else nextSkills[skillId] = nextState;
    updatePerson(idx, { skills: nextSkills });
  }

  function addPerson() {
    const n = people.length + 1;
    onChange([
      ...people,
      {
        id: `builder-${n}`,
        timezone: TIMEZONE_PRESETS[0].value,
        startMin: 0,
        endMin: horizonMin,
        skills: { backend: 'supported' }
      }
    ]);
  }

  function removePerson(idx) {
    onChange(people.filter((_, i) => i !== idx));
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

      <div className="skill-legend-bar" aria-label="Skill evidence legend">
        <span>Click any skill chip to cycle state:</span>
        <span className="skill-badge skill-verified">✓ Supported (Verified)</span>
        <span className="skill-badge skill-unknown">? Provisional (Offer micro-work-sample)</span>
        <span className="skill-badge skill-none">- Not Claimed</span>
      </div>

      <div className="contributor-cards-stack">
        {people.map((person, idx) => {
          const startPct = Math.min(95, Math.max(0, Math.round((person.startMin / Math.max(60, horizonMin)) * 100)));
          const widthPct = Math.max(
            4,
            Math.min(100 - startPct, Math.round(((person.endMin - person.startMin) / Math.max(60, horizonMin)) * 100))
          );

          return (
            <div key={`${person.id}-${idx}`} className="contributor-card">
              <div className="contributor-header-row">
                <label className="field-label compact-grow">
                  <span>Builder ID</span>
                  <input
                    type="text"
                    value={person.id}
                    onChange={e => updatePerson(idx, { id: e.target.value.replace(/[^A-Za-z0-9_.:@-]/g, '') })}
                  />
                </label>

                <label className="field-label compact-grow">
                  <span>UTC Timezone Context</span>
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

              {/* 3-state skill pills */}
              <div className="pill-row" role="group" aria-label={`Skills for ${person.id}`}>
                {SKILLS_CATALOG.map(sk => {
                  const st = person.skills?.[sk.id] || 'none';
                  const stText =
                    st === 'supported' ? 'Supported' : st === 'unknown' ? 'Provisional Unknown' : 'Not Claimed';
                  return (
                    <button
                      key={sk.id}
                      type="button"
                      className={`skill-state-btn state-${st}`}
                      onClick={() => cycleSkill(idx, sk.id)}
                      aria-label={`${person.id} ${sk.short}: ${stText}. Activate to cycle state.`}
                    >
                      {st === 'supported' ? '✓ ' : st === 'unknown' ? '? ' : '- '}
                      {sk.short}
                    </button>
                  );
                })}
              </div>

              {/* Visual Wake-Window Bar & Sliders */}
              <div className="wake-editor-box">
                <div className="row-between small-copy wrap-gap">
                  <span>
                    <ClockIcon size={13} /> Active Wake Window: <strong>T+{person.startMin}m .. T+{person.endMin}m</strong> ({Math.max(0, person.endMin - person.startMin)}m available)
                  </span>
                  <div className="pill-row">
                    <button
                      type="button"
                      className="micro-preset-btn"
                      onClick={() => updatePerson(idx, { startMin: 0, endMin: Math.round(horizonMin * 0.5) })}
                    >
                      Shift 1 (0-50%)
                    </button>
                    <button
                      type="button"
                      className="micro-preset-btn"
                      onClick={() => updatePerson(idx, { startMin: Math.round(horizonMin * 0.5), endMin: horizonMin })}
                    >
                      Baton Relay (50-100%)
                    </button>
                    <button
                      type="button"
                      className="micro-preset-btn"
                      onClick={() => updatePerson(idx, { startMin: 0, endMin: horizonMin })}
                    >
                      Full Horizon
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
  onOpenCharterExport
}) {
  const [showDsl, setShowDsl] = useState(false);
  const [dslTasksDraft, setDslTasksDraft] = useState('');
  const [dslTeamDraft, setDslTeamDraft] = useState('');
  const [dslCandDraft, setDslCandDraft] = useState('');

  const horizonMin = Math.max(60, Math.round(Number(horizonHours || 4) * 60));

  function openDslInspector() {
    if (!showDsl) {
      setDslTasksDraft(tasksToDsl(tasks));
      setDslTeamDraft(peopleToDsl(teamPeople));
      setDslCandDraft(peopleToDsl(candidates));
    }
    setShowDsl(!showDsl);
  }

  function applyDslChanges() {
    const nextTasks = dslToTasks(dslTasksDraft);
    const nextTeam = dslToPeople(dslTeamDraft, horizonMin);
    const nextCand = dslToPeople(dslCandDraft, horizonMin);
    if (nextTasks.length > 0) onChangeTasks(nextTasks);
    if (nextTeam.length > 0) onChangeTeamPeople(nextTeam);
    onChangeCandidates(nextCand);
    onRunSolveAndRecommend({
      tasks: nextTasks.length > 0 ? nextTasks : tasks,
      teamPeople: nextTeam.length > 0 ? nextTeam : teamPeople,
      candidates: nextCand
    });
  }

  function updateTask(idx, patch) {
    const next = tasks.map((t, i) => (i === idx ? { ...t, ...patch } : t));
    onChangeTasks(next);
  }

  function toggleTaskDep(idx, depId) {
    const cur = tasks[idx].after || [];
    const nextAfter = cur.includes(depId) ? cur.filter(x => x !== depId) : [...cur, depId];
    updateTask(idx, { after: nextAfter });
  }

  function addTask() {
    if (tasks.length >= 8) return;
    const n = tasks.length + 1;
    const prevId = tasks.length > 0 ? [tasks[tasks.length - 1].id] : [];
    onChangeTasks([
      ...tasks,
      {
        id: `task-${n}`,
        title: `Deliverable Step ${n}`,
        skill: 'integrate',
        durationMin: 60,
        lagMin: 0,
        after: prevId
      }
    ]);
  }

  function removeTask(idx) {
    const removedId = tasks[idx].id;
    const next = tasks
      .filter((_, i) => i !== idx)
      .map(t => ({ ...t, after: (t.after || []).filter(d => d !== removedId) }));
    onChangeTasks(next);
  }

  const currentScenario = MISSION_SCENARIOS[activeScenarioKey];

  const statusTone =
    plan?.status === 'FEASIBLE_WITNESS'
      ? 'tone-ok'
      : plan?.status === 'CONDITIONAL_WITNESS'
        ? 'tone-warn'
        : plan
          ? 'tone-error'
          : '';

  return (
    <section aria-labelledby="architect-heading" className="view-section">
      {/* 60-FPS Solar Terminator & Luminous Firefly Baton-Pass Horizon */}
      <SolarBatonHorizon
        mode="architect"
        theme={theme}
        motion={motion}
        horizonMin={horizonMin}
        teamPeople={teamPeople}
        candidates={candidates}
        recommendations={recs?.recommendations || []}
      />

      {/* Header & 4 Interactive Scenario Cards */}
      <div className="surface-card hero-strip">
        <div className="row-between wrap-gap">
          <div className="prose-measure">
            <div className="pill-row">
              <span className="eyebrow-tag">VIEW 2 · SYNCHRONICITY R5 COUPLED SOLVER STUDIO</span>
              <EpistemicStencil kind="SQLITE_AUTHORITY" compact />
              <EpistemicStencil kind="VOI_PROVISIONAL" compact />
            </div>
            <h2 id="architect-heading" className="view-title">Mission &amp; Ability Architect</h2>
            <p className="muted-copy">
              Start from what your crew is trying to build. Model critical-path task dependencies, 24-hour UTC wake windows, provisional <code>?skill</code> wildcards, and Hall capacity contention, then add complementary builders in 1 click.
            </p>
          </div>

          <div className="pill-row">
            <button
              type="button"
              className="btn btn-secondary"
              onClick={onOpenCharterExport}
            >
              <FileTextIcon size={15} /> Export Crew Charter
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              aria-expanded={showDsl}
              onClick={openDslInspector}
            >
              <LayersIcon /> {showDsl ? 'Hide Advanced DSL / JSON' : 'Advanced DSL / JSON'}
            </button>
            <button
              type="button"
              className="btn btn-primary"
              disabled={solving}
              onClick={() => onRunSolveAndRecommend()}
            >
              <PlayIcon /> {solving ? 'Solving DAG...' : 'Evaluate Plan & Recommendations'}
            </button>
          </div>
        </div>

        {/* 4 Pre-Loaded Judge Scenario Cards */}
        <div className="scenario-cards-grid" role="group" aria-label="Pre-loaded judge scenarios">
          {Object.values(MISSION_SCENARIOS).map(sc => {
            const active = activeScenarioKey === sc.id;
            return (
              <button
                key={sc.id}
                type="button"
                aria-pressed={active}
                className={`scenario-card ${active ? 'active' : ''}`}
                onClick={() => onSelectScenario(sc.id)}
              >
                <div className="row-between">
                  <span className="scenario-code">{sc.code}</span>
                  {active && <span className="badge-pill">Loaded</span>}
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
              <strong>{currentScenario.code} · {currentScenario.title}:</strong> {currentScenario.summary}
            </p>

            {/* Scenario C Special Sub-Mode Switcher */}
            {activeScenarioKey === 'omega' && (
              <div className="pill-row top-gap-sm" role="group" aria-label="Wildcard Omega quantifier comparison">
                <button
                  type="button"
                  aria-pressed={omegaMode === 'contingent'}
                  className={`btn btn-compact ${omegaMode === 'contingent' ? 'btn-primary' : 'btn-secondary'}`}
                  onClick={() => onToggleOmegaMode('contingent')}
                >
                  Mode C1: Contingent (?frontend -&gt; Emits 1.0-bit VOI Prompt)
                </button>
                <button
                  type="button"
                  aria-pressed={omegaMode === 'robust'}
                  className={`btn btn-compact ${omegaMode === 'robust' ? 'btn-primary' : 'btn-secondary'}`}
                  onClick={() => onToggleOmegaMode('robust')}
                >
                  Mode C2: Robust Backup Present (EXISTS_FORALL_ROBUST -&gt; Zero Questions!)
                </button>
              </div>
            )}

            {/* Scenario D Preventive Prerequisite 1-Click Unlock */}
            {activeScenarioKey === 'prereq' && (
              <div className="pill-row top-gap-sm">
                <button
                  type="button"
                  className="btn btn-primary btn-compact"
                  onClick={() => onVerifyPersonSkill('aurora', 'devops')}
                >
                  <CheckCircleIcon size={15} /> Grant Preventive Cloud/A11y Sandbox to Aurora (0 Members Displaced)
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Optional Advanced DSL / JSON Inspector */}
      {showDsl && (
        <div className="surface-card dsl-drawer" role="region" aria-label="Advanced DSL and JSON payload inspector">
          <div className="row-between wrap-gap">
            <h3>Advanced Power-User DSL &amp; API Payload Inspector</h3>
            <button type="button" className="btn btn-primary btn-compact" onClick={applyDslChanges}>
              Sync DSL to Visual Studio &amp; Re-Solve
            </button>
          </div>
          <div className="dsl-grid">
            <label className="field-label">
              <span>Tasks DSL (<code>id,skill,durationMin,dep1|dep2,lagMin</code>)</span>
              <textarea rows={4} spellCheck={false} value={dslTasksDraft} onChange={e => setDslTasksDraft(e.target.value)} />
            </label>
            <label className="field-label">
              <span>Current Roster DSL (<code>id@start-end:skill|?unknown</code>)</span>
              <textarea rows={4} spellCheck={false} value={dslTeamDraft} onChange={e => setDslTeamDraft(e.target.value)} />
            </label>
            <label className="field-label">
              <span>Candidate Pool DSL</span>
              <textarea rows={4} spellCheck={false} value={dslCandDraft} onChange={e => setDslCandDraft(e.target.value)} />
            </label>
          </div>
          <details className="json-preview-details">
            <summary>View Exact <code>POST /api/plan</code> JSON Request Body</summary>
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

      {/* Live Solver Verdict, Wildcard Omega Frontier, Repairs & Lock-to-View-3 Action */}
      {plan && (
        <div className={`surface-card verdict-banner ${statusTone}`} role="region" aria-label="Synchronicity R5 Solver Verdict">
          <div className="row-between wrap-gap">
            <div>
              <div className="pill-row">
                <span className="eyebrow-tag">AUTHORITATIVE /API/PLAN SOLVER WITNESS</span>
                <EpistemicStencil
                  kind={plan.status === 'CONDITIONAL_WITNESS' ? 'VOI_PROVISIONAL' : 'SQLITE_AUTHORITY'}
                  compact
                />
              </div>
              <h3 className="verdict-headline">
                {plan.status === 'FEASIBLE_WITNESS' ? (
                  <CheckCircleIcon size={22} />
                ) : (
                  <AlertTriangleIcon size={22} />
                )}
                <span>{plan.status}</span>
                <span className="verdict-sub">({plan.classification})</span>
              </h3>
            </div>

            <div className="telemetry-cluster">
              <div className="metric-pill">
                <span className="metric-label">Search Nodes</span>
                <strong className="metric-value">{plan.search?.nodes} / {plan.search?.limit}</strong>
              </div>
              <div className="metric-pill">
                <span className="metric-label">Wildcard |Omega|</span>
                <strong className="metric-value">
                  {plan.frontier ? `${plan.frontier.worldsCovered} / ${plan.frontier.omegaSize} worlds` : '1 / 1'}
                </strong>
              </div>
              <div className="metric-pill">
                <span className="metric-label">Quantifier</span>
                <strong className="metric-value">{plan.frontier?.quantifierStatus || 'DETERMINISTIC'}</strong>
              </div>
              <div className="metric-pill">
                <span className="metric-label">P9R Question Policy</span>
                <strong className="metric-value">{plan.frontier?.minimumSufficientStop || 'BOUNDED'}</strong>
              </div>
            </div>
          </div>

          {/* FEASIBLE_WITNESS -> Lock Plan & Mint Invite into View 3 */}
          {plan.status === 'FEASIBLE_WITNESS' && (
            <div className="subcard tone-ok top-gap-sm">
              <div className="row-between wrap-gap">
                <div className="prose-measure">
                  <strong>Critical-Path Schedule Verified:</strong> Ready to commit this deliverable crew on Layer-A SQLite and mint a protected single-use SHA-256 invite token.
                </div>
                <div className="pill-row">
                  <button
                    type="button"
                    className="btn btn-primary"
                    disabled={lockingPlan}
                    onClick={onLockPlanAndMintInvite}
                  >
                    <ShieldCheckIcon size={16} />
                    {lockingPlan ? 'Locking Crew & Minting...' : 'Lock Feasible Plan & Mint Invite -> View 3'}
                    <ArrowRightIcon size={14} />
                  </button>
                  <button
                    type="button"
                    className="btn btn-secondary btn-compact"
                    onClick={onOpenCharterExport}
                  >
                    <FileTextIcon size={14} /> Export Crew Charter
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Zero-Question Gate Celebration when Robust with Wildcards */}
          {plan.frontier?.actionStable && (plan.frontier?.wildcards?.length || 0) > 0 && (
            <div className="subcard tone-ok top-gap-sm">
              <strong>P9R Minimum-Sufficient Zero-Question Gate Active:</strong> Even though{' '}
              <code>{plan.frontier.wildcards.map(w => `${w.personId}:?${w.skill}`).join(', ')}</code> is unresolved, an unconditional supported schedule covers all {plan.frontier.omegaSize}/{plan.frontier.omegaSize} Wildcard Omega worlds (<code>EXISTS_FORALL_ROBUST</code>). <strong>0 verification questions emitted!</strong>
            </div>
          )}

          {/* Shannon VOI Verification Prompt */}
          {plan.frontier?.voiQuestion && (
            <div className="subcard tone-warn top-gap-sm">
              <div className="row-between wrap-gap">
                <div className="prose-measure">
                  <div className="pill-row">
                    <strong>
                      Highest-Gain Shannon VOI Verification Prompt ({plan.frontier.voiQuestion.informationGainBits} bits)
                    </strong>
                    <EpistemicStencil kind="VOI_PROVISIONAL" compact />
                  </div>
                  <p className="small-top">
                    Offer a 5-minute micro-work-sample to confirm <code>{plan.frontier.voiQuestion.personId}</code> on{' '}
                    <code>?{plan.frontier.voiQuestion.skill}</code> ({plan.frontier.voiQuestion.reason}).
                  </p>
                </div>
                <button
                  type="button"
                  className="btn btn-primary btn-compact"
                  onClick={() =>
                    onVerifyPersonSkill(plan.frontier.voiQuestion.personId, plan.frontier.voiQuestion.skill)
                  }
                >
                  <CheckCircleIcon size={15} /> Simulate Work-Sample Pass (?{plan.frontier.voiQuestion.skill} -&gt; ✓)
                </button>
              </div>
            </div>
          )}

          {/* Diagnostic & Hall Contention Repairs */}
          {(plan.repairs || []).length > 0 && (
            <div className="repairs-stack top-gap-sm">
              {plan.repairs.map((rep, i) => (
                <div key={i} className="subcard tone-warn">
                  <div className="row-between wrap-gap">
                    <strong>{rep.kind}</strong>
                    <span className="status-chip chip-ok">
                      {rep.displacedCommittedMembers ?? 0} Committed Members Displaced
                    </span>
                  </div>
                  <p className="prose-measure small-top">{rep.explanation}</p>
                  {rep.kind === 'EVIDENCE_REPAIR' && rep.personId && rep.skill && (
                    <button
                      type="button"
                      className="btn btn-secondary btn-compact top-gap-xs"
                      onClick={() => onVerifyPersonSkill(rep.personId, rep.skill)}
                    >
                      Verify {rep.personId}'s {rep.skill} Evidence Now
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Ranked Complementary & Async Baton-Pass Recommendations */}
      {recs && (
        <div className="surface-card" role="region" aria-label="Complementary skill and async UTC baton-pass recommendations">
          <div className="row-between wrap-gap">
            <div>
              <span className="eyebrow-tag">EXPLAINED COMPLEMENTARY &amp; BATON-PASS RANKING (/API/RECOMMENDATIONS)</span>
              <h3 className="card-subtitle">
                Recommended Builders to Unlock or Strengthen Your Deliverable
              </h3>
            </div>
            <span className="badge-pill">Baseline: {recs.baselineStatus}</span>
          </div>

          {(recs.recommendations || []).length === 0 ? (
            <p className="muted-copy top-gap-sm">
              All candidates in your pool have already been added to the active simulation roster!
            </p>
          ) : (
            <div className="rec-cards-grid top-gap-sm">
              {recs.recommendations.map((r, rankIdx) => (
                <article
                  key={r.candidateId}
                  className={`rec-card ${r.restoresFeasibility ? 'rec-featured' : ''}`}
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
                      onClick={() => onAddCandidateToTeam(r.candidateId)}
                    >
                      <SparklesIcon size={14} /> Add Candidate to Simulation
                    </button>
                  </div>

                  <div className="tag-cluster top-gap-xs">
                    {r.restoresFeasibility && (
                      <span className="status-chip chip-ok">✓ Restores Full Feasibility</span>
                    )}
                    {r.upgradesToConditional && (
                      <span className="status-chip chip-warn">Upgrades to Conditional Witness</span>
                    )}
                    {r.asyncBatonPass && (
                      <span className="baton-pill">Async UTC Baton-Pass (0m Overlap!)</span>
                    )}
                    {r.slackGainMin > 0 && (
                      <span className="status-chip chip-ok">+{r.slackGainMin}m Deadline Slack</span>
                    )}
                    <span className="status-chip chip-neutral">0 Committed Members Displaced</span>
                  </div>

                  <p className="prose-measure muted-copy small-top">{r.explanation}</p>
                </article>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Mission Objective + Spatial DAG Visualizer (with Before / After Wipe) */}
      <div className="surface-card">
        <div className="mission-meta-grid">
          <label className="field-label">
            <span>What is your crew trying to build? (Mission Deliverable)</span>
            <input
              type="text"
              value={goalDescription}
              maxLength={240}
              onChange={e => onChangeGoalDescription(e.target.value)}
            />
          </label>

          <label className="field-label">
            <span>Deadline Horizon: <strong>{horizonHours} hours ({horizonMin} minutes)</strong></span>
            <div className="inline-slider-group">
              <input
                type="range"
                min={1}
                max={48}
                step={1}
                value={Math.min(48, Math.max(1, Number(horizonHours) || 4))}
                onChange={e => onChangeHorizonHours(Number(e.target.value))}
              />
              <input
                type="number"
                min={1}
                max={168}
                value={horizonHours}
                onChange={e => onChangeHorizonHours(Math.max(1, Math.min(168, Number(e.target.value) || 1)))}
                className="compact-num-in"
                aria-label="Deadline horizon in hours"
              />
            </div>
          </label>
        </div>

        <TaskDagTimeline
          tasks={tasks}
          horizonMin={horizonMin}
          plan={plan}
          beforeSnapshot={beforeSnapshot}
        />
      </div>

      {/* Visual Task Dependency Builder */}
      <div className="surface-card">
        <div className="row-between wrap-gap">
          <div>
            <h3 className="card-subtitle">Visual Deliverable Task Builder ({tasks.length} / 8 Tasks)</h3>
            <p className="muted-copy small-copy">
              Configure required skills, durations, handoff lag minutes, and prerequisite dependencies visually.
            </p>
          </div>
          <button
            type="button"
            className="btn btn-secondary btn-compact"
            disabled={tasks.length >= 8}
            onClick={addTask}
          >
            <PlusIcon size={15} /> Add Deliverable Task
          </button>
        </div>

        <div className="tasks-editor-grid top-gap-sm">
          {tasks.map((task, idx) => {
            const otherTasks = tasks.filter((_, i) => i !== idx);
            return (
              <div key={idx} className="task-editor-card">
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
                    <span>Task ID</span>
                    <input
                      type="text"
                      value={task.id}
                      onChange={e => updateTask(idx, { id: e.target.value.replace(/[^A-Za-z0-9_.:@-]/g, '') })}
                    />
                  </label>

                  <label className="field-label">
                    <span>Required Skill</span>
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
                    <span>Handoff Lag (min)</span>
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
                    <legend>Depends On (Upstream Prerequisites)</legend>
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
                            {checked ? '✓ ' : ''}after:{ot.id}
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

      {/* Two-Column Visual Contributor & Candidate Studio */}
      <div className="two-col-studio">
        <ContributorListEditor
          title={`Current Crew Roster (${teamPeople.length})`}
          subtitle="Accepted or active simulation teammates"
          people={teamPeople}
          horizonMin={horizonMin}
          onChange={onChangeTeamPeople}
          addDefaultLabel="Add Teammate"
        />

        <ContributorListEditor
          title={`Complementary Candidate Pool (${candidates.length})`}
          subtitle="Ranked by /api/recommendations for feasibility & async UTC baton-pass"
          people={candidates}
          horizonMin={horizonMin}
          onChange={onChangeCandidates}
          addDefaultLabel="Add Candidate"
        />
      </div>
    </section>
  );
}
