import React, { useMemo, useRef, useState } from 'react';
import ModalDialog from './ModalDialog.jsx';
import EpistemicStencil from './EpistemicStencil.jsx';
import { CopyIcon, FileTextIcon, CheckCircleIcon, DownloadIcon } from '../icons.jsx';

const WHITE_PAPER_STYLES = `
  body {
    margin: 0;
    padding: 32px;
    background: #FFFFFF;
    color: #0F172A;
    font-family: Inter, ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
    line-height: 1.5;
  }
  .charter-sheet {
    max-width: 860px;
    margin: 0 auto;
    background: #FFFFFF;
    color: #0F172A;
    border: 1px solid #CBD5E1;
    border-radius: 10px;
    padding: 28px 32px;
  }
  .charter-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 16px;
    padding-bottom: 16px;
    border-bottom: 2px solid #0F172A;
    margin-bottom: 18px;
  }
  h1, h2, h3, p { margin: 0; }
  .charter-eyebrow {
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: #0B4F6C;
  }
  .charter-h1 { font-size: 20px; font-weight: 800; margin-top: 4px; color: #0F172A; }
  .charter-meta { font-size: 12px; color: #334155; font-family: ui-monospace, SFMono-Regular, Consolas, monospace; }
  .charter-section { margin-top: 18px; }
  .charter-section h3 { font-size: 14px; font-weight: 700; margin-bottom: 8px; color: #0F172A; }
  .charter-kv-grid {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 10px;
  }
  .charter-kv {
    padding: 10px 12px;
    border: 1px solid #CBD5E1;
    border-radius: 6px;
    background: #F8FAFC;
  }
  .charter-kv span { display: block; font-size: 11px; text-transform: uppercase; color: #475569; }
  .charter-kv strong { font-size: 13px; color: #0F172A; }
  .charter-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 12.5px;
    margin-top: 6px;
  }
  .charter-table th, .charter-table td {
    border: 1px solid #CBD5E1;
    padding: 8px 10px;
    text-align: left;
  }
  .charter-table th { background: #F1F5F9; color: #0F172A; font-weight: 700; }
  .epistemic-stencil {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 2px 7px;
    border-radius: 4px;
    border: 1px solid #64748B;
    font-family: ui-monospace, SFMono-Regular, Consolas, monospace;
    font-size: 10.5px;
    font-weight: 700;
    color: #0F172A;
    background: #F8FAFC;
  }
  .charter-footer {
    margin-top: 20px;
    padding-top: 12px;
    border-top: 1px solid #CBD5E1;
    font-size: 11.5px;
    color: #475569;
  }
`;

function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function computeReceiptDigest(seedStr) {
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  for (let i = 0; i < seedStr.length; i++) {
    const c = seedStr.charCodeAt(i);
    h1 ^= c;
    h1 = Math.imul(h1, 16777619);
    h2 ^= c + i;
    h2 = Math.imul(h2, 2246822519);
  }
  const hex1 = (h1 >>> 0).toString(16).padStart(8, '0');
  const hex2 = (h2 >>> 0).toString(16).padStart(8, '0');
  return `ps1-rcpt-${hex1}${hex2}`;
}

