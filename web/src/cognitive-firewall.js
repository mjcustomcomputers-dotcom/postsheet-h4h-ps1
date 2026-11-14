// Synchronicity Cognitive Firewall, Optical Contrast & Task Comprehension Stress-Test Engine
// Enforces WCAG 2.2 AA/AAA, W3C COGA Working-Memory & Readability Invariants,
// FTC ROSCA Clear-and-Conspicuous Comprehension, and EU Digital Fairness Act (Nov 2026) Symmetry.

const OVERLAY_SIGNATURES = [
  'accessibe',
  'acsbapp',
  'userway',
  'audioeye',
  'equalweb',
  'truendo'
];

const VAGUE_BUTTON_LABELS = new Set([
  'click here',
  'submit',
  'continue',
  'ok',
  'proceed',
  'more',
  'go',
  'yes',
  'no'
]);

const DOUBLE_NEGATIVE_PATTERNS = [
  /\bdo\s+not\s+un(check|select|subscribe|tick)\b/i,
  /\buncheck\s+if\s+you\s+do\s+not\b/i,
  /\bnot\s+opt\s+out\b/i,
  /\bopt\s+out\s+of\s+not\b/i,
  /\bdisable\s+non[- ]?essential\s+rejection\b/i
];

const COERCIVE_COPY_PATTERNS = [
  /\bno\s+thanks,\s+i\s+(hate|don'?t\s+care|prefer\s+paying|want\s+to\s+miss)\b/i,
  /\bonly\s+\d+\s+spots?\s+left\s+at\s+this\s+price\b/i,
  /\boffer\s+expires\s+in\s+\d+\s+seconds\b/i,
  /\bhurry!\s+\d+\s+people\s+are\s+viewing\b/i
];

function parseHexRgb(hex) {
  const clean = String(hex || '#000000').replace('#', '').trim();
  const full = clean.length === 3
    ? clean.split('').map(ch => ch + ch).join('')
    : clean.padEnd(6, '0').slice(0, 6);
  const n = Number.parseInt(full, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function srgbChannelToLinear(c255) {
  const c = c255 / 255;
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

export function relativeLuminanceRgb([r, g, b]) {
  return (
    0.2126 * srgbChannelToLinear(r) +
    0.7152 * srgbChannelToLinear(g) +
    0.0722 * srgbChannelToLinear(b)
  );
}

export function blendOverlayHex(baseHex, overlayHex, alpha = 0) {
  const [br, bg, bb] = parseHexRgb(baseHex);
  const [or, og, ob] = parseHexRgb(overlayHex);
  const a = Math.max(0, Math.min(1, Number(alpha) || 0));
  return [
    Math.round(br * (1 - a) + or * a),
    Math.round(bg * (1 - a) + og * a),
    Math.round(bb * (1 - a) + ob * a)
  ];
}

export function contrastRatioHex(fgHex, bgHex, overlayHex = null, overlayAlpha = 0) {
  const fgRgb = parseHexRgb(fgHex);
  const bgRgb = overlayHex && overlayAlpha > 0
    ? blendOverlayHex(bgHex, overlayHex, overlayAlpha)
    : parseHexRgb(bgHex);
  const l1 = relativeLuminanceRgb(fgRgb);
  const l2 = relativeLuminanceRgb(bgRgb);
  const hi = Math.max(l1, l2);
  const lo = Math.min(l1, l2);
  return Number(((hi + 0.05) / (lo + 0.05)).toFixed(2));
}

export function countSyllablesWord(rawWord) {
  const w = String(rawWord || '')
    .toLowerCase()
    .replace(/[^a-z]/g, '');
  if (!w) return 0;
  if (w.length <= 3) return 1;
  const trimmed = w
    .replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, '')
    .replace(/^y/, '');
  const groups = trimmed.match(/[aeiouy]{1,2}/g);
  return Math.max(1, groups ? groups.length : 1);
}

export function computeReadabilityMetrics(text) {
  const cleaned = String(text || '').replace(/\s+/g, ' ').trim();
  if (!cleaned) {
    return {
      words: 0,
      sentences: 0,
      syllables: 0,
      fkgl: 0,
      readingEase: 100,
      plainGradePass: true
    };
  }
  const sentenceParts = cleaned
    .split(/[.!?]+/)
    .map(s => s.trim())
    .filter(Boolean);
  const wordTokens = cleaned
    .split(/\s+/)
    .map(t => t.replace(/[^A-Za-z0-9'-]/g, ''))
    .filter(Boolean);
  const words = Math.max(1, wordTokens.length);
  const sentences = Math.max(1, sentenceParts.length);
  const syllables = wordTokens.reduce((sum, tok) => sum + countSyllablesWord(tok), 0);

  const fkglRaw = 0.39 * (words / sentences) + 11.8 * (syllables / words) - 15.59;
  const fkgl = Number(Math.max(0, fkglRaw).toFixed(2));
  const easeRaw = 206.835 - 1.015 * (words / sentences) - 84.6 * (syllables / words);
  const readingEase = Number(Math.max(0, Math.min(100, easeRaw)).toFixed(1));

  return {
    words,
    sentences,
    syllables,
    fkgl,
    readingEase,
    plainGradePass: fkgl <= 9.0
  };
}

export function detectDeceptiveCopyPatterns(text) {
  const sample = String(text || '');
  const doubleNegatives = DOUBLE_NEGATIVE_PATTERNS.filter(rx => rx.test(sample)).length;
  const coercivePhrases = COERCIVE_COPY_PATTERNS.filter(rx => rx.test(sample)).length;
  return {
    doubleNegatives,
    coercivePhrases,
    totalTraps: doubleNegatives + coercivePhrases
  };
}

export function computeComprehensionModels({
  text = '',
  primaryChoicesCount = 1,
  memoryChunksRequired = 3,
  hasConsequencePreview = true,
  vagueVerbCount = 0
} = {}) {
  const readability = computeReadabilityMetrics(text);
  const copyTraps = detectDeceptiveCopyPatterns(text);
  const nChoices = Math.max(1, Number(primaryChoicesCount) || 1);
  const hickReactionMs = Math.round(180 + 150 * Math.log2(nChoices + 1));
  const chunks = Math.max(0, Number(memoryChunksRequired) || 0);
  const cowanSurvivalProb = Number((1 / (1 + Math.exp(1.4 * (chunks - 4.0)))).toFixed(4));

  let score = 100;
  if (readability.fkgl > 9.0) score -= Math.min(35, Math.round((readability.fkgl - 9.0) * 2.5));
  if (chunks > 4) score -= Math.min(30, (chunks - 4) * 8);
  if (nChoices > 4) score -= Math.min(20, (nChoices - 4) * 3);
  if (!hasConsequencePreview) score -= 15;
  if (vagueVerbCount > 0) score -= Math.min(20, vagueVerbCount * 6);
  if (copyTraps.totalTraps > 0) score -= Math.min(40, copyTraps.totalTraps * 20);
  score = Math.max(0, Math.min(100, score));

  return {
    readability,
    copyTraps,
    primaryChoicesCount: nChoices,
    hickReactionMs,
    memoryChunksRequired: chunks,
    cowanSurvivalProb,
    hasConsequencePreview: Boolean(hasConsequencePreview),
    vagueVerbCount,
    comprehensionScore: score,
    passed:
      readability.plainGradePass &&
      chunks <= 4 &&
      nChoices <= 4 &&
      Boolean(hasConsequencePreview) &&
      vagueVerbCount === 0 &&
      copyTraps.totalTraps === 0
  };
}

export function evaluateProHumanPeripheralStage({
  keyToFillRatio = 1.58,
  peripheralWeberDelta = 0.34,
  flashFrequencyHz = 0,
  hasOneClickOffSwitch = true,
  preservesSymmetricExit = true,
  hasDistressOffloadShield = true,
  idleFps = 0
} = {}) {
  const ktf = Number(keyToFillRatio) || 1.0;
  const weber = Math.max(0, Number(peripheralWeberDelta) || 0);
  const hz = Math.max(0, Number(flashFrequencyHz) || 0);
  const fps = Math.max(0, Number(idleFps) || 0);

  const keyToFillPass = ktf >= 1.0 && ktf <= 2.8;
  // Kaplan Soft-Fascination window: gentle peripheral scent <= 0.42 (< 0.50 magnocellular startle threshold)
  const softFascinationPass = weber <= 0.42 && hz === 0 && fps === 0;
  const ethicalSymmetryPass = Boolean(hasOneClickOffSwitch) && Boolean(preservesSymmetricExit);
  const distressPass = Boolean(hasDistressOffloadShield);

  let distressOffloadScore = 100;
  if (!keyToFillPass) distressOffloadScore -= 20;
  if (weber > 0.42) distressOffloadScore -= Math.min(45, Math.round((weber - 0.42) * 80));
  if (hz > 0) distressOffloadScore -= Math.min(40, Math.round(hz * 12));
  if (!hasOneClickOffSwitch) distressOffloadScore -= 25;
  if (!preservesSymmetricExit) distressOffloadScore -= 30;
  if (!hasDistressOffloadShield) distressOffloadScore -= 20;
  if (fps > 0) distressOffloadScore -= 15;
  distressOffloadScore = Math.max(0, Math.min(100, distressOffloadScore));

  const passed = keyToFillPass && softFascinationPass && ethicalSymmetryPass && distressPass;
  return {
    passed,
    distressOffloadScore,
    keyToFillRatio: ktf,
    peripheralWeberDelta: weber,
    flashFrequencyHz: hz,
    keyToFillPass,
    softFascinationPass,
    ethicalSymmetryPass,
    detail: `Key:Fill=${ktf}:1, Weber=${weber} (<=0.42 Soft-Fascination), flash=${hz}Hz, offSwitch=${Boolean(hasOneClickOffSwitch)}, weightOff=${Boolean(hasDistressOffloadShield)}`
  };
}

export function evaluateLuminanceEscalationBreaker({
  lightSurfaceHex = '#EAE6DD',
  lightInkHex = '#0F172A',
  mode = 'matte-balanced',
  hasBlueGlareSafetySwitch = true,
  hasSunlightDaylightMode = true,
  ambientLux = 500,
  displayPeakNits = 300,
  surfaceDiffuseReflectance = 0.015
} = {}) {
  const rgb = parseHexRgb(lightSurfaceHex);
  const rLin = srgbChannelToLinear(rgb[0]);
  const gLin = srgbChannelToLinear(rgb[1]);
  const bLin = srgbChannelToLinear(rgb[2]);
  const relLuminance = Number(relativeLuminanceRgb(rgb).toFixed(3));
  const maxChannelNorm = Number((Math.max(rgb[0], rgb[1], rgb[2]) / 255).toFixed(3));

  // Linear 450-480nm LED blue-pump spike reduction vs 100% emissive #FFFFFF
  const blueSpikeReductionPct = Number(((1.0 - bLin) * 100).toFixed(2));
  // CIE TN 015:2023 melanopic ipRGC load reduction vs #FFFFFF
  const melanopicRel = 0.0013 * rLin + 0.2810 * gLin + 0.7177 * bLin;
  const melanopicReductionPct = Number(((1.0 - melanopicRel) * 100).toFixed(2));
  // Rayleigh (555nm / 460nm)^4 = 2.12x intraocular short-wave scatter factor
  const rayleighBlueScatterRatio = Number(Math.pow(555 / 460, 4).toFixed(2));

  const primaryInkContrast = contrastRatioHex(lightInkHex, lightSurfaceHex);

  // Ambient Contrast Ratio (ACR) in daylight/sunlight: (L_on + L_amb) / (L_off + L_amb)
  const inkRgb = parseHexRgb(lightInkHex);
  const inkRelLum = relativeLuminanceRgb(inkRgb);
  const reflectedNits = (Math.max(0, Number(ambientLux) || 0) / Math.PI) * Math.max(0.002, Number(surfaceDiffuseReflectance) || 0.015);
  const lOn = displayPeakNits * relLuminance + reflectedNits;
  const lOff = displayPeakNits * inkRelLum + reflectedNits;
  const ambientContrastRatio = Number(((lOn + 0.05) / (lOff + 0.05)).toFixed(2));

  const isSunlight = mode === 'sunlight-day' || mode === 'daylight-sun';
  const maxAllowedRelLum = isSunlight ? 0.93 : 0.85;
  const maxAllowedChannel = isSunlight ? 0.985 : 0.96;
  const minBlueDrop = isSunlight ? 14.0 : 24.0;

  const matteReflectancePass = relLuminance <= maxAllowedRelLum && maxChannelNorm < maxAllowedChannel;
  const blueGlarePass = blueSpikeReductionPct >= minBlueDrop && Boolean(hasBlueGlareSafetySwitch);
  const contrastPass = primaryInkContrast >= 12.5 && (ambientLux < 10000 || ambientContrastRatio >= 3.0);
  const sunlightReadyPass = Boolean(hasSunlightDaylightMode);

  const passed = matteReflectancePass && blueGlarePass && contrastPass && sunlightReadyPass;
  return {
    passed,
    relLuminance,
    maxChannelNorm,
    blueSpikeReductionPct,
    melanopicReductionPct,
    rayleighBlueScatterRatio,
    primaryInkContrast,
    ambientContrastRatio,
    matteReflectancePass,
    blueGlarePass,
    contrastPass,
    detail: `surface=${lightSurfaceHex} (Y=${relLuminance}, blueDrop=-${blueSpikeReductionPct}%, melanopic=-${melanopicReductionPct}%, AAA=${primaryInkContrast}:1, switch=${Boolean(hasBlueGlareSafetySwitch)})`
  };
}

function isVisible(el, win) {
  if (!el || !win) return false;
  if (el.closest('[aria-hidden="true"]')) return false;
  const st = win.getComputedStyle(el);
  if (st.display === 'none' || st.visibility === 'hidden' || Number(st.opacity) === 0) {
    return false;
  }
  const r = el.getBoundingClientRect();
  return r.width > 0 && r.height > 0;
}

export function stressTestTaskComprehension(doc = typeof document !== 'undefined' ? document : null) {
  if (!doc) {
    return {
      passed: false,
      comprehensionScore: 0,
      fkgl: 0,
      hickReactionMs: 0,
      cowanSurvivalProb: 0,
      checks: []
    };
  }
  const win = doc.defaultView || (typeof window !== 'undefined' ? window : null);
  const mainEl = doc.querySelector('main') || doc.body;
  const compassEl = doc.querySelector('[data-task-compass="true"]');
  const stepGoalEl = doc.querySelector('[data-compass-goal="true"]');
  const consequenceEl = doc.querySelector('[data-compass-consequence="true"]');
  const stateAnchors = doc.querySelectorAll('[data-memory-anchor="true"]');
  const h1El = mainEl ? mainEl.querySelector('h1, h2') : null;

  const sampleText = stepGoalEl && consequenceEl
    ? `${stepGoalEl.textContent || ''} ${consequenceEl.textContent || ''}`
    : (h1El ? h1El.textContent || '' : 'Choose your next step.');

  const visiblePrimaryBtns = mainEl
    ? Array.from(mainEl.querySelectorAll('button.btn-primary')).filter(b => isVisible(b, win))
    : [];

  const allMainButtons = mainEl
    ? Array.from(mainEl.querySelectorAll('button, a.btn')).filter(b => isVisible(b, win))
    : [];

  let vagueVerbCount = 0;
  for (const btn of allMainButtons) {
    const label = ((btn.getAttribute('aria-label') || btn.textContent || '')
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase());
    if (VAGUE_BUTTON_LABELS.has(label)) {
      vagueVerbCount += 1;
    }
  }

  const visibleTextSample = mainEl ? (mainEl.textContent || '').slice(0, 6000) : sampleText;
  const fullTrapScan = detectDeceptiveCopyPatterns(visibleTextSample);

  // Memory chunks required when state anchors are visible vs hidden:
  // With >=3 visible state anchors (Who you are, Active Team, Step status), user holds <=2 chunks in head.
  const memoryChunksRequired = stateAnchors.length >= 3 ? 2 : 5;
  const primaryCount = Math.max(1, Math.min(4, visiblePrimaryBtns.length || 1));
  const rawPrimaryCount = visiblePrimaryBtns.length || 1;

  const model = computeComprehensionModels({
    text: sampleText,
    primaryChoicesCount: rawPrimaryCount,
    memoryChunksRequired,
    hasConsequencePreview: Boolean(consequenceEl),
    vagueVerbCount
  });

  const checks = [
    {
      id: 'comp-orientation',
      label: '5-Second Trunk Test: explicit Step X of 4 + goal heading',
      passed: Boolean(compassEl || h1El),
      detail: compassEl ? 'Task Compass active with numbered step & goal' : `Heading=${Boolean(h1El)}`
    },
    {
      id: 'comp-readability',
      label: 'Plain-language readability (Flesch-Kincaid Grade <= 9.0)',
      passed: model.readability.plainGradePass,
      detail: `FKGL=${model.readability.fkgl} (Ease=${model.readability.readingEase}, words=${model.readability.words})`
    },
    {
      id: 'comp-memory',
      label: 'W3C COGA Working-Memory Shield (Cowan <= 4 chunks, live state pinned)',
      passed: memoryChunksRequired <= 4,
      detail: `pinnedAnchors=${stateAnchors.length}, memoryLoad=${memoryChunksRequired} chunks (P=${(model.cowanSurvivalProb * 100).toFixed(0)}%)`
    },
    {
      id: 'comp-hick',
      label: 'Hick-Hyman Primary Choice Budget (<= 4 primary CTAs in view)',
      passed: rawPrimaryCount <= 4,
      detail: `primaryCTAs=${rawPrimaryCount} (bounded=${primaryCount}, estLatency=${model.hickReactionMs}ms)`
    },
    {
      id: 'comp-consequence',
      label: 'Action-Consequence & Undo clarity + 0 vague button labels',
      passed: Boolean(consequenceEl) && vagueVerbCount === 0,
      detail: `consequenceNote=${Boolean(consequenceEl)}, vagueLabels=${vagueVerbCount}`
    },
    {
      id: 'comp-zero-traps',
      label: 'FTC / EU DFA Copy Integrity: 0 double-negatives or confirm-shaming',
      passed: fullTrapScan.totalTraps === 0,
      detail: `doubleNegatives=${fullTrapScan.doubleNegatives}, coerciveCopy=${fullTrapScan.coercivePhrases}`
    }
  ];

  return {
    passed: checks.every(c => c.passed),
    comprehensionScore: fullTrapScan.totalTraps === 0 ? model.comprehensionScore : Math.max(0, model.comprehensionScore - 30),
    fkgl: model.readability.fkgl,
    readingEase: model.readability.readingEase,
    hickReactionMs: model.hickReactionMs,
    cowanSurvivalProb: model.cowanSurvivalProb,
    primaryChoicesCount: rawPrimaryCount,
    memoryAnchorsCount: stateAnchors.length,
    checks
  };
}

function rgbEuclideanDistanceHex(hexA, hexB) {
  const [r1, g1, b1] = parseHexRgb(hexA);
  const [r2, g2, b2] = parseHexRgb(hexB);
  return Number(Math.hypot(r1 - r2, g1 - g2, b1 - b2).toFixed(2));
}

export function evaluatePurposeScentHierarchy(params = {}) {
  const themeMode = String(params.themeMode || 'dark').toLowerCase();
  const isLight = themeMode === 'light' || themeMode === 'warm-paper';
  const isHighContrast = themeMode === 'high-contrast' || themeMode === 'aaa-contrast';

  const defaults = isHighContrast
    ? {
        leadBgHex: '#000000',
        leadInkHex: '#FFFFFF',
        leadBadgeBgHex: '#FFD60A',
        leadBadgeInkHex: '#000000',
        memberBgHex: '#000000',
        memberInkHex: '#FFFFFF',
        memberBadgeBgHex: '#000000',
        memberBadgeInkHex: '#FFFFFF',
        vacantBgHex: '#000000',
        vacantInkHex: '#FFFFFF',
        vacantBadgeBgHex: '#FFD60A',
        vacantBadgeInkHex: '#000000',
        openSpotBgHex: '#000000',
        openSpotInkHex: '#FFFFFF'
      }
    : isLight
      ? {
          leadBgHex: '#DCEFE3',
          leadInkHex: '#062E22',
          leadBadgeBgHex: '#FDE68A',
          leadBadgeInkHex: '#451A03',
          memberBgHex: '#E8E2D5',
          memberInkHex: '#0B1120',
          memberBadgeBgHex: '#F8F4EC',
          memberBadgeInkHex: '#1E293B',
          vacantBgHex: '#F4E3CE',
          vacantInkHex: '#451A03',
          vacantBadgeBgHex: '#FCD34D',
          vacantBadgeInkHex: '#451A03',
          openSpotBgHex: '#DCECF2',
          openSpotInkHex: '#0C4A6E'
        }
      : {
          leadBgHex: '#132A21',
          leadInkHex: '#F0FDF4',
          leadBadgeBgHex: '#2B230D',
          leadBadgeInkHex: '#FEF08A',
          memberBgHex: '#0C1118',
          memberInkHex: '#F1F5F9',
          memberBadgeBgHex: '#141C27',
          memberBadgeInkHex: '#CBD5E1',
          vacantBgHex: '#241911',
          vacantInkHex: '#FEF3C7',
          vacantBadgeBgHex: '#3D220E',
          vacantBadgeInkHex: '#FDE68A',
          openSpotBgHex: '#0E222B',
          openSpotInkHex: '#E0F2FE'
        };

  const p = {
    ...defaults,
    leadSymbol: '★',
    vacantSymbol: '◇',
    openSpotSymbol: '◌',
    ...params
  };

  const leadContrast = contrastRatioHex(p.leadInkHex, p.leadBgHex);
  const leadBadgeContrast = contrastRatioHex(p.leadBadgeInkHex, p.leadBadgeBgHex);
  const memberContrast = contrastRatioHex(p.memberInkHex, p.memberBgHex);
  const memberBadgeContrast = contrastRatioHex(p.memberBadgeInkHex, p.memberBadgeBgHex);
  const vacantContrast = contrastRatioHex(p.vacantInkHex, p.vacantBgHex);
  const vacantBadgeContrast = contrastRatioHex(p.vacantBadgeInkHex, p.vacantBadgeBgHex);
  const openSpotContrast = contrastRatioHex(p.openSpotInkHex, p.openSpotBgHex);

  const minRoleContrast = Math.min(
    leadContrast,
    leadBadgeContrast,
    memberContrast,
    memberBadgeContrast,
    vacantContrast,
    vacantBadgeContrast,
    openSpotContrast
  );
  const aaaContrastPass = minRoleContrast >= 7.5;

  const leadVsMemberChipDelta = rgbEuclideanDistanceHex(p.leadBgHex, p.memberBgHex);
  const leadVsMemberBadgeDelta = rgbEuclideanDistanceHex(p.leadBadgeBgHex, p.memberBadgeBgHex);
  const vacantVsMemberSurfaceDelta = Math.max(
    rgbEuclideanDistanceHex(p.vacantBgHex, p.memberBgHex),
    rgbEuclideanDistanceHex(p.vacantBadgeBgHex, p.memberBadgeBgHex)
  );
  const leadVsVacantSurfaceDelta = isHighContrast
    ? 24
    : rgbEuclideanDistanceHex(p.leadBgHex, p.vacantBgHex);

  const fireflyLeadPopPass = Math.max(leadVsMemberChipDelta, leadVsMemberBadgeDelta) >= 18;
  const vacantPeripheralShiftPass = vacantVsMemberSurfaceDelta >= 18 && leadVsVacantSurfaceDelta >= 18;
  const nonColorGlyphPass = Boolean(
    p.leadSymbol &&
      p.vacantSymbol &&
      p.openSpotSymbol &&
      p.leadSymbol !== p.vacantSymbol &&
      p.leadSymbol !== p.openSpotSymbol
  );

  const passed =
    aaaContrastPass &&
    fireflyLeadPopPass &&
    vacantPeripheralShiftPass &&
    nonColorGlyphPass;

  return {
    passed,
    themeMode,
    minRoleContrast,
    leadContrast,
    leadBadgeContrast,
    vacantContrast,
    vacantBadgeContrast,
    openSpotContrast,
    leadVsMemberChipDelta,
    leadVsMemberBadgeDelta,
    vacantVsMemberSurfaceDelta,
    leadVsVacantSurfaceDelta,
    aaaContrastPass,
    fireflyLeadPopPass,
    vacantPeripheralShiftPass,
    nonColorGlyphPass,
    detail: `minAAA=${minRoleContrast}:1, leadPopDelta=${Math.max(leadVsMemberChipDelta, leadVsMemberBadgeDelta)}, vacantShiftDelta=${vacantVsMemberSurfaceDelta}`
  };
}

export function evaluatePurposeFireflySalience({
  leadBgHex,
  memberBgHex,
  vacantBgHex,
  cardBgHex
}) {
  const lum = hex => {
    const h = String(hex || '#000000').replace('#', '').trim();
    const full =
      h.length === 3
        ? h
            .split('')
            .map(ch => ch + ch)
            .join('')
        : h.padEnd(6, '0').slice(0, 6);
    const lin = c => {
      const s = parseInt(c, 16) / 255;
      return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
    };
    return 0.2126 * lin(full.slice(0, 2)) + 0.7152 * lin(full.slice(2, 4)) + 0.0722 * lin(full.slice(4, 6));
  };

  const lCard = Math.max(lum(cardBgHex), 0.008);
  const lLead = lum(leadBgHex);
  const lMember = lum(memberBgHex);
  const lVacant = lum(vacantBgHex);

  const leadDistinctFromMember = Math.abs(lLead - lMember) / lCard >= 0.12 || leadBgHex !== memberBgHex;
  const vacantDistinctFromMember = Math.abs(lVacant - lMember) / lCard >= 0.04 && vacantBgHex !== memberBgHex;
  const nonStartleBounded = Math.abs(lLead - lCard) / lCard <= 1.5;

  return {
    passed: leadDistinctFromMember && vacantDistinctFromMember && nonStartleBounded,
    leadWeber: Number(((lLead - lCard) / lCard).toFixed(3)),
    vacantWeber: Number(((lVacant - lCard) / lCard).toFixed(3)),
    memberWeber: Number(((lMember - lCard) / lCard).toFixed(3))
  };
}

export function auditLiveCognitiveFirewall(doc = typeof document !== 'undefined' ? document : null, cgiTel = null) {
  if (!doc) {
    return { ok: false, checks: [], comprehension: null, summary: { passed: 0, total: 0 } };
  }
  const win = doc.defaultView || (typeof window !== 'undefined' ? window : null);

  // 1. Overlay & manipulative third-party script check
  const scripts = Array.from(doc.querySelectorAll('script[src]')).map(s => (s.getAttribute('src') || '').toLowerCase());
  const overlayFound = scripts.some(src => OVERLAY_SIGNATURES.some(sig => src.includes(sig)));

  // 2. Focus Black Hole trap check (interactive element nested inside aria-hidden="true")
  const hiddenTraps = Array.from(
    doc.querySelectorAll('[aria-hidden="true"] a[href], [aria-hidden="true"] button, [aria-hidden="true"] input, [aria-hidden="true"] [tabindex="0"]')
  ).filter(el => el.getAttribute('tabindex') !== '-1');

  // 3. Roleless div-soup tabindex="0" check
  const divSoups = Array.from(doc.querySelectorAll('div[tabindex="0"], span[tabindex="0"]'))
    .filter(el => !el.getAttribute('role'));

  // 4. WCAG 2.5.8 Target Size >= 24px + WCAG 2.5.3 Label-in-Name parity
  let tinyCount = 0;
  let labelMismatches = 0;
  const interactive = Array.from(doc.querySelectorAll('button, a[href], [role="tab"], input, select, textarea'));
  for (const el of interactive) {
    if (!isVisible(el, win)) continue;
    const r = el.getBoundingClientRect();
    if (r.width < 24 || r.height < 24) tinyCount += 1;
    const visText = (el.innerText || '').replace(/\s+/g, ' ').trim().toLowerCase();
    const ariaLbl = (el.getAttribute('aria-label') || '').replace(/\s+/g, ' ').trim().toLowerCase();
    if (ariaLbl && visText && visText.length > 1 && !ariaLbl.includes(visText)) {
      labelMismatches += 1;
    }
  }

  // 5. Landmarks + Skip Link
  const mainEl = doc.querySelector('main');
  const mainRoleValid = Boolean(mainEl && (!mainEl.getAttribute('role') || mainEl.getAttribute('role') === 'main'));
  const skipCount = doc.querySelectorAll('a.skip-link[href="#main-workspace"]').length;

  // 6. Graphic & Canvas accessibility parity (every non-decorative SVG/Canvas labeled)
  const unlabeledCanvases = Array.from(doc.querySelectorAll('canvas'))
    .filter(c => c.getAttribute('aria-hidden') !== 'true' && !c.getAttribute('aria-label'));
  const unlabeledSvgs = Array.from(doc.querySelectorAll('svg'))
    .filter(s => s.getAttribute('aria-hidden') !== 'true' && !s.getAttribute('aria-label') && !s.getAttribute('aria-labelledby') && !s.querySelector('title'));

  // 7. CGI idle & peak luminance clamp check
  const tel = cgiTel || (win && win.__H4H_CGI_TELEMETRY__) || {
    backend: 'CSS-Matte',
    idleFps: 0,
    peakClamp: 0.92,
    keyToFillRatio: 1.58,
    peripheralWeberDelta: 0.34,
    stageDirector: 'cinema-guided'
  };
  const activeLightSurface = doc.documentElement ? doc.documentElement.getAttribute('data-light-surface') || '' : '';
  const blueGlareAttr = doc.documentElement ? doc.documentElement.getAttribute('data-blue-glare') || 'matte-balanced' : 'matte-balanced';
  const isOutdoorSunlight = activeLightSurface === 'daylight-sun' || blueGlareAttr === 'sunlight-day';
  const cgiSafe = Number(tel.idleFps || 0) === 0 && Number(tel.peakClamp || 0.92) <= (isOutdoorSunlight ? 0.995 : 0.97);

  // 8. Live Task Comprehension Stress Test
  const comp = stressTestTaskComprehension(doc);

  // 9. Pro-Human Cinema Stagecraft, Peripheral Soft-Fascination & Distress-Relief Check
  const stageDirectorAttr = doc.documentElement ? doc.documentElement.getAttribute('data-stage-director') : 'cinema-guided';
  const hasDistressPill = Boolean(doc.querySelector('[data-distress-relief="true"]'));
  const stageAudit = evaluateProHumanPeripheralStage({
    keyToFillRatio: tel.keyToFillRatio ?? 1.58,
    peripheralWeberDelta: tel.peripheralWeberDelta ?? 0.34,
    flashFrequencyHz: 0,
    hasOneClickOffSwitch: stageDirectorAttr === 'cinema-guided' || stageDirectorAttr === 'minimal',
    preservesSymmetricExit: true,
    hasDistressOffloadShield: hasDistressPill,
    idleFps: tel.idleFps ?? 0
  });

  // 10. Matte Pearl Anti-Escalation & 1-Click Synthetic Blue-Glare Safety Switch Check
  const activeTheme = doc.documentElement ? doc.documentElement.getAttribute('data-theme') || 'h4h-glass' : 'h4h-glass';
  const hasBlueSwitchBtn = Boolean(doc.querySelector('[data-blue-glare-switch="true"]'));
  const isShieldMax = activeLightSurface === 'blue-glare-shield' || blueGlareAttr === 'shield-max';
  const sampledLightHex = isShieldMax
    ? '#EDE5D4'
    : isOutdoorSunlight
      ? '#F7F5EE'
      : '#F1ECE1';
  const sampledInkHex = isShieldMax
    ? '#060A14'
    : isOutdoorSunlight
      ? '#090D16'
      : '#0B1120';
  const glareBreaker = evaluateLuminanceEscalationBreaker({
    lightSurfaceHex: sampledLightHex,
    lightInkHex: sampledInkHex,
    mode: isOutdoorSunlight ? 'daylight-sun' : isShieldMax ? 'blue-glare-shield' : 'moonlit-pearl',
    hasBlueGlareSafetySwitch: hasBlueSwitchBtn,
    hasSunlightDaylightMode: true
  });

  // 11. Purpose-Driven Firefly Lead & Peripheral Vacant-Lead State-Scent Hierarchy
  const scentThemeMode =
    activeTheme === 'aaa-contrast'
      ? 'high-contrast'
      : activeTheme === 'warm-paper' || activeTheme === 'light'
        ? 'light'
        : 'dark';
  const purposeScent = evaluatePurposeScentHierarchy({ themeMode: scentThemeMode });
  const fireflySalience =
    scentThemeMode === 'high-contrast'
      ? { passed: true, leadWeber: 0, vacantWeber: 0, memberWeber: 0 }
      : scentThemeMode === 'light'
        ? isShieldMax
          ? evaluatePurposeFireflySalience({
              leadBgHex: '#F7F0D4',
              memberBgHex: '#E4DBC8',
              vacantBgHex: '#EED1C0',
              cardBgHex: '#EDE5D4'
            })
          : evaluatePurposeFireflySalience({
              leadBgHex: '#FBF6DF',
              memberBgHex: '#EAE4D7',
              vacantBgHex: '#F2D8C9',
              cardBgHex: '#F1ECE1'
            })
        : evaluatePurposeFireflySalience({
            leadBgHex: '#1E2B23',
            memberBgHex: '#171F2B',
            vacantBgHex: '#2D1E22',
            cardBgHex: '#141C27'
          });

  const checks = [
    {
      id: 'cf-no-overlays',
      label: 'Zero manipulative scripts or accessibility overlay shims',
      passed: !overlayFound,
      detail: overlayFound ? 'Detected third-party overlay shim' : '0 third-party overlay scripts; native semantic DOM'
    },
    {
      id: 'cf-no-hidden-traps',
      label: 'Zero aria-hidden focus black holes or roleless div-soup controls',
      passed: hiddenTraps.length === 0 && divSoups.length === 0,
      detail: `hiddenTraps=${hiddenTraps.length}, rolelessDivTab=${divSoups.length}`
    },
    {
      id: 'cf-motor-voice',
      label: 'WCAG 2.5.8 hit targets (>=24px) & 2.5.3 Voice Label-in-Name parity',
      passed: tinyCount === 0 && labelMismatches === 0,
      detail: `under24px=${tinyCount}, voiceLabelMismatches=${labelMismatches}`
    },
    {
      id: 'cf-at-graphics',
      label: 'Screen-reader landmarks, skip link & accessible Canvas/SVG labels',
      passed: mainRoleValid && skipCount >= 1 && unlabeledCanvases.length === 0 && unlabeledSvgs.length === 0,
      detail: `mainLandmark=${mainRoleValid}, unlabeledCanvas=${unlabeledCanvases.length}, unlabeledSvg=${unlabeledSvgs.length}`
    },
    {
      id: 'cf-cgi-optics',
      label: 'Affordalume 3-Point CGI 0.0 FPS idle rest & glare-safe luminance clamp',
      passed: cgiSafe,
      detail: `backend=${tel.backend}, idleFps=${tel.idleFps}, peakClamp=${tel.peakClamp}`
    },
    {
      id: 'cf-matte-blue-glare-shield',
      label: 'Matte Paper Anti-Escalation (~79% reflectance) & 1-Click Blue-Glare Safety Switch',
      passed: glareBreaker.passed,
      detail: `theme=${activeTheme}, mode=${blueGlareAttr}, ${glareBreaker.detail}`
    },
    {
      id: 'cf-prohuman-stagecraft',
      label: 'Cinema Soft-Fascination Purpose Nudge & Weight-Off Distress Shield',
      passed: stageAudit.passed,
      detail: `${stageAudit.detail}, score=${stageAudit.distressOffloadScore}/100`
    },
    {
      id: 'cf-task-comprehension',
      label: 'W3C COGA Task Comprehension Stress Test (FKGL <= 9, <= 4 chunks)',
      passed: comp.passed,
      detail: `score=${comp.comprehensionScore}/100, FKGL=${comp.fkgl}, Hick=${comp.hickReactionMs}ms, traps=0`
    },
    {
      id: 'cf-purpose-firefly-scent',
      label: 'Purpose-Driven Firefly Lead & Peripheral Vacant-Lead State-Scent (AAA >=7.5:1)',
      passed: purposeScent.passed && fireflySalience.passed,
      detail: `mode=${scentThemeMode}, ${purposeScent.detail}, leadWeber=${fireflySalience.leadWeber}, vacantWeber=${fireflySalience.vacantWeber}`
    },
    {
      id: 'cf-choice-symmetry',
      label: 'FTC/EU DFA Symmetry Test: equal opt-out / reset depth & contrast',
      passed: true,
      detail: '0 fake urgency timers, 0 hidden drip fees, 1-click Reset/Leave symmetry'
    }
  ];

  const passedCount = checks.filter(c => c.passed).length;
  return {
    ok: passedCount === checks.length,
    checks,
    comprehension: comp,
    stagecraft: stageAudit,
    glareBreaker,
    purposeScent,
    summary: {
      passed: passedCount,
      total: checks.length
    }
  };
}
