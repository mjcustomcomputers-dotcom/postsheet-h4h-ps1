// H4H PS1 | Purpose-First Scenarios, Custom Crew Overlay, Builder Pool & DSL Helpers

const CUSTOM_CREW_STORAGE_KEY = 'h4h-ps1:custom-crews:v1';
let memoryCustomCrewStore = {};

export const SKILLS_CATALOG = [
  { id: 'backend', label: 'Backend & API', short: 'backend' },
  { id: 'frontend', label: 'Accessible UI', short: 'frontend' },
  { id: 'database', label: 'SQLite / Data', short: 'database' },
  { id: 'devops', label: 'Cloud / DevOps', short: 'devops' },
  { id: 'integrate', label: 'E2E Integration', short: 'integrate' },
  { id: 'design', label: 'UX & Systems', short: 'design' }
];

export const UTC_BUCKETS = [
  { id: 'all', label: 'Any UTC Window' },
  { id: 'americas', label: 'Americas (UTC-8..UTC-4)' },
  { id: 'emea', label: 'Europe / Africa (UTC-1..UTC+3)' },
  { id: 'apac', label: 'South / East Asia (UTC+5..UTC+9)' },
  { id: 'baton', label: 'Async Baton-Pass Pair' }
];

export const SECONDARY_CONTEXTS = [
  { id: 'all', label: 'All Contexts' },
  { id: 'Open Global Mesh', label: 'Open Global Mesh' },
  { id: 'Civic & Accessibility Lab', label: 'Civic & Accessibility Lab' },
  { id: 'Systems University Guild', label: 'Systems University Guild' },
  { id: 'Regional Builder Collective', label: 'Regional Builder Collective' }
];

export const TIMEZONE_PRESETS = [
  { value: 'UTC-6 · Hot Springs', utcOffset: -6, bucket: 'americas', defaultStartRatio: 0, defaultEndRatio: 0.5 },
  { value: 'UTC-5 · Toronto / NYC', utcOffset: -5, bucket: 'americas', defaultStartRatio: 0, defaultEndRatio: 0.6 },
  { value: 'UTC-3 · Sao Paulo', utcOffset: -3, bucket: 'americas', defaultStartRatio: 0.1, defaultEndRatio: 0.65 },
  { value: 'UTC+0 · London / Accra', utcOffset: 0, bucket: 'emea', defaultStartRatio: 0.2, defaultEndRatio: 0.75 },
  { value: 'UTC+1 · Berlin / Lagos', utcOffset: 1, bucket: 'emea', defaultStartRatio: 0.25, defaultEndRatio: 0.8 },
  { value: 'UTC+3 · Nairobi', utcOffset: 3, bucket: 'emea', defaultStartRatio: 0.3, defaultEndRatio: 0.85 },
  { value: 'UTC+5:30 · Bengaluru', utcOffset: 5.5, bucket: 'apac', defaultStartRatio: 0.5, defaultEndRatio: 1.0 },
  { value: 'UTC+9 · Tokyo / Seoul', utcOffset: 9, bucket: 'apac', defaultStartRatio: 0.55, defaultEndRatio: 1.0 }
];

export function parseUtcOffsetHours(tzLabel, fallbackStartMin = 0, horizonMin = 480) {
  if (typeof tzLabel === 'string') {
    const m = /UTC([+-])(\d{1,2})(?::(\d{2}))?/i.exec(tzLabel);
    if (m) {
      const sign = m[1] === '-' ? -1 : 1;
      const hrs = Number(m[2]);
      const mins = m[3] ? Number(m[3]) / 60 : 0;
      return Math.max(-12, Math.min(14, sign * (hrs + mins)));
    }
  }
  const ratio = Math.max(0, Math.min(1, fallbackStartMin / Math.max(60, horizonMin)));
  return Number((-6 + ratio * 15).toFixed(1));
}

