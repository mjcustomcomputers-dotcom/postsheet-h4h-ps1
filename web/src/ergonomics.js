// PostSheet Workstation x Hack4Hack PS1 Cognitive-Ergonomics & FOV Calibration Engine
const STORAGE_KEY = 'h4h-ps1:ergonomics:v2';

export const THEME_OPTIONS = [
  {
    id: 'sbr-comfort',
    shortLabel: 'SBR Comfort',
    label: 'Super Bob Ross Comfort',
    subtitle: 'Opaque matte #11171D canvas, #182129 structure, #8FBEB4 sage-teal, #9CC6DA focus',
    swatch: ['#11171D', '#182129', '#8FBEB4', '#D1DCE5']
  },
  {
    id: 'h4h-studio',
    shortLabel: 'H4H Studio',
    label: 'Hack4Hack Builder Studio',
    subtitle: 'Obsidian-indigo #0B0F19 with #10B981 emerald and #8B5CF6 violet accents',
    swatch: ['#0B0F19', '#13192B', '#10B981', '#8B5CF6']
  },
  {
    id: 'midnight-glass',
    shortLabel: 'Midnight Glass',
    label: 'Moonlight Optical Glass',
    subtitle: 'Refractive header rim on deep #0B101B obsidian with matte reading cards',
    swatch: ['#0B101B', '#182129', '#4FD1C5', '#D1DCE5']
  },
  {
    id: 'matte-slate',
    shortLabel: 'Matte Slate',
    label: 'Calm Matte Slate',
    subtitle: 'Zero translucency, low-glare #0F172A engineering surface',
    swatch: ['#0F172A', '#1E293B', '#38BDF8', '#F8FAFC']
  },
  {
    id: 'warm-paper',
    shortLabel: 'Warm Paper',
    label: 'Warm Paper Light',
    subtitle: 'High-comfort #F8FAFC daylight reader with crisp dark ink',
    swatch: ['#F8FAFC', '#FFFFFF', '#0B4F6C', '#0F172A']
  },
  {
    id: 'aaa-contrast',
    shortLabel: 'WCAG AAA',
    label: 'WCAG AAA High-Contrast',
    subtitle: '7:1+ to 21:1 pure #000000 / #FFFFFF / #FFD60A high-visibility mode',
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

  let theme = 'sbr-comfort';
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
    const raw = window.localStorage.getItem(STORAGE_KEY) || window.localStorage.getItem('h4h-ps1:ergonomics:v1');
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
