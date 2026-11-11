import React, { useMemo, useRef, useState } from 'react';
import ModalDialog from './ModalDialog.jsx';
import EpistemicStencil from './EpistemicStencil.jsx';
import { CopyIcon, FileTextIcon, CheckCircleIcon, DownloadIcon } from '../icons.jsx';
import {
  escapeHtml,
  derivePlanExportModel,
  buildTeamPlanWhitePaperHtml,
  triggerTeamPlanDownload
} from '../charter-whitepaper.js';

export { escapeHtml, derivePlanExportModel, buildTeamPlanWhitePaperHtml, triggerTeamPlanDownload };

export default function CrewCharterExportModal({
  open,
  onClose,
  eventId,
  teamId,
  actorId,
  selectedTeam,
  allowServerTeamBinding = true,
  goalDescription,
  horizonHours,
  tasks,
  teamPeople,
  plan,
  issuedInvite,
  onNotify
}) {
  const docRef = useRef(null);
  const [copyState, setCopyState] = useState('');

  const effectiveTeamId = allowServerTeamBinding ? teamId : 'plan-preview';
  const exportInput = {
    eventId,
    teamId: effectiveTeamId,
    actorId,
    selectedTeam,
    allowServerTeamBinding,
    goalDescription,
    horizonHours,
    tasks,
    teamPeople,
    plan,
    issuedInvite: allowServerTeamBinding ? issuedInvite : null
  };

  const model = useMemo(
    () => derivePlanExportModel(exportInput),
    [
      eventId,
      effectiveTeamId,
      actorId,
      selectedTeam,
      allowServerTeamBinding,
      goalDescription,
      horizonHours,
      tasks,
      teamPeople,
      plan,
      issuedInvite
    ]
  );

  function buildPlainTextReceipt() {
    const lines = [
      `POST SHEET | TEAM PLAN & SEAT SUMMARY (${model.receiptCode})`,
      `Event: ${eventId} | Team: ${effectiveTeamId} | Acting as: ${actorId || 'guest'}`,
      `Goal: ${goalDescription}`,
      `Summary: ${model.plainVerdict}`,
      `Engineering Verdict: ${plan?.status || 'NOT_EVALUATED'} (${plan?.classification || 'PREVIEW'})`,
      '',
      'TEAM MEMBERS:',
      ...model.rosterRows.map(r => `  - ${r.id}: ${r.role} [${r.source}]`),
      '',
      `TASK SCHEDULE (${model.horizonMin}m horizon):`,
      ...model.scheduleRows.map(
        s => `  - ${s.taskId} [${s.skill}, ${s.durationMin}m, deps: ${s.deps}] -> ${s.assignee} (${s.slackLabel})`
      )
    ];
    return lines.join('\n');
  }

  async function copyWithFallback(text) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      try {
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
        return true;
      } catch {
        return false;
      }
    }
  }

  function handleDirectDownload() {
    const res = triggerTeamPlanDownload(exportInput);
    if (res) {
      onNotify?.(`Downloaded ${res.filename} (#FFFFFF white-paper HTML)`, 'ok');
    }
  }

  async function handleCopyWhitePaperHtml() {
    const ok = await copyWithFallback(buildTeamPlanWhitePaperHtml(exportInput));
    setCopyState(ok ? 'html' : 'err');
    setTimeout(() => setCopyState(''), 2200);
    if (ok) onNotify?.('Copied #FFFFFF white-paper HTML to clipboard', 'ok');
  }

  async function handleCopyPlainText() {
    const ok = await copyWithFallback(buildPlainTextReceipt());
    setCopyState(ok ? 'text' : 'err');
    setTimeout(() => setCopyState(''), 2200);
    if (ok) onNotify?.('Copied plain-text team plan summary', 'ok');
  }

  function handlePrintWhitePaper() {
    onNotify?.('Opening browser Print / Save as PDF dialog...', 'info');
    if (typeof window !== 'undefined' && typeof window.print === 'function') {
      window.print();
    }
  }

  return (
    <ModalDialog
      open={open}
      onClose={onClose}
      eyebrow="DARK-SCREEN COMFORT PREVIEW -> #FFFFFF WHITE-PAPER FILE"
      title="Team Plan & Server Membership Summary"
    >
      <div className="row-between wrap-gap no-print">
        <p className="muted-copy small-copy prose-measure">
          Previewed in low-glare dark comfort on screen; downloads or prints cleanly on <code>#FFFFFF</code> white paper.
        </p>

        <div className="pill-row">
          <button type="button" className="btn btn-primary btn-compact" onClick={handleDirectDownload}>
            <DownloadIcon size={14} /> Download HTML
          </button>
          <button type="button" className="btn btn-secondary btn-compact" onClick={handleCopyWhitePaperHtml}>
            <CopyIcon size={14} />
            {copyState === 'html' ? 'Copied HTML!' : 'Copy HTML'}
          </button>
          <button type="button" className="btn btn-secondary btn-compact" onClick={handleCopyPlainText}>
            <CopyIcon size={14} />
            {copyState === 'text' ? 'Copied Text!' : 'Copy Text'}
          </button>
          <button type="button" className="btn btn-secondary btn-compact" onClick={handlePrintWhitePaper}>
            <FileTextIcon size={14} /> Print / Save PDF
          </button>
        </div>
      </div>

      {/* Dark-comfort screen preview wrapper OUTSIDE docRef */}
      <div className="document-preview charter-print-target">
        <article ref={docRef} className="charter-sheet">
          <header className="charter-header">
            <div>
              <div className="charter-eyebrow">POST SHEET · TEAM PLAN &amp; SERVER MEMBERSHIP SUMMARY</div>
              <h1 className="charter-h1">Team {effectiveTeamId} · Plan &amp; Schedule</h1>
              <div className="charter-meta">
                Receipt ID: {model.receiptCode} · Event: {eventId} · Horizon: {horizonHours}h ({model.horizonMin}m)
              </div>
            </div>
            <div className="pill-row">
              <EpistemicStencil kind={model.selectedTeam ? 'SQLITE_AUTHORITY' : 'PLAN_PREVIEW'} compact />
              {plan?.frontier?.wildcards?.length > 0 && <EpistemicStencil kind="VOI_PROVISIONAL" compact />}
            </div>
          </header>

          <section className="charter-section">
            <h3>1. Goal &amp; Plan Readiness</h3>
            <p className="small-copy">{goalDescription}</p>
            <div className="charter-kv-grid top-gap-xs">
              <div className="charter-kv">
                <span>Plan Summary</span>
                <strong>{model.plainVerdict}</strong>
              </div>
              <div className="charter-kv">
                <span>Engineering Proof</span>
                <strong>
                  {plan?.status || 'MODEL_PREVIEW'} ({plan?.classification || 'UNSOLVED'})
                </strong>
              </div>
              <div className="charter-kv">
                <span>Team Spots</span>
                <strong>
                  {model.selectedTeam
                    ? `${model.selectedTeam.members.length} / ${model.selectedTeam.maxSize} Confirmed by server`
                    : `${teamPeople.length} in plan preview (not joined yet)`}
                </strong>
              </div>
            </div>
          </section>

          <section className="charter-section">
            <h3>2. Team Members &amp; Status</h3>
            <table className="charter-table">
              <thead>
                <tr>
                  <th scope="col">Person</th>
                  <th scope="col">Role / Time Zone</th>
                  <th scope="col">Provenance</th>
                </tr>
              </thead>
              <tbody>
                {model.rosterRows.map(r => (
                  <tr key={r.id}>
                    <td><code>{r.id}</code></td>
                    <td>{r.role}</td>
                    <td><EpistemicStencil kind={r.source} compact /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          <section className="charter-section">
            <h3>3. Task Schedule &amp; Dependencies</h3>
            <table className="charter-table">
              <thead>
                <tr>
                  <th scope="col">Task</th>
                  <th scope="col">Skill</th>
                  <th scope="col">Duration</th>
                  <th scope="col">Depends On</th>
                  <th scope="col">Slack</th>
                  <th scope="col">Assignment</th>
                </tr>
              </thead>
              <tbody>
                {model.scheduleRows.map(s => (
                  <tr key={s.taskId}>
                    <td><code>{s.taskId}</code></td>
                    <td>{s.skill}</td>
                    <td>{s.durationMin}m</td>
                    <td>{s.deps}</td>
                    <td>{s.slackLabel}</td>
                    <td>{s.assignee}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          {allowServerTeamBinding && issuedInvite?.code && (!teamId || !issuedInvite.teamId || issuedInvite.teamId === teamId) && (
            <section className="charter-section">
              <h3>
                {issuedInvite.claimedBy ? '4. Single-Use Invite Receipt' : '4. Active Single-Use Invite Reference'}
              </h3>
              <div className="charter-meta">
                {issuedInvite.claimedBy
                  ? `Team: ${issuedInvite.teamId || teamId} · Single-use SHA-256 invite accepted by ${issuedInvite.claimedBy} (confirmed by server)`
                  : `Team: ${issuedInvite.teamId || teamId} · Single-use SHA-256 invite issued (Expires epoch ${issuedInvite.expiresAt})`}
              </div>
            </section>
          )}

          <footer className="charter-footer">
            Server membership changes run inside atomic SQLite BEGIN IMMEDIATE transactions. Preview plans and peer-relayed messages never grant membership without server confirmation.
          </footer>
        </article>
      </div>

      <div className="row-end no-print">
        <button type="button" className="btn btn-primary" onClick={onClose}>
          <CheckCircleIcon size={16} /> Close Preview
        </button>
      </div>
    </ModalDialog>
  );
}