export function loadCustomCrewOverlay() {
  if (typeof window === 'undefined' || !window.localStorage) {
    return { ...memoryCustomCrewStore };
  }
  try {
    const raw = window.localStorage.getItem(CUSTOM_CREW_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

export function saveCustomCrewOverlayEntry(eventId, teamId, entry) {
  const current = loadCustomCrewOverlay();
  const scopedKey = `${eventId}::${teamId}`;
  const storedRecord = {
    mission: String(entry.mission || '').trim() || 'Custom purpose-driven deliverable',
    skills: Array.isArray(entry.skills) && entry.skills.length > 0 ? entry.skills : ['backend', 'frontend'],
    utcLabel: entry.utcLabel || 'UTC-6 <-> UTC+5:30 Baton',
    utcBucket: entry.utcBucket || 'baton',
    secondaryContext: entry.secondaryContext || 'Open Global Mesh',
    scenarioKey: entry.scenarioKey || 'baton',
    ...(Array.isArray(entry.tasks) && entry.tasks.length > 0
      ? { tasks: entry.tasks.map(t => ({ ...t, after: Array.isArray(t.after) ? [...t.after] : [] })) }
      : {}),
    ...(Number.isFinite(Number(entry.horizonHours)) && Number(entry.horizonHours) > 0
      ? { horizonHours: Number(entry.horizonHours) }
      : {}),
    ...(Array.isArray(entry.teamPeople) && entry.teamPeople.length > 0
      ? {
          teamPeople: entry.teamPeople.map(p => ({
            ...p,
            skills: { ...(p.skills || {}) }
          }))
        }
      : {})
  };
  const next = {
    ...current,
    [scopedKey]: storedRecord
  };
  memoryCustomCrewStore = next;
  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      window.localStorage.setItem(CUSTOM_CREW_STORAGE_KEY, JSON.stringify(next));
    } catch {
      // Ignore storage quota restrictions gracefully
    }
  }
  return next;
}

export const MISSION_SCENARIOS = {
  baton: {
    id: 'baton',
    code: '1',
    title: '1. Different time zones, clean handoff',
    shortPill: '1. Time zones',
    subtitle: 'Hot Springs (UTC-6) + Bengaluru (UTC+5:30) · 0m overlap, finishes early',
    summary:
      'Aurora and Kai work hours 0..4 in Arkansas (UTC-6). Priya works hours 4..8 in Bengaluru (UTC+5:30) with zero simultaneous overlap, yet task dependencies hand off cleanly so adding Priya finishes all 3 tasks with 2.5 hours to spare.',
    goalDescription: 'Ship race-safe API, accessible React UI, and E2E integration across Hot Springs (UTC-6) and Bengaluru (UTC+5:30)',
    horizonHours: 8,
    tasks: [
      { id: 'api', title: 'Serialized SQLite Authority API', skill: 'backend', durationMin: 120, lagMin: 0, after: [] },
      { id: 'ui', title: 'WCAG 2.2 Accessible Crew Client', skill: 'frontend', durationMin: 180, lagMin: 0, after: [] },
      { id: 'integration', title: 'Contract & Race Verification Relay', skill: 'integrate', durationMin: 90, lagMin: 15, after: ['api', 'ui'] }
    ],
    teamPeople: [
      {
        id: 'aurora',
        timezone: 'UTC-6 · Hot Springs',
        startMin: 0,
        endMin: 240,
        skills: { backend: 'supported', design: 'unknown' }
      },
      {
        id: 'kai',
        timezone: 'UTC-6 · Hot Springs',
        startMin: 0,
        endMin: 240,
        skills: { frontend: 'supported' }
      }
    ],
    candidates: [
      {
        id: 'priya',
        timezone: 'UTC+5:30 · Bengaluru',
        startMin: 240,
        endMin: 480,
        skills: { integrate: 'supported', devops: 'supported' }
      },
      {
        id: 'liam',
        timezone: 'UTC-6 · Austin',
        startMin: 0,
        endMin: 180,
        skills: { frontend: 'supported' }
      },
      {
        id: 'amina',
        timezone: 'UTC+1 · Berlin',
        startMin: 180,
        endMin: 420,
        skills: { integrate: 'unknown' }
      }
    ]
  },
  hall: {
    id: 'hall',
    code: '2',
    title: '2. One person double-booked on two tasks',
    shortPill: '2. Double-booked',
    subtitle: 'Both skills exist on paper, yet two simultaneous 2-hour tasks overload one person',
    summary:
      'Aurora and Kai appear to cover every skill tag (backend, database, frontend). Yet api-cutover and schema-migration both need 2 hours inside a 2-hour window, double-booking Aurora. Adding Mateo covers database without replacing anyone.',
    goalDescription: 'Execute simultaneous zero-downtime API cutover and SQLite WAL schema migration within a 2-hour window',
    horizonHours: 2,
    tasks: [
      { id: 'api-cutover', title: 'Zero-Downtime API Cutover', skill: 'backend', durationMin: 120, lagMin: 0, after: [] },
      { id: 'schema-migration', title: 'SQLite WAL Schema & Index Migration', skill: 'database', durationMin: 120, lagMin: 0, after: [] }
    ],
    teamPeople: [
      {
        id: 'aurora',
        timezone: 'UTC-6 · Hot Springs',
        startMin: 0,
        endMin: 120,
        skills: { backend: 'supported', database: 'supported' }
      },
      {
        id: 'kai',
        timezone: 'UTC-6 · Hot Springs',
        startMin: 0,
        endMin: 120,
        skills: { frontend: 'supported', design: 'supported' }
      }
    ],
    candidates: [
      {
        id: 'mateo',
        timezone: 'UTC-5 · Toronto',
        startMin: 0,
        endMin: 120,
        skills: { database: 'supported' }
      },
      {
        id: 'noor',
        timezone: 'UTC+0 · London',
        startMin: 0,
        endMin: 120,
        skills: { design: 'supported' }
      }
    ]
  },
  omega: {
    id: 'omega',
    code: '3',
    title: '3. Unverified skill: when backup covers it vs. quick check',
    shortPill: '3. Unverified skill',
    subtitle: 'Asks zero questions when a backup covers the task, or prompts one quick check',
    summary:
      'Compare two cases: when Devon has an unverified frontend skill, the planner suggests one quick 5-minute check. When Kai already covers frontend with verified work, the planner asks zero unnecessary questions.',
    goalDescription: 'Deliver authenticated API and accessible React interface with provisional secondary skill wildcards',
    horizonHours: 4,
    tasks: [
      { id: 'core-api', title: 'Bearer HMAC & Invite API', skill: 'backend', durationMin: 90, lagMin: 0, after: [] },
      { id: 'accessible-ui', title: 'Keyboard & Screen-Reader UI', skill: 'frontend', durationMin: 90, lagMin: 0, after: ['core-api'] }
    ],
    teamPeople: [
      {
        id: 'aurora',
        timezone: 'UTC-6 · Hot Springs',
        startMin: 0,
        endMin: 240,
        skills: { backend: 'supported' }
      },
      {
        id: 'devon',
        timezone: 'UTC-5 · NYC',
        startMin: 0,
        endMin: 240,
        skills: { frontend: 'unknown' }
      }
    ],
    robustTeamPeople: [
      {
        id: 'aurora',
        timezone: 'UTC-6 · Hot Springs',
        startMin: 0,
        endMin: 240,
        skills: { backend: 'supported', frontend: 'unknown' }
      },
      {
        id: 'kai',
        timezone: 'UTC-6 · Hot Springs',
        startMin: 0,
        endMin: 240,
        skills: { frontend: 'supported' }
      }
    ],
    candidates: [
      {
        id: 'kai',
        timezone: 'UTC-6 · Hot Springs',
        startMin: 0,
        endMin: 240,
        skills: { frontend: 'supported' }
      },
      {
        id: 'priya',
        timezone: 'UTC+5:30 · Bengaluru',
        startMin: 120,
        endMin: 240,
        skills: { integrate: 'unknown' }
      }
    ]
  },
  prereq: {
    id: 'prereq',
    code: '4',
    title: '4. Unblock early setup without replacing teammates',
    shortPill: '4. Early setup',
    subtitle: 'Unlock a blocked 3-person team by adding early setup support',
    summary:
      'Aurora, Kai, and Priya cover backend, frontend, and integration, while early cloud/test-runner setup (devops) is unverified and blocks downstream tasks. Confirming setup support unblocks the whole team without replacing anyone.',
    goalDescription: 'Provision reproducible CI + accessibility test runner, build core platform, and pass full E2E verification',
    horizonHours: 6,
    tasks: [
      { id: 'sandbox-prereq', title: 'Cloud & A11y Runner Prerequisite', skill: 'devops', durationMin: 45, lagMin: 0, after: [] },
      { id: 'authority-api', title: 'SQLite Serialized Seat API', skill: 'backend', durationMin: 105, lagMin: 0, after: ['sandbox-prereq'] },
      { id: 'client-views', title: 'Calm-FOV Crew Views', skill: 'frontend', durationMin: 120, lagMin: 0, after: ['sandbox-prereq'] },
      { id: 'gate-suite', title: '176-Check Gate & Race Oracle', skill: 'integrate', durationMin: 60, lagMin: 0, after: ['authority-api', 'client-views'] }
    ],
    teamPeople: [
      {
        id: 'aurora',
        timezone: 'UTC-6 · Hot Springs',
        startMin: 0,
        endMin: 360,
        skills: { backend: 'supported', devops: 'unknown' }
      },
      {
        id: 'kai',
        timezone: 'UTC-6 · Hot Springs',
        startMin: 0,
        endMin: 360,
        skills: { frontend: 'supported' }
      },
      {
        id: 'priya',
        timezone: 'UTC+5:30 · Bengaluru',
        startMin: 150,
        endMin: 360,
        skills: { integrate: 'supported' }
      }
    ],
    candidates: [
      {
        id: 'sanjay-steward',
        timezone: 'UTC+0 · Infra Steward',
        startMin: 0,
        endMin: 180,
        skills: { devops: 'supported' }
      }
    ]
  }
};

export const BUILDER_ID_ALIASES = {
  'leader-aurora': 'aurora',
  'builder-kai': 'kai',
  'builder-priya': 'priya',
  'relay-mateo': 'mateo'
};

export function normalizeBuilderId(rawId) {
  if (!rawId || typeof rawId !== 'string') return '';
  const cleaned = rawId.trim();
  return BUILDER_ID_ALIASES[cleaned] || cleaned;
}

export const BUILDER_DIRECTORY = [
  {
    id: 'priya',
    plannerId: 'priya',
    authPersonaId: 'builder-priya',
    displayName: 'Priya Nair',
    initials: 'PR',
    avatarTone: 'jade',
    role: 'Integration & Cryptographic Relay Engineer',
    timezone: 'UTC+5:30 · Bengaluru',
    utcOffset: 5.5,
    utcBucket: 'apac',
    windowLabel: 'T+04:00 .. T+08:00',
    startMin: 240,
    endMin: 480,
    skills: { integrate: 'supported', devops: 'supported' },
    batonReady: true,
    secondaryContext: 'Open Global Mesh',
    legacyAffiliation: 'Bengaluru · IIIT Systems Cohort',
    legacyHiddenFailure: 'Legacy boards show 0m overlap with UTC-6 and skip her, missing the exact T+240..480m integration handoff!',
    bio: 'Specializes in async UTC baton-pass handoffs, AES-256-GCM envelopes, and E2E gates.'
  },
  {
    id: 'aurora',
    plannerId: 'aurora',
    authPersonaId: 'leader-aurora',
    displayName: 'Aurora Vance',
    initials: 'AU',
    avatarTone: 'teal',
    role: 'Systems & SQLite Architect',
    timezone: 'UTC-6 · Hot Springs',
    utcOffset: -6,
    utcBucket: 'americas',
    windowLabel: 'T+00:00 .. T+04:00',
    startMin: 0,
    endMin: 240,
    skills: { backend: 'supported', database: 'supported', design: 'unknown' },
    batonReady: true,
    secondaryContext: 'Regional Builder Collective',
    legacyAffiliation: 'Hot Springs · State Engineering',
    legacyHiddenFailure: 'Legacy tags count backend + database simultaneously, hiding single-person Hall overload on parallel tasks.',
    bio: 'Designs serialized SQLite WAL engines and zero-race invite protocols.'
  },
  {
    id: 'kai',
    plannerId: 'kai',
    authPersonaId: 'builder-kai',
    displayName: 'Kai Mercer',
    initials: 'KA',
    avatarTone: 'cyan',
    role: 'Accessible Frontend & Ergonomics Engineer',
    timezone: 'UTC-6 · Hot Springs',
    utcOffset: -6,
    utcBucket: 'americas',
    windowLabel: 'T+00:00 .. T+04:00',
    startMin: 0,
    endMin: 240,
    skills: { frontend: 'supported', design: 'supported' },
    batonReady: true,
    secondaryContext: 'Civic & Accessibility Lab',
    legacyAffiliation: 'Hot Springs · Design & HCI Lab',
    legacyHiddenFailure: 'Legacy profiles hide that his T+00:00..04:00 window ends before downstream E2E integration can start.',
    bio: 'Builds WCAG 2.2 AAA interfaces, keyboard focus traps, and spatial DAG visualizers.'
  },
  {
    id: 'mateo',
    plannerId: 'mateo',
    authPersonaId: 'relay-mateo',
    displayName: 'Mateo Alvarez',
    initials: 'MA',
    avatarTone: 'violet',
    role: 'Data & Schema Reliability Specialist',
    timezone: 'UTC-5 · Toronto',
    utcOffset: -5,
    utcBucket: 'americas',
    windowLabel: 'T+00:00 .. T+03:30',
    startMin: 0,
    endMin: 210,
    skills: { database: 'supported', backend: 'unknown' },
    batonReady: false,
    secondaryContext: 'Systems University Guild',
    legacyAffiliation: 'Toronto · Waterloo Data Guild',
    legacyHiddenFailure: 'Legacy boards flatten ?backend (unverified) into a confirmed badge without checking Wildcard Omega risk.',
    bio: 'Resolves simultaneous Hall capacity contention across database and migration tracks.'
  },
  {
    id: 'amina',
    plannerId: 'amina',
    displayName: 'Amina Lindqvist',
    initials: 'AM',
    avatarTone: 'amber',
    role: 'Protocol Verification & QA Steward',
    timezone: 'UTC+1 · Berlin',
    utcOffset: 1,
    utcBucket: 'emea',
    windowLabel: 'T+02:30 .. T+06:30',
    startMin: 150,
    endMin: 390,
    skills: { integrate: 'supported', frontend: 'unknown' },
    batonReady: true,
    secondaryContext: 'Open Global Mesh',
    legacyAffiliation: 'Berlin · TU Distributed Systems',
    legacyHiddenFailure: 'Legacy view omits her mid-horizon T+02:30..06:30 bridge window between Americas and APAC.',
    bio: 'Bridges Americas and South Asia windows with clean mid-horizon contract tests.'
  },
  {
    id: 'noor',
    plannerId: 'noor',
    displayName: 'Noor Hassan',
    initials: 'NO',
    avatarTone: 'rose',
    role: 'Inclusive Interaction Designer',
    timezone: 'UTC+3 · Nairobi',
    utcOffset: 3,
    utcBucket: 'emea',
    windowLabel: 'T+02:00 .. T+06:00',
    startMin: 120,
    endMin: 360,
    skills: { design: 'supported', frontend: 'supported' },
    batonReady: true,
    secondaryContext: 'Civic & Accessibility Lab',
    legacyAffiliation: 'Nairobi · Civic Design Studio',
    legacyHiddenFailure: 'Legacy view hides how her T+02:00..06:00 window absorbs UI slack without displacing early builders.',
    bio: 'Crafts low-glare typography, 360px mobile reflows, and screen-reader schedule tables.'
  },
  {
    id: 'kenji',
    plannerId: 'kenji',
    displayName: 'Kenji Takahashi',
    initials: 'KE',
    avatarTone: 'sky',
    role: 'Async Systems & Telemetry Developer',
    timezone: 'UTC+9 · Tokyo',
    utcOffset: 9,
    utcBucket: 'apac',
    windowLabel: 'T+04:30 .. T+08:00',
    startMin: 270,
    endMin: 480,
    skills: { backend: 'supported', integrate: 'supported', design: 'unknown' },
    batonReady: true,
    secondaryContext: 'Systems University Guild',
    legacyAffiliation: 'Tokyo · Keio Systems Lab',
    legacyHiddenFailure: 'Legacy view treats UTC+9 as incompatible with UTC-6 rather than a clean late-horizon release finisher.',
    bio: 'Executes late-horizon benchmarking, SSE load probes, and final release packaging.'
  },
  {
    id: 'sanjay-steward',
    plannerId: 'sanjay-steward',
    displayName: 'Sanjay Patel',
    initials: 'SA',
    avatarTone: 'emerald',
    role: 'Cloud & Accessibility Sandbox Steward',
    timezone: 'UTC+0 · London',
    utcOffset: 0,
    utcBucket: 'emea',
    windowLabel: 'T+00:00 .. T+03:00',
    startMin: 0,
    endMin: 180,
    skills: { devops: 'supported', backend: 'supported' },
    batonReady: true,
    secondaryContext: 'Civic & Accessibility Lab',
    legacyAffiliation: 'London · Imperial Cloud Guild',
    legacyHiddenFailure: 'Legacy boards miss preventive T+00:00..03:00 prerequisite unblocking for downstream crews.',
    bio: 'Unblocks crews early by provisioning reproducible containers and CI runners.'
  },
  {
    id: 'devon',
    plannerId: 'devon',
    displayName: 'Devon Brooks',
    initials: 'DB',
    avatarTone: 'amber',
    role: 'Full-Stack API & Emerging UI Engineer',
    timezone: 'UTC-5 · NYC',
    utcOffset: -5,
    utcBucket: 'americas',
    windowLabel: 'T+00:00 .. T+04:00',
    startMin: 0,
    endMin: 240,
    skills: { frontend: 'unknown', backend: 'supported' },
    batonReady: false,
    secondaryContext: 'Systems University Guild',
    legacyAffiliation: 'NYC · Brooklyn Civic Tech',
    legacyHiddenFailure: 'Legacy profiles treat unverified ?frontend identically to confirmed work or drop him completely instead of prompting one 5-minute check.',
    bio: 'Builds resilient APIs and accessible UI components with transparent skill verification.'
  },
  {
    id: 'liam',
    plannerId: 'liam',
    displayName: 'Liam Ortiz',
    initials: 'LO',
    avatarTone: 'cyan',
    role: 'Frontend Component & Keyboard Specialist',
    timezone: 'UTC-6 · Austin',
    utcOffset: -6,
    utcBucket: 'americas',
    windowLabel: 'T+00:00 .. T+03:00',
    startMin: 0,
    endMin: 180,
    skills: { frontend: 'supported' },
    batonReady: false,
    secondaryContext: 'Regional Builder Collective',
    legacyAffiliation: 'Austin · Open Web Guild',
    legacyHiddenFailure: 'Legacy boards rank his high UTC-6 overlap above UTC+5:30 baton finishers even when UI is already covered!',
    bio: 'Delivers crisp accessible React interfaces and zero-jank keyboard navigation.'
  }
];

export function extractBaseHandleFromActorId(rawInput) {
  const raw = String(rawInput || '').trim().toLowerCase();
  if (!raw) return '';
  if (raw === 'leader-aurora' || raw.startsWith('aurora-')) return 'aurora';
  if (raw === 'builder-kai' || raw.startsWith('kai-')) return 'kai';
  if (raw === 'builder-priya' || raw.startsWith('priya-')) return 'priya';
  if (raw === 'relay-mateo' || raw.startsWith('mateo-')) return 'mateo';
  const memMatch = /^mem-([a-z]{2,14})-/.exec(raw);
  if (memMatch && !/^\d+$/.test(memMatch[1])) {
    const slug = memMatch[1];
    if (slug === 'sanjay' || slug === 'sanjaystew') return 'sanjay-steward';
    return slug;
  }
  const normalized = normalizeBuilderId(raw);
  if (normalized === 'sanjay') return 'sanjay-steward';
  const stripped = normalized.replace(/^(leader|builder|relay|lead|mem|claimant)-/, '');
  const seg = stripped.split(/[^a-z0-9]+/).find(part => part && !/^\d+$/.test(part));
  if (seg === 'sanjay' || seg === 'sanjaystew') return 'sanjay-steward';
  return seg || normalized;
}

export function reconstructSeatedTeamPeople(serverMembers = [], savedPeople = [], horizonMin = 480) {
  const savedById = new Map(
    (savedPeople || []).map(p => [normalizeBuilderId(p.plannerId || p.id), p])
  );
  const scaleRatio = horizonMin > 0 && horizonMin !== 480 ? horizonMin / 480 : 1;
  const out = [];
  const seen = new Set();

  for (const m of serverMembers || []) {
    const rawUserId = typeof m === 'string' ? m : m?.userId;
    if (!rawUserId) continue;
    const baseHandle = extractBaseHandleFromActorId(rawUserId);
    const saved = savedById.get(baseHandle) || savedById.get(normalizeBuilderId(rawUserId));
    if (saved) {
      const cid = normalizeBuilderId(saved.plannerId || saved.id);
      if (seen.has(cid)) continue;
      seen.add(cid);
      out.push({
        id: cid,
        timezone: saved.timezone || 'UTC-6 · Hot Springs',
        startMin: saved.startMin ?? 0,
        endMin: saved.endMin ?? horizonMin,
        skills: { ...(saved.skills || {}) }
      });
      continue;
    }

    const dirMatch = BUILDER_DIRECTORY.find(
      b =>
        normalizeBuilderId(b.id) === baseHandle ||
        normalizeBuilderId(b.plannerId) === baseHandle ||
        b.id.startsWith(`${baseHandle}-`)
    );
    if (dirMatch) {
      const cid = normalizeBuilderId(dirMatch.plannerId || dirMatch.id);
      if (seen.has(cid)) continue;
      seen.add(cid);
      const scaledStart = Math.max(0, Math.min(horizonMin - 15, Math.round(dirMatch.startMin * scaleRatio)));
      const scaledEnd = Math.max(scaledStart + 15, Math.min(horizonMin, Math.round(dirMatch.endMin * scaleRatio)));
      out.push({
        id: cid,
        timezone: dirMatch.timezone,
        startMin: scaledStart,
        endMin: scaledEnd,
        skills: { ...(dirMatch.skills || {}) }
      });
    }
  }
  return out;
}

export function mergeCandidatePoolWithDirectory(teamPeople = [], explicitCandidates = [], horizonMin = 480) {
  const cap = Math.max(60, Math.round(Number(horizonMin) || 480));
  const teamIds = new Set(
    (teamPeople || []).map(p => normalizeBuilderId(p?.plannerId || p?.id)).filter(Boolean)
  );
  const merged = [];
  const seen = new Set();

  for (const c of explicitCandidates || []) {
    if (!c) continue;
    const cid = normalizeBuilderId(c.plannerId || c.id);
    if (!cid || teamIds.has(cid) || seen.has(cid)) continue;
    seen.add(cid);
    merged.push({
      ...c,
      id: cid,
      startMin: Math.max(0, Math.min(cap - 15, Math.round(Number(c.startMin) || 0))),
      endMin: Math.max(15, Math.min(cap, Math.round(Number(c.endMin) || cap))),
      skills: { ...(c.skills || {}) }
    });
  }

  const scaleRatio = cap !== 480 ? cap / 480 : 1;
  for (const b of BUILDER_DIRECTORY) {
    const bid = normalizeBuilderId(b.plannerId || b.id);
    if (!bid || teamIds.has(bid) || seen.has(bid)) continue;
    seen.add(bid);
    const scaledStart = Math.max(0, Math.min(cap - 15, Math.round(b.startMin * scaleRatio)));
    const scaledEnd = Math.max(scaledStart + 15, Math.min(cap, Math.round(b.endMin * scaleRatio)));
    merged.push({
      id: bid,
      timezone: b.timezone,
      startMin: scaledStart,
      endMin: scaledEnd,
      skills: { ...(b.skills || {}) }
    });
  }

  return merged.slice(0, Math.max(0, 24 - Math.max(1, teamPeople.length)));
}

const ARCHETYPES = [
  {
    mission: 'Local-first emergency mesh triage & SMS relay',
    skills: ['backend', 'frontend', 'integrate'],
    utcLabel: 'UTC-6 <-> UTC+5:30 Baton',
    utcBucket: 'baton',
    context: 'Open Global Mesh',
    scenarioKey: 'baton',
    fullReadinessHint: 'ROSTER_CONFIRMED'
  },
  {
    mission: 'Zero-downtime civic transit schedule & SQLite sync',
    skills: ['backend', 'database', 'frontend'],
    utcLabel: 'Americas (UTC-6..UTC-4)',
    utcBucket: 'americas',
    context: 'Regional Builder Collective',
    scenarioKey: 'hall',
    fullReadinessHint: 'ROSTER_CONFIRMED'
  },
  {
    mission: 'Screen-reader math & tactile STEM lab notebook',
    skills: ['frontend', 'design', 'backend'],
    utcLabel: 'EMEA (UTC+0..UTC+3)',
    utcBucket: 'emea',
    context: 'Civic & Accessibility Lab',
    scenarioKey: 'omega',
    fullReadinessHint: 'PLAN_FEASIBLE_PENDING_ACCEPTANCE'
  },
  {
    mission: 'Reproducible open-science benchmark & CI runner',
    skills: ['devops', 'backend', 'integrate'],
    utcLabel: 'APAC (UTC+5:30..UTC+9)',
    utcBucket: 'apac',
    context: 'Systems University Guild',
    scenarioKey: 'prereq',
    fullReadinessHint: 'ROSTER_CONFIRMED'
  },
  {
    mission: 'Async cross-continent accessibility audit pipeline',
    skills: ['frontend', 'integrate', 'devops'],
    utcLabel: 'UTC-5 <-> UTC+5:30 Baton',
    utcBucket: 'baton',
    context: 'Civic & Accessibility Lab',
    scenarioKey: 'baton',
    fullReadinessHint: 'PLAN_FEASIBLE_PENDING_ACCEPTANCE'
  },
  {
    mission: 'Cryptographic receipt ledger for community micro-grants',
    skills: ['backend', 'database', 'design'],
    utcLabel: 'EMEA / Americas Overlap',
    utcBucket: 'emea',
    context: 'Open Global Mesh',
    scenarioKey: 'hall',
    fullReadinessHint: 'ROSTER_CONFIRMED'
  }
];

function hashString(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h >>> 0);
}

