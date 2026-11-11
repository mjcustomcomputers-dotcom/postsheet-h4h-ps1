import React, { useState, useMemo } from 'react';
import SolarBatonHorizon from '../components/SolarBatonHorizon.jsx';
import {
  SKILLS_CATALOG,
  BUILDER_DIRECTORY,
  MISSION_SCENARIOS,
  deriveCrewProfile,
  normalizeBuilderId,
  findBuilderById,
  computePartialTaskPreview,
  describePlainPlanVerdict
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
        <span className="lifecycle-badge badge-legacy-complete" title="Profile-only boards treat full spots as complete without checking task hours">
          Complete ({members}/{maxSize})
        </span>
      );
    }
    return (
      <span className="lifecycle-badge badge-forming" title="Profile-only recruiting tag without time-zone handoff check">
        Recruiting ({members}/{maxSize})
      </span>
    );
  }

  if (lifecycle === 'FEASIBLE_VERIFIED') {
    return (
      <span
        className="lifecycle-badge badge-ok"
        title="Server spots confirmed and task schedule verified"
      >
        <CheckCircleIcon size={14} /> Plan works · Ready
      </span>
    );
  }
  if (lifecycle === 'PLAN_FEASIBLE_PENDING_ACCEPTANCE') {
    return (
      <span
        className="lifecycle-badge badge-accent"
        title="Schedule verified; open spot available on server"
      >
        <SparklesIcon size={14} /> {openSeats === 1 ? '1 last spot open' : 'Plan checked · Open spot'}
      </span>
    );
  }
  if (lifecycle === 'ROSTER_CONFIRMED') {
    return (
      <span
        className="lifecycle-badge badge-warn"
        title="All spots filled on server, task hours not checked yet"
      >
        <AlertTriangleIcon size={14} /> {label || 'Spots full · Plan unchecked'}
      </span>
    );
  }
  return (
    <span
      className="lifecycle-badge badge-forming"
      title="Open spots available; looking for matching skills"
    >
      <ClockIcon size={14} /> {label || 'Open to teammates'}
    </span>
  );
}

function isBuilderInActiveCrew(builder, teamPeople) {
  const target = normalizeBuilderId(builder?.plannerId || builder?.id);
  if (!target) return false;
  return (teamPeople || []).some(
    p => normalizeBuilderId(p?.plannerId || p?.id) === target || p?.id === builder?.id
  );
}

