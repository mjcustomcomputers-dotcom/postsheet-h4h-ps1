import React, { useEffect, useState, useCallback, useRef } from 'react';
import { getOrCreateClaimOperation, finishClaimOperation } from './claim-operation.js';

const PRESETS = {
  baton: {
    label: 'Async UTC Baton-Pass',
    goal: 'Ship race-safe API + UI + integration across Arkansas (UTC-6) and India (UTC+5:30)',
    hours: 8,
    tasks: 'api,backend,120\nui,frontend,180\nintegration,integrate,60,api|ui',
    people: 'aurora@0-240:backend|?design\nkai@0-240:frontend',
    candidates: 'priya@240-480:integrate\nliam@0-180:frontend'
  },
  hall: {
    label: 'Hall Capacity Deficit',
    goal: 'Deliver simultaneous backend and database migration in 2 hours',
    hours: 2,
    tasks: 'api,backend,120\nschema,database,120',
    people: 'aurora@0-120:backend|database\nkai@0-120:frontend',
    candidates: 'mateo@0-120:database\nnoor@0-120:design'
  },
  omega: {
    label: 'Wildcard Omega (Zero-Question vs VOI)',
    goal: 'Build core API and accessible React client with unverified secondary skill',
    hours: 4,
    tasks: 'api,backend,90\nui,frontend,90,api',
    people: 'aurora@0-240:backend|?frontend\nkai@0-240:frontend',
    candidates: 'priya@120-240:?integrate'
  }
};

function parseTasks(source) {
  return source.split('\n').map(x => x.trim()).filter(Boolean).map(row => {
    const [id, skill, duration, deps = ''] = row.split(',').map(x => x.trim());
    return {
      id,
      skill,
      durationMin: Number(duration),
      after: deps ? deps.split('|').map(s => s.trim()).filter(Boolean) : []
    };
  });
}

function parsePeople(source, baseStart, maxHorizon) {
  return source.split('\n').map(x => x.trim()).filter(Boolean).map(row => {
    const [left, declared = ''] = row.split(':');
    const [rawId, winSpec = ''] = left.trim().split('@');
    let windows = [{ start: baseStart, end: baseStart + maxHorizon }];
    let timezone = 'UTC-flex';
    if (winSpec && winSpec.includes('-')) {
      const [ws, we] = winSpec.split('-').map(n => Number(n.trim()));
      if (Number.isFinite(ws) && Number.isFinite(we) && we > ws) {
        windows = [{ start: baseStart + ws, end: baseStart + we }];
        timezone = `T+${ws}m..T+${we}m`;
      }
    }
    const abilities = {};
    for (const skill of declared.split('|').map(s => s.trim()).filter(Boolean)) {
      const isUnknown = skill.startsWith('?');
      abilities[isUnknown ? skill.slice(1) : skill] = { support: !isUnknown, refute: false };
    }
    return { id: rawId.trim(), timezone, abilities, windows, consent: true };
  });
}

async function readJson(response) {
  const body = await response.json();
  if (!response.ok) throw Error(body.error || ('HTTP_' + response.status));
  return body;
}