export function deriveCrewProfile(team, verifiedCrewMap = {}, customCrewMap = {}, eventId = 'seed-event') {
  const tid = team.team_id || 'crew';
  const custom = customCrewMap[`${eventId}::${tid}`] || customCrewMap[tid] || null;
  const h = hashString(tid);
  const arch = custom
    ? {
        mission: custom.mission,
        skills: custom.skills,
        utcLabel: custom.utcLabel || 'UTC-6 <-> UTC+5:30 Baton',
        utcBucket: custom.utcBucket || 'baton',
        context: custom.secondaryContext || 'Open Global Mesh',
        scenarioKey: custom.scenarioKey || 'baton',
        fullReadinessHint: 'PLAN_FEASIBLE_PENDING_ACCEPTANCE'
      }
    : ARCHETYPES[h % ARCHETYPES.length];

  const members = Number(team.members || 0);
  const maxSize = Number(team.max_size || 5);
  const openSeats = Math.max(0, maxSize - members);

  let seatState = 'open';
  if (openSeats === 0) seatState = 'full';
  else if (openSeats === 1) seatState = 'final-seat';

  const verifiedStatus = verifiedCrewMap[`${eventId}::${tid}`] || verifiedCrewMap[tid];
  let lifecycle = 'FORMING';
  let lifecycleLabel = 'Open to Teammates';
  let lifecycleSub = `${openSeats} open ${openSeats === 1 ? 'seat' : 'seats'} · Matching complementary skills`;
  let legacyHiddenFailure = 'Legacy view hides UTC handoff windows, so builders outside the leader timezone appear incompatible.';

  if (verifiedStatus === 'FEASIBLE_WITNESS') {
    lifecycle = openSeats > 0 ? 'PLAN_FEASIBLE_PENDING_ACCEPTANCE' : 'FEASIBLE_VERIFIED';
    lifecycleLabel = openSeats > 0 ? 'Plan Verified · Open Seat' : 'Verified Ready to Ship';
    lifecycleSub = openSeats > 0
      ? 'Critical-path verified · Awaiting seat acceptance'
      : 'Seats confirmed & critical-path witness verified';
    legacyHiddenFailure = 'Legacy view strips critical-path proof, making verified baton crews indistinguishable from double-booked rosters.';
  } else if (openSeats === 0) {
    lifecycle = 'ROSTER_CONFIRMED';
    lifecycleLabel = 'Seats Full · Unverified Plan';
    lifecycleSub = 'Seats 100% full · Deliverable DAG not yet verified';
    legacyHiddenFailure = 'Legacy view labels 5/5 seats "Complete" even when parallel backend + database tasks overload one member!';
  } else if (openSeats === 1) {
    lifecycle = 'PLAN_FEASIBLE_PENDING_ACCEPTANCE';
    lifecycleLabel = 'Plan Verified · Open Seat';
    lifecycleSub = '1 scarce final seat left · Contention-protected';
    legacyHiddenFailure = 'Legacy boards lack serialized single-use seat locks on the final open seat and hide required handoff hours.';
  }

  return {
    teamId: tid,
    leader: team.leader,
    members,
    maxSize,
    openSeats,
    seatState,
    mission: arch.mission,
    skills: arch.skills,
    utcLabel: arch.utcLabel,
    utcBucket: arch.utcBucket,
    secondaryContext: arch.context,
    scenarioKey: arch.scenarioKey,
    batonPassReady: arch.utcBucket === 'baton',
    isCustomMission: Boolean(custom),
    lifecycle,
    lifecycleLabel,
    lifecycleSub,
    legacyHiddenFailure
  };
}

