import React, { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { planGoal } from '../../src/goal-planner.mjs';
import { recommendComplementary, contextGlueOrExplain } from '../../src/synchronicity-solvers.mjs';
import { getOrCreateClaimOperation, finishClaimOperation } from './claim-operation.js';
import {
  loadErgonomics,
  saveErgonomics,
  applyErgonomicsToDocument,
  resolveEffectiveScale,
  isMotionFrozen
} from './ergonomics.js';
import {
  MISSION_SCENARIOS,
  BUILDER_DIRECTORY,
  SKILLS_CATALOG,
  normalizeBuilderId,
  findBuilderById,
  mergeCandidatePoolWithDirectory,
  reconstructSeatedTeamPeople,
  computePartialTaskPreview,
  describePlainPlanVerdict,
  visualTasksToApi,
  visualPeopleToApi,
  loadCustomCrewOverlay,
  saveCustomCrewOverlayEntry
} from './presets-and-catalog.js';
import {
  formatHumanActorName,
  ActingAsMenuPopover,
  DisplayComfortPopover,
  WhyPurposeFirstModal,
  AuthAccountModal,
  AccessibilityStudioDrawer,
  CommandPaletteModal
} from './components/Overlays.jsx';
import CrewCharterExportModal, { triggerTeamPlanDownload } from './components/CrewCharterExportModal.jsx';
import EpistemicStencil from './components/EpistemicStencil.jsx';
import SolarBatonHorizon from './components/SolarBatonHorizon.jsx';
import KeyboardLightRibbon, { UpperShortcutHoloMirror } from './components/KeyboardLightRibbon.jsx';
import AffordalumeCgiStage from './components/AffordalumeCgiStage.jsx';
import TaskComprehensionBanner from './components/TaskComprehensionBanner.jsx';
import DiscoverView from './views/DiscoverView.jsx';
import MissionArchitectView from './views/MissionArchitectView.jsx';
import SeatAuthorityView from './views/SeatAuthorityView.jsx';
import ProofArenaView from './views/ProofArenaView.jsx';
import {
  BrandMark,
  CompassIcon,
  GitBranchIcon,
  ShieldCheckIcon,
  ZapIcon,
  DatabaseIcon,
  MeshIcon,
  OutboxIcon,
  UserIcon,
  SearchIcon,
  SparklesIcon,
  EyeIcon,
  DownloadIcon,
  ChevronDownIcon,
  RefreshIcon,
  FileTextIcon,
  PlusIcon,
  CheckCircleIcon,
  AlertTriangleIcon,
  KeyboardIcon
} from './icons.jsx';

const DEMO_PERSONA_CLIENT_RE =
  /^(leader-aurora|builder-kai|builder-priya|relay-mateo|race-leader|(aurora|priya|kai|mateo|lead|mem|claimant)-[A-Za-z0-9_-]{1,28})$/;

function isLoopbackHostname() {
  if (typeof window === 'undefined' || !window.location) return false;
  const h = String(window.location.hostname || '').toLowerCase();
  return h === '127.0.0.1' || h === 'localhost' || h === '[::1]';
}

function extractFirstHandleSegment(rawInput) {
  const raw = String(rawInput || '').trim().toLowerCase();
  if (!raw) return '';
  if (raw === 'leader-aurora' || raw.startsWith('aurora-')) return 'aurora';
  if (raw === 'builder-kai' || raw.startsWith('kai-')) return 'kai';
  if (raw === 'builder-priya' || raw.startsWith('priya-')) return 'priya';
  if (raw === 'relay-mateo' || raw.startsWith('mateo-')) return 'mateo';
  const memMatch = /^mem-([a-z]{2,14})-/.exec(raw);
  if (memMatch && !/^\d+$/.test(memMatch[1])) {
    return memMatch[1] === 'sanjaystew' ? 'sanjay' : memMatch[1];
  }
  const normalized = normalizeBuilderId(raw);
  const stripped = normalized.replace(/^(leader|builder|relay|lead|mem|claimant)-/, '');
  const seg = stripped.split(/[^a-z0-9]+/).find(part => part && !/^\d+$/.test(part));
  return seg || normalized.replace(/[^a-z0-9]/g, '');
}

function extractMemberBaseName(userId) {
  return extractFirstHandleSegment(userId);
}

function buildValidDemoActorId(personHint, roleTag, uniqueSuffix) {
  const cleanRole = String(roleTag || 'claim').replace(/[^a-z0-9]/gi, '').toLowerCase().slice(0, 6) || 'claim';
  const cleanTag = String(uniqueSuffix || Date.now().toString(36).slice(-5))
    .replace(/[^A-Za-z0-9]/g, '')
    .slice(0, 10) || '1';
  const base = extractFirstHandleSegment(personHint);
  if (base === 'aurora' || base === 'priya' || base === 'kai' || base === 'mateo') {
    return `${base}-${cleanRole}-${cleanTag}`;
  }
  const slug = (base || 'ally').slice(0, 10);
  return `mem-${slug}-${cleanTag}`;
}

function pickNextUnseatedTeammateHint(teamDetail, planPeople, issuedInv) {
  const seated = new Set(
    (teamDetail?.members || []).map(m => extractMemberBaseName(m.userId)).filter(Boolean)
  );
  if (teamDetail?.leader) seated.add(extractMemberBaseName(teamDetail.leader));

  const candidatesOrder = [
    issuedInv?.suggestedInvitee,
    ...(planPeople || []).map(p => p?.id),
    'priya',
    'kai',
    'mateo',
    'sanjay',
    'sana',
    'devon',
    'elena',
    'tariq'
  ];
  for (const cand of candidatesOrder) {
    const norm = extractFirstHandleSegment(cand);
    if (norm && !seated.has(norm)) return norm;
  }
  return 'priya';
}

const PRIMARY_TABS = [
  { id: 'discover', num: '1', label: 'Find teammates', short: 'Find teammates', hotkey: 'Alt+1', Icon: CompassIcon },
  { id: 'architect', num: '2', label: 'Plan the work', short: 'Plan the work', hotkey: 'Alt+2', Icon: GitBranchIcon },
  { id: 'authority', num: '3', label: 'Manage your team', short: 'Manage your team', hotkey: 'Alt+3', Icon: ShieldCheckIcon },
  { id: 'arena', num: '4', label: 'Test the last spot', short: 'Test the last spot', hotkey: 'Alt+4', Icon: ZapIcon }
];

function computeLocalSolve({ goalDescription, horizonHours, tasks, teamPeople, candidates }) {
  const horizonMin = Math.max(60, Math.round(Number(horizonHours || 4) * 60));
  const safeTasks = visualTasksToApi(tasks || []);
  const goalPayload = {
    id: 'mission-goal',
    description: goalDescription || 'Deliverable mission',
    startMin: 0,
    deadlineMin: horizonMin,
    tasks: safeTasks
  };
  const apiTeam = visualPeopleToApi(teamPeople || [], horizonMin);
  const mergedCandidates = mergeCandidatePoolWithDirectory(
    teamPeople || [],
    candidates || [],
    horizonMin
  );
  const apiCands = visualPeopleToApi(mergedCandidates, horizonMin);

  if (safeTasks.length === 0) {
    return {
      horizonMin,
      goalPayload,
      apiTeam,
      apiCands,
      planRes: {
        status: 'SEARCH_INCOMPLETE',
        classification: 'INFEASIBLE_WITHIN_SCOPE',
        witness: null,
        residuals: [],
        repairs: [{ code: 'NO_TASKS', action: 'Add at least 1 task (up to 8 tasks).' }]
      },
      recRes: { recommendations: [] }
    };
  }

  const effectiveTeam =
    apiTeam.length > 0
      ? apiTeam
      : [{ id: 'empty-crew-slot', consent: false, abilities: {}, windows: [{ start: 0, end: horizonMin }] }];

  try {
    const planRes = planGoal({ goal: goalPayload, people: effectiveTeam, maxNodes: 5000 });
    const recRes = recommendComplementary({
      goal: goalPayload,
      teamPeople: effectiveTeam,
      candidates: apiCands,
      planFn: planGoal
    });
    return { horizonMin, goalPayload, apiTeam, apiCands, planRes, recRes };
  } catch (err) {
    return {
      horizonMin,
      goalPayload,
      apiTeam,
      apiCands,
      planRes: {
        status: 'SEARCH_INCOMPLETE',
        classification: 'INFEASIBLE_WITHIN_SCOPE',
        witness: null,
        residuals: [],
        repairs: [{ code: err?.message || 'SOLVER_SCOPE', action: 'Adjust task dependencies or available hours.' }]
      },
      recRes: { recommendations: [] }
    };
  }
}

const INITIAL_BATON_SOLVE = computeLocalSolve({
  goalDescription: MISSION_SCENARIOS.baton.goalDescription,
  horizonHours: MISSION_SCENARIOS.baton.horizonHours,
  tasks: MISSION_SCENARIOS.baton.tasks,
  teamPeople: MISSION_SCENARIOS.baton.teamPeople,
  candidates: MISSION_SCENARIOS.baton.candidates
});

async function readApiJson(response) {
  const body = await response.json();
  if (!response.ok) {
    const err = new Error(body.error || `HTTP_${response.status}`);
    err.status = response.status;
    err.code = body.error;
    throw err;
  }
  return body;
}

export default function App() {
  // Ergonomics, Viewport Calibration & CRR State
  const [ergonomics, setErgonomics] = useState(() => loadErgonomics());
  const [viewportWidth, setViewportWidth] = useState(() =>
    typeof window !== 'undefined' && window.innerWidth ? window.innerWidth : 1440
  );
  const [activeView, setActiveView] = useState('discover');

  // Popovers, Modals & CRR Link/Pulse State
  const [actingMenuOpen, setActingMenuOpen] = useState(false);
  const [displayPopoverOpen, setDisplayPopoverOpen] = useState(false);
  const [mobileInspectOpen, setMobileInspectOpen] = useState(false);
  const [col3Tab, setCol3Tab] = useState('summary'); // 'summary' | 'proof'
  const col3ScrollRef = useRef(null);
  const savedCol3ScrollRef = useRef({ summary: 0, proof: 0 });
  const [activeLinkId, setActiveLinkId] = useState(null);
  const [horizonPulse, setHorizonPulse] = useState(0);

  const [whyOpen, setWhyOpen] = useState(false);
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [studioOpen, setStudioOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [charterOpen, setCharterOpen] = useState(false);
  const [authPromptMessage, setAuthPromptMessage] = useState('');
  const [discoverFilterReq, setDiscoverFilterReq] = useState({ seq: 0, focus: false });

  const requestDiscoverFilter = useCallback((opts = {}) => {
    setActiveView('discover');
    setDiscoverFilterReq(prev => ({
      seq: prev.seq + 1,
      focus: Boolean(opts.focus),
      query: opts.query,
      skill: opts.skill,
      tab: opts.tab
    }));
  }, []);

  // Auth & Event State
  const [eventId, setEventId] = useState('seed-event');
  const [actorId, setActorId] = useState('');
  const [token, setToken] = useState('');
  const [relayToken, setRelayToken] = useState('');
  const tokenRef = useRef('');
  const actorRef = useRef('');
  const signedOutManuallyRef = useRef(false);
  const pendingAuthReplayRef = useRef(null);

  useEffect(() => {
    tokenRef.current = token;
  }, [token]);

  useEffect(() => {
    actorRef.current = actorId;
  }, [actorId]);

  const isDemoSession = useCallback(
    () => !tokenRef.current || !actorRef.current || DEMO_PERSONA_CLIENT_RE.test(actorRef.current),
    []
  );

  // Live Board & Pagination State
  const [board, setBoard] = useState([]);
  const [totalTeams, setTotalTeams] = useState(null);
  const [totalMembers, setTotalMembers] = useState(null);
  const [eventMaxSize, setEventMaxSize] = useState(5);
  const [boardLatencyMs, setBoardLatencyMs] = useState(null);
  const [sseConnected, setSseConnected] = useState(false);
  const [ssePaused, setSsePaused] = useState(false);
  const [pageIndex, setPageIndex] = useState(0);
  const [pageSize, setPageSize] = useState(24);
  const [selectedTeam, setSelectedTeam] = useState(null);
  const selectedTeamRef = useRef(null);
  const [pinnedTeamsMap, setPinnedTeamsMap] = useState({});
  const autoInspectedEventRef = useRef('');
  const [spawningDemo, setSpawningDemo] = useState(false);
  const [verifiedCrewMap, setVerifiedCrewMap] = useState({});
  const [customCrewMap, setCustomCrewMap] = useState(() => loadCustomCrewOverlay());

  useEffect(() => {
    selectedTeamRef.current = selectedTeam;
  }, [selectedTeam]);

  // Step 2: Plan the work state (Instant <2ms Client Solver Initialized)
  const [activeScenarioKey, setActiveScenarioKey] = useState('baton');
  const [omegaMode, setOmegaMode] = useState('contingent');
  const [goalDescription, setGoalDescription] = useState(MISSION_SCENARIOS.baton.goalDescription);
  const [horizonHours, setHorizonHours] = useState(MISSION_SCENARIOS.baton.horizonHours);
  const [tasks, setTasks] = useState(MISSION_SCENARIOS.baton.tasks);
  const [teamPeople, setTeamPeople] = useState(MISSION_SCENARIOS.baton.teamPeople);
  const [candidates, setCandidates] = useState(MISSION_SCENARIOS.baton.candidates);
  const [plan, setPlan] = useState(() => INITIAL_BATON_SOLVE.planRes);
  const [beforeSnapshot, setBeforeSnapshot] = useState(null);
  const lastBlockedSnapshotRef = useRef({
    plan: INITIAL_BATON_SOLVE.planRes,
    tasks: MISSION_SCENARIOS.baton.tasks,
    horizonMin: INITIAL_BATON_SOLVE.horizonMin,
    label: `Baseline (${MISSION_SCENARIOS.baton.teamPeople.map(p => p.id).join(', ')})`
  });
  const [recs, setRecs] = useState(() => INITIAL_BATON_SOLVE.recRes);
  const [solving, setSolving] = useState(false);
  const solveSeqRef = useRef(0);
  const solveHttpDebounceRef = useRef(null);
  const [lockingPlan, setLockingPlan] = useState(false);
  const [evaluatingCrewId, setEvaluatingCrewId] = useState(null);
  const [lockedPlanTeamId, setLockedPlanTeamId] = useState(null);

  // Step 3: Manage your team & offline forwarding state
  const [teamId, setTeamId] = useState('crew-alpha');
  const [inviteCode, setInviteCode] = useState('');
  const [issuedInvite, setIssuedInvite] = useState(null);
  const [joining, setJoining] = useState(false);
  const [forwardingPeer, setForwardingPeer] = useState(false);
  const joiningLock = useRef(false);
  const lastClaimRef = useRef(null);
  const claimantDirectTokenRef = useRef('');
  const [hasLastClaim, setHasLastClaim] = useState(false);
  const [lastClaimCode, setLastClaimCode] = useState('');
  const [highlightRelayWalkthrough, setHighlightRelayWalkthrough] = useState(false);
  const [wanOffline, setWanOffline] = useState(false);
  const [queuedClaim, setQueuedClaim] = useState(null);
  const [relayedReceipt, setRelayedReceipt] = useState(null);
  const [replayReceipt, setReplayReceipt] = useState(null);
  const [peerNoteText, setPeerNoteText] = useState('API schema frozen; ready for Bengaluru UTC+5:30 UI handoff.');
  const [peerNotes, setPeerNotes] = useState([]);
  const [glueResult, setGlueResult] = useState(null);
  const [auditRows, setAuditRows] = useState([]);

  // Step 4: Test the last spot state
  const [raceReceipt, setRaceReceipt] = useState(null);
  const [runningRace, setRunningRace] = useState(false);
  const [probeStats, setProbeStats] = useState(null);
  const [probingLatency, setProbingLatency] = useState(false);

  // Global Polite Status, Center-Top Toast & Server Health
  const [statusMessage, setStatusMessage] = useState(
    'Ready. Find teammates whose skills fit the work, plan the schedule, manage team spots, or test the 50-person race.'
  );
  const [toast, setToast] = useState(null);
  const toastTimerRef = useRef(null);
  const [authorityHealth, setAuthorityHealth] = useState('checking');
  const [retryingServer, setRetryingServer] = useState(false);
  const tabRefs = useRef({});
  const proxRafRef = useRef(null);
  const lastSurfaceRef = useRef(null);
  const pointerPxRef = useRef({ x: 720, y: 360 });
  const rulerBandRef = useRef(null);
  const foregroundInertRef = useRef(null);

  const triggerHorizonPulse = useCallback(() => {
    setHorizonPulse(c => c + 1);
  }, []);

  const notifyToast = useCallback((message, tone = 'info') => {
    if (!message) return;
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setToast({
      key: Date.now() + Math.random(),
      message,
      tone
    });
    toastTimerRef.current = setTimeout(() => {
      setToast(null);
      toastTimerRef.current = null;
    }, 3400);
  }, []);

  useEffect(() => {
    return () => {
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
      if (solveHttpDebounceRef.current) clearTimeout(solveHttpDebounceRef.current);
      if (proxRafRef.current) cancelAnimationFrame(proxRafRef.current);
    };
  }, []);

  // Track viewport width for smart 60% Desktop <-> Tablet <-> Mobile conversion
  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const onResize = () => {
      setViewportWidth(window.innerWidth || 1440);
    };
    window.addEventListener('resize', onResize, { passive: true });
    return () => window.removeEventListener('resize', onResize);
  }, []);

  // Apply Ergonomics & Viewport Calibration to <html> and persist
  useEffect(() => {
    applyErgonomicsToDocument(ergonomics, viewportWidth);
    saveErgonomics(ergonomics);
  }, [ergonomics, viewportWidth]);

  const resolvedScale = useMemo(
    () => resolveEffectiveScale(ergonomics, viewportWidth),
    [ergonomics, viewportWidth]
  );

  // Scoped rAF pointer proximity handler (0 React re-renders, 0 idle frames, disabled when motion frozen)
  const handleShellPointerMove = useCallback(
    e => {
      const clientX = e.clientX;
      const clientY = e.clientY;
      pointerPxRef.current = { x: clientX, y: clientY };
      if (ergonomics.readingRuler && rulerBandRef.current) {
        rulerBandRef.current.style.setProperty('--ruler-y', `${Math.round(clientY)}px`);
      }
      if (isMotionFrozen(ergonomics.motion) || ergonomics.crrMode === 'flat') return;
      if (typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
        return;
      }
      const target = e.target;
      if (proxRafRef.current) return;
      proxRafRef.current = requestAnimationFrame(() => {
        proxRafRef.current = null;
        const surface = target?.closest?.('[data-reactive-surface]');
        if (!surface) return;
        const rect = surface.getBoundingClientRect();
        const rx = Math.round(clientX - rect.left);
        const ry = Math.round(clientY - rect.top);
        surface.style.setProperty('--rx', `${rx}px`);
        surface.style.setProperty('--ry', `${ry}px`);
        lastSurfaceRef.current = surface;
      });
    },
    [ergonomics.motion, ergonomics.crrMode, ergonomics.readingRuler]
  );

  // Keyboard focus tracking for Reading Ruler and Affordalume surface spotlight parity
  const handleShellFocusIn = useCallback(
    e => {
      const target = e.target;
      if (!target || typeof target.getBoundingClientRect !== 'function') return;
      const r = target.getBoundingClientRect();
      if (r.width <= 0 || r.height <= 0) return;
      const cx = Math.round(r.left + r.width * 0.5);
      const cy = Math.round(r.top + r.height * 0.5);
      pointerPxRef.current = { x: cx, y: cy };
      if (ergonomics.readingRuler && rulerBandRef.current) {
        rulerBandRef.current.style.setProperty('--ruler-y', `${cy}px`);
      }
      if (!isMotionFrozen(ergonomics.motion) && ergonomics.crrMode !== 'flat') {
        const surface = target.closest?.('[data-reactive-surface]');
        if (surface) {
          const sr = surface.getBoundingClientRect();
          surface.style.setProperty('--rx', `${Math.round(cx - sr.left)}px`);
          surface.style.setProperty('--ry', `${Math.round(cy - sr.top)}px`);
        }
      }
    },
    [ergonomics.motion, ergonomics.crrMode, ergonomics.readingRuler]
  );

  const anyModalOpen = Boolean(whyOpen || authModalOpen || studioOpen || paletteOpen || charterOpen);
  useEffect(() => {
    const el = foregroundInertRef.current;
    if (!el) return;
    el.inert = anyModalOpen;
  }, [anyModalOpen]);

  // Preserve scroll position when switching Column 3 between Activity Summary & Engineering Proof (CRR-10)
  function handleSwitchCol3Tab(nextTab) {
    if (nextTab === col3Tab) return;
    if (col3ScrollRef.current) {
      savedCol3ScrollRef.current[col3Tab] = col3ScrollRef.current.scrollTop;
    }
    setCol3Tab(nextTab);
    requestAnimationFrame(() => {
      if (col3ScrollRef.current) {
        col3ScrollRef.current.scrollTop = savedCol3ScrollRef.current[nextTab] || 0;
      }
    });
  }

  // Authenticated API helpers + HTTP 401 Interceptor & Queued Replay
  const ensureToken = useCallback(
    async overrideToken => {
      if (overrideToken && overrideToken.trim()) return overrideToken.trim();
      if (tokenRef.current && tokenRef.current.trim()) return tokenRef.current.trim();
      if (signedOutManuallyRef.current) return '';

      try {
        const demo = await readApiJson(
          await fetch('/api/auth/demo', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ actorId: 'leader-aurora', eventId, maxSize: 5 })
          })
        );
        const relay = await readApiJson(
          await fetch('/api/auth/demo', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ actorId: 'relay-mateo', eventId, maxSize: 5 })
          })
        );
        tokenRef.current = demo.token;
        actorRef.current = demo.actorId;
        setActorId(demo.actorId);
        setToken(demo.token);
        setRelayToken(relay.token);
        return demo.token;
      } catch {
        return '';
      }
    },
    [eventId]
  );

  const sendPost = useCallback(
    async (path, body, overrideToken) => {
      const useTok = await ensureToken(overrideToken);
      const headers = { 'content-type': 'application/json' };
      if (useTok) headers.authorization = 'Bearer ' + useTok;
      return readApiJson(
        await fetch(path, {
          method: 'POST',
          headers,
          body: JSON.stringify(body)
        })
      );
    },
    [ensureToken]
  );

  const sendGetAuth = useCallback(
    async (path, overrideToken) => {
      const useTok = await ensureToken(overrideToken);
      const headers = {};
      if (useTok) headers.authorization = 'Bearer ' + useTok;
      return readApiJson(
        await fetch(path, {
          headers,
          cache: 'no-store'
        })
      );
    },
    [ensureToken]
  );

  const runProtectedAction = useCallback(
    async (label, actionFn) => {
      try {
        return await actionFn(tokenRef.current, actorRef.current);
      } catch (err) {
        if (err?.status === 401 || err?.message === 'UNAUTHORIZED') {
          tokenRef.current = '';
          setToken('');

          if (!signedOutManuallyRef.current && (!actorRef.current || DEMO_PERSONA_CLIENT_RE.test(actorRef.current))) {
            try {
              const refreshActor = DEMO_PERSONA_CLIENT_RE.test(actorRef.current)
                ? actorRef.current
                : 'leader-aurora';
              const refreshed = await readApiJson(
                await fetch('/api/auth/demo', {
                  method: 'POST',
                  headers: { 'content-type': 'application/json' },
                  body: JSON.stringify({ actorId: refreshActor, eventId, maxSize: 5 })
                })
              );
              tokenRef.current = refreshed.token;
              actorRef.current = refreshed.actorId;
              setActorId(refreshed.actorId);
              setToken(refreshed.token);
              return await actionFn(refreshed.token, refreshed.actorId);
            } catch {
              // Fall through to AuthAccountModal when demo auth is disabled
            }
          }

          pendingAuthReplayRef.current = { label, actionFn };
          setAuthPromptMessage(
            `Sign in or choose a demo profile below to continue "${label}". Your action will run automatically.`
          );
          setAuthModalOpen(true);
          setStatusMessage(`Sign-in needed for "${label}" - saved and ready to run.`);
          notifyToast(`Sign in required for "${label}" - saved for replay.`, 'warn');
          return null;
        }
        throw err;
      }
    },
    [eventId, notifyToast]
  );

  const replayPendingAuthAction = useCallback(async (freshToken, freshActor) => {
    const pending = pendingAuthReplayRef.current;
    if (!pending) return;
    pendingAuthReplayRef.current = null;
    setAuthPromptMessage('');
    try {
      await pending.actionFn(freshToken, freshActor);
    } catch (err) {
      setStatusMessage(`Replay (${pending.label}): ${err.message}`);
    }
  }, []);

  const recordConfirmedTeamDetail = useCallback(
    (detail, targetEv = eventId) => {
      if (!detail || !detail.teamId) return;
      const memberCount = Array.isArray(detail.members) ? detail.members.length : 1;
      const maxSz = Number(detail.maxSize || eventMaxSize || 5);
      selectedTeamRef.current = detail;
      setSelectedTeam(detail);
      setPinnedTeamsMap(prev => ({
        ...prev,
        [`${targetEv}::${detail.teamId}`]: {
          eventId: targetEv,
          team_id: detail.teamId,
          leader: detail.leader,
          max_size: maxSz,
          members: memberCount,
          touchedAt: Date.now()
        }
      }));
      setBoard(prev =>
        prev.some(t => t.team_id === detail.teamId)
          ? prev.map(t =>
              t.team_id === detail.teamId
                ? { ...t, leader: detail.leader, max_size: maxSz, members: memberCount }
                : t
            )
          : prev
      );
    },
    [eventId, eventMaxSize]
  );

  const removeDeletedTeamRecord = useCallback(
    (deletedTid, targetEv = eventId) => {
      if (selectedTeamRef.current?.teamId === deletedTid) {
        selectedTeamRef.current = null;
      }
      setSelectedTeam(prev => (prev?.teamId === deletedTid ? null : prev));
      setPinnedTeamsMap(prev => {
        const next = { ...prev };
        delete next[`${targetEv}::${deletedTid}`];
        return next;
      });
      setBoard(prev => prev.filter(t => t.team_id !== deletedTid));
    },
    [eventId]
  );

  const markInviteAccepted = useCallback((usedCode, joinedActor, clearInput = true) => {
    if (!usedCode) return;
    setIssuedInvite(prev =>
      prev && prev.code === usedCode
        ? { ...prev, claimedBy: joinedActor || 'teammate', claimedAt: Date.now() }
        : prev
    );
    if (clearInput) {
      setInviteCode(prev => (prev === usedCode ? '' : prev));
    }
  }, []);

  const handleChangeActiveTeamId = useCallback(
    nextTid => {
      setTeamId(nextTid);
      setInviteCode(prev => {
        if (issuedInvite?.code) {
          if (issuedInvite.teamId && issuedInvite.teamId !== nextTid && prev === issuedInvite.code) {
            return '';
          }
          if (issuedInvite.teamId === nextTid && !issuedInvite.claimedBy && !prev) {
            return issuedInvite.code;
          }
        }
        return prev;
      });
    },
    [issuedInvite]
  );

  // Board refresh with live latency measurement + multi-tab SSE active-team sync
  const refreshBoard = useCallback(
    async (manual = false, forceOnline = false, fromSse = false) => {
      if (wanOffline && !forceOnline) {
        setAuthorityHealth('wan-dropped');
        if (manual === true) {
          notifyToast('Direct connection is currently turned off in Step 3.', 'warn');
        }
        return false;
      }
      if (!/^[A-Za-z0-9_.:@-]{1,128}$/.test(eventId)) {
        setAuthorityHealth('unreachable');
        return false;
      }
      const offset = pageIndex * pageSize;
      const t0 = performance.now();
      try {
        const res = await fetch(
          `/api/events/${encodeURIComponent(eventId)}/board?limit=${pageSize}&offset=${offset}&meta=1`,
          { cache: 'no-store' }
        );
        const data = await readApiJson(res);
        const dt = performance.now() - t0;
        const rows = data.teams || [];
        setBoard(rows);
        if (typeof data.totalTeams === 'number') setTotalTeams(data.totalTeams);
        if (typeof data.totalMembers === 'number') setTotalMembers(data.totalMembers);
        if (typeof data.maxSize === 'number') setEventMaxSize(data.maxSize);
        setBoardLatencyMs(dt);
        setAuthorityHealth('online');

        // Keep active selectedTeam 100% synchronized across multiple browser tabs via SSE & board diffs
        const cur = selectedTeamRef.current;
        if (cur?.teamId) {
          const liveBoardRow = rows.find(r => r.team_id === cur.teamId);
          const curMemberLen = Array.isArray(cur.members) ? cur.members.length : 1;
          const boardDiffers = Boolean(
            liveBoardRow && (liveBoardRow.members !== curMemberLen || liveBoardRow.leader !== cur.leader)
          );
          if (fromSse === true || manual === true || boardDiffers) {
            fetch(
              `/api/events/${encodeURIComponent(eventId)}/teams/${encodeURIComponent(cur.teamId)}`,
              { cache: 'no-store' }
            )
              .then(async r => {
                if (r.status === 404) {
                  removeDeletedTeamRecord(cur.teamId, eventId);
                  return null;
                }
                return readApiJson(r);
              })
              .then(detail => {
                if (detail && selectedTeamRef.current?.teamId === detail.teamId) {
                  recordConfirmedTeamDetail(detail, eventId);
                }
              })
              .catch(() => {});
          }
        }

        // On first load of an event, inspect a real open multi-member team so active team spots match server truth
        if (autoInspectedEventRef.current !== eventId && rows.length > 0) {
          autoInspectedEventRef.current = eventId;
          const pickInitial =
            rows.find(t => t.members >= 2 && t.members < t.max_size) ||
            rows.find(t => t.members < t.max_size) ||
            rows[0];
          if (pickInitial?.team_id) {
            fetch(
              `/api/events/${encodeURIComponent(eventId)}/teams/${encodeURIComponent(pickInitial.team_id)}`,
              { cache: 'no-store' }
            )
              .then(readApiJson)
              .then(detail => {
                setSelectedTeam(prev => {
                  if (prev) return prev;
                  selectedTeamRef.current = detail;
                  setTeamId(detail.teamId);
                  setPinnedTeamsMap(pm => ({
                    ...pm,
                    [`${eventId}::${detail.teamId}`]: {
                      eventId,
                      team_id: detail.teamId,
                      leader: detail.leader,
                      max_size: detail.maxSize || 5,
                      members: Array.isArray(detail.members) ? detail.members.length : 1,
                      touchedAt: Date.now()
                    }
                  }));
                  return detail;
                });
              })
              .catch(() => {});
          }
        }

        if (manual === true) {
          notifyToast(`Refreshed server team list (${dt.toFixed(1)} ms).`, 'ok');
        }
        return true;
      } catch (e) {
        setAuthorityHealth('unreachable');
        setStatusMessage(`Server connection: ${e.message}`);
        if (manual === true) {
          notifyToast(
            isLoopbackHostname()
              ? 'Local server (:8788) unreachable - local <2ms plan preview remains active.'
              : 'Server reconnecting - local <2ms plan preview remains active.',
            'err'
          );
        }
        return false;
      }
    },
    [eventId, pageIndex, pageSize, wanOffline, notifyToast, recordConfirmedTeamDetail, removeDeletedTeamRecord]
  );

  async function retryServerConnection() {
    setRetryingServer(true);
    try {
      if (!signedOutManuallyRef.current) {
        await ensureToken('');
      }
      const ok = await refreshBoard(false);
      if (ok) {
        notifyToast(
          isLoopbackHostname() ? 'Connected to local server (:8788).' : 'Reconnected to server.',
          'ok'
        );
      } else {
        notifyToast(
          isLoopbackHostname()
            ? 'Local server (:8788) still unreachable - start node src/server.mjs on port 8788.'
            : 'Server reconnecting - local <2ms plan preview remains active.',
          'err'
        );
      }
    } finally {
      setRetryingServer(false);
    }
  }

  useEffect(() => {
    refreshBoard();
    if (ssePaused) return undefined;
    const timer = setInterval(() => refreshBoard(), 6000);
    return () => clearInterval(timer);
  }, [refreshBoard, ssePaused]);

  // SSE Live Revision Stream
  useEffect(() => {
    if (ssePaused || wanOffline || !/^[A-Za-z0-9_.:@-]{1,128}$/.test(eventId)) {
      setSseConnected(false);
      return undefined;
    }
    const stream = new EventSource(`/api/events/${encodeURIComponent(eventId)}/stream`);
    stream.onopen = () => setSseConnected(true);
    stream.onerror = () => setSseConnected(false);
    stream.addEventListener('board', () => {
      refreshBoard(false, false, true);
    });
    return () => {
      setSseConnected(false);
      stream.close();
    };
  }, [eventId, wanOffline, refreshBoard]);

  // Auto-bootstrap profile & initial solver check on first mount
  const bootstrapped = useRef(false);
  useEffect(() => {
    if (bootstrapped.current) return;
    bootstrapped.current = true;
    (async () => {
      try {
        const main = await readApiJson(
          await fetch('/api/auth/demo', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ actorId: 'leader-aurora', eventId: 'seed-event', maxSize: 5 })
          })
        );
        const relay = await readApiJson(
          await fetch('/api/auth/demo', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ actorId: 'relay-mateo', eventId: 'seed-event', maxSize: 5 })
          })
        );
        tokenRef.current = main.token;
        actorRef.current = main.actorId;
        setActorId(main.actorId);
        setToken(main.token);
        setRelayToken(relay.token);

        const sc = MISSION_SCENARIOS.baton;
        const hMin = sc.horizonHours * 60;
        const goalObj = {
          id: 'mission-goal',
          description: sc.goalDescription,
          startMin: 0,
          deadlineMin: hMin,
          tasks: visualTasksToApi(sc.tasks)
        };
        const [pRes, rRes] = await Promise.all([
          readApiJson(
            await fetch('/api/plan', {
              method: 'POST',
              headers: { 'content-type': 'application/json', authorization: 'Bearer ' + main.token },
              body: JSON.stringify({ goal: goalObj, people: visualPeopleToApi(sc.teamPeople, hMin), maxNodes: 5000 })
            })
          ),
          readApiJson(
            await fetch('/api/recommendations', {
              method: 'POST',
              headers: { 'content-type': 'application/json', authorization: 'Bearer ' + main.token },
              body: JSON.stringify({
                goal: goalObj,
                teamPeople: visualPeopleToApi(sc.teamPeople, hMin),
                candidates: visualPeopleToApi(sc.candidates, hMin)
              })
            })
          )
        ]);
        setPlan(pRes);
        setRecs(rRes);
        if (pRes.status !== 'FEASIBLE_WITNESS') {
          lastBlockedSnapshotRef.current = {
            plan: pRes,
            tasks: sc.tasks,
            horizonMin: hMin,
            label: `Baseline (${sc.teamPeople.map(p => p.id).join(', ')})`
          };
        }

        try {
          const checkBoard = await readApiJson(
            await fetch('/api/events/seed-event/board?limit=5&offset=0', { cache: 'no-store' })
          );
          const firstTid = checkBoard.teams?.[0]?.team_id || '';
          if (!firstTid || firstTid === 'crew-0000') {
            const bootTag = String(Date.now()).slice(-4);
            const bootSpecs = [
              {
                tid: `00-open-baton-${bootTag}`,
                lead: `lead-baton-${bootTag}`,
                extraCount: 1,
                mission: 'Cross-timezone Hot Springs (UTC-6) <-> Bengaluru (UTC+5:30) API & Accessible UI',
                skills: ['backend', 'frontend', 'integrate'],
                utcBucket: 'baton'
              },
              {
                tid: `01-open-hall-${bootTag}`,
                lead: `lead-hall-${bootTag}`,
                extraCount: 2,
                mission: 'Zero-downtime SQLite WAL schema cutover & real-time telemetry board',
                skills: ['backend', 'database', 'devops'],
                utcBucket: 'americas'
              },
              {
                tid: `02-final-seat-${bootTag}`,
                lead: `lead-scarce-${bootTag}`,
                extraCount: 3,
                mission: 'Accessible lab notebook & schedule verifier (1 last spot open)',
                skills: ['frontend', 'design', 'integrate'],
                utcBucket: 'baton'
              }
            ];
            let nextCustom = loadCustomCrewOverlay();
            for (const sp of bootSpecs) {
              const leadSess = await readApiJson(
                await fetch('/api/auth/demo', {
                  method: 'POST',
                  headers: { 'content-type': 'application/json' },
                  body: JSON.stringify({ actorId: sp.lead, eventId: 'seed-event', maxSize: 5 })
                })
              );
              await readApiJson(
                await fetch('/api/teams', {
                  method: 'POST',
                  headers: { 'content-type': 'application/json', authorization: 'Bearer ' + leadSess.token },
                  body: JSON.stringify({ eventId: 'seed-event', teamId: sp.tid })
                })
              );
              for (let k = 0; k < sp.extraCount; k++) {
                const inv = await readApiJson(
                  await fetch('/api/invitations', {
                    method: 'POST',
                    headers: { 'content-type': 'application/json', authorization: 'Bearer ' + leadSess.token },
                    body: JSON.stringify({ eventId: 'seed-event', teamId: sp.tid, expiresAt: Date.now() + 600000 })
                  })
                );
                const memSess = await readApiJson(
                  await fetch('/api/auth/demo', {
                    method: 'POST',
                    headers: { 'content-type': 'application/json' },
                    body: JSON.stringify({
                      actorId: `mem-${bootTag}-${sp.tid.slice(0, 2)}-${k}`,
                      eventId: 'seed-event',
                      maxSize: 5
                    })
                  })
                );
                await readApiJson(
                  await fetch('/api/invitations/claim', {
                    method: 'POST',
                    headers: { 'content-type': 'application/json', authorization: 'Bearer ' + memSess.token },
                    body: JSON.stringify({
                      eventId: 'seed-event',
                      teamId: sp.tid,
                      code: inv.code,
                      opId: `boot-${bootTag}-${sp.tid.slice(0, 2)}-${k}`
                    })
                  })
                );
              }
              nextCustom = saveCustomCrewOverlayEntry('seed-event', sp.tid, {
                mission: sp.mission,
                skills: sp.skills,
                utcBucket: sp.utcBucket
              });
            }
            setCustomCrewMap(nextCustom);
            const refreshed = await readApiJson(
              await fetch(`/api/events/seed-event/board?limit=${pageSize}&offset=0&meta=1`, { cache: 'no-store' })
            );
            setBoard(refreshed.teams || []);
            if (typeof refreshed.totalTeams === 'number') setTotalTeams(refreshed.totalTeams);
            if (typeof refreshed.totalMembers === 'number') setTotalMembers(refreshed.totalMembers);
            if (typeof refreshed.maxSize === 'number') setEventMaxSize(refreshed.maxSize);
          }
        } catch {
          // Non-fatal if seed-event already has open teams
        }
      } catch {
        // Graceful fallback when PS1_DEMO_AUTH=0
      }
    })();
  }, []);

  // Profile & Account Auth Handlers
  const switchPersona = useCallback(
    async persona => {
      try {
        const main = await readApiJson(
          await fetch('/api/auth/demo', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ actorId: persona, eventId, maxSize: 5 })
          })
        );
        const relay = await readApiJson(
          await fetch('/api/auth/demo', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ actorId: 'relay-mateo', eventId, maxSize: 5 })
          })
        );
        signedOutManuallyRef.current = false;
        tokenRef.current = main.token;
        actorRef.current = main.actorId;
        setActorId(main.actorId);
        setToken(main.token);
        setRelayToken(relay.token);
        const niceName = formatHumanActorName(main.actorId, true);
        setStatusMessage(`Acting as ${niceName} (${main.actorId}). Teammate relay Mateo ready.`);
        notifyToast(`Now acting as ${niceName}`, 'ok');
        refreshBoard();
        await replayPendingAuthAction(main.token, main.actorId);
        return true;
      } catch (e) {
        setStatusMessage(`Sign-in needed (${e.message}).`);
        notifyToast('Demo profiles disabled - sign in with an account.', 'warn');
        setAuthModalOpen(true);
        return false;
      }
    },
    [eventId, refreshBoard, replayPendingAuthAction, notifyToast]
  );

  async function handleAccountAuth(mode, payload) {
    const res = await readApiJson(
      await fetch(`/api/auth/${mode}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload)
      })
    );
    signedOutManuallyRef.current = false;
    tokenRef.current = res.token;
    actorRef.current = res.actorId;
    setActorId(res.actorId);
    setToken(res.token);
    setStatusMessage(
      `${mode === 'register' ? 'Created account and signed in' : 'Signed in'} as '${res.actorId}'.`
    );
    notifyToast(`${mode === 'register' ? 'Created account' : 'Signed in'} as ${res.actorId}`, 'ok');
    refreshBoard();
    await replayPendingAuthAction(res.token, res.actorId);
    return res;
  }

  async function handleLogout() {
    signedOutManuallyRef.current = true;
    try {
      if (tokenRef.current.trim()) {
        await readApiJson(
          await fetch('/api/auth/logout', {
            method: 'POST',
            headers: { 'content-type': 'application/json', authorization: 'Bearer ' + tokenRef.current.trim() },
            body: JSON.stringify({})
          })
        );
      }
      tokenRef.current = '';
      actorRef.current = '';
      setActorId('');
      setToken('');
      setStatusMessage('Signed out and revoked session token on server.');
      notifyToast('Signed out.', 'info');
    } catch {
      tokenRef.current = '';
      actorRef.current = '';
      setActorId('');
      setToken('');
      setStatusMessage('Signed out locally.');
      notifyToast('Signed out.', 'info');
    }
  }

  // Event Scope Handlers
  async function handleEnsureEvent(nextEv) {
    if (!/^[A-Za-z0-9_.:@-]{1,128}$/.test(nextEv)) {
      setStatusMessage('Invalid event ID.');
      notifyToast('Invalid event ID.', 'err');
      return;
    }
    const resetEventTransientState = () => {
      if (nextEv !== eventId) {
        autoInspectedEventRef.current = '';
        selectedTeamRef.current = null;
        setSelectedTeam(null);
        setLockedPlanTeamId(null);
        setEvaluatingCrewId(null);
        setTeamId('crew-alpha');
        setIssuedInvite(null);
        setInviteCode('');
        setPeerNotes([]);
        setAuditRows([]);
        setRelayedReceipt(null);
        setReplayReceipt(null);
      }
    };
    try {
      await runProtectedAction(`Switch Event (${nextEv})`, async freshTok => {
        await sendPost('/api/events', { eventId: nextEv, maxSize: 5 }, freshTok);
        resetEventTransientState();
        setEventId(nextEv);
        setPageIndex(0);
        setStatusMessage(`Switched active event to '${nextEv}'.`);
        notifyToast(`Switched event to '${nextEv}'.`, 'ok');
      });
    } catch {
      resetEventTransientState();
      setEventId(nextEv);
      setPageIndex(0);
      setStatusMessage(`Switched event to '${nextEv}'.`);
      notifyToast(`Event set to '${nextEv}'.`, 'info');
    }
  }

  function handleChangeEventScope(nextEv) {
    handleEnsureEvent(nextEv);
  }

  async function spawnShowcaseCrews() {
    await runProtectedAction('Add 3 Example Open Teams', async freshTok => {
      setSpawningDemo(true);
      try {
        await sendPost('/api/events', { eventId, maxSize: 5 }, freshTok);
        const tag = String(Date.now()).slice(-4);
        const specs = [
          {
            tid: `00-open-baton-${tag}`,
            lead: `lead-baton-${tag}`,
            extraCount: 1,
            mission: 'Cross-timezone Hot Springs (UTC-6) <-> Bengaluru (UTC+5:30) API & Accessible UI',
            skills: ['backend', 'frontend', 'integrate'],
            utcBucket: 'baton'
          },
          {
            tid: `01-open-hall-${tag}`,
            lead: `lead-hall-${tag}`,
            extraCount: 2,
            mission: 'Zero-downtime SQLite WAL schema cutover & real-time telemetry board',
            skills: ['backend', 'database', 'devops'],
            utcBucket: 'americas'
          },
          {
            tid: `02-final-seat-${tag}`,
            lead: `lead-scarce-${tag}`,
            extraCount: Math.max(0, (eventMaxSize || 5) - 2),
            mission: 'Accessible lab notebook & schedule verifier (1 last spot open)',
            skills: ['frontend', 'design', 'integrate'],
            utcBucket: 'baton'
          }
        ];

        let spawnedCount = 0;
        let nextCustom = customCrewMap;

        for (const sp of specs) {
          try {
            const leadSession = await readApiJson(
              await fetch('/api/auth/demo', {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ actorId: sp.lead, eventId, maxSize: 5 })
              })
            );
            await sendPost('/api/teams', { eventId, teamId: sp.tid }, leadSession.token);
            for (let k = 0; k < sp.extraCount; k++) {
              const inv = await sendPost(
                '/api/invitations',
                { eventId, teamId: sp.tid, expiresAt: Date.now() + 600000 },
                leadSession.token
              );
              const memSession = await readApiJson(
                await fetch('/api/auth/demo', {
                  method: 'POST',
                  headers: { 'content-type': 'application/json' },
                  body: JSON.stringify({ actorId: `mem-${tag}-${sp.tid.slice(0, 2)}-${k}`, eventId, maxSize: 5 })
                })
              );
              await sendPost(
                '/api/invitations/claim',
                { eventId, teamId: sp.tid, code: inv.code, opId: `spawn-${tag}-${k}` },
                memSession.token
              );
            }
            nextCustom = saveCustomCrewOverlayEntry(eventId, sp.tid, {
              mission: sp.mission,
              skills: sp.skills,
              utcBucket: sp.utcBucket
            });
            spawnedCount += 1;
          } catch (demoErr) {
            if (spawnedCount === 0 && freshTok) {
              const fallbackTid = `00-open-crew-${tag}`;
              await sendPost('/api/teams', { eventId, teamId: fallbackTid }, freshTok);
              nextCustom = saveCustomCrewOverlayEntry(eventId, fallbackTid, {
                mission: sp.mission,
                skills: sp.skills,
                utcBucket: 'baton'
              });
              spawnedCount += 1;
              break;
            }
            throw demoErr;
          }
        }

        setCustomCrewMap(nextCustom);
        setPageIndex(0);
        await refreshBoard();
        const msg = `Added ${spawnedCount} open example ${spawnedCount === 1 ? 'team' : 'teams'} on Page 1.`;
        setStatusMessage(msg);
        notifyToast(msg, 'ok');
      } catch (e) {
        if (e?.status === 401 || e?.message === 'UNAUTHORIZED') throw e;
        setStatusMessage(`Create teams: ${e.message}`);
        notifyToast(`Could not create example teams: ${e.message}`, 'err');
      } finally {
        setSpawningDemo(false);
      }
    });
  }

  // Instant <2ms Client-Side Solver + Non-Blocking /api/plan Sync
  const runSolveAndRecommend = useCallback(
    async (overrides = {}) => {
      const useGoal = overrides.goalDescription ?? goalDescription;
      const useHours = overrides.horizonHours ?? horizonHours;
      const useTasks = overrides.tasks ?? tasks;
      const useTeam = overrides.teamPeople ?? teamPeople;
      const useCands = overrides.candidates ?? candidates;
      const useCrewTag = overrides.crewId !== undefined ? overrides.crewId : evaluatingCrewId;
      const resetComparison = Boolean(overrides.resetComparison);

      const local = computeLocalSolve({
        goalDescription: useGoal,
        horizonHours: useHours,
        tasks: useTasks,
        teamPeople: useTeam,
        candidates: useCands
      });

      const applySnapshotTransition = nextPlan => {
        if (resetComparison) {
          setBeforeSnapshot(null);
          if (nextPlan.status !== 'FEASIBLE_WITNESS') {
            lastBlockedSnapshotRef.current = {
              plan: nextPlan,
              tasks: useTasks,
              horizonMin: local.horizonMin,
              label: `Baseline (${useTeam.map(p => p.id).join(', ')})`
            };
          } else {
            lastBlockedSnapshotRef.current = null;
          }
        } else if (nextPlan.status !== 'FEASIBLE_WITNESS') {
          lastBlockedSnapshotRef.current = {
            plan: nextPlan,
            tasks: useTasks,
            horizonMin: local.horizonMin,
            label: `Incomplete (${useTeam.map(p => p.id).join(', ')})`
          };
          setBeforeSnapshot(null);
        } else if (
          lastBlockedSnapshotRef.current &&
          (lastBlockedSnapshotRef.current.tasks || []).length === useTasks.length
        ) {
          setBeforeSnapshot(lastBlockedSnapshotRef.current);
        }
      };

      applySnapshotTransition(local.planRes);
      setPlan(local.planRes);
      setRecs(local.recRes);
      if (useCrewTag) {
        setVerifiedCrewMap(prev => ({
          ...prev,
          [`${eventId}::${useCrewTag}`]: local.planRes.status,
          [useCrewTag]: local.planRes.status
        }));
      }

      const localPreview = computePartialTaskPreview(useTasks, useTeam, local.horizonMin, local.planRes);
      const plain = describePlainPlanVerdict(local.planRes, useTasks, localPreview);
      setStatusMessage(
        overrides.toastMessage
          ? overrides.toastMessage
          : `${plain.headline} · ${local.recRes.recommendations?.length || 0} suggested people.`
      );

      if (overrides.toastMessage) {
        notifyToast(overrides.toastMessage, plain.tone === 'ok' ? 'ok' : 'info');
      } else if (overrides.explicitEvaluate) {
        notifyToast(plain.headline, plain.tone === 'ok' ? 'ok' : 'warn');
      }

      if (wanOffline || local.apiTeam.length === 0 || local.goalPayload.tasks.length === 0) {
        return local;
      }

      const seq = ++solveSeqRef.current;
      if (solveHttpDebounceRef.current) {
        clearTimeout(solveHttpDebounceRef.current);
        solveHttpDebounceRef.current = null;
      }

      const syncWithServer = async () => {
        if (seq !== solveSeqRef.current) return;
        setSolving(true);
        try {
          let activeTok = await ensureToken('');
          if (!activeTok && !signedOutManuallyRef.current) {
            try {
              const refreshActor = DEMO_PERSONA_CLIENT_RE.test(actorRef.current)
                ? actorRef.current
                : 'leader-aurora';
              const refreshed = await readApiJson(
                await fetch('/api/auth/demo', {
                  method: 'POST',
                  headers: { 'content-type': 'application/json' },
                  body: JSON.stringify({ actorId: refreshActor, eventId, maxSize: 5 })
                })
              );
              activeTok = refreshed.token;
              tokenRef.current = refreshed.token;
              actorRef.current = refreshed.actorId;
              setToken(refreshed.token);
              setActorId(refreshed.actorId);
            } catch {
              // Keep instant local solve
            }
          }
          if (!activeTok || seq !== solveSeqRef.current) return;

          const callServerPair = async bearer =>
            Promise.all([
              readApiJson(
                await fetch('/api/plan', {
                  method: 'POST',
                  headers: { 'content-type': 'application/json', authorization: 'Bearer ' + bearer },
                  body: JSON.stringify({
                    goal: local.goalPayload,
                    people: local.apiTeam,
                    maxNodes: 5000
                  })
                })
              ),
              readApiJson(
                await fetch('/api/recommendations', {
                  method: 'POST',
                  headers: { 'content-type': 'application/json', authorization: 'Bearer ' + bearer },
                  body: JSON.stringify({
                    goal: local.goalPayload,
                    teamPeople: local.apiTeam,
                    candidates: local.apiCands
                  })
                })
              )
            ]);

          let pair;
          try {
            pair = await callServerPair(activeTok);
          } catch (firstErr) {
            if ((firstErr?.status === 401 || firstErr?.message === 'UNAUTHORIZED') && !signedOutManuallyRef.current) {
              tokenRef.current = '';
              const refreshActor = DEMO_PERSONA_CLIENT_RE.test(actorRef.current)
                ? actorRef.current
                : 'leader-aurora';
              const refreshed = await readApiJson(
                await fetch('/api/auth/demo', {
                  method: 'POST',
                  headers: { 'content-type': 'application/json' },
                  body: JSON.stringify({ actorId: refreshActor, eventId, maxSize: 5 })
                })
              );
              tokenRef.current = refreshed.token;
              actorRef.current = refreshed.actorId;
              setToken(refreshed.token);
              setActorId(refreshed.actorId);
              pair = await callServerPair(refreshed.token);
            } else {
              throw firstErr;
            }
          }

          if (seq === solveSeqRef.current && pair) {
            const [planRes, recRes] = pair;
            setPlan(planRes);
            setRecs(recRes);
            if (useCrewTag) {
              setVerifiedCrewMap(prev => ({
                ...prev,
                [`${eventId}::${useCrewTag}`]: planRes.status,
                [useCrewTag]: planRes.status
              }));
            }
            setAuthorityHealth('online');
          }
        } catch {
          // Keep instant local solve on transient network error
        } finally {
          if (seq === solveSeqRef.current) {
            setSolving(false);
          }
        }
      };

      if (overrides.explicitEvaluate) {
        await syncWithServer();
      } else {
        solveHttpDebounceRef.current = setTimeout(() => {
          solveHttpDebounceRef.current = null;
          syncWithServer();
        }, 180);
      }
      return local;
    },
    [goalDescription, horizonHours, tasks, teamPeople, candidates, evaluatingCrewId, eventId, wanOffline, ensureToken, notifyToast]
  );

  const selectScenario = useCallback(
    key => {
      const sc = MISSION_SCENARIOS[key];
      if (!sc) return;
      setActiveScenarioKey(key);
      setOmegaMode('contingent');
      setEvaluatingCrewId(null);
      setLockedPlanTeamId(null);
      setBeforeSnapshot(null);
      setGoalDescription(sc.goalDescription);
      setHorizonHours(sc.horizonHours);
      setTasks(sc.tasks);
      setTeamPeople(sc.teamPeople);
      setCandidates(sc.candidates);
      triggerHorizonPulse();
      const solved = computeLocalSolve({
        goalDescription: sc.goalDescription,
        horizonHours: sc.horizonHours,
        tasks: sc.tasks,
        teamPeople: sc.teamPeople,
        candidates: sc.candidates
      });
      const prevMap = computePartialTaskPreview(sc.tasks, sc.teamPeople, sc.horizonHours * 60, solved.planRes);
      const plain = describePlainPlanVerdict(solved.planRes, sc.tasks, prevMap);
      runSolveAndRecommend({
        goalDescription: sc.goalDescription,
        horizonHours: sc.horizonHours,
        tasks: sc.tasks,
        teamPeople: sc.teamPeople,
        candidates: sc.candidates,
        crewId: null,
        resetComparison: true,
        toastMessage: `${sc.title} -> ${plain.headline}`
      });
    },
    [runSolveAndRecommend, triggerHorizonPulse]
  );

  function handleToggleOmegaMode(nextMode) {
    const sc = MISSION_SCENARIOS.omega;
    setOmegaMode(nextMode);
    const nextRoster = nextMode === 'robust' ? sc.robustTeamPeople : sc.teamPeople;
    setTeamPeople(nextRoster);
    triggerHorizonPulse();
    runSolveAndRecommend({
      goalDescription: sc.goalDescription,
      horizonHours: sc.horizonHours,
      tasks: sc.tasks,
      teamPeople: nextRoster,
      candidates: sc.candidates,
      toastMessage:
        nextMode === 'robust'
          ? 'Backup covers frontend with verified work -> 0 extra questions needed!'
          : 'Unverified frontend without backup -> prompts 1 quick skill check.'
    });
  }

  function handleAddCandidateToTeam(candId) {
    const targetId = normalizeBuilderId(candId);
    if (!targetId) return;
    const found =
      candidates.find(c => normalizeBuilderId(c.id) === targetId) ||
      findBuilderById(targetId, [teamPeople, candidates]);
    if (!found) return;

    const alreadyInTeam = teamPeople.some(p => normalizeBuilderId(p.id) === targetId);
    const personEntry = {
      id: targetId,
      timezone: found.timezone || 'UTC-6 · Hot Springs',
      startMin: found.startMin ?? 0,
      endMin: found.endMin ?? Math.max(60, Math.round(Number(horizonHours || 4) * 60)),
      skills: { ...(found.skills || {}) }
    };
    const nextTeam = alreadyInTeam ? teamPeople : [...teamPeople, personEntry];
    const nextCands = candidates.filter(c => normalizeBuilderId(c.id) !== targetId);
    setTeamPeople(nextTeam);
    setCandidates(nextCands);
    triggerHorizonPulse();
    const preview = computeLocalSolve({
      goalDescription,
      horizonHours,
      tasks,
      teamPeople: nextTeam,
      candidates: nextCands
    });
    const prevMap = computePartialTaskPreview(tasks, nextTeam, preview.horizonMin, preview.planRes);
    const plain = describePlainPlanVerdict(preview.planRes, tasks, prevMap);
    runSolveAndRecommend({
      teamPeople: nextTeam,
      candidates: nextCands,
      toastMessage: `Tried ${found.displayName || targetId} in plan (preview) -> ${plain.headline}`
    });
  }

  function handleVerifyPersonSkill(personId, skillId) {
    const targetId = normalizeBuilderId(personId);
    const inTeam = teamPeople.some(p => normalizeBuilderId(p.id) === targetId);
    let nextTeam;
    if (inTeam) {
      nextTeam = teamPeople.map(p =>
        normalizeBuilderId(p.id) === targetId
          ? { ...p, id: targetId, skills: { ...(p.skills || {}), [skillId]: 'supported' } }
          : p
      );
    } else {
      const base = findBuilderById(targetId, [candidates, teamPeople]);
      nextTeam = [
        ...teamPeople,
        {
          id: targetId,
          timezone: base?.timezone || 'UTC-6 · Hot Springs',
          startMin: base?.startMin ?? 0,
          endMin: base?.endMin ?? Math.max(60, Math.round(Number(horizonHours || 4) * 60)),
          skills: { ...(base?.skills || {}), [skillId]: 'supported' }
        }
      ];
    }
    setTeamPeople(nextTeam);
    triggerHorizonPulse();
    const preview = computeLocalSolve({
      goalDescription,
      horizonHours,
      tasks,
      teamPeople: nextTeam,
      candidates
    });
    const prevMap = computePartialTaskPreview(tasks, nextTeam, preview.horizonMin, preview.planRes);
    const plain = describePlainPlanVerdict(preview.planRes, tasks, prevMap);
    runSolveAndRecommend({
      teamPeople: nextTeam,
      toastMessage: `Confirmed ${targetId}'s ${skillId} skill -> ${plain.headline}`
    });
  }

  // Cross-View Actions
  async function inspectTeam(tid, silent = false, targetEv = eventId) {
    if (!tid) return null;
    try {
      const detail = await readApiJson(
        await fetch(`/api/events/${encodeURIComponent(targetEv)}/teams/${encodeURIComponent(tid)}`, {
          cache: 'no-store'
        })
      );
      recordConfirmedTeamDetail(detail, targetEv);
      handleChangeActiveTeamId(detail.teamId || tid);
      setStatusMessage(`Confirmed by server: ${detail.members.length}/${detail.maxSize} spots filled on '${detail.teamId || tid}'.`);
      if (!silent) {
        notifyToast(
          `Loaded '${detail.teamId || tid}': ${detail.members.length}/${detail.maxSize} spots confirmed by server.`,
          'info'
        );
      }
      return detail;
    } catch (e) {
      setSelectedTeam(null);
      setStatusMessage(`Team lookup: ${e.message}`);
      if (!silent) {
        notifyToast(`Could not load '${tid}': ${e.message}`, 'err');
      }
      return null;
    }
  }

  // Step 2 -> Step 3: Create Team, Seat Planned Teammates & Generate Single-Use Invite on Server
  async function handleLockPlanAndMintInvite() {
    await runProtectedAction('Create Team & Single-Use Invite', async freshTok => {
      setLockingPlan(true);
      try {
        if (wanOffline && !queuedClaim) {
          setWanOffline(false);
          setAuthorityHealth('online');
        }
        const maxSpots = Math.max(2, Number(eventMaxSize || 5));
        await sendPost('/api/events', { eventId, maxSize: maxSpots }, freshTok);
        const tag = Date.now().toString(36).slice(-6);
        const targetTid = `00-feasible-${tag}`;
        const leadPersonHint = teamPeople[0]?.id || 'aurora';
        let activeTok = freshTok;
        let activeLead = actorRef.current || 'leader-aurora';

        try {
          await sendPost('/api/teams', { eventId, teamId: targetTid }, activeTok);
        } catch (teamErr) {
          if (
            (teamErr.code === 'ONE_TEAM_PER_EVENT' ||
              String(teamErr.message).includes('ONE_TEAM_PER_EVENT') ||
              teamErr.code === 'TEAM_EXISTS') &&
            isDemoSession() &&
            !signedOutManuallyRef.current
          ) {
            const leadPersonaId = buildValidDemoActorId(leadPersonHint, 'plan', tag);
            const freshPersona = await readApiJson(
              await fetch('/api/auth/demo', {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ actorId: leadPersonaId, eventId, maxSize: maxSpots })
              })
            );
            activeTok = freshPersona.token;
            activeLead = freshPersona.actorId;
            tokenRef.current = activeTok;
            actorRef.current = activeLead;
            setToken(activeTok);
            setActorId(activeLead);
            await sendPost('/api/teams', { eventId, teamId: targetTid }, activeTok);
          } else {
            throw teamErr;
          }
        }

        // Seat planned teammates via genuine server invites & claims while keeping >=1 spot open for an active invite
        let seatedCount = 1;
        const maxAutoSeatExtras = Math.max(0, Math.min(teamPeople.length - 1, maxSpots - 2));
        const plannedExtras = teamPeople.slice(1, 1 + maxAutoSeatExtras);
        const unseatedNextPerson =
          teamPeople.length > 1 + maxAutoSeatExtras ? teamPeople[1 + maxAutoSeatExtras]?.id : null;

        if (!signedOutManuallyRef.current && plannedExtras.length > 0) {
          for (let idx = 0; idx < plannedExtras.length; idx++) {
            const extraPerson = plannedExtras[idx];
            try {
              const memberInv = await sendPost(
                '/api/invitations',
                { eventId, teamId: targetTid, expiresAt: Date.now() + 600000 },
                activeTok
              );
              const memberActorId = buildValidDemoActorId(extraPerson?.id || `ally${idx + 1}`, 'plan', `${tag}${idx}`);
              const memberSess = await readApiJson(
                await fetch('/api/auth/demo', {
                  method: 'POST',
                  headers: { 'content-type': 'application/json' },
                  body: JSON.stringify({ actorId: memberActorId, eventId, maxSize: maxSpots })
                })
              );
              await sendPost(
                '/api/invitations/claim',
                {
                  eventId,
                  teamId: targetTid,
                  code: memberInv.code,
                  opId: `plan-seat-${tag}-${idx}`
                },
                memberSess.token
              );
              seatedCount += 1;
            } catch {
              // Stop auto-seating extras if demo personas are disabled (PS1_DEMO_AUTH=0)
              break;
            }
          }
        }

        const planSkills = Array.from(new Set(tasks.map(t => t.skill)));
        const nextCustom = saveCustomCrewOverlayEntry(eventId, targetTid, {
          mission: goalDescription,
          skills: planSkills,
          utcLabel: activeScenarioKey === 'baton' ? 'UTC-6 <-> UTC+5:30 Baton' : 'Verified Schedule',
          utcBucket: activeScenarioKey === 'baton' ? 'baton' : 'americas',
          scenarioKey: activeScenarioKey,
          tasks,
          horizonHours,
          teamPeople
        });
        setCustomCrewMap(nextCustom);
        setVerifiedCrewMap(prev => ({
          ...prev,
          [`${eventId}::${targetTid}`]: 'FEASIBLE_WITNESS',
          [targetTid]: 'FEASIBLE_WITNESS'
        }));

        const inv = await sendPost(
          '/api/invitations',
          { eventId, teamId: targetTid, expiresAt: Date.now() + 600000 },
          activeTok
        );
        setTeamId(targetTid);
        setLockedPlanTeamId(targetTid);
        setIssuedInvite({
          ...inv,
          teamId: targetTid,
          eventId,
          issuedBy: activeLead,
          suggestedInvitee: unseatedNextPerson ? extractFirstHandleSegment(unseatedNextPerson) : null,
          claimedBy: null,
          claimedAt: null
        });
        setInviteCode(inv.code);
        setPageIndex(0);
        await refreshBoard(false, true);
        const confirmedDetail = await inspectTeam(targetTid, true);
        const finalSeated = confirmedDetail?.members?.length || seatedCount;
        const aud = await sendGetAuth(`/api/events/${encodeURIComponent(eventId)}/audit`, activeTok);
        setAuditRows(aud.audit || []);
        setActiveView('authority');
        setStatusMessage(
          `Confirmed by server: '${targetTid}' has ${finalSeated}/${maxSpots} spots confirmed plus 1 open single-use invite ready in Step 3.`
        );
        notifyToast(
          `Created '${targetTid}' (${finalSeated}/${maxSpots} spots confirmed) & single-use invite!`,
          'ok'
        );
      } catch (e) {
        if (e?.status === 401 || e?.message === 'UNAUTHORIZED') throw e;
        setStatusMessage(`Create team failed: ${e.message}`);
        notifyToast(`Could not create team: ${e.message}`, 'err');
      } finally {
        setLockingPlan(false);
      }
    });
  }

  async function handleCheckFitCrew(crewProfile) {
    const tid = crewProfile.teamId;
    const sc = MISSION_SCENARIOS[crewProfile.scenarioKey] || MISSION_SCENARIOS.baton;
    const savedEntry =
      customCrewMap[`${eventId}::${tid}`] ||
      customCrewMap[tid] ||
      null;

    const useHours =
      savedEntry && Number.isFinite(Number(savedEntry.horizonHours)) && Number(savedEntry.horizonHours) > 0
        ? Number(savedEntry.horizonHours)
        : sc.horizonHours;
    const useHorizonMin = Math.max(60, Math.round(useHours * 60));
    const useTasks =
      Array.isArray(savedEntry?.tasks) && savedEntry.tasks.length > 0
        ? savedEntry.tasks
        : sc.tasks;

    let liveDetail = selectedTeam?.teamId === tid ? selectedTeam : null;
    if (!liveDetail && !wanOffline) {
      try {
        const res = await fetch(
          `/api/events/${encodeURIComponent(eventId)}/teams/${encodeURIComponent(tid)}`,
          { cache: 'no-store' }
        );
        if (res.ok) {
          liveDetail = await res.json();
          recordConfirmedTeamDetail(liveDetail, eventId);
        }
      } catch {
        liveDetail = null;
      }
    }

    const seatedPeople = liveDetail?.members?.length
      ? reconstructSeatedTeamPeople(liveDetail.members, savedEntry?.teamPeople || sc.teamPeople, useHorizonMin)
      : [];

    const useTeam =
      seatedPeople.length > 0
        ? seatedPeople
        : Array.isArray(savedEntry?.teamPeople) && savedEntry.teamPeople.length > 0
          ? savedEntry.teamPeople
          : sc.teamPeople;

    const teamCanonSet = new Set(useTeam.map(p => normalizeBuilderId(p.plannerId || p.id)));
    const useCands = (sc.candidates || []).filter(
      c => !teamCanonSet.has(normalizeBuilderId(c.plannerId || c.id))
    );

    setEvaluatingCrewId(tid);
    setActiveScenarioKey(crewProfile.scenarioKey || 'baton');
    const customGoal = `[${tid}] ${crewProfile.mission}`;
    setGoalDescription(customGoal);
    setHorizonHours(useHours);
    setTasks(useTasks);
    setTeamPeople(useTeam);
    setCandidates(useCands);
    setBeforeSnapshot(null);
    setActiveView('architect');
    triggerHorizonPulse();
    runSolveAndRecommend({
      goalDescription: customGoal,
      horizonHours: useHours,
      tasks: useTasks,
      teamPeople: useTeam,
      candidates: useCands,
      crewId: tid,
      resetComparison: true,
      toastMessage:
        seatedPeople.length > 0
          ? `Checking schedule fit for '${tid}' (${seatedPeople.length} seated ${seatedPeople.length === 1 ? 'member' : 'members'} loaded)`
          : `Previewing '${tid}' in Step 2 (preview only - not joined yet)`
    });
  }

  function handleRequestSeatForTeam(tid) {
    handleChangeActiveTeamId(tid);
    setLockedPlanTeamId(tid);
    inspectTeam(tid, true);
    setActiveView('authority');
    notifyToast(`Opened '${tid}' in Step 3: Manage your team.`, 'info');
  }

  function handleSendBuilderToArchitect(builder) {
    const resolved = findBuilderById(builder, [teamPeople, candidates]);
    if (!resolved) return;
    const targetId = normalizeBuilderId(resolved.plannerId || resolved.id);
    const existsInTeam = teamPeople.some(p => normalizeBuilderId(p.id) === targetId);
    const existsInCands = candidates.some(p => normalizeBuilderId(p.id) === targetId);
    let nextCands = candidates;
    if (!existsInTeam && !existsInCands) {
      nextCands = [
        {
          id: targetId,
          timezone: resolved.timezone,
          startMin: resolved.startMin ?? 0,
          endMin: resolved.endMin ?? 240,
          skills: { ...(resolved.skills || {}) }
        },
        ...candidates
      ];
      setCandidates(nextCands);
    }
    setActiveView('architect');
    runSolveAndRecommend({
      candidates: nextCands,
      toastMessage: `Viewing ${resolved.displayName || targetId} in Step 2: Plan the work.`
    });
  }

  function handleToggleBuilderInCrew(builderOrId) {
    const resolved = findBuilderById(builderOrId, [teamPeople, candidates]);
    if (!resolved) return;
    const targetId = normalizeBuilderId(resolved.plannerId || resolved.id);
    const label = resolved.displayName || targetId;
    const existsInTeam = teamPeople.some(p => normalizeBuilderId(p.id) === targetId);
    let nextTeam;
    let nextCands = [...candidates];

    if (existsInTeam) {
      nextTeam = teamPeople.filter(p => normalizeBuilderId(p.id) !== targetId);
      if (!nextCands.some(c => normalizeBuilderId(c.id) === targetId)) {
        nextCands = [
          {
            id: targetId,
            timezone: resolved.timezone,
            startMin: resolved.startMin ?? 0,
            endMin: resolved.endMin ?? 240,
            skills: { ...(resolved.skills || {}) }
          },
          ...nextCands
        ];
      }
    } else {
      const personEntry = {
        id: targetId,
        timezone: resolved.timezone,
        startMin: resolved.startMin ?? 0,
        endMin: resolved.endMin ?? 240,
        skills: { ...(resolved.skills || {}) }
      };
      nextTeam = [...teamPeople, personEntry];
      nextCands = nextCands.filter(c => normalizeBuilderId(c.id) !== targetId);
    }

    setTeamPeople(nextTeam);
    setCandidates(nextCands);
    triggerHorizonPulse();
    const preview = computeLocalSolve({
      goalDescription,
      horizonHours,
      tasks,
      teamPeople: nextTeam,
      candidates: nextCands
    });
    const prevMap = computePartialTaskPreview(tasks, nextTeam, preview.horizonMin, preview.planRes);
    const plain = describePlainPlanVerdict(preview.planRes, tasks, prevMap);
    const toastMsg = existsInTeam
      ? `Removed ${label} from plan preview -> ${plain.headline}`
      : `Tried ${label} in plan (preview only) -> ${plain.headline}`;

    setStatusMessage(toastMsg);
    runSolveAndRecommend({
      teamPeople: nextTeam,
      candidates: nextCands,
      toastMessage: toastMsg
    });
  }

  // Step 3: Server Membership & Offline Forwarding Handlers
  const loadAudit = useCallback(
    async (overrideTok, manual = false) => {
      try {
        await runProtectedAction('Load Server History', async freshTok => {
          const aud = await sendGetAuth(
            `/api/events/${encodeURIComponent(eventId)}/audit`,
            typeof overrideTok === 'string' ? overrideTok : freshTok
          );
          setAuditRows(aud.audit || []);
          setStatusMessage(`Loaded ${aud.audit?.length || 0} confirmed server records.`);
          if (manual === true) {
            notifyToast(`Loaded ${aud.audit?.length || 0} server records.`, 'ok');
          }
        });
      } catch (e) {
        setStatusMessage(`History error: ${e.message}`);
        if (manual === true) {
          notifyToast(`Could not load history: ${e.message}`, 'err');
        }
      }
    },
    [eventId, runProtectedAction, sendGetAuth, notifyToast]
  );

  async function mintDemoSession(personaId, targetEv = eventId, maxSz = eventMaxSize || 5) {
    return readApiJson(
      await fetch('/api/auth/demo', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ actorId: personaId, eventId: targetEv, maxSize: maxSz })
      })
    );
  }

  async function sha256HexClient(text) {
    const bytes = new TextEncoder().encode(String(text || ''));
    const digest = await crypto.subtle.digest('SHA-256', bytes);
    return Array.from(new Uint8Array(digest))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
  }

  async function mintClaimantWarrant({ targetEventId, targetTeamId, opId, code }, claimantBearerTok) {
    if (!claimantBearerTok || !code || !opId) return null;
    try {
      const codeHash = await sha256HexClient(code);
      const res = await sendPost(
        '/api/auth/relay-warrant',
        { eventId: targetEventId, teamId: targetTeamId, opId, codeHash },
        claimantBearerTok
      );
      return res?.warrant || null;
    } catch {
      return null;
    }
  }

  function makeUniqueTag() {
    return `${String(Date.now()).slice(-4)}${Math.random().toString(36).slice(2, 4)}`;
  }

  async function createCleanTeamWithLead(desiredTid, initialTok, initialActor) {
    const baseTid =
      String(desiredTid || 'crew-alpha')
        .replace(/[^A-Za-z0-9_.:@-]/g, '')
        .trim() || 'crew-alpha';
    const tag = makeUniqueTag();
    let activeTok = await ensureToken(initialTok);
    let activeLead = initialActor || actorRef.current || 'leader-aurora';
    let targetTid = baseTid;
    const canSwapDemoLead = isDemoSession() && !signedOutManuallyRef.current;

    try {
      await sendPost('/api/events', { eventId, maxSize: eventMaxSize || 5 }, activeTok);
    } catch {
      // Event already exists
    }

    // Pre-check if baseTid already exists in this event
    try {
      const checkRes = await fetch(
        `/api/events/${encodeURIComponent(eventId)}/teams/${encodeURIComponent(targetTid)}`,
        { cache: 'no-store' }
      );
      if (checkRes.ok) {
        targetTid = `${baseTid}-${tag}`;
      }
    } catch {
      // Proceed to creation attempt
    }

    const switchLeadAndRetry = async tidToCreate => {
      const freshLead = await mintDemoSession(`aurora-lead-${tag}`, eventId, eventMaxSize || 5);
      signedOutManuallyRef.current = false;
      activeTok = freshLead.token;
      activeLead = freshLead.actorId;
      tokenRef.current = activeTok;
      actorRef.current = activeLead;
      setToken(activeTok);
      setActorId(activeLead);
      return sendPost('/api/teams', { eventId, teamId: tidToCreate }, activeTok);
    };

    let createdRes;
    try {
      createdRes = await sendPost('/api/teams', { eventId, teamId: targetTid }, activeTok);
    } catch (err1) {
      const msg1 = String(err1?.code || err1?.message || '');
      if (msg1.includes('ONE_TEAM_PER_EVENT')) {
        if (!canSwapDemoLead) {
          throw err1;
        }
        try {
          createdRes = await switchLeadAndRetry(targetTid);
        } catch {
          // Global SQLite PK collision across events on teams.id -> suffix teamId
          targetTid = `${baseTid}-${tag}`;
          createdRes = await sendPost('/api/teams', { eventId, teamId: targetTid }, activeTok);
        }
      } else if (err1?.status === 500 || msg1.includes('INTERNAL_ERROR') || msg1.includes('UNIQUE') || msg1.includes('EXIST')) {
        targetTid = `${baseTid}-${tag}`;
        try {
          createdRes = await sendPost('/api/teams', { eventId, teamId: targetTid }, activeTok);
        } catch (err3) {
          if (String(err3?.code || err3?.message || '').includes('ONE_TEAM_PER_EVENT') && canSwapDemoLead) {
            createdRes = await switchLeadAndRetry(targetTid);
          } else {
            throw err3;
          }
        }
      } else {
        throw err1;
      }
    }

    const finalTid = createdRes?.teamId || targetTid;
    setTeamId(finalTid);
    setLockedPlanTeamId(finalTid);
    return { createdTeamId: finalTid, activeTok, activeLead };
  }

  async function handleCreateTeam(customMeta = {}) {
    const requestedTid = customMeta?.teamIdOverride || teamId;
    try {
      await runProtectedAction(`Create Team (${requestedTid})`, async (freshTok, freshActor) => {
        if (wanOffline && !queuedClaim) {
          setWanOffline(false);
          setAuthorityHealth('online');
        }
        const { createdTeamId, activeTok, activeLead } = await createCleanTeamWithLead(
          requestedTid,
          freshTok,
          freshActor
        );
        setIssuedInvite(null);
        setInviteCode('');
        if (customMeta && (customMeta.mission || customMeta.skills)) {
          const nextCustom = saveCustomCrewOverlayEntry(eventId, createdTeamId, {
            mission: customMeta.mission,
            skills: customMeta.skills,
            scenarioKey: activeScenarioKey,
            tasks,
            horizonHours,
            teamPeople
          });
          setCustomCrewMap(nextCustom);
        }
        setStatusMessage(
          `Confirmed by server: created team '${createdTeamId}' led by '${activeLead}'.`
        );
        notifyToast(`Confirmed by server: created team '${createdTeamId}'`, 'ok');
        await refreshBoard(false, true);
        await inspectTeam(createdTeamId, true);
        await loadAudit(activeTok);
      });
    } catch (e) {
      setStatusMessage(`Create team: ${e.message}`);
      notifyToast(`Could not create team: ${e.message}`, 'err');
    }
  }

  async function handleCreateInvite() {
    try {
      await runProtectedAction(`Create Invite (${teamId})`, async (freshTok, freshActor) => {
        if (wanOffline && !queuedClaim) {
          setWanOffline(false);
          setAuthorityHealth('online');
        }
        const expiresAt = Date.now() + 600000;
        let targetTid =
          String(teamId || 'crew-alpha')
            .replace(/[^A-Za-z0-9_.:@-]/g, '')
            .trim() || 'crew-alpha';

        // Never silently jump a full 5/5 team back to a new 1/5 team when creating an invite
        if (
          selectedTeam?.teamId === targetTid &&
          (selectedTeam.members?.length || 0) >= (selectedTeam.maxSize || 5)
        ) {
          const fullMsg = `Team '${targetTid}' is already full (${selectedTeam.members.length}/${selectedTeam.maxSize} spots). Leave a spot or create a new team.`;
          setStatusMessage(fullMsg);
          notifyToast(fullMsg, 'warn');
          return;
        }

        let existingDetail = null;
        try {
          const preRes = await fetch(
            `/api/events/${encodeURIComponent(eventId)}/teams/${encodeURIComponent(targetTid)}`,
            { cache: 'no-store' }
          );
          if (preRes.ok) {
            existingDetail = await preRes.json();
            if ((existingDetail.members?.length || 0) >= (existingDetail.maxSize || 5)) {
              recordConfirmedTeamDetail(existingDetail, eventId);
              const fullMsg = `Team '${targetTid}' is already full (${existingDetail.members.length}/${existingDetail.maxSize} spots). Leave a spot or create a new team.`;
              setStatusMessage(fullMsg);
              notifyToast(fullMsg, 'warn');
              return;
            }
          }
        } catch {
          existingDetail = null;
        }

        let activeTok = await ensureToken(freshTok);
        let activeLead = freshActor || actorRef.current || actorId || 'leader';
        const canSwapDemoLead = isDemoSession() && !signedOutManuallyRef.current;
        let res;

        try {
          res = await sendPost('/api/invitations', { eventId, teamId: targetTid, expiresAt }, activeTok);
        } catch (invErr) {
          const codeStr = String(invErr?.code || invErr?.message || '');
          if (codeStr.includes('TEAM_FULL')) {
            const fullMsg = `Team '${targetTid}' is already full (${existingDetail?.maxSize || eventMaxSize || 5}/${existingDetail?.maxSize || eventMaxSize || 5} spots). Leave a spot or create a new team.`;
            setStatusMessage(fullMsg);
            notifyToast(fullMsg, 'warn');
            return;
          }
          if (invErr?.status === 404 || codeStr.includes('NO_TEAM')) {
            const created = await createCleanTeamWithLead(targetTid, activeTok, activeLead);
            targetTid = created.createdTeamId;
            activeTok = created.activeTok;
            activeLead = created.activeLead;
            res = await sendPost('/api/invitations', { eventId, teamId: targetTid, expiresAt }, activeTok);
          } else if (invErr?.status === 403 || codeStr.includes('LEADER_REQUIRED')) {
            const detail =
              existingDetail ||
              (await readApiJson(
                await fetch(
                  `/api/events/${encodeURIComponent(eventId)}/teams/${encodeURIComponent(targetTid)}`,
                  { cache: 'no-store' }
                )
              ));
            if ((detail.members?.length || 0) >= (detail.maxSize || 5)) {
              recordConfirmedTeamDetail(detail, eventId);
              const fullMsg = `Team '${targetTid}' is already full (${detail.members.length}/${detail.maxSize} spots). Leave a spot or create a new team.`;
              setStatusMessage(fullMsg);
              notifyToast(fullMsg, 'warn');
              return;
            }
            if (canSwapDemoLead && detail?.leader) {
              if (DEMO_PERSONA_CLIENT_RE.test(detail.leader)) {
                try {
                  const leadSession = await mintDemoSession(detail.leader, eventId, detail.maxSize || 5);
                  activeTok = leadSession.token;
                  activeLead = leadSession.actorId;
                  tokenRef.current = activeTok;
                  actorRef.current = activeLead;
                  setToken(activeTok);
                  setActorId(activeLead);
                  res = await sendPost('/api/invitations', { eventId, teamId: targetTid, expiresAt }, activeTok);
                } catch {
                  setAuthPromptMessage(
                    `Sign in as team lead '${detail.leader}' to create a single-use invite for '${targetTid}'.`
                  );
                  setAuthModalOpen(true);
                  throw invErr;
                }
              } else {
                setAuthPromptMessage(
                  `Team '${targetTid}' is led by registered account '${detail.leader}'. Sign in as '${detail.leader}' or create a new team.`
                );
                setAuthModalOpen(true);
                throw invErr;
              }
            } else {
              throw invErr;
            }
          } else {
            throw invErr;
          }
        }

        const latestDetail = await inspectTeam(targetTid, true);
        const suggestedInvitee = pickNextUnseatedTeammateHint(
          latestDetail || (selectedTeam?.teamId === targetTid ? selectedTeam : null),
          teamPeople,
          null
        );
        setTeamId(targetTid);
        setLockedPlanTeamId(targetTid);
        setIssuedInvite({
          ...res,
          teamId: targetTid,
          eventId,
          issuedBy: activeLead,
          suggestedInvitee,
          claimedBy: null,
          claimedAt: null
        });
        setInviteCode(res.code);
        setStatusMessage(`Confirmed by server: created single-use invite for '${targetTid}' (expires in 10m).`);
        notifyToast(`Created single-use invite for '${targetTid}'.`, 'ok');
        await refreshBoard(false, true);
        await loadAudit(activeTok);
      });
    } catch (e) {
      setStatusMessage(`Invite: ${e.message}`);
      notifyToast(`Could not create invite: ${e.message}`, 'err');
    }
  }

  async function handleRequestInviteAndJoinOpenSpot() {
    if (joiningLock.current) return;
    joiningLock.current = true;
    setJoining(true);
    try {
      await runProtectedAction(`Join Open Spot (${teamId})`, async (freshTok, freshActor) => {
        const targetTid = selectedTeam?.teamId || teamId;
        const detail = await readApiJson(
          await fetch(
            `/api/events/${encodeURIComponent(eventId)}/teams/${encodeURIComponent(targetTid)}`,
            { cache: 'no-store' }
          )
        );
        if ((detail.members?.length || 0) >= (detail.maxSize || 5)) {
          throw new Error('TEAM_FULL');
        }

        const tag = makeUniqueTag();
        const nextHint = pickNextUnseatedTeammateHint(detail, teamPeople, null);
        const nextPersonaId = buildValidDemoActorId(nextHint, 'open', tag);
        let leadTok = await ensureToken(freshTok);
        if (
          detail.leader &&
          detail.leader !== (freshActor || actorRef.current) &&
          DEMO_PERSONA_CLIENT_RE.test(detail.leader)
        ) {
          try {
            const leadSession = await mintDemoSession(detail.leader, eventId, detail.maxSize || 5);
            leadTok = leadSession.token;
          } catch {
            // Fall back to current authenticated session if demo auth is disabled
          }
        }

        const inv = await sendPost(
          '/api/invitations',
          { eventId, teamId: targetTid, expiresAt: Date.now() + 600000 },
          leadTok
        );
        setIssuedInvite({
          ...inv,
          teamId: targetTid,
          eventId,
          issuedBy: detail.leader,
          suggestedInvitee: nextHint,
          claimedBy: null,
          claimedAt: null
        });
        setInviteCode(inv.code);

        let claimantTok = await ensureToken(freshTok);
        let claimantActor = freshActor || actorRef.current || '';
        const canSwapDemoClaimant = isDemoSession() && !signedOutManuallyRef.current;
        const alreadyInSelected =
          !claimantActor ||
          claimantActor === detail.leader ||
          (detail.members || []).some(m => m.userId === claimantActor);

        if (alreadyInSelected && canSwapDemoClaimant) {
          const candSession = await mintDemoSession(nextPersonaId, eventId, detail.maxSize || 5);
          signedOutManuallyRef.current = false;
          claimantTok = candSession.token;
          claimantActor = candSession.actorId;
          if (!tokenRef.current || !actorRef.current) {
            tokenRef.current = claimantTok;
            actorRef.current = claimantActor;
            setToken(claimantTok);
            setActorId(claimantActor);
          }
        }

        const operation = await getOrCreateClaimOperation({
          eventId,
          teamId: targetTid,
          code: inv.code,
          store: sessionStorage
        });

        if (wanOffline) {
          if (claimantActor === 'relay-mateo' && canSwapDemoClaimant) {
            try {
              const candSession = await mintDemoSession(nextPersonaId, eventId, detail.maxSize || 5);
              signedOutManuallyRef.current = false;
              claimantTok = candSession.token;
              claimantActor = candSession.actorId;
              tokenRef.current = claimantTok;
              actorRef.current = claimantActor;
              setToken(claimantTok);
              setActorId(claimantActor);
            } catch {
              // Keep current session when demo auth is disabled
            }
          }
          claimantDirectTokenRef.current = claimantTok;
          const warrant = await mintClaimantWarrant(
            { targetEventId: eventId, targetTeamId: targetTid, opId: operation.opId, code: inv.code },
            claimantTok
          );
          const armed = {
            eventId,
            teamId: targetTid,
            code: inv.code,
            opId: operation.opId,
            key: operation.key,
            actorId: claimantActor,
            ...(warrant ? { claimantWarrant: warrant } : { claimantToken: claimantTok })
          };
          setQueuedClaim(armed);
          lastClaimRef.current = armed;
          setHasLastClaim(true);
          setRelayedReceipt(null);
          setReplayReceipt(null);
          setStatusMessage(`Saved join request on device (${claimantActor} -> ${targetTid}). Click Send through Mateo.`);
          notifyToast('Saved join request on device! Click Send through Mateo.', 'warn');
          return;
        }

        let result;
        try {
          result = await sendPost(
            '/api/invitations/claim',
            { eventId, teamId: targetTid, code: inv.code, opId: operation.opId },
            claimantTok
          );
        } catch (claimErr) {
          if (
            String(claimErr?.code || claimErr?.message || '').includes('ONE_TEAM_PER_EVENT') &&
            canSwapDemoClaimant
          ) {
            const retryPersonaId = buildValidDemoActorId(nextHint, 'join', `${tag}r`);
            const candSession = await mintDemoSession(retryPersonaId, eventId, detail.maxSize || 5);
            signedOutManuallyRef.current = false;
            claimantTok = candSession.token;
            claimantActor = candSession.actorId;
            if (!tokenRef.current || !actorRef.current) {
              tokenRef.current = claimantTok;
              actorRef.current = claimantActor;
              setToken(claimantTok);
              setActorId(claimantActor);
            }
            result = await sendPost(
              '/api/invitations/claim',
              { eventId, teamId: targetTid, code: inv.code, opId: operation.opId },
              claimantTok
            );
          } else {
            throw claimErr;
          }
        }

        const joinedActor = result.actorId || claimantActor;
        if (result.status === 'COMMITTED') {
          finishClaimOperation(sessionStorage, operation.key);
          setLastClaimCode(inv.code);
          markInviteAccepted(inv.code, joinedActor, true);
        }
        const savedClaim = {
          eventId,
          teamId: targetTid,
          code: inv.code,
          opId: operation.opId,
          key: operation.key,
          actorId: joinedActor,
          claimantToken: claimantTok
        };
        lastClaimRef.current = savedClaim;
        setHasLastClaim(true);
        setQueuedClaim(null);
        const updatedDetail = await inspectTeam(targetTid, true);
        const countLabel = updatedDetail
          ? ` (${updatedDetail.members.length}/${updatedDetail.maxSize} spots)`
          : '';
        setStatusMessage(`Confirmed by server: '${joinedActor}' joined '${targetTid}'${countLabel}.`);
        notifyToast(`Confirmed by server: '${formatHumanActorName(joinedActor, true)}' joined '${targetTid}'${countLabel}!`, 'ok');
        await refreshBoard(false, true);
        await loadAudit(claimantTok);
      });
    } catch (e) {
      setStatusMessage(`Open-spot join: ${e.message}`);
      notifyToast(`Could not join open spot: ${e.message}`, 'err');
    } finally {
      joiningLock.current = false;
      setJoining(false);
    }
  }

  async function handleClaimAsFreshCandidate() {
    const activeCode = String(
      inviteCode || (issuedInvite && !issuedInvite.claimedBy ? issuedInvite.code : '') || ''
    ).trim();
    if (joiningLock.current || !activeCode) return;
    joiningLock.current = true;
    setJoining(true);
    try {
      const effectiveTid =
        issuedInvite && issuedInvite.code === activeCode && issuedInvite.teamId
          ? issuedInvite.teamId
          : teamId;
      if (effectiveTid !== teamId) {
        setTeamId(effectiveTid);
      }

      let teamDetail = selectedTeam?.teamId === effectiveTid ? selectedTeam : null;
      if (!teamDetail) {
        try {
          teamDetail = await readApiJson(
            await fetch(
              `/api/events/${encodeURIComponent(eventId)}/teams/${encodeURIComponent(effectiveTid)}`,
              { cache: 'no-store' }
            )
          );
        } catch {
          teamDetail = null;
        }
      }

      const suffix = makeUniqueTag();
      const nextHint = pickNextUnseatedTeammateHint(teamDetail, teamPeople, issuedInvite);
      const freshCandidateId = buildValidDemoActorId(nextHint, 'claim', suffix);
      const maxSpots = teamDetail?.maxSize || eventMaxSize || 5;
      const callerHadSession = Boolean(tokenRef.current && actorRef.current);
      let claimantTok = '';
      let claimantActor = freshCandidateId;

      try {
        const candSession = await mintDemoSession(freshCandidateId, eventId, maxSpots);
        claimantTok = candSession.token;
        claimantActor = candSession.actorId;
        signedOutManuallyRef.current = false;
        // Keep the caller's active 'Acting as' leader session intact if already signed in!
        if (!callerHadSession) {
          tokenRef.current = claimantTok;
          actorRef.current = claimantActor;
          setToken(claimantTok);
          setActorId(claimantActor);
        }
      } catch {
        await runProtectedAction(`Join ${effectiveTid} as Invited Teammate`, async (replayedTok, replayedActor) => {
          const op = await getOrCreateClaimOperation({
            eventId,
            teamId: effectiveTid,
            code: activeCode,
            store: sessionStorage
          });
          const res = await sendPost(
            '/api/invitations/claim',
            { eventId, teamId: effectiveTid, code: activeCode, opId: op.opId },
            replayedTok
          );
          const joinedWho = res.actorId || replayedActor;
          if (res.status === 'COMMITTED') {
            finishClaimOperation(sessionStorage, op.key);
            setLastClaimCode(activeCode);
            markInviteAccepted(activeCode, joinedWho, true);
          }
          const updated = await inspectTeam(effectiveTid, true);
          const spotsInfo = updated ? ` (${updated.members.length}/${updated.maxSize} spots)` : '';
          setStatusMessage(`Confirmed by server: '${joinedWho}' joined '${res.teamId}'${spotsInfo}.`);
          notifyToast(`Confirmed by server: joined '${res.teamId}'${spotsInfo}!`, 'ok');
          await refreshBoard(false, true);
          await loadAudit(replayedTok);
        });
        return;
      }

      const operation = await getOrCreateClaimOperation({
        eventId,
        teamId: effectiveTid,
        code: activeCode,
        store: sessionStorage
      });

      if (wanOffline) {
        claimantDirectTokenRef.current = claimantTok;
        const warrant = await mintClaimantWarrant(
          { targetEventId: eventId, targetTeamId: effectiveTid, opId: operation.opId, code: activeCode },
          claimantTok
        );
        const armed = {
          eventId,
          teamId: effectiveTid,
          code: activeCode,
          opId: operation.opId,
          key: operation.key,
          actorId: claimantActor,
          ...(warrant ? { claimantWarrant: warrant } : { claimantToken: claimantTok })
        };
        setQueuedClaim(armed);
        lastClaimRef.current = armed;
        setHasLastClaim(true);
        setRelayedReceipt(null);
        setReplayReceipt(null);
        setStatusMessage(`Saved on this device. Waiting to send (${claimantActor} -> ${effectiveTid}).`);
        notifyToast('Saved on this device. Waiting to send.', 'warn');
        return;
      }

      const result = await sendPost(
        '/api/invitations/claim',
        { eventId, teamId: effectiveTid, code: activeCode, opId: operation.opId },
        claimantTok
      );
      const joinedActor = result.actorId || claimantActor;
      if (result.status === 'COMMITTED') {
        finishClaimOperation(sessionStorage, operation.key);
        setLastClaimCode(activeCode);
        markInviteAccepted(activeCode, joinedActor, true);
      }
      const savedClaim = {
        eventId,
        teamId: effectiveTid,
        code: activeCode,
        opId: operation.opId,
        key: operation.key,
        actorId: joinedActor,
        claimantToken: claimantTok
      };
      lastClaimRef.current = savedClaim;
      setHasLastClaim(true);
      setQueuedClaim(null);
      const updatedDetail = await inspectTeam(effectiveTid, true);
      const countLabel = updatedDetail
        ? ` (${updatedDetail.members.length}/${updatedDetail.maxSize} spots)`
        : '';
      setStatusMessage(`Confirmed by server: '${joinedActor}' joined '${result.teamId}'${countLabel}.`);
      notifyToast(
        `Confirmed by server: '${formatHumanActorName(joinedActor, true)}' joined '${result.teamId}'${countLabel}!`,
        'ok'
      );
      await refreshBoard(false, true);
      await loadAudit(tokenRef.current || claimantTok);
    } catch (e) {
      setStatusMessage(`Join request: ${e.message}`);
      notifyToast(`Join request turned away: ${e.message}`, 'err');
    } finally {
      joiningLock.current = false;
      setJoining(false);
    }
  }

  async function prepareCleanRelayClaim({ allowExistingInvite = true } = {}) {
    const tag = makeUniqueTag();
    let prepTeam = teamId;
    let prepCode = '';
    let reusedExisting = false;

    if (
      allowExistingInvite &&
      issuedInvite &&
      !issuedInvite.claimedBy &&
      issuedInvite.eventId === eventId &&
      issuedInvite.teamId === teamId &&
      issuedInvite.code &&
      (!issuedInvite.expiresAt || issuedInvite.expiresAt > Date.now() + 5000)
    ) {
      try {
        const detail = await readApiJson(
          await fetch(
            `/api/events/${encodeURIComponent(eventId)}/teams/${encodeURIComponent(teamId)}`,
            { cache: 'no-store' }
          )
        );
        if ((detail.members?.length || 0) < (detail.maxSize || 5)) {
          prepTeam = teamId;
          prepCode = issuedInvite.code;
          reusedExisting = true;
        }
      } catch {
        reusedExisting = false;
      }
    }

    if (!reusedExisting) {
      prepTeam = `00-relay-crew-${tag}`;
      const leadSession = await mintDemoSession(`aurora-lead-${tag}`, eventId, 5);
      try {
        await sendPost('/api/events', { eventId, maxSize: 5 }, leadSession.token);
      } catch {
        // Event already exists
      }
      await sendPost('/api/teams', { eventId, teamId: prepTeam }, leadSession.token);
      const inv = await sendPost(
        '/api/invitations',
        { eventId, teamId: prepTeam, expiresAt: Date.now() + 600000 },
        leadSession.token
      );
      prepCode = inv.code;
      setTeamId(prepTeam);
      setIssuedInvite({
        ...inv,
        teamId: prepTeam,
        eventId,
        issuedBy: leadSession.actorId,
        claimedBy: null,
        claimedAt: null
      });
      setInviteCode(inv.code);
      await inspectTeam(prepTeam, true);
    }

    const priyaSession = await mintDemoSession(`priya-wan-${tag}`, eventId, 5);
    const relaySession = await mintDemoSession('relay-mateo', eventId, 5);

    signedOutManuallyRef.current = false;
    tokenRef.current = priyaSession.token;
    actorRef.current = priyaSession.actorId;
    setActorId(priyaSession.actorId);
    setToken(priyaSession.token);
    setRelayToken(relaySession.token);
    setWanOffline(true);
    setAuthorityHealth('wan-dropped');

    const op = await getOrCreateClaimOperation({
      eventId,
      teamId: prepTeam,
      code: prepCode,
      store: sessionStorage
    });

    claimantDirectTokenRef.current = priyaSession.token;
    const warrant = await mintClaimantWarrant(
      { targetEventId: eventId, targetTeamId: prepTeam, opId: op.opId, code: prepCode },
      priyaSession.token
    );

    const armed = {
      eventId,
      teamId: prepTeam,
      code: prepCode,
      opId: op.opId,
      key: op.key,
      actorId: priyaSession.actorId,
      ...(warrant ? { claimantWarrant: warrant } : { claimantToken: priyaSession.token })
    };
    setQueuedClaim(armed);
    lastClaimRef.current = armed;
    setHasLastClaim(true);
    setReplayReceipt(null);

    return { armed, relayTok: relaySession.token };
  }

  async function handleJoinSeat(opts = {}) {
    if (joiningLock.current) return;
    joiningLock.current = true;
    setJoining(true);
    const fromStep1 = Boolean(opts?.fromWalkthroughStep1);
    try {
      await runProtectedAction(`Join ${teamId}`, async (freshTok, freshActor) => {
        let useTok = await ensureToken(freshTok);
        let useActor = freshActor || actorRef.current || 'builder-priya';
        let activeCode = String(inviteCode || '').trim();
        let targetTid =
          issuedInvite && activeCode && issuedInvite.code === activeCode && issuedInvite.teamId
            ? issuedInvite.teamId
            : teamId;
        if (targetTid !== teamId) {
          setTeamId(targetTid);
        }

        // Self-arm if inviteCode is empty when clicking Step 1B
        if (!activeCode) {
          const tag = makeUniqueTag();
          let minted = false;
          if (
            selectedTeam &&
            selectedTeam.teamId === targetTid &&
            (selectedTeam.members?.length || 0) < (selectedTeam.maxSize || 5) &&
            DEMO_PERSONA_CLIENT_RE.test(selectedTeam.leader || '')
          ) {
            try {
              const leadSession = await mintDemoSession(selectedTeam.leader, eventId, selectedTeam.maxSize || 5);
              const inv = await sendPost(
                '/api/invitations',
                { eventId, teamId: targetTid, expiresAt: Date.now() + 600000 },
                leadSession.token
              );
              activeCode = inv.code;
              setIssuedInvite({
                ...inv,
                teamId: targetTid,
                eventId,
                issuedBy: selectedTeam.leader,
                claimedBy: null,
                claimedAt: null
              });
              setInviteCode(inv.code);
              minted = true;
            } catch {
              minted = false;
            }
          }
          if (!minted) {
            targetTid = `00-relay-crew-${tag}`;
            const leadSession = await mintDemoSession(`aurora-lead-${tag}`, eventId, 5);
            try {
              await sendPost('/api/events', { eventId, maxSize: 5 }, leadSession.token);
            } catch {
              // Event already exists
            }
            await sendPost('/api/teams', { eventId, teamId: targetTid }, leadSession.token);
            const inv = await sendPost(
              '/api/invitations',
              { eventId, teamId: targetTid, expiresAt: Date.now() + 600000 },
              leadSession.token
            );
            activeCode = inv.code;
            setTeamId(targetTid);
            setIssuedInvite({
              ...inv,
              teamId: targetTid,
              eventId,
              issuedBy: leadSession.actorId,
              claimedBy: null,
              claimedAt: null
            });
            setInviteCode(inv.code);
            await inspectTeam(targetTid, true);
          }
        }

        const canSwapDemoClaimant = isDemoSession() && !signedOutManuallyRef.current;

        const isIdempotentReplayBySameClaimant = Boolean(
          lastClaimRef.current &&
            lastClaimRef.current.code === activeCode &&
            lastClaimRef.current.teamId === targetTid &&
            (lastClaimRef.current.actorId === useActor || Boolean(lastClaimRef.current.claimantToken))
        );

        if (
          isIdempotentReplayBySameClaimant &&
          lastClaimRef.current.actorId !== useActor &&
          lastClaimRef.current.claimantToken &&
          canSwapDemoClaimant
        ) {
          useTok = lastClaimRef.current.claimantToken;
          useActor = lastClaimRef.current.actorId;
        }

        const actorAlreadyInTargetTeam = Boolean(
          useActor &&
            ((selectedTeam &&
              selectedTeam.teamId === targetTid &&
              (selectedTeam.leader === useActor ||
                (selectedTeam.members || []).some(m => m.userId === useActor))) ||
              (issuedInvite &&
                issuedInvite.code === activeCode &&
                issuedInvite.teamId === targetTid &&
                issuedInvite.issuedBy === useActor))
        );

        if (
          !isIdempotentReplayBySameClaimant &&
          canSwapDemoClaimant &&
          (actorAlreadyInTargetTeam || (wanOffline && useActor === 'relay-mateo'))
        ) {
          try {
            const tag = makeUniqueTag();
            const nextHint = pickNextUnseatedTeammateHint(
              selectedTeam?.teamId === targetTid ? selectedTeam : null,
              teamPeople,
              issuedInvite
            );
            const candPersonaId = buildValidDemoActorId(nextHint, wanOffline ? 'wan' : 'claim', tag);
            const candSession = await mintDemoSession(candPersonaId, eventId, eventMaxSize || 5);
            signedOutManuallyRef.current = false;
            useTok = candSession.token;
            useActor = candSession.actorId;
            if (!tokenRef.current || !actorRef.current || (wanOffline && actorRef.current === 'relay-mateo')) {
              tokenRef.current = useTok;
              actorRef.current = useActor;
              setToken(useTok);
              setActorId(useActor);
            }
          } catch {
            // Keep current token when demo auth is disabled
          }
        }

        const operation = await getOrCreateClaimOperation({
          eventId,
          teamId: targetTid,
          code: activeCode,
          store: sessionStorage
        });

        if (wanOffline) {
          if (!useTok) {
            const unauth = new Error('UNAUTHORIZED');
            unauth.status = 401;
            throw unauth;
          }
          claimantDirectTokenRef.current = useTok;
          const warrant = await mintClaimantWarrant(
            { targetEventId: eventId, targetTeamId: targetTid, opId: operation.opId, code: activeCode },
            useTok
          );
          const armed = {
            eventId,
            teamId: targetTid,
            code: activeCode,
            opId: operation.opId,
            key: operation.key,
            actorId: useActor,
            ...(warrant ? { claimantWarrant: warrant } : { claimantToken: useTok })
          };
          setQueuedClaim(armed);
          lastClaimRef.current = armed;
          setHasLastClaim(true);
          setRelayedReceipt(null);
          setReplayReceipt(null);
          setStatusMessage(`Saved on this device. Waiting to send (${useActor} -> ${targetTid}).`);
          notifyToast('Saved on this device. Waiting to send.', 'warn');
          return;
        }

        let result;
        try {
          result = await sendPost(
            '/api/invitations/claim',
            {
              eventId,
              teamId: targetTid,
              code: activeCode,
              opId: operation.opId
            },
            useTok
          );
        } catch (claimErr) {
          if (
            canSwapDemoClaimant &&
            (fromStep1 || String(claimErr?.code || claimErr?.message || '').includes('ONE_TEAM_PER_EVENT')) &&
            String(claimErr?.code || claimErr?.message || '').includes('ONE_TEAM_PER_EVENT')
          ) {
            const tag = makeUniqueTag();
            const nextHint = pickNextUnseatedTeammateHint(
              selectedTeam?.teamId === targetTid ? selectedTeam : null,
              teamPeople,
              issuedInvite
            );
            const candPersonaId = buildValidDemoActorId(nextHint, 'claim', tag);
            const candSession = await mintDemoSession(candPersonaId, eventId, eventMaxSize || 5);
            signedOutManuallyRef.current = false;
            useTok = candSession.token;
            useActor = candSession.actorId;
            if (!tokenRef.current || !actorRef.current) {
              tokenRef.current = useTok;
              actorRef.current = useActor;
              setToken(useTok);
              setActorId(useActor);
            }
            result = await sendPost(
              '/api/invitations/claim',
              {
                eventId,
                teamId: targetTid,
                code: activeCode,
                opId: operation.opId
              },
              useTok
            );
          } else {
            throw claimErr;
          }
        }

        const joinedActor = result.actorId || useActor;
        if (result.status === 'COMMITTED') {
          finishClaimOperation(sessionStorage, operation.key);
          setLastClaimCode(activeCode);
          markInviteAccepted(activeCode, joinedActor, true);
        }
        if (result.replayed) {
          setReplayReceipt(result);
        }
        const savedClaim = {
          eventId,
          teamId: targetTid,
          code: activeCode,
          opId: operation.opId,
          key: operation.key,
          actorId: joinedActor,
          claimantToken: useTok
        };
        lastClaimRef.current = savedClaim;
        setHasLastClaim(true);
        setQueuedClaim(null);
        const updatedDetail = await inspectTeam(targetTid, true);
        const countLabel = updatedDetail
          ? ` (${updatedDetail.members.length}/${updatedDetail.maxSize} spots)`
          : '';
        setStatusMessage(
          result.replayed
            ? `The server returned the original result for '${joinedActor}' on '${result.teamId}' (0 duplicates).`
            : `Confirmed by server: '${joinedActor}' joined '${result.teamId}'${countLabel}.`
        );
        notifyToast(
          result.replayed
            ? 'The server returned the original result for this request.'
            : `Confirmed by server: '${formatHumanActorName(joinedActor, true)}' joined '${result.teamId}'${countLabel}!`,
          'ok'
        );
        await refreshBoard(false, true);
        await loadAudit(useTok);
      });
    } catch (e) {
      setStatusMessage(`Request result: ${e.message} (request ID kept safely on device).`);
      notifyToast(`Request not accepted (${e.message}).`, 'err');
    } finally {
      joiningLock.current = false;
      setJoining(false);
    }
  }

  async function handleForwardViaPeer() {
    if (joiningLock.current || forwardingPeer) return;
    setForwardingPeer(true);
    try {
      await runProtectedAction('Send Request Through Mateo', async freshTok => {
        let activeClaim = queuedClaim;
        let useRelayTok = relayToken;

        // Check whether activeClaim is missing or its actor is already on target team
        let needsSelfArm = !activeClaim || !activeClaim.code || !activeClaim.opId;
        if (!needsSelfArm && activeClaim) {
          try {
            const detail = await readApiJson(
              await fetch(
                `/api/events/${encodeURIComponent(activeClaim.eventId)}/teams/${encodeURIComponent(activeClaim.teamId)}`,
                { cache: 'no-store' }
              )
            );
            const alreadyMember =
              detail.leader === activeClaim.actorId ||
              (detail.members || []).some(m => m.userId === activeClaim.actorId);
            if (alreadyMember && !relayedReceipt) {
              needsSelfArm = true;
            }
          } catch {
            needsSelfArm = true;
          }
        }

        if (needsSelfArm) {
          const prepped = await prepareCleanRelayClaim({ allowExistingInvite: true });
          activeClaim = prepped.armed;
          useRelayTok = prepped.relayTok;
        } else if (!useRelayTok) {
          try {
            const relay = await mintDemoSession('relay-mateo', activeClaim.eventId, 5);
            useRelayTok = relay.token;
            setRelayToken(useRelayTok);
          } catch {
            useRelayTok = activeClaim.claimantToken || (await ensureToken(freshTok));
          }
        }

        let activeWarrant = activeClaim.claimantWarrant || null;
        const fallbackClaimantTok = activeClaim.claimantToken || claimantDirectTokenRef.current || '';
        if (!activeWarrant && fallbackClaimantTok) {
          activeWarrant = await mintClaimantWarrant(
            {
              targetEventId: activeClaim.eventId,
              targetTeamId: activeClaim.teamId,
              opId: activeClaim.opId,
              code: activeClaim.code
            },
            fallbackClaimantTok
          );
        }

        let res;
        try {
          res = await sendPost(
            '/api/peer/relay-claim',
            {
              ...(activeWarrant
                ? { claimantWarrant: activeWarrant }
                : { claimantToken: fallbackClaimantTok || (await ensureToken(freshTok)) }),
              eventId: activeClaim.eventId,
              teamId: activeClaim.teamId,
              code: activeClaim.code,
              opId: activeClaim.opId
            },
            useRelayTok
          );
        } catch (relayErr) {
          const errCode = String(relayErr?.code || relayErr?.message || '');
          if (
            errCode.includes('INVALID_INVITE') ||
            errCode.includes('INVITE_EXPIRED') ||
            errCode.includes('TEAM_FULL') ||
            errCode.includes('NO_TEAM') ||
            errCode.includes('ONE_TEAM_PER_EVENT') ||
            errCode.includes('SELF_RELAY_FORBIDDEN')
          ) {
            const freshPrep = await prepareCleanRelayClaim({ allowExistingInvite: false });
            activeClaim = freshPrep.armed;
            useRelayTok = freshPrep.relayTok;
            res = await sendPost(
              '/api/peer/relay-claim',
              {
                ...(activeClaim.claimantWarrant
                  ? { claimantWarrant: activeClaim.claimantWarrant }
                  : { claimantToken: activeClaim.claimantToken }),
                eventId: activeClaim.eventId,
                teamId: activeClaim.teamId,
                code: activeClaim.code,
                opId: activeClaim.opId
              },
              useRelayTok
            );
          } else {
            throw relayErr;
          }
        }

        lastClaimRef.current = activeClaim;
        setHasLastClaim(true);
        setRelayedReceipt(res);
        setForwardingPeer(false);
        if (res?.status === 'COMMITTED') {
          setLastClaimCode(activeClaim.code);
          markInviteAccepted(activeClaim.code, res.actorId || activeClaim.actorId, true);
        }
        const updatedDetail = await inspectTeam(activeClaim.teamId, true);
        const countLabel = updatedDetail
          ? ` (${updatedDetail.members.length}/${updatedDetail.maxSize} spots)`
          : '';
        setStatusMessage(
          `Sent through Mateo. Confirmed by server for '${res.actorId}' on '${res.teamId}'${countLabel}. Now run Step 3 to reconnect.`
        );
        notifyToast(`Sent through Mateo. Confirmed by server${countLabel}!`, 'ok');
        await refreshBoard(false, true);
        await loadAudit(useRelayTok);
      });
    } catch (e) {
      setStatusMessage(`Forwarding failed: ${e.message}`);
      notifyToast(`Forwarding failed: ${e.message}`, 'err');
    } finally {
      setForwardingPeer(false);
    }
  }

  async function handleReconnectAndRetryDirect() {
    const targetClaim = queuedClaim || lastClaimRef.current;
    setWanOffline(false);
    setAuthorityHealth('online');
    if (!targetClaim) {
      notifyToast('Reconnected to server.', 'ok');
      refreshBoard(false, true);
      return;
    }

    try {
      await runProtectedAction('Reconnect & Check Original Request', async freshTok => {
        const directTok = targetClaim.claimantToken || claimantDirectTokenRef.current || freshTok;
        const result = await sendPost(
          '/api/invitations/claim',
          {
            eventId: targetClaim.eventId,
            teamId: targetClaim.teamId,
            code: targetClaim.code,
            opId: targetClaim.opId
          },
          directTok
        );
        if (result.status === 'COMMITTED') {
          finishClaimOperation(sessionStorage, targetClaim.key);
          setLastClaimCode(targetClaim.code);
          markInviteAccepted(targetClaim.code, result.actorId || targetClaim.actorId, true);
        }
        lastClaimRef.current = targetClaim;
        setHasLastClaim(true);
        setReplayReceipt(result);
        setQueuedClaim(null);
        await refreshBoard(false, true);
        await inspectTeam(targetClaim.teamId, true);
        await loadAudit(directTok);
        setStatusMessage(
          `The server returned the original result for '${result.actorId}' on '${result.teamId}' (replayed=${String(result.replayed)}, 0 duplicate spots).`
        );
        notifyToast('The server returned the original result for this request!', 'ok');
      });
    } catch (e) {
      setStatusMessage(`Reconnect check: ${e.message}`);
      notifyToast(`Reconnect check failed: ${e.message}`, 'err');
    }
  }

  async function handleAutoSetupRelayDemo() {
    try {
      await runProtectedAction('Prepare Example Team', async freshTok => {
        const suffix = makeUniqueTag();
        const demoTeam = `00-relay-crew-${suffix}`;
        const leadSession = await mintDemoSession(`aurora-lead-${suffix}`, eventId, 5);
        try {
          await sendPost('/api/events', { eventId, maxSize: 5 }, leadSession.token);
        } catch {
          // Event already exists
        }
        await sendPost('/api/teams', { eventId, teamId: demoTeam }, leadSession.token);
        const inv = await sendPost(
          '/api/invitations',
          { eventId, teamId: demoTeam, expiresAt: Date.now() + 600000 },
          leadSession.token
        );

        const priyaSession = await mintDemoSession(`priya-wan-${suffix}`, eventId, 5);
        const relaySession = await mintDemoSession('relay-mateo', eventId, 5);

        signedOutManuallyRef.current = false;
        tokenRef.current = priyaSession.token;
        claimantDirectTokenRef.current = priyaSession.token;
        actorRef.current = priyaSession.actorId;
        setActorId(priyaSession.actorId);
        setToken(priyaSession.token);
        setRelayToken(relaySession.token);
        setTeamId(demoTeam);
        setIssuedInvite({
          ...inv,
          teamId: demoTeam,
          eventId,
          issuedBy: leadSession.actorId,
          suggestedInvitee: 'priya',
          claimedBy: null,
          claimedAt: null
        });
        setInviteCode(inv.code);
        lastClaimRef.current = null;
        setHasLastClaim(false);
        setQueuedClaim(null);
        setRelayedReceipt(null);
        setReplayReceipt(null);
        await refreshBoard(false, true);
        await inspectTeam(demoTeam, true);
        setWanOffline(true);
        setAuthorityHealth('wan-dropped');
        setStatusMessage(
          `Prepared example team '${demoTeam}' with connection dropped. Click Step 1B -> Step 2 -> Step 3.`
        );
        notifyToast(`Example team '${demoTeam}' ready! Click Step 1B -> Step 2 -> Step 3.`, 'ok');
        return freshTok;
      });
    } catch (e) {
      setStatusMessage(`Prepare team failed: ${e.message}`);
      notifyToast(`Prepare team failed: ${e.message}`, 'err');
    }
  }

  async function handleTransferLeader(newLeaderId) {
    try {
      await runProtectedAction(`Transfer Team Lead to ${newLeaderId}`, async freshTok => {
        let activeTok = await ensureToken(freshTok);
        let res;
        try {
          res = await sendPost('/api/teams/transfer', { eventId, teamId, newLeaderId }, activeTok);
        } catch (trErr) {
          if (
            (trErr?.status === 403 || String(trErr?.code || trErr?.message || '').includes('LEADER_REQUIRED')) &&
            isDemoSession() &&
            !signedOutManuallyRef.current &&
            selectedTeam?.teamId === teamId &&
            selectedTeam?.leader &&
            DEMO_PERSONA_CLIENT_RE.test(selectedTeam.leader)
          ) {
            try {
              const leadSession = await mintDemoSession(selectedTeam.leader, eventId, selectedTeam.maxSize || 5);
              activeTok = leadSession.token;
              tokenRef.current = activeTok;
              actorRef.current = leadSession.actorId;
              setToken(activeTok);
              setActorId(leadSession.actorId);
              res = await sendPost('/api/teams/transfer', { eventId, teamId, newLeaderId }, activeTok);
            } catch {
              throw trErr;
            }
          } else {
            throw trErr;
          }
        }
        setStatusMessage(`Confirmed by server: '${res.leader}' is now team lead for '${teamId}'.`);
        notifyToast(`'${formatHumanActorName(res.leader, true)}' is now team lead for '${teamId}'.`, 'ok');
        await refreshBoard(false, true);
        await inspectTeam(teamId, true);
        await loadAudit(activeTok);
      });
    } catch (e) {
      setStatusMessage(`Transfer lead: ${e.message}`);
      notifyToast(`Could not transfer lead: ${e.message}`, 'err');
    }
  }

  function handleOpenOfflineWalkthrough() {
    setActiveView('authority');
    setHighlightRelayWalkthrough(true);
    notifyToast('Opened Step 3: Offline Join Walkthrough (Mateo teammate relay ready).', 'info');
    if (typeof window !== 'undefined') {
      requestAnimationFrame(() => {
        const el = document.getElementById('offline-join-walkthrough');
        if (el && typeof el.scrollIntoView === 'function') {
          el.scrollIntoView({
            behavior: isMotionFrozen(ergonomics.motion) ? 'auto' : 'smooth',
            block: 'nearest'
          });
        }
      });
      setTimeout(() => setHighlightRelayWalkthrough(false), 1600);
    }
  }

  async function handleLeaveTeam() {
    try {
      await runProtectedAction(`Leave Team (${teamId})`, async freshTok => {
        let activeTok = await ensureToken(freshTok);
        let res;
        try {
          res = await sendPost('/api/teams/leave', { eventId, teamId }, activeTok);
        } catch (lvErr) {
          const codeStr = String(lvErr?.code || lvErr?.message || '');
          if (
            codeStr.includes('NOT_MEMBER') &&
            isDemoSession() &&
            !signedOutManuallyRef.current &&
            selectedTeam?.teamId === teamId &&
            Array.isArray(selectedTeam.members)
          ) {
            const demoMember =
              selectedTeam.members.find(
                m => m.userId !== selectedTeam.leader && DEMO_PERSONA_CLIENT_RE.test(m.userId)
              ) || selectedTeam.members.find(m => DEMO_PERSONA_CLIENT_RE.test(m.userId));
            if (demoMember) {
              const memSession = await mintDemoSession(demoMember.userId, eventId, selectedTeam.maxSize || 5);
              activeTok = memSession.token;
              tokenRef.current = activeTok;
              actorRef.current = memSession.actorId;
              setToken(activeTok);
              setActorId(memSession.actorId);
              res = await sendPost('/api/teams/leave', { eventId, teamId }, activeTok);
            } else {
              throw lvErr;
            }
          } else {
            throw lvErr;
          }
        }
        setStatusMessage(
          res.leader
            ? `Confirmed by server: left '${teamId}'; '${res.leader}' is now team lead.`
            : `Confirmed by server: last member left '${teamId}'; empty team removed.`
        );
        notifyToast(
          res.leader
            ? `Left '${teamId}'; '${formatHumanActorName(res.leader, true)}' is now team lead.`
            : `Left '${teamId}'; empty team removed.`,
          'info'
        );
        if (res.status === 'TEAM_DELETED') {
          removeDeletedTeamRecord(teamId, eventId);
          if (issuedInvite?.teamId === teamId) {
            setIssuedInvite(null);
            setInviteCode('');
          }
        } else {
          await inspectTeam(teamId, true);
        }
        await refreshBoard(false, true);
        await loadAudit(activeTok);
      });
    } catch (e) {
      setStatusMessage(`Leave team: ${e.message}`);
      notifyToast(`Could not leave team: ${e.message}`, 'err');
    }
  }

  async function handleLoadPeerNotes(overrideTok, manual = false) {
    try {
      await runProtectedAction('Refresh Encrypted Notes', async freshTok => {
        const list = await sendGetAuth(
          `/api/peer/notes?eventId=${encodeURIComponent(eventId)}`,
          typeof overrideTok === 'string' ? overrideTok : freshTok
        );
        setPeerNotes(list.notes || []);
        if (manual === true) {
          notifyToast(`Refreshed ${list.notes?.length || 0} shared notes.`, 'ok');
        }
      });
    } catch (e) {
      setStatusMessage(`Shared notes: ${e.message}`);
      if (manual === true) {
        notifyToast(`Could not refresh notes: ${e.message}`, 'err');
      }
    }
  }

  async function handleSendPeerNote() {
    try {
      await runProtectedAction('Send Encrypted Note', async freshTok => {
        const opId = 'note-' + crypto.randomUUID().slice(0, 12);
        const res = await sendPost('/api/peer/notes', { eventId, opId, text: peerNoteText, epoch: 1 }, freshTok);
        await handleLoadPeerNotes(freshTok, false);
        setStatusMessage(`Sent encrypted handoff note (${res.digest.slice(0, 12)}...).`);
        notifyToast('Sent encrypted handoff note.', 'ok');
      });
    } catch (e) {
      setStatusMessage(`Send note: ${e.message}`);
      notifyToast(`Could not send note: ${e.message}`, 'err');
    }
  }

  async function handleRunGluePreset(preset) {
    let localRecords = [];
    let peerRecords = [];
    if (preset === 'clean') {
      localRecords = [{ id: 'slot-1', personId: 'aurora', taskId: 'api', startMin: 0, endMin: 120, epoch: 1, digest: 'd1', actorId: 'aurora' }];
      peerRecords = [{ id: 'slot-2', personId: 'priya', taskId: 'integration', startMin: 240, endMin: 330, epoch: 1, digest: 'd2', actorId: 'priya' }];
    } else if (preset === 'overlap') {
      localRecords = [{ id: 'slot-1', personId: 'aurora', taskId: 'api', startMin: 0, endMin: 120, epoch: 1, digest: 'd1', actorId: 'aurora' }];
      peerRecords = [{ id: 'slot-2', personId: 'aurora', taskId: 'schema', startMin: 60, endMin: 150, epoch: 1, digest: 'd2', actorId: 'kai' }];
    } else {
      localRecords = [{ id: 'note-spec', epoch: 1, digest: 'sha256-alpha', actorId: 'aurora' }];
      peerRecords = [{ id: 'note-spec', epoch: 1, digest: 'sha256-divergent', actorId: 'kai' }];
    }

    const instantGlue = contextGlueOrExplain(localRecords, peerRecords);
    setGlueResult(instantGlue);
    const clean = instantGlue.status === 'GLUED_CONSISTENT';
    setStatusMessage(
      clean
        ? 'Shared plans fit cleanly without conflicts.'
        : `Conflict found between shared edits (${instantGlue.obstructions?.length || 1} conflict).`
    );
    notifyToast(
      clean ? 'Shared plans fit cleanly - no conflicts.' : 'Conflict detected between shared edits.',
      clean ? 'ok' : 'warn'
    );

    if (wanOffline) return;
    try {
      const tok = await ensureToken('');
      if (tok) {
        const res = await sendPost('/api/peer/glue', { localRecords, peerRecords }, tok);
        setGlueResult(res);
      }
    } catch {
      // Keep local instant result
    }
  }

  // Step 4: 50-Person Last-Spot Test & Board Speed Check
  async function runLiveHttpRace50() {
    const tag = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const raceEv = `race-${tag}`;
    const raceTeam = `final-seat-${tag}`;

    const leaderAuth = await readApiJson(
      await fetch('/api/auth/demo', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ actorId: 'race-leader', eventId: raceEv, maxSize: 2 })
      })
    );
    await sendPost('/api/events', { eventId: raceEv, maxSize: 2 }, leaderAuth.token);
    await sendPost('/api/teams', { eventId: raceEv, teamId: raceTeam }, leaderAuth.token);

    const expiresAt = Date.now() + 60000;
    const [invites, claimantSessions] = await Promise.all([
      Promise.all(
        Array.from({ length: 50 }, () =>
          sendPost('/api/invitations', { eventId: raceEv, teamId: raceTeam, expiresAt }, leaderAuth.token)
        )
      ),
      Promise.all(
        Array.from({ length: 50 }, async (_, i) =>
          readApiJson(await awaitFetchDemoSession(`claimant-${i}`, raceEv))
        )
      )
    ]);

    const t0 = performance.now();
    let committed = 0;
    let rejected = 0;
    let winner = null;

    await Promise.all(
      invites.map(async (inv, i) => {
        try {
          const r = await sendPost(
            '/api/invitations/claim',
            {
              eventId: raceEv,
              teamId: raceTeam,
              code: inv.code,
              opId: `race50-${i}`
            },
            claimantSessions[i].token
          );
          if (r.status === 'COMMITTED') {
            committed += 1;
            winner = r.actorId;
          } else {
            rejected += 1;
          }
        } catch {
          rejected += 1;
        }
      })
    );
    const elapsedMs = Number((performance.now() - t0).toFixed(2));

    const detail = await readApiJson(
      await fetch(`/api/events/${encodeURIComponent(raceEv)}/teams/${encodeURIComponent(raceTeam)}`, {
        cache: 'no-store'
      })
    );
    const finalMemberCount = Array.isArray(detail.members) ? detail.members.length : 0;
    const hasLeaderMember =
      Array.isArray(detail.members) &&
      detail.members.some(
        m => m.isLeader === true || m.userId === detail.leader || m.user_id === detail.leader
      );

    return {
      eventId: raceEv,
      teamId: raceTeam,
      contenders: 50,
      committed,
      rejected,
      winner,
      finalMemberCount,
      invariants: {
        oversize: finalMemberCount > Number(detail.maxSize || 2) ? 1 : 0,
        orphanLeader: hasLeaderMember ? 0 : 1,
        eventMismatch: detail.teamId === raceTeam ? 0 : 1
      },
      elapsedMs
    };
  }

  function awaitFetchDemoSession(personaId, targetEventId) {
    return fetch('/api/auth/demo', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ actorId: personaId, eventId: targetEventId, maxSize: 2 })
    });
  }

  async function handleRun50WayRace() {
    await runProtectedAction('Run 50-Person Last-Spot Test', async freshTok => {
      setRunningRace(true);
      try {
        if (wanOffline && !queuedClaim) {
          setWanOffline(false);
          setAuthorityHealth('online');
        }
        let res;
        try {
          res = await sendPost('/api/demo/race-50', {}, freshTok);
        } catch (primaryErr) {
          if (primaryErr?.status === 401 || primaryErr?.message === 'UNAUTHORIZED') {
            throw primaryErr;
          }
          // Persistent SQLite DB already has global teams.id='final-seat-crew'; run live 50-claimant HTTP race
          res = await runLiveHttpRace50();
        }
        setRaceReceipt(res);
        setStatusMessage(
          `50 requested · ${res.committed} joined (${res.winner}) · ${res.rejected} turned away - team full at ${res.finalMemberCount}/2 (${res.elapsedMs} ms).`
        );
        notifyToast(
          `50 requested: 1 joined (${res.winner}), ${res.rejected} turned away at 2/2 (${res.elapsedMs} ms)!`,
          'ok'
        );
      } catch (e) {
        if (e?.status === 401 || e?.message === 'UNAUTHORIZED') throw e;
        setStatusMessage(`Last-spot test: ${e.message}`);
        notifyToast(`Last-spot test failed: ${e.message}`, 'err');
      } finally {
        setRunningRace(false);
      }
    });
  }

  async function handleRunLatencyProbe() {
    setProbingLatency(true);
    try {
      if (wanOffline && !queuedClaim) {
        setWanOffline(false);
        setAuthorityHealth('online');
      }
      const samples = [];
      for (let i = 0; i < 5; i++) {
        const t0 = performance.now();
        const r = await fetch(`/api/events/${encodeURIComponent(eventId)}/board?limit=100`, { cache: 'no-store' });
        await readApiJson(r);
        samples.push(Number((performance.now() - t0).toFixed(2)));
      }
      const sorted = [...samples].sort((a, b) => a - b);
      setProbeStats({
        samples,
        minMs: sorted[0],
        medianMs: sorted[Math.floor(sorted.length / 2)],
        maxMs: sorted[sorted.length - 1]
      });
      setBoardLatencyMs(sorted[2]);
      setStatusMessage(`Live board speed: median ${sorted[2]} ms (fastest ${sorted[0]} ms, slowest ${sorted[4]} ms).`);
      notifyToast(`Live board speed: median ${sorted[2]} ms`, 'ok');
    } catch (e) {
      setStatusMessage(`Speed check: ${e.message}`);
      notifyToast(`Speed check failed: ${e.message}`, 'err');
    } finally {
      setProbingLatency(false);
    }
  }

  function handleExecuteWalkthroughStep(step) {
    if (step.scenarioKey) {
      selectScenario(step.scenarioKey);
    } else {
      notifyToast(`${step.time}: ${step.title}`, 'info');
    }
    setActiveView(step.targetView);
  }

  const shouldBindServerTeamToExport =
    activeView === 'authority' ||
    Boolean(
      selectedTeam?.teamId &&
        (evaluatingCrewId === selectedTeam.teamId || lockedPlanTeamId === selectedTeam.teamId)
    );

  // Immediate 1-click white-paper HTML download
  function handleDirectPlanDownload() {
    const res = triggerTeamPlanDownload({
      eventId,
      teamId: shouldBindServerTeamToExport ? (selectedTeam?.teamId || teamId) : 'plan-preview',
      actorId,
      selectedTeam,
      allowServerTeamBinding: shouldBindServerTeamToExport,
      goalDescription,
      horizonHours,
      tasks,
      teamPeople,
      plan,
      issuedInvite: shouldBindServerTeamToExport ? issuedInvite : null
    });
    if (res) {
      setStatusMessage(`Downloaded ${res.filename} (#FFFFFF white-paper HTML summary).`);
      notifyToast(`Downloaded ${res.filename}`, 'ok');
    }
  }

  // Global Keyboard Shortcuts (Guarded against inputs, IME composition, contentEditable & open dialogs/popovers)
  useEffect(() => {
    function onKeyDown(e) {
      if (e.isComposing || e.keyCode === 229) return;
      const target = e.target;
      const tag = (target?.tagName || '').toUpperCase();
      const inEditable =
        tag === 'INPUT' ||
        tag === 'TEXTAREA' ||
        tag === 'SELECT' ||
        Boolean(target?.isContentEditable) ||
        Boolean(target?.closest?.('[contenteditable="true"], [contenteditable=""]'));
      const inOpenDialog =
        whyOpen ||
        authModalOpen ||
        studioOpen ||
        paletteOpen ||
        charterOpen ||
        actingMenuOpen ||
        displayPopoverOpen ||
        Boolean(target?.closest?.('[role="dialog"]')) ||
        (typeof document !== 'undefined' && Boolean(document.querySelector('[role="dialog"]')));

      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'a') {
        e.preventDefault();
        setStudioOpen(v => !v);
        return;
      }
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPaletteOpen(v => !v);
        return;
      }
      if (e.key === 'F1') {
        e.preventDefault();
        setWhyOpen(v => !v);
        return;
      }
      if (e.key === 'Escape' && inEditable && !inOpenDialog) {
        e.preventDefault();
        target?.blur?.();
        return;
      }

      if (inEditable || inOpenDialog) return;

      if (e.altKey && !e.ctrlKey && !e.metaKey) {
        if (e.key === '1') { e.preventDefault(); setActiveView('discover'); return; }
        if (e.key === '2') { e.preventDefault(); setActiveView('architect'); return; }
        if (e.key === '3') { e.preventDefault(); setActiveView('authority'); return; }
        if (e.key === '4') { e.preventDefault(); setActiveView('arena'); return; }
      }

      if (ergonomics.singleKeyShortcuts && !e.ctrlKey && !e.metaKey && !e.altKey) {
        // Explicit Shift+Slash / '?' check FIRST so '?' always opens the Guide and never falls into '/' Search
        const isQuestionKey = e.key === '?' || (e.code === 'Slash' && e.shiftKey);
        const isPlainSlash = e.key === '/' && !e.shiftKey;

        if (isQuestionKey || e.key.toLowerCase() === 'g') {
          e.preventDefault();
          setWhyOpen(true);
          return;
        }
        if (isPlainSlash) {
          e.preventDefault();
          setPaletteOpen(true);
          return;
        }
        if (!e.shiftKey) {
          const lower = e.key.toLowerCase();
          if (e.key === '1') { e.preventDefault(); setActiveView('discover'); return; }
          if (e.key === '2') { e.preventDefault(); setActiveView('architect'); return; }
          if (e.key === '3') { e.preventDefault(); setActiveView('authority'); return; }
          if (e.key === '4') { e.preventDefault(); setActiveView('arena'); return; }
          if (lower === 'f') {
            e.preventDefault();
            requestDiscoverFilter({ focus: true });
            return;
          }
          if (lower === 'p') {
            e.preventDefault();
            setDisplayPopoverOpen(false);
            setActingMenuOpen(v => !v);
            return;
          }
          if (lower === 'd') {
            e.preventDefault();
            setActingMenuOpen(false);
            setDisplayPopoverOpen(v => !v);
            return;
          }
          if (lower === 'e') {
            e.preventDefault();
            handleDirectPlanDownload();
            return;
          }
          if (lower === 'r') {
            e.preventDefault();
            refreshBoard(true);
            return;
          }
          if (e.key === '[' && activeView === 'discover') {
            e.preventDefault();
            setPageIndex(p => Math.max(0, p - 1));
            return;
          }
          if (e.key === ']' && activeView === 'discover') {
            e.preventDefault();
            setPageIndex(p => {
              const total = totalTeams !== null ? Math.max(1, Math.ceil(totalTeams / pageSize)) : p + 2;
              return p + 1 < total ? p + 1 : p;
            });
          }
        }
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [
    whyOpen,
    authModalOpen,
    studioOpen,
    paletteOpen,
    charterOpen,
    actingMenuOpen,
    displayPopoverOpen,
    ergonomics.singleKeyShortcuts,
    activeView,
    totalTeams,
    pageSize,
    requestDiscoverFilter,
    refreshBoard,
    eventId,
    teamId,
    actorId,
    selectedTeam,
    shouldBindServerTeamToExport,
    goalDescription,
    horizonHours,
    tasks,
    teamPeople,
    plan,
    issuedInvite
  ]);

  function handleTabListKeyDown(e, idx) {
    let nextIdx = null;
    if (e.key === 'ArrowRight') nextIdx = (idx + 1) % PRIMARY_TABS.length;
    else if (e.key === 'ArrowLeft') nextIdx = (idx - 1 + PRIMARY_TABS.length) % PRIMARY_TABS.length;
    else if (e.key === 'Home') nextIdx = 0;
    else if (e.key === 'End') nextIdx = PRIMARY_TABS.length - 1;
    if (nextIdx !== null) {
      e.preventDefault();
      const targetTab = PRIMARY_TABS[nextIdx];
      setActiveView(targetTab.id);
      tabRefs.current[targetTab.id]?.focus();
    }
  }

  const commands = useMemo(
    () => [
      { id: 'v1', group: 'Steps', label: '1. Find teammates & open teams', shortcut: '1 / Alt+1', keywords: 'directory board search filter people', run: () => setActiveView('discover') },
      { id: 'v2', group: 'Steps', label: '2. Plan the work & schedule', shortcut: '2 / Alt+2', keywords: 'schedule timeline tasks timezones', run: () => setActiveView('architect') },
      { id: 'v3', group: 'Steps', label: '3. Manage your team & offline relay', shortcut: '3 / Alt+3', keywords: 'invite join offline relay mateo', run: () => setActiveView('authority') },
      { id: 'v4', group: 'Steps', label: '4. Test the last spot (50-person race)', shortcut: '4 / Alt+4', keywords: 'race 50 benchmark speed', run: () => setActiveView('arena') },
      { id: 'f-focus', group: 'Directory Search', label: 'Focus teammate & skill filter input', shortcut: 'f', keywords: 'filter search directory people teams', run: () => requestDiscoverFilter({ focus: true, query: '' }) },
      ...BUILDER_DIRECTORY.map(b => ({
        id: `bld-${b.id}`,
        group: 'Teammates',
        label: `Preview ${b.displayName} (${b.timezone}) in team plan`,
        keywords: `teammates builder ${b.id} ${b.displayName} ${b.role} ${b.timezone} ${Object.keys(b.skills).join(' ')}`,
        run: () => handleToggleBuilderInCrew(b)
      })),
      ...SKILLS_CATALOG.map(sk => ({
        id: `sk-${sk.id}`,
        group: 'Skill Filter',
        label: `Filter directory by skill: ${sk.label} (${sk.short})`,
        keywords: `skill filter ${sk.id} ${sk.label} ${sk.short}`,
        run: () => requestDiscoverFilter({ skill: sk.id, query: '', tab: 'builders' })
      })),
      { id: 'sc-1', group: 'Example Plans', label: '1. Different time zones, clean handoff', keywords: 'baton timezone india arkansas priya example plans', run: () => { setActiveView('architect'); selectScenario('baton'); } },
      { id: 'sc-2', group: 'Example Plans', label: '2. One person double-booked on two tasks', keywords: 'hall overload mateo simultaneous example plans', run: () => { setActiveView('architect'); selectScenario('hall'); } },
      { id: 'sc-3', group: 'Example Plans', label: '3. Unverified skill: backup covers it vs. quick check', keywords: 'omega voi unverified skill example plans', run: () => { setActiveView('architect'); selectScenario('omega'); } },
      { id: 'sc-4', group: 'Example Plans', label: '4. Unblock early setup without replacing teammates', keywords: 'devops cloud setup prerequisite example plans', run: () => { setActiveView('architect'); selectScenario('prereq'); } },
      { id: 'act-dl', group: 'Download & Print', label: 'Download Team Plan HTML (#FFFFFF white-paper file)', shortcut: 'e', keywords: 'download html export file', run: () => handleDirectPlanDownload() },
      { id: 'act-charter', group: 'Download & Print', label: 'Preview / Print Team Plan PDF', keywords: 'pdf print preview charter', run: () => setCharterOpen(true) },
      { id: 'act-race', group: 'Live Tests', label: 'Run 50-person last-spot test', keywords: 'live tests race 50 winner full', run: () => { setActiveView('arena'); handleRun50WayRace(); } },
      { id: 'act-relay', group: 'Live Tests', label: 'Prepare example team for offline request forwarding', keywords: 'live tests offline outbox mateo reconnect', run: () => { setActiveView('authority'); handleAutoSetupRelayDemo(); } },
      { id: 'act-refresh', group: 'Live Tests', label: 'Refresh live server board', shortcut: 'r', keywords: 'live tests refresh sync server board', run: () => refreshBoard(true) },
      { id: 'p-aurora', group: 'Switch Profile', label: 'Acting as: Aurora (Team lead)', shortcut: 'p', keywords: 'aurora demo profile', run: () => switchPersona('leader-aurora') },
      { id: 'p-kai', group: 'Switch Profile', label: 'Acting as: Kai (Frontend)', keywords: 'kai demo profile', run: () => switchPersona('builder-kai') },
      { id: 'p-priya', group: 'Switch Profile', label: 'Acting as: Priya (Integration)', keywords: 'priya demo profile', run: () => switchPersona('builder-priya') },
      { id: 'p-mateo', group: 'Switch Profile', label: 'Acting as: Mateo (Teammate Relay · Database)', keywords: 'mateo relay database demo profile', run: () => switchPersona('relay-mateo') },
      { id: 'sc-auto', group: 'Display & Scale', label: 'Scale: Auto (60% Desktop / 100% Mobile)', keywords: 'display auto scale 60 100', run: () => setErgonomics(s => ({ ...s, scaleLocked: false, scale: '60' })) },
      { id: 'sc-60', group: 'Display & Scale', label: 'Scale: 60% Panorama', keywords: 'display 60 panorama compact', run: () => setErgonomics(s => ({ ...s, scaleLocked: true, scale: '60' })) },
      { id: 'sc-100', group: 'Display & Scale', label: 'Scale: 100% Standard', keywords: 'display 100 standard large', run: () => setErgonomics(s => ({ ...s, scaleLocked: true, scale: '100' })) },
      { id: 'th-moon', group: 'Display & Scale', label: 'Contrast: Moonlight Dark', keywords: 'display dark moonlight default', run: () => setErgonomics(s => ({ ...s, theme: 'h4h-glass', blueGlareShield: 'matte-balanced', lightSurface: 'moonlit-pearl' })) },
      { id: 'th-hc', group: 'Display & Scale', label: 'Contrast: High Contrast', keywords: 'display high contrast yellow white', run: () => setErgonomics(s => ({ ...s, theme: 'aaa-contrast', blueGlareShield: 'matte-balanced', lightSurface: 'moonlit-pearl' })) },
      { id: 'th-light', group: 'Display & Scale', label: 'Contrast: Moonlit Pearl (Matte Light)', keywords: 'display light matte pearl paper daylight alabaster', run: () => setErgonomics(s => ({ ...s, theme: 'warm-paper', lightSurface: 'moonlit-pearl', blueGlareShield: 'matte-balanced' })) },
      { id: 'bg-shield', group: 'Display & Scale', label: 'Blue-Glare Shield (-34% Blue Safety Switch)', keywords: 'display blue glare safety switch shield melanopic headlight led', run: () => setErgonomics(s => ({ ...s, blueGlareShield: s.blueGlareShield === 'shield-max' ? 'matte-balanced' : 'shield-max', lightSurface: s.blueGlareShield === 'shield-max' ? 'moonlit-pearl' : 'blue-glare-shield' })) },
      { id: 'bg-sunlight', group: 'Display & Scale', label: 'Daylight Sun (Outdoor >10k lux)', keywords: 'display sunlight outdoor daylight high lux matte', run: () => setErgonomics(s => ({ ...s, theme: 'warm-paper', lightSurface: 'daylight-sun', blueGlareShield: 'sunlight-day' })) },
      { id: 'mirror-toggle', group: 'Display & Scale', label: 'Toggle Upper Peripheral Shortcut Mirror', keywords: 'display shortcut mirror bar holo keyboard', run: () => setErgonomics(s => ({ ...s, upperKeyMirror: s.upperKeyMirror === false })) },
      { id: 'fl-emerald', group: 'Flashlight & Clarity', label: 'Flashlight Shade: Moonlight Sage (Default)', keywords: 'flashlight emerald sage green matte', run: () => setErgonomics(s => ({ ...s, flashlightTint: 'emerald', crrMode: 'crr' })) },
      { id: 'fl-amber', group: 'Flashlight & Clarity', label: 'Flashlight Shade: Purkinje Night Amber (Low Blue Glare)', keywords: 'flashlight amber migraine night glare warm', run: () => setErgonomics(s => ({ ...s, flashlightTint: 'amber', crrMode: 'crr' })) },
      { id: 'fl-cyan', group: 'Flashlight & Clarity', label: 'Flashlight Shade: Synchronicity Cyan', keywords: 'flashlight cyan blue', run: () => setErgonomics(s => ({ ...s, flashlightTint: 'cyan', crrMode: 'crr' })) },
      { id: 'fl-violet', group: 'Flashlight & Clarity', label: 'Flashlight Shade: Royal Violet', keywords: 'flashlight violet purple', run: () => setErgonomics(s => ({ ...s, flashlightTint: 'violet', crrMode: 'crr' })) },
      { id: 'toggle-guide', group: 'Flashlight & Clarity', label: 'Toggle Plain-Language Task Clarity Guide (COGA)', keywords: 'comprehension guide plain language coga step', run: () => setErgonomics(s => ({ ...s, taskGuide: s.taskGuide === false })) },
      { id: 'toggle-1412', group: 'Flashlight & Clarity', label: 'Toggle Dyslexia Text Spacing (WCAG 1.4.12)', keywords: 'dyslexia spacing wcag 1.4.12 reading', run: () => setErgonomics(s => ({ ...s, textSpacing: s.textSpacing === 'wcag-1412' ? 'standard' : 'wcag-1412' })) },
      { id: 'toggle-ruler', group: 'Flashlight & Clarity', label: 'Toggle Focus Reading Ruler Band', keywords: 'reading ruler dyslexia adhd line', run: () => setErgonomics(s => ({ ...s, readingRuler: !s.readingRuler })) },
      { id: 'toggle-cvd', group: 'Flashlight & Clarity', label: 'Toggle Color-Blindness Safe + Hatch Patterns', keywords: 'color blind cvd daltonism hatch monochrome', run: () => setErgonomics(s => ({ ...s, cvdMode: s.cvdMode === 'cvd-safe' ? 'none' : 'cvd-safe' })) },
      { id: 'open-studio', group: 'Display & Scale', label: 'Open Extended Display & Shortcut Studio', shortcut: 'Ctrl+Shift+A', keywords: 'display accessibility studio', run: () => setStudioOpen(true) },
      { id: 'open-why', group: 'Help', label: 'Purpose-First Guide & Keyboard Shortcuts', shortcut: '? / F1', keywords: 'help guide shortcuts', run: () => setWhyOpen(true) }
    ],
    [selectScenario, switchPersona, requestDiscoverFilter, handleToggleBuilderInCrew, refreshBoard, eventId, teamId, actorId, selectedTeam, shouldBindServerTeamToExport, goalDescription, horizonHours, tasks, teamPeople, plan, issuedInvite]
  );

  const horizonMin = Math.max(60, Math.round(Number(horizonHours || 4) * 60));
  const panoramaPartialPreview = useMemo(
    () => computePartialTaskPreview(tasks, teamPeople, horizonMin, plan),
    [tasks, teamPeople, horizonMin, plan]
  );
  const plainVerdict = useMemo(
    () => describePlainPlanVerdict(plan, tasks, panoramaPartialPreview),
    [plan, tasks, panoramaPartialPreview]
  );

  const topRecEntry = useMemo(
    () =>
      (recs?.recommendations || []).find(
        r => r.restoresFeasibility || r.upgradesToConditional || r.advancesPartialPlan
      ) || null,
    [recs]
  );
  const topRecBuilder = useMemo(
    () => (topRecEntry ? findBuilderById(topRecEntry.candidateId, [candidates, teamPeople]) : null),
    [topRecEntry, candidates, teamPeople]
  );
  const topRecInCrew = useMemo(
    () =>
      topRecBuilder
        ? teamPeople.some(p => normalizeBuilderId(p.id) === normalizeBuilderId(topRecBuilder.id))
        : false,
    [teamPeople, topRecBuilder]
  );
  const topRecShortName = useMemo(
    () =>
      topRecBuilder
        ? String(topRecBuilder.displayName || topRecBuilder.id).split(' ')[0]
        : '',
    [topRecBuilder]
  );
  const topRecShortTz = useMemo(
    () =>
      topRecBuilder
        ? String(topRecBuilder.timezone || '').split('·')[0].trim()
        : '',
    [topRecBuilder]
  );
  const mateoInCrew = useMemo(
    () => teamPeople.some(p => normalizeBuilderId(p.id) === 'mateo'),
    [teamPeople]
  );

  const isPanoramaActive = ergonomics.density === 'panoramic-3';
  const isMobileViewport = resolvedScale.tier === 'mobile';
  const isPanoramaColumnsVisible = isPanoramaActive && !isMobileViewport;

  const layoutClass = isPanoramaActive
    ? 'is-panoramic-3'
    : ergonomics.density === 'split-studio'
      ? 'is-split-studio'
      : 'is-calm-focus';

  const pinnedTeamsForEvent = useMemo(
    () =>
      Object.values(pinnedTeamsMap)
        .filter(entry => entry && entry.eventId === eventId && entry.team_id)
        .sort((a, b) => (b.touchedAt || 0) - (a.touchedAt || 0)),
    [pinnedTeamsMap, eventId]
  );

  const col3TeamsList = useMemo(() => {
    const merged = [];
    const seen = new Set();
    const pushRow = row => {
      if (!row || !row.team_id || seen.has(row.team_id)) return;
      seen.add(row.team_id);
      merged.push(row);
    };
    if (selectedTeam?.teamId) {
      const liveSelRow = board.find(b => b.team_id === selectedTeam.teamId);
      pushRow({
        team_id: selectedTeam.teamId,
        leader: liveSelRow?.leader || selectedTeam.leader,
        members:
          liveSelRow?.members ??
          (Array.isArray(selectedTeam.members) ? selectedTeam.members.length : 1),
        max_size: liveSelRow?.max_size ?? selectedTeam.maxSize ?? eventMaxSize ?? 5
      });
    }
    for (const pt of pinnedTeamsForEvent) {
      const liveRow = board.find(b => b.team_id === pt.team_id);
      pushRow({
        team_id: pt.team_id,
        leader: liveRow?.leader || pt.leader,
        members: liveRow?.members ?? pt.members ?? 1,
        max_size: liveRow?.max_size ?? pt.max_size ?? eventMaxSize ?? 5
      });
    }
    for (const b of board) {
      if (b.members >= 2 && b.members < b.max_size) pushRow(b);
    }
    for (const b of board) {
      if (b.members < b.max_size) pushRow(b);
    }
    for (const b of board) {
      pushRow(b);
    }
    return merged.slice(0, 4);
  }, [selectedTeam, pinnedTeamsForEvent, board, eventMaxSize]);

  async function handleSyncCol3() {
    const activeTid = selectedTeam?.teamId || teamId;
    await refreshBoard(false, true);
    if (activeTid) {
      await inspectTeam(activeTid, true);
    }
    await loadAudit(undefined, true);
  }

  const spotsUsed = selectedTeam
    ? selectedTeam.members.length
    : col3TeamsList[0]?.members ?? board[0]?.members ?? 1;
  const spotsMax = selectedTeam
    ? selectedTeam.maxSize
    : col3TeamsList[0]?.max_size ?? board[0]?.max_size ?? eventMaxSize ?? 5;
  const humanActorName = formatHumanActorName(actorId, Boolean(token));

  // CRR-07: Peripheral unresolved contour driven strictly by actual application state
  const col2HasUnresolved = plainVerdict.tone !== 'ok';
  const col3HasUnresolved = Boolean(wanOffline || queuedClaim);

  return (
    <div
      className="app-shell"
      onPointerMove={handleShellPointerMove}
      onFocusCapture={handleShellFocusIn}
    >
      {/* Inline Strict-CSP CVD Simulation Filters (Machado 2009 sRGB Matrices) */}
      <svg className="sr-cvd-defs no-print" aria-hidden="true" focusable="false">
        <defs>
          <filter id="cvd-protan" colorInterpolationFilters="sRGB">
            <feColorMatrix
              type="matrix"
              values="0.567 0.433 0 0 0  0.558 0.442 0 0 0  0 0.242 0.758 0 0  0 0 0 1 0"
            />
          </filter>
          <filter id="cvd-deutan" colorInterpolationFilters="sRGB">
            <feColorMatrix
              type="matrix"
              values="0.625 0.375 0 0 0  0.700 0.300 0 0 0  0 0.300 0.700 0 0  0 0 0 1 0"
            />
          </filter>
          <filter id="cvd-tritan" colorInterpolationFilters="sRGB">
            <feColorMatrix
              type="matrix"
              values="0.950 0.050 0 0 0  0 0.433 0.567 0 0  0 0.475 0.525 0 0  0 0 0 1 0"
            />
          </filter>
          <filter id="cvd-achrom" colorInterpolationFilters="sRGB">
            <feColorMatrix
              type="matrix"
              values="0.2126 0.7152 0.0722 0 0  0.2126 0.7152 0.0722 0 0  0.2126 0.7152 0.0722 0 0  0 0 0 1 0"
            />
          </filter>
        </defs>
      </svg>

      {/* Demand-Driven WebGL2 Cinema 3-Point Matte Stage (0.0 FPS at rest, <=0.92 luminance clamp) */}
      <AffordalumeCgiStage
        theme={ergonomics.theme}
        lightSurface={ergonomics.lightSurface || 'moonlit-pearl'}
        motion={ergonomics.motion}
        crrMode={ergonomics.crrMode}
        stageDirector={ergonomics.stageDirector || 'cinema-guided'}
        blueGlareShield={ergonomics.blueGlareShield || 'matte-balanced'}
        flashlightTint={ergonomics.flashlightTint}
        flashlightPower={ergonomics.flashlightPower}
        activeView={activeView}
        planComplete={plainVerdict.tone === 'ok'}
        pointerPxRef={pointerPxRef}
      />

      {/* Optional Dyslexia / ADHD Line-Tracking Reading Ruler Band */}
      <div ref={rulerBandRef} aria-hidden="true" className="reading-ruler-band no-print" />

      <div
        ref={foregroundInertRef}
        className="app-foreground-inert-wrap"
        data-inert-active={anyModalOpen ? 'true' : undefined}
      >
      <a href="#main-workspace" className="skip-link no-print">
        Skip to main workspace
      </a>

      {/* High-Visibility Center-Top Toast Pill (Theme-Aware --bg-toast-solid) */}
      {toast && (
        <div
          key={toast.key}
          aria-live="off"
          className={`center-toast-banner toast-${toast.tone || 'info'} no-print`}
        >
          <span className="center-toast-icon" aria-hidden="true">
            {toast.tone === 'ok' ? (
              <CheckCircleIcon size={17} />
            ) : toast.tone === 'warn' || toast.tone === 'err' ? (
              <AlertTriangleIcon size={17} />
            ) : (
              '●'
            )}
          </span>
          <span className="center-toast-text">{toast.message}</span>
          <button
            type="button"
            className="center-toast-dismiss"
            onClick={() => setToast(null)}
            aria-label="Dismiss notification"
          >
            ×
          </button>
        </div>
      )}

      {/* IDE-Style Top Header: Special Firefly Post Sheet Banner, 4 Plain Tabs, and Right Controls */}
      <header className="top-command-header top-header no-print" role="banner">
        {/* 1. Special Firefly Company Banner: Larger Post Sheet + Small Slogan Underneath */}
        <div className="brand-cluster">
          <div className="brand-firefly-banner" data-reactive-surface="">
            <span className="brand-icon-wrap" aria-hidden="true">
              <BrandMark size={22} />
            </span>
            <div className="brand-titles">
              <h1 className="brand-h1" title="Post Sheet | Ability & Purpose Crew Network">
                <span className="brand-firefly-title">Post Sheet</span>
                <span className="sr-only"> | Ability &amp; Purpose Crew Network</span>
              </h1>
              <p className="brand-firefly-slogan">
                <SparklesIcon size={11} className="brand-slogan-spark" />
                <span className="brand-slogan-text">Connecting people through purpose</span>
              </p>
            </div>
          </div>
        </div>

        {/* 2. 4 Plain-Language Step Tabs (1..4 / Alt+1..4) */}
        <nav aria-label="Primary workflow steps" className="primary-nav">
          <div role="tablist" aria-label="Workflow Steps" className="primary-tablist">
            {PRIMARY_TABS.map((tab, idx) => {
              const selected = activeView === tab.id;
              const Icon = tab.Icon;
              return (
                <button
                  key={tab.id}
                  ref={el => { tabRefs.current[tab.id] = el; }}
                  id={`tab-${tab.id}`}
                  type="button"
                  data-reactive-surface=""
                  role="tab"
                  aria-selected={selected}
                  aria-controls={`panel-${tab.id}`}
                  tabIndex={selected ? 0 : -1}
                  className={`nav-tab ${selected ? 'active' : ''}`}
                  onClick={() => setActiveView(tab.id)}
                  onKeyDown={e => handleTabListKeyDown(e, idx)}
                  title={`${tab.num}. ${tab.label} (${ergonomics.singleKeyShortcuts ? `${tab.num} or ${tab.hotkey}` : tab.hotkey})`}
                >
                  <Icon size={14} />
                  <span className="tab-num">{tab.num}.</span>
                  <span className="tab-text">{tab.short}</span>
                </button>
              );
            })}
          </div>
        </nav>

        {/* 3. Visible Mouse/Touch Command Search + Shortcuts Toggle + 3 Core Controls */}
        <div className="header-right-cluster ide-three-controls">
          <button
            type="button"
            data-reactive-surface=""
            className="btn btn-secondary ide-header-btn header-search-trigger"
            onClick={() => setPaletteOpen(true)}
            aria-label={`Search ${ergonomics.singleKeyShortcuts ? '/' : 'Ctrl+K'} - Open global Command Search`}
            title="Open Command Search with mouse or keyboard (Ctrl+K or /)"
          >
            <SearchIcon size={14} />
            <span>Search</span>
            <kbd className="header-search-kbd">{ergonomics.singleKeyShortcuts ? '/' : 'Ctrl+K'}</kbd>
          </button>
          <button
            type="button"
            data-reactive-surface=""
            aria-pressed={ergonomics.upperKeyMirror === true}
            aria-expanded={ergonomics.upperKeyMirror === true}
            className={`btn btn-secondary ide-header-btn header-shortcuts-trigger ${
              ergonomics.upperKeyMirror === true ? 'is-open' : ''
            }`}
            onClick={() =>
              setErgonomics(s => ({ ...s, upperKeyMirror: s.upperKeyMirror !== true }))
            }
            title="Show or collapse expandable keyboard shortcut strip"
          >
            <KeyboardIcon size={14} />
            <span>Shortcuts</span>
            <kbd className="header-search-kbd">?</kbd>
          </button>
          {/* Control 1: Acting as: <Name> ▾ */}
          <div className="ide-popover-anchor">
            <button
              type="button"
              data-reactive-surface=""
              data-acting-trigger="true"
              aria-haspopup="dialog"
              aria-expanded={actingMenuOpen}
              className={`btn btn-secondary ide-header-btn ${!token ? 'warn-unauth' : ''}`}
              onClick={() => {
                setDisplayPopoverOpen(false);
                setActingMenuOpen(v => !v);
              }}
            >
              <UserIcon size={14} />
              <span>Acting as: <strong>{humanActorName}</strong></span>
              <ChevronDownIcon size={13} />
            </button>

            <ActingAsMenuPopover
              open={actingMenuOpen}
              onClose={() => setActingMenuOpen(false)}
              actorId={actorId}
              token={token}
              onSwitchPersona={switchPersona}
              onOpenAuthModal={() => {
                setAuthPromptMessage('');
                setAuthModalOpen(true);
              }}
              onLogout={handleLogout}
            />
          </div>

          {/* Synthetic Blue-Glare Safety Switch (1-Click 450-480nm LED Blue-Spike Clamp) */}
          <button
            type="button"
            data-reactive-surface=""
            data-blue-glare-switch="true"
            aria-pressed={ergonomics.blueGlareShield === 'shield-max'}
            className={`btn btn-secondary ide-header-btn ${ergonomics.blueGlareShield === 'shield-max' ? 'header-shortcuts-trigger is-open' : ''}`}
            onClick={() =>
              setErgonomics(s => {
                const nextShield = s.blueGlareShield === 'shield-max' ? 'matte-balanced' : 'shield-max';
                return {
                  ...s,
                  blueGlareShield: nextShield,
                  lightSurface: nextShield === 'shield-max' ? 'blue-glare-shield' : 'moonlit-pearl'
                };
              })
            }
            title="1-click Synthetic Blue-Glare Safety Switch: clamps 450nm LED blue spike (-34% to -45% linear blue)"
          >
            <ShieldCheckIcon size={13} />
            <span>Blue Shield{ergonomics.blueGlareShield === 'shield-max' ? ': ON' : ''}</span>
          </button>

          {/* Control 2: Display & A11y: <Active Scale> ▾ */}
          <div className="ide-popover-anchor">
            <button
              type="button"
              data-reactive-surface=""
              data-display-trigger="true"
              aria-haspopup="dialog"
              aria-expanded={displayPopoverOpen}
              className="btn btn-secondary ide-header-btn"
              onClick={() => {
                setActingMenuOpen(false);
                setDisplayPopoverOpen(v => !v);
              }}
            >
              <EyeIcon size={14} />
              <span>Display &amp; A11y: <strong>{resolvedScale.badgeLabel}</strong></span>
              <ChevronDownIcon size={13} />
            </button>

            <DisplayComfortPopover
              open={displayPopoverOpen}
              onClose={() => setDisplayPopoverOpen(false)}
              settings={ergonomics}
              onChange={setErgonomics}
              onOpenFullStudio={() => setStudioOpen(true)}
            />
          </div>

          {/* Control 3: Download Plan (utility secondary in header) */}
          <button
            type="button"
            data-reactive-surface=""
            className="btn btn-secondary ide-header-btn"
            onClick={handleDirectPlanDownload}
            title="Download #FFFFFF white-paper Team Plan HTML file immediately"
          >
            <DownloadIcon size={14} />
            <span>Download Plan</span>
          </button>
        </div>
      </header>

      {/* Expandable Peripheral Shortcut Reference Bar (Collapsed by default) */}
      <UpperShortcutHoloMirror
        visible={ergonomics.upperKeyMirror === true}
        activeView={activeView}
        singleKeyShortcuts={ergonomics.singleKeyShortcuts}
        onToggleSingleKeyShortcuts={() =>
          setErgonomics(s => ({ ...s, singleKeyShortcuts: !s.singleKeyShortcuts }))
        }
        onToggleMirror={() =>
          setErgonomics(s => ({ ...s, upperKeyMirror: s.upperKeyMirror !== true }))
        }
        onOpenHelp={() => setWhyOpen(true)}
        onFocusFilter={() => requestDiscoverFilter({ focus: true })}
      />

      {/* Mobile (<768px) Pinned Mini-Panorama Summary Strip */}
      {isMobileViewport && (
        <div className="mobile-mini-panorama-strip no-print" role="region" aria-label="Plan and team summary">
          <div className="mobile-strip-row">
            <span className="mobile-strip-metrics">
              Plan: <strong>{plainVerdict.coveredCount}/{plainVerdict.totalCount} tasks</strong>
              {' · '}
              Team: <strong>{spotsUsed}/{spotsMax} spots</strong>
            </span>
            <button
              type="button"
              aria-expanded={mobileInspectOpen}
              className="btn btn-secondary btn-compact mobile-inspect-btn"
              onClick={() => setMobileInspectOpen(v => !v)}
            >
              {mobileInspectOpen ? 'Hide' : 'Inspect'}
            </button>
          </div>

          {mobileInspectOpen && (
            <div className="mobile-inspect-drawer">
              <div className="small-copy">
                <strong>{plainVerdict.headline}</strong>
                <div className="muted-copy">{plainVerdict.detail}</div>
              </div>
              <div className="pill-row top-gap-xs">
                <button
                  type="button"
                  className="btn btn-secondary btn-compact"
                  onClick={() => {
                    setMobileInspectOpen(false);
                    setActiveView('architect');
                  }}
                >
                  2. Plan the work
                </button>
                <button
                  type="button"
                  className="btn btn-secondary btn-compact"
                  onClick={() => {
                    setMobileInspectOpen(false);
                    setActiveView('authority');
                  }}
                >
                  3. Manage your team
                </button>
                <button
                  type="button"
                  className="btn btn-ghost btn-compact"
                  onClick={() => {
                    setMobileInspectOpen(false);
                    setCharterOpen(true);
                  }}
                >
                  Preview / Print PDF
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Offline Server Banner */}
      {authorityHealth === 'unreachable' && !wanOffline && (
        <div role="alert" className="offline-server-banner no-print">
          <div className="offline-server-copy">
            <AlertTriangleIcon size={18} />
            {isLoopbackHostname() ? (
              <div>
                <strong>Local Server (:8788) Unreachable:</strong> Plan schedule checks and teammate previews continue to run locally in <code>&lt;2ms</code>, while server team spots wait for connection.
              </div>
            ) : (
              <div>
                <strong>Server reconnecting:</strong> Local <code>&lt;2ms</code> plan preview remains active while live team spots reconnect.
              </div>
            )}
          </div>
          <button
            type="button"
            className="btn btn-primary btn-compact"
            disabled={retryingServer}
            onClick={retryServerConnection}
          >
            <RefreshIcon size={14} />{' '}
            {retryingServer
              ? 'Reconnecting...'
              : isLoopbackHostname()
                ? 'Retry Server (:8788)'
                : 'Reconnect'}
          </button>
        </div>
      )}

      {/* Simulated Offline Mode Banner (when browsing Steps 1, 2, or 4 while Step 3 Offline Walkthrough is active) */}
      {wanOffline && activeView !== 'authority' && (
        <div role="note" className="offline-server-banner simulated-wan-banner no-print">
          <div className="offline-server-copy">
            <OutboxIcon size={17} />
            <div>
              <strong>Simulated Offline Mode Active (from Step 3):</strong>{' '}
              {queuedClaim
                ? `1 join request (${queuedClaim.actorId} -> ${queuedClaim.teamId}) is saved on this device waiting to relay or reconnect.`
                : 'Direct server requests are paused so you can test offline device storage and Mateo relay.'}
            </div>
          </div>
          <div className="pill-row">
            <button
              type="button"
              className="btn btn-secondary btn-compact"
              onClick={() => setActiveView('authority')}
            >
              Open Step 3
            </button>
            <button
              type="button"
              className="btn btn-primary btn-compact"
              onClick={handleReconnectAndRetryDirect}
            >
              <RefreshIcon size={13} /> Reconnect now
            </button>
          </div>
        </div>
      )}

      {/* Framed Panoramic Cockpit (44fr / 28fr / 28fr on >=1100px Desktop Panorama) */}
      <div className={`workspace-layout no-print ${layoutClass}`}>
        <main
          id="main-workspace"
          tabIndex={-1}
          className="main-surface active-stage-plinth"
        >
          <TaskComprehensionBanner
            visible={ergonomics.taskGuide !== false}
            activeView={activeView}
            actorId={actorId}
            teamId={selectedTeam?.teamId || teamId}
            selectedTeamSummary={
              selectedTeam
                ? `${selectedTeam.members?.length || 0}/${selectedTeam.maxSize || 4} spots`
                : ''
            }
            planReadyText={`${plainVerdict.coveredCount}/${plainVerdict.totalCount} tasks ready`}
            planComplete={plainVerdict.tone === 'ok'}
            topReliefHint={
              topRecBuilder && !topRecInCrew && plainVerdict.tone !== 'ok'
                ? `Try ${topRecShortName} (${topRecShortTz})`
                : ''
            }
            onTriggerReliefHint={
              topRecBuilder && !topRecInCrew && plainVerdict.tone !== 'ok'
                ? () => handleToggleBuilderInCrew(topRecBuilder)
                : null
            }
            onNavigateView={setActiveView}
            onToggleGuide={() => setErgonomics(s => ({ ...s, taskGuide: s.taskGuide === false }))}
          />
          <div
            id={`panel-${activeView}`}
            role="tabpanel"
            aria-labelledby={`tab-${activeView}`}
            className="active-tabpanel-body"
          >
          {activeView === 'discover' && (
            <DiscoverView
              theme={ergonomics.theme}
              motion={ergonomics.motion}
              isPanoramic3={isPanoramaColumnsVisible}
              activeLinkId={activeLinkId}
              onLinkHover={setActiveLinkId}
              pulseTrigger={horizonPulse}
              onTriggerPulse={triggerHorizonPulse}
              eventId={eventId}
              onChangeEventId={handleChangeEventScope}
              onEnsureEvent={handleEnsureEvent}
              board={board}
              pinnedTeams={pinnedTeamsForEvent}
              totalTeams={totalTeams}
              boardLatencyMs={boardLatencyMs}
              sseConnected={sseConnected}
              ssePaused={ssePaused}
              onToggleSsePaused={() => {
                setSsePaused(prev => {
                  const next = !prev;
                  setStatusMessage(
                    next
                      ? 'Paused live updates. Press Resume to reconnect stream.'
                      : 'Resumed live updates.'
                  );
                  if (!next) setTimeout(() => refreshBoard(), 0);
                  return next;
                });
              }}
              onAnnounceStatus={setStatusMessage}
              pageIndex={pageIndex}
              pageSize={pageSize}
              onPageChange={setPageIndex}
              onPageSizeChange={sz => {
                setPageSize(sz);
                setPageIndex(0);
              }}
              onRefreshBoard={() => refreshBoard(true)}
              actorId={actorId}
              selectedTeam={selectedTeam}
              onInspectTeam={inspectTeam}
              onCloseInspect={() => setSelectedTeam(null)}
              onCheckFitCrew={handleCheckFitCrew}
              onRequestSeatForTeam={handleRequestSeatForTeam}
              onSendBuilderToArchitect={handleSendBuilderToArchitect}
              onSpawnShowcaseCrews={spawnShowcaseCrews}
              verifiedCrewMap={verifiedCrewMap}
              customCrewMap={customCrewMap}
              spawningDemo={spawningDemo}
              activeScenarioKey={activeScenarioKey}
              onSelectScenario={selectScenario}
              goalDescription={goalDescription}
              horizonHours={horizonHours}
              tasks={tasks}
              teamPeople={teamPeople}
              candidates={candidates}
              plan={plan}
              recs={recs}
              lockingPlan={lockingPlan}
              onToggleBuilderInCrew={handleToggleBuilderInCrew}
              onVerifyPersonSkill={handleVerifyPersonSkill}
              onLockPlanAndMintInvite={handleLockPlanAndMintInvite}
              onInspectDagWipe={() => setActiveView('architect')}
              onOpenPalette={() => setPaletteOpen(true)}
              externalFilterRequest={discoverFilterReq}
              onNotify={notifyToast}
            />
          )}

          {activeView === 'architect' && (
            <MissionArchitectView
              theme={ergonomics.theme}
              motion={ergonomics.motion}
              activeLinkId={activeLinkId}
              onLinkHover={setActiveLinkId}
              pulseTrigger={horizonPulse}
              onTriggerPulse={triggerHorizonPulse}
              activeScenarioKey={activeScenarioKey}
              omegaMode={omegaMode}
              onSelectScenario={selectScenario}
              onToggleOmegaMode={handleToggleOmegaMode}
              goalDescription={goalDescription}
              onChangeGoalDescription={setGoalDescription}
              horizonHours={horizonHours}
              onChangeHorizonHours={setHorizonHours}
              tasks={tasks}
              onChangeTasks={setTasks}
              teamPeople={teamPeople}
              onChangeTeamPeople={setTeamPeople}
              candidates={candidates}
              onChangeCandidates={setCandidates}
              plan={plan}
              beforeSnapshot={beforeSnapshot}
              recs={recs}
              solving={solving}
              lockingPlan={lockingPlan}
              onRunSolveAndRecommend={runSolveAndRecommend}
              onAddCandidateToTeam={handleAddCandidateToTeam}
              onVerifyPersonSkill={handleVerifyPersonSkill}
              onLockPlanAndMintInvite={handleLockPlanAndMintInvite}
              onOpenCharterExport={() => setCharterOpen(true)}
              onNotify={notifyToast}
            />
          )}

          {activeView === 'authority' && (
            <SeatAuthorityView
              activeLinkId={activeLinkId}
              onLinkHover={setActiveLinkId}
              eventId={eventId}
              actorId={actorId}
              teamId={teamId}
              onChangeTeamId={handleChangeActiveTeamId}
              board={board}
              pinnedTeams={pinnedTeamsForEvent}
              selectedTeam={selectedTeam}
              onInspectTeam={inspectTeam}
              inviteCode={inviteCode}
              onChangeInviteCode={setInviteCode}
              issuedInvite={issuedInvite}
              lastClaimCode={lastClaimCode}
              onCreateTeam={handleCreateTeam}
              onCreateInvite={handleCreateInvite}
              onJoinSeat={handleJoinSeat}
              joining={joining}
              forwardingPeer={forwardingPeer}
              hasLastClaim={hasLastClaim}
              highlightWalkthrough={highlightRelayWalkthrough}
              onTransferLeader={handleTransferLeader}
              onLeaveTeam={handleLeaveTeam}
              wanOffline={wanOffline}
              onToggleWanOffline={() => {
                const nextOff = !wanOffline;
                setWanOffline(nextOff);
                setAuthorityHealth(nextOff ? 'wan-dropped' : 'online');
                notifyToast(
                  nextOff
                    ? 'Connection simulated offline -> join requests save on this device.'
                    : 'Reconnected to server.',
                  nextOff ? 'warn' : 'ok'
                );
                if (!nextOff) refreshBoard();
              }}
              queuedClaim={queuedClaim}
              relayedReceipt={relayedReceipt}
              replayReceipt={replayReceipt}
              onForwardViaPeer={handleForwardViaPeer}
              onReconnectAndRetryDirect={handleReconnectAndRetryDirect}
              onAutoSetupRelayDemo={handleAutoSetupRelayDemo}
              peerNoteText={peerNoteText}
              onChangePeerNoteText={setPeerNoteText}
              peerNotes={peerNotes}
              onSendPeerNote={handleSendPeerNote}
              onLoadPeerNotes={() => handleLoadPeerNotes(undefined, true)}
              glueResult={glueResult}
              onRunGluePreset={handleRunGluePreset}
              auditRows={auditRows}
              onLoadAudit={() => loadAudit(undefined, true)}
              onOpenCharterExport={() => setCharterOpen(true)}
              onClaimAsFreshCandidate={handleClaimAsFreshCandidate}
              onRequestInviteAndJoinOpenSpot={handleRequestInviteAndJoinOpenSpot}
              onNotify={notifyToast}
            />
          )}

          {activeView === 'arena' && (
            <ProofArenaView
              eventId={eventId}
              raceReceipt={raceReceipt}
              runningRace={runningRace}
              onRun50WayRace={handleRun50WayRace}
              probeStats={probeStats}
              probingLatency={probingLatency}
              onRunLatencyProbe={handleRunLatencyProbe}
              onExecuteWalkthroughStep={handleExecuteWalkthroughStep}
            />
          )}
          </div>
        </main>

        {/* COLUMN 2 (PANORAMA): Team Plan & Schedule */}
        {isPanoramaActive && !isMobileViewport && (
          <aside className="panorama-pane" aria-label="Team Plan and Schedule">
            <div
              className={`surface-card sticky-dock peripheral-station ${
                col2HasUnresolved ? 'has-unresolved-contour' : 'has-purpose-harmony'
              }`}
            >
              <div className="row-between wrap-gap">
                <span className="eyebrow-tag">
                  {col2HasUnresolved ? 'NEEDS ATTENTION · PREVIEW ONLY' : 'READY · ALL TASKS COVERED'}
                </span>
                <span className="mono-pill">
                  {plainVerdict.coveredCount}/{plainVerdict.totalCount} tasks
                </span>
              </div>

              <div className="row-between wrap-gap top-gap-xs">
                <h2 className="card-subtitle">Team Plan &amp; Schedule</h2>
                <div className="pill-row scenario-mini-pills" role="group" aria-label="Switch example plan">
                  {Object.values(MISSION_SCENARIOS).map(sc => (
                    <button
                      key={sc.id}
                      type="button"
                      data-reactive-surface=""
                      aria-pressed={activeScenarioKey === sc.id}
                      className={`mini-preset-chip ${activeScenarioKey === sc.id ? 'active' : ''}`}
                      onClick={() => selectScenario(sc.id)}
                      title={sc.title}
                    >
                      {sc.code}
                    </button>
                  ))}
                </div>
              </div>

              <p className="muted-copy small-copy top-gap-xs">{goalDescription}</p>

              {/* Honest Plain-Language Plan Banner (Never green at 2/3!) */}
              <div
                className={`subcard top-gap-xs ${plainVerdict.tone === 'ok' ? 'tone-ok' : 'tone-warn'}`}
              >
                <div className="pill-row">
                  {plainVerdict.tone === 'ok' ? (
                    <CheckCircleIcon size={15} />
                  ) : (
                    <AlertTriangleIcon size={15} />
                  )}
                  <strong>{plainVerdict.headline}</strong>
                </div>
                <div className="small-copy muted-copy top-gap-xs">{plainVerdict.detail}</div>
              </div>

              {/* People in Plan Preview (with Cross-Panel Tether) */}
              <div className="dock-roster-row top-gap-xs" aria-label="People in plan preview">
                {teamPeople.map(p => {
                  const isLinked =
                    activeLinkId && normalizeBuilderId(activeLinkId) === normalizeBuilderId(p.id);
                  const dirMatch = findBuilderById(p, [candidates, teamPeople]);
                  return (
                    <button
                      key={p.id}
                      type="button"
                      data-link-id={p.id}
                      onMouseEnter={() => setActiveLinkId(p.id)}
                      onMouseLeave={() => setActiveLinkId(null)}
                      onFocus={() => setActiveLinkId(p.id)}
                      className={`dock-member-pill ${isLinked ? 'is-linked-ridge' : ''}`}
                      onClick={() =>
                        handleToggleBuilderInCrew(
                          dirMatch || {
                            id: p.id,
                            plannerId: p.id,
                            timezone: p.timezone,
                            startMin: p.startMin,
                            endMin: p.endMin,
                            skills: p.skills || {}
                          }
                        )
                      }
                      title={`Preview only - click to remove ${p.id} from plan`}
                    >
                      <span className="member-dot" aria-hidden="true" />
                      <strong>{p.id}</strong>
                      <span className="muted-copy">{(p.timezone || '').split('·')[0].trim()}</span>
                      <span aria-hidden="true" className="remove-x">×</span>
                    </button>
                  );
                })}
                {topRecBuilder && !topRecInCrew && plan?.status !== 'FEASIBLE_WITNESS' && (
                  <button
                    type="button"
                    data-reactive-surface=""
                    data-purpose-beacon="relief"
                    data-link-id={topRecBuilder.id}
                    onMouseEnter={() => setActiveLinkId(topRecBuilder.id)}
                    onMouseLeave={() => setActiveLinkId(null)}
                    onFocus={() => setActiveLinkId(topRecBuilder.id)}
                    className="dock-member-pill pill-suggest"
                    onClick={() => handleToggleBuilderInCrew(topRecBuilder)}
                  >
                    + Try {topRecShortName} ({topRecShortTz})
                  </button>
                )}
              </div>

              {mateoInCrew && activeScenarioKey === 'baton' && (
                <div className="subcard top-gap-xs small-copy">
                  <div>
                    <strong>Mateo (Database · UTC-5)</strong> is in your plan preview. Example 1 needs{' '}
                    <code>integrate</code> (Priya); see Mateo resolve Aurora&apos;s parallel database &amp; API overload in 1 click:
                  </div>
                  <div className="top-gap-xs">
                    <button
                      type="button"
                      className="btn btn-secondary btn-compact"
                      onClick={() => selectScenario('hall')}
                    >
                      Switch to Example 2: Double-booked database &amp; API -&gt;
                    </button>
                  </div>
                </div>
              )}

              <div className="top-gap-xs">
                <SolarBatonHorizon
                  mode="architect"
                  theme={ergonomics.theme}
                  motion={ergonomics.motion}
                  compact
                  horizonMin={horizonMin}
                  teamPeople={teamPeople}
                  candidates={candidates}
                  recommendations={recs?.recommendations || []}
                  tasks={tasks}
                  plan={plan}
                  pulseTrigger={horizonPulse}
                  activeLinkId={activeLinkId}
                />
              </div>

              {/* Task Rows with Same-ID Cross-Panel Tether */}
              <div className="mini-dag-stack top-gap-xs">
                {tasks.map(t => {
                  const cp = (plan?.criticalPath || []).find(m => m.taskId === t.id);
                  const asg = (plan?.witness?.assignments || []).find(a => a.taskId === t.id);
                  const prevAsg = asg || panoramaPartialPreview.get(t.id) || null;
                  const assigneeId = prevAsg?.personId || null;
                  const normHover = activeLinkId ? normalizeBuilderId(activeLinkId) : '';
                  const hoverBuilder = normHover
                    ? findBuilderById(normHover, [candidates, teamPeople])
                    : null;
                  const hoverCoversTask = Boolean(
                    hoverBuilder?.skills && hoverBuilder.skills[t.skill]
                  );
                  const isLinked =
                    Boolean(activeLinkId) &&
                    (activeLinkId === t.id ||
                      (assigneeId && normHover === normalizeBuilderId(assigneeId)) ||
                      (!prevAsg && hoverCoversTask));

                  const activeAsg = asg || prevAsg;
                  const dagStateClass = !activeAsg
                    ? 'mini-dag-uncovered'
                    : activeAsg.evidence === 'unknown'
                      ? 'mini-dag-conditional'
                      : 'mini-dag-covered';

                  return (
                    <div
                      key={t.id}
                      data-reactive-surface=""
                      data-link-id={t.id}
                      onMouseEnter={() => setActiveLinkId(assigneeId || t.id)}
                      onMouseLeave={() => setActiveLinkId(null)}
                      className={`mini-dag-row ${isLinked ? 'is-linked-ridge' : ''} ${dagStateClass}`}
                    >
                      <div className="row-between small-copy">
                        <strong>
                          <code>{t.id}</code> <span className="muted-copy">({t.skill})</span>
                        </strong>
                        <span className={cp && cp.slackMin <= 0 ? 'final-seat-text' : 'muted-copy'}>
                          {cp ? (cp.slackMin <= 0 ? '0m buffer' : `+${cp.slackMin}m`) : `${t.durationMin}m`}
                        </span>
                      </div>
                      <div className="small-copy muted-copy">
                        {asg
                          ? `${asg.evidence === 'unknown' ? '? Unverified: ' : '✓ '}${asg.personId} (${asg.startMin}..${asg.endMin}m)`
                          : prevAsg
                            ? `${prevAsg.evidence === 'unknown' ? '? Unverified: ' : '✓ '}${prevAsg.personId} (Preview ${prevAsg.startMin}..${prevAsg.endMin}m)`
                            : `◇ Uncovered - needs ${t.skill}`}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Column 2 Quick Actions */}
              <div className="pill-row top-gap-sm">
                {plan?.status === 'FEASIBLE_WITNESS' ? (
                  <button
                    type="button"
                    data-reactive-surface=""
                    data-purpose-beacon="ready"
                    className="btn btn-secondary btn-compact"
                    disabled={lockingPlan}
                    onClick={handleLockPlanAndMintInvite}
                  >
                    <ShieldCheckIcon size={14} />{' '}
                    {lockingPlan ? 'Creating...' : 'Create team & invite'}
                  </button>
                ) : topRecBuilder && !topRecInCrew ? (
                  <button
                    type="button"
                    data-reactive-surface=""
                    data-purpose-beacon="relief"
                    className="btn btn-secondary btn-compact"
                    onClick={() => handleToggleBuilderInCrew(topRecBuilder)}
                  >
                    <PlusIcon size={14} /> Try {topRecShortName} in plan
                  </button>
                ) : plan?.status !== 'FEASIBLE_WITNESS' && plan?.frontier?.voiQuestion ? (
                  <button
                    type="button"
                    data-reactive-surface=""
                    className="btn btn-secondary btn-compact"
                    onClick={() =>
                      handleVerifyPersonSkill(
                        plan.frontier.voiQuestion.personId,
                        plan.frontier.voiQuestion.skill
                      )
                    }
                  >
                    <CheckCircleIcon size={14} /> Confirm {plan.frontier.voiQuestion.skill}
                  </button>
                ) : (
                  <button
                    type="button"
                    data-reactive-surface=""
                    className="btn btn-secondary btn-compact"
                    onClick={() => setActiveView('architect')}
                  >
                    Edit in Step 2
                  </button>
                )}

                <button
                  type="button"
                  data-reactive-surface=""
                  className="btn btn-ghost btn-compact"
                  onClick={() => setCharterOpen(true)}
                  title="Open dark-comfort preview and print/PDF options"
                >
                  <FileTextIcon size={14} /> Preview / Print PDF
                </button>
              </div>
            </div>
          </aside>
        )}

        {/* COLUMN 3 (PANORAMA): Team Spots & Server Result (with Activity Summary | Engineering Proof) */}
        {isPanoramaActive && !isMobileViewport && (
          <aside className="panorama-pane" aria-label="Team Spots and Server Result">
            <div
              className={`surface-card sticky-dock peripheral-station ${col3HasUnresolved ? 'has-unresolved-contour' : ''}`}
            >
              {/* 3-Coordinate Network Continuity Header */}
              <div className="row-between wrap-gap">
                <button
                  type="button"
                  data-reactive-surface=""
                  className="col3-network-strip small-copy"
                  onClick={handleOpenOfflineWalkthrough}
                  title="Open Step 3: Offline Join Walkthrough & Mateo teammate relay"
                >
                  <span className={`coord-item ${wanOffline ? 'coord-warn' : authorityHealth === 'online' ? 'coord-ok' : ''}`}>
                    <DatabaseIcon size={12} />
                    <span>{wanOffline ? 'Disconnected' : authorityHealth === 'online' ? 'Server online' : 'Checking'}</span>
                  </span>
                  <span className="coord-sep" aria-hidden="true">·</span>
                  <span className="coord-item coord-ok">
                    <MeshIcon size={12} />
                    <span>Mateo ready</span>
                  </span>
                  <span className="coord-sep" aria-hidden="true">·</span>
                  <span className={`coord-item ${queuedClaim ? 'coord-warn' : ''}`}>
                    <OutboxIcon size={12} />
                    <span>{queuedClaim ? '1 saved' : '0 saved'}</span>
                  </span>
                </button>

                <button
                  type="button"
                  className="btn btn-ghost btn-compact"
                  onClick={handleSyncCol3}
                  title="Refresh active team spots, board, and server history"
                >
                  <RefreshIcon size={13} /> Sync
                </button>
              </div>

              <h2 className="card-subtitle top-gap-xs">Team Spots &amp; Server Result</h2>

              {/* Static Peripheral Memory Anchor (CRR-10) */}
              <div className="memory-anchor-bar tiny-copy muted-copy top-gap-xs">
                Active team: <code>{selectedTeam?.teamId || teamId}</code> · Acting as: <strong>{humanActorName}</strong>
              </div>

              {/* Live Active Server Team Card (Always Synchronized with Accepted Invites & Firefly Lead) */}
              {selectedTeam ? (() => {
                const hasServerLead = Boolean(
                  selectedTeam.leader || (selectedTeam.members || []).some(m => m.isLeader)
                );
                const openCol3Spots = Math.max(
                  0,
                  (selectedTeam.maxSize || 5) - (selectedTeam.members?.length || 0)
                );
                return (
                  <div
                    className={`active-server-team-card top-gap-xs ${
                      hasServerLead ? '' : 'is-leaderless'
                    }`}
                  >
                    <div className="row-between wrap-gap">
                      <span className="tiny-copy">
                        <strong>Confirmed team:</strong> <code>{selectedTeam.teamId}</code>
                      </span>
                      <span
                        className={`status-chip ${
                          selectedTeam.members.length >= selectedTeam.maxSize ? 'chip-warn' : 'chip-ok'
                        }`}
                      >
                        {selectedTeam.members.length}/{selectedTeam.maxSize} spots
                      </span>
                    </div>
                    <div className="active-team-members-row top-gap-xs">
                      {!hasServerLead && (
                        <span className="active-member-pill badge-pill vacant-lead-badge">
                          ◇ No Lead
                        </span>
                      )}
                      {selectedTeam.members.map(m => {
                        const isLead = m.userId === selectedTeam.leader || m.isLeader;
                        return (
                          <span
                            key={m.userId}
                            className={`active-member-pill ${isLead ? 'is-lead' : ''}`}
                            title={m.userId}
                          >
                            {isLead ? '★ ' : '✓ '}
                            {formatHumanActorName(m.userId, true)}
                          </span>
                        );
                      })}
                      {openCol3Spots > 0 && (
                        <span
                          className="active-member-pill is-open-spot"
                          title="Open server spots ready for invite"
                        >
                          ◌ +{openCol3Spots} open
                        </span>
                      )}
                    </div>
                    {issuedInvite && issuedInvite.teamId === selectedTeam.teamId && (
                      <div className="tiny-copy muted-copy top-gap-xs">
                        {issuedInvite.claimedBy
                          ? `Invite accepted by ${formatHumanActorName(issuedInvite.claimedBy, true)}`
                          : '1 single-use invite open'}
                      </div>
                    )}
                  </div>
                );
              })() : (
                <div className="active-server-team-card is-leaderless top-gap-xs">
                  <div className="row-between wrap-gap">
                    <span className="tiny-copy">
                      <strong>Server team:</strong> None selected
                    </span>
                    <span className="badge-pill vacant-lead-badge">◇ No Lead</span>
                  </div>
                  <div className="tiny-copy top-gap-xs">
                    Pick an open team below or create one as Team Lead.
                  </div>
                </div>
              )}

              {/* Confirmed Server Teams Quick List (Pinned Active & Open Teams First) */}
              <div className="mini-board-list top-gap-xs">
                {col3TeamsList.map(t => {
                  const isActiveRow = selectedTeam?.teamId === t.team_id;
                  const isLinked = activeLinkId === t.team_id;
                  return (
                    <button
                      key={t.team_id}
                      type="button"
                      data-reactive-surface=""
                      data-link-id={t.team_id}
                      onMouseEnter={() => setActiveLinkId(t.team_id)}
                      onMouseLeave={() => setActiveLinkId(null)}
                      className={`mini-board-row ${isActiveRow ? 'is-active-team' : ''} ${
                        isLinked ? 'is-linked-ridge' : ''
                      }`}
                      onClick={() => handleRequestSeatForTeam(t.team_id)}
                    >
                      <span>
                        {isActiveRow ? '● ' : ''}
                        {t.team_id}
                      </span>
                      <code>{t.members}/{t.max_size} spots</code>
                    </button>
                  );
                })}
              </div>

              {/* 2-Tab Toggle: Activity Summary | Engineering Proof */}
              <div
                className="tab-strip compact-tab-strip top-gap-sm"
                role="tablist"
                aria-label="Server activity or engineering proof"
                onKeyDown={e => {
                  const tabIds = ['summary', 'proof'];
                  const idx = tabIds.indexOf(col3Tab);
                  let nextIdx = -1;
                  if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') nextIdx = idx === 0 ? 1 : 0;
                  else if (e.key === 'Home') nextIdx = 0;
                  else if (e.key === 'End') nextIdx = 1;
                  if (nextIdx < 0) return;
                  e.preventDefault();
                  handleSwitchCol3Tab(tabIds[nextIdx]);
                  const tabs = Array.from(e.currentTarget.querySelectorAll('[role="tab"]'));
                  requestAnimationFrame(() => tabs[nextIdx]?.focus());
                }}
              >
                <button
                  type="button"
                  data-reactive-surface=""
                  role="tab"
                  aria-selected={col3Tab === 'summary'}
                  tabIndex={col3Tab === 'summary' ? 0 : -1}
                  className={`tab-pill ${col3Tab === 'summary' ? 'active' : ''}`}
                  onClick={() => handleSwitchCol3Tab('summary')}
                >
                  Activity Summary
                </button>
                <button
                  type="button"
                  data-reactive-surface=""
                  role="tab"
                  aria-selected={col3Tab === 'proof'}
                  tabIndex={col3Tab === 'proof' ? 0 : -1}
                  className={`tab-pill ${col3Tab === 'proof' ? 'active' : ''}`}
                  onClick={() => handleSwitchCol3Tab('proof')}
                >
                  Engineering Proof
                </button>
              </div>

              <div ref={col3ScrollRef} className="col3-inspector-scroll top-gap-xs">
                {col3Tab === 'summary' ? (
                  <div className="stack-column-tight">
                    {/* Plain-Language Provenance States */}
                    <div className="outcome-row">
                      <span className="status-chip chip-warn">Preview only - not joined yet</span>
                      <div className="tiny-copy muted-copy top-gap-xs">
                        Plan preview: {teamPeople.map(p => p.id).join(', ') || 'none'} ({plainVerdict.coveredCount}/{plainVerdict.totalCount} tasks)
                      </div>
                    </div>

                    {selectedTeam && (
                      <div className="outcome-row">
                        <span className="status-chip chip-ok">Confirmed by server</span>
                        <div className="tiny-copy top-gap-xs">
                          Team <code>{selectedTeam.teamId}</code>: {selectedTeam.members.length}/{selectedTeam.maxSize} spots ({selectedTeam.members.map(m => m.userId).join(', ')})
                        </div>
                      </div>
                    )}

                    {queuedClaim && (
                      <div className="outcome-row">
                        <span className="status-chip chip-warn">Saved on this device</span>
                        <div className="tiny-copy top-gap-xs">
                          Waiting to send join request for <code>{queuedClaim.actorId}</code> -&gt; <code>{queuedClaim.teamId}</code>.
                        </div>
                      </div>
                    )}

                    {relayedReceipt && (
                      <div className="outcome-row">
                        <span className="status-chip chip-ok">Sent through Mateo</span>
                        <div className="tiny-copy top-gap-xs">
                          Confirmed by server for <code>{relayedReceipt.actorId}</code> on <code>{relayedReceipt.teamId}</code>.
                        </div>
                      </div>
                    )}

                    {replayReceipt && (
                      <div className="outcome-row">
                        <span className="status-chip chip-ok">Original result returned</span>
                        <div className="tiny-copy top-gap-xs">
                          Reconnected safely with zero duplicate spots.
                        </div>
                      </div>
                    )}

                    {raceReceipt && (
                      <div className="outcome-row">
                        <span className="status-chip chip-ok">Last-spot test complete</span>
                        <div className="tiny-copy top-gap-xs">
                          50 requested · 1 joined (<code>{raceReceipt.winner}</code>) · {raceReceipt.rejected} turned away ({raceReceipt.elapsedMs} ms).
                        </div>
                      </div>
                    )}

                    {auditRows.length > 0 && (
                      <div className="audit-timeline top-gap-xs">
                        {auditRows.slice(-4).reverse().map(row => (
                          <div key={row.id} className="audit-entry tiny-copy">
                            <strong>
                              {row.action.includes('RELAYED') ? 'Sent through Mateo' : 'Confirmed by server'}
                            </strong>{' '}
                            · <code>{row.actor_id}</code> -&gt; <code>{row.team_id}</code>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="stack-column-tight">
                    <div className="pill-row">
                      <EpistemicStencil kind="SQLITE_AUTHORITY" compact />
                      <EpistemicStencil kind="PEER_CIPHERTEXT_ONLY" compact />
                    </div>

                    <div className="outcome-row mono-cell tiny-copy">
                      <div><strong>SQLite WAL:</strong> BEGIN IMMEDIATE</div>
                      <div><strong>SSE Stream:</strong> {sseConnected ? 'LIVE' : 'STANDBY'} · {boardLatencyMs !== null ? `${boardLatencyMs.toFixed(1)}ms` : '--'}</div>
                      <div><strong>Total Teams:</strong> {totalTeams ?? board.length} ({totalMembers ?? '--'} members)</div>
                    </div>

                    <div className="outcome-row mono-cell tiny-copy">
                      <div><strong>Solver:</strong> {plan?.status || 'NONE'} ({plan?.classification || '--'})</div>
                      <div><strong>Quantifier:</strong> {plan?.frontier?.quantifierStatus || 'DETERMINISTIC'}</div>
                      <div>
                        <strong>Wildcard |Omega|:</strong>{' '}
                        {plan?.frontier ? `${plan.frontier.worldsCovered}/${plan.frontier.omegaSize}` : '1/1'}
                        {plan?.status !== 'FEASIBLE_WITNESS' && plan?.frontier?.voiQuestion
                          ? ` · VOI=${plan.frontier.voiQuestion.informationGainBits}b`
                          : ''}
                      </div>
                    </div>

                    <div className="outcome-row mono-cell tiny-copy">
                      <div><strong>Outbox opId:</strong> {queuedClaim ? queuedClaim.opId : '0 queued'}</div>
                      <div><strong>Peer Notes:</strong> {peerNotes.length} AES-256-GCM + P-256</div>
                      {raceReceipt && (
                        <div>
                          <strong>Race-50:</strong> oversize={raceReceipt.invariants?.oversize ?? 0} · {raceReceipt.elapsedMs}ms
                        </div>
                      )}
                    </div>

                    {auditRows.length > 0 && (
                      <div className="audit-timeline top-gap-xs">
                        {auditRows.slice(-4).reverse().map(row => (
                          <div key={row.id} className="audit-entry mono-cell tiny-copy">
                            #{row.id} {row.action} · {row.actor_id} · op={row.op_id?.slice(0, 14)}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </aside>
        )}

        {/* 2-Column Split Companion (When user explicitly picks 2-Column Split in Extended Studio) */}
        {ergonomics.density === 'split-studio' && !isMobileViewport && (
          <aside className="split-companion-pane" aria-label="Team Plan and Server Companion">
            <div className="surface-card sticky-dock">
              <span className="eyebrow-tag">COMPANION SUMMARY</span>
              <h2 className="card-subtitle">Plan &amp; Server Status</h2>

              <div className={`subcard top-gap-xs ${plainVerdict.tone === 'ok' ? 'tone-ok' : 'tone-warn'}`}>
                <strong>{plainVerdict.headline}</strong>
                <div className="small-copy muted-copy top-gap-xs">{plainVerdict.detail}</div>
              </div>

              <div className="subcard top-gap-xs small-copy">
                <div><strong>Server:</strong> {wanOffline ? 'Disconnected' : authorityHealth}</div>
                <div><strong>Saved offline:</strong> {queuedClaim ? '1 waiting to send' : '0'}</div>
                <div><strong>Teams in {eventId}:</strong> {totalTeams !== null ? totalTeams.toLocaleString() : board.length}</div>
              </div>
            </div>
          </aside>
        )}
      </div>

      {/* Slim IDE Status & Contextual Keycap Ribbon */}
      <KeyboardLightRibbon
        statusMessage={statusMessage}
        wanOffline={wanOffline}
        authorityHealth={authorityHealth}
        queuedClaim={queuedClaim}
        singleKeyShortcuts={ergonomics.singleKeyShortcuts}
        upperKeyMirror={ergonomics.upperKeyMirror === true}
        onToggleSingleKeyShortcuts={() =>
          setErgonomics(s => ({ ...s, singleKeyShortcuts: !s.singleKeyShortcuts }))
        }
        onToggleUpperKeyMirror={() =>
          setErgonomics(s => ({ ...s, upperKeyMirror: s.upperKeyMirror !== true }))
        }
        onJumpToManageTeam={() => setActiveView('authority')}
        onOpenPalette={() => setPaletteOpen(true)}
        onOpenHelp={() => setWhyOpen(true)}
        onFocusFilter={() => requestDiscoverFilter({ focus: true })}
      />
      </div>

      {/* Accessible Modals & Drawers */}
      <WhyPurposeFirstModal
        open={whyOpen}
        onClose={() => setWhyOpen(false)}
        onJumpScenario={scKey => {
          setActiveView('architect');
          selectScenario(scKey);
        }}
        onNavigate={view => setActiveView(view)}
        onOpenPalette={() => setPaletteOpen(true)}
      />

      <AuthAccountModal
        open={authModalOpen}
        onClose={() => {
          setAuthModalOpen(false);
          setAuthPromptMessage('');
        }}
        actorId={actorId}
        token={token}
        authPromptMessage={authPromptMessage}
        onSwitchPersona={switchPersona}
        onAccountAuth={handleAccountAuth}
        onLogout={handleLogout}
      />

      <AccessibilityStudioDrawer
        open={studioOpen}
        onClose={() => setStudioOpen(false)}
        settings={ergonomics}
        onChange={setErgonomics}
      />

      <CommandPaletteModal
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        commands={commands}
      />

      <CrewCharterExportModal
        open={charterOpen}
        onClose={() => setCharterOpen(false)}
        eventId={eventId}
        teamId={shouldBindServerTeamToExport ? (selectedTeam?.teamId || teamId) : 'plan-preview'}
        actorId={actorId}
        selectedTeam={selectedTeam}
        allowServerTeamBinding={shouldBindServerTeamToExport}
        goalDescription={goalDescription}
        horizonHours={horizonHours}
        tasks={tasks}
        teamPeople={teamPeople}
        plan={plan}
        issuedInvite={shouldBindServerTeamToExport ? issuedInvite : null}
        onNotify={notifyToast}
      />
    </div>
  );
}
