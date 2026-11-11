// PostSheet Workstation x Hack4Hack PS1 Spatial Ergonomics, Viewport Calibration & CRR Engine
export const STORAGE_KEY = 'h4h-ps1:ergonomics:v4';

export const THEME_OPTIONS = [
  {
    id: 'h4h-glass',
    shortLabel: 'Moonlight Dark',
    label: 'Moonlight Dark',
    subtitle: 'Steady #0B0F14 ground, 100% opaque #121820 matte reading cards & reactive lunar edge',
    swatch: ['#0B0F14', '#121820', '#8CE65A', '#E4EEEB']
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
    subtitle: 'Clean #EEF2F6 daylight ground with crisp #FFFFFF matte cards and high-contrast #0F172A ink',
    swatch: ['#EEF2F6', '#FFFFFF', '#0B4F6C', '#0F172A']
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
    label: 'Reactive Light',
    desc: 'Calm static rest; bounded 850ms handoff pulse & subtle proximity edge on interaction'
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
    scale: '60',
    scaleLocked: false,
    density: 'panoramic-3',
    motion: prefersReducedMotion ? 'off' : 'spring',
    readingLock: true,
    singleKeyShortcuts: true,
    upperKeyMirror: true,
    crrMode: 'crr'
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
    return {
      theme: THEME_OPTIONS.some(t => t.id === parsed.theme) ? parsed.theme : defaults.theme,
      scale: SCALE_OPTIONS.some(s => s.id === parsed.scale) ? parsed.scale : defaults.scale,
      scaleLocked: typeof parsed.scaleLocked === 'boolean' ? parsed.scaleLocked : false,
      density: DENSITY_OPTIONS.some(d => d.id === parsed.density) ? parsed.density : defaults.density,
      motion: MOTION_OPTIONS.some(m => m.id === normalizedMotion) ? normalizedMotion : defaults.motion,
      readingLock: typeof parsed.readingLock === 'boolean' ? parsed.readingLock : defaults.readingLock,
      singleKeyShortcuts:
        typeof parsed.singleKeyShortcuts === 'boolean' ? parsed.singleKeyShortcuts : defaults.singleKeyShortcuts,
      upperKeyMirror:
        typeof parsed.upperKeyMirror === 'boolean' ? parsed.upperKeyMirror : defaults.upperKeyMirror,
      crrMode: parsed.crrMode === 'flat' ? 'flat' : 'crr'
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

  root.setAttribute('data-theme', settings.theme);
  root.setAttribute('data-scale', resolved.scaleAttr);
  root.setAttribute('data-viewport', resolved.tier);
  root.setAttribute('data-scale-mode', settings.scaleLocked ? 'manual' : 'auto');
  root.setAttribute('data-density', settings.density);
  root.setAttribute('data-motion', settings.motion === 'zero' ? 'off' : settings.motion);
  root.setAttribute('data-reading-lock', settings.readingLock ? 'true' : 'false');
  root.setAttribute('data-crr', settings.crrMode === 'flat' ? 'flat' : 'crr');
  root.style.fontSize = `${resolved.px}px`;

  const isLight = settings.theme === 'warm-paper';
  root.style.colorScheme = isLight ? 'light' : 'dark';
  const metaScheme = document.querySelector('meta[name="color-scheme"]');
  if (metaScheme) metaScheme.setAttribute('content', isLight ? 'light' : 'dark');
}
