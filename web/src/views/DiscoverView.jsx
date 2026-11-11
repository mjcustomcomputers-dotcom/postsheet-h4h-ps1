import React, { useState, useMemo } from 'react';
import SolarBatonHorizon from '../components/SolarBatonHorizon.jsx';
import {
  SKILLS_CATALOG,
  BUILDER_DIRECTORY,
  MISSION_SCENARIOS,
  deriveCrewProfile
} from '../presets-and-catalog.js';
import {
  SearchIcon,
  RefreshIcon,
  GlobeIcon,
  ClockIcon,
  CheckCircleIcon,
  AlertTriangleIcon,
  SparklesIcon,
  UserIcon,
  PlusIcon,
  EyeIcon,
  ArrowRightIcon,
  ShieldCheckIcon,
  SplitWipeIcon
} from '../icons.jsx';

function LifecycleBadge({ lifecycle, label, legacyMode, openSeats, members, maxSize }) {
  if (legacyMode) {
    if (openSeats === 0) {
      return (
        <span className="lifecycle-badge badge-legacy-complete" title="Legacy boards treat full seats as ready without checking task schedules">
          Complete ({members}/{maxSize})
        </span>
      );
    }
    return (
      <span className="lifecycle-badge badge-forming" title="Legacy recruiting tag without UTC handoff check">
        Recruiting ({members}/{maxSize})
      </span>
    );
  }

  if (lifecycle === 'FEASIBLE_VERIFIED') {
    return (
      <span
        className="lifecycle-badge badge-ok"
        title="FEASIBLE_VERIFIED · Seats confirmed and critical-path schedule verified"
      >
        <CheckCircleIcon size={14} /> {label || 'Verified Ready to Ship'}
      </span>
    );
  }
  if (lifecycle === 'PLAN_FEASIBLE_PENDING_ACCEPTANCE') {
    return (
      <span
        className="lifecycle-badge badge-accent"
        title="PLAN_FEASIBLE_PENDING_ACCEPTANCE · Deliverable path verified; awaiting seat or guard acceptance"
      >
        <SparklesIcon size={14} /> {label || 'Plan Verified · Open Seat'}
      </span>
    );
  }
  if (lifecycle === 'ROSTER_CONFIRMED') {
    return (
      <span
        className="lifecycle-badge badge-warn"
        title="ROSTER_CONFIRMED · Seats are full, yet critical-path task contention is unverified"
      >
        <AlertTriangleIcon size={14} /> {label || 'Seats Full · Unverified Plan'}
      </span>
    );
  }
  return (
    <span
      className="lifecycle-badge badge-forming"
      title="FORMING · Open seats available; actively matching complementary skills"
    >
      <ClockIcon size={14} /> {label || 'Open to Teammates'}
    </span>
  );
}

function isBuilderInActiveCrew(builder, teamPeople) {
  return (teamPeople || []).some(
    p => p.id === builder.id || (builder.plannerId && p.id === builder.plannerId)
  );
}

function describeSandboxVerdict(plan, tasks) {
  if (!plan) {
    return {
      tone: 'warn',
      badge: 'Evaluating Schedule...',
      codeTitle: 'Evaluating critical-path schedule'
    };
  }
  if (plan.status === 'FEASIBLE_WITNESS') {
    return {
      tone: 'ok',
      badge: 'Verified Ready to Ship!',
      codeTitle: `${plan.status} · ${plan.classification}`
    };
  }
  if (plan.status === 'CONDITIONAL_WITNESS') {
    return {
      tone: 'warn',
      badge: 'Needs 1 Skill Check (VOI)',
      codeTitle: `${plan.status} · ${plan.classification}`
    };
  }
  const assignedIds = new Set((plan.witness?.assignments || []).map(a => a.taskId));
  const missingTask = (tasks || []).find(t => !assignedIds.has(t.id));
  if (plan.hallContention || plan.classification === 'INFEASIBLE_WITHIN_SCOPE') {
    if (missingTask?.id === 'integration' || (tasks || []).some(t => t.id === 'integration')) {
      return {
        tone: 'err',
        badge: 'Blocked: Missing Integration Window',
        codeTitle: `${plan.status} · ${plan.classification}`
      };
    }
    return {
      tone: 'err',
      badge: 'Blocked: Simultaneous Capacity Overload',
      codeTitle: `${plan.status} · ${plan.classification}`
    };
  }
  return {
    tone: 'err',
    badge: missingTask
      ? `Blocked: Missing ${missingTask.title || missingTask.id}`
      : 'Blocked: Missing Integration Window',
    codeTitle: `${plan.status} · ${plan.classification}`
  };
}

