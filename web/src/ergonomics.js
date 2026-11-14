// PostSheet Workstation x Hack4Hack PS1 Spatial Ergonomics, Viewport Calibration & CRR Engine
export const STORAGE_KEY = 'h4h-ps1:ergonomics:v4';

export const THEME_OPTIONS = [
  {
    id: 'h4h-glass',
    shortLabel: 'Moonlight Dark',
    label: 'Moonlight Dark',
    subtitle: 'Steady #070a0e ground, 100% opaque #121821 matte reading cards & directional matte light',
    swatch: ['#070a0e', '#121821', '#66b389', '#e6edf3']
  },
  {
    id: 'aaa-contrast',
    shortLabel: 'High Contrast',
    label: 'High Contrast',
    subtitle: 'Pure #000000 ground, crisp #FFFFFF & #FFD60A outer cards/focus, calm #52525B inner dividers',
    swatch: ['#000000', '#09090B', '#FFD60A', '#FFFFFF']
  },
  {
    id: 'warm-paper',
    shortLabel: 'Moonlit Pearl',
    label: 'Moonlit Pearl (Light)',
    subtitle: 'Warm stone negative-fill #F1ECE1 matte cards (+0.066 #F8F4EC lift) on #E5DFD3 gutter; 0% indoor #FFFFFF glare',
    swatch: ['#E5DFD3', '#F1ECE1', '#1D6F7A', '#0B1120']
  },
  {
    id: 'petrol-glass',
    shortLabel: 'Petrol Deep',
    label: 'Petrol Deep Glass',
    subtitle: 'Oceanic petrol #06151C ground, opaque #0C1F29 reading cards & #64DFDF accents',
    swatch: ['#06151C', '#0C1F29', '#64DFDF', '#D6E7F0']
  },
  {
    id: 'obsidian-prism',
    shortLabel: 'Obsidian Prism',
    label: 'Obsidian Prism',
    subtitle: 'Twilight #090D18 ground, opaque #12192A reading cards, #5EEAD4 & #A78BFA accents',
    swatch: ['#090D18', '#12192A', '#5EEAD4', '#A78BFA']
  },
  {
    id: 'matte-slate',
    shortLabel: 'Calm Matte',
    label: 'Calm Matte Dark',
    subtitle: 'Zero-blur #11171D / #182129 flat engineering surface',
    swatch: ['#11171D', '#182129', '#38BDF8', '#DCE6EE']
  }
];

export const SCALE_OPTIONS = [
  {
    id: '60',
    label: '60% Panorama',
    shortLabel: '60% Panorama',
    px: 11.75,
    desc: 'Full 3-column command center (>=1100px desktop default)'
  },
  {
    id: '80',
    label: '80% Compact',
    shortLabel: '80% Compact',
    px: 13.4,
    desc: 'Compact IDE density with larger labels'
  },
  {
    id: '100',
    label: '100% Standard',
    shortLabel: '100% Standard',
    px: 16,
    desc: 'Standard 16px body scale (mobile default)'
  },
  {
    id: '115',
    label: '115% Large Text',
    shortLabel: '115% Large',
    px: 18.4,
    desc: 'Expanded reading text & generous spacing'
  }
];

export const DENSITY_OPTIONS = [
  {
    id: 'panoramic-3',
    label: '3-Column Panorama',
    desc: 'Full widescreen 44 / 28 / 28 overview: Active Step + Team Plan + Server Result'
  },
  {
    id: 'calm-focus',
    label: 'Single Focus',
    desc: 'Focused single-workspace view without side panorama columns'
  },
  {
    id: 'split-studio',
    label: '2-Column Split (58 / 42)',
    desc: 'Side-by-side workspace and live companion summary'
  },
  {
    id: 'compact',
    label: 'Compact Directory',
    desc: 'Tighter spacing inside single-workspace view'
  }
];

