import React, { useEffect, useMemo, useState } from 'react';
import EpistemicStencil from './EpistemicStencil.jsx';
import { computePartialTaskPreview } from '../presets-and-catalog.js';
import { SplitWipeIcon } from '../icons.jsx';

function computeClientSchedule(tasks, horizonMin) {
  const byId = new Map(tasks.map(t => [t.id, t]));
  const children = new Map(tasks.map(t => [t.id, []]));
  const visited = new Set();
  const active = new Set();
  const topo = [];
  let hasCycle = false;

  function visit(id) {
    if (active.has(id)) {
      hasCycle = true;
      return;
    }
    if (visited.has(id) || !byId.has(id)) return;
    active.add(id);
    const t = byId.get(id);
    for (const dep of t.after || []) {
      if (byId.has(dep)) {
        children.get(dep).push(id);
        visit(dep);
      }
    }
    active.delete(id);
    visited.add(id);
    topo.push(t);
  }

  for (const t of tasks) visit(t.id);
  if (hasCycle) return { hasCycle: true, rows: [] };

  const es = new Map();
  const ef = new Map();
  for (const t of topo) {
    let ready = 0;
    const lag = Math.max(0, Number(t.lagMin) || 0);
    for (const dep of t.after || []) {
      if (ef.has(dep)) ready = Math.max(ready, ef.get(dep) + lag);
    }
    const dur = Math.max(1, Number(t.durationMin) || 60);
    es.set(t.id, ready);
    ef.set(t.id, ready + dur);
  }

  const lf = new Map();
  const ls = new Map();
  for (let i = topo.length - 1; i >= 0; i--) {
    const t = topo[i];
    let latestFin = Number.isFinite(Number(t.deadlineMin))
      ? Math.min(horizonMin, Number(t.deadlineMin))
      : horizonMin;
    for (const chId of children.get(t.id) || []) {
      const ch = byId.get(chId);
      const chLag = Math.max(0, Number(ch?.lagMin) || 0);
      latestFin = Math.min(latestFin, (ls.get(chId) ?? horizonMin) - chLag);
    }
    const dur = Math.max(1, Number(t.durationMin) || 60);
    lf.set(t.id, latestFin);
    ls.set(t.id, latestFin - dur);
  }

  return {
    hasCycle: false,
    rows: topo.map(t => ({
      taskId: t.id,
      title: t.title || t.id,
      skill: t.skill,
      durationMin: Math.max(1, Number(t.durationMin) || 60),
      lagMin: Math.max(0, Number(t.lagMin) || 0),
      after: (t.after || []).filter(d => byId.has(d)),
      earliestStartMin: es.get(t.id),
      earliestFinishMin: ef.get(t.id),
      latestStartMin: ls.get(t.id),
      latestFinishMin: lf.get(t.id),
      slackMin: ls.get(t.id) - es.get(t.id)
    }))
  };
}

function buildScheduleRows(tasks, horizonMin, plan, teamPeople = []) {
  const preview = computeClientSchedule(tasks, horizonMin);
  if (preview.hasCycle) return preview;

  const serverMeta = new Map((plan?.criticalPath || []).map(m => [m.taskId, m]));
  const assignMap = new Map((plan?.witness?.assignments || []).map(a => [a.taskId, a]));
  const partialMap =
    !plan?.witness && Array.isArray(teamPeople) && teamPeople.length > 0
      ? computePartialTaskPreview(tasks, teamPeople, horizonMin, plan)
      : new Map();

  const rows = preview.rows.map(r => {
    const sm = serverMeta.get(r.taskId);
    const asg = assignMap.get(r.taskId) || partialMap.get(r.taskId) || null;
    return {
      ...r,
      earliestStartMin: sm ? sm.earliestStartMin : r.earliestStartMin,
      earliestFinishMin: sm ? sm.earliestFinishMin : r.earliestFinishMin,
      latestStartMin: sm ? sm.latestStartMin : r.latestStartMin,
      latestFinishMin: sm ? sm.latestFinishMin : r.latestFinishMin,
      slackMin: sm ? sm.slackMin : r.slackMin,
      assignment: asg
    };
  });

  return { hasCycle: false, rows };
}

function fmtMin(m) {
  const sign = m < 0 ? '-' : '';
  const abs = Math.abs(Math.round(m));
  const h = Math.floor(abs / 60);
  const rem = abs % 60;
  if (h === 0) return `${sign}${rem}m`;
  if (rem === 0) return `${sign}${h}h`;
  return `${sign}${h}h ${rem}m`;
}

