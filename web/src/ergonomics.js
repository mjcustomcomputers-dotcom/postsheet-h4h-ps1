// PostSheet Workstation × Hack4Hack PS1 Cognitive-Ergonomics & FOV Calibration Engine
const STORAGE_KEY = 'h4h-ps1:ergonomics:v1';

export const THEME_OPTIONS = [
  {
    id: 'midnight-glass',
    label: 'Hack4Hack Midnight Glass',
    subtitle: 'Subtle frosted header on deep calm #0B101B obsidian',
    swatch: ['#0B101B', '#141E30', '#5EEAD4', '#ECF3FC']
  },
  {
    id: 'matte-slate',
    label: 'Calm Matte Slate',
    subtitle: 'Zero translucency, low-glare #0F172A engineering surface',
    swatch: ['#0F172A', '#1E293B', '#38BDF8', '#F8FAFC']
  },
  {
    id: 'warm-paper',
    label: 'Warm Paper Light',
    subtitle: 'High-comfort #F8FAFC daylight reader with crisp ink contrast',
    swatch: ['#F8FAFC', '#FFFFFF', '#0B4F6C', '#0F172A']
  },
  {
    id: 'aaa-contrast',
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
  { id: 'spring', label: 'Spring Physics', desc: 'Gentle tactile micro-transitions' },
  { id: 'reduced', label: 'Reduced', desc: 'Subtle opacity fades without spatial movement' },
  { id: 'zero', label: 'Zero Motion (Instant)', desc: 'Immediate state transitions; 0ms animation' }
];

export function detectOsDefaults() {
  const prefersMoreContrast = typeof window !== 'undefined' && window.matchMedia?.('(prefers-contrast: more)').matches;
  const prefersReducedTransparency = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-transparency: reduce)').matches;
  const prefersReducedMotion = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const prefersLight = typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: light)').matches;

  let theme = 'midnight-glass';
  if (prefersMoreContrast) theme = 'aaa-contrast';
  else if (prefersReducedTransparency) theme = 'matte-slate';
  else if (prefersLight) theme = 'midnight-glass'; // Keep flagship Midnight Glass unless user switches, or honor contrast/transparency

  return {
    theme,
    scale: '100',
    density: 'calm-focus',
    motion: prefersReducedMotion ? 'zero' : 'spring',
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
    return {
      theme: THEME_OPTIONS.some(t => t.id === parsed.theme) ? parsed.theme : defaults.theme,
      scale: SCALE_OPTIONS.some(s => s.id === parsed.scale) ? parsed.scale : defaults.scale,
      density: DENSITY_OPTIONS.some(d => d.id === parsed.density) ? parsed.density : defaults.density,
      motion: MOTION_OPTIONS.some(m => m.id === parsed.motion) ? parsed.motion : defaults.motion,
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
  root.setAttribute('data-motion', settings.motion);
  root.setAttribute('data-reading-lock', settings.readingLock ? 'true' : 'false');

  const scaleSpec = SCALE_OPTIONS.find(s => s.id === settings.scale) || SCALE_OPTIONS[1];
  root.style.fontSize = `${scaleSpec.px}px`;

  const isLight = settings.theme === 'warm-paper';
  root.style.colorScheme = isLight ? 'light' : 'dark';
  const metaScheme = document.querySelector('meta[name="color-scheme"]');
  if (metaScheme) metaScheme.setAttribute('content', isLight ? 'light' : 'dark');
}