export const MOTION_OPTIONS = [
  {
    id: 'spring',
    label: 'Affordalume Shading',
    desc: 'Calm static rest; bounded 850ms handoff pulse & multi-shade matte flashlight on interaction'
  },
  {
    id: 'reduced',
    label: 'Reduced',
    desc: 'Instant layout transitions without arc travel'
  },
  {
    id: 'off',
    label: 'Static Off',
    desc: '100% static surfaces & zero animation frames'
  }
];

export const FLASHLIGHT_TINTS = [
  {
    id: 'emerald',
    shortLabel: 'Moonlight Sage',
    label: 'Moonlight Sage',
    hex: '#66B389',
    cssRgb: '102, 179, 137',
    lightCssRgb: '5, 150, 105',
    glRgb: [0.40, 0.70, 0.54],
    desc: 'Default low-fatigue emerald matte cone (11.99:1 text contrast preserved)',
    note: 'Default low-fatigue emerald matte cone (11.99:1 text contrast preserved)'
  },
  {
    id: 'amber',
    shortLabel: 'Night Amber',
    label: 'Purkinje Night Amber',
    hex: '#F59E0B',
    cssRgb: '245, 158, 11',
    lightCssRgb: '217, 119, 6',
    glRgb: [0.96, 0.62, 0.04],
    desc: 'Suppresses ~507nm blue/cyan rod halation for migraine, scotopic & sensory comfort',
    note: 'Suppresses ~507nm blue/cyan rod halation for migraine, scotopic & sensory comfort'
  },
  {
    id: 'cyan',
    shortLabel: 'Petrol Cyan',
    label: 'Petrol Horizon',
    hex: '#38BDF8',
    cssRgb: '56, 189, 248',
    lightCssRgb: '2, 132, 199',
    glRgb: [0.22, 0.74, 0.97],
    desc: 'Cool oceanic metrology halo aligned with Petrol & Slate surfaces',
    note: 'Cool oceanic metrology halo aligned with Petrol & Slate surfaces'
  },
  {
    id: 'violet',
    shortLabel: 'Twilight Violet',
    label: 'Twilight Violet',
    hex: '#A78BFA',
    cssRgb: '167, 139, 250',
    lightCssRgb: '124, 58, 237',
    glRgb: [0.65, 0.55, 0.98],
    desc: 'Balanced obsidian violet edge glow with >= 12.1:1 reading card contrast',
    note: 'Balanced obsidian violet edge glow with >= 12.1:1 reading card contrast'
  },
  {
    id: 'rose',
    shortLabel: 'Warm Rose',
    label: 'Warm Rose Dawn',
    hex: '#FB7185',
    cssRgb: '251, 113, 133',
    lightCssRgb: '190, 24, 93',
    glRgb: [0.98, 0.44, 0.52],
    desc: 'Gentle long-wavelength warm shading for bright sensitivity',
    note: 'Gentle long-wavelength warm shading for bright sensitivity'
  },
  {
    id: 'pearl',
    shortLabel: 'Neutral Silver',
    label: 'Neutral Silver',
    hex: '#CBD5E1',
    cssRgb: '203, 213, 225',
    lightCssRgb: '71, 85, 105',
    glRgb: [0.80, 0.84, 0.88],
    desc: 'Achromatic luminance-only beam for pure color-neutral focus',
    note: 'Achromatic luminance-only beam for pure color-neutral focus'
  }
];

export const FLASHLIGHT_POWERS = [
  { id: 'soft', label: 'Soft (8%)', cssAlpha: '0.08', glStrength: 0.10 },
  { id: 'balanced', label: 'Balanced (12%)', cssAlpha: '0.12', glStrength: 0.16 },
  { id: 'clear', label: 'Clear (16%)', cssAlpha: '0.16', glStrength: 0.22 },
  { id: 'off', label: 'Off', cssAlpha: '0', glStrength: 0.0 }
];

