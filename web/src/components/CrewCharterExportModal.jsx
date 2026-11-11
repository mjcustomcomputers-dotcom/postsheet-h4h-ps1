import React, { useMemo, useRef, useState } from 'react';
import ModalDialog from './ModalDialog.jsx';
import EpistemicStencil from './EpistemicStencil.jsx';
import { CopyIcon, FileTextIcon, CheckCircleIcon } from '../icons.jsx';

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

  const horizonMin = Math.max(60, Math.round(Number(horizonHours || 4) * 60));

  const scheduleRows = useMemo(() => {
    const metaMap = new Map((plan?.criticalPath || []).map(m => [m.taskId, m]));
    const assignMap = new Map((plan?.witness?.assignments || []).map(a => [a.taskId, a]));
    return (tasks || []).map(t => {
      const m = metaMap.get(t.id);
      const a = assignMap.get(t.id);
      return {
        taskId: t.id,
        skill: t.skill,
        durationMin: t.durationMin,
        deps: (t.after || []).length ? t.after.join(', ') : 'Root',
        slackLabel: m ? (m.slackMin <= 0 ? '0m CRITICAL' : `+${m.slackMin}m`) : 'Pending',
        assignee: a
          ? `${a.evidence === 'unknown' ? '? ' : 'Verified: '}${a.personId} (${a.startMin}..${a.endMin}m)`
          : plan
            ? 'Unassigned'
            : 'Model preview'
      };
    });
  }, [tasks, plan]);

  const rosterRows = useMemo(() => {
    if (selectedTeam?.members?.length) {
      return selectedTeam.members.map(m => ({
        id: m.userId,
        role: m.isLeader ? 'Team Leader' : 'Committed Member',
        source: 'SQLITE_AUTHORITY'
      }));
    }
    return (teamPeople || []).map((p, idx) => ({
      id: p.id,
      role: idx === 0 ? `Simulation Lead (${p.timezone})` : `Simulation Builder (${p.timezone})`,
      source: Object.values(p.skills || {}).includes('unknown') ? 'VOI_PROVISIONAL' : 'SQLITE_AUTHORITY'
    }));
  }, [selectedTeam, teamPeople]);

  const receiptCode = useMemo(() => {
    const raw = JSON.stringify({
      eventId,
      teamId,
      goalDescription,
      status: plan?.status || 'DRAFT',
      tasks: (tasks || []).map(t => t.id),
      roster: rosterRows.map(r => r.id)
    });
    return computeReceiptDigest(raw);
  }, [eventId, teamId, goalDescription, plan, tasks, rosterRows]);

  function buildWhitePaperHtml() {
    const inner = docRef.current ? docRef.current.outerHTML : '';
    return [
      '<!doctype html>',
      '<html lang="en">',
      '<head>',
      '  <meta charset="UTF-8">',
      `  <title>Crew Charter & Seat Receipt - ${teamId}</title>`,
      `  <style>${WHITE_PAPER_STYLES}</style>`,
      '</head>',
      '<body>',
      inner,
      '</body>',
      '</html>'
    ].join('\n');
  }

  function buildPlainTextReceipt() {
    const lines = [
      `POST SHEET | CREW CHARTER & SEAT RECEIPT (${receiptCode})`,
      `Event Scope: ${eventId} | Crew ID: ${teamId} | Prepared By: ${actorId || 'anonymous'}`,
      `Mission Deliverable: ${goalDescription}`,
      `Solver Verdict: ${plan?.status || 'NOT_EVALUATED'} (${plan?.classification || 'PREVIEW'})`,
      `Quantifier / P9R Gate: ${plan?.frontier?.quantifierStatus || 'DETERMINISTIC'} / ${plan?.frontier?.minimumSufficientStop || 'BOUNDED'}`,
      '',
      'ROSTER:',
      ...rosterRows.map(r => `  - ${r.id}: ${r.role} [${r.source}]`),
      '',
      `CRITICAL-PATH SCHEDULE (Horizon ${horizonMin}m):`,
      ...scheduleRows.map(
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

  async function handleCopyWhitePaperHtml() {
    const ok = await copyWithFallback(buildWhitePaperHtml());
    setCopyState(ok ? 'html' : 'err');
    setTimeout(() => setCopyState(''), 2200);
    if (ok) onNotify?.('✓ Copied deterministic #FFFFFF White-Paper Charter HTML!', 'ok');
  }

  async function handleCopyPlainText() {
    const ok = await copyWithFallback(buildPlainTextReceipt());
    setCopyState(ok ? 'text' : 'err');
    setTimeout(() => setCopyState(''), 2200);
    if (ok) onNotify?.('✓ Copied plain-text Crew Charter & Seat Receipt!', 'ok');
  }

  function handlePrintWhitePaper() {
    onNotify?.('Opening browser Print / Save as #FFFFFF PDF dialog...', 'info');
    if (typeof window !== 'undefined' && typeof window.print === 'function') {
      window.print();
    }
  }

  return (
    <ModalDialog
      open={open}
      onClose={onClose}
      eyebrow="DARK-SCREEN COMFORT PREVIEW -> #FFFFFF WHITE-PAPER EXPORT"
      title="Crew Feasibility Charter & Attributable Seat Receipt"
    >
      <div className="row-between wrap-gap no-print">
        <p className="muted-copy small-copy prose-measure">
          Rendered in calm low-glare dark mode on screen (<code>.document-preview</code> wrapper outside <code>docRef</code>), while exporting deterministic <code>#FFFFFF</code> white-paper HTML and print/PDF sheets.
        </p>

        <div className="pill-row">
          <button type="button" className="btn btn-secondary btn-compact" onClick={handleCopyWhitePaperHtml}>
            <CopyIcon size={14} />
            {copyState === 'html' ? 'Copied #FFFFFF HTML!' : 'Copy White-Paper HTML'}
          </button>
          <button type="button" className="btn btn-secondary btn-compact" onClick={handleCopyPlainText}>
            <CopyIcon size={14} />
            {copyState === 'text' ? 'Copied Text Receipt!' : 'Copy Text Summary'}
          </button>
          <button type="button" className="btn btn-primary btn-compact" onClick={handlePrintWhitePaper}>
            <FileTextIcon size={14} /> Print / Save #FFFFFF PDF
          </button>
        </div>
      </div>

      {/* Dark-comfort screen preview wrapper OUTSIDE docRef */}
      <div className="document-preview charter-print-target">
        <article ref={docRef} className="charter-sheet">
          <header className="charter-header">
            <div>
              <div className="charter-eyebrow">POST SHEET x SYNCHRONICITY R5 · DETERMINISTIC CHARTER</div>
              <h1 className="charter-h1">Crew {teamId} · Deliverable &amp; Seat Receipt</h1>
              <div className="charter-meta">
                Receipt ID: {receiptCode} · Event: {eventId} · Horizon: {horizonHours}h ({horizonMin}m)
              </div>
            </div>
            <div className="pill-row">
              <EpistemicStencil kind="SQLITE_AUTHORITY" compact />
              {plan?.frontier?.wildcards?.length > 0 && <EpistemicStencil kind="VOI_PROVISIONAL" compact />}
            </div>
          </header>

          <section className="charter-section">
            <h3>1. Mission Deliverable &amp; Solver Verification</h3>
            <p className="small-copy">{goalDescription}</p>
            <div className="charter-kv-grid top-gap-xs">
              <div className="charter-kv">
                <span>Feasibility Verdict</span>
                <strong>{plan?.status || 'MODEL_PREVIEW'} ({plan?.classification || 'UNSOLVED'})</strong>
              </div>
              <div className="charter-kv">
                <span>Wildcard Omega &amp; P9R</span>
                <strong>
                  {plan?.frontier
                    ? `${plan.frontier.quantifierStatus} (${plan.frontier.worldsCovered}/${plan.frontier.omegaSize})`
                    : 'DETERMINISTIC (1/1)'}
                </strong>
              </div>
              <div className="charter-kv">
                <span>Seat Occupancy</span>
                <strong>
                  {selectedTeam
                    ? `${selectedTeam.members.length} / ${selectedTeam.maxSize} SQLite Committed`
                    : `${teamPeople.length} Simulation Builders`}
                </strong>
              </div>
            </div>
          </section>

          <section className="charter-section">
            <h3>2. Crew Seat Roster &amp; Provenance</h3>
            <table className="charter-table">
              <thead>
                <tr>
                  <th scope="col">Builder ID</th>
                  <th scope="col">Role / UTC Context</th>
                  <th scope="col">Provenance Stencil</th>
                </tr>
              </thead>
              <tbody>
                {rosterRows.map(r => (
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
            <h3>3. Critical-Path Task Schedule &amp; Backward Slack</h3>
            <table className="charter-table">
              <thead>
                <tr>
                  <th scope="col">Task</th>
                  <th scope="col">Skill</th>
                  <th scope="col">Duration</th>
                  <th scope="col">Prerequisites</th>
                  <th scope="col">Slack</th>
                  <th scope="col">Assigned Witness</th>
                </tr>
              </thead>
              <tbody>
                {scheduleRows.map(s => (
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
              <h3>4. Active Single-Use Invitation Reference</h3>
              <div className="charter-meta">
                Team: {issuedInvite.teamId || teamId} · SHA-256 Hashed Single-Use Invite Issued (Expires epoch {issuedInvite.expiresAt})
              </div>
            </section>
          )}

          <footer className="charter-footer">
            Layer-A seats are committed exclusively via SQLite BEGIN IMMEDIATE serializable transactions. Layer-B collaboration envelopes remain PEER_CIPHERTEXT_ONLY and never forge membership authority.
          </footer>
        </article>
      </div>

      <div className="row-end no-print">
        <button type="button" className="btn btn-primary" onClick={onClose}>
          <CheckCircleIcon size={16} /> Close Charter Preview
        </button>
      </div>
    </ModalDialog>
  );
}
