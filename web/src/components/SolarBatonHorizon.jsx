import React, { useEffect, useMemo, useRef } from 'react';
import { isMotionFrozen } from '../ergonomics.js';
import {
  BUILDER_DIRECTORY,
  parseUtcOffsetHours,
  computePartialTaskPreview
} from '../presets-and-catalog.js';
import { SunIcon, GlobeIcon } from '../icons.jsx';

const MIN_UTC = -12;
const MAX_UTC = 14;
const UTC_SPAN = MAX_UTC - MIN_UTC; // 26 hours
const PULSE_DURATION_MS = 850;

const TICKS_FULL = [
  { offset: -12, label: 'UTC-12', shortLabel: '-12' },
  { offset: -6, label: 'UTC-6 (Hot Springs)', shortLabel: 'UTC-6' },
  { offset: 0, label: 'UTC+0 (London)', shortLabel: 'UTC+0' },
  { offset: 5.5, label: 'UTC+5:30 (Bengaluru)', shortLabel: 'UTC+5:30' },
  { offset: 9, label: 'UTC+9 (Tokyo)', shortLabel: 'UTC+9' },
  { offset: 14, label: 'UTC+14', shortLabel: '+14' }
];

const TICKS_COMPACT = [
  { offset: -6, label: 'UTC-6', shortLabel: '-6' },
  { offset: 0, label: 'UTC+0', shortLabel: '+0' },
  { offset: 5.5, label: 'UTC+5:30', shortLabel: '+5:30' },
  { offset: 9, label: 'UTC+9', shortLabel: '+9' }
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
  // Default Moonlight Dark & Calm Matte Dark palette (desaturated mineral sage)
  return {
    skyNight: '#0B1016',
    skyDayTop: 'rgba(94, 156, 118, 0.14)',
    skyDayBot: 'rgba(110, 178, 165, 0.05)',
    waveStroke: 'rgba(104, 180, 137, 0.62)',
    gridLine: 'rgba(148, 172, 166, 0.14)',
    tickInk: '#9CB2AC',
    nodeCrew: '#74BF93',
    nodeCand: '#D9B66E',
    nodePool: '#7DC9C4',
    labelInk: '#E3ECE8',
    arcStroke: 'rgba(104, 180, 137, 0.68)',
    fireflyCore: '#D9EFE2',
    fireflyGlow: 'rgba(104, 180, 137, 0.28)',
    focusRing: '#79C9B8'
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
  tasks = [],
  plan = null,
  crewsCount = 0,
  pulseTrigger = 0,
  activeLinkId = null
}) {
  const canvasRef = useRef(null);
  const lastPulseRef = useRef(pulseTrigger);
  const prevCrewIdsRef = useRef(new Set((teamPeople || []).map(p => p.id)));
  const pulsedNodeIdsRef = useRef(new Set());
  const frozen = isMotionFrozen(motion);

  useEffect(() => {
    const curIds = new Set((teamPeople || []).map(p => p.id));
    const prevIds = prevCrewIdsRef.current;
    const diff = new Set();
    for (const id of curIds) {
      if (!prevIds.has(id)) diff.add(id);
    }
    if (diff.size > 0) {
      pulsedNodeIdsRef.current = diff;
    } else {
      pulsedNodeIdsRef.current = curIds;
    }
    prevCrewIdsRef.current = curIds;
  }, [teamPeople, pulseTrigger]);

  const scene = useMemo(() => {
    if (mode === 'architect') {
      const recIds = new Set(
        (recommendations || [])
          .filter(r => r.restoresFeasibility || r.asyncBatonPass || r.upgradesToConditional)
          .map(r => r.candidateId)
      );
      const nodes = [];
      const half = Math.max(120, Math.round(horizonMin * 0.5));

      const biasSlots = [-12, 11, -22, 20, 0];
      const pushWithSeparatedBias = item => {
        let clusterCount = 0;
        for (const existing of nodes) {
          if (Math.abs(existing.offset - item.offset) <= 3) clusterCount += 1;
        }
        nodes.push({
          ...item,
          rowBias: biasSlots[clusterCount % biasSlots.length]
        });
      };

      teamPeople.forEach(p => {
        const offset = parseUtcOffsetHours(p.timezone, p.startMin, horizonMin);
        pushWithSeparatedBias({
          id: p.id,
          offset,
          kind: 'crew',
          startMin: Number(p.startMin || 0),
          endMin: Number(p.endMin || half)
        });
      });

      candidates.forEach(c => {
        const offset = parseUtcOffsetHours(c.timezone, c.startMin, horizonMin);
        const isRecommended = recIds.has(c.id) || Number(c.startMin || 0) >= half;
        pushWithSeparatedBias({
          id: c.id,
          offset,
          kind: isRecommended ? 'candidate-baton' : 'candidate',
          startMin: Number(c.startMin || 0),
          endMin: Number(c.endMin || horizonMin)
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

      // Ensure nearby-timezone pairs (e.g. Aurora UTC-6 <-> Mateo UTC-5) also display a clean handoff arc
      if (arcs.length === 0 && upstream[0]) {
        const anchor = upstream[0];
        const partner =
          nodes.find(n => n.kind === 'crew' && n.id !== anchor.id && Math.abs(n.offset - anchor.offset) >= 0.5) ||
          nodes.find(
            n => n.kind === 'candidate-baton' && n.id !== anchor.id && Math.abs(n.offset - anchor.offset) >= 0.5
          ) ||
          nodes.find(n => n.kind === 'crew' && n.id !== anchor.id);
        if (partner) {
          arcs.push({
            from: anchor,
            to: partner,
            activeCrewHandoff: partner.kind === 'crew',
            phaseOffset: 0.08
          });
        }
      }

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

      // UTC Meridian Grid & Collision-Free Tick Labels
      ctx.font = compact
        ? '600 9.5px "JetBrains Mono", ui-monospace, SFMono-Regular, Consolas, monospace'
        : '600 10.5px "JetBrains Mono", ui-monospace, SFMono-Regular, Consolas, monospace';
      const placedTicks = [];
      const tickFits = (left, right) =>
        left >= 4 &&
        right <= width - 4 &&
        placedTicks.every(box => right + 10 <= box.left || left >= box.right + 10);

      ticks.forEach((tk, idx) => {
        const x = xForUtc(tk.offset);
        ctx.beginPath();
        ctx.moveTo(x, 6);
        ctx.lineTo(x, height - 17);
        ctx.strokeStyle = palette.gridLine;
        ctx.lineWidth = 1;
        ctx.stroke();

        ctx.fillStyle = palette.tickInk;
        const align = !compact && idx === 0 ? 'left' : !compact && idx === ticks.length - 1 ? 'right' : 'center';
        const candidatesToTry = tk.shortLabel && tk.shortLabel !== tk.label ? [tk.label, tk.shortLabel] : [tk.label];
        for (const textCandidate of candidatesToTry) {
          const textW = ctx.measureText(textCandidate).width;
          let drawX = x;
          let left = x - textW * 0.5;
          let right = x + textW * 0.5;
          if (align === 'left') {
            drawX = Math.max(4, x);
            left = drawX;
            right = drawX + textW;
          } else if (align === 'right') {
            drawX = Math.min(width - 4, x);
            left = drawX - textW;
            right = drawX;
          } else {
            if (left < 4) {
              drawX += 4 - left;
              left = 4;
              right = left + textW;
            } else if (right > width - 4) {
              drawX -= right - (width - 4);
              right = width - 4;
              left = right - textW;
            }
          }
          if (tickFits(left, right)) {
            ctx.textAlign = align;
            ctx.fillText(textCandidate, drawX, height - 4);
            placedTicks.push({ left, right });
            break;
          }
        }
      });

      const baseNodeY = Math.round(height * 0.45);

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

      // Crew & Candidate Nodes (draw dots first, then collision-free labels)
      ctx.font = compact
        ? '600 9.5px Inter, ui-sans-serif, system-ui, sans-serif'
        : '600 10.5px Inter, ui-sans-serif, system-ui, sans-serif';
      const labelQueue = [];
      scene.nodes.forEach((n, idx) => {
        const x = xForUtc(n.offset);
        const y = Math.max(12, Math.min(height - 24, baseNodeY + n.rowBias));
        const isLinked = Boolean(activeLinkId && n.id === activeLinkId);
        const isPulsedNode =
          typeof pulseProgress === 'number' &&
          n.kind === 'crew' &&
          pulsedNodeIdsRef.current.has(n.id);
        const color =
          n.kind === 'crew'
            ? palette.nodeCrew
            : n.kind === 'candidate-baton'
              ? palette.nodeCand
              : palette.nodePool;

        if (isPulsedNode) {
          const haloR = (compact ? 6.8 : 7.8) + Math.sin(pulseProgress * Math.PI) * (compact ? 4.8 : 6.0);
          ctx.save();
          ctx.globalAlpha = Math.max(0.22, 1 - pulseProgress * 0.72);
          ctx.beginPath();
          ctx.arc(x, y, haloR, 0, Math.PI * 2);
          ctx.strokeStyle = palette.focusRing;
          ctx.lineWidth = 2.1;
          ctx.stroke();
          ctx.restore();
        }

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

        if (n.kind === 'crew') {
          // Solid Circle for confirmed crew member (CVD-invariant shape #1)
          ctx.beginPath();
          ctx.arc(x, y, compact ? 4.2 : 4.8, 0, Math.PI * 2);
          ctx.fillStyle = color;
          ctx.fill();
        } else if (n.kind === 'candidate-baton') {
          // Crisp Diamond for baton-handoff candidate (CVD-invariant shape #2)
          const r = compact ? 5.4 : 6.2;
          ctx.save();
          ctx.beginPath();
          ctx.moveTo(x, y - r);
          ctx.lineTo(x + r, y);
          ctx.lineTo(x, y + r);
          ctx.lineTo(x - r, y);
          ctx.closePath();
          ctx.fillStyle = '#0d131a';
          ctx.fill();
          ctx.strokeStyle = color;
          ctx.lineWidth = 2.3;
          ctx.stroke();
          ctx.restore();
        } else {
          // Upward Triangle for open directory pool candidate (CVD-invariant shape #3)
          const r = compact ? 5.4 : 6.0;
          ctx.save();
          ctx.beginPath();
          ctx.moveTo(x, y - r);
          ctx.lineTo(x + r * 0.92, y + r * 0.78);
          ctx.lineTo(x - r * 0.92, y + r * 0.78);
          ctx.closePath();
          ctx.fillStyle = '#0d131a';
          ctx.fill();
          ctx.strokeStyle = color;
          ctx.lineWidth = 2.2;
          ctx.stroke();
          ctx.restore();
        }

        const shouldShowLabel = !compact
          ? width >= 460 || idx < 4 || isLinked
          : n.kind === 'crew' || idx < 3 || isLinked;
        if (shouldShowLabel) {
          labelQueue.push({
            id: n.id,
            x,
            y,
            offset: n.offset,
            priority: isLinked ? 3 : n.kind === 'crew' ? 2 : 1
          });
        }
      });

      const placedLabelBoxes = [];
      const labelH = compact ? 11 : 12;
      const boxFits = (x0, y0, x1, y1) =>
        x0 >= 4 &&
        x1 <= width - 4 &&
        y0 >= 4 &&
        y1 <= height - 19 &&
        placedLabelBoxes.every(b => x1 + 4 <= b.x0 || x0 >= b.x1 + 4 || y1 + 2 <= b.y0 || y0 >= b.y1 + 2);

      labelQueue
        .sort((a, b) => b.priority - a.priority)
        .forEach(item => {
          const w = ctx.measureText(item.id).width;
          const preferLeft = item.offset > 7;
          const slots = preferLeft
            ? [
                { align: 'right', lx: item.x - 6, baselineY: item.y + 3.2, x0: item.x - 6 - w },
                { align: 'left', lx: item.x + 6, baselineY: item.y + 3.2, x0: item.x + 6 },
                { align: 'right', lx: item.x - 5, baselineY: item.y - 8, x0: item.x - 5 - w },
                { align: 'right', lx: item.x - 5, baselineY: item.y + 13, x0: item.x - 5 - w },
                { align: 'left', lx: item.x + 5, baselineY: item.y - 8, x0: item.x + 5 },
                { align: 'left', lx: item.x + 5, baselineY: item.y + 13, x0: item.x + 5 }
              ]
            : [
                { align: 'left', lx: item.x + 6, baselineY: item.y + 3.2, x0: item.x + 6 },
                { align: 'right', lx: item.x - 6, baselineY: item.y + 3.2, x0: item.x - 6 - w },
                { align: 'left', lx: item.x + 5, baselineY: item.y - 8, x0: item.x + 5 },
                { align: 'left', lx: item.x + 5, baselineY: item.y + 13, x0: item.x + 5 },
                { align: 'right', lx: item.x - 5, baselineY: item.y - 8, x0: item.x - 5 - w },
                { align: 'right', lx: item.x - 5, baselineY: item.y + 13, x0: item.x - 5 - w }
              ];
          for (const slot of slots) {
            const top = slot.baselineY - labelH + 2;
            const bot = slot.baselineY + 2;
            if (boxFits(slot.x0, top, slot.x0 + w, bot)) {
              ctx.fillStyle = palette.labelInk;
              ctx.textAlign = slot.align;
              ctx.fillText(item.id, slot.lx, slot.baselineY);
              placedLabelBoxes.push({ x0: slot.x0, y0: top, x1: slot.x0 + w, y1: bot });
              break;
            }
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

  const formatUtc = off => {
    const val = Number(off || 0);
    return `UTC${val >= 0 ? `+${val}` : val}`;
  };
  const crewNodes = scene.nodes.filter(n => n.kind === 'crew');
  const matchNodes = scene.nodes.filter(n => n.kind !== 'crew');
  const coveredUtc = Array.from(new Set(crewNodes.map(n => formatUtc(n.offset))));
  const crewNames = crewNodes.map(n => `${n.id} (${formatUtc(n.offset)})`);
  const matchNames = matchNodes.map(n => `${n.id} (${formatUtc(n.offset)})`);
  const partialPreview = useMemo(
    () =>
      Array.isArray(tasks) && tasks.length > 0
        ? computePartialTaskPreview(tasks, teamPeople, horizonMin, plan)
        : new Map(),
    [tasks, teamPeople, horizonMin, plan]
  );
  const witnessAssignments = Array.isArray(plan?.witness?.assignments)
    ? plan.witness.assignments
    : [];
  const witnessMap = new Map(witnessAssignments.map(a => [a.taskId, a]));
  const uncoveredTasks = Array.isArray(tasks)
    ? tasks
        .filter(t => !witnessMap.has(t.id) && !partialPreview.has(t.id))
        .map(t => t.id || t.name)
    : [];
  const gapSentence = Array.isArray(tasks) && tasks.length > 0
    ? uncoveredTasks.length > 0
      ? `Uncovered task gap: ${uncoveredTasks.join(', ')}.`
      : `All ${tasks.length} scheduled tasks covered.`
    : '';

  const ariaSummary =
    mode === 'architect' || crewNodes.length > 0
      ? `UTC-12 to UTC+14 time-zone handoff map (${scene.arcs.length} handoffs). Covered UTC windows: ${
          coveredUtc.length ? coveredUtc.join(', ') : 'none'
        }. Assigned in-plan members (solid circle): ${
          crewNames.length ? crewNames.join(', ') : 'none'
        }. Available matches (hollow ring): ${
          matchNames.length ? matchNames.slice(0, 6).join(', ') : 'none'
        }. ${gapSentence}`.trim()
      : `UTC-12 to UTC+14 time-zone map across ${BUILDER_DIRECTORY.length} builders and ${crewsCount} teams. Solid circle indicates in-plan member; hollow ring indicates available match.`;

  if (compact) {
    return (
      <div className="solar-embedded-block">
        <div className="row-between small-copy solar-embedded-head">
          <span className="solar-title-pill">
            <SunIcon size={13} />
            <strong>Time-Zone Handoff Map</strong>
          </span>
          <span className="pill-row small-copy muted-copy">
            <span>
              <span className="horizon-legend-dot dot-crew" aria-hidden="true" /> In plan{' '}
              <span className="sr-only">(solid circle)</span>
            </span>
            <span>
              <span className="horizon-legend-dot dot-baton" aria-hidden="true" /> Available match{' '}
              <span className="sr-only">(hollow ring)</span>
            </span>
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
        <p className="sr-only">{ariaSummary}</p>
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
          <span>
            <span className="horizon-legend-dot dot-crew" aria-hidden="true" />{' '}
            <span>In team plan <span className="sr-only">(solid circle)</span></span>
          </span>
          <span>
            <span className="horizon-legend-dot dot-baton" aria-hidden="true" />{' '}
            <span>Handoff match <span className="sr-only">(hollow ring)</span></span>
          </span>
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
      <p className="sr-only">{ariaSummary}</p>
    </div>
  );
}