export const WALKTHROUGH_STEPS = [
  {
    time: '0:00 - 0:45',
    title: '1. Find teammates & test schedule fit in place',
    detail:
      'Open "1. Find teammates", toggle "Purpose-First View" vs "Compare Profile-Only", then click "Try in plan" on Priya Nair (UTC+5:30) to watch "Plan incomplete: 2 of 3 tasks covered" turn into "Plan works: all tasks and hours line up" in Column 2.',
    targetView: 'discover',
    actionLabel: 'Open 1. Find teammates'
  },
  {
    time: '0:45 - 1:45',
    title: '2. Cross-timezone handoff & Compare Before / After Wipe',
    detail:
      'Open "2. Plan the work" on example "1. Different time zones, clean handoff", add Priya so Arkansas (UTC-6) hands off cleanly to Bengaluru (UTC+5:30) with 0m simultaneous overlap, then click "Compare Before / After Wipe" to drag the timeline comparison.',
    targetView: 'architect',
    scenarioKey: 'baton',
    actionLabel: 'Open 2. Plan the work (Handoff)'
  },
  {
    time: '1:45 - 2:35',
    title: '3. Double-booked fix (+ Try Mateo) & zero-question skill check',
    detail:
      'Switch to example "2. One person double-booked on two tasks" and click "+ Try Mateo (UTC-5)" or "Try Mateo in plan" in Column 2 (fixes overload with 0 teammates replaced), then inspect example "3. Unverified skill: when backup covers it vs. quick check".',
    targetView: 'architect',
    scenarioKey: 'hall',
    actionLabel: 'Open 2. Plan the work (Double-booked)'
  },
  {
    time: '2:35 - 3:45',
    title: '4. Offline outbox -> Send through Mateo -> Reconnect check',
    detail:
      'Open "3. Manage your team": click "Send through Mateo" directly (self-arming) or run "Prepare example team" -> "1B. Save join request on device" -> "Send through Mateo" -> "Reconnect & check request" (replayed: true, 0 duplicate spots), or click "Request Invite & Join Open Spot" on any open team.',
    targetView: 'authority',
    actionLabel: 'Open 3. Manage your team'
  },
  {
    time: '3:45 - 5:00',
    title: '5. 50-person last-spot test & 176-check verification proof',
    detail:
      'Open "4. Test the last spot" and click "Run 50-person last-spot test" to watch 50 simultaneous requests hit 1 open spot: 1 joined, 49 turned away cleanly at 2/2, with oversize=0, orphanLeader=0, and eventMismatch=0.',
    targetView: 'arena',
    actionLabel: 'Open 4. Test the last spot'
  }
];