function DagSvgDiagram({ rows, horizonMin, maxTime, planRan, markerId }) {
  const leftGutter = 185;
  const rightGutter = 135;
  const plotWidth = 540;
  const svgWidth = leftGutter + plotWidth + rightGutter;
  const topHeader = 38;
  const rowHeight = 56;
  const svgHeight = topHeader + Math.max(1, rows.length) * rowHeight + 22;

  const xOf = min => leftGutter + Math.max(0, Math.min(1, min / maxTime)) * plotWidth;
  const rowIndexById = new Map(rows.map((r, idx) => [r.taskId, idx]));
  const ticks = [0, 0.25, 0.5, 0.75, 1].map(frac => Math.round(maxTime * frac));

  const patWarnId = `${markerId}-pat-warn`;
  const patErrId = `${markerId}-pat-err`;
  const patPreviewId = `${markerId}-pat-preview`;

  return (
    <svg
      viewBox={`0 0 ${svgWidth} ${svgHeight}`}
      className="dag-svg"
      role="img"
      aria-label={`Task dependency schedule diagram for ${rows.length} tasks across ${horizonMin} minutes`}
    >
      <title>{`Task schedule diagram (${rows.length} tasks, ${horizonMin}m window)`}</title>
      <defs>
        <marker
          id={markerId}
          viewBox="0 0 10 10"
          refX="7"
          refY="5"
          markerWidth="6"
          markerHeight="6"
          orient="auto-start-reverse"
        >
          <path d="M 0 1 L 8 5 L 0 9 z" fill="var(--dag-edge)" />
        </marker>
        <pattern id={patWarnId} width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <line x1="0" y1="0" x2="0" y2="8" stroke="var(--tone-warn-ink)" strokeWidth="2" strokeOpacity="0.32" />
        </pattern>
        <pattern id={patErrId} width="8" height="8" patternUnits="userSpaceOnUse">
          <path d="M 0 0 L 8 8 M 8 0 L 0 8" stroke="var(--tone-err-ink)" strokeWidth="1.4" strokeOpacity="0.34" />
        </pattern>
        <pattern id={patPreviewId} width="6" height="6" patternUnits="userSpaceOnUse">
          <circle cx="2" cy="2" r="1" fill="var(--accent-primary)" fillOpacity="0.28" />
        </pattern>
      </defs>

      {ticks.map((tVal, i) => {
        const x = xOf(tVal);
        return (
          <g key={i}>
            <line
              x1={x}
              y1={topHeader - 8}
              x2={x}
              y2={svgHeight - 12}
              stroke="var(--border-subtle)"
              strokeDasharray={tVal === horizonMin ? 'none' : '3 4'}
            />
            <text
              x={x}
              y={22}
              textAnchor={i === 0 ? 'start' : i === ticks.length - 1 ? 'end' : 'middle'}
              className="svg-tick-label"
            >
              T+{fmtMin(tVal)} ({tVal}m)
            </text>
          </g>
        );
      })}

      <line
        x1={xOf(horizonMin)}
        y1={topHeader - 10}
        x2={xOf(horizonMin)}
        y2={svgHeight - 10}
        stroke="var(--tone-warn-ink)"
        strokeWidth="1.8"
      />

      {rows.flatMap(r => {
        const toIdx = rowIndexById.get(r.taskId);
        const toStart = r.assignment ? r.assignment.startMin : r.earliestStartMin;
        const x2 = xOf(toStart);
        const y2 = topHeader + toIdx * rowHeight + rowHeight / 2;

        return r.after.map(depId => {
          const fromIdx = rowIndexById.get(depId);
          if (fromIdx === undefined) return null;
          const depRow = rows[fromIdx];
          const fromEnd = depRow.assignment ? depRow.assignment.endMin : depRow.earliestFinishMin;
          const x1 = xOf(fromEnd);
          const y1 = topHeader + fromIdx * rowHeight + rowHeight / 2;
          const midX = (x1 + x2) / 2;
          return (
            <g key={`${depId}->${r.taskId}`}>
              <path
                d={`M ${x1} ${y1} C ${midX + 14} ${y1}, ${midX - 14} ${y2}, ${Math.max(x1 + 6, x2 - 4)} ${y2}`}
                fill="none"
                stroke="var(--dag-edge)"
                strokeWidth="1.8"
                markerEnd={`url(#${markerId})`}
              />
              {r.lagMin > 0 && (
                <text x={midX} y={(y1 + y2) / 2 - 5} textAnchor="middle" className="svg-lag-label">
                  +{r.lagMin}m lag
                </text>
              )}
            </g>
          );
        });
      })}

      {rows.map((r, idx) => {
        const yTop = topHeader + idx * rowHeight;
        const barY = yTop + 14;
        const barH = 26;
        const slackStartX = xOf(r.earliestStartMin);
        const slackEndX = Math.max(slackStartX + 4, xOf(Math.max(r.earliestFinishMin, r.latestFinishMin)));

        const execStart = r.assignment ? r.assignment.startMin : r.earliestStartMin;
        const execEnd = r.assignment ? r.assignment.endMin : r.earliestFinishMin;
        const execX = xOf(execStart);
        const execW = Math.max(12, xOf(execEnd) - execX);

        const isCritical = r.slackMin <= 0;
        const isGuarded = r.assignment?.evidence === 'unknown';
        const isReadyOnly = Boolean(r.assignment?.readyOnly);
        const isAssigned = Boolean(r.assignment);

        let fillVar = 'var(--dag-bar-preview)';
        let strokeVar = 'var(--accent-primary)';
        let patternOverlayId = patPreviewId;
        let dashSpec = '4 2';
        if (planRan) {
          if (isAssigned && isReadyOnly && !isGuarded) {
            fillVar = 'var(--dag-bar-preview)';
            strokeVar = 'var(--accent-secondary)';
            patternOverlayId = patPreviewId;
            dashSpec = '3 2';
          } else if (isAssigned && !isGuarded) {
            fillVar = 'var(--dag-bar-ok)';
            strokeVar = 'var(--tone-ok-ink)';
            patternOverlayId = null;
            dashSpec = undefined;
          } else if (isAssigned && isGuarded) {
            fillVar = 'var(--dag-bar-warn)';
            strokeVar = 'var(--tone-warn-ink)';
            patternOverlayId = patWarnId;
            dashSpec = '5 2';
          } else {
            fillVar = 'var(--dag-bar-err)';
            strokeVar = 'var(--tone-err-ink)';
            patternOverlayId = patErrId;
            dashSpec = '2 2';
          }
        }

        return (
          <g key={r.taskId}>
            <rect
              x="4"
              y={yTop + 3}
              width={svgWidth - 8}
              height={rowHeight - 6}
              rx="7"
              fill="var(--dag-row-bg)"
            />

            <text x="14" y={yTop + 23} className="svg-task-title">
              {r.taskId}
            </text>
            <text x="14" y={yTop + 41} className="svg-task-sub">
              {r.skill} · {r.durationMin}m
            </text>

            <rect
              x={slackStartX}
              y={barY + 5}
              width={Math.max(6, slackEndX - slackStartX)}
              height={barH - 10}
              rx="4"
              fill="none"
              stroke="var(--text-muted)"
              strokeDasharray="4 3"
            />

            <rect
              x={execX}
              y={barY}
              width={execW}
              height={barH}
              rx="6"
              fill={fillVar}
              stroke={strokeVar}
              strokeWidth="1.75"
              strokeDasharray={dashSpec}
            />
            {patternOverlayId && (
              <rect
                x={execX}
                y={barY}
                width={execW}
                height={barH}
                rx="6"
                fill={`url(#${patternOverlayId})`}
                pointerEvents="none"
              />
            )}

            <text x={execX + 8} y={barY + 17} className="svg-bar-label">
              {r.assignment
                ? isReadyOnly
                  ? `${r.assignment.evidence === 'unknown' ? '? ' : '✓ '}${r.assignment.personId} (Ready ${execStart}..${execEnd}m)`
                  : `${r.assignment.evidence === 'unknown' ? '? ' : '✓ '}${r.assignment.personId} [${execStart}..${execEnd}m]`
                : planRan
                  ? `! Blocked (Needs ${r.skill})`
                  : `ES ${r.earliestStartMin}..${r.earliestFinishMin}m`}
            </text>

            <text
              x={svgWidth - 14}
              y={yTop + 31}
              textAnchor="end"
              className={isCritical ? 'svg-slack-crit' : 'svg-slack-ok'}
            >
              {isCritical ? `CRITICAL (${r.slackMin}m)` : `+${r.slackMin}m slack`}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

export default function TaskDagTimeline({
  tasks,
  teamPeople = [],
  horizonMin,
  plan,
  beforeSnapshot = null,
  activeLinkId = null,
  onLinkHover,
  onNotify
}) {
  const [viewMode, setViewMode] = useState('dual'); // 'dual' | 'dag' | 'table'
  const [wipeActive, setWipeActive] = useState(false);
  const [wipePct, setWipePct] = useState(50);

  const canCompareWipe = Boolean(
    beforeSnapshot &&
      beforeSnapshot.plan &&
      plan &&
      plan.status === 'FEASIBLE_WITNESS' &&
      beforeSnapshot.plan.status !== 'FEASIBLE_WITNESS' &&
      (beforeSnapshot.tasks || []).length === tasks.length
  );

  useEffect(() => {
    if (canCompareWipe) {
      setWipeActive(true);
      setWipePct(45);
    } else {
      setWipeActive(false);
    }
  }, [canCompareWipe]);

  const schedule = useMemo(
    () => buildScheduleRows(tasks, horizonMin, plan, teamPeople),
    [tasks, horizonMin, plan, teamPeople]
  );

  const beforeSchedule = useMemo(() => {
    if (!canCompareWipe) return null;
    return buildScheduleRows(
      beforeSnapshot.tasks || tasks,
      beforeSnapshot.horizonMin || horizonMin,
      beforeSnapshot.plan,
      []
    );
  }, [canCompareWipe, beforeSnapshot, tasks, horizonMin]);

  if (schedule.hasCycle) {
    return (
      <div role="alert" className="inline-alert tone-error">
        Cyclic task dependency detected. Remove circular prerequisite links so the critical-path DAG can evaluate.
      </div>
    );
  }

  const rows = schedule.rows;
  const maxTime = Math.max(
    horizonMin,
    ...rows.map(r => Math.max(r.earliestFinishMin, r.latestFinishMin, r.assignment?.endMin || 0)),
    ...(beforeSchedule?.rows || []).map(r =>
      Math.max(r.earliestFinishMin, r.latestFinishMin, r.assignment?.endMin || 0)
    ),
    60
  );

  const hasProvisional = rows.some(r => r.assignment?.evidence === 'unknown') || plan?.status === 'CONDITIONAL_WITNESS';

  return (
    <div className="dag-container">
      <div className="row-between wrap-gap dag-toolbar">
        <div>
          <div className="pill-row">
            <h3 className="card-subtitle">Task Timeline &amp; Dependencies</h3>
            <EpistemicStencil kind="SQLITE_AUTHORITY" compact />
            {hasProvisional && <EpistemicStencil kind="VOI_PROVISIONAL" compact />}
          </div>
          <p className="muted-copy small-copy">
            Solid bars show scheduled hours; dashed whiskers show available slack; <code>0m slack</code> marks bottleneck tasks.
          </p>
        </div>

        <div className="pill-row" role="group" aria-label="Schedule visualization mode">
          {canCompareWipe && (
            <button
              type="button"
              aria-pressed={wipeActive}
              className={`chip-toggle ${wipeActive ? 'active' : ''}`}
              onClick={() => {
                const next = !wipeActive;
                setWipeActive(next);
                onNotify?.(
                  next ? 'Before/After Split-Wipe comparison enabled.' : 'Before/After Split-Wipe hidden.',
                  'info'
                );
              }}
            >
              <SplitWipeIcon size={14} /> Compare Before / After Wipe
            </button>
          )}

          {[
            { id: 'dual', label: 'Dual (SVG + Table)' },
            { id: 'dag', label: 'Spatial SVG Only' },
            { id: 'table', label: 'Accessible Table Only' }
          ].map(m => (
            <button
              key={m.id}
              type="button"
              aria-pressed={viewMode === m.id}
              className={`chip-toggle ${viewMode === m.id ? 'active' : ''}`}
              onClick={() => {
                setViewMode(m.id);
                onNotify?.(`DAG Timeline mode: ${m.label}`, 'info');
              }}
            >
              {m.label}
            </button>
          ))}
        </div>
      </div>

      {/* Before / After Split-Wipe Slider Bar */}
      {canCompareWipe && wipeActive && (viewMode === 'dual' || viewMode === 'dag') && (
        <div className="wipe-controls-bar" role="region" aria-label="Before and after DAG split-wipe controls">
          <div className="row-between wrap-gap small-copy">
            <span>
              <strong className="wipe-tag-before">BEFORE ({beforeSnapshot.plan.status})</strong>
              {' vs. '}
              <strong className="wipe-tag-after">AFTER ({plan.status})</strong>
              {beforeSnapshot.label ? ` · ${beforeSnapshot.label}` : ''}
            </span>
            <span className="mono-cell">Wipe Split: {wipePct}%</span>
          </div>
          <input
            type="range"
            min={0}
            max={100}
            step={1}
            value={wipePct}
            onChange={e => setWipePct(Number(e.target.value))}
            aria-label="Before and after DAG wipe slider percentage"
          />
        </div>
      )}

      {(viewMode === 'dual' || viewMode === 'dag') && (
        <div
          className="svg-scroll-frame"
          role="img"
          aria-label="Directed task dependency timeline and critical-path slack diagram"
        >
          {canCompareWipe && wipeActive && beforeSchedule && !beforeSchedule.hasCycle ? (
            <div className="dag-split-wipe-stage">
              {/* Base Layer: Repaired AFTER SVG */}
              <div className="dag-wipe-layer dag-wipe-after">
                <DagSvgDiagram
                  rows={rows}
                  horizonMin={horizonMin}
                  maxTime={maxTime}
                  planRan={Boolean(plan)}
                  markerId="dag-arrow-after"
                />
              </div>

              {/* Clipped Overlay Layer: Cached Blocked BEFORE SVG */}
              <div
                className="dag-wipe-layer dag-wipe-before"
                style={{ clipPath: `inset(0 ${100 - wipePct}% 0 0)` }}
                aria-hidden="true"
              >
                <DagSvgDiagram
                  rows={beforeSchedule.rows}
                  horizonMin={beforeSnapshot.horizonMin || horizonMin}
                  maxTime={maxTime}
                  planRan={true}
                  markerId="dag-arrow-before"
                />
              </div>

              {/* Vertical Wipe Handle Line */}
              <div
                className="dag-wipe-divider"
                style={{ left: `${wipePct}%` }}
                aria-hidden="true"
              >
                <span className="dag-wipe-pill">BEFORE | AFTER</span>
              </div>
            </div>
          ) : (
            <DagSvgDiagram
              rows={rows}
              horizonMin={horizonMin}
              maxTime={maxTime}
              planRan={Boolean(plan)}
              markerId="dag-arrow-main"
            />
          )}
        </div>
      )}

      {(viewMode === 'dual' || viewMode === 'table') && (
        <div className="table-wrap">
          <table className="accessible-table">
            <caption className="sr-only">
              Critical-path task schedule, backward slack windows, and contributor assignments
            </caption>
            <thead>
              <tr>
                <th scope="col">Task ID</th>
                <th scope="col">Required Skill</th>
                <th scope="col">Duration</th>
                <th scope="col">Depends On</th>
                <th scope="col">Earliest (ES..EF)</th>
                <th scope="col">Latest (LS..LF)</th>
                <th scope="col">Slack</th>
                <th scope="col">Assigned Builder &amp; Stencil</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(r => {
                const isLinked =
                  activeLinkId &&
                  (activeLinkId === r.taskId || (r.assignment && activeLinkId === r.assignment.personId));
                return (
                <tr
                  key={r.taskId}
                  data-link-id={r.taskId}
                  className={isLinked ? 'is-linked-ridge' : ''}
                  onMouseEnter={() => onLinkHover?.(r.assignment?.personId || r.taskId)}
                  onMouseLeave={() => onLinkHover?.(null)}
                >
                  <th scope="row" className="mono-cell">{r.taskId}</th>
                  <td><span className="skill-badge">{r.skill}</span></td>
                  <td>{r.durationMin}m</td>
                  <td>
                    {r.after.length > 0
                      ? `${r.after.join(', ')}${r.lagMin > 0 ? ` (+${r.lagMin}m)` : ''}`
                      : 'None (starts immediately)'}
                  </td>
                  <td className="mono-cell">{r.earliestStartMin}m .. {r.earliestFinishMin}m</td>
                  <td className="mono-cell">{r.latestStartMin}m .. {r.latestFinishMin}m</td>
                  <td>
                    <span className={`status-chip ${r.slackMin <= 0 ? 'chip-warn' : 'chip-ok'}`}>
                      {r.slackMin <= 0 ? '0m tightest' : `+${r.slackMin}m`}
                    </span>
                  </td>
                  <td>
                    {r.assignment ? (
                      <div className="pill-row">
                        <span className={`status-chip ${r.assignment.evidence === 'unknown' ? 'chip-warn' : 'chip-ok'}`}>
                          {r.assignment.evidence === 'unknown' ? '? ' : '✓ '}
                          {r.assignment.personId} ({r.assignment.readyOnly ? 'Ready ' : ''}{r.assignment.startMin}..{r.assignment.endMin}m)
                        </span>
                        <EpistemicStencil
                          kind={r.assignment.evidence === 'unknown' ? 'VOI_PROVISIONAL' : 'SQLITE_AUTHORITY'}
                          compact
                        />
                      </div>
                    ) : plan ? (
                      <span className="status-chip chip-err">Uncovered · Needs {r.skill}</span>
                    ) : (
                      <span className="muted-copy">Preview</span>
                    )}
                  </td>
                </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
