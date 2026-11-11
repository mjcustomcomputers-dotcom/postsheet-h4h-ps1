import React, { useState, useMemo } from 'react';
import {
  SKILLS_CATALOG,
  UTC_BUCKETS,
  SECONDARY_CONTEXTS,
  BUILDER_DIRECTORY,
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
  ShieldCheckIcon
} from '../icons.jsx';

function LifecycleBadge({ lifecycle }) {
  if (lifecycle === 'FEASIBLE_VERIFIED') {
    return (
      <span className="lifecycle-badge badge-ok" title="Seats confirmed and critical-path schedule verified">
        <CheckCircleIcon size={14} /> FEASIBLE_VERIFIED
      </span>
    );
  }
  if (lifecycle === 'PLAN_FEASIBLE_PENDING_ACCEPTANCE') {
    return (
      <span className="lifecycle-badge badge-accent" title="Deliverable path modeled; awaiting seat or provisional guard acceptance">
        <SparklesIcon size={14} /> PLAN_FEASIBLE_PENDING_ACCEPTANCE
      </span>
    );
  }
  if (lifecycle === 'ROSTER_CONFIRMED') {
    return (
      <span className="lifecycle-badge badge-warn" title="Seats are full, yet critical-path task contention is not verified">
        <AlertTriangleIcon size={14} /> ROSTER_CONFIRMED
      </span>
    );
  }
  return (
    <span className="lifecycle-badge badge-forming" title="Open seats available; actively matching complementary skills">
      <ClockIcon size={14} /> FORMING
    </span>
  );
}