export default function DiscoverView({
  theme = 'h4h-glass',
  motion = 'spring',
  isPanoramic3 = false,
  activeLinkId = null,
  onLinkHover,
  pulseTrigger = 0,
  onTriggerPulse,
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
  activeScenarioKey = 'baton',
  onSelectScenario,
  goalDescription = '',
  horizonHours = 8,
  tasks = [],
  teamPeople = [],
  candidates = [],
  plan = null,
  recs = null,
  lockingPlan = false,
  onToggleBuilderInCrew,
  onVerifyPersonSkill,
  onLockPlanAndMintInvite,
  onInspectDagWipe,
  onNotify
}) {
  const [directoryTab, setDirectoryTab] = useState('featured'); // 'featured' | 'builders' | 'crews'
  const [lensMode, setLensMode] = useState('ps1'); // 'ps1' | 'legacy'
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedSkill, setSelectedSkill] = useState('all');
  const [openOnly, setOpenOnly] = useState(false);
  const [jumpInput, setJumpInput] = useState('');
  const [customEventDraft, setCustomEventDraft] = useState('');
  const [showScopeTools, setShowScopeTools] = useState(false);
  const [actionHint, setActionHint] = useState(
    'Action preview: "Try in plan" tests schedule fit locally (preview only). "Invite / Join team" manages real server spots.'
  );

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
      map.set(normalizeBuilderId(r.candidateId), r);
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
    onNotify?.('Cleared all active filters', 'ok');
  }

  function handleJumpSubmit(e) {
    e.preventDefault();
    const target = Number(jumpInput);
    if (Number.isFinite(target) && target >= 1 && target <= totalPages) {
      onPageChange(target - 1);
      setJumpInput('');
      onNotify?.(`Jumped to page ${target} of ${totalPages}`, 'info');
    } else {
      onNotify?.(`Enter a page number between 1 and ${totalPages}`, 'warn');
    }
  }

  const activeFilterCount =
    (searchQuery.trim() ? 1 : 0) +
    (selectedSkill !== 'all' ? 1 : 0) +
    (openOnly ? 1 : 0);

  const partialPreview = useMemo(
    () => computePartialTaskPreview(tasks, teamPeople, horizonMin, plan),
    [tasks, teamPeople, horizonMin, plan]
  );
  const plainVerdict = useMemo(
    () => describePlainPlanVerdict(plan, tasks, partialPreview),
    [plan, tasks, partialPreview]
  );
  const topRecEntry = useMemo(
    () =>
      (recs?.recommendations || []).find(
        r => r.restoresFeasibility || r.upgradesToConditional
      ) || null,
    [recs]
  );
  const topRecBuilder = useMemo(
    () => (topRecEntry ? findBuilderById(topRecEntry.candidateId, [candidates, teamPeople]) : null),
    [topRecEntry, candidates, teamPeople]
  );
  const topRecInCrew = topRecBuilder ? isBuilderInActiveCrew(topRecBuilder, teamPeople) : false;
  const topRecShortName = topRecBuilder
    ? (topRecBuilder.displayName || topRecBuilder.id).split(' ')[0]
    : '';
  const topRecShortTz = topRecBuilder
    ? (topRecBuilder.timezone || '').split('·')[0].trim()
    : '';
  const mateoInCrew = useMemo(
    () => (teamPeople || []).some(p => normalizeBuilderId(p?.plannerId || p?.id) === 'mateo'),
    [teamPeople]
  );

  const crewsToDisplay = directoryTab === 'featured' ? featuredCrews : filteredCrews;

  return (
    <section aria-labelledby="discover-heading" className="view-section discover-studio-section">
      {/* Compact Plain-Language Directory Header + Filter Strip */}
      <div className="surface-card discover-top-bar">
        <div className="discover-head-row">
          <div className="discover-title-cluster">
            <div className="pill-row">
              <h2 id="discover-heading" className="discover-h2">
                Find teammates &amp; open teams
              </h2>
              <span className="kpi-inline-pill" title="Latest server board read speed">
                Read: <strong>{boardLatencyMs !== null ? `${boardLatencyMs.toFixed(1)} ms` : '--'}</strong>
              </span>
              <span className="kpi-inline-pill" title={`Server-recorded teams in ${eventId}`}>
                <strong>{totalTeams !== null ? `${totalTeams.toLocaleString()}` : board.length}</strong> teams
              </span>
              <span className={`kpi-inline-pill ${sseConnected ? 'kpi-live' : ''}`} title="Live team updates">
                {sseConnected ? '● Live updates' : 'Standby'}
              </span>
            </div>
            <p className="discover-subcopy">
              Preview how a person fits your task schedule before inviting anyone, then confirm real team spots on the server.
            </p>
          </div>

          {/* 1-Click Lens Comparison */}
          <div className="lens-switcher" role="group" aria-label="Compare purpose-first view against profile-only directory">
            <button
              type="button"
              aria-pressed={!legacyMode}
              className={`lens-btn ${!legacyMode ? 'active' : ''}`}
              onClick={() => {
                setLensMode('ps1');
                onNotify?.('Purpose-First view active: schedule fit and time-zone handoffs visible.', 'ok');
              }}
            >
              <SparklesIcon size={14} /> Purpose-First View
            </button>
            <button
              type="button"
              aria-pressed={legacyMode}
              className={`lens-btn lens-btn-warn ${legacyMode ? 'active' : ''}`}
              onClick={() => {
                setLensMode('legacy');
                onNotify?.('Profile-Only comparison active: notice hidden time-zone and double-booking blindspots.', 'warn');
              }}
            >
              <AlertTriangleIcon size={14} /> Compare Profile-Only
            </button>
          </div>
        </div>

        {/* Compact Filter Strip */}
        <div
          className="discover-filter-strip"
          role="search"
          aria-label="Filter people and teams by skill, search query, and open spots"
        >
          <div className="search-box compact-search-box">
            <SearchIcon size={15} className="search-box-icon" />
            <input
              type="search"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search name, city, skill, or team..."
              aria-label="Search people and teams"
            />
          </div>

          <div className="tab-strip compact-tab-strip" role="tablist" aria-label="Show people or teams">
            {[
              { id: 'featured', label: 'Overview' },
              { id: 'builders', label: `People (${filteredBuilders.length})` },
              {
                id: 'crews',
                label: `Teams (${totalTeams !== null ? totalTeams.toLocaleString() : filteredCrews.length})`
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

          <div className="pill-row skill-strip" role="group" aria-label="Filter by skill">
            <button
              type="button"
              aria-pressed={selectedSkill === 'all'}
              className={`chip-toggle chip-compact ${selectedSkill === 'all' ? 'active' : ''}`}
              onClick={() => setSelectedSkill('all')}
            >
              All skills
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
              <span>Open spots only</span>
            </button>

            <button
              type="button"
              aria-expanded={showScopeTools}
              className="btn btn-ghost btn-compact"
              onClick={() => setShowScopeTools(v => !v)}
              title="Switch event or add example open teams"
            >
              Event: <code>{eventId}</code>
            </button>

            {activeFilterCount > 0 && (
              <button type="button" className="btn btn-ghost btn-compact" onClick={clearFilters}>
                Clear ({activeFilterCount})
              </button>
            )}
          </div>
        </div>

        {/* Calm non-covering Action Consequence Preview Bar (CRR View 1) */}
        <div className="action-consequence-bar small-copy" role="status" aria-live="polite">
          {actionHint}
        </div>

        {/* Progressive-Disclosure Event Scope & Example Teams */}
        {showScopeTools && (
          <div className="scope-bar compact-scope-bar">
            <div className="pill-row">
              <span className="filter-group-label">Event:</span>
              {['seed-event', 'h4h-open-crews'].map(ev => (
                <button
                  key={ev}
                  type="button"
                  aria-pressed={eventId === ev}
                  className={`chip-toggle chip-compact ${eventId === ev ? 'active' : ''}`}
                  onClick={() => onChangeEventId(ev)}
                >
                  {ev === 'seed-event' ? 'seed-event (2,000+ teams)' : 'h4h-open-crews (Sandbox)'}
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
                  placeholder="Custom event ID..."
                  aria-label="Custom event identifier"
                  className="compact-field"
                />
                <button type="submit" className="btn btn-secondary btn-compact">
                  Switch
                </button>
              </form>

              <button
                type="button"
                className="btn btn-secondary btn-compact"
                disabled={spawningDemo}
                onClick={onSpawnShowcaseCrews}
              >
                <PlusIcon size={14} /> {spawningDemo ? 'Creating...' : 'Add 3 example teams'}
              </button>
              <button type="button" className="btn btn-ghost btn-compact" onClick={onRefreshBoard}>
                <RefreshIcon size={14} /> Refresh
              </button>
            </div>
          </div>
        )}
      </div>

      {/* When 3-Column Panorama is active on desktop, hide the duplicate inner dock so Column 1 + Column 2 + Column 3 read cleanly */}
      <div className={`discover-split-studio ${isPanoramic3 ? 'discover-panorama-single' : ''}`}>
        <div className="discover-cards-column">
          {legacyMode && (
            <div className="legacy-mode-banner" role="status">
              <AlertTriangleIcon size={16} />
              <div>
                <strong>Profile-Only Comparison Active:</strong> Traditional directories show only city and flat skill tags, hiding time-zone handoff windows and calling 5/5 teams "Complete" even when one person is double-booked. Switch back to <strong>Purpose-First View</strong> to see real schedule fit.
              </div>
            </div>
          )}

          {/* Inline Selected Team Server Roster */}
          {selectedTeam && (
            <div
              className="surface-card inspector-banner"
              role="region"
              aria-label={`Confirmed server members for ${selectedTeam.teamId}`}
            >
              <div className="row-between wrap-gap">
                <div>
                  <span className="eyebrow-tag">CONFIRMED BY SERVER · {eventId}</span>
                  <h3 className="card-subtitle">
                    Team <code>{selectedTeam.teamId}</code> · {selectedTeam.members.length} / {selectedTeam.maxSize} spots filled
                  </h3>
                </div>
                <div className="pill-row">
                  <button
                    type="button"
                    className="btn btn-primary btn-compact"
                    onClick={() => onRequestSeatForTeam(selectedTeam.teamId)}
                  >
                    <ShieldCheckIcon size={14} /> Invite / Join team
                  </button>
                  <button type="button" className="btn btn-ghost btn-compact" onClick={onCloseInspect}>
                    Close
                  </button>
                </div>
              </div>

              <div className="member-chips-grid">
                {selectedTeam.members.map(m => (
                  <div key={m.userId} className={`member-chip ${m.isLeader ? 'leader-chip' : ''}`}>
                    <UserIcon size={14} />
                    <strong>{m.userId}</strong>
                    <span className="badge-pill">{m.isLeader ? '★ Lead' : 'Member'}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* SECTION A: People */}
          {(directoryTab === 'featured' || directoryTab === 'builders') && (
            <div className="directory-section">
              <div className="row-between wrap-gap section-header-bar">
                <h3 className="section-heading-compact">
                  People who fit open tasks
                  <span className="count-pill">{filteredBuilders.length} available</span>
                </h3>
                {!legacyMode && (
                  <span className="small-copy muted-copy">
                    <strong>Try in plan</strong> checks schedule fit locally (preview only - not joined yet)
                  </span>
                )}
              </div>

              {filteredBuilders.length === 0 ? (
                <div className="surface-card empty-state-card">
                  <p className="muted-copy">No people match your current search or skill filter.</p>
                  {activeFilterCount > 0 && (
                    <button type="button" className="btn btn-secondary btn-compact" onClick={clearFilters}>
                      Clear filters
                    </button>
                  )}
                </div>
              ) : (
                <div className="crew-grid studio-card-grid">
                  {filteredBuilders.map(b => {
                    const inCrew = isBuilderInActiveCrew(b, teamPeople);
                    const rec = recById.get(b.plannerId) || recById.get(b.id);
                    const restores = Boolean(rec?.restoresFeasibility);
                    const isLinked = activeLinkId && normalizeBuilderId(activeLinkId) === normalizeBuilderId(b.id);
                    const winStartPct = Math.round((b.startMin / 480) * 100);
                    const winWidthPct = Math.max(8, Math.round(((b.endMin - b.startMin) / 480) * 100));

                    return (
                      <article
                        key={b.id}
                        data-reactive-surface="true"
                        data-link-id={b.id}
                        onMouseEnter={() => onLinkHover?.(b.id)}
                        onMouseLeave={() => onLinkHover?.(null)}
                        onFocus={() => onLinkHover?.(b.id)}
                        className={`crew-card builder-card ${inCrew ? 'card-in-crew' : ''} ${
                          restores && !inCrew && !legacyMode ? 'card-top-match' : ''
                        } ${isLinked ? 'is-linked-ridge' : ''}`}
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
                                <span className="status-chip chip-ok" title="Completes all uncovered tasks in your active plan">
                                  ★ Completes plan
                                </span>
                              )}
                              {b.batonReady && !restores && (
                                <span className="baton-pill">Handoff ready</span>
                              )}
                            </div>
                          )}
                        </div>

                        <p className="crew-mission">{b.bio}</p>

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
                                    ? 'Unverified skill (can confirm with a quick 5-minute check)'
                                    : 'Verified skill'
                                }
                              >
                                {st === 'unknown' ? `Unverified: ${sk}` : `✓ ${sk}`}
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
                            <div className="wake-track" aria-label={`Available hours ${b.windowLabel}`}>
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
                            onMouseEnter={() =>
                              setActionHint(
                                inCrew
                                  ? `Remove ${b.displayName || b.id} from your local plan preview (does not change server membership).`
                                  : `Try ${b.displayName || b.id} (${b.timezone}) in your plan preview - does not join on server yet.`
                              )
                            }
                            onFocus={() =>
                              setActionHint(
                                inCrew
                                  ? `Remove ${b.displayName || b.id} from your local plan preview (does not change server membership).`
                                  : `Try ${b.displayName || b.id} (${b.timezone}) in your plan preview - does not join on server yet.`
                              )
                            }
                            onClick={() => {
                              onTriggerPulse?.();
                              onToggleBuilderInCrew(b);
                            }}
                          >
                            {inCrew ? '✓ In plan (Remove)' : 'Try in plan'}
                          </button>
                          <button
                            type="button"
                            className="btn btn-secondary btn-compact"
                            onMouseEnter={() =>
                              setActionHint(`Inspect ${b.displayName || b.id}'s hours and skill details in Step 2 (Plan the work).`)
                            }
                            onFocus={() =>
                              setActionHint(`Inspect ${b.displayName || b.id}'s hours and skill details in Step 2 (Plan the work).`)
                            }
                            onClick={() => onSendBuilderToArchitect(b)}
                          >
                            View details <ArrowRightIcon size={13} />
                          </button>
                        </div>

                        <div className="card-consequence-note tiny-copy muted-copy">
                          {inCrew ? 'Preview only - not joined on server yet' : 'Preview fit before sending an invite'}
                        </div>
                      </article>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* SECTION B: Open & Live Teams */}
          {(directoryTab === 'featured' || directoryTab === 'crews') && (
            <div className="directory-section">
              <div className="row-between wrap-gap section-header-bar">
                <h3 className="section-heading-compact">
                  {directoryTab === 'featured'
                    ? 'Open & featured teams'
                    : `All server-recorded teams in ${eventId}`}
                  <span className="count-pill">
                    {directoryTab === 'featured'
                      ? `${crewsToDisplay.length} shown`
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
                      Browse all {totalTeams !== null ? totalTeams.toLocaleString() : ''} teams <ArrowRightIcon size={13} />
                    </button>
                  </div>
                ) : (
                  <nav className="pagination-bar" aria-label="Team directory pages">
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
                      Teams per page
                    </label>
                    <select
                      id="page-size-select"
                      value={pageSize}
                      onChange={e => {
                        onPageSizeChange(Number(e.target.value));
                      }}
                      className="compact-select"
                      aria-label="Teams per page"
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
                  <h3>No teams on this page match your filter</h3>
                  <p className="muted-copy prose-measure">
                    Add 3 open example teams onto Page 1 in one click, or clear your active filters.
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
                      {spawningDemo ? 'Creating example teams...' : 'Add 3 open example teams'}
                    </button>
                    {activeFilterCount > 0 && (
                      <button type="button" className="btn btn-secondary" onClick={clearFilters}>
                        Clear filters
                      </button>
                    )}
                  </div>
                </div>
              ) : (
                <div className="crew-grid studio-card-grid">
                  {crewsToDisplay.map(crew => {
                    const pct = Math.min(100, Math.round((crew.members / crew.maxSize) * 100));
                    const isLinked = activeLinkId === crew.teamId;
                    return (
                      <article
                        key={crew.teamId}
                        data-reactive-surface="true"
                        data-link-id={crew.teamId}
                        onMouseEnter={() => onLinkHover?.(crew.teamId)}
                        onMouseLeave={() => onLinkHover?.(null)}
                        onFocus={() => onLinkHover?.(crew.teamId)}
                        className={`crew-card ${isLinked ? 'is-linked-ridge' : ''}`}
                        aria-label={`Team ${crew.teamId}`}
                      >
                        <div className="crew-card-top">
                          <div>
                            <h4 className="crew-id">{crew.teamId}</h4>
                            <span className="leader-tag">
                              ★ Lead: <code>{crew.leader}</code> · {crew.secondaryContext}
                            </span>
                          </div>
                          {!legacyMode && (
                            <div className="pill-row">
                              {crew.isCustomMission && (
                                <span className="status-chip chip-ok">Custom</span>
                              )}
                              {crew.batonPassReady && (
                                <span className="baton-pill" title="Cross-timezone handoff team">
                                  Time-zone handoff
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
                          <div className="seat-meter-block">
                            <div className="row-between small-copy">
                              <strong>
                                {crew.members} / {crew.maxSize} spots confirmed
                              </strong>
                              <span className={crew.openSeats === 1 ? 'final-seat-text' : 'muted-copy'}>
                                {crew.openSeats === 0
                                  ? 'Team full'
                                  : crew.openSeats === 1
                                    ? '1 last spot left'
                                    : `${crew.openSeats} open spots`}
                              </span>
                            </div>
                            <div
                              className="seat-meter-track"
                              role="progressbar"
                              aria-valuenow={crew.members}
                              aria-valuemin={0}
                              aria-valuemax={crew.maxSize}
                              aria-label={`${crew.members} of ${crew.maxSize} spots filled`}
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
                            onMouseEnter={() =>
                              setActionHint(`View details: load server-confirmed member list for ${crew.teamId}.`)
                            }
                            onFocus={() =>
                              setActionHint(`View details: load server-confirmed member list for ${crew.teamId}.`)
                            }
                            onClick={() => onInspectTeam(crew.teamId)}
                          >
                            <EyeIcon size={14} /> View details
                          </button>
                          <button
                            type="button"
                            className="btn btn-secondary btn-compact"
                            onMouseEnter={() =>
                              setActionHint(`Try in plan: preview ${crew.teamId}'s tasks and hours in Step 2 (preview only).`)
                            }
                            onFocus={() =>
                              setActionHint(`Try in plan: preview ${crew.teamId}'s tasks and hours in Step 2 (preview only).`)
                            }
                            onClick={() => onCheckFitCrew(crew)}
                          >
                            <SparklesIcon size={14} /> Try in plan
                          </button>
                          <button
                            type="button"
                            className={`btn btn-compact ${crew.openSeats > 0 ? 'btn-primary' : 'btn-ghost'}`}
                            onMouseEnter={() =>
                              setActionHint(
                                crew.openSeats > 0
                                  ? `Invite / Join team: open server membership for ${crew.teamId} (${crew.openSeats} open spots).`
                                  : `Manage team: inspect server membership for ${crew.teamId}.`
                              )
                            }
                            onFocus={() =>
                              setActionHint(
                                crew.openSeats > 0
                                  ? `Invite / Join team: open server membership for ${crew.teamId} (${crew.openSeats} open spots).`
                                  : `Manage team: inspect server membership for ${crew.teamId}.`
                              )
                            }
                            onClick={() => onRequestSeatForTeam(crew.teamId)}
                          >
                            {crew.openSeats > 0 ? 'Invite / Join team' : 'Manage team'} <ArrowRightIcon size={13} />
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

        {/* Single-Focus Companion Dock (Hidden automatically when 3-Column Panorama already displays Team Plan & Schedule) */}
        {!isPanoramic3 && (
          <aside className="discover-dock-column" aria-label="Team Plan Preview">
            <div className="surface-card live-crew-dock sticky-dock">
              <div className="dock-head">
                <div className="row-between wrap-gap">
                  <span className="eyebrow-tag">TEAM PLAN PREVIEW</span>
                  <div className="pill-row scenario-mini-pills" role="group" aria-label="Example plans">
                    {Object.values(MISSION_SCENARIOS).map(sc => (
                      <button
                        key={sc.id}
                        type="button"
                        aria-pressed={activeScenarioKey === sc.id}
                        className={`mini-preset-chip ${activeScenarioKey === sc.id ? 'active' : ''}`}
                        onClick={() => onSelectScenario(sc.id)}
                        title={sc.title}
                      >
                        {sc.shortPill}
                      </button>
                    ))}
                  </div>
                </div>

                <p className="dock-goal-copy">{goalDescription}</p>

                <div
                  className={`dock-verdict-banner verdict-${plainVerdict.tone}`}
                  role="status"
                >
                  <div className="row-between">
                    <span className="dock-verdict-title">
                      {plainVerdict.tone === 'ok' ? (
                        <CheckCircleIcon size={16} />
                      ) : (
                        <AlertTriangleIcon size={16} />
                      )}
                      <strong>{plainVerdict.headline}</strong>
                    </span>
                    <span className="mono-pill">
                      {teamPeople.length} in preview
                    </span>
                  </div>
                  <div className="small-copy muted-copy top-gap-xs">{plainVerdict.detail}</div>
                </div>

                <div className="dock-roster-row" aria-label="People in plan preview">
                  {teamPeople.map(p => {
                    const dirMatch = findBuilderById(p, [candidates, teamPeople]);
                    return (
                      <button
                        key={p.id}
                        type="button"
                        className="dock-member-pill"
                        onClick={() => {
                          onTriggerPulse?.();
                          onToggleBuilderInCrew(
                            dirMatch || {
                              id: p.id,
                              plannerId: p.id,
                              timezone: p.timezone,
                              startMin: p.startMin,
                              endMin: p.endMin,
                              skills: p.skills || {}
                            }
                          );
                        }}
                        title={`Remove ${p.id} from plan preview`}
                      >
                        <span className="member-dot" aria-hidden="true" />
                        <strong>{p.id}</strong>
                        <span className="muted-copy">{(p.timezone || '').split('·')[0].trim()}</span>
                        <span aria-hidden="true" className="remove-x">×</span>
                      </button>
                    );
                  })}
                  {topRecBuilder && !topRecInCrew && plan?.status !== 'FEASIBLE_WITNESS' && (
                    <button
                      type="button"
                      data-link-id={topRecBuilder.id}
                      className="dock-member-pill pill-suggest"
                      onClick={() => {
                        onTriggerPulse?.();
                        onToggleBuilderInCrew(topRecBuilder);
                      }}
                    >
                      + Try {topRecShortName} ({topRecShortTz})
                    </button>
                  )}
                </div>

                {mateoInCrew && activeScenarioKey === 'baton' && onSelectScenario && (
                  <div className="subcard top-gap-xs">
                    <div className="tiny-copy muted-copy">
                      <strong>Mateo covers Database (UTC-5):</strong> Example 1 has no database task. See Mateo solve Aurora's overload:
                    </div>
                    <button
                      type="button"
                      className="btn btn-secondary btn-compact top-gap-xs"
                      onClick={() => onSelectScenario('hall')}
                    >
                      Switch to Example 2: Double-booked database &amp; API -&gt;
                    </button>
                  </div>
                )}
              </div>

              <SolarBatonHorizon
                mode="architect"
                theme={theme}
                motion={motion}
                compact
                horizonMin={horizonMin}
                teamPeople={teamPeople}
                candidates={candidates}
                recommendations={recs?.recommendations || []}
                pulseTrigger={pulseTrigger}
                activeLinkId={activeLinkId}
              />

              <div className="dock-tasks-block">
                <div className="row-between small-copy">
                  <strong>Tasks ({plainVerdict.coveredCount}/{plainVerdict.totalCount} covered)</strong>
                  <span className="muted-copy">0..{horizonMin}m</span>
                </div>

                <div className="dock-task-bars">
                  {tasks.map(t => {
                    const cp = (plan?.criticalPath || []).find(m => m.taskId === t.id);
                    const witnessAsg = (plan?.witness?.assignments || []).find(a => a.taskId === t.id);
                    const previewAsg = witnessAsg || partialPreview.get(t.id) || null;
                    const isFullWitness = Boolean(witnessAsg) && plan?.status === 'FEASIBLE_WITNESS';
                    const isConditional = Boolean(witnessAsg) && plan?.status !== 'FEASIBLE_WITNESS';
                    const isReadyUpstream = !witnessAsg && Boolean(previewAsg?.readyOnly);
                    const es = previewAsg ? previewAsg.startMin : cp ? cp.earliestStartMin : 0;
                    const ef = previewAsg ? previewAsg.endMin : cp ? cp.earliestFinishMin : t.durationMin;
                    const leftPct = Math.min(92, Math.max(0, Math.round((es / horizonMin) * 100)));
                    const widthPct = Math.max(8, Math.min(100 - leftPct, Math.round(((ef - es) / horizonMin) * 100)));

                    const barClass = isFullWitness
                      ? 'bar-ok'
                      : isConditional || isReadyUpstream
                        ? previewAsg?.evidence === 'unknown'
                          ? 'bar-warn'
                          : 'bar-ready'
                        : 'bar-missing';

                    return (
                      <div
                        key={t.id}
                        className={`dock-task-row ${isFullWitness ? 'task-assigned' : previewAsg ? 'task-ready' : 'task-blocked'}`}
                      >
                        <div className="row-between small-copy">
                          <span>
                            <strong>{t.id}</strong> <span className="muted-copy">({t.skill})</span>
                          </span>
                          <span className="mono-cell">
                            {previewAsg ? (
                              <span className={isFullWitness ? 'assigned-ok' : 'assigned-ready'}>
                                {previewAsg.evidence === 'unknown' ? 'Unverified: ' : '✓ '}
                                {previewAsg.personId} [{previewAsg.startMin}..{previewAsg.endMin}m]
                              </span>
                            ) : (
                              <span className="assigned-missing">Needs {t.skill}</span>
                            )}
                          </span>
                        </div>

                        <div className="dock-bar-track">
                          <div
                            className={`dock-bar-fill ${barClass}`}
                            style={{ left: `${leftPct}%`, width: `${widthPct}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="dock-actions-stack">
                {plan?.status === 'FEASIBLE_WITNESS' ? (
                  <>
                    <button
                      type="button"
                      className="btn btn-primary full-width"
                      disabled={lockingPlan}
                      onClick={onLockPlanAndMintInvite}
                    >
                      <ShieldCheckIcon size={16} />{' '}
                      {lockingPlan ? 'Creating team & invite...' : 'Create team & invite on server ->'}
                    </button>
                    <button
                      type="button"
                      className="btn btn-secondary btn-compact full-width"
                      onClick={onInspectDagWipe}
                    >
                      <SplitWipeIcon size={15} /> Compare Before / After Timeline
                    </button>
                  </>
                ) : (
                  <>
                    {topRecBuilder && !topRecInCrew ? (
                      <button
                        type="button"
                        className="btn btn-primary full-width"
                        onClick={() => {
                          onTriggerPulse?.();
                          onToggleBuilderInCrew(topRecBuilder);
                        }}
                      >
                        <PlusIcon size={15} /> Try {topRecShortName} in plan
                      </button>
                    ) : plan?.status !== 'FEASIBLE_WITNESS' && plan?.frontier?.voiQuestion && onVerifyPersonSkill ? (
                      <button
                        type="button"
                        className="btn btn-primary full-width"
                        onClick={() =>
                          onVerifyPersonSkill(
                            plan.frontier.voiQuestion.personId,
                            plan.frontier.voiQuestion.skill
                          )
                        }
                      >
                        <CheckCircleIcon size={15} /> Confirm {plan.frontier.voiQuestion.personId}'s {plan.frontier.voiQuestion.skill} skill
                      </button>
                    ) : null}

                    <button
                      type="button"
                      className="btn btn-secondary btn-compact full-width"
                      onClick={onInspectDagWipe}
                    >
                      Open Step 2: Plan the work <ArrowRightIcon size={14} />
                    </button>
                  </>
                )}
              </div>
            </div>
          </aside>
        )}
      </div>
    </section>
  );
}