export const CVD_MODE_OPTIONS = [
  { id: 'none', label: 'Standard + Symbols', desc: 'Default palette with non-color geometric markers' },
  { id: 'cvd-safe', label: 'CVD Safe + Patterns', desc: 'Okabe-Ito luminance-stepped palette + SVG hatch patterns' },
  { id: 'sim-protan', label: 'Preview: Protanopia', desc: 'Simulate red-weak color perception to verify parity' },
  { id: 'sim-deutan', label: 'Preview: Deuteranopia', desc: 'Simulate green-weak color perception to verify parity' },
  { id: 'sim-tritan', label: 'Preview: Tritanopia', desc: 'Simulate blue-yellow color perception to verify parity' },
  { id: 'sim-achrom', label: 'Preview: Monochromacy', desc: 'Full 100% grayscale simulation proving zero color-only cues' }
];

export const STAGE_DIRECTOR_OPTIONS = [
  {
    id: 'cinema-guided',
    shortLabel: 'Cinema Purpose',
    label: 'Cinema 3-Point & Purpose Beacons',
    desc: 'Hollywood Key-Fill-Rim lighting, gentle peripheral purpose scent (Weber <= 0.38, 0 startle), and bounded 620ms completion bloom'
  },
  {
    id: 'minimal',
    shortLabel: 'Minimal Flat',
    label: 'Minimal Stage (1-Click Off-Switch)',
    desc: 'EU DFA 1-click off-switch: disables peripheral purpose beacons and completion blooms while keeping full functionality'
  }
];

export const LIGHT_SURFACE_MODES = [
  {
    id: 'moonlit-pearl',
    label: 'Moonlit Pearl (Matte)',
    shortLabel: 'Moonlit Pearl (Light)',
    gutterHex: '#E5DFD3',     // 34.9% linear blue cut vs #FFFFFF
    cardRestHex: '#F1ECE1',   // Y=0.841, 24.7% blue cut (Negative-fill peripheral rest)
    cardActiveHex: '#F8F4EC', // Y=0.907, +0.066 Affordalume optical lift on active card
    popoverHex: '#F6F2E9',
    inputHex: '#FAF7F0',
    inkHex: '#0B1120',        // 15.98:1 rest / 17.16:1 active AAA contrast
    inkMutedHex: '#334155',   // 8.79:1 AAA secondary contrast
    blueGlareClamp: 0.905,
    peakLuminanceClamp: 0.965,
    vignetteAlpha: 0.055,
    description: 'Warm stone negative-fill matte paper; eliminates raw #FFFFFF glare indoors.'
  },
  {
    id: 'blue-glare-shield',
    label: 'Blue-Glare Shield',
    shortLabel: 'Blue-Glare Shield',
    gutterHex: '#DDD5C4',     // 44.8% linear blue cut
    cardRestHex: '#EDE5D4',   // Y=0.788, 34.2% linear blue cut
    cardActiveHex: '#F4EDE0', // Y=0.852, +0.064 Affordalume optical lift
    popoverHex: '#F2EAD9',
    inputHex: '#F6EFE2',
    inkHex: '#060A14',        // >=15.05:1 rest / >=16.2:1 active AAA contrast across all 6 tints
    inkMutedHex: '#2D3A4B',   // 9.22:1 AAA secondary contrast
    blueGlareClamp: 0.840,
    peakLuminanceClamp: 0.940,
    vignetteAlpha: 0.075,
    description: 'Synthetic 450nm blue-glare safety clamp for LED fatigue, migraine, and pattern stress.'
  },
  {
    id: 'daylight-sun',
    label: 'Daylight Sun',
    shortLabel: 'Daylight Sun',
    gutterHex: '#ECE8DF',
    cardRestHex: '#F7F5EE',   // Y=0.913 high-transmittance outdoor base
    cardActiveHex: '#FDFCF8', // Y=0.973 outdoor active card
    popoverHex: '#FAF8F2',
    inputHex: '#FFFFFF',
    inkHex: '#090D16',        // 17.81:1 rest / 18.93:1 active AAA contrast
    inkMutedHex: '#1E293B',   // 13.41:1 AAA secondary contrast
    blueGlareClamp: 0.955,
    peakLuminanceClamp: 0.992,
    vignetteAlpha: 0.020,
    description: 'High-reflectance mode reserved for >10,000 lux direct sunlight.'
  }
];

