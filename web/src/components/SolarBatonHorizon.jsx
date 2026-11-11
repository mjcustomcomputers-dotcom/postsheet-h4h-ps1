import React, { useEffect, useMemo, useRef } from 'react';
import { isMotionFrozen } from '../ergonomics.js';
import { BUILDER_DIRECTORY, parseUtcOffsetHours } from '../presets-and-catalog.js';
import { SunIcon, GlobeIcon } from '../icons.jsx';

const MIN_UTC = -12;
const MAX_UTC = 14;
const UTC_SPAN = MAX_UTC - MIN_UTC; // 26 hours

const TICKS = [
  { offset: -12, label: 'UTC-12' },
  { offset: -6, label: 'UTC-6 (Hot Springs)' },
  { offset: 0, label: 'UTC+0 (London)' },
  { offset: 5.5, label: 'UTC+5:30 (Bengaluru)' },
  { offset: 9, label: 'UTC+9 (Tokyo)' },
  { offset: 14, label: 'UTC+14' }
];

function getPaletteForTheme(theme) {
  if (theme === 'warm-paper') {
    return {
      skyNight: '#E2E8F0',
      skyDayTop: 'rgba(14, 116, 144, 0.16)',
      skyDayBot: 'rgba(245, 158, 11, 0.12)',
      waveStroke: 'rgba(11, 79, 108, 0.55)',
      gridLine: 'rgba(100, 116, 139, 0.25)',
      tickInk: '#334155',
      nodeCrew: '#0B4F6C',
      nodeCand: '#B45309',
      nodePool: '#0F766E',
      labelInk: '#0F172A',
      arcStroke: 'rgba(11, 79, 108, 0.65)',
      fireflyCore: '#0369A1',
      fireflyGlow: 'rgba(14, 165, 233, 0.35)'
    };
  }
  if (theme === 'aaa-contrast') {
    return {
      skyNight: '#050505',
      skyDayTop: 'rgba(255, 214, 10, 0.18)',
      skyDayBot: 'rgba(255, 214, 10, 0.05)',
      waveStroke: '#FFD60A',
      gridLine: 'rgba(255, 255, 255, 0.35)',
      tickInk: '#FFFFFF',
      nodeCrew: '#4ADE80',
      nodeCand: '#FFD60A',
      nodePool: '#7DD3FC',
      labelInk: '#FFFFFF',
      arcStroke: '#FFD60A',
      fireflyCore: '#FFFFFF',
      fireflyGlow: 'rgba(255, 214, 10, 0.65)'
    };
  }
  if (theme === 'h4h-studio') {
    return {
      skyNight: '#0B0F19',
      skyDayTop: 'rgba(16, 185, 129, 0.18)',
      skyDayBot: 'rgba(139, 92, 246, 0.10)',
      waveStroke: 'rgba(16, 185, 129, 0.68)',
      gridLine: 'rgba(148, 163, 184, 0.16)',
      tickInk: '#A8B8D0',
      nodeCrew: '#10B981',
      nodeCand: '#A78BFA',
      nodePool: '#38BDF8',
      labelInk: '#ECF3FC',
      arcStroke: 'rgba(167, 139, 250, 0.72)',
      fireflyCore: '#6EE7B7',
      fireflyGlow: 'rgba(16, 185, 129, 0.55)'
    };
  }
  // Default quartz comfort palette (sbr-comfort / midnight-glass / matte-slate)
  return {
    skyNight: '#121920',
    skyDayTop: 'rgba(143, 190, 180, 0.20)',
    skyDayBot: 'rgba(156, 198, 218, 0.07)',
    waveStroke: 'rgba(143, 190, 180, 0.65)',
    gridLine: 'rgba(156, 198, 218, 0.14)',
    tickInk: '#9CB0C2',
    nodeCrew: '#8FBEB4',
    nodeCand: '#E6C785',
    nodePool: '#9CC6DA',
    labelInk: '#D1DCE5',
    arcStroke: 'rgba(156, 198, 218, 0.62)',
    fireflyCore: '#F4E3B2',
    fireflyGlow: 'rgba(143, 190, 180, 0.55)'
  };
}