export function derivePlanExportModel({
  eventId = 'seed-event',
  teamId = 'crew-alpha',
  actorId = '',
  selectedTeam = null,
  goalDescription = '',
  horizonHours = 8,
  tasks = [],
  teamPeople = [],
  plan = null,
  issuedInvite = null
}) {
  const horizonMin = Math.max(60, Math.round(Number(horizonHours || 4) * 60));
  const metaMap = new Map((plan?.criticalPath || []).map(m => [m.taskId, m]));
  const assignMap = new Map((plan?.witness?.assignments || []).map(a => [a.taskId, a]));

  const scheduleRows = (tasks || []).map(t => {
    const m = metaMap.get(t.id);
    const a = assignMap.get(t.id);
    return {
      taskId: t.id,
      skill: t.skill,
      durationMin: t.durationMin,
      deps: (t.after || []).length ? t.after.join(', ') : 'None (starts immediately)',
      slackLabel: m ? (m.slackMin <= 0 ? '0m (critical)' : `+${m.slackMin}m`) : 'Pending',
      assignee: a
        ? `${a.evidence === 'unknown' ? 'Unverified: ' : 'Confirmed: '}${a.personId} (${a.startMin}..${a.endMin}m)`
        : plan
          ? 'Uncovered'
          : 'Preview'
    };
  });

  const rosterRows = selectedTeam?.members?.length
    ? selectedTeam.members.map(m => ({
        id: m.userId,
        role: m.isLeader ? 'Team Leader (Server confirmed)' : 'Member (Server confirmed)',
        source: 'SQLITE_AUTHORITY'
      }))
    : (teamPeople || []).map((p, idx) => ({
        id: p.id,
        role: idx === 0 ? `Plan Lead (${p.timezone}) - Preview only` : `Plan Member (${p.timezone}) - Preview only`,
        source: Object.values(p.skills || {}).includes('unknown') ? 'VOI_PROVISIONAL' : 'SQLITE_AUTHORITY'
      }));

  const receiptCode = computeReceiptDigest(
    JSON.stringify({
      eventId,
      teamId,
      goalDescription,
      status: plan?.status || 'DRAFT',
      tasks: (tasks || []).map(t => t.id),
      roster: rosterRows.map(r => r.id)
    })
  );

  const plainVerdict =
    plan?.status === 'FEASIBLE_WITNESS'
      ? 'Plan works: all tasks and hours line up'
      : plan?.status === 'CONDITIONAL_WITNESS'
        ? 'Almost ready: confirm unverified skill'
        : 'Plan incomplete: uncovered task or time conflict';

  return {
    horizonMin,
    scheduleRows,
    rosterRows,
    receiptCode,
    plainVerdict,
    eventId,
    teamId,
    actorId,
    goalDescription,
    horizonHours,
    plan,
    selectedTeam,
    teamPeople,
    issuedInvite
  };
}

export function buildTeamPlanWhitePaperHtml(input) {
  const m = derivePlanExportModel(input);
  const safeTeam = escapeHtml(m.teamId || 'team');
  const rosterHtml = m.rosterRows
    .map(
      r =>
        `<tr><td><code>${escapeHtml(r.id)}</code></td><td>${escapeHtml(r.role)}</td><td><span class="epistemic-stencil">${escapeHtml(r.source)}</span></td></tr>`
    )
    .join('');
  const schedHtml = m.scheduleRows
    .map(
      s =>
        `<tr><td><code>${escapeHtml(s.taskId)}</code></td><td>${escapeHtml(s.skill)}</td><td>${escapeHtml(s.durationMin)}m</td><td>${escapeHtml(s.deps)}</td><td>${escapeHtml(s.slackLabel)}</td><td>${escapeHtml(s.assignee)}</td></tr>`
    )
    .join('');

  return [
    '<!doctype html>',
    '<html lang="en">',
    '<head>',
    '  <meta charset="UTF-8">',
    `  <title>Team Plan & Seat Summary - ${safeTeam}</title>`,
    `  <style>${WHITE_PAPER_STYLES}</style>`,
    '</head>',
    '<body>',
    '  <article class="charter-sheet">',
    '    <header class="charter-header">',
    '      <div>',
    '        <div class="charter-eyebrow">POST SHEET · TEAM PLAN &amp; SERVER MEMBERSHIP SUMMARY</div>',
    `        <h1 class="charter-h1">Team ${safeTeam} · Plan &amp; Schedule</h1>`,
    `        <div class="charter-meta">Receipt ID: ${escapeHtml(m.receiptCode)} · Event: ${escapeHtml(m.eventId)} · Horizon: ${escapeHtml(m.horizonHours)}h (${m.horizonMin}m)</div>`,
    '      </div>',
    '    </header>',
    '    <section class="charter-section">',
    '      <h3>1. Goal &amp; Plan Readiness</h3>',
    `      <p>${escapeHtml(m.goalDescription)}</p>`,
    '      <div class="charter-kv-grid" style="margin-top:10px">',
    `        <div class="charter-kv"><span>Plan Summary</span><strong>${escapeHtml(m.plainVerdict)}</strong></div>`,
    `        <div class="charter-kv"><span>Engineering Status</span><strong>${escapeHtml(m.plan?.status || 'PREVIEW')} (${escapeHtml(m.plan?.classification || 'UNSOLVED')})</strong></div>`,
    `        <div class="charter-kv"><span>Team Spots</span><strong>${
      m.selectedTeam
        ? `${m.selectedTeam.members.length} / ${m.selectedTeam.maxSize} Confirmed by server`
        : `${(m.teamPeople || []).length} in plan preview (not joined yet)`
    }</strong></div>`,
    '      </div>',
    '    </section>',
    '    <section class="charter-section">',
    '      <h3>2. Team Members &amp; Status</h3>',
    '      <table class="charter-table">',
    '        <thead><tr><th>Person</th><th>Role / Time Zone</th><th>Source</th></tr></thead>',
    `        <tbody>${rosterHtml}</tbody>`,
    '      </table>',
    '    </section>',
    '    <section class="charter-section">',
    '      <h3>3. Task Schedule &amp; Dependencies</h3>',
    '      <table class="charter-table">',
    '        <thead><tr><th>Task</th><th>Skill</th><th>Duration</th><th>Depends On</th><th>Slack</th><th>Assignment</th></tr></thead>',
    `        <tbody>${schedHtml}</tbody>`,
    '      </table>',
    '    </section>',
    m.issuedInvite?.code
      ? `    <section class="charter-section"><h3>4. Active Invite Reference</h3><div class="charter-meta">Team: ${escapeHtml(m.issuedInvite.teamId || m.teamId)} · Single-use SHA-256 invite active (expires epoch ${escapeHtml(m.issuedInvite.expiresAt)})</div></section>`
      : '',
    '    <footer class="charter-footer">',
    '      Server membership changes run inside atomic SQLite BEGIN IMMEDIATE transactions. Preview plans and peer-relayed messages never grant membership without server confirmation.',
    '    </footer>',
    '  </article>',
    '</body>',
    '</html>'
  ]
    .filter(Boolean)
    .join('\n');
}

