import React, { useEffect, useMemo, useRef } from 'react';
import { isMotionFrozen } from '../ergonomics.js';
import { BUILDER_DIRECTORY, parseUtcOffsetHours } from '../presets-and-catalog.js';
import { SunIcon, GlobeIcon } from '../icons.jsx';

const MIN_UTC = -12;
const MAX_UTC = 14;
const UTC_SPAN = MAX_UTC - MIN_UTC; // 26 hours
const PULSE_DURATION_MS = 850;

const TICKS_FULL = [
  { offset: -12, label: 'UTC-12' },
  { offset: -6, label: 'UTC-6 (Hot Springs)' },
  { offset: 0, label: 'UTC+0 (London)' },
  { offset: 5.5, label: 'UTC+5:30 (Bengaluru)' },
  { offset: 9, label: 'UTC+9 (Tokyo)' },
  { offset: 14, label: 'UTC+14' }
];

const TICKS_COMPACT = [
  { offset: -6, label: 'UTC-6' },
  { offset: 0, label: 'UTC+0' },
  { offset: 5.5, label: 'UTC+5:30' },
  { offset: 9, label: 'UTC+9' }
];

function getPaletteForTheme(theme) {
  if (theme === 'warm-paper') {
    return {
      skyNight: '#E8EEF5',
      skyDayTop: 'rgba(14, 116, 144, 0.15)',
      skyDayBot: 'rgba(245, 158, 11, 0.10)',
      waveStroke: 'rgba(11, 79, 108, 0.52)',
      gridLine: 'rgba(100, 116, 139, 0.24)',
      tickInk: '#334155',
      nodeCrew: '#059669',
      nodeCand: '#B45309',
      nodePool: '#0369A1',
      labelInk: '#0F172A',
      arcStroke: 'rgba(5, 150, 105, 0.65)',
      fireflyCore: '#047857',
      fireflyGlow: 'rgba(16, 185, 129, 0.28)',
      focusRing: '#0369A1'
    };
  }
  if (theme === 'aaa-contrast') {
    return {
      skyNight: '#050505',
      skyDayTop: 'rgba(255, 214, 10, 0.16)',
      skyDayBot: 'rgba(255, 214, 10, 0.04)',
      waveStroke: '#FFD60A',
      gridLine: 'rgba(161, 161, 170, 0.45)',
      tickInk: '#FFFFFF',
      nodeCrew: '#4ADE80',
      nodeCand: '#FFD60A',
      nodePool: '#7DD3FC',
      labelInk: '#FFFFFF',
      arcStroke: '#FFD60A',
      fireflyCore: '#FFFFFF',
      fireflyGlow: 'rgba(255, 214, 10, 0.55)',
      focusRing: '#FFD60A'
    };
  }
  if (theme === 'obsidian-prism') {
    return {
      skyNight: '#0C1120',
      skyDayTop: 'rgba(94, 234, 212, 0.16)',
      skyDayBot: 'rgba(167, 139, 250, 0.08)',
      waveStroke: 'rgba(94, 234, 212, 0.62)',
      gridLine: 'rgba(148, 163, 184, 0.16)',
      tickInk: '#B0C0DA',
      nodeCrew: '#5EEAD4',
      nodeCand: '#A78BFA',
      nodePool: '#7DD3FC',
      labelInk: '#E2E8F8',
      arcStroke: 'rgba(167, 139, 250, 0.70)',
      fireflyCore: '#99F6E4',
      fireflyGlow: 'rgba(94, 234, 212, 0.42)',
      focusRing: '#7EE7D2'
    };
  }
  if (theme === 'petrol-glass') {
    return {
      skyNight: '#071720',
      skyDayTop: 'rgba(100, 223, 223, 0.17)',
      skyDayBot: 'rgba(143, 190, 180, 0.07)',
      waveStroke: 'rgba(100, 223, 223, 0.64)',
      gridLine: 'rgba(156, 198, 218, 0.15)',
      tickInk: '#A8C8D8',
      nodeCrew: '#64DFDF',
      nodeCand: '#F2D48F',
      nodePool: '#8FBEB4',
      labelInk: '#D6E7F0',
      arcStroke: 'rgba(100, 223, 223, 0.66)',
      fireflyCore: '#D2F8F8',
      fireflyGlow: 'rgba(100, 223, 223, 0.42)',
      focusRing: '#84ECEC'
    };
  }
  // Default Moonlight Dark & Calm Matte Dark palette
  return {
    skyNight: '#0C1219',
    skyDayTop: 'rgba(140, 230, 90, 0.15)',
    skyDayBot: 'rgba(126, 231, 210, 0.05)',
    waveStroke: 'rgba(140, 230, 90, 0.60)',
    gridLine: 'rgba(159, 182, 176, 0.14)',
    tickInk: '#A3B8B2',
    nodeCrew: '#8CE65A',
    nodeCand: '#F3CF7A',
    nodePool: '#7EE7D2',
    labelInk: '#E4EEEB',
    arcStroke: 'rgba(140, 230, 90, 0.68)',
    fireflyCore: '#ECFCCB',
    fireflyGlow: 'rgba(140, 230, 90, 0.44)',
    focusRing: '#7EE7D2'
  };
}