export default function SolarBatonHorizon({
  mode = 'discover', // 'discover' | 'architect'
  theme = 'sbr-comfort',
  motion = 'spring',
  horizonMin = 480,
  teamPeople = [],
  candidates = [],
  recommendations = [],
  crewsCount = 0
}) {
  const canvasRef = useRef(null);
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
          rowBias: idx % 2 === 0 ? -7 : 7
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
          rowBias: idx % 2 === 0 ? -5 : 8
        });
      });

      // Build baton-pass arcs from upstream shift (0..half) to downstream shift (half..horizonMin)
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
              phaseOffset: (uIdx * 0.31 + dIdx * 0.47) % 1
            });
          }
        });
      });

      return { nodes, arcs };
    }

    // Discover mode: plot global builder pool across UTC-12..UTC+14 with async baton arcs
    const nodes = BUILDER_DIRECTORY.map((b, idx) => ({
      id: b.id.replace(/^(leader|builder)-/, ''),
      offset: typeof b.utcOffset === 'number' ? b.utcOffset : parseUtcOffsetHours(b.timezone, b.startMin, 480),
      kind: b.batonReady ? (b.startMin >= 240 ? 'candidate-baton' : 'crew') : 'pool',
      startMin: b.startMin,
      endMin: b.endMin,
      rowBias: (idx % 3 - 1) * 7
    }));

    const americas = nodes.filter(n => n.offset <= -4 && n.kind === 'crew');
    const apacEmea = nodes.filter(n => n.offset >= 1 && n.kind === 'candidate-baton');
    const arcs = [];
    if (americas[0] && apacEmea[0]) {
      arcs.push({ from: americas[0], to: apacEmea[0], phaseOffset: 0.1 });
    }
    if (americas[1] && apacEmea[1]) {
      arcs.push({ from: americas[1], to: apacEmea[1], phaseOffset: 0.55 });
    }
    return { nodes, arcs };
  }, [mode, horizonMin, teamPeople, candidates, recommendations]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || typeof canvas.getContext !== 'function') return undefined;
    const ctx = canvas.getContext('2d');
    if (!ctx) return undefined;

    const palette = getPaletteForTheme(theme);
    let animId = null;
    let width = 880;
    let height = 98;

    function syncDimensions() {
      const rect = canvas.getBoundingClientRect();
      const dpr = typeof window !== 'undefined' ? Math.min(2, window.devicePixelRatio || 1) : 1;
      width = Math.max(300, Math.round(rect.width || 880));
      height = Math.max(88, Math.round(rect.height || 98));
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    function xForUtc(offset) {
      const padX = 36;
      const usable = Math.max(120, width - padX * 2);
      const clamped = Math.max(MIN_UTC, Math.min(MAX_UTC, offset));
      return padX + ((clamped - MIN_UTC) / UTC_SPAN) * usable;
    }

    function renderFrame(tsMs) {
      const timeSec = frozen ? 0 : tsMs * 0.001;
      ctx.clearRect(0, 0, width, height);

      // Background night-sky matte band
      ctx.fillStyle = palette.skyNight;
      ctx.fillRect(0, 0, width, height);

      // Solar Terminator Daylight Wave across UTC-12..UTC+14
      // Centered near UTC+1 with gentle drift when motion is active
      const subsolarUtc = 0.5 + (frozen ? 0 : Math.sin(timeSec * 0.35) * 1.6);
      const grad = ctx.createLinearGradient(0, 6, 0, height - 18);
      grad.addColorStop(0, palette.skyDayTop);
      grad.addColorStop(1, palette.skyDayBot);

      ctx.beginPath();
      const steps = 72;
      for (let i = 0; i <= steps; i++) {
        const frac = i / steps;
        const utc = MIN_UTC + frac * UTC_SPAN;
        const x = xForUtc(utc);
        const phase = ((utc - subsolarUtc) / 24) * Math.PI * 2;
        const elev = (Math.cos(phase) + 1) * 0.5; // 0..1 solar elevation
        const y = height - 24 - elev * (height - 46);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.lineTo(xForUtc(MAX_UTC), height - 20);
      ctx.lineTo(xForUtc(MIN_UTC), height - 20);
      ctx.closePath();
      ctx.fillStyle = grad;
      ctx.fill();

      // Crisp solar terminator ridge line
      ctx.beginPath();
      for (let i = 0; i <= steps; i++) {
        const frac = i / steps;
        const utc = MIN_UTC + frac * UTC_SPAN;
        const x = xForUtc(utc);
        const phase = ((utc - subsolarUtc) / 24) * Math.PI * 2;
        const elev = (Math.cos(phase) + 1) * 0.5;
        const y = height - 24 - elev * (height - 46);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.strokeStyle = palette.waveStroke;
      ctx.lineWidth = 1.5;
      ctx.stroke();

      // UTC Meridian Grid & Labels
      ctx.font = '600 10.5px "JetBrains Mono", ui-monospace, SFMono-Regular, Consolas, monospace';
      TICKS.forEach((tk, idx) => {
        const x = xForUtc(tk.offset);
        ctx.beginPath();
        ctx.moveTo(x, 8);
        ctx.lineTo(x, height - 20);
        ctx.strokeStyle = palette.gridLine;
        ctx.lineWidth = 1;
        ctx.stroke();

        ctx.fillStyle = palette.tickInk;
        ctx.textAlign = idx === 0 ? 'left' : idx === TICKS.length - 1 ? 'right' : 'center';
        ctx.fillText(tk.label, x, height - 6);
      });

      const baseNodeY = Math.round(height * 0.52);

      // Curved Luminous Baton-Pass Handoff Arcs + Firefly Particles
      scene.arcs.forEach(arc => {
        const x1 = xForUtc(arc.from.offset);
        const y1 = baseNodeY + arc.from.rowBias;
        const x2 = xForUtc(arc.to.offset);
        const y2 = baseNodeY + arc.to.rowBias;
        const cx = (x1 + x2) * 0.5;
        const spanPx = Math.abs(x2 - x1);
        const cy = Math.max(10, Math.min(y1, y2) - Math.min(34, 14 + spanPx * 0.06));

        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.quadraticCurveTo(cx, cy, x2, y2);
        ctx.strokeStyle = palette.arcStroke;
        ctx.lineWidth = 1.75;
        ctx.setLineDash([4, 3]);
        ctx.stroke();
        ctx.setLineDash([]);

        // Firefly baton particle along quadratic Bezier
        const t = frozen ? 0.5 : (timeSec * 0.42 + arc.phaseOffset) % 1;
        const omt = 1 - t;
        const fx = omt * omt * x1 + 2 * omt * t * cx + t * t * x2;
        const fy = omt * omt * y1 + 2 * omt * t * cy + t * t * y2;

        ctx.beginPath();
        ctx.arc(fx, fy, 6.5, 0, Math.PI * 2);
        ctx.fillStyle = palette.fireflyGlow;
        ctx.fill();

        ctx.beginPath();
        ctx.arc(fx, fy, 2.7, 0, Math.PI * 2);
        ctx.fillStyle = palette.fireflyCore;
        ctx.fill();
      });

      // Crew & Candidate Quartz Nodes
      ctx.font = '600 10.5px Inter, ui-sans-serif, system-ui, sans-serif';
      scene.nodes.forEach((n, idx) => {
        const x = xForUtc(n.offset);
        const y = baseNodeY + n.rowBias;
        const pulse = frozen ? 0 : Math.sin(timeSec * 2.4 + idx) * 1.2;
        const color =
          n.kind === 'crew'
            ? palette.nodeCrew
            : n.kind === 'candidate-baton'
              ? palette.nodeCand
              : palette.nodePool;

        ctx.beginPath();
        ctx.arc(x, y, 7.2 + Math.max(0, pulse), 0, Math.PI * 2);
        ctx.fillStyle = palette.fireflyGlow;
        ctx.fill();

        ctx.beginPath();
        ctx.arc(x, y, 4.1, 0, Math.PI * 2);
        ctx.fillStyle = color;
        ctx.fill();

        if (width >= 540 || idx < 4) {
          ctx.fillStyle = palette.labelInk;
          ctx.textAlign = n.offset > 9 ? 'right' : 'left';
          const labelX = n.offset > 9 ? x - 7 : x + 7;
          ctx.fillText(n.id, labelX, y + 3.5);
        }
      });
    }

    syncDimensions();
    renderFrame(0);

    if (!frozen && typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function') {
      const loop = ts => {
        renderFrame(ts);
        animId = window.requestAnimationFrame(loop);
      };
      animId = window.requestAnimationFrame(loop);
    }

    let observer = null;
    if (typeof ResizeObserver !== 'undefined') {
      observer = new ResizeObserver(() => {
        syncDimensions();
        renderFrame(0);
      });
      observer.observe(canvas);
    }

    return () => {
      if (animId !== null && typeof window !== 'undefined') {
        window.cancelAnimationFrame(animId);
      }
      if (observer) observer.disconnect();
    };
  }, [scene, theme, frozen]);

  const ariaSummary =
    mode === 'architect'
      ? `Solar terminator UTC-12 to UTC+14 horizon showing ${scene.nodes.length} roster and candidate builders and ${scene.arcs.length} asynchronous baton-pass handoff arcs.`
      : `Solar terminator UTC-12 to UTC+14 horizon across ${BUILDER_DIRECTORY.length} global builders and ${crewsCount} page crews.`;

  return (
    <div className="surface-card solar-horizon-card">
      <div className="row-between wrap-gap solar-horizon-header">
        <div className="pill-row">
          <span className="solar-title-pill">
            <SunIcon size={14} />
            <strong>Solar Terminator &amp; Baton-Pass Horizon</strong>
          </span>
          <span className="muted-copy small-copy">
            {mode === 'architect'
              ? 'Luminous arcs trace zero-overlap handoffs from Shift 1 (0..240m) to Baton Relay (240..480m, e.g. Priya UTC+5:30).'
              : 'Global daylight wave (UTC-12..UTC+14) mapping synchronous clusters and cross-continent baton pairs.'}
          </span>
        </div>

        <div className="pill-row small-copy">
          <span className="horizon-legend-dot dot-crew" /> <span>Committed Crew</span>
          <span className="horizon-legend-dot dot-baton" /> <span>Baton Candidate</span>
          <span className="badge-pill">
            <GlobeIcon size={12} /> {frozen ? 'Static (Reduced Motion)' : '60 FPS Firefly Arc'}
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