export default function DiscoverView({
  theme = 'h4h-glass',
  motion = 'spring',
  eventId,
  onChangeEventId,
  onEnsureEvent,
  board,
  totalTeams,
  boardLatencyMs,
  sseConnected,
  pageIndex,
  pageSize,
  onPageChange,
  onPageSizeChange,
  onRefreshBoard,
  selectedTeam,
  onInspectTeam,
  onCloseInspect,
  onCheckFitCrew,
  onRequestSeatForTeam,
  onSendBuilderToArchitect,
  onSpawnShowcaseCrews,
  verifiedCrewMap,
  customCrewMap,
  spawningDemo,
  // Real-time Split Studio Dock props
  activeScenarioKey = 'baton',
  onSelectScenario,
  goalDescription = '',
  horizonHours = 8,
  tasks = [],
  teamPeople = [],
  candidates = [],
  plan = null,
  recs = null,
  solving = false,
  lockingPlan = false,
  onToggleBuilderInCrew,
  onLockPlanAndMintInvite,
  onInspectDagWipe
}) {
  const [directoryTab, setDirectoryTab] = useState('featured'); // 'featured' | 'builders' | 'crews'
  const [lensMode, setLensMode] = useState('ps1'); // 'ps1' | 'legacy'
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedSkill, setSelectedSkill] = useState('all');
  const [openOnly, setOpenOnly] = useState(false);
  const [jumpInput, setJumpInput] = useState('');
  const [customEventDraft, setCustomEventDraft] = useState('');
  const [showScopeTools, setShowScopeTools] = useState(false);

  const horizonMin = Math.max(60, Math.round(Number(horizonHours || 8) * 60));
  const legacyMode = lensMode === 'legacy';

  const enrichedCrews = useMemo(
    () => board.map(t => deriveCrewProfile(t, verifiedCrewMap, customCrewMap, eventId)),
    [board, verifiedCrewMap, customCrewMap, eventId]
  );

  const filteredCrews = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return enrichedCrews.filter(c => {
      if (q) {
        const hay = `${c.teamId} ${c.leader} ${c.mission} ${c.skills.join(' ')} ${c.secondaryContext}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      if (selectedSkill !== 'all' && !c.skills.includes(selectedSkill)) return false;
      if (openOnly && c.openSeats <= 0) return false;
      return true;
    });
  }, [enrichedCrews, searchQuery, selectedSkill, openOnly]);

  // Featured Mix prioritizes open-seat crews first, capped at 4 showcase crews so cards stay crisp
  const featuredCrews = useMemo(() => {
    const sorted = [...filteredCrews].sort((a, b) => {
      const aOpen = a.openSeats > 0 ? 1 : 0;
      const bOpen = b.openSeats > 0 ? 1 : 0;
      if (aOpen !== bOpen) return bOpen - aOpen;
      return 0;
    });
    return sorted.slice(0, 4);
  }, [filteredCrews]);

  const filteredBuilders = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return BUILDER_DIRECTORY.filter(b => {
      const bSkills = Object.keys(b.skills);
      if (q) {
        const hay = `${b.id} ${b.displayName || ''} ${b.role} ${b.bio} ${b.timezone} ${bSkills.join(' ')} ${b.secondaryContext}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      if (selectedSkill !== 'all' && !bSkills.includes(selectedSkill)) return false;
      return true;
    });
  }, [searchQuery, selectedSkill]);

  const recById = useMemo(() => {
    const map = new Map();
    for (const r of recs?.recommendations || []) {
      map.set(r.candidateId, r);
    }
    return map;
  }, [recs]);

  const effectiveTotal =
    totalTeams !== null
      ? totalTeams
      : board.length === pageSize
        ? (pageIndex + 2) * pageSize
        : pageIndex * pageSize + board.length;
  const totalPages = Math.max(1, Math.ceil(effectiveTotal / pageSize));
  const hasPrev = pageIndex > 0;
  const hasNext = totalTeams !== null ? pageIndex + 1 < totalPages : board.length === pageSize;

  function clearFilters() {
    setSearchQuery('');
    setSelectedSkill('all');
    setOpenOnly(false);
  }

  function handleJumpSubmit(e) {
    e.preventDefault();
    const target = Number(jumpInput);
    if (Number.isFinite(target) && target >= 1 && target <= totalPages) {
      onPageChange(target - 1);
      setJumpInput('');
    }
  }

  const activeFilterCount =
    (searchQuery.trim() ? 1 : 0) +
    (selectedSkill !== 'all' ? 1 : 0) +
    (openOnly ? 1 : 0);

  const verdict = describeSandboxVerdict(plan, tasks);
  const priyaBuilder = BUILDER_DIRECTORY.find(b => b.id === 'builder-priya');
  const priyaInCrew = priyaBuilder ? isBuilderInActiveCrew(priyaBuilder, teamPeople) : false;

  const crewsToDisplay = directoryTab === 'featured' ? featuredCrews : filteredCrews;

  return (
    <section aria-labelledby="discover-heading" className="view-section discover-studio-section">
      {/* Compact Single-Card Hack4Hack Directory Header + Lens Switcher + Filter Strip */}
      <div className="surface-card discover-top-bar">
        <div className="discover-head-row">
          <div className="discover-title-cluster">
            <div className="pill-row">
              <h2 id="discover-heading" className="discover-h2">
                Find Teammates &amp; Open Crews
              </h2>
              <span className="kpi-inline-pill" title="Latest SQLite board read latency">
                Board: <strong>{boardLatencyMs !== null ? `${boardLatencyMs.toFixed(1)} ms` : '--'}</strong>
              </span>
              <span className="kpi-inline-pill" title={`Authoritative SQLite teams in ${eventId}`}>
                <strong>{totalTeams !== null ? `${totalTeams.toLocaleString()}+` : board.length}</strong> SQLite Crews
              </span>
              <span className={`kpi-inline-pill ${sseConnected ? 'kpi-live' : ''}`} title="Server-Sent Events live roster stream">
                {sseConnected ? '● SSE Live' : 'SSE Standby'}
              </span>
            </div>
            <p className="discover-subcopy">
              Simulate teammates against your live critical-path schedule on the right, verify async UTC baton handoffs, then lock scarce seats atomically.
            </p>
          </div>

          {/* 1-Click Product Lens Switcher */}
          <div className="lens-switcher" role="group" aria-label="Directory product lens comparison">
            <button
              type="button"
              aria-pressed={!legacyMode}
              className={`lens-btn ${!legacyMode ? 'active' : ''}`}
              onClick={() => setLensMode('ps1')}
            >
              <SparklesIcon size={14} /> Purpose-First Glass (PS1)
            </button>
            <button
              type="button"
              aria-pressed={legacyMode}
              className={`lens-btn lens-btn-warn ${legacyMode ? 'active' : ''}`}
              onClick={() => setLensMode('legacy')}
            >
              <AlertTriangleIcon size={14} /> Legacy Profile-Only View
            </button>
          </div>
        </div>

        {/* Compact Filter Strip */}
        <div
          className="discover-filter-strip"
          role="search"
          aria-label="Filter teammates and crews by skill, search query, and open seats"
        >
          <div className="search-box compact-search-box">
            <SearchIcon size={16} className="search-box-icon" />
            <input
              type="search"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search teammate, city, skill, or crew ID..."
              aria-label="Search teammates and crews"
            />
          </div>

          <div className="tab-strip compact-tab-strip" role="tablist" aria-label="Directory entity mode">
            {[
              { id: 'featured', label: 'Featured Mix' },
              { id: 'builders', label: `Teammates (${filteredBuilders.length})` },
              {
                id: 'crews',
                label: `Live SQLite Crews (${totalTeams !== null ? totalTeams.toLocaleString() : filteredCrews.length})`
              }
            ].map(tab => (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={directoryTab === tab.id}
                className={`tab-pill ${directoryTab === tab.id ? 'active' : ''}`}
                onClick={() => setDirectoryTab(tab.id)}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="pill-row skill-strip" role="group" aria-label="Filter by critical-path skill">
            <button
              type="button"
              aria-pressed={selectedSkill === 'all'}
              className={`chip-toggle chip-compact ${selectedSkill === 'all' ? 'active' : ''}`}
              onClick={() => setSelectedSkill('all')}
            >
              All
            </button>
            {SKILLS_CATALOG.map(sk => (
              <button
                key={sk.id}
                type="button"
                aria-pressed={selectedSkill === sk.id}
                className={`chip-toggle chip-compact ${selectedSkill === sk.id ? 'active' : ''}`}
                onClick={() => setSelectedSkill(selectedSkill === sk.id ? 'all' : sk.id)}
              >
                {sk.short}
              </button>
            ))}
          </div>

          <div className="pill-row filter-right-controls">
            <button
              type="button"
              role="switch"
              aria-checked={openOnly}
              className={`open-seats-switch ${openOnly ? 'active' : ''}`}
              onClick={() => setOpenOnly(v => !v)}
            >
              <span className="switch-dot" aria-hidden="true" />
              <span>Open Seats Only</span>
            </button>

            <button
              type="button"
              aria-expanded={showScopeTools}
              className="btn btn-ghost btn-compact"
              onClick={() => setShowScopeTools(v => !v)}
              title="Switch event scope or spawn fresh open-seat showcase crews"
            >
              Scope: <code>{eventId}</code>
            </button>

            {activeFilterCount > 0 && (
              <button type="button" className="btn btn-ghost btn-compact" onClick={clearFilters}>
                Reset ({activeFilterCount})
              </button>
            )}
          </div>
        </div>

        {/* Progressive-Disclosure Event Scope & Open-Crew Spawner */}
        {showScopeTools && (
          <div className="scope-bar compact-scope-bar">
            <div className="pill-row">
              <span className="filter-group-label">Event Scope:</span>
              {['seed-event', 'h4h-open-crews'].map(ev => (
                <button
                  key={ev}
                  type="button"
                  aria-pressed={eventId === ev}
                  className={`chip-toggle chip-compact ${eventId === ev ? 'active' : ''}`}
                  onClick={() => onChangeEventId(ev)}
                >
                  {ev === 'seed-event' ? 'seed-event (2,000+ Crews)' : 'h4h-open-crews (Sandbox)'}
                </button>
              ))}
            </div>

            <div className="pill-row">
              <form
                className="inline-form"
                onSubmit={e => {
                  e.preventDefault();
                  if (customEventDraft.trim()) {
                    onEnsureEvent(customEventDraft.trim());
                    setCustomEventDraft('');
                  }
                }}
              >
                <input
                  type="text"
                  value={customEventDraft}
                  onChange={e => setCustomEventDraft(e.target.value)}
                  placeholder="Custom eventId..."
                  aria-label="Custom event scope identifier"
                  className="compact-field"
                />
                <button type="submit" className="btn btn-secondary btn-compact">
                  Switch Scope
                </button>
              </form>

              <button
                type="button"
                className="btn btn-secondary btn-compact"
                disabled={spawningDemo}
                onClick={onSpawnShowcaseCrews}
              >
                <PlusIcon size={14} /> {spawningDemo ? 'Spawning...' : 'Spawn 3 Open Crews'}
              </button>
              <button type="button" className="btn btn-ghost btn-compact" onClick={onRefreshBoard}>
                <RefreshIcon size={14} /> Refresh
              </button>
            </div>
          </div>
        )}
      </div>

      {/* TWO-COLUMN REAL-TIME SPLIT STUDIO: Left 62% Cards | Right 38% Sticky Live Crew & Baton Dock */}
      <div className="discover-split-studio">
        {/* LEFT COLUMN (62%): Teammate & Crew Cards Grid */}
        <div className="discover-cards-column">
          {legacyMode && (
            <div className="legacy-mode-banner" role="status">
              <AlertTriangleIcon size={16} />
              <div>
                <strong>Legacy Profile-Only Lens Active:</strong> Notice how conventional directories show only college/city and flat skill tags, hiding UTC handoff windows and marking 5/5 rosters "Complete" even when double-booked. Flip back to <strong>Purpose-First Glass (PS1)</strong> to restore critical-path truth.
              </div>
            </div>
          )}

          {/* Inline Selected Team Roster Inspector */}
          {selectedTeam && (
            <div
              className="surface-card inspector-banner"
              role="region"
              aria-label={`Authoritative roster for ${selectedTeam.teamId}`}
            >
              <div className="row-between wrap-gap">
                <div>
                  <span className="eyebrow-tag">LIVE SQLITE ROSTER · {eventId}</span>
                  <h3 className="card-subtitle">
                    Crew <code>{selectedTeam.teamId}</code> · {selectedTeam.members.length} / {selectedTeam.maxSize} Committed Seats
                  </h3>
                </div>
                <div className="pill-row">
                  <button
                    type="button"
                    className="btn btn-primary btn-compact"
                    onClick={() => onRequestSeatForTeam(selectedTeam.teamId)}
                  >
                    <ShieldCheckIcon size={14} /> Open in Seat &amp; Mesh Relay
                  </button>
                  <button type="button" className="btn btn-ghost btn-compact" onClick={onCloseInspect}>
                    Close
                  </button>
                </div>
              </div>

              <div className="member-chips-grid">
                {selectedTeam.members.map(m => (
                  <div key={m.userId} className={`member-chip ${m.isLeader ? 'leader-chip' : ''}`}>
                    <UserIcon size={15} />
                    <strong>{m.userId}</strong>
                    <span className="badge-pill">{m.isLeader ? '★ Leader' : 'Member'}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* SECTION A: Complementary Teammates (Shown in Featured Mix & Teammates Tab) */}
          {(directoryTab === 'featured' || directoryTab === 'builders') && (
            <div className="directory-section">
              <div className="row-between wrap-gap section-header-bar">
                <h3 className="section-heading-compact">
                  Complementary Teammates &amp; Baton Builders
                  <span className="count-pill">{filteredBuilders.length} available</span>
                </h3>
                {!legacyMode && (
                  <span className="small-copy muted-copy">
                    Click <strong>+ Simulate in Crew</strong> to test live on the right dock
                  </span>
                )}
              </div>

              <div className="crew-grid studio-card-grid">
                {filteredBuilders.map(b => {
                  const inCrew = isBuilderInActiveCrew(b, teamPeople);
                  const rec = recById.get(b.plannerId) || recById.get(b.id);
                  const restores = Boolean(rec?.restoresFeasibility);
                  const winStartPct = Math.round((b.startMin / 480) * 100);
                  const winWidthPct = Math.max(8, Math.round(((b.endMin - b.startMin) / 480) * 100));

                  return (
                    <article
                      key={b.id}
                      className={`crew-card builder-card ${inCrew ? 'card-in-crew' : ''} ${
                        restores && !inCrew && !legacyMode ? 'card-top-match' : ''
                      }`}
                      aria-label={`Teammate ${b.displayName || b.id}`}
                    >
                      <div className="builder-card-head">
                        <div className="builder-identity">
                          <span
                            className={`builder-avatar avatar-${b.avatarTone || 'jade'}`}
                            aria-hidden="true"
                          >
                            {b.initials || b.id.slice(0, 2).toUpperCase()}
                          </span>
                          <div>
                            <div className="pill-row">
                              <h4 className="crew-id">{b.displayName || b.id}</h4>
                              <code className="builder-handle">@{b.plannerId || b.id}</code>
                            </div>
                            <span className="leader-tag">
                              {legacyMode ? b.legacyAffiliation || b.secondaryContext : b.role}
                            </span>
                          </div>
                        </div>

                        {!legacyMode && (
                          <div className="pill-row">
                            {restores && !inCrew && (
                              <span className="status-chip chip-ok" title="Adding this builder flips your active crew schedule to FEASIBLE_WITNESS">
                                ★ Solves Window
                              </span>
                            )}
                            {b.batonReady && !restores && (
                              <span className="baton-pill">UTC Baton Ready</span>
                            )}
                          </div>
                        )}
                      </div>

                      <p className="crew-mission">{b.bio}</p>

                      {/* Skill Chips: Purpose-First 3-state vs Legacy flat tags */}
                      <div className="tag-cluster">
                        {Object.entries(b.skills).map(([sk, st]) => {
                          if (legacyMode) {
                            return (
                              <span key={sk} className="skill-badge">
                                {sk}
                              </span>
                            );
                          }
                          return (
                            <span
                              key={sk}
                              className={`skill-badge ${st === 'unknown' ? 'skill-unknown' : 'skill-verified'}`}
                              title={
                                st === 'unknown'
                                  ? 'Provisional skill claim (evaluated via Wildcard Omega / VOI)'
                                  : 'Verified supporting skill evidence'
                              }
                            >
                              {st === 'unknown' ? `? ${sk}` : `✓ ${sk}`}
                            </span>
                          );
                        })}
                      </div>

                      {legacyMode ? (
                        <div className="legacy-blindspot-callout">
                          <AlertTriangleIcon size={14} />
                          <span>{b.legacyHiddenFailure}</span>
                        </div>
                      ) : (
                        <div className="wake-bar-block">
                          <div className="row-between small-copy">
                            <span>
                              <ClockIcon size={13} /> {b.timezone}
                            </span>
                            <span className="mono-cell">{b.windowLabel}</span>
                          </div>
                          <div className="wake-track" aria-label={`Available window ${b.windowLabel}`}>
                            <div
                              className="wake-fill"
                              style={{ left: `${winStartPct}%`, width: `${Math.min(100 - winStartPct, winWidthPct)}%` }}
                            />
                          </div>
                        </div>
                      )}

                      <div className="card-actions-row">
                        <button
                          type="button"
                          aria-pressed={inCrew}
                          className={`btn btn-compact ${inCrew ? 'btn-in-crew' : 'btn-primary'}`}
                          onClick={() => onToggleBuilderInCrew(b)}
                        >
                          {inCrew ? '✓ In Active Crew (Remove)' : '+ Simulate in Crew'}
                        </button>
                        <button
                          type="button"
                          className="btn btn-ghost btn-compact"
                          onClick={() => onSendBuilderToArchitect(b)}
                        >
                          Open Planner <ArrowRightIcon size={13} />
                        </button>
                      </div>
                    </article>
                  );
                })}
              </div>
            </div>
          )}

          {/* SECTION B: Open & Live SQLite Crews (Shown in Featured Mix & Live SQLite Crews Tab) */}
          {(directoryTab === 'featured' || directoryTab === 'crews') && (
            <div className="directory-section">
              <div className="row-between wrap-gap section-header-bar">
                <h3 className="section-heading-compact">
                  {directoryTab === 'featured'
                    ? 'Open & Featured SQLite Crews'
                    : `All Authoritative SQLite Crews in ${eventId}`}
                  <span className="count-pill">
                    {directoryTab === 'featured'
                      ? `${crewsToDisplay.length} featured`
                      : `Page ${pageIndex + 1} of ${totalPages.toLocaleString()}`}
                  </span>
                </h3>

                {directoryTab === 'featured' ? (
                  <div className="pill-row">
                    <button
                      type="button"
                      className="btn btn-secondary btn-compact"
                      onClick={() => setDirectoryTab('crews')}
                    >
                      Browse All {totalTeams !== null ? totalTeams.toLocaleString() : ''} SQLite Crews <ArrowRightIcon size={13} />
                    </button>
                  </div>
                ) : (
                  <nav className="pagination-bar" aria-label="Crew board pagination">
                    <button
                      type="button"
                      className="btn btn-secondary btn-compact"
                      disabled={!hasPrev}
                      onClick={() => onPageChange(0)}
                      aria-label="First page"
                    >
                      « First
                    </button>
                    <button
                      type="button"
                      className="btn btn-secondary btn-compact"
                      disabled={!hasPrev}
                      onClick={() => onPageChange(Math.max(0, pageIndex - 1))}
                    >
                      ‹ Prev
                    </button>

                    <form onSubmit={handleJumpSubmit} className="page-jump-form">
                      <label className="sr-only" htmlFor="page-jump-input">
                        Jump to page number
                      </label>
                      <input
                        id="page-jump-input"
                        type="number"
                        min={1}
                        max={totalPages}
                        value={jumpInput}
                        onChange={e => setJumpInput(e.target.value)}
                        placeholder={`${pageIndex + 1}/${totalPages}`}
                        className="page-jump-in"
                      />
                      <button type="submit" className="btn btn-ghost btn-compact">
                        Go
                      </button>
                    </form>

                    <button
                      type="button"
                      className="btn btn-secondary btn-compact"
                      disabled={!hasNext}
                      onClick={() => onPageChange(pageIndex + 1)}
                    >
                      Next ›
                    </button>
                    {totalTeams !== null && (
                      <button
                        type="button"
                        className="btn btn-secondary btn-compact"
                        disabled={pageIndex + 1 >= totalPages}
                        onClick={() => onPageChange(totalPages - 1)}
                        aria-label="Last page"
                      >
                        Last »
                      </button>
                    )}

                    <label className="sr-only" htmlFor="page-size-select">
                      Cards per page
                    </label>
                    <select
                      id="page-size-select"
                      value={pageSize}
                      onChange={e => onPageSizeChange(Number(e.target.value))}
                      className="compact-select"
                      aria-label="Crews per page"
                    >
                      <option value={12}>12 / page</option>
                      <option value={24}>24 / page</option>
                      <option value={50}>50 / page</option>
                      <option value={100}>100 / page</option>
                    </select>
                  </nav>
                )}
              </div>

              {crewsToDisplay.length === 0 ? (
                <div className="surface-card empty-state-card">
                  <h3>No crews on this page match your active filter</h3>
                  <p className="muted-copy prose-measure">
                    Spawn 3 live open-seat showcase crews onto Page 1 in 1 click, or reset your active search/skill filters.
                  </p>
                  <div className="pill-row">
                    <button
                      type="button"
                      className="btn btn-primary"
                      disabled={spawningDemo}
                      onClick={() => {
                        if (searchQuery.trim()) setSearchQuery('');
                        onSpawnShowcaseCrews();
                      }}
                    >
                      <PlusIcon size={15} />{' '}
                      {spawningDemo ? 'Spawning Live SQLite Crews...' : 'Spawn 3 Open-Seat Showcase Crews Now'}
                    </button>
                    {activeFilterCount > 0 && (
                      <button type="button" className="btn btn-secondary" onClick={clearFilters}>
                        Reset Filters
                      </button>
                    )}
                  </div>
                </div>
              ) : (
                <div className="crew-grid studio-card-grid">
                  {crewsToDisplay.map(crew => {
                    const pct = Math.min(100, Math.round((crew.members / crew.maxSize) * 100));
                    return (
                      <article key={crew.teamId} className="crew-card" aria-label={`Crew ${crew.teamId}`}>
                        <div className="crew-card-top">
                          <div>
                            <h4 className="crew-id">{crew.teamId}</h4>
                            <span className="leader-tag">
                              ★ Leader: <code>{crew.leader}</code> · {crew.secondaryContext}
                            </span>
                          </div>
                          {!legacyMode && (
                            <div className="pill-row">
                              {crew.isCustomMission && (
                                <span className="status-chip chip-ok" title="Judge-authored custom mission">
                                  Custom
                                </span>
                              )}
                              {crew.batonPassReady && (
                                <span className="baton-pill" title="Configured for asynchronous cross-timezone handoff">
                                  UTC Baton
                                </span>
                              )}
                            </div>
                          )}
                        </div>

                        <div className="pill-row">
                          <LifecycleBadge
                            lifecycle={crew.lifecycle}
                            label={crew.lifecycleLabel}
                            legacyMode={legacyMode}
                            openSeats={crew.openSeats}
                            members={crew.members}
                            maxSize={crew.maxSize}
                          />
                        </div>

                        <p className="crew-mission">{crew.mission}</p>

                        {legacyMode ? (
                          <div className="legacy-blindspot-callout">
                            <AlertTriangleIcon size={14} />
                            <span>{crew.legacyHiddenFailure}</span>
                          </div>
                        ) : (
                          <>
                            <div className="seat-meter-block">
                              <div className="row-between small-copy">
                                <strong>
                                  {crew.members} / {crew.maxSize} seats committed
                                </strong>
                                <span className={crew.openSeats === 1 ? 'final-seat-text' : 'muted-copy'}>
                                  {crew.openSeats === 0
                                    ? 'Full Capacity'
                                    : crew.openSeats === 1
                                      ? '1 Final Seat Left!'
                                      : `${crew.openSeats} Open Seats`}
                                </span>
                              </div>
                              <div
                                className="seat-meter-track"
                                role="progressbar"
                                aria-valuenow={crew.members}
                                aria-valuemin={0}
                                aria-valuemax={crew.maxSize}
                                aria-label={`${crew.members} of ${crew.maxSize} seats filled`}
                              >
                                <div
                                  className={`seat-meter-fill ${
                                    crew.openSeats === 0
                                      ? 'fill-full'
                                      : crew.openSeats === 1
                                        ? 'fill-scarce'
                                        : 'fill-open'
                                  }`}
                                  style={{ width: `${pct}%` }}
                                />
                              </div>
                            </div>
                          </>
                        )}

                        <div className="tag-cluster">
                          {crew.skills.map(sk => (
                            <span key={sk} className="skill-badge">
                              {sk}
                            </span>
                          ))}
                          {!legacyMode && (
                            <span className="utc-badge">
                              <GlobeIcon size={13} /> {crew.utcLabel}
                            </span>
                          )}
                        </div>

                        <div className="card-actions-row">
                          <button
                            type="button"
                            className="btn btn-secondary btn-compact"
                            onClick={() => onInspectTeam(crew.teamId)}
                          >
                            <EyeIcon size={14} /> Roster
                          </button>
                          <button
                            type="button"
                            className="btn btn-secondary btn-compact"
                            onClick={() => onCheckFitCrew(crew)}
                          >
                            <SparklesIcon size={14} /> Check Fit
                          </button>
                          <button
                            type="button"
                            className={`btn btn-compact ${crew.openSeats > 0 ? 'btn-primary' : 'btn-ghost'}`}
                            onClick={() => onRequestSeatForTeam(crew.teamId)}
                          >
                            {crew.openSeats > 0 ? 'Request Seat' : 'Manage'} <ArrowRightIcon size={13} />
                          </button>
                        </div>
                      </article>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>

        {/* RIGHT COLUMN (38%): Sticky Live Crew & Baton-Pass Preview Dock */}
        <aside className="discover-dock-column" aria-label="Live Crew Sandbox and Baton-Pass Preview Dock">
          <div className="surface-card live-crew-dock sticky-dock">
            {/* 1. Active Crew Sandbox Header & Live Verdict */}
            <div className="dock-head">
              <div className="row-between wrap-gap">
                <span className="eyebrow-tag">YOUR ACTIVE CREW SANDBOX</span>
                <div className="pill-row scenario-mini-pills" role="group" aria-label="Quick mission preset">
                  {[
                    { key: 'baton', label: 'A: Baton' },
                    { key: 'hall', label: 'B: Hall' },
                    { key: 'omega', label: 'C: Omega' }
                  ].map(sc => (
                    <button
                      key={sc.key}
                      type="button"
                      aria-pressed={activeScenarioKey === sc.key}
                      className={`mini-preset-chip ${activeScenarioKey === sc.key ? 'active' : ''}`}
                      onClick={() => onSelectScenario(sc.key)}
                      title={MISSION_SCENARIOS[sc.key]?.title}
                    >
                      {sc.label}
                    </button>
                  ))}
                </div>
              </div>

              <p className="dock-goal-copy">{goalDescription}</p>

              <div
                className={`dock-verdict-banner verdict-${verdict.tone}`}
                role="status"
                title={verdict.codeTitle}
              >
                <div className="row-between">
                  <span className="dock-verdict-title">
                    {verdict.tone === 'ok' ? (
                      <CheckCircleIcon size={16} />
                    ) : (
                      <AlertTriangleIcon size={16} />
                    )}
                    <strong>{solving ? 'Solving Critical Path...' : verdict.badge}</strong>
                  </span>
                  <span className="mono-pill">
                    {teamPeople.length} {teamPeople.length === 1 ? 'builder' : 'builders'}
                  </span>
                </div>
              </div>

              {/* Active Simulated Crew Chips */}
              <div className="dock-roster-row" aria-label="Simulated crew members">
                {teamPeople.map(p => {
                  const dirMatch = BUILDER_DIRECTORY.find(
                    b => b.plannerId === p.id || b.id === p.id
                  );
                  return (
                    <button
                      key={p.id}
                      type="button"
                      className="dock-member-pill"
                      onClick={() =>
                        onToggleBuilderInCrew(
                          dirMatch || {
                            id: p.id,
                            plannerId: p.id,
                            timezone: p.timezone,
                            startMin: p.startMin,
                            endMin: p.endMin,
                            skills: p.skills || {}
                          }
                        )
                      }
                      title={`Click to remove ${p.id} (${p.timezone}) from simulation`}
                    >
                      <span className="member-dot" aria-hidden="true" />
                      <strong>{p.id}</strong>
                      <span className="muted-copy">{(p.timezone || '').split('·')[0].trim()}</span>
                      <span aria-hidden="true" className="remove-x">×</span>
                    </button>
                  );
                })}
                {!priyaInCrew && priyaBuilder && activeScenarioKey === 'baton' && (
                  <button
                    type="button"
                    className="dock-member-pill pill-suggest"
                    onClick={() => onToggleBuilderInCrew(priyaBuilder)}
                  >
                    + Add priya (UTC+5:30)
                  </button>
                )}
              </div>
            </div>

            {/* 2. Embedded Compact 86px SolarBatonHorizon */}
            <SolarBatonHorizon
              mode="architect"
              theme={theme}
              motion={motion}
              compact
              horizonMin={horizonMin}
              teamPeople={teamPeople}
              candidates={candidates}
              recommendations={recs?.recommendations || []}
            />

            {/* 3. Live Critical-Path Mini-Bars (ES..EF, Slack & Assigned Builder) */}
            <div className="dock-tasks-block">
              <div className="row-between small-copy">
                <strong>Critical-Path Task Schedule (0..{horizonMin}m)</strong>
                <span className="muted-copy">ES..EF &amp; Slack</span>
              </div>

              <div className="dock-task-bars">
                {tasks.map(t => {
                  const cp = (plan?.criticalPath || []).find(m => m.taskId === t.id);
                  const asg = (plan?.witness?.assignments || []).find(a => a.taskId === t.id);
                  const es = asg ? asg.startMin : cp ? cp.earliestStartMin : 0;
                  const ef = asg ? asg.endMin : cp ? cp.earliestFinishMin : t.durationMin;
                  const leftPct = Math.min(92, Math.max(0, Math.round((es / horizonMin) * 100)));
                  const widthPct = Math.max(8, Math.min(100 - leftPct, Math.round(((ef - es) / horizonMin) * 100)));

                  return (
                    <div key={t.id} className={`dock-task-row ${asg ? 'task-assigned' : 'task-blocked'}`}>
                      <div className="row-between small-copy">
                        <span>
                          <strong>{t.id}</strong> <span className="muted-copy">({t.skill})</span>
                        </span>
                        <span className="mono-cell">
                          {asg ? (
                            <span className="assigned-ok">
                              {asg.evidence === 'unknown' ? '? ' : '✓ '}
                              {asg.personId} [{asg.startMin}..{asg.endMin}m]
                            </span>
                          ) : (
                            <span className="assigned-missing">Unassigned</span>
                          )}
                        </span>
                      </div>

                      <div className="dock-bar-track">
                        <div
                          className={`dock-bar-fill ${asg ? 'bar-ok' : 'bar-missing'}`}
                          style={{ left: `${leftPct}%`, width: `${widthPct}%` }}
                        />
                      </div>

                      <div className="row-between tiny-copy muted-copy">
                        <span>
                          {(t.after || []).length > 0 ? `after ${t.after.join(', ')}` : 'starts T+0m'}
                        </span>
                        <span className={cp && cp.slackMin <= 0 ? 'final-seat-text' : ''}>
                          {cp
                            ? cp.slackMin <= 0
                              ? '0m slack (Critical)'
                              : `+${cp.slackMin}m slack`
                            : `${t.durationMin}m`}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* 4. 1-Click Primary Actions */}
            <div className="dock-actions-stack">
              {plan?.status === 'FEASIBLE_WITNESS' ? (
                <>
                  <button
                    type="button"
                    className="btn btn-primary btn-glow-cta full-width"
                    disabled={lockingPlan}
                    onClick={onLockPlanAndMintInvite}
                  >
                    <ShieldCheckIcon size={16} />{' '}
                    {lockingPlan
                      ? 'Committing Crew & Minting Invite...'
                      : 'Commit Crew & Mint Single-Use Invite ->'}
                  </button>
                  <button
                    type="button"
                    className="btn btn-secondary btn-compact full-width"
                    onClick={onInspectDagWipe}
                  >
                    <SplitWipeIcon size={15} /> Inspect Before/After DAG Wipe
                  </button>
                </>
              ) : (
                <>
                  {priyaBuilder && !priyaInCrew && activeScenarioKey === 'baton' ? (
                    <button
                      type="button"
                      className="btn btn-primary full-width"
                      onClick={() => onToggleBuilderInCrew(priyaBuilder)}
                    >
                      <PlusIcon size={15} /> Simulate Priya (UTC+5:30 Baton) in Crew
                    </button>
                  ) : recs?.recommendations?.[0]?.restoresFeasibility ? (
                    <button
                      type="button"
                      className="btn btn-primary full-width"
                      onClick={() => {
                        const topId = recs.recommendations[0].candidateId;
                        const match =
                          BUILDER_DIRECTORY.find(b => b.plannerId === topId || b.id === topId) ||
                          candidates.find(c => c.id === topId);
                        if (match) onToggleBuilderInCrew(match);
                      }}
                    >
                      <PlusIcon size={15} /> Simulate Top Match ({recs.recommendations[0].candidateId}) in Crew
                    </button>
                  ) : null}

                  <button
                    type="button"
                    className="btn btn-secondary btn-compact full-width"
                    onClick={onInspectDagWipe}
                  >
                    Open Full Mission Planner <ArrowRightIcon size={14} />
                  </button>
                </>
              )}
            </div>
          </div>
        </aside>
      </div>
    </section>
  );
}
