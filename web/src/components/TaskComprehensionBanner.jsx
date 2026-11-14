import React from 'react';
import { ArrowRightIcon, CheckCircleIcon, ShieldCheckIcon, SparklesIcon } from '../icons.jsx';

const STEP_SPECS = {
  discover: {
    stepNum: 1,
    title: 'Step 1 of 4: Pick a team or person',
    plainGoal: 'Browse open teams below. Pick one team to inspect its spots and skills.',
    consequence: 'Safe to explore: clicking a team only previews it. You have not joined yet.',
    weightOff: 'Zero-Risk Sandbox: preview freely with 0 server lock-in',
    nextLabel: 'Next: Step 2 Check Schedule',
    nextView: 'architect'
  },
  architect: {
    stepNum: 2,
    title: 'Step 2 of 4: Check if hours and skills fit',
    plainGoal: 'Test if your team has the right skills and waking hours to finish every task on time.',
    consequence: 'Local preview only: testing schedules here never locks spots on the server.',
    weightOff: 'Weight-Off Solver: instant timezone math, 0 commitment',
    nextLabel: 'Next: Step 3 Claim Team Spot',
    nextView: 'authority'
  },
  authority: {
    stepNum: 3,
    title: 'Step 3 of 4: Claim or share an official spot',
    plainGoal: 'Join an open team spot on the server, create a single-use invite, or leave cleanly.',
    consequence: 'Server action with 1-click exit: you can leave a team or switch roles at any time.',
    weightOff: '1-Click Reversible: equal join & leave symmetry, Wi-Fi safe',
    nextLabel: 'Next: Step 4 Run Proof & Audit',
    nextView: 'arena'
  },
  arena: {
    stepNum: 4,
    title: 'Step 4 of 4: Verify fairness, speed, and clarity',
    plainGoal: 'Run the 50-person race test or check the live Cognitive Firewall and Comprehension score.',
    consequence: 'Isolated test sandbox: running a race test uses a temporary test team.',
    weightOff: 'Isolated Lab Crew: your real team spot stays untouched',
    nextLabel: 'Back to Step 1 Directory',
    nextView: 'discover'
  }
};

export default function TaskComprehensionBanner({
  visible = true,
  activeView = 'discover',
  actorId = 'guest',
  teamId = '',
  selectedTeamSummary = '',
  planReadyText = 'Not checked yet',
  planComplete = false,
  topReliefHint = '',
  onTriggerReliefHint = null,
  onNavigateView,
  onToggleGuide
}) {
  const spec = STEP_SPECS[activeView] || STEP_SPECS.discover;

  // Even when compact, keep lightweight memory anchors & distress-relief shield in DOM for screen readers & quick recall
  if (!visible) {
    return (
      <aside
        className="task-compass-collapsed no-print"
        aria-label="Task step summary"
        data-task-compass="true"
      >
        <span className="compass-step-chip">
          <strong>{spec.title}</strong>
        </span>
        <span className="sr-only" data-compass-goal="true">{spec.plainGoal}</span>
        <span className="sr-only" data-compass-consequence="true">{spec.consequence}</span>
        <span className="compass-anchor-pill" data-memory-anchor="true">
          You: <code>{actorId || 'guest'}</code>
        </span>
        <span className="compass-anchor-pill" data-memory-anchor="true">
          Team: <code>{teamId || 'none'}</code>
        </span>
        <span className="compass-anchor-pill" data-memory-anchor="true">
          Plan: {planReadyText}
        </span>
        <span className="compass-relief-pill" data-distress-relief="true">
          {spec.weightOff}
        </span>
        {onToggleGuide && (
          <button
            type="button"
            className="btn btn-ghost btn-compact"
            onClick={onToggleGuide}
          >
            Show Step Guide
          </button>
        )}
      </aside>
    );
  }

  return (
    <section
      className={`surface-card task-compass-card no-print ${planComplete ? 'compass-harmony-ready' : ''}`}
      aria-label="Plain-language step guide and saved context"
      data-task-compass="true"
      data-reactive-surface=""
    >
      <div className="task-compass-top">
        <div className="task-compass-heading-group">
          <div className="pill-row wrap-gap">
            <span className="compass-eyebrow">
              <ShieldCheckIcon size={13} /> TASK CLARITY &amp; STRESS-RELIEF GUIDE (COGA)
            </span>
            <span className="compass-relief-pill" data-distress-relief="true">
              <SparklesIcon size={11} /> <span>{spec.weightOff}</span>
            </span>
          </div>
          <strong className="task-compass-title">{spec.title}</strong>
          <p className="task-compass-goal" data-compass-goal="true">
            {spec.plainGoal}
          </p>
        </div>

        <div className="task-compass-actions">
          {!planComplete && topReliefHint && onTriggerReliefHint && (activeView === 'discover' || activeView === 'architect') && (
            <button
              type="button"
              data-reactive-surface=""
              data-purpose-beacon="relief"
              className="btn btn-secondary btn-compact compass-relief-action-btn"
              onClick={onTriggerReliefHint}
              title="Zero-risk preview: test how this teammate completes your schedule"
            >
              <SparklesIcon size={12} />
              <span>{topReliefHint}</span>
            </button>
          )}
          {onNavigateView && (
            <button
              type="button"
              data-reactive-surface=""
              className="btn btn-secondary btn-compact compass-next-btn"
              onClick={() => onNavigateView(spec.nextView)}
            >
              <span>{spec.nextLabel}</span>
              <ArrowRightIcon size={13} />
            </button>
          )}
          {onToggleGuide && (
            <button
              type="button"
              className="btn btn-ghost btn-compact"
              onClick={onToggleGuide}
              aria-label="Minimize Step Guide"
              title="Minimize Step Guide to a compact bar"
            >
              Minimize Step Guide
            </button>
          )}
        </div>
      </div>

      <div className="task-compass-bottom">
        <div className="task-compass-anchors" role="group" aria-label="Pinned memory-free status">
          <span className="compass-anchor-pill" data-memory-anchor="true">
            <span className="anchor-k">Acting as:</span>{' '}
            <code>{actorId || 'guest'}</code>
          </span>
          <span className="compass-anchor-pill" data-memory-anchor="true">
            <span className="anchor-k">Active team:</span>{' '}
            <code>{teamId || 'none'}</code>
            {selectedTeamSummary ? ` (${selectedTeamSummary})` : ''}
          </span>
          <span className={`compass-anchor-pill ${planComplete ? 'anchor-pill-ready' : ''}`} data-memory-anchor="true">
            <span className="anchor-k">Schedule status:</span>{' '}
            <strong>{planComplete ? `★ ${planReadyText}` : planReadyText}</strong>
          </span>
        </div>

        <p className="task-compass-consequence" data-compass-consequence="true">
          <CheckCircleIcon size={13} /> <span>{spec.consequence}</span>
        </p>
      </div>
    </section>
  );
}