export default function DiscoverView({
  eventId,
  onChangeEventId,
  onEnsureEvent,
  board,
  totalTeams,
  totalMembers,
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
  spawningDemo
}) {
  const [directoryTab, setDirectoryTab] = useState('crews'); // 'crews' | 'builders' | 'both'
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedSkill, setSelectedSkill] = useState('all');
  const [utcFilter, setUtcFilter] = useState('all');
  const [seatFilter, setSeatFilter] = useState('all'); // 'all' | 'open' | 'final-seat' | 'full'
  const [contextFilter, setContextFilter] = useState('all');
  const [jumpInput, setJumpInput] = useState('');
  const [customEventDraft, setCustomEventDraft] = useState('');

  const enrichedCrews = useMemo(
    () => board.map(t => deriveCrewProfile(t, verifiedCrewMap)),
    [board, verifiedCrewMap]
  );

  const filteredCrews = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return enrichedCrews.filter(c => {
      if (q) {
        const hay = `${c.teamId} ${c.leader} ${c.mission} ${c.skills.join(' ')} ${c.secondaryContext}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      if (selectedSkill !== 'all' && !c.skills.includes(selectedSkill)) return false;
      if (utcFilter !== 'all' && c.utcBucket !== utcFilter) return false;
      if (seatFilter === 'open' && c.openSeats <= 0) return false;
      if (seatFilter === 'final-seat' && c.openSeats !== 1) return false;
      if (seatFilter === 'full' && c.openSeats !== 0) return false;
      if (contextFilter !== 'all' && c.secondaryContext !== contextFilter) return false;
      return true;
    });
  }, [enrichedCrews, searchQuery, selectedSkill, utcFilter, seatFilter, contextFilter]);

  const filteredBuilders = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return BUILDER_DIRECTORY.filter(b => {
      const bSkills = Object.keys(b.skills);
      if (q) {
        const hay = `${b.id} ${b.role} ${b.bio} ${b.timezone} ${bSkills.join(' ')} ${b.secondaryContext}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      if (selectedSkill !== 'all' && !bSkills.includes(selectedSkill)) return false;
      if (utcFilter === 'baton' && !b.batonReady) return false;
      if (utcFilter !== 'all' && utcFilter !== 'baton' && b.utcBucket !== utcFilter) return false;
      if (contextFilter !== 'all' && b.secondaryContext !== contextFilter) return false;
      return true;
    });
  }, [searchQuery, selectedSkill, utcFilter, contextFilter]);

  const effectiveTotal = totalTeams !== null ? totalTeams : (board.length === pageSize ? (pageIndex + 2) * pageSize : pageIndex * pageSize + board.length);
  const totalPages = Math.max(1, Math.ceil(effectiveTotal / pageSize));
  const hasPrev = pageIndex > 0;
  const hasNext = totalTeams !== null ? (pageIndex + 1) < totalPages : board.length === pageSize;

  function clearFilters() {
    setSearchQuery('');
    setSelectedSkill('all');
    setUtcFilter('all');
    setSeatFilter('all');
    setContextFilter('all');
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
    (utcFilter !== 'all' ? 1 : 0) +
    (seatFilter !== 'all' ? 1 : 0) +
    (contextFilter !== 'all' ? 1 : 0);

  return (
    <section aria-labelledby="discover-heading" className="view-section">
      {/* View Banner & Live Telemetry Strip */}
      <div className="surface-card hero-strip">
        <div className="row-between wrap-gap">
          <div className="prose-measure">
            <span className="eyebrow-tag">VIEW 1 · FAMILIAR HACK4HACK DIRECTORY + PURPOSE-FIRST INVERSION</span>
            <h2 id="discover-heading" className="view-title">Discover Crews &amp; Complementary Builders</h2>
            <p className="muted-copy">
              Notice how full capacity (<code>ROSTER_CONFIRMED</code>) is explicitly separated from verified critical-path readiness (<code>PLAN_FEASIBLE_PENDING_ACCEPTANCE</code>). Inspect any live SQLite crew, test its deliverable fit in 1 click, or claim an open seat atomically.
            </p>
          </div>

          <div className="telemetry-cluster" role="group" aria-label="Live board performance telemetry">
            <div className="metric-pill">
              <span className="metric-label">Board Read</span>
              <strong className="metric-value">
                {boardLatencyMs !== null ? `${boardLatencyMs.toFixed(1)} ms` : '—'}
              </strong>
            </div>
            <div className="metric-pill">
              <span className="metric-label">Event Crews</span>
              <strong className="metric-value">
                {totalTeams !== null ? totalTeams.toLocaleString() : board.length}
              </strong>
            </div>
            <div className="metric-pill">
              <span className="metric-label">Committed Seats</span>
              <strong className="metric-value">
                {totalMembers !== null ? totalMembers.toLocaleString() : '—'}
              </strong>
            </div>
            <div className="metric-pill">
              <span className="metric-label">SSE Stream</span>
              <strong className="metric-value">{sseConnected ? 'Live Push' : 'Standby'}</strong>
            </div>
          </div>
        </div>

        {/* Event Scope Switcher */}
        <div className="scope-bar">
          <div className="pill-row">
            <span className="filter-group-label">Event Scope:</span>
            {['seed-event', 'h4h-open-crews'].map(ev => (
              <button
                key={ev}
                type="button"
                aria-pressed={eventId === ev}
                className={`chip-toggle ${eventId === ev ? 'active' : ''}`}
                onClick={() => onChangeEventId(ev)}
              >
                {ev === 'seed-event' ? 'seed-event (2,000 Benchmark Crews)' : 'h4h-open-crews (Open-Seat Sandbox)'}
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
                placeholder="Custom eventId…"
                aria-label="Custom event scope identifier"
                className="compact-field"
              />
              <button type="submit" className="btn btn-secondary btn-compact">
                Switch / Create Scope
              </button>
            </form>

            <button
              type="button"
              className="btn btn-secondary btn-compact"
              disabled={spawningDemo}
              onClick={onSpawnShowcaseCrews}
              title="Creates 3 real open-seat crews in this event so Open Seats & 1 Final Seat Left filters have live SQLite rows"
            >
              <PlusIcon /> {spawningDemo ? 'Spawning…' : 'Spawn Open Demo Crews'}
            </button>

            <button type="button" className="btn btn-ghost btn-compact" onClick={onRefreshBoard}>
              <RefreshIcon /> Refresh
            </button>
          </div>
        </div>
      </div>

      {/* Attribute + Purpose Filter Bar */}
      <div className="surface-card filter-card" role="search" aria-label="Filter crews and builders by purpose, skill, UTC window, and seat availability">
        <div className="filter-top-row">
          <div className="search-box">
            <SearchIcon size={17} className="search-box-icon" />
            <input
              type="search"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search crew ID (e.g. crew-0042), leader, mission purpose, or builder…"
              aria-label="Search crews and builders"
            />
          </div>

          <div className="tab-strip" role="tablist" aria-label="Directory entity mode">
            {[
              { id: 'crews', label: `Live Crews (${filteredCrews.length})` },
              { id: 'builders', label: `Builders Pool (${filteredBuilders.length})` },
              { id: 'both', label: 'Combined View' }
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
        </div>

        {/* Skill Filter Pills */}
        <div className="filter-row">
          <span className="filter-group-label">Critical-Path Skill:</span>
          <div className="pill-row" role="group" aria-label="Filter by required skill">
            <button
              type="button"
              aria-pressed={selectedSkill === 'all'}
              className={`chip-toggle ${selectedSkill === 'all' ? 'active' : ''}`}
              onClick={() => setSelectedSkill('all')}
            >
              All Skills
            </button>
            {SKILLS_CATALOG.map(sk => (
              <button
                key={sk.id}
                type="button"
                aria-pressed={selectedSkill === sk.id}
                className={`chip-toggle ${selectedSkill === sk.id ? 'active' : ''}`}
                onClick={() => setSelectedSkill(selectedSkill === sk.id ? 'all' : sk.id)}
              >
                {sk.short}
              </button>
            ))}
          </div>
        </div>

        {/* UTC, Seat Availability & Non-Gatekeeping Secondary Context */}
        <div className="filter-selects-row">
          <label className="field-label inline-select">
            <span><GlobeIcon size={14} /> UTC Availability / Baton Window</span>
            <select value={utcFilter} onChange={e => setUtcFilter(e.target.value)}>
              {UTC_BUCKETS.map(b => (
                <option key={b.id} value={b.id}>{b.label}</option>
              ))}
            </select>
          </label>

          <label className="field-label inline-select">
            <span>Seat Availability</span>
            <select value={seatFilter} onChange={e => setSeatFilter(e.target.value)}>
              <option value="all">All Capacities</option>
              <option value="open">Open Seats Available</option>
              <option value="final-seat">1 Final Seat Left (Contention Alert)</option>
              <option value="full">Full Capacity (Check Deliverable Fit)</option>
            </select>
          </label>

          <label className="field-label inline-select">
            <span>
              Region / Cohort Tag{' '}
              <em className="context-disclaimer">(Secondary Context — Never Gatekeeping)</em>
            </span>
            <select value={contextFilter} onChange={e => setContextFilter(e.target.value)}>
              {SECONDARY_CONTEXTS.map(c => (
                <option key={c.id} value={c.id}>{c.label}</option>
              ))}
            </select>
          </label>

          {activeFilterCount > 0 && (
            <button type="button" className="btn btn-ghost btn-compact self-end" onClick={clearFilters}>
              Clear {activeFilterCount} {activeFilterCount === 1 ? 'Filter' : 'Filters'}
            </button>
          )}
        </div>
      </div>

      {/* Inline Selected Team Roster Inspector Drawer */}
      {selectedTeam && (
        <div className="surface-card inspector-banner" role="region" aria-label={`Authoritative roster for ${selectedTeam.teamId}`}>
          <div className="row-between wrap-gap">
            <div>
              <span className="eyebrow-tag">AUTHORITATIVE LAYER-A SQLITE ROSTER PROJECTION</span>
              <h3 className="card-subtitle">
                Crew <code>{selectedTeam.teamId}</code> · {selectedTeam.members.length} / {selectedTeam.maxSize} Committed Members
              </h3>
            </div>
            <div className="pill-row">
              <button
                type="button"
                className="btn btn-secondary btn-compact"
                onClick={() => onRequestSeatForTeam(selectedTeam.teamId)}
              >
                <ShieldCheckIcon /> Open in Seat Authority Workbench
              </button>
              <button type="button" className="btn btn-ghost btn-compact" onClick={onCloseInspect}>
                Dismiss Roster
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

      {/* Paginated Live Crew Cards */}
      {(directoryTab === 'crews' || directoryTab === 'both') && (
        <div className="directory-section">
          <div className="row-between wrap-gap section-header-bar">
            <h3>
              Live Authoritative Crews in <code>{eventId}</code>
              <span className="count-pill">
                Page {pageIndex + 1} of {totalPages.toLocaleString()} ({filteredCrews.length} shown on page)
              </span>
            </h3>

            {/* Pagination Bar */}
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
                ‹ Previous
              </button>

              <form onSubmit={handleJumpSubmit} className="page-jump-form">
                <label className="sr-only" htmlFor="page-jump-input">Jump to page number</label>
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
                <button type="submit" className="btn btn-ghost btn-compact">Go</button>
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

              <label className="sr-only" htmlFor="page-size-select">Cards per page</label>
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
          </div>

          {filteredCrews.length === 0 ? (
            <div className="surface-card empty-state-card">
              <h3>No crews on this page match your active filters</h3>
              <p className="muted-copy">
                {seatFilter === 'open' || seatFilter === 'final-seat'
                  ? `Note: All 2,000 baseline benchmark crews in seed-event are seeded at 5/5 full capacity (10,000 members). Click "Spawn Open Demo Crews" below to materialize live open-seat and 1-final-seat SQLite teams right now!`
                  : 'Adjust your search query, skill filter, or navigate across pages.'}
              </p>
              <div className="pill-row">
                {(seatFilter === 'open' || seatFilter === 'final-seat' || board.length === 0) && (
                  <button
                    type="button"
                    className="btn btn-primary"
                    disabled={spawningDemo}
                    onClick={onSpawnShowcaseCrews}
                  >
                    <PlusIcon /> {spawningDemo ? 'Creating Live SQLite Crews…' : 'Spawn 3 Open Showcase Crews Now'}
                  </button>
                )}
                {activeFilterCount > 0 && (
                  <button type="button" className="btn btn-secondary" onClick={clearFilters}>
                    Reset Filters
                  </button>
                )}
              </div>
            </div>
          ) : (
            <div className="crew-grid">
              {filteredCrews.map(crew => {
                const pct = Math.min(100, Math.round((crew.members / crew.maxSize) * 100));
                return (
                  <article key={crew.teamId} className="crew-card" aria-label={`Crew ${crew.teamId}`}>
                    <div className="crew-card-top">
                      <div>
                        <h4 className="crew-id">{crew.teamId}</h4>
                        <span className="leader-tag">★ Leader: <code>{crew.leader}</code></span>
                      </div>
                      {crew.batonPassReady && (
                        <span className="baton-pill" title="Configured for asynchronous cross-timezone dependency handoff">
                          Async Baton-Pass
                        </span>
                      )}
                    </div>

                    <LifecycleBadge lifecycle={crew.lifecycle} />
                    <p className="lifecycle-caption">{crew.lifecycleSub}</p>

                    <p className="crew-mission">{crew.mission}</p>

                    {/* Seat Meter Bar */}
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
                            crew.openSeats === 0 ? 'fill-full' : crew.openSeats === 1 ? 'fill-scarce' : 'fill-open'
                          }`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>

                    {/* Skill & Context Tags */}
                    <div className="tag-cluster">
                      {crew.skills.map(sk => (
                        <span key={sk} className="skill-badge">{sk}</span>
                      ))}
                      <span className="utc-badge"><GlobeIcon size={13} /> {crew.utcLabel}</span>
                    </div>
                    <div className="secondary-context-line">
                      Context (Non-Scoring): <span>{crew.secondaryContext}</span>
                    </div>

                    {/* 1-Click Card Actions */}
                    <div className="card-actions-row">
                      <button
                        type="button"
                        className="btn btn-secondary btn-compact"
                        onClick={() => onInspectTeam(crew.teamId)}
                      >
                        <EyeIcon size={15} /> Inspect Roster
                      </button>
                      <button
                        type="button"
                        className="btn btn-secondary btn-compact"
                        onClick={() => onCheckFitCrew(crew)}
                      >
                        <SparklesIcon size={15} /> Check Fit Against Goal
                      </button>
                      <button
                        type="button"
                        className={`btn btn-compact ${crew.openSeats > 0 ? 'btn-primary' : 'btn-ghost'}`}
                        onClick={() => onRequestSeatForTeam(crew.teamId)}
                      >
                        {crew.openSeats > 0 ? 'Request Seat' : 'Manage'} <ArrowRightIcon size={14} />
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Available Builders Talent Pool */}
      {(directoryTab === 'builders' || directoryTab === 'both') && (
        <div className="directory-section">
          <div className="row-between wrap-gap section-header-bar">
            <h3>
              Complementary Builders &amp; Async UTC Relay Pool
              <span className="count-pill">{filteredBuilders.length} builders</span>
            </h3>
            <span className="muted-copy small-copy">
              <code>✓ skill</code> = verified evidence · <code>? skill</code> = provisional wildcard (offer micro-work-sample)
            </span>
          </div>

          <div className="crew-grid">
            {filteredBuilders.map(b => {
              const winStartPct = Math.round((b.startMin / 480) * 100);
              const winWidthPct = Math.max(8, Math.round(((b.endMin - b.startMin) / 480) * 100));
              return (
                <article key={b.id} className="crew-card builder-card" aria-label={`Builder ${b.id}`}>
                  <div className="crew-card-top">
                    <div>
                      <h4 className="crew-id">{b.id}</h4>
                      <span className="leader-tag">{b.role}</span>
                    </div>
                    {b.batonReady && <span className="baton-pill">Baton-Pass Ready</span>}
                  </div>

                  <p className="crew-mission">{b.bio}</p>

                  <div className="tag-cluster">
                    {Object.entries(b.skills).map(([sk, st]) => (
                      <span
                        key={sk}
                        className={`skill-badge ${st === 'unknown' ? 'skill-unknown' : 'skill-verified'}`}
                      >
                        {st === 'unknown' ? `? ${sk} (provisional)` : `✓ ${sk}`}
                      </span>
                    ))}
                  </div>

                  <div className="wake-bar-block">
                    <div className="row-between small-copy">
                      <span><ClockIcon size={13} /> {b.timezone}</span>
                      <span className="mono-cell">{b.windowLabel}</span>
                    </div>
                    <div className="wake-track" aria-label={`Available window ${b.windowLabel}`}>
                      <div
                        className="wake-fill"
                        style={{ left: `${winStartPct}%`, width: `${Math.min(100 - winStartPct, winWidthPct)}%` }}
                      />
                    </div>
                  </div>

                  <div className="secondary-context-line">
                    Secondary Context (Never Gatekeeping): <span>{b.secondaryContext}</span>
                  </div>

                  <div className="card-actions-row">
                    <button
                      type="button"
                      className="btn btn-primary btn-compact"
                      onClick={() => onSendBuilderToArchitect(b)}
                    >
                      <SparklesIcon size={15} /> Test in Mission Architect
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        </div>
      )}
    </section>
  );
}