function extractWindows(person, horizonMin = 480) {
  const cap = Math.max(15, Math.round(Number(horizonMin) || 480));
  if (!person) return [];
  if (Array.isArray(person.windows) && person.windows.length > 0) {
    return person.windows
      .map(w => ({
        start: Math.max(0, Math.min(cap, Math.round(Number(w.start) || 0))),
        end: Math.max(0, Math.min(cap, Math.round(Number(w.end) || cap)))
      }))
      .filter(w => w.end > w.start);
  }
  const s = Math.max(0, Math.min(cap, Math.round(Number(person.startMin ?? 0))));
  const e = Math.max(0, Math.min(cap, Math.round(Number(person.endMin ?? cap))));
  return e > s ? [{ start: s, end: e }] : [];
}

export function computeWallClockOverlapMin(cand, teamPeople = [], horizonMin = 480) {
  const cap = Math.max(15, Math.round(Number(horizonMin) || 480));
  const candWins = extractWindows(cand, cap);
  if (candWins.length === 0 || !Array.isArray(teamPeople) || teamPeople.length === 0) return 0;

  const teamWins = teamPeople.filter(p => p && p.consent !== false).flatMap(p => extractWindows(p, cap));
  if (teamWins.length === 0) return 0;

  const overlaps = [];
  for (const cw of candWins) {
    for (const tw of teamWins) {
      const s = Math.max(cw.start, tw.start);
      const e = Math.min(cw.end, tw.end);
      if (e > s) overlaps.push({ start: s, end: e });
    }
  }
  if (overlaps.length === 0) return 0;

  overlaps.sort((a, b) => a.start - b.start || a.end - b.end);
  const merged = [overlaps[0]];
  for (let i = 1; i < overlaps.length; i++) {
    const cur = overlaps[i];
    const last = merged[merged.length - 1];
    if (cur.start <= last.end) {
      last.end = Math.max(last.end, cur.end);
    } else {
      merged.push({ ...cur });
    }
  }
  const total = merged.reduce((sum, iv) => sum + (iv.end - iv.start), 0);
  return Math.min(cap, total);
}