export default function SolarBatonHorizon({
  mode = 'discover', // 'discover' | 'architect'
  theme = 'h4h-glass',
  motion = 'spring',
  compact = false,
  horizonMin = 480,
  teamPeople = [],
  candidates = [],
  recommendations = [],
  crewsCount = 0,
  pulseTrigger = 0,
  activeLinkId = null
}) {
  const canvasRef = useRef(null);
  const lastPulseRef = useRef(pulseTrigger);
  const frozen = isMotionFrozen(motion);

  const scene = useMemo(() => {
    if (mode === 'architect') {
      const recIds = new Set(
        (recommendations || [])
          .filter(r => r.restoresFeasibility || r.asyncBatonPass || r.upgradesToConditional)
          .map(r => r.candidateId)
      );
      const nodes = [];
      const half = Math.max(120, Math.round(horizonMin * 0.5));

      teamPeople.forEach((p, idx) => {
        const offset = parseUtcOffsetHours(p.timezone, p.startMin, horizonMin);
        nodes.push({
          id: p.id,
          offset,
          kind: 'crew',
          startMin: Number(p.startMin || 0),
          endMin: Number(p.endMin || half),
          rowBias: idx % 2 === 0 ? -6 : 6
        });
      });

      candidates.forEach((c, idx) => {
        const offset = parseUtcOffsetHours(c.timezone, c.startMin, horizonMin);
        const isRecommended = recIds.has(c.id) || Number(c.startMin || 0) >= half;
        nodes.push({
          id: c.id,
          offset,
          kind: isRecommended ? 'candidate-baton' : 'candidate',
          startMin: Number(c.startMin || 0),
          endMin: Number(c.endMin || horizonMin),
          rowBias: idx % 2 === 0 ? -5 : 7
        });
      });

      const upstream = nodes.filter(n => n.kind === 'crew' && n.startMin < half);
      const downstream = nodes.filter(
        n =>
          (n.endMin > half || Math.abs(n.offset - (upstream[0]?.offset ?? -6)) >= 4) &&
          (n.kind === 'candidate-baton' || (n.kind === 'crew' && n.startMin >= 120))
      );

      const arcs = [];
      upstream.slice(0, 3).forEach((up, uIdx) => {
        downstream.slice(0, 2).forEach((dn, dIdx) => {
          if (up.id !== dn.id && Math.abs(dn.offset - up.offset) >= 1.5) {
            arcs.push({
              from: up,
              to: dn,
              activeCrewHandoff: up.kind === 'crew' && dn.kind === 'crew',
              phaseOffset: (uIdx * 0.22 + dIdx * 0.35) % 0.65
            });
          }
        });
      });

      return { nodes, arcs };
    }

    const nodes = BUILDER_DIRECTORY.map((b, idx) => ({
      id: b.plannerId || b.id.replace(/^(leader|builder)-/, ''),
      offset: typeof b.utcOffset === 'number' ? b.utcOffset : parseUtcOffsetHours(b.timezone, b.startMin, 480),
      kind: b.batonReady ? (b.startMin >= 240 ? 'candidate-baton' : 'crew') : 'pool',
      startMin: b.startMin,
      endMin: b.endMin,
      rowBias: (idx % 3 - 1) * 6
    }));

    const americas = nodes.filter(n => n.offset <= -4 && n.kind === 'crew');
    const apacEmea = nodes.filter(n => n.offset >= 1 && n.kind === 'candidate-baton');
    const arcs = [];
    if (americas[0] && apacEmea[0]) {
      arcs.push({ from: americas[0], to: apacEmea[0], activeCrewHandoff: false, phaseOffset: 0.1 });
    }
    if (americas[1] && apacEmea[1]) {
      arcs.push({ from: americas[1], to: apacEmea[1], activeCrewHandoff: false, phaseOffset: 0.35 });
    }
    return { nodes, arcs };
  }, [mode, horizonMin, teamPeople, candidates, recommendations]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || typeof canvas.getContext !== 'function') return undefined;
    const ctx = canvas.getContext('2d');
    if (!ctx) return undefined;

    const palette = getPaletteForTheme(theme);
    const targetH = compact ? 80 : 90;
    const ticks = compact ? TICKS_COMPACT : TICKS_FULL;
    let animId = null;
    let width = compact ? 420 : 880;
    let height = targetH;

    function syncDimensions() {
      const rect = canvas.getBoundingClientRect();
      const dpr = typeof window !== 'undefined' ? Math.min(2, window.devicePixelRatio || 1) : 1;
      width = Math.max(220, Math.round(rect.width || (compact ? 420 : 880)));
      height = Math.max(76, Math.round(rect.height || targetH));
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    function xForUtc(offset) {
      const padX = compact ? 20 : 34;
      const usable = Math.max(100, width - padX * 2);
      const clamped = Math.max(MIN_UTC, Math.min(MAX_UTC, offset));
      return padX + ((clamped - MIN_UTC) / UTC_SPAN) * usable;
    }

    // progress = null at calm static rest; 0..1 during bounded 850ms interaction pulse
    function renderFrame(pulseProgress) {
      ctx.clearRect(0, 0, width, height);
      ctx.fillStyle = palette.skyNight;
      ctx.fillRect(0, 0, width, height);

      // Stationary Solar Terminator Daylight Wave across UTC-12..UTC+14
      const subsolarUtc = 0.5;
      const grad = ctx.createLinearGradient(0, 4, 0, height - 16);
      grad.addColorStop(0, palette.skyDayTop);
      grad.addColorStop(1, palette.skyDayBot);

      ctx.beginPath();
      const steps = 64;
      for (let i = 0; i <= steps; i++) {
        const frac = i / steps;
        const utc = MIN_UTC + frac * UTC_SPAN;
        const x = xForUtc(utc);
        const phase = ((utc - subsolarUtc) / 24) * Math.PI * 2;
        const elev = (Math.cos(phase) + 1) * 0.5;
        const y = height - 20 - elev * (height - 38);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.lineTo(xForUtc(MAX_UTC), height - 17);
      ctx.lineTo(xForUtc(MIN_UTC), height - 17);
      ctx.closePath();
      ctx.fillStyle = grad;
      ctx.fill();

      ctx.beginPath();
      for (let i = 0; i <= steps; i++) {
        const frac = i / steps;
        const utc = MIN_UTC + frac * UTC_SPAN;
        const x = xForUtc(utc);
        const phase = ((utc - subsolarUtc) / 24) * Math.PI * 2;
        const elev = (Math.cos(phase) + 1) * 0.5;
        const y = height - 20 - elev * (height - 38);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.strokeStyle = palette.waveStroke;
      ctx.lineWidth = 1.3;
      ctx.stroke();

      // UTC Meridian Grid & Labels
      ctx.font = compact
        ? '600 9.5px "JetBrains Mono", ui-monospace, SFMono-Regular, Consolas, monospace'
        : '600 10.5px "JetBrains Mono", ui-monospace, SFMono-Regular, Consolas, monospace';
      ticks.forEach((tk, idx) => {
        const x = xForUtc(tk.offset);
        ctx.beginPath();
        ctx.moveTo(x, 6);
        ctx.lineTo(x, height - 17);
        ctx.strokeStyle = palette.gridLine;
        ctx.lineWidth = 1;
        ctx.stroke();

        ctx.fillStyle = palette.tickInk;
        ctx.textAlign = !compact && idx === 0 ? 'left' : !compact && idx === ticks.length - 1 ? 'right' : 'center';
        ctx.fillText(tk.label, x, height - 4);
      });

      const baseNodeY = Math.round(height * 0.49);

      // Handoff Arcs: stationary midpoint marker at rest; bounded 850ms travel only on interaction
      scene.arcs.forEach(arc => {
        const x1 = xForUtc(arc.from.offset);
        const y1 = baseNodeY + arc.from.rowBias;
        const x2 = xForUtc(arc.to.offset);
        const y2 = baseNodeY + arc.to.rowBias;
        const cx = (x1 + x2) * 0.5;
        const spanPx = Math.abs(x2 - x1);
        const cy = Math.max(8, Math.min(y1, y2) - Math.min(28, 11 + spanPx * 0.055));
        const isLinkedArc = activeLinkId && (arc.from.id === activeLinkId || arc.to.id === activeLinkId);

        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.quadraticCurveTo(cx, cy, x2, y2);
        ctx.strokeStyle = isLinkedArc ? palette.focusRing : palette.arcStroke;
        ctx.lineWidth = isLinkedArc ? 2.4 : arc.activeCrewHandoff ? 2.0 : 1.5;
        if (!arc.activeCrewHandoff && !isLinkedArc) ctx.setLineDash([4, 3]);
        ctx.stroke();
        ctx.setLineDash([]);

        const t =
          typeof pulseProgress === 'number'
            ? Math.min(1, Math.max(0, pulseProgress * 1.15 - arc.phaseOffset * 0.2))
            : 0.5;
        const omt = 1 - t;
        const fx = omt * omt * x1 + 2 * omt * t * cx + t * t * x2;
        const fy = omt * omt * y1 + 2 * omt * t * cy + t * t * y2;

        ctx.beginPath();
        ctx.arc(fx, fy, compact ? 4.8 : 5.6, 0, Math.PI * 2);
        ctx.fillStyle = palette.fireflyGlow;
        ctx.fill();

        ctx.beginPath();
        ctx.arc(fx, fy, compact ? 2.2 : 2.6, 0, Math.PI * 2);
        ctx.fillStyle = palette.fireflyCore;
        ctx.fill();
      });

      // Crew & Candidate Nodes
      ctx.font = compact
        ? '600 9.5px Inter, ui-sans-serif, system-ui, sans-serif'
        : '600 10.5px Inter, ui-sans-serif, system-ui, sans-serif';
      scene.nodes.forEach((n, idx) => {
        const x = xForUtc(n.offset);
        const y = baseNodeY + n.rowBias;
        const isLinked = Boolean(activeLinkId && n.id === activeLinkId);
        const color =
          n.kind === 'crew'
            ? palette.nodeCrew
            : n.kind === 'candidate-baton'
              ? palette.nodeCand
              : palette.nodePool;

        if (isLinked) {
          ctx.beginPath();
          ctx.arc(x, y, compact ? 8.5 : 9.5, 0, Math.PI * 2);
          ctx.strokeStyle = palette.focusRing;
          ctx.lineWidth = 2;
          ctx.stroke();
        } else {
          ctx.beginPath();
          ctx.arc(x, y, compact ? 5.8 : 6.6, 0, Math.PI * 2);
          ctx.fillStyle = palette.fireflyGlow;
          ctx.fill();
        }

        ctx.beginPath();
        ctx.arc(x, y, compact ? 3.5 : 4.0, 0, Math.PI * 2);
        ctx.fillStyle = color;
        ctx.fill();

        if (!compact ? width >= 500 || idx < 4 || isLinked : n.kind === 'crew' || idx < 3 || isLinked) {
          ctx.fillStyle = palette.labelInk;
          ctx.textAlign = n.offset > 7 ? 'right' : 'left';
          const labelX = n.offset > 7 ? x - 6 : x + 6;
          ctx.fillText(n.id, labelX, y + 3.2);
        }
      });
    }

    syncDimensions();
    renderFrame(null); // 1 static frame at rest (0 idle animation frames)

    const shouldPulse = !frozen && pulseTrigger !== lastPulseRef.current && pulseTrigger > 0;
    lastPulseRef.current = pulseTrigger;

    if (shouldPulse && typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function') {
      let startTs = null;
      const step = ts => {
        if (startTs === null) startTs = ts;
        const elapsed = ts - startTs;
        const progress = Math.min(1, elapsed / PULSE_DURATION_MS);
        const eased = 1 - Math.pow(1 - progress, 3);
        renderFrame(eased);
        if (progress < 1) {
          animId = window.requestAnimationFrame(step);
        } else {
          renderFrame(null);
          animId = null;
        }
      };
      animId = window.requestAnimationFrame(step);
    }

    let observer = null;
    if (typeof ResizeObserver !== 'undefined') {
      observer = new ResizeObserver(() => {
        syncDimensions();
        renderFrame(null);
      });
      observer.observe(canvas);
    }

    return () => {
      if (animId !== null && typeof window !== 'undefined') {
        window.cancelAnimationFrame(animId);
      }
      if (observer) observer.disconnect();
    };
  }, [scene, theme, frozen, compact, pulseTrigger, activeLinkId]);

  const ariaSummary =
    mode === 'architect'
      ? `UTC-12 to UTC+14 time-zone handoff map showing ${scene.nodes.length} people and ${scene.arcs.length} cross-timezone handoffs.`
      : `UTC-12 to UTC+14 time-zone map across ${BUILDER_DIRECTORY.length} builders and ${crewsCount} teams.`;

  if (compact) {
    return (
      <div className="solar-embedded-block">
        <div className="row-between small-copy solar-embedded-head">
          <span className="solar-title-pill">
            <SunIcon size={13} />
            <strong>Time-Zone Handoff Map</strong>
          </span>
          <span className="pill-row small-copy muted-copy">
            <span className="horizon-legend-dot dot-crew" /> In plan
            <span className="horizon-legend-dot dot-baton" /> Available match
          </span>
        </div>
        <div className="solar-canvas-wrap solar-canvas-compact">
          <canvas
            ref={canvasRef}
            className="solar-canvas solar-canvas-86"
            role="img"
            aria-label={ariaSummary}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="surface-card solar-horizon-card">
      <div className="row-between wrap-gap solar-horizon-header">
        <div className="pill-row">
          <span className="solar-title-pill">
            <SunIcon size={14} />
            <strong>Global Time-Zone Handoff Map (UTC-12 to UTC+14)</strong>
          </span>
          <span className="muted-copy small-copy">
            {mode === 'architect'
              ? 'Traces clean handoffs from Shift 1 (0..240m) to Shift 2 (240..480m, e.g. Priya in Bengaluru UTC+5:30).'
              : 'Shows daylight hours and cross-timezone handoff pairs across UTC-12 to UTC+14.'}
          </span>
        </div>

        <div className="pill-row small-copy">
          <span className="horizon-legend-dot dot-crew" /> <span>In team plan</span>
          <span className="horizon-legend-dot dot-baton" /> <span>Handoff match</span>
          <span className="badge-pill">
            <GlobeIcon size={12} /> {frozen ? 'Static (Motion Off)' : 'Calm at Rest (850ms Handoff)'}
          </span>
        </div>
      </div>

      <div className="solar-canvas-wrap">
        <canvas
          ref={canvasRef}
          className="solar-canvas"
          role="img"
          aria-label={ariaSummary}
        />
      </div>
    </div>
  );
}
