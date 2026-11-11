// PostSheet Workstation x Hack4Hack PS1 Spatial Ergonomics & FOV Calibration Engine
const STORAGE_KEY = 'h4h-ps1:ergonomics:v3';

export const THEME_OPTIONS = [
  {
    id: 'h4h-glass',
    shortLabel: 'H4H Glass',
    label: 'H4H Spatial Glass',
    subtitle: 'Carbon-obsidian #090D11, subsurface emerald/teal glow, smoked glass cards & #8CE65A jade-lime accent',
    swatch: ['#090D11', '#10181D', '#8CE65A', '#D5E2DE']
  },
  {
    id: 'petrol-glass',
    shortLabel: 'Petrol Glass',
    label: 'Petrol Deep Glass',
    subtitle: 'Oceanic petrol #06151C canvas, smoked #0B222D glass, #64DFDF & #8FBEB4 specular rims',
    swatch: ['#06151C', '#0B222D', '#64DFDF', '#D2E3EC']
  },
  {
    id: 'obsidian-prism',
    shortLabel: 'Obsidian Prism',
    label: 'Obsidian Prism',
    subtitle: 'Twilight #090D18 canvas, smoked indigo-slate glass, #5EEAD4 & #A78BFA dual prism rim',
    swatch: ['#090D18', '#12192A', '#5EEAD4', '#A78BFA']
  },
  {
    id: 'matte-slate',
    shortLabel: 'Calm Matte',
    label: 'Calm Matte Dark',
    subtitle: 'Zero-blur opaque #11171D / #182129 low-glare dark engineering surface',
    swatch: ['#11171D', '#182129', '#5EEAD4', '#D5E2DE']
  },
  {
    id: 'warm-paper',
    shortLabel: 'Frosted Light',
    label: 'Frosted Daylight',
    subtitle: 'Clean light #EEF2F6 canvas with frosted white cards and crisp dark ink',
    swatch: ['#EEF2F6', '#FFFFFF', '#0B4F6C', '#0F172A']
  },
  {
    id: 'aaa-contrast',
    shortLabel: 'WCAG AAA',
    label: 'WCAG AAA Contrast',
    subtitle: 'Pure #000000 / #FFFFFF / #FFD60A 7:1+ to 21:1 high-visibility mode',
    swatch: ['#000000', '#0A0A0A', '#FFD60A', '#FFFFFF']
  }
];

export const SCALE_OPTIONS = [
  { id: '85', label: '85% Panoramic', px: 13.6, desc: 'Wide multi-card telemetry overview' },
  { id: '100', label: '100% Comfort Default', px: 16, desc: 'Balanced readability & comfortable FOV' },
  { id: '115', label: '115% Relaxed', px: 18.4, desc: 'Lower eye strain for extended review' },
  { id: '130', label: '130% Large Print', px: 20.8, desc: 'Maximum typographic clarity & hit targets' }
];

export const DENSITY_OPTIONS = [
  {
    id: 'calm-focus',
    label: 'Calm Focus (Default)',
    desc: 'Single generous reading surface with progressive disclosure'
  },
  {
    id: 'panoramic-3',
    label: '3-Panel Panorama (41/29/29)',
    desc: 'Active View + Live DAG/VOI Mini-Inspector + Live Seat/SSE Audit Feed'
  },
  {
    id: 'split-studio',
    label: 'Split Studio (2-Panel)',
    desc: 'Side-by-side live companion telemetry beside active workspace'
  },
  {
    id: 'compact',
    label: 'Compact Directory',
    desc: 'Denser card spacing for scanning large hackathon rosters'
  }
];

export const MOTION_OPTIONS = [
  { id: 'spring', label: 'Spring & Firefly 60fps', desc: 'Gentle micro-transitions & live solar baton pulse' },
  { id: 'reduced', label: 'Reduced', desc: 'Subtle opacity fades without spatial movement' },
  { id: 'off', label: 'Zero Motion (Static)', desc: 'Immediate state changes & static horizon canvas' }
];

export function isMotionFrozen(motionSetting) {
  if (motionSetting === 'off' || motionSetting === 'zero') return true;
  if (typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
    return true;
  }
  return false;
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
    scale: '100',
    density: 'calm-focus',
    motion: prefersReducedMotion ? 'off' : 'spring',
    readingLock: true
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
      density: DENSITY_OPTIONS.some(d => d.id === parsed.density) ? parsed.density : defaults.density,
      motion: MOTION_OPTIONS.some(m => m.id === normalizedMotion) ? normalizedMotion : defaults.motion,
      readingLock: typeof parsed.readingLock === 'boolean' ? parsed.readingLock : defaults.readingLock
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

export function applyErgonomicsToDocument(settings) {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  root.setAttribute('data-theme', settings.theme);
  root.setAttribute('data-scale', settings.scale);
  root.setAttribute('data-density', settings.density);
  root.setAttribute('data-motion', settings.motion === 'zero' ? 'off' : settings.motion);
  root.setAttribute('data-reading-lock', settings.readingLock ? 'true' : 'false');

  const scaleSpec = SCALE_OPTIONS.find(s => s.id === settings.scale) || SCALE_OPTIONS[1];
  root.style.fontSize = `${scaleSpec.px}px`;

  const isLight = settings.theme === 'warm-paper';
  root.style.colorScheme = isLight ? 'light' : 'dark';
  const metaScheme = document.querySelector('meta[name="color-scheme"]');
  if (metaScheme) metaScheme.setAttribute('content', isLight ? 'light' : 'dark');
}