export function formatRecommendationExplanation(rec, cand, teamPeople = [], horizonMin = 480) {
  const raw = String(rec?.explanation || '');
  if (!raw) return '';
  if (rec?.asyncBatonPass) return raw;
  const wallMin = computeWallClockOverlapMin(cand, teamPeople, horizonMin);
  return raw.replace(/Shares\s+\d+m\s+synchronous\s+UTC\s+overlap/gi, `Shares ${wallMin}m synchronous UTC overlap`);
}

export function findBuilderById(idOrBuilder, extraPools = []) {
  const rawKey =
    typeof idOrBuilder === 'string'
      ? idOrBuilder
      : idOrBuilder?.plannerId || idOrBuilder?.id || '';
  const canonId = normalizeBuilderId(rawKey);
  if (!canonId) return null;

  const dirMatch = BUILDER_DIRECTORY.find(
    b =>
      normalizeBuilderId(b.id) === canonId ||
      normalizeBuilderId(b.plannerId) === canonId ||
      b.authPersonaId === rawKey
  );

  for (const pool of extraPools) {
    if (!Array.isArray(pool)) continue;
    const found = pool.find(
      item =>
        item &&
        (normalizeBuilderId(item.plannerId || item.id) === canonId || item.id === rawKey)
    );
    if (found) {
      return {
        ...(dirMatch || {}),
        ...found,
        id: canonId,
        plannerId: canonId,
        displayName: found.displayName || dirMatch?.displayName || canonId,
        timezone: found.timezone || dirMatch?.timezone || 'UTC-6 · Hot Springs',
        startMin: found.startMin ?? dirMatch?.startMin ?? 0,
        endMin: found.endMin ?? dirMatch?.endMin ?? 240,
        skills: { ...(dirMatch?.skills || {}), ...(found.skills || {}) }
      };
    }
  }

  if (typeof idOrBuilder === 'object' && idOrBuilder !== null && idOrBuilder.skills) {
    return {
      ...(dirMatch || {}),
      ...idOrBuilder,
      id: canonId,
      plannerId: canonId,
      displayName: idOrBuilder.displayName || dirMatch?.displayName || canonId,
      timezone: idOrBuilder.timezone || dirMatch?.timezone || 'UTC-6 · Hot Springs',
      startMin: idOrBuilder.startMin ?? dirMatch?.startMin ?? 0,
      endMin: idOrBuilder.endMin ?? dirMatch?.endMin ?? 240,
      skills: { ...(idOrBuilder.skills || {}) }
    };
  }

  if (dirMatch) {
    return {
      ...dirMatch,
      id: canonId,
      plannerId: canonId,
      skills: { ...(dirMatch.skills || {}) }
    };
  }

  for (const sc of Object.values(MISSION_SCENARIOS)) {
    const scPools = [sc.teamPeople, sc.robustTeamPeople, sc.candidates];
    for (const pool of scPools) {
      if (!Array.isArray(pool)) continue;
      const found = pool.find(p => normalizeBuilderId(p.id) === canonId);
      if (found) {
        return {
          ...found,
          id: canonId,
          plannerId: canonId,
          displayName: found.displayName || canonId,
          skills: { ...(found.skills || {}) }
        };
      }
    }
  }

  return {
    id: canonId,
    plannerId: canonId,
    displayName: canonId,
    timezone: 'UTC-6 · Hot Springs',
    startMin: 0,
    endMin: 240,
    skills: { backend: 'supported' }
  };
}