export default function App() {
  const [eventId, setEventId] = useState('seed-event');
  const [actorId, setActorId] = useState('');
  const [token, setToken] = useState('');
  const [relayToken, setRelayToken] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [teamId, setTeamId] = useState('crew-alpha');
  const [transferTarget, setTransferTarget] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [lastInvite, setLastInvite] = useState('');

  const [goal, setGoal] = useState(PRESETS.baton.goal);
  const [hours, setHours] = useState(PRESETS.baton.hours);
  const [tasks, setTasks] = useState(PRESETS.baton.tasks);
  const [people, setPeople] = useState(PRESETS.baton.people);
  const [candidates, setCandidates] = useState(PRESETS.baton.candidates);

  const [board, setBoard] = useState([]);
  const [selectedTeam, setSelectedTeam] = useState(null);
  const [auditRows, setAuditRows] = useState([]);
  const [plan, setPlan] = useState(null);
  const [recs, setRecs] = useState(null);
  const [raceReceipt, setRaceReceipt] = useState(null);

  const [wanOffline, setWanOffline] = useState(false);
  const [queuedClaim, setQueuedClaim] = useState(null);
  const [peerNoteText, setPeerNoteText] = useState('API schema frozen; ready for UI integration handoff.');
  const [peerNotes, setPeerNotes] = useState([]);
  const [glueResult, setGlueResult] = useState(null);

  const [message, setMessage] = useState('');
  const [joining, setJoining] = useState(false);
  const joiningLock = useRef(false);
  const [authorityState, setAuthorityState] = useState('checking');

  const refresh = useCallback(async () => {
    if (wanOffline) {
      setAuthorityState('direct uplink offline (relayed via peer)');
      return;
    }
    if (!/^[a-zA-Z0-9_.:@-]{1,128}$/.test(eventId)) {
      setAuthorityState('invalid event scope');
      return;
    }
    try {
      const r = await fetch('/api/events/' + encodeURIComponent(eventId) + '/board?limit=30', { cache: 'no-store' });
      const data = await readJson(r);
      setBoard(data.teams || []);
      setAuthorityState('direct authority reachable');
    } catch (e) {
      setAuthorityState('authority unreachable');
      setMessage('BOARD | ' + e.message);
    }
  }, [eventId, wanOffline]);

  useEffect(() => {
    refresh();
    const timer = setInterval(refresh, 5000);
    return () => clearInterval(timer);
  }, [refresh]);

  useEffect(() => {
    if (wanOffline || !/^[a-zA-Z0-9_.:@-]{1,128}$/.test(eventId)) return;
    const stream = new EventSource('/api/events/' + encodeURIComponent(eventId) + '/stream');
    stream.addEventListener('board', refresh);
    return () => stream.close();
  }, [eventId, wanOffline, refresh]);

  async function send(path, body, overrideToken) {
    const useTok = overrideToken || token.trim();
    if (!useTok) throw Error('Sign in or select a demo persona first');
    return readJson(await fetch(path, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: 'Bearer ' + useTok },
      body: JSON.stringify(body)
    }));
  }

  async function getAuth(path) {
    if (!token.trim()) throw Error('Sign in or select a demo persona first');
    return readJson(await fetch(path, {
      headers: { authorization: 'Bearer ' + token.trim() },
      cache: 'no-store'
    }));
  }

  async function switchPersona(persona) {
    try {
      const main = await readJson(await fetch('/api/auth/demo', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ actorId: persona, eventId, maxSize: 4 })
      }));
      const relay = await readJson(await fetch('/api/auth/demo', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ actorId: 'relay-mateo', eventId, maxSize: 4 })
      }));
      setActorId(main.actorId);
      setToken(main.token);
      setRelayToken(relay.token);
      setMessage(`AUTH | Active actor '${main.actorId}' (peer relay 'relay-mateo' armed)`);
      refresh();
    } catch (e) {
      setMessage('AUTH | ' + e.message);
    }
  }

  async function handleAccountAuth(mode) {
    try {
      const r = await readJson(await fetch('/api/auth/' + mode, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ username: username.trim(), password })
      }));
      setActorId(r.actorId);
      setToken(r.token);
      setPassword('');
      setMessage(`AUTH | ${mode === 'register' ? 'Registered' : 'Signed in'} as '${r.actorId}'`);
    } catch (e) {
      setMessage('AUTH | ' + e.message);
    }
  }

  function applyPreset(key) {
    const p = PRESETS[key];
    setGoal(p.goal);
    setHours(p.hours);
    setTasks(p.tasks);
    setPeople(p.people);
    setCandidates(p.candidates);
    setPlan(null);
    setRecs(null);
  }

  async function solve() {
    const start = 0;
    const horizon = Math.round(Number(hours) * 60);
    try {
      const result = await send('/api/plan', {
        goal: { id: 'mission-goal', description: goal, startMin: start, deadlineMin: horizon, tasks: parseTasks(tasks) },
        people: parsePeople(people, start, horizon),
        maxNodes: 5000
      });
      setPlan(result);
      setMessage(`PLANNER | ${result.status} (${result.classification})`);
    } catch (e) {
      setPlan(null);
      setMessage('PLANNER | ' + e.message);
    }
  }

  async function runRecommendations() {
    const start = 0;
    const horizon = Math.round(Number(hours) * 60);
    try {
      const result = await send('/api/recommendations', {
        goal: { id: 'mission-goal', description: goal, startMin: start, deadlineMin: horizon, tasks: parseTasks(tasks) },
        teamPeople: parsePeople(people, start, horizon),
        candidates: parsePeople(candidates, start, horizon)
      });
      setRecs(result);
      setMessage(`RECOMMENDER | Evaluated ${result.recommendations?.length || 0} complementary candidates`);
    } catch (e) {
      setRecs(null);
      setMessage('RECOMMENDER | ' + e.message);
    }
  }

  async function inspectTeam(tid) {
    try {
      const detail = await readJson(await fetch(`/api/events/${encodeURIComponent(eventId)}/teams/${encodeURIComponent(tid)}`, { cache: 'no-store' }));
      setSelectedTeam(detail);
      setTeamId(tid);
      if (token.trim()) {
        const aud = await getAuth(`/api/events/${encodeURIComponent(eventId)}/audit`);
        setAuditRows(aud.audit || []);
      }
    } catch (e) {
      setMessage('INSPECT | ' + e.message);
    }
  }

  async function loadAudit() {
    try {
      const aud = await getAuth(`/api/events/${encodeURIComponent(eventId)}/audit`);
      setAuditRows(aud.audit || []);
      setMessage(`AUDIT | Loaded ${aud.audit?.length || 0} attributable records`);
    } catch (e) {
      setMessage('AUDIT | ' + e.message);
    }
  }

  async function run50WayRace() {
    try {
      const res = await send('/api/demo/race-50', {});
      setRaceReceipt(res);
      setMessage(`RACE ORACLE | 50 contenders -> ${res.committed} winner (${res.winner}), ${res.rejected} rejected in ${res.elapsedMs}ms`);
    } catch (e) {
      setMessage('RACE | ' + e.message);
    }
  }

  async function execute(path, body) {
    try {
      const result = await send(path, body);
      setMessage('AUTHORITY | ' + (result.status || 'OK') + ' | ' + JSON.stringify(result));
      await refresh();
      if (selectedTeam?.teamId === teamId) inspectTeam(teamId);
      return result;
    } catch (e) {
      setMessage('REQUEST | ' + e.message);
      return null;
    }
  }

  async function createInvite() {
    const r = await execute('/api/invitations', { eventId, teamId, expiresAt: Date.now() + 600000 });
    if (r?.code) {
      setLastInvite(r.code);
      setInviteCode(r.code);
    }
  }

  async function joinSeat() {
    if (joiningLock.current) return;
    joiningLock.current = true;
    setJoining(true);
    try {
      const operation = await getOrCreateClaimOperation({
        eventId,
        teamId,
        code: inviteCode,
        store: sessionStorage
      });
      if (wanOffline) {
        setQueuedClaim({ eventId, teamId, code: inviteCode, opId: operation.opId, key: operation.key, actorId });
        setMessage(`LOCAL OUTBOX | Direct WAN offline. Retained opId '${operation.opId}' for peer relay forwarding (seat NOT yet confirmed).`);
        return;
      }
      const result = await send('/api/invitations/claim', {
        eventId,
        teamId,
        code: inviteCode,
        opId: operation.opId
      });
      if (result.status === 'COMMITTED') finishClaimOperation(sessionStorage, operation.key);
      setQueuedClaim(null);
      setMessage(`AUTHORITY | ${result.status}${result.replayed ? ' (idempotent replay recovered original commit)' : ' (fresh seat committed)'}`);
      await refresh();
    } catch (e) {
      setMessage('CLAIM | ' + e.message + ' | opId preserved for safe retry');
    } finally {
      joiningLock.current = false;
      setJoining(false);
    }
  }

  async function forwardQueuedViaPeer() {
    if (!queuedClaim) return;
    try {
      let useRelayTok = relayToken;
      if (!useRelayTok) {
        const relay = await readJson(await fetch('/api/auth/demo', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ actorId: 'relay-mateo', eventId, maxSize: 4 })
        }));
        useRelayTok = relay.token;
        setRelayToken(useRelayTok);
      }
      const res = await send('/api/peer/relay-claim', {
        claimantToken: token,
        eventId: queuedClaim.eventId,
        teamId: queuedClaim.teamId,
        code: queuedClaim.code,
        opId: queuedClaim.opId
      }, useRelayTok);
      setMessage(`PEER RELAY -> LAYER A | ${res.status} for '${res.actorId}' via '${res.relayedBy}' (opId '${res.opId}'). Toggle WAN online & click Request Membership to verify idempotent replay!`);
    } catch (e) {
      setMessage('PEER RELAY | ' + e.message);
    }
  }

  async function sendPeerNote() {
    try {
      const opId = 'note-' + crypto.randomUUID().slice(0, 12);
      const r = await send('/api/peer/notes', { eventId, opId, text: peerNoteText, epoch: 1 });
      const list = await getAuth('/api/peer/notes?eventId=' + encodeURIComponent(eventId));
      setPeerNotes(list.notes || []);
      setMessage(`LAYER B | Sealed AES-256-GCM + P-256 artifact (${r.transportStatus}) digest=${r.digest.slice(0, 16)}…`);
    } catch (e) {
      setMessage('LAYER B | ' + e.message);
    }
  }

  async function runContextGlueCheck() {
    try {
      const res = await send('/api/peer/glue', {
        localRecords: [{ id: 'slot-1', personId: 'aurora', taskId: 'api', startMin: 0, endMin: 120, epoch: 1, digest: 'd1', actorId: 'aurora' }],
        peerRecords: [{ id: 'slot-2', personId: 'aurora', taskId: 'schema', startMin: 60, endMin: 150, epoch: 1, digest: 'd2', actorId: 'kai' }]
      });
      setGlueResult(res);
      setMessage(`CONTEXT GLUE | ${res.status} (${res.obstructions.length} overlap obstruction detected)`);
    } catch (e) {
      setMessage('CONTEXT GLUE | ' + e.message);
    }
  }

  return (
    <div className="shell">
      <a href="#workspace" className="skip">Skip to work area</a>
      <header className="top">
        <div>
          <span className="eyebrow">POST SHEET × SYNCHRONICITY · HACK4HACK PS1</span>
          <h1>Ability &amp; Purpose Crew Network</h1>
          <p className="sub">Start from the deliverable. Prove capacity, handoffs, and Wildcard Omega guards. Commit scarce seats atomically while collaborating across peer paths.</p>
          <div className="persona-bar" role="group" aria-label="Quick persona & account sign-in">
            <span className="muted">Quick Persona:</span>
            {['leader-aurora', 'builder-kai', 'builder-priya'].map(p => (
              <button key={p} type="button" className={actorId === p ? '' : 'subtle'} onClick={() => switchPersona(p)}>
                {p}
              </button>
            ))}
            <input className="compact-in" placeholder="username" aria-label="Account username" value={username} onChange={e => setUsername(e.target.value)} />
            <input className="compact-in" type="password" placeholder="password (8+)" aria-label="Account password" value={password} onChange={e => setPassword(e.target.value)} />
            <button type="button" className="subtle" onClick={() => handleAccountAuth('register')}>Register</button>
            <button type="button" className="subtle" onClick={() => handleAccountAuth('login')}>Sign In</button>
          </div>
        </div>
        <div className="indicators" aria-label="Three-coordinate network state">
          <span><i className={`dot ${wanOffline ? 'warn' : ''}`} /> Authority: {authorityState}</span>
          <span><i className="dot" /> Peer Path: AES-GCM + P-256 relay active</span>
          <span><i className="dot" /> Identity: {actorId || 'unauthenticated'}</span>
        </div>
      </header>

      <main id="workspace" className="grid">
        <section className="panel plan-panel" aria-labelledby="goal-heading">
          <div className="row">
            <h2 id="goal-heading">01 / Outcome, Wildcard Omega &amp; Timezones</h2>
          </div>
          <div className="buttonrow">
            {Object.entries(PRESETS).map(([k, v]) => (
              <button key={k} type="button" className="subtle small-btn" onClick={() => applyPreset(k)}>{v.label}</button>
            ))}
          </div>
          <label>Purpose or deliverable
            <input value={goal} onChange={e => setGoal(e.target.value)} maxLength={250} />
          </label>
          <label>Deadline horizon (hours)
            <input type="number" min="1" max="168" value={hours} onChange={e => setHours(e.target.value)} />
          </label>
          <label>Tasks (id, skill, durationMin, dep1|dep2)
            <textarea rows="4" spellCheck="false" value={tasks} onChange={e => setTasks(e.target.value)} />
          </label>
          <label>Current roster (name@startMin-endMin:skill|?unknownSkill)
            <textarea rows="3" spellCheck="false" value={people} onChange={e => setPeople(e.target.value)} />
          </label>
          <label>Candidate pool for complementary + UTC baton-pass matching
            <textarea rows="3" spellCheck="false" value={candidates} onChange={e => setCandidates(e.target.value)} />
          </label>
          <div className="buttonrow">
            <button type="button" onClick={solve}>Evaluate Envelope</button>
            <button type="button" className="subtle" onClick={runRecommendations}>Recommend &amp; Repair</button>
          </div>

          {plan && (
            <div className="result" role="region" aria-label="Planning result">
              <strong>{plan.status} · {plan.classification}</strong>
              <div className="muted">Nodes: {plan.search?.nodes}/{plan.search?.limit} | Quantifier: {plan.frontier?.quantifierStatus || 'BOUNDED'} | Stop Policy: {plan.frontier?.minimumSufficientStop}</div>
              {(plan.witness?.assignments || []).map((a, i) => (
                <div className="assignment" key={a.taskId + '-' + i}>
                  <b>{a.taskId}</b> → {a.personId} ({a.skill}, {a.evidence}) [{a.startMin}m..{a.endMin}m]
                </div>
              ))}
              {plan.frontier?.voiQuestion && (
                <p className="guard-box">VOI Next Question ({plan.frontier.voiQuestion.informationGainBits} bits): Confirm <b>{plan.frontier.voiQuestion.personId}</b> on <b>{plan.frontier.voiQuestion.skill}</b>.</p>
              )}
              {(plan.repairs || []).map((rep, i) => (
                <p key={i} className="repair-box"><b>{rep.kind}:</b> {rep.explanation}</p>
              ))}
            </div>
          )}

          {recs && (
            <div className="result" role="region" aria-label="Complementary recommendations">
              <strong>Complementary Skill &amp; Timezone Ranking</strong>
              {(recs.recommendations || []).map(r => (
                <div className="assignment" key={r.candidateId}>
                  <b>{r.candidateId}</b> ({r.timezoneLabel}) · {r.restoresFeasibility ? 'RESTORES FEASIBILITY' : r.resultingStatus}
                  <div className="muted">{r.explanation}</div>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="panel board-panel" aria-labelledby="board-heading">
          <div className="row">
            <h2 id="board-heading">02 / Authoritative Board, Roster &amp; Race Oracle</h2>
            <button type="button" className="subtle small-btn" onClick={refresh}>Refresh</button>
          </div>
          <label>Event scope
            <input value={eventId} onChange={e => setEventId(e.target.value)} />
          </label>
          <div className="buttonrow">
            <button type="button" onClick={run50WayRace}>Run 50-Claimant Final-Seat Race</button>
            <button type="button" className="subtle" onClick={loadAudit}>View Audit Log</button>
          </div>

          {raceReceipt && (
            <div className="result" role="region" aria-label="50-way race oracle receipt">
              <strong>SQLite BEGIN IMMEDIATE Race Oracle: PASS</strong>
              <div>Contenders: {raceReceipt.contenders} | Winner: <b>{raceReceipt.winner}</b> ({raceReceipt.committed} committed, {raceReceipt.rejected} rejected 409)</div>
              <div className="muted">Roster: {raceReceipt.finalMemberCount}/2 | Invariants: oversize={raceReceipt.invariants.oversize}, orphanLeader={raceReceipt.invariants.orphanLeader} | {raceReceipt.elapsedMs}ms</div>
            </div>
          )}

          <div className="cards" aria-label="Team roster board">
            {board.map(t => (
              <article className="team" key={t.team_id} tabIndex={0} onClick={() => inspectTeam(t.team_id)} onKeyDown={e => e.key === 'Enter' && inspectTeam(t.team_id)}>
                <b>{t.team_id}</b>
                <span>{t.members} / {t.max_size} seats</span>
                <small>Leader: {t.leader}</small>
              </article>
            ))}
            {board.length === 0 && <p className="muted">No teams in this event yet. Click a Quick Persona above and create a team.</p>}
          </div>

          {selectedTeam && (
            <div className="result" role="region" aria-label="Selected team roster">
              <strong>Roster: {selectedTeam.teamId} ({selectedTeam.members.length}/{selectedTeam.maxSize})</strong>
              {selectedTeam.members.map(m => (
                <div className="assignment" key={m.userId}>
                  <b>{m.userId}</b> {m.isLeader ? '★ Leader' : '· Member'}
                </div>
              ))}
            </div>
          )}

          {auditRows.length > 0 && (
            <div className="result" role="region" aria-label="Attributable audit log">
              <strong>Attributable Audit Ledger ({auditRows.length})</strong>
              {auditRows.slice(-6).reverse().map(a => (
                <div className="assignment" key={a.id}>
                  <b>{a.action}</b> · actor={a.actor_id} · team={a.team_id} · op={a.op_id}
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="panel action-panel" aria-labelledby="team-heading">
          <h2 id="team-heading">03 / Membership Authority &amp; Layer-B Peer Relay</h2>
          <label>Target team identifier
            <input value={teamId} onChange={e => setTeamId(e.target.value)} />
          </label>
          <div className="buttonrow">
            <button type="button" onClick={() => execute('/api/teams', { eventId, teamId })}>Create Team</button>
            <button type="button" className="subtle" onClick={createInvite}>Issue Invite</button>
            <button type="button" className="subtle" onClick={() => execute('/api/teams/leave', { eventId, teamId })}>Leave Team</button>
          </div>

          {lastInvite && (
            <label>Issued single-use invite code
              <textarea readOnly rows="2" value={lastInvite} />
            </label>
          )}

          <label>Claim seat with invite code (SHA-256 opId retry-safe)
            <input value={inviteCode} onChange={e => setInviteCode(e.target.value)} />
          </label>
          <div className="buttonrow">
            <button type="button" disabled={joining} onClick={joinSeat}>{joining ? 'Submitting…' : 'Request Membership'}</button>
            <button type="button" className={wanOffline ? '' : 'subtle'} onClick={() => setWanOffline(v => !v)}>
              {wanOffline ? 'WAN Dropped (Click to Reconnect)' : 'Simulate Direct WAN Drop'}
            </button>
          </div>

          {queuedClaim && (
            <div className="result">
              <strong>Pending Outbox Operation: {queuedClaim.opId}</strong>
              <p className="muted">Direct uplink is down. Forward signed claim through authorized peer relay without minting a second operation ID.</p>
              <button type="button" onClick={forwardQueuedViaPeer}>Forward Claim via Peer (relay-mateo)</button>
            </div>
          )}

          <label>Transfer leadership to team member
            <div className="row">
              <input placeholder="member userId" value={transferTarget} onChange={e => setTransferTarget(e.target.value)} />
              <button type="button" className="subtle" onClick={() => execute('/api/teams/transfer', { eventId, teamId, newLeaderId: transferTarget })}>Transfer</button>
            </div>
          </label>

          <hr className="sep" />
          <h2>Layer-B Encrypted Notes &amp; Sheaf Overlap Glue</h2>
          <label>Encrypted team artifact (AES-256-GCM + P-256, never grants seat)
            <textarea rows="2" value={peerNoteText} onChange={e => setPeerNoteText(e.target.value)} />
          </label>
          <div className="buttonrow">
            <button type="button" className="subtle" onClick={sendPeerNote}>Seal &amp; Broadcast Note</button>
            <button type="button" className="subtle" onClick={runContextGlueCheck}>Test Overlap Obstruction</button>
          </div>
          {peerNotes.slice(0, 3).map(n => (
            <div className="assignment" key={n.receiptId}>
              <b>{n.actorId}:</b> {n.note} <span className="muted">[{n.transportStatus}]</span>
            </div>
          ))}
          {glueResult && (
            <div className="result">
              <strong>{glueResult.status}</strong>
              {glueResult.obstructions.map((o, i) => <div key={i} className="muted">{o.explanation}</div>)}
            </div>
          )}

          <div aria-live="polite" className="operation">{message || 'Ready. Pick a Quick Persona above to test planning, 50-way race, or WAN-drop relay.'}</div>
        </section>
      </main>
      <footer>Post Sheet × Synchronicity · Layer-A SQLite Serialized Authority + Layer-B Signed Peer Continuity</footer>
    </div>
  );
}
