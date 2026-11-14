import test from 'node:test';
import assert from 'node:assert/strict';
import {
  contrastRatioHex,
  computeReadabilityMetrics,
  detectDeceptiveCopyPatterns,
  computeComprehensionModels,
  evaluateProHumanPeripheralStage,
  evaluateLuminanceEscalationBreaker,
  evaluatePurposeScentHierarchy,
  evaluatePurposeFireflySalience
} from '../web/src/cognitive-firewall.js';
import {
  FLASHLIGHT_TINTS,
  FLASHLIGHT_POWERS,
  LIGHT_SURFACE_MODES,
  AFFORDALUME_FRAGMENT_SHADER,
  resolveStageOpticalUniforms,
  CVD_MODE_OPTIONS,
  STAGE_DIRECTOR_OPTIONS,
  BLUE_GLARE_OPTIONS,
  DISABILITY_PRESETS,
  getLightSurfaceSpec,
  detectOsDefaults
} from '../web/src/ergonomics.js';

function srgbChannelLinear(c8) {
  const s = c8 / 255;
  return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

function relativeLuminanceHex(hex) {
  const h = hex.replace('#', '');
  const r = srgbChannelLinear(parseInt(h.slice(0, 2), 16));
  const g = srgbChannelLinear(parseInt(h.slice(2, 4), 16));
  const b = srgbChannelLinear(parseInt(h.slice(4, 6), 16));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function linearBluePowerHex(hex) {
  const h = hex.replace('#', '');
  return srgbChannelLinear(parseInt(h.slice(4, 6), 16));
}

test('Affordalume multi-shade flashlight + Matte Pearl / Blue-Glare Shield / Daylight modes preserve WCAG AAA & optical lift', () => {
  assert.ok(FLASHLIGHT_TINTS.length >= 6);
  assert.equal(LIGHT_SURFACE_MODES.length, 3);
  assert.ok(AFFORDALUME_FRAGMENT_SHADER.includes('u_blueGlareClamp'));

  // 1. Dark Matte stage check (>= 9.5:1 across all 6 tints)
  for (const tint of FLASHLIGHT_TINTS) {
    const darkContrast = contrastRatioHex('#E6EDF3', '#121821', tint.hex, 0.14);
    assert.ok(
      darkContrast >= 9.5,
      `Expected ${tint.id} dark matte contrast >= 9.5:1, got ${darkContrast}`
    );
  }

  // 2. Light Surface Modes: AAA contrast (>=14.5:1 primary, >=7.0:1 muted) + Negative-Fill headroom
  for (const mode of LIGHT_SURFACE_MODES) {
    const yRest = relativeLuminanceHex(mode.cardRestHex);
    const yActive = relativeLuminanceHex(mode.cardActiveHex);

    assert.ok(
      yActive - yRest >= 0.05,
      `Expected ${mode.id} active Affordalume card to have >= +0.05 luminance lift over resting card, got ${yActive - yRest}`
    );

    const mutedRestContrast = contrastRatioHex(mode.inkMutedHex, mode.cardRestHex, mode.cardRestHex, 0);
    assert.ok(
      mutedRestContrast >= 7.0,
      `Expected ${mode.id} muted ink WCAG AAA >= 7.0:1, got ${mutedRestContrast}`
    );

    for (const tint of FLASHLIGHT_TINTS) {
      const restBeamContrast = contrastRatioHex(mode.inkHex, mode.cardRestHex, tint.hex, 0.08);
      const activeBeamContrast = contrastRatioHex(mode.inkHex, mode.cardActiveHex, tint.hex, 0.08);

      assert.ok(
        restBeamContrast >= 14.5,
        `Expected ${mode.id} resting card + ${tint.id} >= 14.5:1, got ${restBeamContrast}`
      );
      assert.ok(
        activeBeamContrast >= 14.5,
        `Expected ${mode.id} active card + ${tint.id} >= 14.5:1, got ${activeBeamContrast}`
      );
    }

    const uniforms = resolveStageOpticalUniforms({
      themeMode: 'light',
      lightSurface: mode.id,
      tintHex: FLASHLIGHT_TINTS[0].hex,
      beamPowerAlpha: 0.08,
      affordalumeEnabled: true
    });
    assert.equal(uniforms.bypassWebGl, false);
    assert.equal(uniforms.u_blueGlareClamp, getLightSurfaceSpec(mode.id).blueGlareClamp);
    assert.equal(uniforms.u_peakClamp, getLightSurfaceSpec(mode.id).peakLuminanceClamp);
  }

  // 3. Verify indoor matte & Blue-Glare Shield genuinely attenuate 450nm linear blue emission vs #FFFFFF
  const pearlBlueCut = 1 - linearBluePowerHex('#F1ECE1');
  const shieldBlueCut = 1 - linearBluePowerHex('#EDE5D4');
  assert.ok(pearlBlueCut >= 0.24, `Expected Moonlit Pearl blue cut >= 24%, got ${pearlBlueCut}`);
  assert.ok(shieldBlueCut >= 0.33, `Expected Blue-Glare Shield blue cut >= 33%, got ${shieldBlueCut}`);
});

test('Affordalume multi-shade flashlight preserves WCAG AAA (>=9.5:1 dark, >=12.5:1 matte daylight paper)', () => {
  assert.ok(FLASHLIGHT_TINTS.length >= 6);
  for (const tint of FLASHLIGHT_TINTS) {
    const darkContrast = contrastRatioHex('#E6EDF3', '#121821', tint.hex, 0.14);
    assert.ok(
      darkContrast >= 9.5,
      `Expected ${tint.id} dark matte contrast >= 9.5:1, got ${darkContrast}`
    );

    const lightContrast = contrastRatioHex('#0F172A', '#EAE6DD', tint.hex, 0.065);
    assert.ok(
      lightContrast >= 12.5,
      `Expected ${tint.id} matte daylight contrast >= 12.5:1, got ${lightContrast}`
    );
  }
});

test('Synchronicity Task Comprehension Stress Test passes plain-language steps and blocks deceptive copy', () => {
  const stepGuides = [
    'Browse open teams below. Pick one team to inspect its spots and skills. Safe to explore: clicking a team only previews it. You have not joined yet.',
    'Test if your team has the right skills and waking hours to finish every task on time. Local preview only: testing schedules here never locks spots on the server.',
    'Join an open team spot on the server, create a single-use invite, or leave cleanly. Server action with 1-click exit: you can leave a team or switch roles at any time.',
    'Run the 50-person race test or check the live Cognitive Firewall and Comprehension score. Isolated test sandbox: running a race test uses a temporary test team.'
  ];

  for (const copy of stepGuides) {
    const model = computeComprehensionModels({
      text: copy,
      primaryChoicesCount: 2,
      memoryChunksRequired: 2,
      hasConsequencePreview: true,
      vagueVerbCount: 0
    });
    assert.equal(model.passed, true, `Expected step copy to pass comprehension: ${copy}`);
    assert.ok(model.readability.fkgl <= 8.5, `Expected FKGL <= 8.5, got ${model.readability.fkgl}`);
    assert.ok(model.cowanSurvivalProb >= 0.9, `Expected Cowan survival >= 0.90, got ${model.cowanSurvivalProb}`);
    assert.ok(model.hickReactionMs <= 530, `Expected Hick reaction <= 530ms, got ${model.hickReactionMs}`);
    assert.equal(model.copyTraps.totalTraps, 0);
    assert.equal(model.comprehensionScore, 100);
  }

  const darkSample =
    'Do not uncheck this box if you do not wish to opt out of recurring non-essential promotional continuation enrollments. No thanks, I prefer paying full price! Hurry! 19 people are viewing this offer.';
  const darkModel = computeComprehensionModels({
    text: darkSample,
    primaryChoicesCount: 18,
    memoryChunksRequired: 8,
    hasConsequencePreview: false,
    vagueVerbCount: 4
  });

  assert.equal(darkModel.passed, false);
  assert.ok(darkModel.copyTraps.doubleNegatives >= 1);
  assert.ok(darkModel.copyTraps.coercivePhrases >= 2);
  assert.ok(darkModel.cowanSurvivalProb < 0.01);
  assert.ok(darkModel.hickReactionMs >= 800);
  assert.ok(darkModel.comprehensionScore <= 25);

  const metrics = computeReadabilityMetrics('Pick one team. Check open spots.');
  assert.ok(metrics.fkgl <= 4.0);
  const traps = detectDeceptiveCopyPatterns('Uncheck if you do not want updates.');
  assert.equal(traps.doubleNegatives, 1);
});

test('Disability & Comprehension presets expose COGA, Migraine, Dyslexia, CVD, and Low-Vision modes', () => {
  const defaults = detectOsDefaults();
  assert.equal(defaults.taskGuide, true);
  assert.equal(defaults.flashlightTint, 'emerald');
  assert.ok(FLASHLIGHT_POWERS.some(p => p.id === 'balanced'));
  assert.ok(CVD_MODE_OPTIONS.some(c => c.id === 'cvd-safe'));
  assert.ok(CVD_MODE_OPTIONS.some(c => c.id === 'sim-achrom'));
  assert.ok(DISABILITY_PRESETS.some(p => p.id === 'cinema-joy-relief'));
  assert.ok(DISABILITY_PRESETS.some(p => p.id === 'coga-comprehension'));
  assert.ok(DISABILITY_PRESETS.some(p => p.id === 'migraine-purkinje'));
  assert.ok(DISABILITY_PRESETS.some(p => p.id === 'dyslexia-comfort'));
  assert.ok(DISABILITY_PRESETS.some(p => p.id === 'cvd-safe-lens'));
  assert.ok(DISABILITY_PRESETS.some(p => p.id === 'low-vision-aaa'));
  assert.ok(STAGE_DIRECTOR_OPTIONS.some(s => s.id === 'cinema-guided'));
  assert.ok(STAGE_DIRECTOR_OPTIONS.some(s => s.id === 'minimal'));
});

test('Pro-Human Cinema 3-Point Stagecraft passes Soft-Fascination purpose beacons and blocks startle/asymmetric nudges', () => {
  const healthyStage = evaluateProHumanPeripheralStage({
    keyToFillRatio: 1.58,
    peripheralWeberDelta: 0.34,
    flashFrequencyHz: 0,
    hasOneClickOffSwitch: true,
    preservesSymmetricExit: true,
    hasDistressOffloadShield: true,
    idleFps: 0
  });
  assert.equal(healthyStage.passed, true);
  assert.equal(healthyStage.distressOffloadScore, 100);
  assert.equal(healthyStage.softFascinationPass, true);
  assert.equal(healthyStage.ethicalSymmetryPass, true);

  const predatoryHijack = evaluateProHumanPeripheralStage({
    keyToFillRatio: 9.2,
    peripheralWeberDelta: 0.85,
    flashFrequencyHz: 4.5,
    hasOneClickOffSwitch: false,
    preservesSymmetricExit: false,
    hasDistressOffloadShield: false,
    idleFps: 60
  });
  assert.equal(predatoryHijack.passed, false);
  assert.equal(predatoryHijack.softFascinationPass, false);
  assert.equal(predatoryHijack.ethicalSymmetryPass, false);
  assert.ok(predatoryHijack.distressOffloadScore <= 15);
});

test('Matte Daylight Paper & Synthetic Blue-Glare Safety Switch break piercing #FFFFFF luminance escalation', () => {
  assert.ok(BLUE_GLARE_OPTIONS.some(b => b.id === 'matte-balanced'));
  assert.ok(BLUE_GLARE_OPTIONS.some(b => b.id === 'shield-max'));
  assert.ok(BLUE_GLARE_OPTIONS.some(b => b.id === 'sunlight-day'));
  assert.ok(DISABILITY_PRESETS.some(p => p.id === 'matte-daylight-shield'));

  const mattePaper = evaluateLuminanceEscalationBreaker({
    lightSurfaceHex: '#EAE6DD',
    lightInkHex: '#0F172A',
    mode: 'matte-balanced',
    hasBlueGlareSafetySwitch: true,
    hasSunlightDaylightMode: true
  });
  assert.equal(mattePaper.passed, true);
  assert.ok(mattePaper.relLuminance <= 0.80 && mattePaper.relLuminance >= 0.78);
  assert.ok(mattePaper.maxChannelNorm <= 0.92);
  assert.ok(mattePaper.blueSpikeReductionPct >= 27.0);
  assert.ok(mattePaper.melanopicReductionPct >= 25.0);
  assert.ok(mattePaper.primaryInkContrast >= 14.0);
  assert.equal(mattePaper.rayleighBlueScatterRatio, 2.12);

  const shieldMax = evaluateLuminanceEscalationBreaker({
    lightSurfaceHex: '#E6DECD',
    lightInkHex: '#0F172A',
    mode: 'shield-max',
    hasBlueGlareSafetySwitch: true,
    hasSunlightDaylightMode: true
  });
  assert.equal(shieldMax.passed, true);
  assert.ok(shieldMax.blueSpikeReductionPct >= 38.5);
  assert.ok(shieldMax.melanopicReductionPct >= 35.0);
  assert.ok(shieldMax.primaryInkContrast >= 13.0);

  const sunlightDay = evaluateLuminanceEscalationBreaker({
    lightSurfaceHex: '#F3F1EC',
    lightInkHex: '#0F172A',
    mode: 'sunlight-day',
    hasBlueGlareSafetySwitch: true,
    hasSunlightDaylightMode: true,
    ambientLux: 40000,
    displayPeakNits: 600,
    surfaceDiffuseReflectance: 0.012
  });
  assert.equal(sunlightDay.passed, true);
  assert.ok(sunlightDay.blueSpikeReductionPct >= 16.0);
  assert.ok(sunlightDay.primaryInkContrast >= 15.5);
  assert.ok(sunlightDay.ambientContrastRatio >= 3.0);

  const piercingPureWhite = evaluateLuminanceEscalationBreaker({
    lightSurfaceHex: '#FFFFFF',
    lightInkHex: '#0F172A',
    mode: 'matte-balanced',
    hasBlueGlareSafetySwitch: false,
    hasSunlightDaylightMode: false
  });
  assert.equal(piercingPureWhite.passed, false);
  assert.equal(piercingPureWhite.matteReflectancePass, false);
  assert.equal(piercingPureWhite.blueSpikeReductionPct, 0);
});

test('Purpose-Driven Firefly Lead & Peripheral Vacant-Lead State-Scent maintains AAA contrast while rejecting flat undifferentiated pills', () => {
  const darkFirefly = evaluatePurposeScentHierarchy({ themeMode: 'dark' });
  assert.equal(darkFirefly.passed, true, `dark mode failed: ${darkFirefly.detail}`);
  assert.ok(darkFirefly.minRoleContrast >= 7.5, `expected AAA >= 7.5:1, got ${darkFirefly.minRoleContrast}`);
  assert.equal(darkFirefly.fireflyLeadPopPass, true);
  assert.equal(darkFirefly.vacantPeripheralShiftPass, true);
  assert.equal(darkFirefly.nonColorGlyphPass, true);

  const lightMatteFirefly = evaluatePurposeScentHierarchy({ themeMode: 'light' });
  assert.equal(lightMatteFirefly.passed, true, `light matte failed: ${lightMatteFirefly.detail}`);
  assert.ok(lightMatteFirefly.minRoleContrast >= 7.5, `expected AAA >= 7.5:1, got ${lightMatteFirefly.minRoleContrast}`);
  assert.equal(lightMatteFirefly.fireflyLeadPopPass, true);
  assert.equal(lightMatteFirefly.vacantPeripheralShiftPass, true);

  const highContrastFirefly = evaluatePurposeScentHierarchy({ themeMode: 'high-contrast' });
  assert.equal(highContrastFirefly.passed, true);
  assert.ok(highContrastFirefly.minRoleContrast >= 14.5);

  // Flat undifferentiated gray badges (legacy compliance-only pattern) must fail pre-attentive pop
  const flatUndifferentiated = evaluatePurposeScentHierarchy({
    themeMode: 'dark',
    leadBgHex: '#0C1118',
    leadBadgeBgHex: '#141C27',
    leadBadgeInkHex: '#CBD5E1',
    memberBgHex: '#0C1118',
    memberBadgeBgHex: '#141C27',
    vacantBgHex: '#0C1118',
    vacantBadgeBgHex: '#141C27'
  });
  assert.equal(flatUndifferentiated.passed, false);
  assert.equal(flatUndifferentiated.fireflyLeadPopPass, false);
  assert.equal(flatUndifferentiated.vacantPeripheralShiftPass, false);

  // Weber Salience Bounds across Dark, Moonlit Pearl, and Blue-Glare Shield (--firefly-* tokens)
  const darkSalience = evaluatePurposeFireflySalience({
    leadBgHex: '#1E2B23',
    memberBgHex: '#171F2B',
    vacantBgHex: '#2D1E22',
    cardBgHex: '#141C27'
  });
  assert.equal(darkSalience.passed, true);
  assert.ok(darkSalience.leadWeber > 0 && darkSalience.leadWeber <= 1.5);

  const pearlSalience = evaluatePurposeFireflySalience({
    leadBgHex: '#FBF6DF',
    memberBgHex: '#EAE4D7',
    vacantBgHex: '#F2D8C9',
    cardBgHex: '#F1ECE1'
  });
  assert.equal(pearlSalience.passed, true);
  assert.ok(pearlSalience.leadWeber > 0, 'lead pill lifts positively above Moonlit Pearl card');
  assert.ok(pearlSalience.memberWeber < 0, 'member pill recedes calmly below card');

  const shieldSalience = evaluatePurposeFireflySalience({
    leadBgHex: '#F7F0D4',
    memberBgHex: '#E4DBC8',
    vacantBgHex: '#EED1C0',
    cardBgHex: '#EDE5D4'
  });
  assert.equal(shieldSalience.passed, true);
  assert.ok(shieldSalience.leadWeber > 0 && shieldSalience.leadWeber <= 1.5);

  const collapsedVacancy = evaluatePurposeFireflySalience({
    leadBgHex: '#171F2B',
    memberBgHex: '#171F2B',
    vacantBgHex: '#171F2B',
    cardBgHex: '#141C27'
  });
  assert.equal(collapsedVacancy.passed, false);
});
