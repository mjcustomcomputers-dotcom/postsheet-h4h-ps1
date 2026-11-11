// H4H PS1 | Purpose-First Scenarios, Deterministic Crew Enrichment, Builder Pool & DSL Helpers

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
  { value: 'UTC-6 · Hot Springs', bucket: 'americas', defaultStartRatio: 0, defaultEndRatio: 0.5 },
  { value: 'UTC-5 · Toronto / NYC', bucket: 'americas', defaultStartRatio: 0, defaultEndRatio: 0.6 },
  { value: 'UTC-3 · São Paulo', bucket: 'americas', defaultStartRatio: 0.1, defaultEndRatio: 0.65 },
  { value: 'UTC+0 · London / Accra', bucket: 'emea', defaultStartRatio: 0.2, defaultEndRatio: 0.75 },
  { value: 'UTC+1 · Berlin / Lagos', bucket: 'emea', defaultStartRatio: 0.25, defaultEndRatio: 0.8 },
  { value: 'UTC+3 · Nairobi', bucket: 'emea', defaultStartRatio: 0.3, defaultEndRatio: 0.85 },
  { value: 'UTC+5:30 · Bengaluru', bucket: 'apac', defaultStartRatio: 0.5, defaultEndRatio: 1.0 },
  { value: 'UTC+9 · Tokyo / Seoul', bucket: 'apac', defaultStartRatio: 0.55, defaultEndRatio: 1.0 }
];