export function triggerTeamPlanDownload(input) {
  if (typeof document === 'undefined') return null;
  const safeId = String(input?.teamId || 'crew')
    .replace(/[^A-Za-z0-9_.-]/g, '-')
    .slice(0, 64) || 'crew';
  const filename = `team-plan-${safeId}.html`;
  const html = buildTeamPlanWhitePaperHtml(input);
  const href = `data:text/html;charset=utf-8,${encodeURIComponent(html)}`;
  const a = document.createElement('a');
  a.setAttribute('href', href);
  a.setAttribute('download', filename);
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  return { filename, href, sizeBytes: html.length };
}

export default function CrewCharterExportModal({
  open,
  onClose,
  eventId,
  teamId,
  actorId,
  selectedTeam,
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

  const exportInput = {
    eventId,
    teamId,
    actorId,
    selectedTeam,
    goalDescription,
    horizonHours,
    tasks,
    teamPeople,
    plan,
    issuedInvite
  };

  const model = useMemo(
    () => derivePlanExportModel(exportInput),
    [eventId, teamId, actorId, selectedTeam, goalDescription, horizonHours, tasks, teamPeople, plan, issuedInvite]
  );

  function buildPlainTextReceipt() {
    const lines = [
      `POST SHEET | TEAM PLAN & SEAT SUMMARY (${model.receiptCode})`,
      `Event: ${eventId} | Team: ${teamId} | Acting as: ${actorId || 'guest'}`,
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
              <h1 className="charter-h1">Team {teamId} · Plan &amp; Schedule</h1>
              <div className="charter-meta">
                Receipt ID: {model.receiptCode} · Event: {eventId} · Horizon: {horizonHours}h ({model.horizonMin}m)
              </div>
            </div>
            <div className="pill-row">
              <EpistemicStencil kind="SQLITE_AUTHORITY" compact />
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
                  {selectedTeam
                    ? `${selectedTeam.members.length} / ${selectedTeam.maxSize} Confirmed by server`
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

          {issuedInvite?.code && (
            <section className="charter-section">
              <h3>4. Active Single-Use Invite Reference</h3>
              <div className="charter-meta">
                Team: {issuedInvite.teamId || teamId} · Single-use SHA-256 invite issued (Expires epoch {issuedInvite.expiresAt})
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
