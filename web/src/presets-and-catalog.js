// H4H PS1 | Purpose-First Scenarios, Custom Crew Overlay, Builder Pool & DSL Helpers

const CUSTOM_CREW_STORAGE_KEY = 'h4h-ps1:custom-crews:v1';

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
  if (typeof window === 'undefined') return {};
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
  const next = {
    ...current,
    [scopedKey]: {
      mission: String(entry.mission || '').trim() || 'Custom purpose-driven deliverable',
      skills: Array.isArray(entry.skills) && entry.skills.length > 0 ? entry.skills : ['backend', 'frontend'],
      utcLabel: entry.utcLabel || 'UTC-6 <-> UTC+5:30 Baton',
      utcBucket: entry.utcBucket || 'baton',
      secondaryContext: entry.secondaryContext || 'Open Global Mesh',
      scenarioKey: entry.scenarioKey || 'baton'
    }
  };
  if (typeof window !== 'undefined') {
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
    code: 'Scenario A',
    title: 'Async UTC Baton-Pass',
    subtitle: 'Hot Springs (UTC-6) + Bengaluru (UTC+5:30) · 0m overlap, ships early!',
    summary:
      'Aurora and Kai work T+0..240m in Arkansas (UTC-6). Priya works T+240..480m in Bengaluru (UTC+5:30) with 0m simultaneous overlap, yet directed task dependencies align cleanly so adding Priya flips INFEASIBLE to FEASIBLE_WITNESS with +150m deadline slack.',
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
    code: 'Scenario B',
    title: 'Hall Capacity Contention',
    subtitle: 'Why naive skill-tag union fails on simultaneous deadlines (0-displacement repair)',
    summary:
      'Roster {Aurora, Kai} looks 100% covered on a static badge checklist (backend, database, frontend). Yet api-cutover and schema-migration both require 120m inside a 120m window, overloading Aurora. Synchronicity isolates the 1-role Hall deficit and adds Mateo with 0 displaced members.',
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
    code: 'Scenario C',
    title: 'Wildcard Omega & P9R Gate',
    subtitle: 'Contrast Shannon VOI prompt (?skill) vs. EXISTS_FORALL_ROBUST zero-question stop',
    summary:
      'Toggle between Contingent Mode (Devon holds unverified ?frontend -> solver computes exact 1.0000-bit Shannon VOI micro-work-sample prompt) and Robust Mode (Kai provides verified frontend backup -> P9R emits ALREADY_SUFFICIENT_ZERO_QUESTIONS without interrogating Aurora!).',
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
    code: 'Scenario D',
    title: 'Preventive Prerequisite Support',
    subtitle: 'Unlock a blocked 3-member crew by provisioning missing DevOps/A11y environment support',
    summary:
      'Aurora, Kai, and Priya cover backend, frontend, and integration, while upstream cloud/accessibility runner provisioning (devops) is unverified, blocking the DAG. Granting preventive prerequisite support unlocks FEASIBLE_WITNESS with 0 accepted members replaced.',
    goalDescription: 'Provision reproducible CI + accessibility test runner, build core platform, and pass full E2E verification',
    horizonHours: 6,
    tasks: [
      { id: 'sandbox-prereq', title: 'Cloud & A11y Runner Prerequisite', skill: 'devops', durationMin: 45, lagMin: 0, after: [] },
      { id: 'authority-api', title: 'SQLite Serialized Seat API', skill: 'backend', durationMin: 105, lagMin: 0, after: ['sandbox-prereq'] },
      { id: 'client-views', title: 'Calm-FOV Crew Views', skill: 'frontend', durationMin: 120, lagMin: 0, after: ['sandbox-prereq'] },
      { id: 'gate-suite', title: '97-Check Gate & Race Oracle', skill: 'integrate', durationMin: 60, lagMin: 0, after: ['authority-api', 'client-views'] }
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
  }
];

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
    title: '1. Live Split Teammates Studio & Product Lens Switcher',
    detail: 'Compare Purpose-First Glass (PS1) vs Legacy Profile-Only View on View 1, simulate Priya (UTC+5:30) right inside the Live Crew Dock, and watch the critical-path witness light up in place.',
    targetView: 'discover',
    actionLabel: 'Open Teammates & Crews'
  },
  {
    time: '0:45 - 1:45',
    title: '2. Async UTC Baton-Pass & Before/After DAG Split-Wipe',
    detail: 'Inspect Scenario A in Mission Planner: 0m simultaneous overlap between Arkansas and India, flipping Blocked to Verified Ready to Ship with an interactive Before/After SVG DAG wipe.',
    targetView: 'architect',
    scenarioKey: 'baton',
    actionLabel: 'Load Scenario A (Baton-Pass)'
  },
  {
    time: '1:45 - 2:35',
    title: '3. Hall Capacity Contention & Wildcard Omega Zero-Question Gate',
    detail: 'Load Scenario B ({Aurora, Kai} simultaneous backend+database overload -> 0-displacement repair adding Mateo) and Scenario C (Zero-Question robust cover vs Shannon VOI prompt).',
    targetView: 'architect',
    scenarioKey: 'hall',
    actionLabel: 'Load Scenario B (Hall Deficit)'
  },
  {
    time: '2:35 - 3:45',
    title: '4. WAN-Drop Outbox -> Signed Peer Relay -> Idempotent Replay',
    detail: 'Simulate direct WAN drop on active builder, queue SHA-256 opId in Local Durable Outbox (not yet admitted), forward via relay-mateo to Layer A, then reconnect and verify replayed: true.',
    targetView: 'authority',
    actionLabel: 'Open WAN-Drop & Peer Theater'
  },
  {
    time: '3:45 - 5:00',
    title: '5. 50-Claimant Final-Seat Contention & 10k-User Scale Proof',
    detail: 'Fire 50 simultaneous claimants at 1 open seat on a 2-seat crew -> verify 1 HTTP 200 winner, 49 HTTP 409 rejections, oversize=0, orphanLeader=0, and sub-50ms exact p95 latency.',
    targetView: 'arena',
    actionLabel: 'Open 50-Way Race Arena'
  }
];

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

  // Topological order of tasks so upstream tasks claim earliest slots cleanly
  const byId = new Map(tasks.map(t => [t.id, t]));
  const visited = new Set();
  const active = new Set();
  const topo = [];
  function visit(id) {
    if (active.has(id) || visited.has(id) || !byId.has(id)) return;
    active.add(id);
    const t = byId.get(id);
    for (const dep of t.after || []) visit(dep);
    active.delete(id);
    visited.add(id);
    topo.push(t);
  }
  for (const t of tasks) visit(t.id);

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
    const latestFin = cp ? Math.min(horizonMin, cp.latestFinishMin) : horizonMin;
    const dur = Math.max(1, Math.round(Number(t.durationMin) || 60));

    const eligible = normalizedPeople
      .filter(p => p.skills[t.skill] === 'supported' || p.skills[t.skill] === 'unknown')
      .sort((a, b) => {
        const aSup = a.skills[t.skill] === 'supported' ? 0 : 1;
        const bSup = b.skills[t.skill] === 'supported' ? 0 : 1;
        if (aSup !== bSup) return aSup - bSup;
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
    return {
      id,
      skill: String(t.skill || 'backend').replace(/[^A-Za-z0-9_.:@-]/g, '').trim() || 'backend',
      durationMin: Math.max(1, Math.round(Number(t.durationMin) || 60)),
      ...(Number(t.lagMin) > 0 ? { lagMin: Math.round(Number(t.lagMin)) } : {}),
      rawAfter: Array.isArray(t.after) ? t.after.filter(Boolean) : []
    };
  });
  return normalized.map(t => ({
    id: t.id,
    skill: t.skill,
    durationMin: t.durationMin,
    ...(t.lagMin ? { lagMin: t.lagMin } : {}),
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