export function getLightSurfaceSpec(surfaceId = 'moonlit-pearl') {
  if (surfaceId === 'shield-max') return LIGHT_SURFACE_MODES[1];
  if (surfaceId === 'sunlight-day') return LIGHT_SURFACE_MODES[2];
  return LIGHT_SURFACE_MODES.find((m) => m.id === surfaceId) || LIGHT_SURFACE_MODES[0];
}

export function applySurfaceThemeAttributes({ themeMode, lightSurface = 'moonlit-pearl' }) {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  root.dataset.theme = themeMode; // 'dark' | 'aaa-contrast' | 'light'
  if (themeMode === 'light' || themeMode === 'warm-paper') {
    root.dataset.lightSurface = lightSurface;
  } else {
    delete root.dataset.lightSurface;
  }
}

export const AFFORDALUME_FRAGMENT_SHADER = `#version 300 es
precision highp float;

in vec2 v_uv;
out vec4 outColor;

uniform vec2 u_resolution;
uniform vec2 u_pointerUv;       // Normalized [0..1] pointer or focused element center
uniform vec2 u_taskAnchorUv;    // Normalized [0..1] active column / task compass center
uniform vec3 u_canvasRgb;       // Matte ground color (#121821 dark or #E5DFD3 / #DDD5C4 light)
uniform vec3 u_beamTintRgb;     // Selected Affordalume tint (6 AAA-verified shades)
uniform float u_beamAlpha;      // 0.0 when Static Off, 0.06..0.14 when active
uniform float u_beamRadiusPx;   // Default 240.0px
uniform float u_vignetteAlpha;  // Peripheral magnocellular calm (0.02..0.075)
uniform float u_blueGlareClamp; // Caps 450nm subpixel overshoot (0.840 in Blue-Glare Shield)
uniform float u_peakClamp;      // Hard luminance ceiling (<= 0.92 dark, <= 0.965 matte light)

// Deterministic zero-flicker static micro-grain (1/f paper feel, zero temporal noise)
float staticPaperGrain(vec2 px) {
  vec2 p = fract(px * vec2(0.1031, 0.1030));
  p += dot(p, p.yx + 33.33);
  return fract((p.x + p.y) * p.x) - 0.5;
}

void main() {
  vec2 fragPx = v_uv * u_resolution;
  vec2 pointerPx = u_pointerUv * u_resolution;

  // 1. Hollywood Eye-Trace Peripheral Calm centered on active task anchor
  float anchorDist = distance(v_uv, u_taskAnchorUv);
  float peripheralCalm = smoothstep(0.20, 0.95, anchorDist) * u_vignetteAlpha;

  // 2. Soft quadratic Affordalume key beam (branchless)
  float distPx = distance(fragPx, pointerPx);
  float normDist = clamp(distPx / max(u_beamRadiusPx, 1.0), 0.0, 1.0);
  float beamFalloff = (1.0 - normDist * normDist) * step(distPx, u_beamRadiusPx);

  // 3. Matte paper micro-scatter + beam blend
  float grain = staticPaperGrain(floor(fragPx)) * 0.007;
  vec3 matteGround = u_canvasRgb * (1.0 - peripheralCalm) + grain;
  vec3 litSurface = mix(matteGround, u_beamTintRgb, beamFalloff * u_beamAlpha);

  // 4. Synthetic Blue-Glare Safety Switch & Peak Luminance Ceiling
  litSurface.b = min(litSurface.b, u_blueGlareClamp);
  litSurface = clamp(litSurface, vec3(0.0), vec3(u_peakClamp));

  outColor = vec4(litSurface, 1.0);
}
`;