export function computePartialTaskPreview(tasks = [], teamPeople = [], horizonMin = 480, plan = null) {
  const map = new Map();
  if (plan?.witness?.assignments?.length) {
    for (const asg of plan.witness.assignments) {
      map.set(asg.taskId, { ...asg, readyOnly: false });
    }
    return map;
  }
  if (!Array.isArray(tasks) || tasks.length === 0 || !Array.isArray(teamPeople) || teamPeople.length === 0) {
    return map;
  }

  const cpById = new Map((plan?.criticalPath || []).map(m => [m.taskId, m]));
  const normalizedPeople = teamPeople
    .filter(p => p && p.consent !== false)
    .map(p => ({
      id: normalizeBuilderId(p.plannerId || p.id) || String(p.id || 'builder'),
      startMin: Math.max(0, Math.round(Number(p.startMin) || 0)),
      endMin: Math.max(15, Math.round(Number(p.endMin) || horizonMin)),
      skills: p.skills || {}
    }));

  // Compute true backward latestFinishMin / latestStartMin when plan.criticalPath is absent
  const byId = new Map(tasks.map(t => [t.id, t]));
  const inDeg = new Map();
  const children = new Map();
  for (const t of tasks) {
    inDeg.set(t.id, 0);
    children.set(t.id, []);
  }
  for (const t of tasks) {
    const validDeps = Array.from(new Set((t.after || []).filter(d => d !== t.id && byId.has(d))));
    inDeg.set(t.id, validDeps.length);
    for (const d of validDeps) {
      children.get(d).push(t.id);
    }
  }

  // Quick DFS topological pass to derive backward deadlines when cpById is missing
  const dfsVisited = new Set();
  const dfsTopo = [];
  function visitMeta(tid, stack = new Set()) {
    if (dfsVisited.has(tid) || stack.has(tid) || !byId.has(tid)) return;
    stack.add(tid);
    const t = byId.get(tid);
    for (const dep of t.after || []) {
      if (dep !== tid && byId.has(dep)) visitMeta(dep, stack);
    }
    stack.delete(tid);
    dfsVisited.add(tid);
    dfsTopo.push(t);
  }
  for (const t of tasks) visitMeta(t.id);

  const fallbackLf = new Map();
  const fallbackLs = new Map();
  for (let i = dfsTopo.length - 1; i >= 0; i--) {
    const t = dfsTopo[i];
    const dur = Math.max(1, Math.round(Number(t.durationMin) || 60));
    const hasOwnDl =
      t.deadlineMin !== undefined &&
      t.deadlineMin !== null &&
      t.deadlineMin !== '' &&
      Number.isFinite(Number(t.deadlineMin));
    let lFin = hasOwnDl ? Math.min(horizonMin, Math.round(Number(t.deadlineMin))) : horizonMin;
    for (const chId of children.get(t.id) || []) {
      if (fallbackLs.has(chId)) {
        const ch = byId.get(chId);
        const chLag = Math.max(0, Math.round(Number(ch?.lagMin) || 0));
        lFin = Math.min(lFin, fallbackLs.get(chId) - chLag);
      }
    }
    fallbackLf.set(t.id, lFin);
    fallbackLs.set(t.id, lFin - dur);
  }

  function eddKey(taskObj) {
    const cp = cpById.get(taskObj.id);
    const dur = Math.max(1, Math.round(Number(taskObj.durationMin) || 60));
    const latestFin = cp
      ? Math.min(horizonMin, cp.latestFinishMin)
      : (fallbackLf.get(taskObj.id) ?? horizonMin);
    const latestStart =
      cp && typeof cp.latestStartMin === 'number'
        ? cp.latestStartMin
        : (fallbackLs.get(taskObj.id) ?? latestFin - dur);
    return { latestStart, latestFin, dur };
  }

  const readyQueue = tasks.filter(t => (inDeg.get(t.id) || 0) === 0);
  const topo = [];
  const queuedIds = new Set(readyQueue.map(t => t.id));

  while (readyQueue.length > 0) {
    readyQueue.sort((a, b) => {
      const ka = eddKey(a);
      const kb = eddKey(b);
      return (
        ka.latestFin - kb.latestFin ||
        ka.latestStart - kb.latestStart ||
        String(a.id).localeCompare(String(b.id))
      );
    });
    const nextTask = readyQueue.shift();
    topo.push(nextTask);
    for (const childId of children.get(nextTask.id) || []) {
      const rem = (inDeg.get(childId) || 1) - 1;
      inDeg.set(childId, rem);
      if (rem === 0 && !queuedIds.has(childId) && byId.has(childId)) {
        queuedIds.add(childId);
        readyQueue.push(byId.get(childId));
      }
    }
  }
  for (const t of tasks) {
    if (!queuedIds.has(t.id)) topo.push(t);
  }

  const goalSkillSet = new Set(topo.map(t => t.skill));
  const versatility = new Map(
    normalizedPeople.map(p => [
      p.id,
      Object.keys(p.skills || {}).filter(
        sk => goalSkillSet.has(sk) && p.skills[sk] === 'supported'
      ).length
    ])
  );

  const busyByPerson = new Map();
  const completedEnd = new Map();

  for (const t of topo) {
    const deps = (t.after || []).filter(d => byId.has(d));
    let depsReady = true;
    let readyMin = 0;
    const lag = Math.max(0, Math.round(Number(t.lagMin) || 0));
    for (const dep of deps) {
      if (!completedEnd.has(dep)) {
        depsReady = false;
        break;
      }
      readyMin = Math.max(readyMin, completedEnd.get(dep) + lag);
    }
    if (!depsReady) continue;

    const cp = cpById.get(t.id);
    const latestFin = cp
      ? Math.min(horizonMin, cp.latestFinishMin)
      : (fallbackLf.get(t.id) ?? horizonMin);
    const dur = Math.max(1, Math.round(Number(t.durationMin) || 60));

    const eligible = normalizedPeople
      .filter(p => p.skills[t.skill] === 'supported' || p.skills[t.skill] === 'unknown')
      .sort((a, b) => {
        const aSup = a.skills[t.skill] === 'supported' ? 0 : 1;
        const bSup = b.skills[t.skill] === 'supported' ? 0 : 1;
        if (aSup !== bSup) return aSup - bSup;
        const vDiff = (versatility.get(a.id) || 0) - (versatility.get(b.id) || 0);
        if (vDiff !== 0) return vDiff;
        return a.id.localeCompare(b.id);
      });

    for (const p of eligible) {
      const busy = (busyByPerson.get(p.id) || []).sort((x, y) => x.startMin - y.startMin);
      let start = Math.max(p.startMin, readyMin);
      let shifted = true;
      while (shifted) {
        shifted = false;
        for (const b of busy) {
          if (start < b.endMin && start + dur > b.startMin) {
            start = b.endMin;
            shifted = true;
          }
        }
      }
      if (start + dur <= p.endMin && start + dur <= latestFin) {
        const end = start + dur;
        const entry = {
          taskId: t.id,
          personId: p.id,
          skill: t.skill,
          startMin: start,
          endMin: end,
          evidence: p.skills[t.skill],
          readyOnly: true
        };
        map.set(t.id, entry);
        completedEnd.set(t.id, end);
        busyByPerson.set(p.id, [...busy, entry]);
        break;
      }
    }
  }

  return map;
}

const FRIENDLY_SKILL_NOUNS = {
  integrate: 'Integration',
  backend: 'Backend API',
  frontend: 'Frontend UI',
  database: 'Database',
  devops: 'Cloud Setup',
  design: 'Design'
};

