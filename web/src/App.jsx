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
  normalizeBuilderId,
  findBuilderById,
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
import KeyboardLightRibbon from './components/KeyboardLightRibbon.jsx';
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
  HelpIcon,
  EyeIcon,
  DownloadIcon,
  ChevronDownIcon,
  RefreshIcon,
  FileTextIcon,
  PlusIcon,
  CheckCircleIcon,
  AlertTriangleIcon
} from './icons.jsx';

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
  const apiCands = visualPeopleToApi(candidates || [], horizonMin);

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

  // Live Board & Pagination State
  const [board, setBoard] = useState([]);
  const [totalTeams, setTotalTeams] = useState(null);
  const [totalMembers, setTotalMembers] = useState(null);
  const [eventMaxSize, setEventMaxSize] = useState(5);
  const [boardLatencyMs, setBoardLatencyMs] = useState(null);
  const [sseConnected, setSseConnected] = useState(false);
  const [pageIndex, setPageIndex] = useState(0);
  const [pageSize, setPageSize] = useState(24);
  const [selectedTeam, setSelectedTeam] = useState(null);
  const [spawningDemo, setSpawningDemo] = useState(false);
  const [verifiedCrewMap, setVerifiedCrewMap] = useState({});
  const [customCrewMap, setCustomCrewMap] = useState(() => loadCustomCrewOverlay());

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
  const [lockingPlan, setLockingPlan] = useState(false);
  const [evaluatingCrewId, setEvaluatingCrewId] = useState(null);

  // Step 3: Manage your team & offline forwarding state
  const [teamId, setTeamId] = useState('crew-alpha');
  const [inviteCode, setInviteCode] = useState('');
  const [issuedInvite, setIssuedInvite] = useState(null);
  const [joining, setJoining] = useState(false);
  const joiningLock = useRef(false);
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
      if (isMotionFrozen(ergonomics.motion) || ergonomics.crrMode === 'flat') return;
      const clientX = e.clientX;
      const clientY = e.clientY;
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
    [ergonomics.motion, ergonomics.crrMode]
  );

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

          if (!signedOutManuallyRef.current) {
            try {
              const refreshActor = actorRef.current || 'leader-aurora';
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

  // Board refresh with live latency measurement
  const refreshBoard = useCallback(
    async (manual = false) => {
      if (wanOffline) {
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
        setBoard(data.teams || []);
        if (typeof data.totalTeams === 'number') setTotalTeams(data.totalTeams);
        if (typeof data.totalMembers === 'number') setTotalMembers(data.totalMembers);
        if (typeof data.maxSize === 'number') setEventMaxSize(data.maxSize);
        setBoardLatencyMs(dt);
        setAuthorityHealth('online');
        if (manual === true) {
          notifyToast(`Refreshed server team list (${dt.toFixed(1)} ms).`, 'ok');
        }
        return true;
      } catch (e) {
        setAuthorityHealth('unreachable');
        setStatusMessage(`Server connection: ${e.message}`);
        if (manual === true) {
          notifyToast('Local server (:8788) offline - plan preview still works locally.', 'err');
        }
        return false;
      }
    },
    [eventId, pageIndex, pageSize, wanOffline, notifyToast]
  );

  async function retryServerConnection() {
    setRetryingServer(true);
    try {
      if (!signedOutManuallyRef.current) {
        await ensureToken('');
      }
      const ok = await refreshBoard(false);
      if (ok) {
        notifyToast('Connected to local server (:8788).', 'ok');
      } else {
        notifyToast('Server (:8788) still offline - run LAUNCH_H4H_PS1.cmd on Desktop.', 'err');
      }
    } finally {
      setRetryingServer(false);
    }
  }

  useEffect(() => {
    refreshBoard();
    const timer = setInterval(refreshBoard, 6000);
    return () => clearInterval(timer);
  }, [refreshBoard]);

  // SSE Live Revision Stream
  useEffect(() => {
    if (wanOffline || !/^[A-Za-z0-9_.:@-]{1,128}$/.test(eventId)) {
      setSseConnected(false);
      return undefined;
    }
    const stream = new EventSource(`/api/events/${encodeURIComponent(eventId)}/stream`);
    stream.onopen = () => setSseConnected(true);
    stream.onerror = () => setSseConnected(false);
    stream.addEventListener('board', () => {
      refreshBoard();
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
    try {
      await runProtectedAction(`Switch Event (${nextEv})`, async freshTok => {
        await sendPost('/api/events', { eventId: nextEv, maxSize: 5 }, freshTok);
        setEventId(nextEv);
        setPageIndex(0);
        setSelectedTeam(null);
        setStatusMessage(`Switched active event to '${nextEv}'.`);
        notifyToast(`Switched event to '${nextEv}'.`, 'ok');
      });
    } catch {
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
      setStatusMessage(`${plain.headline} · ${local.recRes.recommendations?.length || 0} suggested people.`);

      if (overrides.toastMessage) {
        notifyToast(overrides.toastMessage, plain.tone === 'ok' ? 'ok' : 'info');
      } else if (overrides.explicitEvaluate) {
        notifyToast(plain.headline, plain.tone === 'ok' ? 'ok' : 'warn');
      }

      if (wanOffline || local.apiTeam.length === 0 || local.goalPayload.tasks.length === 0) {
        return local;
      }

      const seq = ++solveSeqRef.current;
      setSolving(true);
      try {
        let activeTok = await ensureToken('');
        if (!activeTok && !signedOutManuallyRef.current) {
          try {
            const refreshed = await readApiJson(
              await fetch('/api/auth/demo', {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ actorId: actorRef.current || 'leader-aurora', eventId, maxSize: 5 })
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
        if (!activeTok) return local;

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
            const refreshed = await readApiJson(
              await fetch('/api/auth/demo', {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ actorId: actorRef.current || 'leader-aurora', eventId, maxSize: 5 })
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
  async function inspectTeam(tid, silent = false) {
    try {
      const detail = await readApiJson(
        await fetch(`/api/events/${encodeURIComponent(eventId)}/teams/${encodeURIComponent(tid)}`, {
          cache: 'no-store'
        })
      );
      setSelectedTeam(detail);
      setTeamId(tid);
      setStatusMessage(`Confirmed by server: ${detail.members.length}/${detail.maxSize} spots filled on '${tid}'.`);
      if (!silent) {
        notifyToast(
          `Loaded '${tid}': ${detail.members.length}/${detail.maxSize} spots confirmed by server.`,
          'info'
        );
      }
    } catch (e) {
      setSelectedTeam(null);
      setStatusMessage(`Team lookup: ${e.message}`);
      if (!silent) {
        notifyToast(`Could not load '${tid}': ${e.message}`, 'err');
      }
    }
  }

  // Step 2 -> Step 3: Create Team & Single-Use Invite on Server
  async function handleLockPlanAndMintInvite() {
    await runProtectedAction('Create Team & Single-Use Invite', async freshTok => {
      setLockingPlan(true);
      try {
        await sendPost('/api/events', { eventId, maxSize: 5 }, freshTok);
        const tag = String(Date.now()).slice(-4);
        const targetTid = `00-feasible-${tag}`;
        let activeTok = freshTok;
        let activeLead = actorRef.current || 'leader-aurora';

        try {
          await sendPost('/api/teams', { eventId, teamId: targetTid }, activeTok);
        } catch (teamErr) {
          if (teamErr.code === 'ONE_TEAM_PER_EVENT' || String(teamErr.message).includes('ONE_TEAM_PER_EVENT')) {
            const freshPersona = await readApiJson(
              await fetch('/api/auth/demo', {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ actorId: `aurora-plan-${tag}`, eventId, maxSize: 5 })
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

        const planSkills = Array.from(new Set(tasks.map(t => t.skill)));
        const nextCustom = saveCustomCrewOverlayEntry(eventId, targetTid, {
          mission: goalDescription,
          skills: planSkills,
          utcLabel: activeScenarioKey === 'baton' ? 'UTC-6 <-> UTC+5:30 Baton' : 'Verified Schedule',
          utcBucket: activeScenarioKey === 'baton' ? 'baton' : 'americas',
          scenarioKey: activeScenarioKey
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
        setIssuedInvite({ ...inv, teamId: targetTid, eventId, issuedBy: activeLead });
        setInviteCode(inv.code);
        setPageIndex(0);
        await refreshBoard();
        await inspectTeam(targetTid, true);
        const aud = await sendGetAuth(`/api/events/${encodeURIComponent(eventId)}/audit`, activeTok);
        setAuditRows(aud.audit || []);
        setActiveView('authority');
        setStatusMessage(
          `Confirmed by server: created team '${targetTid}' and generated a single-use invite in Step 3.`
        );
        notifyToast(`Created team '${targetTid}' & single-use invite on server!`, 'ok');
      } catch (e) {
        if (e?.status === 401 || e?.message === 'UNAUTHORIZED') throw e;
        setStatusMessage(`Create team failed: ${e.message}`);
        notifyToast(`Could not create team: ${e.message}`, 'err');
      } finally {
        setLockingPlan(false);
      }
    });
  }

  function handleCheckFitCrew(crewProfile) {
    const sc = MISSION_SCENARIOS[crewProfile.scenarioKey] || MISSION_SCENARIOS.baton;
    setEvaluatingCrewId(crewProfile.teamId);
    setActiveScenarioKey(crewProfile.scenarioKey || 'baton');
    const customGoal = `[${crewProfile.teamId}] ${crewProfile.mission}`;
    setGoalDescription(customGoal);
    setHorizonHours(sc.horizonHours);
    setTasks(sc.tasks);
    setTeamPeople(sc.teamPeople);
    setCandidates(sc.candidates);
    setBeforeSnapshot(null);
    setActiveView('architect');
    triggerHorizonPulse();
    runSolveAndRecommend({
      goalDescription: customGoal,
      horizonHours: sc.horizonHours,
      tasks: sc.tasks,
      teamPeople: sc.teamPeople,
      candidates: sc.candidates,
      crewId: crewProfile.teamId,
      resetComparison: true,
      toastMessage: `Previewing '${crewProfile.teamId}' in Step 2 (preview only - not joined yet)`
    });
  }

  function handleRequestSeatForTeam(tid) {
    setTeamId(tid);
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

  async function handleCreateTeam(customMeta = {}) {
    try {
      await runProtectedAction(`Create Team (${teamId})`, async (freshTok, freshActor) => {
        const res = await sendPost('/api/teams', { eventId, teamId }, freshTok);
        if (customMeta && (customMeta.mission || customMeta.skills)) {
          const nextCustom = saveCustomCrewOverlayEntry(eventId, res.teamId || teamId, {
            mission: customMeta.mission,
            skills: customMeta.skills
          });
          setCustomCrewMap(nextCustom);
        }
        setStatusMessage(
          `Confirmed by server: created team '${res.teamId}' led by '${freshActor || actorRef.current}'.`
        );
        notifyToast(`Confirmed by server: created team '${res.teamId}'`, 'ok');
        await refreshBoard();
        await inspectTeam(teamId, true);
        await loadAudit(freshTok);
      });
    } catch (e) {
      setStatusMessage(`Create team: ${e.message}`);
      notifyToast(`Could not create team: ${e.message}`, 'err');
    }
  }

  async function handleCreateInvite() {
    try {
      await runProtectedAction(`Create Invite (${teamId})`, async (freshTok, freshActor) => {
        const expiresAt = Date.now() + 600000;
        const res = await sendPost('/api/invitations', { eventId, teamId, expiresAt }, freshTok);
        const activeLead = freshActor || actorRef.current || actorId || 'leader';
        setIssuedInvite({ ...res, teamId, eventId, issuedBy: activeLead });
        setInviteCode(res.code);
        setStatusMessage(`Confirmed by server: created single-use invite for '${teamId}' (expires in 10m).`);
        notifyToast(`Created single-use invite for '${teamId}'.`, 'ok');
        await loadAudit(freshTok);
      });
    } catch (e) {
      setStatusMessage(`Invite: ${e.message}`);
      notifyToast(`Could not create invite: ${e.message}`, 'err');
    }
  }

  async function handleClaimAsFreshCandidate() {
    if (joiningLock.current || !inviteCode) return;
    joiningLock.current = true;
    setJoining(true);
    try {
      const suffix = String(Date.now()).slice(-4);
      const freshCandidateId = `priya-claim-${suffix}`;
      let claimantTok = '';
      let claimantActor = freshCandidateId;

      try {
        const candSession = await readApiJson(
          await fetch('/api/auth/demo', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ actorId: freshCandidateId, eventId, maxSize: 5 })
          })
        );
        claimantTok = candSession.token;
        claimantActor = candSession.actorId;
        signedOutManuallyRef.current = false;
        tokenRef.current = claimantTok;
        actorRef.current = claimantActor;
        setToken(claimantTok);
        setActorId(claimantActor);
      } catch {
        await runProtectedAction(`Join ${teamId} as Invited Teammate`, async (replayedTok, replayedActor) => {
          const op = await getOrCreateClaimOperation({
            eventId,
            teamId,
            code: inviteCode,
            store: sessionStorage
          });
          const res = await sendPost(
            '/api/invitations/claim',
            { eventId, teamId, code: inviteCode, opId: op.opId },
            replayedTok
          );
          if (res.status === 'COMMITTED') finishClaimOperation(sessionStorage, op.key);
          setStatusMessage(`Confirmed by server: '${replayedActor || res.actorId}' joined '${res.teamId}'.`);
          notifyToast(`Confirmed by server: joined '${res.teamId}'!`, 'ok');
          await refreshBoard();
          await inspectTeam(teamId, true);
          await loadAudit(replayedTok);
        });
        return;
      }

      const operation = await getOrCreateClaimOperation({
        eventId,
        teamId,
        code: inviteCode,
        store: sessionStorage
      });

      if (wanOffline) {
        setQueuedClaim({
          eventId,
          teamId,
          code: inviteCode,
          opId: operation.opId,
          key: operation.key,
          actorId: claimantActor,
          claimantToken: claimantTok
        });
        setRelayedReceipt(null);
        setReplayReceipt(null);
        setStatusMessage(`Saved on this device. Waiting to send (${claimantActor} -> ${teamId}).`);
        notifyToast('Saved on this device. Waiting to send.', 'warn');
        return;
      }

      const result = await sendPost(
        '/api/invitations/claim',
        { eventId, teamId, code: inviteCode, opId: operation.opId },
        claimantTok
      );
      if (result.status === 'COMMITTED') {
        finishClaimOperation(sessionStorage, operation.key);
      }
      setQueuedClaim(null);
      setStatusMessage(`Confirmed by server: '${claimantActor}' joined '${result.teamId}'.`);
      notifyToast(`Confirmed by server: '${claimantActor}' joined '${result.teamId}'!`, 'ok');
      await refreshBoard();
      await inspectTeam(teamId, true);
      await loadAudit(claimantTok);
    } catch (e) {
      setStatusMessage(`Join request: ${e.message}`);
      notifyToast(`Join request turned away: ${e.message}`, 'err');
    } finally {
      joiningLock.current = false;
      setJoining(false);
    }
  }

  async function handleJoinSeat() {
    if (joiningLock.current) return;
    joiningLock.current = true;
    setJoining(true);
    try {
      await runProtectedAction(`Join ${teamId}`, async (freshTok, freshActor) => {
        const useTok = await ensureToken(freshTok);
        const operation = await getOrCreateClaimOperation({
          eventId,
          teamId,
          code: inviteCode,
          store: sessionStorage
        });

        if (wanOffline) {
          if (!useTok) {
            const unauth = new Error('UNAUTHORIZED');
            unauth.status = 401;
            throw unauth;
          }
          setQueuedClaim({
            eventId,
            teamId,
            code: inviteCode,
            opId: operation.opId,
            key: operation.key,
            actorId: freshActor || actorRef.current || 'builder-priya',
            claimantToken: useTok
          });
          setRelayedReceipt(null);
          setReplayReceipt(null);
          setStatusMessage('Saved on this device. Waiting to send (not joined on server yet).');
          notifyToast('Saved on this device. Waiting to send.', 'warn');
          return;
        }

        const result = await sendPost(
          '/api/invitations/claim',
          {
            eventId,
            teamId,
            code: inviteCode,
            opId: operation.opId
          },
          useTok
        );
        if (result.status === 'COMMITTED') {
          finishClaimOperation(sessionStorage, operation.key);
        }
        if (result.replayed) {
          setReplayReceipt(result);
        }
        setQueuedClaim(null);
        setStatusMessage(
          result.replayed
            ? `The server returned the original result for '${result.actorId}' on '${result.teamId}' (0 duplicates).`
            : `Confirmed by server: '${result.actorId}' joined '${result.teamId}'.`
        );
        notifyToast(
          result.replayed
            ? 'The server returned the original result for this request.'
            : `Confirmed by server: '${result.actorId}' joined '${result.teamId}'!`,
          'ok'
        );
        await refreshBoard();
        await inspectTeam(teamId, true);
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
    if (!queuedClaim) return;
    try {
      await runProtectedAction('Send Request Through Mateo', async freshTok => {
        const claimantTok = queuedClaim.claimantToken || (await ensureToken(freshTok));
        let useRelayTok = relayToken;
        if (!useRelayTok) {
          try {
            const relay = await readApiJson(
              await fetch('/api/auth/demo', {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ actorId: 'relay-mateo', eventId: queuedClaim.eventId, maxSize: 5 })
              })
            );
            useRelayTok = relay.token;
            setRelayToken(useRelayTok);
          } catch {
            useRelayTok = claimantTok;
          }
        }

        const res = await sendPost(
          '/api/peer/relay-claim',
          {
            claimantToken: claimantTok,
            eventId: queuedClaim.eventId,
            teamId: queuedClaim.teamId,
            code: queuedClaim.code,
            opId: queuedClaim.opId
          },
          useRelayTok
        );
        setRelayedReceipt(res);
        setStatusMessage(
          `Sent through Mateo. Confirmed by server for '${res.actorId}' on '${res.teamId}'. Now run Step 3 to reconnect.`
        );
        notifyToast('Sent through Mateo. Confirmed by server!', 'ok');
      });
    } catch (e) {
      setStatusMessage(`Forwarding failed: ${e.message}`);
      notifyToast(`Forwarding failed: ${e.message}`, 'err');
    }
  }

  async function handleReconnectAndRetryDirect() {
    const targetClaim = queuedClaim;
    setWanOffline(false);
    setAuthorityHealth('online');
    if (!targetClaim) {
      notifyToast('Reconnected to server.', 'ok');
      refreshBoard();
      return;
    }

    try {
      await runProtectedAction('Reconnect & Check Original Request', async freshTok => {
        const result = await sendPost(
          '/api/invitations/claim',
          {
            eventId: targetClaim.eventId,
            teamId: targetClaim.teamId,
            code: targetClaim.code,
            opId: targetClaim.opId
          },
          targetClaim.claimantToken || freshTok
        );
        if (result.status === 'COMMITTED') {
          finishClaimOperation(sessionStorage, targetClaim.key);
        }
        setReplayReceipt(result);
        setQueuedClaim(null);
        setStatusMessage('The server returned the original result for this request (0 duplicate spots).');
        notifyToast('The server returned the original result for this request!', 'ok');
        await refreshBoard();
        await inspectTeam(targetClaim.teamId, true);
        await loadAudit(targetClaim.claimantToken || freshTok);
      });
    } catch (e) {
      setStatusMessage(`Reconnect check: ${e.message}`);
      notifyToast(`Reconnect check failed: ${e.message}`, 'err');
    }
  }

  async function handleAutoSetupRelayDemo() {
    try {
      await runProtectedAction('Prepare Example Team', async freshTok => {
        const suffix = String(Date.now()).slice(-4);
        const demoTeam = `00-relay-crew-${suffix}`;
        const leadSession = await readApiJson(
          await fetch('/api/auth/demo', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ actorId: `aurora-lead-${suffix}`, eventId, maxSize: 5 })
          })
        );
        await sendPost('/api/teams', { eventId, teamId: demoTeam }, leadSession.token);
        const inv = await sendPost(
          '/api/invitations',
          { eventId, teamId: demoTeam, expiresAt: Date.now() + 600000 },
          leadSession.token
        );

        const priyaSession = await readApiJson(
          await fetch('/api/auth/demo', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ actorId: `priya-wan-${suffix}`, eventId, maxSize: 5 })
          })
        );
        const relaySession = await readApiJson(
          await fetch('/api/auth/demo', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ actorId: 'relay-mateo', eventId, maxSize: 5 })
          })
        );

        signedOutManuallyRef.current = false;
        tokenRef.current = priyaSession.token;
        actorRef.current = priyaSession.actorId;
        setActorId(priyaSession.actorId);
        setToken(priyaSession.token);
        setRelayToken(relaySession.token);
        setTeamId(demoTeam);
        setIssuedInvite({ ...inv, teamId: demoTeam, eventId, issuedBy: leadSession.actorId });
        setInviteCode(inv.code);
        setQueuedClaim(null);
        setRelayedReceipt(null);
        setReplayReceipt(null);
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
        const res = await sendPost('/api/teams/transfer', { eventId, teamId, newLeaderId }, freshTok);
        setStatusMessage(`Confirmed by server: '${res.leader}' is now team lead for '${teamId}'.`);
        notifyToast(`'${res.leader}' is now team lead for '${teamId}'.`, 'ok');
        await refreshBoard();
        await inspectTeam(teamId, true);
        await loadAudit(freshTok);
      });
    } catch (e) {
      setStatusMessage(`Transfer lead: ${e.message}`);
      notifyToast(`Could not transfer lead: ${e.message}`, 'err');
    }
  }

  async function handleLeaveTeam() {
    try {
      await runProtectedAction(`Leave Team (${teamId})`, async freshTok => {
        const res = await sendPost('/api/teams/leave', { eventId, teamId }, freshTok);
        setStatusMessage(
          res.leader
            ? `Confirmed by server: left '${teamId}'; '${res.leader}' is now team lead.`
            : `Confirmed by server: last member left '${teamId}'; empty team removed.`
        );
        notifyToast(
          res.leader
            ? `Left '${teamId}'; '${res.leader}' is now team lead.`
            : `Left '${teamId}'; empty team removed.`,
          'info'
        );
        if (res.status === 'TEAM_DELETED') setSelectedTeam(null);
        else await inspectTeam(teamId, true);
        await refreshBoard();
        await loadAudit(freshTok);
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

  // Immediate 1-click white-paper HTML download
  function handleDirectPlanDownload() {
    const res = triggerTeamPlanDownload({
      eventId,
      teamId,
      actorId,
      selectedTeam,
      goalDescription,
      horizonHours,
      tasks,
      teamPeople,
      plan,
      issuedInvite
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
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPaletteOpen(v => !v);
        return;
      }
      if (e.key === 'F1') {
        e.preventDefault();
        setWhyOpen(v => !v);
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
        if (e.key === '/') {
          e.preventDefault();
          setPaletteOpen(true);
        } else if (e.key === '?') {
          e.preventDefault();
          setWhyOpen(true);
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
    ergonomics.singleKeyShortcuts
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
      { id: 'v1', group: 'Steps', label: '1. Find teammates', shortcut: 'Alt+1', keywords: 'directory board search filter people', run: () => setActiveView('discover') },
      { id: 'v2', group: 'Steps', label: '2. Plan the work', shortcut: 'Alt+2', keywords: 'schedule timeline tasks timezones', run: () => setActiveView('architect') },
      { id: 'v3', group: 'Steps', label: '3. Manage your team', shortcut: 'Alt+3', keywords: 'invite join offline relay mateo', run: () => setActiveView('authority') },
      { id: 'v4', group: 'Steps', label: '4. Test the last spot', shortcut: 'Alt+4', keywords: 'race 50 benchmark speed', run: () => setActiveView('arena') },
      { id: 'sc-1', group: 'Example Plans', label: '1. Different time zones, clean handoff', keywords: 'baton timezone india arkansas priya', run: () => { setActiveView('architect'); selectScenario('baton'); } },
      { id: 'sc-2', group: 'Example Plans', label: '2. One person double-booked on two tasks', keywords: 'hall overload mateo simultaneous', run: () => { setActiveView('architect'); selectScenario('hall'); } },
      { id: 'sc-3', group: 'Example Plans', label: '3. Unverified skill: when backup covers it vs. quick check', keywords: 'omega voi unverified skill', run: () => { setActiveView('architect'); selectScenario('omega'); } },
      { id: 'sc-4', group: 'Example Plans', label: '4. Unblock early setup without replacing teammates', keywords: 'devops cloud setup prerequisite', run: () => { setActiveView('architect'); selectScenario('prereq'); } },
      { id: 'act-dl', group: 'Download & Print', label: 'Download Team Plan HTML (#FFFFFF white-paper file)', keywords: 'download html export file', run: () => handleDirectPlanDownload() },
      { id: 'act-charter', group: 'Download & Print', label: 'Preview / Print Team Plan PDF', keywords: 'pdf print preview charter', run: () => setCharterOpen(true) },
      { id: 'act-race', group: 'Live Tests', label: 'Run 50-person last-spot test', keywords: 'race 50 winner full', run: () => { setActiveView('arena'); handleRun50WayRace(); } },
      { id: 'act-relay', group: 'Live Tests', label: 'Prepare example team for offline request forwarding', keywords: 'offline outbox mateo reconnect', run: () => { setActiveView('authority'); handleAutoSetupRelayDemo(); } },
      { id: 'p-aurora', group: 'Switch Profile', label: 'Acting as: Aurora (Team lead)', keywords: 'aurora demo', run: () => switchPersona('leader-aurora') },
      { id: 'p-kai', group: 'Switch Profile', label: 'Acting as: Kai (Frontend)', keywords: 'kai demo', run: () => switchPersona('builder-kai') },
      { id: 'p-priya', group: 'Switch Profile', label: 'Acting as: Priya (Integration)', keywords: 'priya demo', run: () => switchPersona('builder-priya') },
      { id: 'sc-auto', group: 'Display & Scale', label: 'Scale: Auto (60% Desktop / 100% Mobile)', keywords: 'auto scale 60 100', run: () => setErgonomics(s => ({ ...s, scaleLocked: false, scale: '60' })) },
      { id: 'sc-60', group: 'Display & Scale', label: 'Scale: 60% Panorama', keywords: '60 panorama compact', run: () => setErgonomics(s => ({ ...s, scaleLocked: true, scale: '60' })) },
      { id: 'sc-100', group: 'Display & Scale', label: 'Scale: 100% Standard', keywords: '100 standard large', run: () => setErgonomics(s => ({ ...s, scaleLocked: true, scale: '100' })) },
      { id: 'th-moon', group: 'Display & Scale', label: 'Contrast: Moonlight Dark', keywords: 'dark moonlight default', run: () => setErgonomics(s => ({ ...s, theme: 'h4h-glass' })) },
      { id: 'th-hc', group: 'Display & Scale', label: 'Contrast: High Contrast', keywords: 'high contrast yellow white', run: () => setErgonomics(s => ({ ...s, theme: 'aaa-contrast' })) },
      { id: 'th-light', group: 'Display & Scale', label: 'Contrast: Moonlit Pearl (Light)', keywords: 'light pearl white', run: () => setErgonomics(s => ({ ...s, theme: 'warm-paper' })) },
      { id: 'open-studio', group: 'Display & Scale', label: 'Open Extended Display & Shortcut Studio', shortcut: 'Ctrl+Shift+A', keywords: 'accessibility studio', run: () => setStudioOpen(true) },
      { id: 'open-why', group: 'Help', label: 'Purpose-First Guide & Keyboard Shortcuts', shortcut: '?', keywords: 'help guide shortcuts', run: () => setWhyOpen(true) }
    ],
    [selectScenario, switchPersona, eventId, teamId, actorId, selectedTeam, goalDescription, horizonHours, tasks, teamPeople, plan, issuedInvite]
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

  const priyaBuilder = useMemo(() => findBuilderById('priya'), []);
  const priyaInCrew = useMemo(
    () => teamPeople.some(p => normalizeBuilderId(p.id) === 'priya'),
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

  const spotsUsed = selectedTeam ? selectedTeam.members.length : board[0]?.members ?? 1;
  const spotsMax = selectedTeam ? selectedTeam.maxSize : board[0]?.max_size ?? eventMaxSize ?? 5;
  const humanActorName = formatHumanActorName(actorId, Boolean(token));

  // CRR-07: Peripheral unresolved contour driven strictly by actual application state
  const col2HasUnresolved = plainVerdict.tone !== 'ok';
  const col3HasUnresolved = Boolean(wanOffline || queuedClaim);

  return (
    <div className="app-shell" onPointerMove={handleShellPointerMove}>
      <a href="#main-workspace" className="skip-link no-print">
        Skip to main content
      </a>

      {/* High-Visibility Center-Top Toast Pill (Theme-Aware --bg-toast-solid) */}
      {toast && (
        <div
          key={toast.key}
          role="status"
          aria-live="polite"
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

      {/* IDE-Style Top Header: Brand + Plain Subtitle, 4 Plain Tabs, and ONLY 3 Right-Side Controls */}
      <header className="top-command-header top-header no-print" role="banner">
        {/* 1. Brand & Compact Plain-Language Subtitle */}
        <div className="brand-cluster">
          <div className="brand-pill">
            <span className="brand-icon-wrap">
              <BrandMark size={19} />
            </span>
            <div className="brand-titles">
              <div className="pill-row brand-title-line">
                <h1 className="brand-h1" title="Post Sheet | Ability & Purpose Crew Network">
                  <span>Post Sheet</span>
                  <span className="brand-h1-sub"> · Crew Network</span>
                  <span className="sr-only"> | Ability &amp; Purpose Crew Network</span>
                </h1>
                <button
                  type="button"
                  className="why-inline-link"
                  onClick={() => setWhyOpen(true)}
                  title="Open Purpose-First guide & keyboard shortcuts (?)"
                >
                  <HelpIcon size={13} /> Guide
                </button>
              </div>
              <p className="brand-meta">
                Find people whose skills fit the work. Plan a team, manage membership, and test how the system handles a race for the last spot.
              </p>
            </div>
          </div>
        </div>

        {/* 2. 4 Plain-Language Step Tabs (Alt+1..4) */}
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
                  role="tab"
                  aria-selected={selected}
                  aria-controls={`panel-${tab.id}`}
                  tabIndex={selected ? 0 : -1}
                  className={`nav-tab ${selected ? 'active' : ''}`}
                  onClick={() => setActiveView(tab.id)}
                  onKeyDown={e => handleTabListKeyDown(e, idx)}
                  title={`${tab.num}. ${tab.label} (${tab.hotkey})`}
                >
                  <Icon size={14} />
                  <span className="tab-num">{tab.num}.</span>
                  <span className="tab-text">{tab.short}</span>
                </button>
              );
            })}
          </div>
        </nav>

        {/* 3. ONLY 3 Coding-App-Standard Controls on the Right */}
        <div className="header-right-cluster ide-three-controls">
          {/* Control 1: Acting as: <Name> ▾ */}
          <div className="ide-popover-anchor">
            <button
              type="button"
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

          {/* Control 2: Display & A11y: <Active Scale> ▾ */}
          <div className="ide-popover-anchor">
            <button
              type="button"
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

          {/* Control 3: Download Plan (Immediate 1-click #FFFFFF white-paper HTML download) */}
          <button
            type="button"
            className="btn btn-primary ide-header-btn"
            onClick={handleDirectPlanDownload}
            title="Download #FFFFFF white-paper Team Plan HTML file immediately"
          >
            <DownloadIcon size={14} />
            <span>Download Plan</span>
          </button>
        </div>
      </header>

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
            <div>
              <strong>Local Server (:8788) Offline:</strong> Plan schedule checks and teammate previews continue to run locally in <code>&lt;2ms</code>, while server team spots wait for connection.
            </div>
          </div>
          <button
            type="button"
            className="btn btn-primary btn-compact"
            disabled={retryingServer}
            onClick={retryServerConnection}
          >
            <RefreshIcon size={14} /> {retryingServer ? 'Reconnecting...' : 'Retry Server (:8788)'}
          </button>
        </div>
      )}

      {/* Main Full-Bleed Workspace (44fr / 28fr / 28fr on >=1100px Desktop Panorama) */}
      <div className={`workspace-layout no-print ${layoutClass}`}>
        <main
          id="main-workspace"
          tabIndex={-1}
          role="tabpanel"
          aria-labelledby={`tab-${activeView}`}
          className="main-surface"
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
              totalTeams={totalTeams}
              boardLatencyMs={boardLatencyMs}
              sseConnected={sseConnected}
              pageIndex={pageIndex}
              pageSize={pageSize}
              onPageChange={setPageIndex}
              onPageSizeChange={sz => {
                setPageSize(sz);
                setPageIndex(0);
              }}
              onRefreshBoard={() => refreshBoard(true)}
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
              onChangeTeamId={setTeamId}
              board={board}
              selectedTeam={selectedTeam}
              onInspectTeam={inspectTeam}
              inviteCode={inviteCode}
              onChangeInviteCode={setInviteCode}
              issuedInvite={issuedInvite}
              onCreateTeam={handleCreateTeam}
              onCreateInvite={handleCreateInvite}
              onJoinSeat={handleJoinSeat}
              joining={joining}
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
        </main>

        {/* COLUMN 2 (PANORAMA): Team Plan & Schedule */}
        {isPanoramaActive && !isMobileViewport && (
          <aside className="panorama-pane" aria-label="Team Plan and Schedule">
            <div
              className={`surface-card sticky-dock ${col2HasUnresolved ? 'has-unresolved-contour' : ''}`}
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
                role="status"
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
                {!priyaInCrew && priyaBuilder && activeScenarioKey === 'baton' && (
                  <button
                    type="button"
                    data-link-id="priya"
                    onMouseEnter={() => setActiveLinkId('priya')}
                    onMouseLeave={() => setActiveLinkId(null)}
                    className="dock-member-pill pill-suggest"
                    onClick={() => handleToggleBuilderInCrew(priyaBuilder)}
                  >
                    + Try Priya (UTC+5:30)
                  </button>
                )}
              </div>

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
                  const isLinked =
                    Boolean(activeLinkId) &&
                    (activeLinkId === t.id ||
                      (assigneeId && normalizeBuilderId(activeLinkId) === normalizeBuilderId(assigneeId)) ||
                      (!prevAsg && activeLinkId === 'priya' && t.skill === 'integrate'));

                  return (
                    <div
                      key={t.id}
                      data-link-id={t.id}
                      onMouseEnter={() => setActiveLinkId(assigneeId || t.id)}
                      onMouseLeave={() => setActiveLinkId(null)}
                      className={`mini-dag-row ${isLinked ? 'is-linked-ridge' : ''} ${
                        !prevAsg ? 'mini-dag-uncovered' : ''
                      }`}
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
                          ? `${asg.evidence === 'unknown' ? 'Unverified: ' : '✓ '}${asg.personId} (${asg.startMin}..${asg.endMin}m)`
                          : prevAsg
                            ? `${prevAsg.evidence === 'unknown' ? 'Unverified: ' : '✓ '}${prevAsg.personId} (Preview ${prevAsg.startMin}..${prevAsg.endMin}m)`
                            : `Uncovered - needs ${t.skill}`}
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
                    className="btn btn-primary btn-compact"
                    disabled={lockingPlan}
                    onClick={handleLockPlanAndMintInvite}
                  >
                    <ShieldCheckIcon size={14} />{' '}
                    {lockingPlan ? 'Creating...' : 'Create team & invite'}
                  </button>
                ) : !priyaInCrew && priyaBuilder && activeScenarioKey === 'baton' ? (
                  <button
                    type="button"
                    className="btn btn-primary btn-compact"
                    onClick={() => handleToggleBuilderInCrew(priyaBuilder)}
                  >
                    <PlusIcon size={14} /> Try Priya in plan
                  </button>
                ) : plan?.frontier?.voiQuestion ? (
                  <button
                    type="button"
                    className="btn btn-primary btn-compact"
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
                    className="btn btn-secondary btn-compact"
                    onClick={() => setActiveView('architect')}
                  >
                    Edit in Step 2
                  </button>
                )}

                <button
                  type="button"
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
              className={`surface-card sticky-dock ${col3HasUnresolved ? 'has-unresolved-contour' : ''}`}
            >
              {/* 3-Coordinate Network Continuity Header */}
              <div className="row-between wrap-gap">
                <div className="col3-network-strip small-copy">
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
                </div>

                <button
                  type="button"
                  className="btn btn-ghost btn-compact"
                  onClick={() => loadAudit(undefined, true)}
                  title="Refresh server activity"
                >
                  <RefreshIcon size={13} /> Sync
                </button>
              </div>

              <h2 className="card-subtitle top-gap-xs">Team Spots &amp; Server Result</h2>

              {/* Static Peripheral Memory Anchor (CRR-10) */}
              <div className="memory-anchor-bar tiny-copy muted-copy top-gap-xs">
                Active team: <code>{selectedTeam?.teamId || teamId}</code> · Acting as: <strong>{humanActorName}</strong>
              </div>

              {/* Confirmed Server Teams Quick List */}
              <div className="mini-board-list top-gap-xs">
                {board.slice(0, 4).map(t => {
                  const isLinked = activeLinkId === t.team_id;
                  return (
                    <button
                      key={t.team_id}
                      type="button"
                      data-link-id={t.team_id}
                      onMouseEnter={() => setActiveLinkId(t.team_id)}
                      onMouseLeave={() => setActiveLinkId(null)}
                      className={`mini-board-row ${isLinked ? 'is-linked-ridge' : ''}`}
                      onClick={() => handleRequestSeatForTeam(t.team_id)}
                    >
                      <span>{t.team_id}</span>
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
              >
                <button
                  type="button"
                  role="tab"
                  aria-selected={col3Tab === 'summary'}
                  className={`tab-pill ${col3Tab === 'summary' ? 'active' : ''}`}
                  onClick={() => handleSwitchCol3Tab('summary')}
                >
                  Activity Summary
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={col3Tab === 'proof'}
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
                        {plan?.frontier?.voiQuestion ? ` · VOI=${plan.frontier.voiQuestion.informationGainBits}b` : ''}
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
              <h3 className="card-subtitle">Plan &amp; Server Status</h3>

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
        onToggleSingleKeyShortcuts={() =>
          setErgonomics(s => ({ ...s, singleKeyShortcuts: !s.singleKeyShortcuts }))
        }
        onJumpToManageTeam={() => setActiveView('authority')}
        onOpenPalette={() => setPaletteOpen(true)}
        onOpenHelp={() => setWhyOpen(true)}
      />

      {/* Accessible Modals & Drawers */}
      <WhyPurposeFirstModal
        open={whyOpen}
        onClose={() => setWhyOpen(false)}
        onJumpScenario={scKey => {
          setActiveView('architect');
          selectScenario(scKey);
        }}
        onNavigate={view => setActiveView(view)}
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
        teamId={teamId}
        actorId={actorId}
        selectedTeam={selectedTeam}
        goalDescription={goalDescription}
        horizonHours={horizonHours}
        tasks={tasks}
        teamPeople={teamPeople}
        plan={plan}
        issuedInvite={issuedInvite}
        onNotify={notifyToast}
      />
    </div>
  );
}