export function resolveStageOpticalUniforms({
  themeMode,
  lightSurface = 'moonlit-pearl',
  tintHex = '#88C0A8',
  beamPowerAlpha = 0.08,
  affordalumeEnabled = true
}) {
  const hexToRgb01 = (hex) => {
    const clean = hex.replace('#', '');
    return [
      parseInt(clean.slice(0, 2), 16) / 255,
      parseInt(clean.slice(2, 4), 16) / 255,
      parseInt(clean.slice(4, 6), 16) / 255
    ];
  };

  if (themeMode === 'dark' || themeMode === 'h4h-glass') {
    return {
      bypassWebGl: false,
      u_canvasRgb: hexToRgb01('#121821'),
      u_beamTintRgb: hexToRgb01(tintHex),
      u_beamAlpha: affordalumeEnabled ? Math.min(beamPowerAlpha, 0.14) : 0.0,
      u_vignetteAlpha: 0.06,
      u_blueGlareClamp: 0.88,
      u_peakClamp: 0.92
    };
  }

  if (
    themeMode === 'aaa-contrast' ||
    (typeof window !== 'undefined' && window.matchMedia?.('(forced-colors: active)')?.matches)
  ) {
    return { bypassWebGl: true };
  }

  const spec = getLightSurfaceSpec(lightSurface);
  return {
    bypassWebGl: false,
    u_canvasRgb: hexToRgb01(spec.cardRestHex),
    u_beamTintRgb: hexToRgb01(tintHex),
    u_beamAlpha: affordalumeEnabled ? Math.min(beamPowerAlpha, 0.08) : 0.0,
    u_vignetteAlpha: spec.vignetteAlpha,
    u_blueGlareClamp: spec.blueGlareClamp,
    u_peakClamp: spec.peakLuminanceClamp
  };
}

export const BLUE_GLARE_OPTIONS = [
  {
    id: 'matte-balanced',
    lightSurfaceId: 'moonlit-pearl',
    shortLabel: 'Moonlit Pearl (Matte)',
    label: 'Moonlit Pearl Matte (Default)',
    blueDropPct: 24.7,
    melanopicDropPct: 23.1,
    desc: 'Warm stone negative-fill matte paper (#F1ECE1 rest -> #F8F4EC +0.066 optical lift); eliminates raw #FFFFFF glare indoors'
  },
  {
    id: 'shield-max',
    lightSurfaceId: 'blue-glare-shield',
    shortLabel: 'Blue-Glare Shield (-34% Blue)',
    label: 'Blue-Glare Shield (-34% Blue)',
    blueDropPct: 34.2,
    melanopicDropPct: 31.8,
    desc: 'Synthetic 450nm blue-glare safety clamp (#EDE5D4, 0.840 blue clamp, 15.38:1 AAA) for LED fatigue, migraine, and pattern stress'
  },
  {
    id: 'sunlight-day',
    lightSurfaceId: 'daylight-sun',
    shortLabel: 'Daylight Sun (Outdoor)',
    label: 'Daylight Sun (>10k lux Outdoor)',
    blueDropPct: 14.5,
    melanopicDropPct: 13.6,
    desc: 'High-reflectance #F7F5EE outdoor base (17.81:1 AAA) reserved for >10,000 lux direct sunlight'
  }
];

