import React, { useEffect, useState } from 'react';
import { claimKey } from '../claim-operation.js';
import {
  ShieldCheckIcon,
  CopyIcon,
  ClockIcon,
  CheckCircleIcon,
  AlertTriangleIcon,
  LockIcon,
  MeshIcon,
  OutboxIcon,
  RefreshIcon,
  UserIcon,
  SparklesIcon,
  ArrowRightIcon
} from '../icons.jsx';

function formatCountdown(expiresAt, nowMs) {
  if (!expiresAt) return null;
  const diffSec = Math.max(0, Math.floor((expiresAt - nowMs) / 1000));
  const m = Math.floor(diffSec / 60);
  const s = diffSec % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export default function SeatAuthorityView({
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
  onLoadAudit
}) {
  const [nowMs, setNowMs] = useState(Date.now());
  const [transferTarget, setTransferTarget] = useState('');
  const [copied, setCopied] = useState(false);
  const [storagePreview, setStoragePreview] = useState({ key: null, savedOpId: null });

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
    } catch {
      // Clipboard fallback ignored cleanly
    }
  }

  const countdown = issuedInvite?.expiresAt ? formatCountdown(issuedInvite.expiresAt, nowMs) : null;
  const expired = issuedInvite?.expiresAt && nowMs >= issuedInvite.expiresAt;

  return (
    <section aria-labelledby="authority-heading" className="view-section">
      {/* Hero Header */}
      <div className="surface-card hero-strip">
        <div className="row-between wrap-gap">
          <div className="prose-measure">
            <span className="eyebrow-tag">VIEW 3 · LAYER-A SQLITE SERIALIZABLE SEAT AUTHORITY + LAYER-B PEER CONTINUITY</span>
            <h2 id="authority-heading" className="view-title">Live Seat Authority &amp; WAN-Drop Peer Mesh</h2>
            <p className="muted-copy">
              Every seat admission, single-use SHA-256 invite, leader transfer, and departure executes inside an atomic SQLite <code>BEGIN IMMEDIATE</code> transaction—while encrypted notes and signed offline claims traverse the peer mesh without ever forging authority.
            </p>
          </div>

          <div className="telemetry-cluster">
            <div className="metric-pill">
              <span className="metric-label">Active Actor</span>
              <strong className="metric-value">{actorId || 'Sign in'}</strong>
            </div>
            <div className="metric-pill">
              <span className="metric-label">Target Crew</span>
              <strong className="metric-value">{teamId}</strong>
            </div>
            <div className="metric-pill">
              <span className="metric-label">Direct WAN</span>
              <strong className="metric-value">{wanOffline ? 'Dropped' : 'Online'}</strong>
            </div>
          </div>
        </div>
      </div>

      {/* Guided 3-Step WAN-Drop -> Peer Relay -> Reconnect Idempotency Theater */}
      <div className="surface-card theater-card" role="region" aria-label="WAN-Drop Peer Relay and Idempotent Reconnect Theater">
        <div className="row-between wrap-gap">
          <div className="prose-measure">
            <span className="eyebrow-tag">INTERACTIVE CONTINUITY THEATER · ZERO DUPLICATE ADMISSIONS</span>
            <h3 className="card-subtitle">
              3-Step WAN-Drop → Signed Peer Relay (<code>relay-mateo</code>) → Idempotent Reconnect Replay
            </h3>
            <p className="muted-copy small-copy">
              Prove how a builder who loses venue Wi-Fi queues a deterministic <code>opId</code> locally (explicitly <em>not</em> a confirmed seat), forwards the signed claim via an uplinked peer, and safely retries upon reconnecting with <code>replayed: true</code>.
            </p>
          </div>

          <button
            type="button"
            className="btn btn-secondary"
            onClick={onAutoSetupRelayDemo}
          >
            <SparklesIcon size={16} /> 1-Click Auto-Prep Fresh Crew &amp; Invite
          </button>
        </div>

        <div className="theater-steps-grid top-gap-sm">
          {/* STEP 1 */}
          <div className={`theater-step ${wanOffline || queuedClaim ? 'step-active' : ''}`}>
            <div className="step-badge-row">
              <span className="step-num">Step 1</span>
              <span className="badge-pill">Local Durable Outbox</span>
            </div>
            <h4>Drop Direct WAN &amp; Queue Claim</h4>
            <p className="muted-copy small-copy">
              Toggle direct WAN offline on active builder <code>{actorId || 'builder-priya'}</code>, then submit seat request to retain a SHA-256 <code>opId</code>.
            </p>
            <div className="stack-actions">
              <button
                type="button"
                aria-pressed={wanOffline}
                className={`btn btn-compact ${wanOffline ? 'btn-warn-solid' : 'btn-secondary'}`}
                onClick={onToggleWanOffline}
              >
                {wanOffline ? '⚡ Direct WAN Dropped (Click to Restore)' : '1A. Simulate Direct WAN Drop'}
              </button>
              <button
                type="button"
                className="btn btn-primary btn-compact"
                disabled={joining || !inviteCode}
                onClick={onJoinSeat}
              >
                <OutboxIcon /> 1B. Request Seat ({wanOffline ? 'Queues to Outbox' : 'Direct Claim'})
              </button>
            </div>

            {queuedClaim && (
              <div className="outbox-receipt" role="status">
                <strong>PENDING_RELAY (Seat NOT Yet Confirmed!)</strong>
                <div className="mono-cell small-copy">opId: {queuedClaim.opId}</div>
                <div className="muted-copy small-copy">Claimant: {queuedClaim.actorId} → {queuedClaim.teamId}</div>
              </div>
            )}
          </div>

          {/* STEP 2 */}
          <div className={`theater-step ${relayedReceipt ? 'step-done' : ''}`}>
            <div className="step-badge-row">
              <span className="step-num">Step 2</span>
              <span className="badge-pill">POST /api/peer/relay-claim</span>
            </div>
            <h4>Forward Signed Claim via Peer</h4>
            <p className="muted-copy small-copy">
              Uplinked peer <code>relay-mateo</code> forwards claimant’s bearer-signed request + exact <code>opId</code> to Layer A without minting a second operation.
            </p>
            <div className="stack-actions">
              <button
                type="button"
                className="btn btn-primary btn-compact"
                disabled={!queuedClaim}
                onClick={onForwardViaPeer}
              >
                <MeshIcon /> 2. Forward Claim via Peer (relay-mateo)
              </button>
            </div>

            {relayedReceipt && (
              <div className="subcard tone-ok small-top" role="status">
                <strong>✓ PEER_RELAYED_ADMISSION Committed!</strong>
                <div className="mono-cell small-copy">
                  actor={relayedReceipt.actorId} · via={relayedReceipt.relayedBy} · replayed={String(relayedReceipt.replayed)}
                </div>
              </div>
            )}
          </div>

          {/* STEP 3 */}
          <div className={`theater-step ${replayReceipt ? 'step-done' : ''}`}>
            <div className="step-badge-row">
              <span className="step-num">Step 3</span>
              <span className="badge-pill">Idempotent Recovery</span>
            </div>
            <h4>Restore WAN &amp; Retry Same opId</h4>
            <p className="muted-copy small-copy">
              When direct WAN returns and the client retries <code>/api/invitations/claim</code> with the retained <code>opId</code>, Layer A returns the original commit with 0 duplicate rows.
            </p>
            <div className="stack-actions">
              <button
                type="button"
                className="btn btn-primary btn-compact"
                disabled={!queuedClaim && !relayedReceipt}
                onClick={onReconnectAndRetryDirect}
              >
                <CheckCircleIcon size={15} /> 3. Restore WAN &amp; Retry Direct Claim
              </button>
            </div>

            {replayReceipt && (
              <div className="subcard tone-ok small-top" role="status">
                <strong>✓ {replayReceipt.status} (replayed: {String(replayReceipt.replayed)})</strong>
                <div className="small-copy">
                  Zero duplicate rows inserted; <code>sessionStorage</code> operation key cleanly retired.
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Main Two-Column Workbench: Layer A Seat Lifecycle + Layer B Encrypted Notes / Glue */}
      <div className="two-col-studio">
        {/* LEFT: Layer-A Team Lifecycle Workbench */}
        <div className="surface-card">
          <div className="row-between wrap-gap">
            <div>
              <span className="eyebrow-tag">LAYER A · AUTHORITATIVE TEAM LIFECYCLE</span>
              <h3 className="card-subtitle">Seats, Single-Use Invites &amp; Leadership</h3>
            </div>
            <button
              type="button"
              className="btn btn-ghost btn-compact"
              onClick={() => onInspectTeam(teamId)}
            >
              <RefreshIcon size={15} /> Inspect {teamId}
            </button>
          </div>

          <div className="stack-form top-gap-sm">
            <label className="field-label">
              <span>Target Team ID (in <code>{eventId}</code>)</span>
              <div className="inline-form">
                <input
                  type="text"
                  value={teamId}
                  onChange={e => onChangeTeamId(e.target.value.replace(/[^A-Za-z0-9_.:@-]/g, ''))}
                  placeholder="e.g. crew-alpha"
                />
                {board.length > 0 && (
                  <select
                    aria-label="Quick select existing team on current page"
                    value=""
                    onChange={e => {
                      if (e.target.value) {
                        onChangeTeamId(e.target.value);
                        onInspectTeam(e.target.value);
                      }
                    }}
                    className="compact-select"
                  >
                    <option value="">Pick from board…</option>
                    {board.slice(0, 20).map(t => (
                      <option key={t.team_id} value={t.team_id}>
                        {t.team_id} ({t.members}/{t.max_size})
                      </option>
                    ))}
                  </select>
                )}
              </div>
            </label>

            <div className="pill-row">
              <button type="button" className="btn btn-primary btn-compact" onClick={onCreateTeam}>
                Create Team (<code>/api/teams</code>)
              </button>
              <button type="button" className="btn btn-secondary btn-compact" onClick={onCreateInvite}>
                Issue Single-Use Invite (<code>/api/invitations</code>)
              </button>
              <button type="button" className="btn btn-danger-outline btn-compact" onClick={onLeaveTeam}>
                Leave Team (<code>/api/teams/leave</code>)
              </button>
            </div>

            {/* Issued Single-Use Invite Card with Countdown */}
            {issuedInvite?.code && (
              <div className="invite-ticket" role="region" aria-label="Issued single-use invitation">
                <div className="row-between wrap-gap">
                  <strong>Protected Single-Use Invite Token</strong>
                  <span className={`status-chip ${expired ? 'chip-err' : 'chip-ok'}`}>
                    <ClockIcon size={13} /> {expired ? 'EXPIRED (410)' : `Expires in ${countdown}`}
                  </span>
                </div>
                <div className="invite-code-row">
                  <input type="text" readOnly value={issuedInvite.code} aria-label="Single-use invite token" className="mono-field" />
                  <button type="button" className="btn btn-secondary btn-compact" onClick={copyInvite}>
                    <CopyIcon size={15} /> {copied ? 'Copied!' : 'Copy'}
                  </button>
                </div>
                <p className="muted-copy small-copy">
                  <LockIcon size={13} /> Persisted in SQLite <code>invites</code> strictly as SHA-256 <code>code_hash</code>; consumed atomically on first valid claim.
                </p>
              </div>
            )}

            {/* Claim Seat + SHA-256 opId Inspector */}
            <div className="claim-box">
              <label className="field-label">
                <span>Claim Seat with Invite Code (Retry-Safe SHA-256 <code>opId</code>)</span>
                <input
                  type="text"
                  value={inviteCode}
                  onChange={e => onChangeInviteCode(e.target.value.trim())}
                  placeholder="Paste 43-char base64url single-use invite token…"
                  className="mono-field"
                />
              </label>

              {storagePreview.key && (
                <div className="opid-inspector">
                  <div className="small-copy">
                    <strong><code>claim-operation.js</code> Fingerprint Key:</strong>
                    <div className="mono-cell break-all">{storagePreview.key}</div>
                  </div>
                  <div className="small-copy top-gap-xs">
                    <strong>Retained <code>sessionStorage</code> opId:</strong>{' '}
                    <span className="mono-pill">
                      {storagePreview.savedOpId || 'Will mint deterministic join-UUID on click'}
                    </span>
                  </div>
                </div>
              )}

              <div className="pill-row top-gap-xs">
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={joining || !inviteCode}
                  onClick={onJoinSeat}
                >
                  <ShieldCheckIcon /> {joining ? 'Submitting Claim…' : 'Request Membership (/api/invitations/claim)'}
                </button>
              </div>
            </div>

            {/* Live Team Roster & Explicit Leader Transfer */}
            <div className="roster-box">
              <div className="row-between wrap-gap">
                <h4>
                  Authoritative Roster:{' '}
                  {selectedTeam ? (
                    <span>
                      <code>{selectedTeam.teamId}</code> ({selectedTeam.members.length} / {selectedTeam.maxSize})
                    </span>
                  ) : (
                    <span className="muted-copy">Click “Inspect {teamId}” to load members</span>
                  )}
                </h4>
              </div>

              {selectedTeam && (
                <div className="roster-list top-gap-xs">
                  {selectedTeam.members.map(m => (
                    <div key={m.userId} className="roster-row">
                      <div className="pill-row">
                        <UserIcon size={15} />
                        <strong>{m.userId}</strong>
                        <span className={`status-chip ${m.isLeader ? 'chip-ok' : 'chip-neutral'}`}>
                          {m.isLeader ? '★ Team Leader' : 'Committed Member'}
                        </span>
                      </div>
                      {!m.isLeader && selectedTeam.leader === actorId && (
                        <button
                          type="button"
                          className="btn btn-secondary btn-compact"
                          onClick={() => onTransferLeader(m.userId)}
                        >
                          Make Leader <ArrowRightIcon size={14} />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}

              <div className="inline-form top-gap-sm">
                <input
                  type="text"
                  value={transferTarget}
                  onChange={e => setTransferTarget(e.target.value)}
                  placeholder="Transfer leadership to member userId…"
                  aria-label="New leader user ID"
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
                  Transfer Leader
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* RIGHT: Layer-B Encrypted Notes, Sheaf Context Glue & Attributable Audit */}
        <div className="stack-column">
          <div className="surface-card">
            <div className="row-between wrap-gap">
              <div>
                <span className="eyebrow-tag">LAYER B · AES-256-GCM + P-256 ECDSA PEER ENVELOPES</span>
                <h3 className="card-subtitle">Encrypted Collaboration Notes &amp; Sheaf Glue</h3>
              </div>
              <button type="button" className="btn btn-ghost btn-compact" onClick={onLoadPeerNotes}>
                <RefreshIcon size={15} /> Sync Notes
              </button>
            </div>

            <p className="muted-copy small-copy">
              Every Layer-B collaboration artifact is encrypted with <code>AES-256-GCM</code>, signed with per-actor <code>P-256</code> keys, and tagged <code>PEER_ARTIFACT_ONLY</code>—it can never mutate Layer-A seats.
            </p>

            <label className="field-label top-gap-xs">
              <span>Collaboration Note Plaintext</span>
              <textarea
                rows={2}
                value={peerNoteText}
                onChange={e => onChangePeerNoteText(e.target.value)}
              />
            </label>
            <div className="pill-row">
              <button type="button" className="btn btn-primary btn-compact" onClick={onSendPeerNote}>
                <LockIcon size={15} /> Seal &amp; Broadcast Encrypted Note
              </button>
            </div>

            {peerNotes.length > 0 && (
              <div className="notes-feed top-gap-sm" aria-label="Verified Layer-B peer notes">
                {peerNotes.slice(0, 5).map(n => (
                  <div key={n.receiptId} className="note-item">
                    <div className="row-between wrap-gap">
                      <strong>{n.actorId}</strong>
                      <span className="status-chip chip-neutral">{n.transportStatus}</span>
                    </div>
                    <p className="small-top">{n.note}</p>
                    <div className="mono-cell muted-copy small-copy">
                      SHA-256 digest: {n.digest?.slice(0, 24)}… · epoch {n.epoch}
                    </div>
                  </div>
                ))}
              </div>
            )}

            <hr className="section-divider" />

            <h4 className="card-subtitle">Sheaf Context Glue-or-Explain (<code>/api/peer/glue</code>)</h4>
            <p className="muted-copy small-copy">
              Verify distributed schedule sections: non-overlapping intervals glue cleanly; conflicting simultaneous assignments emit an explicit obstruction witness.
            </p>
            <div className="pill-row top-gap-xs">
              <button
                type="button"
                className="btn btn-secondary btn-compact"
                onClick={() => onRunGluePreset('clean')}
              >
                Test Clean Non-Overlapping Merge
              </button>
              <button
                type="button"
                className="btn btn-secondary btn-compact"
                onClick={() => onRunGluePreset('overlap')}
              >
                Test Capacity Overlap Obstruction
              </button>
              <button
                type="button"
                className="btn btn-secondary btn-compact"
                onClick={() => onRunGluePreset('digest')}
              >
                Test Epoch Digest Conflict
              </button>
            </div>

            {glueResult && (
              <div
                className={`subcard top-gap-sm ${
                  glueResult.status === 'GLUED_CONSISTENT' ? 'tone-ok' : 'tone-warn'
                }`}
                role="region"
                aria-label="Context glue result"
              >
                <div className="row-between">
                  <strong>{glueResult.status}</strong>
                  <span className="badge-pill">{glueResult.mergedRecords?.length || 0} merged records</span>
                </div>
                {(glueResult.obstructions || []).length === 0 ? (
                  <p className="small-top">
                    ✓ Local and peer sections are mutually compatible across all contributor capacity intervals.
                  </p>
                ) : (
                  glueResult.obstructions.map((ob, idx) => (
                    <div key={idx} className="small-top">
                      <span className="status-chip chip-err">{ob.type}</span>{' '}
                      <span>{ob.explanation}</span>
                      {ob.interval && (
                        <span className="mono-cell"> (overlap: [{ob.interval[0]}m..{ob.interval[1]}m])</span>
                      )}
                    </div>
                  ))
                )}
              </div>
            )}
          </div>

          {/* Attributable Layer-A Audit Trail */}
          <div className="surface-card">
            <div className="row-between wrap-gap">
              <div>
                <span className="eyebrow-tag">ATTRIBUTABLE LAYER-A LEDGER</span>
                <h3 className="card-subtitle">Audit Timeline (<code>{eventId}</code>)</h3>
              </div>
              <button type="button" className="btn btn-secondary btn-compact" onClick={onLoadAudit}>
                <RefreshIcon size={15} /> Load Audit Log
              </button>
            </div>

            {auditRows.length === 0 ? (
              <p className="muted-copy top-gap-xs">
                Click “Load Audit Log” or execute any team mutation above to inspect attributable SQLite audit rows.
              </p>
            ) : (
              <div className="audit-timeline top-gap-sm" role="log" aria-label="Attributable membership audit trail">
                {auditRows.slice(-12).reverse().map(row => (
                  <div key={row.id} className="audit-entry">
                    <div className="row-between wrap-gap">
                      <span className={`status-chip ${row.action.includes('RELAYED') ? 'chip-warn' : 'chip-ok'}`}>
                        {row.action}
                      </span>
                      <span className="mono-cell muted-copy small-copy">#{row.id}</span>
                    </div>
                    <div className="small-copy top-gap-xs">
                      actor: <code>{row.actor_id}</code> · team: <code>{row.team_id}</code> · op: <code>{row.op_id}</code>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