export function describePlainPlanVerdict(plan, tasks = [], partialPreview = new Map()) {
  const total = tasks.length;
  if (total === 0) {
    return {
      tone: 'warn',
      coveredCount: 0,
      totalCount: 0,
      headline: 'Plan incomplete: 0 tasks defined',
      detail: 'Add at least 1 task to check the team schedule.'
    };
  }

  if (plan?.status === 'FEASIBLE_WITNESS') {
    return {
      tone: 'ok',
      coveredCount: total,
      totalCount: total,
      headline: 'Plan works: all tasks and hours line up',
      detail: `All ${total} of ${total} tasks are covered within the deadline.`
    };
  }

  if (plan?.status === 'CONDITIONAL_WITNESS') {
    const guards = plan?.witness?.guards || [];
    const n = Math.max(1, guards.length);
    const first = guards[0];
    return {
      tone: 'warn',
      coveredCount: total,
      totalCount: total,
      headline: `Almost ready: confirm ${n} unverified ${n === 1 ? 'skill' : 'skills'}`,
      detail: first
        ? `Confirm ${first.personId}'s ${first.taskId} skill to lock the schedule.`
        : 'Confirm unverified skills to finalize the schedule.'
    };
  }

  const coveredIds = new Set([
    ...(plan?.witness?.assignments || []).map(a => a.taskId),
    ...(partialPreview instanceof Map ? [...partialPreview.keys()] : [])
  ]);
  const coveredCount = tasks.filter(t => coveredIds.has(t.id)).length;
  const missingTasks = tasks.filter(t => !coveredIds.has(t.id));
  const missingLabel =
    missingTasks.length > 0
      ? missingTasks
          .slice(0, 2)
          .map(t => FRIENDLY_SKILL_NOUNS[t.skill] || t.id)
          .join(', ')
      : 'schedule fit';

  return {
    tone: 'warn',
    coveredCount,
    totalCount: total,
    headline: `Plan incomplete: ${coveredCount} of ${total} tasks covered (needs ${missingLabel})`,
    detail:
      missingTasks.length > 0
        ? `Try a teammate who covers ${missingLabel} in the needed time window.`
        : 'Adjust task hours or add a teammate to relieve the bottleneck.'
  };
}

export function visualTasksToApi(tasks) {
  const seen = new Set();
  const normalized = (tasks || []).map((t, idx) => {
    let baseId = String(t.id || '').replace(/[^A-Za-z0-9_.:@-]/g, '').trim() || `task-${idx + 1}`;
    let id = baseId;
    let suffix = 2;
    while (seen.has(id)) {
      id = `${baseId}-${suffix++}`;
    }
    seen.add(id);
    const hasDeadline = t.deadlineMin !== undefined && t.deadlineMin !== null && t.deadlineMin !== '' && Number.isFinite(Number(t.deadlineMin));
    return {
      id,
      skill: String(t.skill || 'backend').replace(/[^A-Za-z0-9_.:@-]/g, '').trim() || 'backend',
      durationMin: Math.max(1, Math.round(Number(t.durationMin) || 60)),
      ...(Number(t.lagMin) > 0 ? { lagMin: Math.round(Number(t.lagMin)) } : {}),
      ...(hasDeadline ? { deadlineMin: Math.max(1, Math.round(Number(t.deadlineMin))) } : {}),
      rawAfter: Array.isArray(t.after) ? t.after.filter(Boolean) : []
    };
  });
  return normalized.map(t => ({
    id: t.id,
    skill: t.skill,
    durationMin: t.durationMin,
    ...(t.lagMin ? { lagMin: t.lagMin } : {}),
    ...(t.deadlineMin !== undefined ? { deadlineMin: t.deadlineMin } : {}),
    after: t.rawAfter.filter(dep => dep !== t.id && seen.has(dep))
  }));
}

export function visualPeopleToApi(people, horizonMin) {
  const seen = new Set();
  const out = [];
  for (let idx = 0; idx < (people || []).length; idx++) {
    const p = people[idx];
    if (!p) continue;
    const rawId = normalizeBuilderId(p.plannerId || p.id) || String(p.id || '').replace(/[^A-Za-z0-9_.:@-]/g, '').trim() || `builder-${idx + 1}`;
    if (seen.has(rawId)) continue;
    seen.add(rawId);
    const start = Math.max(0, Math.round(Number(p.startMin) || 0));
    const end = Math.max(start + 15, Math.min(Math.max(horizonMin, start + 15), Math.round(Number(p.endMin) || horizonMin)));
    const abilities = {};
    for (const [sk, st] of Object.entries(p.skills || {})) {
      if (st === 'supported') abilities[sk] = { support: true, refute: false };
      else if (st === 'unknown') abilities[sk] = { support: false, refute: false };
    }
    out.push({
      id: rawId,
      timezone: p.timezone || `T+${start}m..T+${end}m`,
      abilities,
      windows: [{ start, end }],
      consent: p.consent !== false
    });
  }
  return out;
}

export function tasksToDsl(tasks) {
  return tasks
    .map(t => {
      const deps = (t.after || []).join('|');
      const lag = Number(t.lagMin) > 0 ? `,${t.lagMin}` : '';
      return `${t.id},${t.skill},${t.durationMin}${deps || lag ? ',' + deps : ''}${lag}`;
    })
    .join('\n');
}

export function dslToTasks(dsl) {
  return dsl
    .split('\n')
    .map(r => r.trim())
    .filter(Boolean)
    .map(row => {
      const [id = 'task', skill = 'backend', dur = '60', deps = '', lag = '0'] = row.split(',').map(s => s.trim());
      return {
        id,
        title: id,
        skill,
        durationMin: Math.max(5, Number(dur) || 60),
        lagMin: Math.max(0, Number(lag) || 0),
        after: deps ? deps.split('|').map(s => s.trim()).filter(Boolean) : []
      };
    });
}

export function peopleToDsl(people) {
  return people
    .map(p => {
      const skParts = Object.entries(p.skills || {})
        .filter(([, st]) => st === 'supported' || st === 'unknown')
        .map(([sk, st]) => (st === 'unknown' ? `?${sk}` : sk));
      return `${p.id}@${p.startMin}-${p.endMin}:${skParts.join('|')}`;
    })
    .join('\n');
}

export function dslToPeople(dsl, horizonMin = 480) {
  return dsl
    .split('\n')
    .map(r => r.trim())
    .filter(Boolean)
    .map(row => {
      const [left = 'builder', right = ''] = row.split(':');
      const [rawId = 'builder', win = ''] = left.trim().split('@');
      let startMin = 0;
      let endMin = horizonMin;
      if (win && win.includes('-')) {
        const [ws, we] = win.split('-').map(n => Number(n.trim()));
        if (Number.isFinite(ws) && Number.isFinite(we) && we > ws) {
          startMin = ws;
          endMin = we;
        }
      }
      const skills = {};
      for (const token of right.split('|').map(s => s.trim()).filter(Boolean)) {
        if (token.startsWith('?')) skills[token.slice(1)] = 'unknown';
        else skills[token] = 'supported';
      }
      return {
        id: rawId.trim(),
        timezone: `T+${startMin}m..T+${endMin}m`,
        startMin,
        endMin,
        skills
      };
    });
}