export const DISABILITY_PRESETS = [
  {
    id: 'standard',
    label: 'Moonlight CRR Default',
    patch: {
      theme: 'h4h-glass',
      motion: 'spring',
      crrMode: 'crr',
      stageDirector: 'cinema-guided',
      blueGlareShield: 'matte-balanced',
      flashlightTint: 'emerald',
      flashlightPower: 'balanced',
      textSpacing: 'standard',
      readingRuler: false,
      calmFirewall: false,
      cvdMode: 'none',
      density: 'panoramic-3',
      scaleLocked: false,
      scale: '60'
    }
  },
  {
    id: 'matte-daylight-shield',
    label: 'Matte Daylight Paper + Blue-Glare Shield',
    patch: {
      theme: 'warm-paper',
      blueGlareShield: 'shield-max',
      motion: 'spring',
      crrMode: 'crr',
      stageDirector: 'cinema-guided',
      flashlightTint: 'amber',
      flashlightPower: 'soft',
      taskGuide: true
    }
  },
  {
    id: 'cinema-joy-relief',
    label: 'Cinema Soft-Fascination & Stress Relief',
    patch: {
      theme: 'obsidian-prism',
      blueGlareShield: 'matte-balanced',
      motion: 'spring',
      crrMode: 'crr',
      stageDirector: 'cinema-guided',
      flashlightTint: 'emerald',
      flashlightPower: 'balanced',
      calmFirewall: false,
      taskGuide: true,
      density: 'panoramic-3'
    }
  },
  {
    id: 'migraine-purkinje',
    label: 'Migraine / Blue-Glare Shield',
    patch: {
      theme: 'h4h-glass',
      blueGlareShield: 'shield-max',
      motion: 'reduced',
      crrMode: 'crr',
      stageDirector: 'minimal',
      flashlightTint: 'amber',
      flashlightPower: 'soft',
      textSpacing: 'wcag-1412',
      readingRuler: false,
      calmFirewall: true,
      cvdMode: 'none'
    }
  },
  {
    id: 'dyslexia-comfort',
    label: 'Dyslexia / Reading Comfort (SC 1.4.12)',
    patch: {
      textSpacing: 'wcag-1412',
      readingRuler: true,
      readingLock: true,
      calmFirewall: true
    }
  },
  {
    id: 'cvd-safe-lens',
    label: 'Color-Blindness Safe + Hatch Patterns',
    patch: {
      cvdMode: 'cvd-safe',
      flashlightTint: 'pearl'
    }
  },
  {
    id: 'coga-comprehension',
    label: 'Task Clarity & Comprehension (COGA)',
    patch: {
      density: 'calm-focus',
      scaleLocked: true,
      scale: '100',
      textSpacing: 'wcag-1412',
      calmFirewall: true,
      taskGuide: true,
      readingLock: true
    }
  },
  {
    id: 'low-vision-aaa',
    label: 'Low Vision / AAA Contrast (Large)',
    patch: {
      theme: 'aaa-contrast',
      scaleLocked: true,
      scale: '115',
      textSpacing: 'wcag-1412',
      stageDirector: 'minimal',
      flashlightPower: 'off',
      motion: 'off',
      taskGuide: true
    }
  }
];

export function isMotionFrozen(motionSetting) {
  if (motionSetting === 'off' || motionSetting === 'zero') return true;
  if (typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
    return true;
  }
  return false;
}

export function getViewportTier(width) {
  const w = typeof width === 'number' && width > 0
    ? width
    : typeof window !== 'undefined' && window.innerWidth
      ? window.innerWidth
      : 1440;
  if (w < 768) return 'mobile';
  if (w < 1100) return 'tablet';
  return 'desktop';
}

export function resolveEffectiveScale(settings, viewportWidth) {
  const tier = getViewportTier(viewportWidth);
  const manualSpec = SCALE_OPTIONS.find(s => s.id === settings?.scale) || SCALE_OPTIONS[0];

  if (!settings?.scaleLocked) {
    if (tier === 'mobile') {
      return { tier, scaleAttr: '100', px: 16, badgeLabel: 'Auto (100%)' };
    }
    if (tier === 'tablet') {
      return { tier, scaleAttr: '80', px: 14.5, badgeLabel: 'Auto (Tablet)' };
    }
    return { tier, scaleAttr: '60', px: 11.75, badgeLabel: 'Auto (60%)' };
  }

  // Manual scale selected: honor choice, clamping <768px phones to >=15px for legibility
  const effectivePx = tier === 'mobile' ? Math.max(15, manualSpec.px) : manualSpec.px;
  return {
    tier,
    scaleAttr: manualSpec.id,
    px: effectivePx,
    badgeLabel: manualSpec.shortLabel
  };
}

