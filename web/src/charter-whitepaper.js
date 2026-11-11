// Pure-JS Team Plan White-Paper HTML & Self-CSP Exporter (shared by UI + Node security tests)

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

export function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
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

  const matchingServerTeam =
    selectedTeam && (!teamId || selectedTeam.teamId === teamId) ? selectedTeam : null;

  const rosterRows = matchingServerTeam?.members?.length
    ? matchingServerTeam.members.map(m => ({
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
    selectedTeam: matchingServerTeam,
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
    '  <meta http-equiv="Content-Security-Policy" content="default-src \'none\'; style-src \'unsafe-inline\'">',
    `  <title>Team Plan &amp; Seat Summary - ${safeTeam}</title>`,
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
        ? `${escapeHtml(m.selectedTeam.members.length)} / ${escapeHtml(m.selectedTeam.maxSize)} Confirmed by server`
        : `${escapeHtml((m.teamPeople || []).length)} in plan preview (not joined yet)`
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
      ? m.issuedInvite.claimedBy
        ? `    <section class="charter-section"><h3>4. Single-Use Invite Receipt</h3><div class="charter-meta">Team: ${escapeHtml(m.issuedInvite.teamId || m.teamId)} · Single-use SHA-256 invite accepted by ${escapeHtml(m.issuedInvite.claimedBy)} (spot confirmed on server)</div></section>`
        : `    <section class="charter-section"><h3>4. Active Invite Reference</h3><div class="charter-meta">Team: ${escapeHtml(m.issuedInvite.teamId || m.teamId)} · Single-use SHA-256 invite active (expires epoch ${escapeHtml(m.issuedInvite.expiresAt)})</div></section>`
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
  const safeId =
    String(input?.teamId || 'crew')
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