export const MISSION_SCENARIOS = {
  baton: {
    id: 'baton',
    code: 'Scenario A',
    title: 'Async UTC Baton-Pass',
    subtitle: 'Hot Springs (UTC-6) + Bengaluru (UTC+5:30) · 0m overlap, ships early!',
    summary:
      'Aurora and Kai work T+0..240m in Arkansas (UTC-6). Priya works T+240..480m in Bengaluru (UTC+5:30) with 0m simultaneous overlap—yet directed task dependencies align cleanly so adding Priya flips INFEASIBLE to FEASIBLE_WITNESS with +150m deadline slack.',
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
      'Roster {Aurora, Kai} looks 100% covered on a static badge checklist (backend, database, frontend). Yet api-cutover and schema-migration both require 120m inside a 120m window—overloading Aurora. Synchronicity isolates the 1-role Hall deficit and adds Mateo with 0 displaced members.',
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
      'Aurora, Kai, and Priya cover backend, frontend, and integration—but upstream cloud/accessibility runner provisioning (devops) is unverified, blocking the entire DAG. Granting preventive prerequisite support unlocks FEASIBLE_WITNESS with 0 accepted members replaced.',
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

export const BUILDER_DIRECTORY = [
  {
    id: 'leader-aurora',
    role: 'Systems & SQLite Architect',
    timezone: 'UTC-6 · Hot Springs',
    utcBucket: 'americas',
    windowLabel: 'T+00:00 .. T+04:00',
    startMin: 0,
    endMin: 240,
    skills: { backend: 'supported', database: 'supported', design: 'unknown' },
    batonReady: true,
    secondaryContext: 'Regional Builder Collective',
    bio: 'Designs serialized SQLite WAL engines and zero-race invite protocols.'
  },
  {
    id: 'builder-kai',
    role: 'Accessible Frontend & Ergonomics Engineer',
    timezone: 'UTC-6 · Hot Springs',
    utcBucket: 'americas',
    windowLabel: 'T+00:00 .. T+04:00',
    startMin: 0,
    endMin: 240,
    skills: { frontend: 'supported', design: 'supported' },
    batonReady: true,
    secondaryContext: 'Civic & Accessibility Lab',
    bio: 'Builds WCAG 2.2 AAA interfaces, keyboard focus traps, and spatial DAG visualizers.'
  },
  {
    id: 'builder-priya',
    role: 'Integration & Cryptographic Relay Engineer',
    timezone: 'UTC+5:30 · Bengaluru',
    utcBucket: 'apac',
    windowLabel: 'T+04:00 .. T+08:00',
    startMin: 240,
    endMin: 480,
    skills: { integrate: 'supported', devops: 'supported' },
    batonReady: true,
    secondaryContext: 'Open Global Mesh',
    bio: 'Specializes in async UTC baton-pass handoffs, AES-256-GCM envelopes, and E2E gates.'
  },
  {
    id: 'mateo',
    role: 'Data & Schema Reliability Specialist',
    timezone: 'UTC-5 · Toronto',
    utcBucket: 'americas',
    windowLabel: 'T+00:00 .. T+03:30',
    startMin: 0,
    endMin: 210,
    skills: { database: 'supported', backend: 'unknown' },
    batonReady: false,
    secondaryContext: 'Systems University Guild',
    bio: 'Resolves simultaneous Hall capacity contention across database and migration tracks.'
  },
  {
    id: 'amina',
    role: 'Protocol Verification & QA Steward',
    timezone: 'UTC+1 · Berlin',
    utcBucket: 'emea',
    windowLabel: 'T+02:30 .. T+06:30',
    startMin: 150,
    endMin: 390,
    skills: { integrate: 'supported', frontend: 'unknown' },
    batonReady: true,
    secondaryContext: 'Open Global Mesh',
    bio: 'Bridges Americas and South Asia windows with clean mid-horizon contract tests.'
  },
  {
    id: 'sanjay-steward',
    role: 'Cloud & Accessibility Sandbox Steward',
    timezone: 'UTC+0 · London',
    utcBucket: 'emea',
    windowLabel: 'T+00:00 .. T+03:00',
    startMin: 0,
    endMin: 180,
    skills: { devops: 'supported', backend: 'supported' },
    batonReady: true,
    secondaryContext: 'Civic & Accessibility Lab',
    bio: 'Unblocks crews early by provisioning reproducible containers and CI runners.'
  },
  {
    id: 'kenji',
    role: 'Async Systems & Telemetry Developer',
    timezone: 'UTC+9 · Tokyo',
    utcBucket: 'apac',
    windowLabel: 'T+04:30 .. T+08:00',
    startMin: 270,
    endMin: 480,
    skills: { backend: 'supported', integrate: 'supported', design: 'unknown' },
    batonReady: true,
    secondaryContext: 'Systems University Guild',
    bio: 'Executes late-horizon benchmarking, SSE load probes, and final release packaging.'
  },
  {
    id: 'noor',
    role: 'Inclusive Interaction Designer',
    timezone: 'UTC+3 · Nairobi',
    utcBucket: 'emea',
    windowLabel: 'T+02:00 .. T+06:00',
    startMin: 120,
    endMin: 360,
    skills: { design: 'supported', frontend: 'supported' },
    batonReady: true,
    secondaryContext: 'Civic & Accessibility Lab',
    bio: 'Crafts low-glare typography, 360px mobile reflows, and screen-reader schedule tables.'
  }
];

const ARCHETYPES = [
  {
    mission: 'Local-first emergency mesh triage & SMS relay',
    skills: ['backend', 'frontend', 'integrate'],
    utcLabel: 'UTC-6 ↔ UTC+5:30 Baton',
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
    utcLabel: 'UTC-5 ↔ UTC+5:30 Baton',
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

export function deriveCrewProfile(team, verifiedCrewMap = {}) {
  const tid = team.team_id || 'crew';
  const h = hashString(tid);
  const arch = ARCHETYPES[h % ARCHETYPES.length];
  const members = Number(team.members || 0);
  const maxSize = Number(team.max_size || 5);
  const openSeats = Math.max(0, maxSize - members);

  let seatState = 'open';
  if (openSeats === 0) seatState = 'full';
  else if (openSeats === 1) seatState = 'final-seat';

  const verifiedStatus = verifiedCrewMap[tid];
  let lifecycle = 'FORMING';
  let lifecycleSub = `${openSeats} open ${openSeats === 1 ? 'seat' : 'seats'} · Matching complementary skills`;

  if (verifiedStatus === 'FEASIBLE_WITNESS') {
    lifecycle = openSeats > 0 ? 'PLAN_FEASIBLE_PENDING_ACCEPTANCE' : 'FEASIBLE_VERIFIED';
    lifecycleSub = openSeats > 0
      ? 'Critical-path verified · Awaiting seat acceptance'
      : 'Seats confirmed & critical-path witness verified';
  } else if (openSeats === 0) {
    // Explicitly demonstrate that full seats != verified deliverable readiness
    if (arch.fullReadinessHint === 'PLAN_FEASIBLE_PENDING_ACCEPTANCE') {
      lifecycle = 'PLAN_FEASIBLE_PENDING_ACCEPTANCE';
      lifecycleSub = 'Seats 100% full · Provisional handoff guard pending check';
    } else {
      lifecycle = 'ROSTER_CONFIRMED';
      lifecycleSub = 'Seats 100% full · Deliverable DAG not yet verified';
    }
  } else if (openSeats === 1) {
    lifecycle = 'PLAN_FEASIBLE_PENDING_ACCEPTANCE';
    lifecycleSub = '1 scarce final seat left · Contention-protected';
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
    lifecycle,
    lifecycleSub
  };
}

export const WALKTHROUGH_STEPS = [
  {
    time: '0:00 – 0:45',
    title: '1. Purpose-First Directory & Lifecycle Separation',
    detail: 'Browse 2,000 live SQLite crews in seed-event with sub-40ms board reads. Show why ROSTER_CONFIRMED (full seats) is distinct from deliverable feasibility, and filter by skill + UTC baton window.',
    targetView: 'discover',
    actionLabel: 'Open Discover Directory'
  },
  {
    time: '0:45 – 1:45',
    title: '2. Async UTC Baton-Pass (Hot Springs UTC-6 ↔ Bengaluru UTC+5:30)',
    detail: 'Load Scenario A in Mission Architect: 0m simultaneous overlap between Arkansas and India, then click "Add Candidate to Simulation" on Priya to flip INFEASIBLE to FEASIBLE_WITNESS live.',
    targetView: 'architect',
    scenarioKey: 'baton',
    actionLabel: 'Load Scenario A (Baton-Pass)'
  },
  {
    time: '1:45 – 2:35',
    title: '3. Hall Capacity Contention & Wildcard Omega Zero-Question Gate',
    detail: 'Load Scenario B ({Aurora, Kai} simultaneous backend+database overload -> 0-displacement repair adding Mateo) and Scenario C (EXISTS_FORALL_ROBUST zero questions vs Shannon VOI prompt).',
    targetView: 'architect',
    scenarioKey: 'hall',
    actionLabel: 'Load Scenario B (Hall Deficit)'
  },
  {
    time: '2:35 – 3:45',
    title: '4. WAN-Drop Outbox → Signed Peer Relay → Idempotent Replay',
    detail: 'Simulate direct WAN drop on active builder, queue SHA-256 opId in Local Durable Outbox (not yet admitted), forward via relay-mateo to Layer A, then reconnect and verify replayed: true.',
    targetView: 'authority',
    actionLabel: 'Open WAN-Drop & Peer Theater'
  },
  {
    time: '3:45 – 5:00',
    title: '5. 50-Claimant Final-Seat Contention & 10k-User Scale Proof',
    detail: 'Fire 50 simultaneous claimants at 1 open seat on a 2-seat crew -> verify 1 HTTP 200 winner, 49 HTTP 409 rejections, oversize=0, orphanLeader=0, and 36.68ms exact p95 latency.',
    targetView: 'arena',
    actionLabel: 'Open 50-Way Race Arena'
  }
];

// Bidirectional conversion between Visual State and API / Advanced DSL payloads
export function visualTasksToApi(tasks) {
  return tasks.map(t => ({
    id: String(t.id || '').trim(),
    skill: String(t.skill || 'backend').trim(),
    durationMin: Math.max(1, Math.round(Number(t.durationMin) || 60)),
    ...(Number(t.lagMin) > 0 ? { lagMin: Math.round(Number(t.lagMin)) } : {}),
    after: Array.isArray(t.after) ? t.after.filter(Boolean) : []
  }));
}

export function visualPeopleToApi(people, horizonMin) {
  return people.map(p => {
    const start = Math.max(0, Math.round(Number(p.startMin) || 0));
    const end = Math.max(start + 15, Math.min(Math.max(horizonMin, start + 15), Math.round(Number(p.endMin) || horizonMin)));
    const abilities = {};
    for (const [sk, st] of Object.entries(p.skills || {})) {
      if (st === 'supported') abilities[sk] = { support: true, refute: false };
      else if (st === 'unknown') abilities[sk] = { support: false, refute: false };
    }
    return {
      id: String(p.id || '').trim(),
      timezone: p.timezone || `T+${start}m..T+${end}m`,
      abilities,
      windows: [{ start, end }],
      consent: p.consent !== false
    };
  });
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