export function detectOsDefaults() {
  const prefersMoreContrast = typeof window !== 'undefined' && window.matchMedia?.('(prefers-contrast: more)').matches;
  const prefersReducedTransparency = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-transparency: reduce)').matches;
  const prefersReducedMotion = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

  let theme = 'h4h-glass';
  if (prefersMoreContrast) theme = 'aaa-contrast';
  else if (prefersReducedTransparency) theme = 'matte-slate';

  return {
    theme,
    lightSurface: 'moonlit-pearl',
    scale: '60',
    scaleLocked: false,
    density: 'panoramic-3',
    motion: prefersReducedMotion ? 'off' : 'spring',
    readingLock: true,
    singleKeyShortcuts: true,
    upperKeyMirror: false,
    crrMode: 'crr',
    stageDirector: prefersMoreContrast || prefersReducedMotion ? 'minimal' : 'cinema-guided',
    blueGlareShield: 'matte-balanced',
    flashlightTint: 'emerald',
    flashlightPower: prefersMoreContrast ? 'off' : 'balanced',
    textSpacing: 'standard',
    readingRuler: false,
    calmFirewall: false,
    cvdMode: 'none',
    taskGuide: true
  };
}

export function loadErgonomics() {
  const defaults = detectOsDefaults();
  if (typeof window === 'undefined') return defaults;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaults;
    const parsed = JSON.parse(raw);
    const normalizedMotion = parsed.motion === 'zero' ? 'off' : parsed.motion;
    const normalizedTheme = parsed.theme === 'light' ? 'warm-paper' : parsed.theme;
    const validBlueGlare = BLUE_GLARE_OPTIONS.some(bg => bg.id === parsed.blueGlareShield)
      ? parsed.blueGlareShield
      : defaults.blueGlareShield;
    const validLightSurface = LIGHT_SURFACE_MODES.some(ls => ls.id === parsed.lightSurface)
      ? parsed.lightSurface
      : (BLUE_GLARE_OPTIONS.find(bg => bg.id === validBlueGlare)?.lightSurfaceId || 'moonlit-pearl');
    return {
      theme: THEME_OPTIONS.some(t => t.id === normalizedTheme) ? normalizedTheme : defaults.theme,
      lightSurface: validLightSurface,
      scale: SCALE_OPTIONS.some(s => s.id === parsed.scale) ? parsed.scale : defaults.scale,
      scaleLocked: typeof parsed.scaleLocked === 'boolean' ? parsed.scaleLocked : false,
      density: DENSITY_OPTIONS.some(d => d.id === parsed.density) ? parsed.density : defaults.density,
      motion: MOTION_OPTIONS.some(m => m.id === normalizedMotion) ? normalizedMotion : defaults.motion,
      readingLock: typeof parsed.readingLock === 'boolean' ? parsed.readingLock : defaults.readingLock,
      singleKeyShortcuts:
        typeof parsed.singleKeyShortcuts === 'boolean' ? parsed.singleKeyShortcuts : defaults.singleKeyShortcuts,
      upperKeyMirror:
        typeof parsed.upperKeyMirror === 'boolean' ? parsed.upperKeyMirror : defaults.upperKeyMirror,
      crrMode: parsed.crrMode === 'flat' ? 'flat' : 'crr',
      stageDirector: STAGE_DIRECTOR_OPTIONS.some(sd => sd.id === parsed.stageDirector)
        ? parsed.stageDirector
        : defaults.stageDirector,
      blueGlareShield: validBlueGlare,
      flashlightTint: FLASHLIGHT_TINTS.some(f => f.id === parsed.flashlightTint) ? parsed.flashlightTint : defaults.flashlightTint,
      flashlightPower: FLASHLIGHT_POWERS.some(p => p.id === parsed.flashlightPower) ? parsed.flashlightPower : defaults.flashlightPower,
      textSpacing: parsed.textSpacing === 'wcag-1412' ? 'wcag-1412' : 'standard',
      readingRuler: typeof parsed.readingRuler === 'boolean' ? parsed.readingRuler : defaults.readingRuler,
      calmFirewall: typeof parsed.calmFirewall === 'boolean' ? parsed.calmFirewall : defaults.calmFirewall,
      cvdMode: CVD_MODE_OPTIONS.some(c => c.id === parsed.cvdMode) ? parsed.cvdMode : defaults.cvdMode,
      taskGuide: typeof parsed.taskGuide === 'boolean' ? parsed.taskGuide : defaults.taskGuide
    };
  } catch {
    return defaults;
  }
}

export function saveErgonomics(settings) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // Ignore private-browsing quota errors gracefully
  }
}

