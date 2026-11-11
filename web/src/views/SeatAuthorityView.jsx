import React, { useEffect, useState } from 'react';
import { claimKey } from '../claim-operation.js';
import EpistemicStencil from '../components/EpistemicStencil.jsx';
import { SKILLS_CATALOG, normalizeBuilderId } from '../presets-and-catalog.js';
import { formatHumanActorName } from '../components/Overlays.jsx';
import {
  ShieldCheckIcon,
  CopyIcon,
  ClockIcon,
  CheckCircleIcon,
  LockIcon,
  MeshIcon,
  OutboxIcon,
  RefreshIcon,
  UserIcon,
  SparklesIcon,
  ArrowRightIcon,
  FileTextIcon
} from '../icons.jsx';

function formatCountdown(expiresAt, nowMs) {
  if (!expiresAt) return null;
  const diffSec = Math.max(0, Math.floor((expiresAt - nowMs) / 1000));
  const m = Math.floor(diffSec / 60);
  const s = diffSec % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export default function SeatAuthorityView({
  activeLinkId = null,
  onLinkHover,
  eventId,
  actorId,
  teamId,
  onChangeTeamId,
  board,
  selectedTeam,
  onInspectTeam,
  inviteCode,
  onChangeInviteCode,
  issuedInvite,
  onCreateTeam,
  onCreateInvite,
  onJoinSeat,
  joining,
  onTransferLeader,
  onLeaveTeam,
  wanOffline,
  onToggleWanOffline,
  queuedClaim,
  relayedReceipt,
  replayReceipt,
  onForwardViaPeer,
  onReconnectAndRetryDirect,
  onAutoSetupRelayDemo,
  peerNoteText,
  onChangePeerNoteText,
  peerNotes,
  onSendPeerNote,
  onLoadPeerNotes,
  glueResult,
  onRunGluePreset,
  auditRows,
  onLoadAudit,
  onOpenCharterExport,
  onClaimAsFreshCandidate,
  onNotify
}) {
  const [nowMs, setNowMs] = useState(Date.now());
  const [transferTarget, setTransferTarget] = useState('');
  const [copied, setCopied] = useState(false);
  const [showTechProof, setShowTechProof] = useState(false);
  const [storagePreview, setStoragePreview] = useState({ key: null, savedOpId: null });
  const [customMissionDraft, setCustomMissionDraft] = useState(
    'Ship race-safe civic coordination API with cross-timezone handoff UI'
  );
  const [customSkillsDraft, setCustomSkillsDraft] = useState(['backend', 'frontend', 'integrate']);

  useEffect(() => {
    const t = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function inspectStorageKey() {
      if (!eventId || !teamId || !inviteCode || inviteCode.length < 30) {
        setStoragePreview({ key: null, savedOpId: null });
        return;
      }
      try {
        const k = await claimKey(eventId, teamId, inviteCode);
        if (!cancelled) {
          const saved = typeof sessionStorage !== 'undefined' ? sessionStorage.getItem(k) : null;
          setStoragePreview({ key: k, savedOpId: saved });
        }
      } catch {
        if (!cancelled) setStoragePreview({ key: null, savedOpId: null });
      }
    }
    inspectStorageKey();
    return () => {
      cancelled = true;
    };
  }, [eventId, teamId, inviteCode, queuedClaim, relayedReceipt, replayReceipt, joining]);

  async function copyInvite() {
    if (!issuedInvite?.code) return;
    try {
      await navigator.clipboard.writeText(issuedInvite.code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      onNotify?.('Copied single-use invite code to clipboard.', 'ok');
    } catch {
      try {
        const ta = document.createElement('textarea');
        ta.value = issuedInvite.code;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
        onNotify?.('Copied single-use invite code to clipboard.', 'ok');
      } catch {
        onNotify?.('Select the invite code input to copy manually.', 'warn');
      }
    }
  }

  function toggleCustomSkill(skId) {
    setCustomSkillsDraft(prev => {
      if (prev.includes(skId)) {
        if (prev.length <= 1) {
          onNotify?.('Keep at least one needed skill selected.', 'warn');
          return prev;
        }
        return prev.filter(s => s !== skId);
      }
      return [...prev, skId];
    });
  }

  const countdown = issuedInvite?.expiresAt ? formatCountdown(issuedInvite.expiresAt, nowMs) : null;
  const expired = issuedInvite?.expiresAt && nowMs >= issuedInvite.expiresAt;
  const actorAlreadyInTargetTeam = Boolean(
    actorId &&
      ((selectedTeam &&
        selectedTeam.teamId === teamId &&
        (selectedTeam.leader === actorId ||
          (selectedTeam.members || []).some(m => m.userId === actorId))) ||
        (issuedInvite &&
          issuedInvite.code === inviteCode &&
          issuedInvite.teamId === teamId &&
          issuedInvite.issuedBy === actorId))
  );

  // CRR-08 Salience Transfer: amplify only the single current step; completed steps step back calmly
  const activeStep = replayReceipt
    ? 0
    : relayedReceipt
      ? 3
      : queuedClaim
        ? 2
        : 1;

  const humanActor = formatHumanActorName(actorId, Boolean(actorId));

  return (
    <section aria-labelledby="authority-heading" className="view-section">
      {/* Plain-Language Hero Header */}
      <div className="surface-card hero-strip">
        <div className="row-between wrap-gap">
          <div className="prose-measure">
            <span className="eyebrow-tag">STEP 3 · MANAGE YOUR TEAM, INVITES &amp; OFFLINE CONTINUITY</span>
            <h2 id="authority-heading" className="view-title">
              Keep a join request moving when your connection drops.
            </h2>
            <p className="muted-copy">
              Save the request on your device. A connected teammate can forward it. The server decides whether you join.
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
              aria-expanded={showTechProof}
              className="btn btn-secondary btn-compact"
              onClick={() => setShowTechProof(v => !v)}
            >
              {showTechProof ? 'Hide Engineering Proof' : 'Engineering Proof'}
            </button>
          </div>
        </div>
      </div>

      {/* Guided 3-Step Salience-Transfer Path (CRR-08) */}
      <div className="surface-card theater-card" role="region" aria-label="Offline request forwarding walkthrough">
        <div className="row-between wrap-gap">
          <div className="prose-measure">
            <span className="eyebrow-tag">OFFLINE JOIN WALKTHROUGH · ZERO DUPLICATE SPOTS</span>
            <h3 className="card-subtitle">
              Try saving a join request offline and sending it through a teammate
            </h3>
            <p className="muted-copy small-copy">
              Saving on your device never claims a spot by itself; only the server confirms membership, and reconnecting safely returns the original result.
            </p>
          </div>

          <button
            type="button"
            className="btn btn-primary btn-compact"
            onClick={onAutoSetupRelayDemo}
          >
            <SparklesIcon size={15} /> Prepare example team
          </button>
        </div>

        <div className="theater-steps-grid top-gap-sm">
          {/* STEP 1 */}
          <div
            data-reactive-surface="true"
            className={`theater-step ${
              activeStep === 1
                ? 'step-current-relief'
                : queuedClaim || relayedReceipt || replayReceipt
                  ? 'step-completed-calm'
                  : ''
            }`}
          >
            <div className="step-badge-row">
              <span className="step-num">Step 1</span>
              <span className="badge-pill">
                {wanOffline ? 'Connection dropped' : 'Connected'}
              </span>
            </div>
            <h4>1. Save your request while disconnected</h4>
            <p className="muted-copy small-copy">
              Turn off your direct connection and save your join request on this device.
            </p>
            <div className="stack-actions">
              <button
                type="button"
                aria-pressed={wanOffline}
                className={`btn btn-compact ${wanOffline ? 'btn-warn-solid' : 'btn-secondary'}`}
                onClick={onToggleWanOffline}
              >
                {wanOffline ? 'Disconnected (Click to reconnect)' : '1A. Simulate dropped connection'}
              </button>
              <button
                type="button"
                className="btn btn-primary btn-compact"
                disabled={joining || !inviteCode}
                onClick={onJoinSeat}
              >
                <OutboxIcon size={14} />{' '}
                {wanOffline ? '1B. Save join request on device' : '1B. Join team directly'}
              </button>
            </div>

            {queuedClaim && !relayedReceipt && (
              <div className="outbox-receipt" role="status">
                <strong>Saved on this device. Waiting to send.</strong>
                <div className="small-copy muted-copy">
                  Not joined on server yet ({queuedClaim.actorId} -&gt; {queuedClaim.teamId}).
                </div>
                {showTechProof && (
                  <div className="mono-cell tiny-copy top-gap-xs">opId: {queuedClaim.opId}</div>
                )}
              </div>
            )}
            {(relayedReceipt || replayReceipt) && (
              <div className="small-copy muted-copy top-gap-xs" role="status">
                ✓ Request was saved locally before forwarding.
              </div>
            )}
          </div>

          {/* STEP 2 */}
          <div
            data-reactive-surface="true"
            className={`theater-step ${
              activeStep === 2
                ? 'step-current-relief'
                : relayedReceipt || replayReceipt
                  ? 'step-completed-calm'
                  : ''
            }`}
          >
            <div className="step-badge-row">
              <span className="step-num">Step 2</span>
              <span className="badge-pill">Teammate Mateo</span>
            </div>
            <h4>2. Send through a connected teammate</h4>
            <p className="muted-copy small-copy">
              Mateo has working internet and forwards your signed request without creating a duplicate.
            </p>
            <div className="stack-actions">
              <button
                type="button"
                className="btn btn-primary btn-compact"
                disabled={!queuedClaim}
                onClick={onForwardViaPeer}
              >
                <MeshIcon size={14} /> Send through Mateo
              </button>
            </div>

            {relayedReceipt && (
              <div className="subcard tone-ok small-top" role="status">
                <strong>Sent through Mateo. Confirmed by server.</strong>
                <div className="small-copy">
                  Spot confirmed for <code>{relayedReceipt.actorId}</code> on <code>{relayedReceipt.teamId}</code>.
                </div>
                {showTechProof && (
                  <div className="mono-cell tiny-copy top-gap-xs">
                    via={relayedReceipt.relayedBy} · opId={relayedReceipt.opId} · replayed={String(relayedReceipt.replayed)}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* STEP 3 */}
          <div
            data-reactive-surface="true"
            className={`theater-step ${
              activeStep === 3
                ? 'step-current-relief'
                : replayReceipt
                  ? 'step-completed-calm'
                  : ''
            }`}
          >
            <div className="step-badge-row">
              <span className="step-num">Step 3</span>
              <span className="badge-pill">Safe retry</span>
            </div>
            <h4>3. Reconnect and check the original request</h4>
            <p className="muted-copy small-copy">
              When your connection comes back, checking the same request returns the original server result with zero duplicate spots.
            </p>
            <div className="stack-actions">
              <button
                type="button"
                className="btn btn-primary btn-compact"
                disabled={!queuedClaim && !relayedReceipt}
                onClick={onReconnectAndRetryDirect}
              >
                <CheckCircleIcon size={15} /> Reconnect &amp; check request
              </button>
            </div>

            {replayReceipt && (
              <div className="subcard tone-ok small-top" role="status">
                <strong>The server returned the original result for this request.</strong>
                <div className="small-copy">
                  Zero duplicate spots added; saved local request cleaned up automatically.
                </div>
                {showTechProof && (
                  <div className="mono-cell tiny-copy top-gap-xs">
                    status={replayReceipt.status} · replayed={String(replayReceipt.replayed)}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Main Two-Column Workbench: Team Membership & Invites + Shared Team Notes & Conflict Check */}
      <div className="two-col-studio">
        {/* LEFT: Server Team Membership, Invites & Leadership */}
        <div className="surface-card">
          <div className="row-between wrap-gap">
            <div>
              <span className="eyebrow-tag">SERVER TEAM MEMBERSHIP</span>
              <h3 className="card-subtitle">Create a team, share an invite, or join a spot</h3>
            </div>
            <button
              type="button"
              className="btn btn-ghost btn-compact"
              onClick={() => onInspectTeam(teamId)}
            >
              <RefreshIcon size={14} /> Refresh {teamId}
            </button>
          </div>

          <div className="stack-form top-gap-sm">
            <label className="field-label">
              <span>Team ID (in <code>{eventId}</code>)</span>
              <div className="inline-form">
                <input
                  type="text"
                  value={teamId}
                  onChange={e => onChangeTeamId(e.target.value.replace(/[^A-Za-z0-9_.:@-]/g, ''))}
                  placeholder="e.g. crew-alpha"
                />
                {board.length > 0 && (
                  <select
                    aria-label="Choose an existing team from the current page"
                    value=""
                    onChange={e => {
                      if (e.target.value) {
                        onChangeTeamId(e.target.value);
                        onInspectTeam(e.target.value);
                      }
                    }}
                    className="compact-select"
                  >
                    <option value="">Choose from board...</option>
                    {board.slice(0, 20).map(t => (
                      <option key={t.team_id} value={t.team_id}>
                        {t.team_id} ({t.members}/{t.max_size} spots)
                      </option>
                    ))}
                  </select>
                )}
              </div>
            </label>

            <div className="subcard">
              <label className="field-label">
                <span>What is this team building? (Shown on Step 1 directory card)</span>
                <input
                  type="text"
                  maxLength={180}
                  value={customMissionDraft}
                  onChange={e => setCustomMissionDraft(e.target.value)}
                  placeholder="Describe your team's project goal..."
                />
              </label>
              <div className="top-gap-xs">
                <span className="small-copy muted-copy">Skills needed:</span>
                <div className="pill-row top-gap-xs" role="group" aria-label="Skills needed for this team">
                  {SKILLS_CATALOG.map(sk => {
                    const active = customSkillsDraft.includes(sk.id);
                    return (
                      <button
                        key={sk.id}
                        type="button"
                        aria-pressed={active}
                        className={`chip-toggle ${active ? 'active' : ''}`}
                        onClick={() => toggleCustomSkill(sk.id)}
                      >
                        {active ? '✓ ' : ''}{sk.short}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            <div className="pill-row">
              <button
                type="button"
                className="btn btn-primary btn-compact"
                onClick={() => onCreateTeam({ mission: customMissionDraft, skills: customSkillsDraft })}
              >
                Create team
              </button>
              <button type="button" className="btn btn-secondary btn-compact" onClick={onCreateInvite}>
                Create single-use invite
              </button>
              <button type="button" className="btn btn-danger-outline btn-compact" onClick={onLeaveTeam}>
                Leave team
              </button>
            </div>

            {/* Single-Use Invite Card */}
            {issuedInvite?.code && (
              <div className="invite-ticket" role="region" aria-label="Active single-use invite">
                <div className="row-between wrap-gap">
                  <strong>
                    Single-use invite code
                    {issuedInvite.teamId ? ` (${issuedInvite.teamId})` : ''}
                  </strong>
                  <span className={`status-chip ${expired ? 'chip-err' : 'chip-ok'}`}>
                    <ClockIcon size={13} /> {expired ? 'Expired' : `Expires in ${countdown}`}
                  </span>
                </div>
                <div className="invite-code-row">
                  <input type="text" readOnly value={issuedInvite.code} aria-label="Single-use invite code" className="mono-field" />
                  <button type="button" className="btn btn-secondary btn-compact" onClick={copyInvite}>
                    <CopyIcon size={14} /> {copied ? 'Copied!' : 'Copy'}
                  </button>
                </div>
                <p className="muted-copy small-copy">
                  <LockIcon size={13} /> Created by <code>{issuedInvite.issuedBy || actorId || 'lead'}</code> for <code>{issuedInvite.teamId || teamId}</code> · Works once, checked on server.
                </p>
              </div>
            )}

            {/* Join with Invite Code */}
            <div className="claim-box">
              <label className="field-label">
                <span>Join team with invite code</span>
                <input
                  type="text"
                  value={inviteCode}
                  onChange={e => onChangeInviteCode(e.target.value.trim())}
                  placeholder="Paste single-use invite code..."
                  className="mono-field"
                />
              </label>

              {inviteCode && actorAlreadyInTargetTeam && onClaimAsFreshCandidate && (
                <div className="self-claim-guard subcard tone-ok top-gap-xs" role="region" aria-label="Switch to invited teammate helper">
                  <div className="small-copy">
                    <strong>{humanActor} (<code>{actorId}</code>) is already on <code>{teamId}</code>.</strong>{' '}
                    Each person can join one team per event. Switch to an invited teammate in one click to use this invite:
                  </div>
                  <div className="pill-row top-gap-xs">
                    <button
                      type="button"
                      className="btn btn-primary"
                      disabled={joining}
                      onClick={onClaimAsFreshCandidate}
                    >
                      <SparklesIcon size={15} />{' '}
                      {joining ? 'Joining...' : 'Switch to invited teammate & join'}
                    </button>
                  </div>
                </div>
              )}

              {showTechProof && storagePreview.key && (
                <div className="opid-inspector">
                  <div className="small-copy">
                    <strong><code>claim-operation.js</code> Storage Key:</strong>
                    <div className="mono-cell break-all">{storagePreview.key}</div>
                  </div>
                  <div className="small-copy top-gap-xs">
                    <strong>Retained <code>sessionStorage</code> opId:</strong>{' '}
                    <span className="mono-pill">
                      {storagePreview.savedOpId || 'Generated deterministically on submit'}
                    </span>
                  </div>
                </div>
              )}

              <div className="pill-row top-gap-xs">
                <button
                  type="button"
                  className={inviteCode && actorAlreadyInTargetTeam ? 'btn btn-secondary btn-compact' : 'btn btn-primary btn-compact'}
                  disabled={joining || !inviteCode}
                  onClick={onJoinSeat}
                >
                  <ShieldCheckIcon size={15} /> {joining ? 'Sending request...' : `Join as ${humanActor}`}
                </button>
                <button
                  type="button"
                  className="btn btn-secondary btn-compact"
                  onClick={onOpenCharterExport}
                >
                  <FileTextIcon size={14} /> Preview / Print Summary
                </button>
              </div>
            </div>

            {/* Confirmed Team Members & Leadership Transfer */}
            <div className="roster-box">
              <div className="row-between wrap-gap">
                <h4>
                  Confirmed Team Members:{' '}
                  {selectedTeam ? (
                    <span>
                      <code>{selectedTeam.teamId}</code> ({selectedTeam.members.length} / {selectedTeam.maxSize} spots)
                    </span>
                  ) : (
                    <span className="muted-copy">Click "Refresh {teamId}" to view members</span>
                  )}
                </h4>
                <span className="status-chip chip-ok">Confirmed by server</span>
              </div>

              {selectedTeam && (
                <div className="roster-list top-gap-xs">
                  {selectedTeam.members.map(m => {
                    const isLinked =
                      activeLinkId && normalizeBuilderId(activeLinkId) === normalizeBuilderId(m.userId);
                    return (
                      <div
                        key={m.userId}
                        data-link-id={m.userId}
                        onMouseEnter={() => onLinkHover?.(m.userId)}
                        onMouseLeave={() => onLinkHover?.(null)}
                        className={`roster-row ${isLinked ? 'is-linked-ridge' : ''}`}
                      >
                        <div className="pill-row">
                          <UserIcon size={15} />
                          <strong>{m.userId}</strong>
                          <span className={`status-chip ${m.isLeader ? 'chip-ok' : 'chip-neutral'}`}>
                            {m.isLeader ? '★ Team Lead' : 'Confirmed Member'}
                          </span>
                        </div>
                        {!m.isLeader && selectedTeam.leader === actorId && (
                          <button
                            type="button"
                            className="btn btn-secondary btn-compact"
                            onClick={() => onTransferLeader(m.userId)}
                          >
                            Make lead <ArrowRightIcon size={14} />
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              <div className="inline-form top-gap-sm">
                <input
                  type="text"
                  value={transferTarget}
                  onChange={e => setTransferTarget(e.target.value)}
                  placeholder="Make another member team lead (user ID)..."
                  aria-label="New team lead user ID"
                />
                <button
                  type="button"
                  className="btn btn-secondary btn-compact"
                  disabled={!transferTarget.trim()}
                  onClick={() => {
                    onTransferLeader(transferTarget.trim());
                    setTransferTarget('');
                  }}
                >
                  Transfer lead
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* RIGHT: Encrypted Team Notes, Conflict Check & Server History */}
        <div className="stack-column">
          <div className="surface-card">
            <div className="row-between wrap-gap">
              <div>
                <span className="eyebrow-tag">SHARED TEAM NOTES (ENCRYPTED)</span>
                <h3 className="card-subtitle">Share handoff notes &amp; check schedules</h3>
              </div>
              <button type="button" className="btn btn-ghost btn-compact" onClick={onLoadPeerNotes}>
                <RefreshIcon size={14} /> Refresh notes
              </button>
            </div>

            <p className="muted-copy small-copy">
              Shared notes are encrypted and signed per teammate; notes never change server team spots on their own.
            </p>

            <label className="field-label top-gap-xs">
              <span>Handoff note</span>
              <textarea
                rows={2}
                value={peerNoteText}
                onChange={e => onChangePeerNoteText(e.target.value)}
              />
            </label>
            <div className="pill-row top-gap-xs">
              <button type="button" className="btn btn-primary btn-compact" onClick={onSendPeerNote}>
                <LockIcon size={14} /> Send encrypted note
              </button>
            </div>

            {peerNotes.length > 0 && (
              <div className="notes-feed top-gap-sm" aria-label="Shared encrypted team notes">
                {peerNotes.slice(0, 5).map(n => (
                  <div key={n.receiptId} className="note-item">
                    <div className="row-between wrap-gap">
                      <strong>{n.actorId}</strong>
                      <span className="badge-pill">Signed note</span>
                    </div>
                    <p className="small-top">{n.note}</p>
                    {showTechProof && (
                      <div className="mono-cell muted-copy tiny-copy top-gap-xs">
                        AES-256-GCM + P-256 · SHA-256: {n.digest?.slice(0, 24)}... · epoch {n.epoch}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            <hr className="section-divider" />

            <h4 className="card-subtitle">Check shared plans for conflicts</h4>
            <p className="muted-copy small-copy">
              Check whether two teammates' local schedule edits fit together cleanly or overlap on the same person's hours.
            </p>
            <div className="pill-row top-gap-xs">
              <button
                type="button"
                className="btn btn-secondary btn-compact"
                onClick={() => onRunGluePreset('clean')}
              >
                Test non-overlapping hours
              </button>
              <button
                type="button"
                className="btn btn-secondary btn-compact"
                onClick={() => onRunGluePreset('overlap')}
              >
                Test overlapping hours conflict
              </button>
              <button
                type="button"
                className="btn btn-secondary btn-compact"
                onClick={() => onRunGluePreset('digest')}
              >
                Test mismatched note version
              </button>
            </div>

            {glueResult && (
              <div
                className={`subcard top-gap-sm ${
                  glueResult.status === 'GLUED_CONSISTENT' ? 'tone-ok' : 'tone-warn'
                }`}
                role="region"
                aria-label="Shared plan conflict check result"
              >
                <div className="row-between">
                  <strong>
                    {glueResult.status === 'GLUED_CONSISTENT'
                      ? 'Shared plans fit cleanly - no conflicts'
                      : 'Conflict found between shared edits'}
                  </strong>
                  <span className="badge-pill">{glueResult.mergedRecords?.length || 0} items checked</span>
                </div>
                {(glueResult.obstructions || []).length === 0 ? (
                  <p className="small-top small-copy">
                    ✓ Both teammates' schedules fit together without double-booking anyone.
                  </p>
                ) : (
                  glueResult.obstructions.map((ob, idx) => (
                    <div key={idx} className="small-top small-copy">
                      <strong>Conflict:</strong> <span>{ob.explanation}</span>
                      {ob.interval && (
                        <span className="mono-cell"> ({ob.interval[0]}m..{ob.interval[1]}m)</span>
                      )}
                      {showTechProof && (
                        <div className="mono-cell tiny-copy muted-copy">{ob.type}</div>
                      )}
                    </div>
                  ))
                )}
              </div>
            )}
          </div>

          {/* Server Activity & Engineering Proof Ledger */}
          <div className="surface-card">
            <div className="row-between wrap-gap">
              <div>
                <span className="eyebrow-tag">SERVER ACTIVITY HISTORY</span>
                <h3 className="card-subtitle">Confirmed changes in <code>{eventId}</code></h3>
              </div>
              <button type="button" className="btn btn-secondary btn-compact" onClick={onLoadAudit}>
                <RefreshIcon size={14} /> Load history
              </button>
            </div>

            {auditRows.length === 0 ? (
              <p className="muted-copy top-gap-xs small-copy">
                Click "Load history" or create/join a team above to view confirmed server records.
              </p>
            ) : (
              <div className="audit-timeline top-gap-sm" role="log" aria-label="Confirmed server membership history">
                {auditRows.slice(-10).reverse().map(row => (
                  <div key={row.id} className="audit-entry">
                    <div className="row-between wrap-gap">
                      <span className={`status-chip ${row.action.includes('RELAYED') ? 'chip-warn' : 'chip-ok'}`}>
                        {row.action.includes('RELAYED') ? 'Sent through teammate · Confirmed' : 'Confirmed by server'}
                      </span>
                      <span className="mono-cell muted-copy tiny-copy">#{row.id}</span>
                    </div>
                    <div className="small-copy top-gap-xs">
                      <code>{row.actor_id}</code> · team <code>{row.team_id}</code>
                    </div>
                    {showTechProof && (
                      <div className="mono-cell tiny-copy muted-copy top-gap-xs">
                        action={row.action} · opId={row.op_id}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {showTechProof && (
              <div className="subcard top-gap-sm">
                <div className="pill-row">
                  <EpistemicStencil kind="SQLITE_AUTHORITY" compact />
                  <EpistemicStencil kind="PEER_CIPHERTEXT_ONLY" compact />
                </div>
                <p className="tiny-copy muted-copy top-gap-xs">
                  SQLite <code>BEGIN IMMEDIATE</code> serializes seat writes; single-use invites persist as SHA-256 <code>code_hash</code>; peer envelopes use <code>AES-256-GCM</code> + <code>P-256</code> ECDSA.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