export function applyErgonomicsToDocument(settings, viewportWidth) {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  const resolved = resolveEffectiveScale(settings, viewportWidth);
  const tintSpec = FLASHLIGHT_TINTS.find(f => f.id === settings?.flashlightTint) || FLASHLIGHT_TINTS[0];
  const powerSpec = FLASHLIGHT_POWERS.find(p => p.id === settings?.flashlightPower) || FLASHLIGHT_POWERS[1];
  const blueSpec = BLUE_GLARE_OPTIONS.find(bg => bg.id === settings?.blueGlareShield) || BLUE_GLARE_OPTIONS[0];
  const isLight = settings.theme === 'warm-paper' || settings.theme === 'light';
  const effectiveLightSurface = LIGHT_SURFACE_MODES.some(ls => ls.id === settings?.lightSurface)
    ? settings.lightSurface
    : blueSpec.lightSurfaceId;
  const effectiveDirector =
    settings.stageDirector === 'minimal' ||
    settings.crrMode === 'flat' ||
    settings.theme === 'aaa-contrast' ||
    settings.motion === 'off' ||
    settings.motion === 'zero'
      ? 'minimal'
      : 'cinema-guided';

  root.setAttribute('data-theme', settings.theme);
  if (isLight) {
    root.setAttribute('data-light-surface', effectiveLightSurface);
  } else {
    root.removeAttribute('data-light-surface');
  }
  root.setAttribute('data-scale', resolved.scaleAttr);
  root.setAttribute('data-viewport', resolved.tier);
  root.setAttribute('data-scale-mode', settings.scaleLocked ? 'manual' : 'auto');
  root.setAttribute('data-density', settings.density);
  root.setAttribute('data-motion', settings.motion === 'zero' ? 'off' : settings.motion);
  root.setAttribute('data-reading-lock', settings.readingLock ? 'true' : 'false');
  root.setAttribute('data-crr', settings.crrMode === 'flat' ? 'flat' : 'crr');
  root.setAttribute('data-stage-director', effectiveDirector);
  root.setAttribute('data-blue-glare', settings.theme === 'aaa-contrast' ? 'matte-balanced' : blueSpec.id);
  root.setAttribute('data-flashlight-tint', tintSpec.id);
  root.setAttribute('data-flashlight-power', powerSpec.id);
  root.setAttribute('data-text-spacing', settings.textSpacing === 'wcag-1412' ? 'wcag-1412' : 'standard');
  root.setAttribute('data-reading-ruler', settings.readingRuler ? 'on' : 'off');
  root.setAttribute('data-calm-firewall', settings.calmFirewall ? 'on' : 'off');
  root.setAttribute('data-cvd-mode', settings.cvdMode || 'none');
  root.setAttribute('data-task-guide', settings.taskGuide !== false ? 'on' : 'off');
  root.style.fontSize = `${resolved.px}px`;

  const activeAlpha =
    settings.theme === 'aaa-contrast' || settings.crrMode === 'flat' || powerSpec.id === 'off'
      ? '0'
      : isLight
        ? String(Math.min(0.08, Number(powerSpec.cssAlpha) * 0.65))
        : powerSpec.cssAlpha;
  root.setAttribute('data-affordalume', activeAlpha === '0' || isMotionFrozen(settings.motion) ? 'off' : 'on');
  const rgbTuple = isLight ? tintSpec.lightCssRgb : tintSpec.cssRgb;
  root.style.setProperty('--crr-flashlight-rgb', rgbTuple);
  root.style.setProperty('--crr-flashlight-hex', tintSpec.hex);
  root.style.setProperty('--crr-flashlight-alpha', activeAlpha);
  root.style.setProperty(
    '--crr-proximity-glow',
    activeAlpha === '0' ? 'transparent' : `rgba(${rgbTuple}, ${activeAlpha})`
  );

  root.style.colorScheme = isLight ? 'light' : 'dark';
  const metaScheme = document.querySelector('meta[name="color-scheme"]');
  if (metaScheme) metaScheme.setAttribute('content', isLight ? 'light' : 'dark');
}
