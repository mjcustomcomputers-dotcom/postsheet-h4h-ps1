import React, { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { getOrCreateClaimOperation, finishClaimOperation } from './claim-operation.js';
import {
  THEME_OPTIONS,
  loadErgonomics,
  saveErgonomics,
  applyErgonomicsToDocument
} from './ergonomics.js';
import {
  MISSION_SCENARIOS,
  visualTasksToApi,
  visualPeopleToApi,
  loadCustomCrewOverlay,
  saveCustomCrewOverlayEntry
} from './presets-and-catalog.js';
import {
  WhyPurposeFirstModal,
  AuthAccountModal,
  AccessibilityStudioDrawer,
  CommandPaletteModal
} from './components/Overlays.jsx';
import CrewCharterExportModal from './components/CrewCharterExportModal.jsx';
import EpistemicStencil from './components/EpistemicStencil.jsx';
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
  SlidersIcon,
  CommandIcon,
  UserIcon,
  HelpIcon,
  PaletteIcon,
  ColumnsIcon,
  RefreshIcon,
  FileTextIcon
} from './icons.jsx';

const PRIMARY_TABS = [
  { id: 'discover', num: '1', label: 'Discover Crews & Builders', short: 'Discover', hotkey: 'Alt+1', Icon: CompassIcon },
  { id: 'architect', num: '2', label: 'Mission & Ability Architect', short: 'Mission Architect', hotkey: 'Alt+2', Icon: GitBranchIcon },
  { id: 'authority', num: '3', label: 'Live Seat Authority & Peer Mesh', short: 'Seat & Peer Mesh', hotkey: 'Alt+3', Icon: ShieldCheckIcon },
  { id: 'arena', num: '4', label: 'Concurrency & Scale Proof Arena', short: 'Scale & Race Proof', hotkey: 'Alt+4', Icon: ZapIcon }
];

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
  // Ergonomics & Accessibility Studio State
  const [ergonomics, setErgonomics] = useState(() => loadErgonomics());
  const [activeView, setActiveView] = useState('discover');

  // Modals & Drawers
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

  // Mission & Ability Architect State (View 2)
  const [activeScenarioKey, setActiveScenarioKey] = useState('baton');
  const [omegaMode, setOmegaMode] = useState('contingent');
  const [goalDescription, setGoalDescription] = useState(MISSION_SCENARIOS.baton.goalDescription);
  const [horizonHours, setHorizonHours] = useState(MISSION_SCENARIOS.baton.horizonHours);
  const [tasks, setTasks] = useState(MISSION_SCENARIOS.baton.tasks);
  const [teamPeople, setTeamPeople] = useState(MISSION_SCENARIOS.baton.teamPeople);
  const [candidates, setCandidates] = useState(MISSION_SCENARIOS.baton.candidates);
  const [plan, setPlan] = useState(null);
  const [beforeSnapshot, setBeforeSnapshot] = useState(null);
  const lastBlockedSnapshotRef = useRef(null);
  const [recs, setRecs] = useState(null);
  const [solving, setSolving] = useState(false);
  const [lockingPlan, setLockingPlan] = useState(false);
  const [evaluatingCrewId, setEvaluatingCrewId] = useState(null);

  // Seat Authority & Peer Mesh State (View 3)
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

  // Concurrency & Scale Proof Arena State (View 4)
  const [raceReceipt, setRaceReceipt] = useState(null);
  const [runningRace, setRunningRace] = useState(false);
  const [probeStats, setProbeStats] = useState(null);
  const [probingLatency, setProbingLatency] = useState(false);

  // Global Polite Status & Authority Health
  const [statusMessage, setStatusMessage] = useState(
    'Ready. Browse live SQLite crews, model a mission DAG, test WAN-drop peer relay, or fire the 50-claimant race.'
  );
  const [authorityHealth, setAuthorityHealth] = useState('checking'); // 'online' | 'wan-dropped' | 'unreachable' | 'checking'
  const tabRefs = useRef({});

  // Apply Ergonomics to <html> and persist
  useEffect(() => {
    applyErgonomicsToDocument(ergonomics);
    saveErgonomics(ergonomics);
  }, [ergonomics]);

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
        // When PS1_DEMO_AUTH=0, return empty so protected endpoint returns HTTP 401 and opens AuthAccountModal
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

  const runProtectedAction = useCallback(async (label, actionFn) => {
    try {
      return await actionFn(tokenRef.current, actorRef.current);
    } catch (err) {
      if (err?.status === 401 || err?.message === 'UNAUTHORIZED') {
        tokenRef.current = '';
        setToken('');
        pendingAuthReplayRef.current = { label, actionFn };
        setAuthPromptMessage(
          `HTTP 401 UNAUTHORIZED while attempting "${label}". Sign in, register a salted scrypt account, or select a Judge Persona below; "${label}" will replay automatically.`
        );
        setAuthModalOpen(true);
        setStatusMessage(`AUTH REQUIRED (401) | Queued "${label}" for immediate replay upon sign-in.`);
        return null;
      }
      throw err;
    }
  }, []);

  const replayPendingAuthAction = useCallback(async (freshToken, freshActor) => {
    const pending = pendingAuthReplayRef.current;
    if (!pending) return;
    pendingAuthReplayRef.current = null;
    setAuthPromptMessage('');
    try {
      await pending.actionFn(freshToken, freshActor);
    } catch (err) {
      setStatusMessage(`REPLAY (${pending.label}) | ${err.message}`);
    }
  }, []);

  // Board refresh with live latency measurement
  const refreshBoard = useCallback(async () => {
    if (wanOffline) {
      setAuthorityHealth('wan-dropped');
      return;
    }
    if (!/^[A-Za-z0-9_.:@-]{1,128}$/.test(eventId)) {
      setAuthorityHealth('unreachable');
      return;
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
    } catch (e) {
      setAuthorityHealth('unreachable');
      setStatusMessage(`BOARD | ${e.message}`);
    }
  }, [eventId, pageIndex, pageSize, wanOffline]);

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

  // Auto-bootstrap judge persona & initial solver witness on first mount
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
            label: `Baseline roster (${sc.teamPeople.map(p => p.id).join(', ')})`
          };
        }
      } catch {
        // Graceful fallback when PS1_DEMO_AUTH=0
      }
    })();
  }, []);

  // Persona & Account Auth Handlers
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
        setStatusMessage(`AUTH | Active persona switched to '${main.actorId}' (peer relay 'relay-mateo' armed).`);
        refreshBoard();
        await replayPendingAuthAction(main.token, main.actorId);
        return true;
      } catch (e) {
        setStatusMessage(`AUTH | ${e.message} (Sign in or register via Account modal when PS1_DEMO_AUTH=0).`);
        setAuthModalOpen(true);
        return false;
      }
    },
    [eventId, refreshBoard, replayPendingAuthAction]
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
      `AUTH | ${mode === 'register' ? 'Registered salted scrypt account' : 'Signed in'} as '${res.actorId}'.`
    );
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
      setStatusMessage('AUTH | Session token revoked in SQLite ps1_revoked_tokens.');
    } catch (e) {
      tokenRef.current = '';
      actorRef.current = '';
      setActorId('');
      setToken('');
      setStatusMessage(`AUTH | Signed out (${e.message}).`);
    }
  }

  // Event Scope Handlers
  async function handleEnsureEvent(nextEv) {
    if (!/^[A-Za-z0-9_.:@-]{1,128}$/.test(nextEv)) {
      setStatusMessage('EVENT | Invalid event identifier.');
      return;
    }
    try {
      await runProtectedAction(`Create/Switch Event Scope (${nextEv})`, async freshTok => {
        await sendPost('/api/events', { eventId: nextEv, maxSize: 5 }, freshTok);
        setEventId(nextEv);
        setPageIndex(0);
        setSelectedTeam(null);
        setStatusMessage(`EVENT | Active event scope set to '${nextEv}'.`);
      });
    } catch (e) {
      setEventId(nextEv);
      setPageIndex(0);
      setStatusMessage(`EVENT | Switched scope to '${nextEv}' (${e.message}).`);
    }
  }

  function handleChangeEventScope(nextEv) {
    handleEnsureEvent(nextEv);
  }

  // Spawn 3 real open-seat SQLite crews at top of Page 1
  async function spawnShowcaseCrews() {
    await runProtectedAction('Spawn 3 Open-Seat Showcase Crews', async freshTok => {
      setSpawningDemo(true);
      try {
        await sendPost('/api/events', { eventId, maxSize: 5 }, freshTok);
        const tag = String(Date.now()).slice(-4);
        const specs = [
          {
            tid: `00-open-baton-${tag}`,
            lead: `lead-baton-${tag}`,
            extraCount: 1,
            mission: 'Async Hot Springs (UTC-6) <-> Bengaluru (UTC+5:30) Mesh API & Accessible UI',
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
            mission: 'Scarce final-seat WCAG 2.2 AAA lab notebook & tactile schedule verifier',
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
            // Fallback when PS1_DEMO_AUTH=0: create open showcase crew with authenticated judge session
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
        setStatusMessage(
          `BOARD | Spawned ${spawnedCount} live SQLite open-seat showcase ${
            spawnedCount === 1 ? 'crew' : 'crews'
          } on Page 1 of '${eventId}'.`
        );
      } catch (e) {
        if (e?.status === 401 || e?.message === 'UNAUTHORIZED') throw e;
        setStatusMessage(`SPAWN | ${e.message}`);
      } finally {
        setSpawningDemo(false);
      }
    });
  }

  // Mission Architect Solver Execution
  const runSolveAndRecommend = useCallback(
    async (overrides = {}) => {
      const useGoal = overrides.goalDescription ?? goalDescription;
      const useHours = overrides.horizonHours ?? horizonHours;
      const useTasks = overrides.tasks ?? tasks;
      const useTeam = overrides.teamPeople ?? teamPeople;
      const useCands = overrides.candidates ?? candidates;
      const useCrewTag = overrides.crewId !== undefined ? overrides.crewId : evaluatingCrewId;
      const resetComparison = Boolean(overrides.resetComparison);

      const horizonMin = Math.max(60, Math.round(Number(useHours || 4) * 60));
      const goalPayload = {
        id: 'mission-goal',
        description: useGoal,
        startMin: 0,
        deadlineMin: horizonMin,
        tasks: visualTasksToApi(useTasks)
      };

      await runProtectedAction('Evaluate Critical-Path Plan (/api/plan)', async freshTok => {
        setSolving(true);
        try {
          const [planRes, recRes] = await Promise.all([
            sendPost(
              '/api/plan',
              {
                goal: goalPayload,
                people: visualPeopleToApi(useTeam, horizonMin),
                maxNodes: 5000
              },
              freshTok
            ),
            sendPost(
              '/api/recommendations',
              {
                goal: goalPayload,
                teamPeople: visualPeopleToApi(useTeam, horizonMin),
                candidates: visualPeopleToApi(useCands, horizonMin)
              },
              freshTok
            )
          ]);

          if (resetComparison) {
            setBeforeSnapshot(null);
            if (planRes.status !== 'FEASIBLE_WITNESS') {
              lastBlockedSnapshotRef.current = {
                plan: planRes,
                tasks: useTasks,
                horizonMin,
                label: `Baseline (${useTeam.map(p => p.id).join(', ')})`
              };
            } else {
              lastBlockedSnapshotRef.current = null;
            }
          } else if (planRes.status !== 'FEASIBLE_WITNESS') {
            lastBlockedSnapshotRef.current = {
              plan: planRes,
              tasks: useTasks,
              horizonMin,
              label: `Blocked state (${useTeam.map(p => p.id).join(', ')})`
            };
            setBeforeSnapshot(null);
          } else if (
            lastBlockedSnapshotRef.current &&
            (lastBlockedSnapshotRef.current.tasks || []).length === useTasks.length
          ) {
            setBeforeSnapshot(lastBlockedSnapshotRef.current);
          }

          setPlan(planRes);
          setRecs(recRes);
          if (useCrewTag) {
            setVerifiedCrewMap(prev => ({
              ...prev,
              [`${eventId}::${useCrewTag}`]: planRes.status,
              [useCrewTag]: planRes.status
            }));
          }
          setStatusMessage(
            `SOLVER | ${planRes.status} (${planRes.classification}) · Quantifier: ${
              planRes.frontier?.quantifierStatus || 'BOUNDED'
            } · Ranked ${recRes.recommendations?.length || 0} complementary builders.`
          );
        } catch (e) {
          if (e?.status === 401 || e?.message === 'UNAUTHORIZED') throw e;
          setPlan(null);
          setRecs(null);
          setStatusMessage(`SOLVER | ${e.message}`);
        } finally {
          setSolving(false);
        }
      });
    },
    [goalDescription, horizonHours, tasks, teamPeople, candidates, evaluatingCrewId, eventId, sendPost, runProtectedAction]
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
      runSolveAndRecommend({
        goalDescription: sc.goalDescription,
        horizonHours: sc.horizonHours,
        tasks: sc.tasks,
        teamPeople: sc.teamPeople,
        candidates: sc.candidates,
        crewId: null,
        resetComparison: true
      });
    },
    [runSolveAndRecommend]
  );

  function handleToggleOmegaMode(nextMode) {
    const sc = MISSION_SCENARIOS.omega;
    setOmegaMode(nextMode);
    const nextRoster = nextMode === 'robust' ? sc.robustTeamPeople : sc.teamPeople;
    setTeamPeople(nextRoster);
    runSolveAndRecommend({
      goalDescription: sc.goalDescription,
      horizonHours: sc.horizonHours,
      tasks: sc.tasks,
      teamPeople: nextRoster,
      candidates: sc.candidates
    });
  }

  function handleAddCandidateToTeam(candId) {
    const found = candidates.find(c => c.id === candId);
    if (!found) return;
    const nextTeam = [...teamPeople, found];
    const nextCands = candidates.filter(c => c.id !== candId);
    setTeamPeople(nextTeam);
    setCandidates(nextCands);
    runSolveAndRecommend({ teamPeople: nextTeam, candidates: nextCands });
  }

  function handleVerifyPersonSkill(personId, skillId) {
    const nextTeam = teamPeople.map(p =>
      p.id === personId ? { ...p, skills: { ...(p.skills || {}), [skillId]: 'supported' } } : p
    );
    setTeamPeople(nextTeam);
    runSolveAndRecommend({ teamPeople: nextTeam });
  }

  // Cross-View Actions
  async function inspectTeam(tid) {
    try {
      const detail = await readApiJson(
        await fetch(`/api/events/${encodeURIComponent(eventId)}/teams/${encodeURIComponent(tid)}`, {
          cache: 'no-store'
        })
      );
      setSelectedTeam(detail);
      setTeamId(tid);
      setStatusMessage(`ROSTER | Loaded ${detail.members.length}/${detail.maxSize} members for '${tid}'.`);
    } catch (e) {
      setSelectedTeam(null);
      setStatusMessage(`ROSTER | ${e.message}`);
    }
  }

  // View 2 -> View 3: Lock Feasible Plan, Create Crew & Mint Single-Use Invite
  async function handleLockPlanAndMintInvite() {
    await runProtectedAction('Lock Feasible Plan & Mint Invite', async freshTok => {
      setLockingPlan(true);
      try {
        await sendPost('/api/events', { eventId, maxSize: 5 }, freshTok);
        const tag = String(Date.now()).slice(-4);
        let targetTid = `00-feasible-${tag}`;
        let activeTok = freshTok;
        let activeLead = actorRef.current || 'leader-aurora';

        try {
          await sendPost('/api/teams', { eventId, teamId: targetTid }, activeTok);
        } catch (teamErr) {
          if (teamErr.code === 'ONE_TEAM_PER_EVENT' || String(teamErr.message).includes('ONE_TEAM_PER_EVENT')) {
            // Mint a fresh demo leader persona so repeated locks always create a clean crew
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
          utcLabel: activeScenarioKey === 'baton' ? 'UTC-6 <-> UTC+5:30 Baton' : 'Verified Critical-Path Schedule',
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
        setIssuedInvite(inv);
        setInviteCode(inv.code);
        setPageIndex(0);
        await refreshBoard();
        await inspectTeam(targetTid);
        const aud = await sendGetAuth(`/api/events/${encodeURIComponent(eventId)}/audit`, activeTok);
        setAuditRows(aud.audit || []);
        setActiveView('authority');
        setStatusMessage(
          `PLAN LOCKED -> VIEW 3 | Created crew '${targetTid}' (${activeLead}) and minted single-use SHA-256 invite token.`
        );
      } catch (e) {
        if (e?.status === 401 || e?.message === 'UNAUTHORIZED') throw e;
        setStatusMessage(`LOCK PLAN | ${e.message}`);
      } finally {
        setLockingPlan(false);
      }
    });
  }

  function handleCheckFitCrew(crewProfile) {
    const sc = MISSION_SCENARIOS[crewProfile.scenarioKey] || MISSION_SCENARIOS.baton;
    setEvaluatingCrewId(crewProfile.teamId);
    setActiveScenarioKey(crewProfile.scenarioKey);
    const customGoal = `[${crewProfile.teamId}] ${crewProfile.mission}`;
    setGoalDescription(customGoal);
    setHorizonHours(sc.horizonHours);
    setTasks(sc.tasks);
    setTeamPeople(sc.teamPeople);
    setCandidates(sc.candidates);
    setBeforeSnapshot(null);
    setActiveView('architect');
    runSolveAndRecommend({
      goalDescription: customGoal,
      horizonHours: sc.horizonHours,
      tasks: sc.tasks,
      teamPeople: sc.teamPeople,
      candidates: sc.candidates,
      crewId: crewProfile.teamId,
      resetComparison: true
    });
  }

  function handleRequestSeatForTeam(tid) {
    setTeamId(tid);
    inspectTeam(tid);
    setActiveView('authority');
  }

  function handleSendBuilderToArchitect(builder) {
    const existsInTeam = teamPeople.some(p => p.id === builder.id);
    const existsInCands = candidates.some(p => c.id === builder.id);
    let nextCands = candidates;
    if (!existsInTeam && !existsInCands) {
      nextCands = [
        {
          id: builder.id,
          timezone: builder.timezone,
          startMin: builder.startMin,
          endMin: builder.endMin,
          skills: { ...builder.skills }
        },
        ...candidates
      ];
      setCandidates(nextCands);
    }
    setActiveView('architect');
    runSolveAndRecommend({ candidates: nextCands });
  }

  // View 3: Seat Authority & Peer Mesh Handlers
  const loadAudit = useCallback(
    async overrideTok => {
      try {
        await runProtectedAction('Load Attributable Audit Log', async freshTok => {
          const aud = await sendGetAuth(
            `/api/events/${encodeURIComponent(eventId)}/audit`,
            overrideTok || freshTok
          );
          setAuditRows(aud.audit || []);
          setStatusMessage(`AUDIT | Loaded ${aud.audit?.length || 0} attributable SQLite audit entries.`);
        });
      } catch (e) {
        setStatusMessage(`AUDIT | ${e.message}`);
      }
    },
    [eventId, runProtectedAction, sendGetAuth]
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
          `AUTHORITY | Created team '${res.teamId}' with leader '${freshActor || actorRef.current}' and saved custom mission to Discover overlay.`
        );
        await refreshBoard();
        await inspectTeam(teamId);
        await loadAudit(freshTok);
      });
    } catch (e) {
      setStatusMessage(`CREATE TEAM | ${e.message}`);
    }
  }

  async function handleCreateInvite() {
    try {
      await runProtectedAction(`Issue Single-Use Invite (${teamId})`, async freshTok => {
        const expiresAt = Date.now() + 600000;
        const res = await sendPost('/api/invitations', { eventId, teamId, expiresAt }, freshTok);
        setIssuedInvite(res);
        setInviteCode(res.code);
        setStatusMessage(`INVITE | Minted single-use SHA-256 hashed invitation for '${teamId}' (10m TTL).`);
        await loadAudit(freshTok);
      });
    } catch (e) {
      setStatusMessage(`INVITE | ${e.message}`);
    }
  }

  async function handleJoinSeat() {
    if (joiningLock.current) return;
    joiningLock.current = true;
    setJoining(true);
    try {
      await runProtectedAction(`Claim Seat on ${teamId}`, async (freshTok, freshActor) => {
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
          setStatusMessage(
            `LOCAL OUTBOX | Direct WAN is offline. Retained SHA-256 opId '${operation.opId}' in Pending Relay Outbox (seat NOT yet confirmed).`
          );
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
          `AUTHORITY | ${result.status} for '${result.actorId}' on '${result.teamId}'${
            result.replayed ? ' (replayed: true - idempotent recovery, 0 duplicate rows!)' : ' (fresh seat committed)'
          }.`
        );
        await refreshBoard();
        await inspectTeam(teamId);
        await loadAudit(useTok);
      });
    } catch (e) {
      setStatusMessage(`CLAIM | ${e.message} (opId preserved in sessionStorage for safe retry).`);
    } finally {
      joiningLock.current = false;
      setJoining(false);
    }
  }

  async function handleForwardViaPeer() {
    if (!queuedClaim) return;
    try {
      await runProtectedAction('Forward Signed Claim via Peer Relay', async freshTok => {
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
          `PEER RELAY -> LAYER A | ${res.status} for '${res.actorId}' forwarded via '${res.relayedBy}' (opId '${res.opId}'). Now click Step 3 to restore WAN & verify replayed: true!`
        );
      });
    } catch (e) {
      setStatusMessage(`PEER RELAY | ${e.message}`);
    }
  }

  async function handleReconnectAndRetryDirect() {
    const targetClaim = queuedClaim;
    setWanOffline(false);
    setAuthorityHealth('online');
    if (!targetClaim) return;

    try {
      await runProtectedAction('Idempotent Reconnect Claim Replay', async freshTok => {
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
        setStatusMessage(
          `IDEMPOTENT RECOVERY | Direct WAN restored -> Layer A returned ${result.status} (replayed: ${result.replayed}) with zero duplicate seat rows!`
        );
        await refreshBoard();
        await inspectTeam(targetClaim.teamId);
        await loadAudit(targetClaim.claimantToken || freshTok);
      });
    } catch (e) {
      setStatusMessage(`RETRY | ${e.message}`);
    }
  }

  async function handleAutoSetupRelayDemo() {
    try {
      await runProtectedAction('Auto-Prep WAN-Drop Relay Theater', async freshTok => {
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
        setIssuedInvite(inv);
        setInviteCode(inv.code);
        setQueuedClaim(null);
        setRelayedReceipt(null);
        setReplayReceipt(null);
        await inspectTeam(demoTeam);
        setWanOffline(true);
        setAuthorityHealth('wan-dropped');
        setStatusMessage(
          `THEATER ARMED | Created '${demoTeam}', issued single-use invite, switched to '${priyaSession.actorId}', and simulated WAN drop. Click Step 1B -> Step 2 -> Step 3!`
        );
        return freshTok;
      });
    } catch (e) {
      setStatusMessage(`THEATER PREP | ${e.message}`);
    }
  }

  async function handleTransferLeader(newLeaderId) {
    try {
      await runProtectedAction(`Transfer Leadership to ${newLeaderId}`, async freshTok => {
        const res = await sendPost('/api/teams/transfer', { eventId, teamId, newLeaderId }, freshTok);
        setStatusMessage(`LEADER TRANSFER | ${res.status}: '${res.leader}' now leads '${teamId}'.`);
        await refreshBoard();
        await inspectTeam(teamId);
        await loadAudit(freshTok);
      });
    } catch (e) {
      setStatusMessage(`TRANSFER | ${e.message}`);
    }
  }

  async function handleLeaveTeam() {
    try {
      await runProtectedAction(`Leave Team (${teamId})`, async freshTok => {
        const res = await sendPost('/api/teams/leave', { eventId, teamId }, freshTok);
        setStatusMessage(
          `DEPARTURE | ${res.status}${
            res.leader ? ` (deterministic succession -> '${res.leader}')` : ' (final member left -> team auto-deleted)'
          }.`
        );
        if (res.status === 'TEAM_DELETED') setSelectedTeam(null);
        else await inspectTeam(teamId);
        await refreshBoard();
        await loadAudit(freshTok);
      });
    } catch (e) {
      setStatusMessage(`LEAVE | ${e.message}`);
    }
  }

  async function handleLoadPeerNotes(overrideTok) {
    try {
      await runProtectedAction('Sync Encrypted Layer-B Notes', async freshTok => {
        const list = await sendGetAuth(
          `/api/peer/notes?eventId=${encodeURIComponent(eventId)}`,
          overrideTok || freshTok
        );
        setPeerNotes(list.notes || []);
      });
    } catch (e) {
      setStatusMessage(`LAYER B | ${e.message}`);
    }
  }

  async function handleSendPeerNote() {
    try {
      await runProtectedAction('Seal & Broadcast Encrypted Peer Note', async freshTok => {
        const opId = 'note-' + crypto.randomUUID().slice(0, 12);
        const res = await sendPost('/api/peer/notes', { eventId, opId, text: peerNoteText, epoch: 1 }, freshTok);
        await handleLoadPeerNotes(freshTok);
        setStatusMessage(
          `LAYER B | Sealed AES-256-GCM + P-256 note (${res.transportStatus}) SHA-256=${res.digest.slice(0, 16)}...`
        );
      });
    } catch (e) {
      setStatusMessage(`LAYER B | ${e.message}`);
    }
  }

  async function handleRunGluePreset(preset) {
    try {
      await runProtectedAction(`Sheaf Context Glue (${preset})`, async freshTok => {
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
        const res = await sendPost('/api/peer/glue', { localRecords, peerRecords }, freshTok);
        setGlueResult(res);
        setStatusMessage(`SHEAF GLUE | ${res.status} (${res.obstructions?.length || 0} obstructions).`);
      });
    } catch (e) {
      setStatusMessage(`SHEAF GLUE | ${e.message}`);
    }
  }

  // View 4: 50-Way Race & Latency Probe
  async function handleRun50WayRace() {
    await runProtectedAction('Fire 50 Simultaneous Final-Seat Claimants', async freshTok => {
      setRunningRace(true);
      try {
        const res = await sendPost('/api/demo/race-50', {}, freshTok);
        setRaceReceipt(res);
        setStatusMessage(
          `RACE ORACLE | 50 simultaneous claimants -> ${res.committed} winner (${res.winner}), ${res.rejected} HTTP 409 TEAM_FULL in ${res.elapsedMs}ms (oversize=${res.invariants.oversize}).`
        );
      } catch (e) {
        if (e?.status === 401 || e?.message === 'UNAUTHORIZED') throw e;
        setStatusMessage(`RACE ORACLE | ${e.message}`);
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
      setStatusMessage(`LATENCY PROBE | 5x /board?limit=100 median=${sorted[2]}ms (min=${sorted[0]}ms, max=${sorted[4]}ms).`);
    } catch (e) {
      setStatusMessage(`LATENCY PROBE | ${e.message}`);
    } finally {
      setProbingLatency(false);
    }
  }

  function handleExecuteWalkthroughStep(step) {
    if (step.scenarioKey) {
      selectScenario(step.scenarioKey);
    }
    setActiveView(step.targetView);
  }

  // Compact 1-click theme cycle pill
  const currentThemeSpec = useMemo(
    () => THEME_OPTIONS.find(t => t.id === ergonomics.theme) || THEME_OPTIONS[0],
    [ergonomics.theme]
  );

  function cycleThemePreset() {
    const idx = THEME_OPTIONS.findIndex(t => t.id === ergonomics.theme);
    const next = THEME_OPTIONS[(idx + 1) % THEME_OPTIONS.length];
    setErgonomics(s => ({ ...s, theme: next.id }));
    setStatusMessage(`THEME | Switched visual surface to '${next.label}'.`);
  }

  function togglePanoramicWorkbench() {
    setErgonomics(s => {
      const nextDensity = s.density === 'panoramic-3' ? 'calm-focus' : 'panoramic-3';
      return { ...s, density: nextDensity };
    });
  }

  // Global Keyboard Shortcuts (Guarded against inputs, isContentEditable & open [role="dialog"])
  useEffect(() => {
    function onKeyDown(e) {
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

      // Guard single-key and view-switch shortcuts when inside editable elements or open dialogs
      if (inEditable || inOpenDialog) return;

      if (e.altKey && !e.ctrlKey && !e.metaKey) {
        if (e.key === '1') { e.preventDefault(); setActiveView('discover'); return; }
        if (e.key === '2') { e.preventDefault(); setActiveView('architect'); return; }
        if (e.key === '3') { e.preventDefault(); setActiveView('authority'); return; }
        if (e.key === '4') { e.preventDefault(); setActiveView('arena'); return; }
      }

      if (!e.ctrlKey && !e.metaKey && !e.altKey && e.key === '/') {
        e.preventDefault();
        setPaletteOpen(true);
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [whyOpen, authModalOpen, studioOpen, paletteOpen, charterOpen]);

  // ARIA Tablist Left/Right Arrow Key Support
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

  // Command Palette Registry
  const commands = useMemo(
    () => [
      { id: 'v1', group: 'Navigation', label: '1. Discover Crews & Builders', shortcut: 'Alt+1', keywords: 'directory board search filter', run: () => setActiveView('discover') },
      { id: 'v2', group: 'Navigation', label: '2. Mission & Ability Architect', shortcut: 'Alt+2', keywords: 'dag planner critical path wipe', run: () => setActiveView('architect') },
      { id: 'v3', group: 'Navigation', label: '3. Live Seat Authority & Peer Mesh', shortcut: 'Alt+3', keywords: 'invite claim wan drop relay', run: () => setActiveView('authority') },
      { id: 'v4', group: 'Navigation', label: '4. Concurrency & Scale Proof Arena', shortcut: 'Alt+4', keywords: 'race 50 benchmark p95', run: () => setActiveView('arena') },
      { id: 'sc-a', group: 'Scenarios', label: 'Load Scenario A: Async UTC Baton-Pass (Hot Springs <-> Bengaluru)', keywords: 'baton timezone india arkansas', run: () => { setActiveView('architect'); selectScenario('baton'); } },
      { id: 'sc-b', group: 'Scenarios', label: 'Load Scenario B: Hall Capacity Contention Counterexample', keywords: 'hall overload mateo simultaneous', run: () => { setActiveView('architect'); selectScenario('hall'); } },
      { id: 'sc-c', group: 'Scenarios', label: 'Load Scenario C: Wildcard Omega & P9R Zero-Question Gate', keywords: 'omega voi shannon unknown skill', run: () => { setActiveView('architect'); selectScenario('omega'); } },
      { id: 'sc-d', group: 'Scenarios', label: 'Load Scenario D: Preventive Prerequisite Support', keywords: 'devops cloud sandbox prerequisite', run: () => { setActiveView('architect'); selectScenario('prereq'); } },
      { id: 'act-charter', group: 'Export & Proofs', label: 'Export Crew Feasibility Charter & #FFFFFF Seat Receipt', keywords: 'pdf print html white paper charter', run: () => setCharterOpen(true) },
      { id: 'act-race', group: 'Export & Proofs', label: 'Fire 50 Simultaneous Final-Seat Claimants (/api/demo/race-50)', keywords: 'contention burst sqlite winner', run: () => { setActiveView('arena'); handleRun50WayRace(); } },
      { id: 'act-relay', group: 'Export & Proofs', label: 'Auto-Prep WAN-Drop -> Peer Relay -> Reconnect Theater', keywords: 'offline outbox relay-mateo idempotent', run: () => { setActiveView('authority'); handleAutoSetupRelayDemo(); } },
      { id: 'ly-pano', group: 'Workbench Layout', label: 'Toggle 3-Panel Panoramic Workbench (41% / 29% / 29%)', keywords: 'panorama 3 panel split inspector', run: () => togglePanoramicWorkbench() },
      { id: 'p-aurora', group: 'Judge Personas', label: 'Switch Persona: leader-aurora', keywords: 'auth demo leader', run: () => switchPersona('leader-aurora') },
      { id: 'p-kai', group: 'Judge Personas', label: 'Switch Persona: builder-kai', keywords: 'auth demo frontend', run: () => switchPersona('builder-kai') },
      { id: 'p-priya', group: 'Judge Personas', label: 'Switch Persona: builder-priya', keywords: 'auth demo relay', run: () => switchPersona('builder-priya') },
      { id: 'th-sbr', group: 'Accessibility & Themes', label: 'Theme: Super Bob Ross Comfort (#11171D / #8FBEB4)', keywords: 'sbr matte sage comfort', run: () => setErgonomics(s => ({ ...s, theme: 'sbr-comfort' })) },
      { id: 'th-h4h', group: 'Accessibility & Themes', label: 'Theme: Hack4Hack Builder Studio (#0B0F19 / #10B981)', keywords: 'h4h studio indigo emerald violet', run: () => setErgonomics(s => ({ ...s, theme: 'h4h-studio' })) },
      { id: 'th-glass', group: 'Accessibility & Themes', label: 'Theme: Moonlight Optical Glass', keywords: 'dark obsidian refractive', run: () => setErgonomics(s => ({ ...s, theme: 'midnight-glass' })) },
      { id: 'th-slate', group: 'Accessibility & Themes', label: 'Theme: Calm Matte Slate (Zero Translucency)', keywords: 'opaque matte', run: () => setErgonomics(s => ({ ...s, theme: 'matte-slate' })) },
      { id: 'th-paper', group: 'Accessibility & Themes', label: 'Theme: Warm Paper Light (Daylight)', keywords: 'light paper', run: () => setErgonomics(s => ({ ...s, theme: 'warm-paper' })) },
      { id: 'th-aaa', group: 'Accessibility & Themes', label: 'Theme: WCAG AAA High-Contrast (7:1+)', keywords: 'contrast yellow black accessible', run: () => setErgonomics(s => ({ ...s, theme: 'aaa-contrast' })) },
      { id: 'open-studio', group: 'Accessibility & Themes', label: 'Open Accessibility & FOV Studio Drawer', shortcut: 'Ctrl+Shift+A', keywords: 'scale font motion split', run: () => setStudioOpen(true) },
      { id: 'open-why', group: 'Thesis', label: 'Open "Why Purpose First?" Thesis Brief', keywords: 'inversion architecture', run: () => setWhyOpen(true) }
    ],
    [selectScenario, switchPersona]
  );

  const layoutClass =
    ergonomics.density === 'panoramic-3'
      ? 'is-panoramic-3'
      : ergonomics.density === 'split-studio'
        ? 'is-split-studio'
        : '';

  return (
    <div className="app-shell">
      <a href="#main-workspace" className="skip-link no-print">
        Skip to main content
      </a>

      {/* Clean Single-Row Top Command Header (Optical Glass Rim ONLY on .top-header, .command-palette & Active Pills) */}
      <header className="top-command-header top-header no-print" role="banner">
        {/* 1. Brand & Origin Pill */}
        <div className="brand-cluster">
          <div className="brand-pill">
            <span className="brand-icon-wrap">
              <BrandMark size={22} />
            </span>
            <div className="brand-titles">
              <h1 className="brand-h1">Post Sheet | Ability &amp; Purpose Crew Network</h1>
              <span className="brand-meta">Hack4Hack PS1 Flagship · Synchronicity R5</span>
            </div>
          </div>
          <button
            type="button"
            className="btn btn-ghost btn-compact why-pill"
            onClick={() => setWhyOpen(true)}
          >
            <HelpIcon size={15} /> Why Purpose First?
          </button>
        </div>

        {/* 2. Primary View Switcher (ARIA Tablist + Alt+1..4) */}
        <nav aria-label="Primary platform views" className="primary-nav">
          <div role="tablist" aria-label="Workspace Views" className="primary-tablist">
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
                  title={`${tab.label} (${tab.hotkey})`}
                >
                  <Icon size={16} />
                  <span className="tab-num">{tab.num}.</span>
                  <span className="tab-text">{tab.short}</span>
                </button>
              );
            })}
          </div>
        </nav>

        {/* 3. Judge Quick Personas, 3-Coordinate Network Pill, 1-Click Theme & Panorama Triggers */}
        <div className="header-right-cluster">
          {/* 1-Click Judge Persona Switcher */}
          <div className="persona-switcher" role="group" aria-label="Judge quick personas and account sign-in">
            {['leader-aurora', 'builder-kai', 'builder-priya'].map(p => {
              const shortName = p.split('-')[1];
              const isCurrent = actorId === p && Boolean(token);
              return (
                <button
                  key={p}
                  type="button"
                  aria-pressed={isCurrent}
                  className={`persona-chip ${isCurrent ? 'active' : ''}`}
                  onClick={() => switchPersona(p)}
                  title={`1-click switch to ${p}`}
                >
                  {isCurrent ? '● ' : ''}{shortName}
                </button>
              );
            })}
            <button
              type="button"
              className={`persona-chip account-trigger ${!token ? 'warn-unauth' : ''}`}
              onClick={() => {
                setAuthPromptMessage('');
                setAuthModalOpen(true);
              }}
              aria-label={`Account session (${actorId || 'Sign in'})`}
              title="scrypt Account Register / Sign-In / Logout"
            >
              <UserIcon size={14} />
              <span>
                {actorId && !['leader-aurora', 'builder-kai', 'builder-priya'].includes(actorId)
                  ? actorId
                  : token
                    ? 'Account'
                    : 'Sign In'}
              </span>
            </button>
          </div>

          {/* 3-Coordinate Network Indicator Pill */}
          <button
            type="button"
            className="network-coords-pill"
            onClick={() => setActiveView('authority')}
            aria-label={`Three-coordinate network status. Authority Path: ${
              wanOffline ? 'WAN Dropped' : authorityHealth === 'online' ? 'Direct SQLite Online' : 'Checking'
            }. Encrypted Peer Mesh: Ready via relay-mateo. Local Durable Outbox: ${
              queuedClaim ? '1 Pending Relay' : '0 Queued'
            }. Activate to open Seat Authority and Peer Mesh.`}
            title="Click to inspect 3-Coordinate Continuity & WAN-Drop Relay"
          >
            <span className={`coord-item ${wanOffline ? 'coord-warn' : authorityHealth === 'online' ? 'coord-ok' : ''}`}>
              <DatabaseIcon size={13} />
              <span>Auth: {wanOffline ? 'WAN Drop' : authorityHealth === 'online' ? 'Direct' : 'Sync'}</span>
            </span>
            <span className="coord-sep" aria-hidden="true">|</span>
            <span className="coord-item coord-ok">
              <MeshIcon size={13} />
              <span>Mesh: AES+P256</span>
            </span>
            <span className="coord-sep" aria-hidden="true">|</span>
            <span className={`coord-item ${queuedClaim ? 'coord-warn' : ''}`}>
              <OutboxIcon size={13} />
              <span>Outbox: {queuedClaim ? '1 Pending' : '0'}</span>
            </span>
          </button>

          {/* Compact 1-Click Theme Pill + 3-Panel Panorama + Palette + FOV Studio */}
          <div className="studio-triggers">
            <button
              type="button"
              className="btn btn-ghost icon-text-btn theme-quick-pill"
              onClick={cycleThemePreset}
              aria-label={`Current theme ${currentThemeSpec.label}. Click to cycle theme preset.`}
              title={`Theme: ${currentThemeSpec.label} (Click to cycle SBR Comfort / H4H Studio / Glass / Paper / AAA)`}
            >
              <PaletteIcon size={15} />
              <span
                className="swatch-dot"
                style={{ background: currentThemeSpec.swatch[2] }}
                aria-hidden="true"
              />
              <span className="hide-narrow">{currentThemeSpec.shortLabel}</span>
            </button>

            <button
              type="button"
              aria-pressed={ergonomics.density === 'panoramic-3'}
              className={`btn icon-text-btn ${
                ergonomics.density === 'panoramic-3' ? 'btn-primary' : 'btn-ghost'
              }`}
              onClick={togglePanoramicWorkbench}
              aria-label="Toggle 3-Panel Panoramic Workbench (41 / 29 / 29)"
              title="Toggle 3-Panel Panorama (Active View + Live DAG/VOI + Live Seat/SSE)"
            >
              <ColumnsIcon size={15} />
              <span className="hide-narrow">3-Panel</span>
            </button>

            <button
              type="button"
              className="btn btn-ghost icon-text-btn"
              onClick={() => setPaletteOpen(true)}
              aria-label="Open command palette (Ctrl+K or slash)"
              title="Command Palette (Ctrl+K or /)"
            >
              <CommandIcon size={15} />
              <kbd className="hide-narrow">Ctrl+K</kbd>
            </button>

            <button
              type="button"
              className="btn btn-secondary icon-text-btn"
              onClick={() => setStudioOpen(true)}
              aria-label="Open Accessibility and FOV Studio (Ctrl+Shift+A)"
              title="Accessibility & FOV Studio (Ctrl+Shift+A)"
            >
              <SlidersIcon size={15} />
              <span className="hide-narrow">FOV &amp; A11y</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Workspace (Supports Calm-Focus, 2-Panel Split Studio, OR 3-Panel Panorama 41/29/29) */}
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
              eventId={eventId}
              onChangeEventId={handleChangeEventScope}
              onEnsureEvent={handleEnsureEvent}
              board={board}
              totalTeams={totalTeams}
              totalMembers={totalMembers}
              boardLatencyMs={boardLatencyMs}
              sseConnected={sseConnected}
              pageIndex={pageIndex}
              pageSize={pageSize}
              onPageChange={setPageIndex}
              onPageSizeChange={sz => {
                setPageSize(sz);
                setPageIndex(0);
              }}
              onRefreshBoard={refreshBoard}
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
            />
          )}

          {activeView === 'architect' && (
            <MissionArchitectView
              theme={ergonomics.theme}
              motion={ergonomics.motion}
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
            />
          )}

          {activeView === 'authority' && (
            <SeatAuthorityView
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
              onToggleWanOffline={() => setWanOffline(v => !v)}
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
              onLoadPeerNotes={handleLoadPeerNotes}
              glueResult={glueResult}
              onRunGluePreset={handleRunGluePreset}
              auditRows={auditRows}
              onLoadAudit={loadAudit}
              onOpenCharterExport={() => setCharterOpen(true)}
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

        {/* 3-PANEL PANORAMA REGION 2: Live DAG / VOI Mini-Inspector */}
        {ergonomics.density === 'panoramic-3' && (
          <aside className="panorama-pane" aria-label="Live DAG and VOI Mini-Inspector">
            <div className="surface-card sticky-dock">
              <div className="row-between wrap-gap">
                <span className="eyebrow-tag">PANORAMA II · DAG &amp; VOI INSPECTOR</span>
                <EpistemicStencil
                  kind={plan?.status === 'CONDITIONAL_WITNESS' ? 'VOI_PROVISIONAL' : 'SQLITE_AUTHORITY'}
                  compact
                />
              </div>
              <h3 className="card-subtitle">Live Critical-Path &amp; Omega State</h3>
              <p className="muted-copy small-copy top-gap-xs">{goalDescription}</p>

              <div className={`subcard top-gap-xs ${plan?.status === 'FEASIBLE_WITNESS' ? 'tone-ok' : 'tone-warn'}`}>
                <div className="row-between">
                  <strong>{plan?.status || 'NOT_EVALUATED'}</strong>
                  <span className="badge-pill">{plan?.classification || 'PREVIEW'}</span>
                </div>
                <div className="small-copy top-gap-xs">
                  Wildcard |Omega|:{' '}
                  <code>
                    {plan?.frontier ? `${plan.frontier.worldsCovered}/${plan.frontier.omegaSize}` : '1/1'}
                  </code>{' '}
                  · P9R: <code>{plan?.frontier?.minimumSufficientStop || 'BOUNDED'}</code>
                </div>
              </div>

              <div className="mini-dag-stack top-gap-xs">
                {tasks.map(t => {
                  const cp = (plan?.criticalPath || []).find(m => m.taskId === t.id);
                  const asg = (plan?.witness?.assignments || []).find(a => a.taskId === t.id);
                  return (
                    <div key={t.id} className="mini-dag-row">
                      <div className="row-between small-copy">
                        <strong><code>{t.id}</code> ({t.skill})</strong>
                        <span className={cp && cp.slackMin <= 0 ? 'final-seat-text' : 'muted-copy'}>
                          {cp ? (cp.slackMin <= 0 ? '0m CRIT' : `+${cp.slackMin}m`) : `${t.durationMin}m`}
                        </span>
                      </div>
                      <div className="small-copy muted-copy">
                        {asg
                          ? `${asg.evidence === 'unknown' ? '? ' : '✓ '}${asg.personId} [${asg.startMin}..${asg.endMin}m]`
                          : 'Unassigned / Blocked'}
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="pill-row top-gap-sm">
                <button
                  type="button"
                  className="btn btn-secondary btn-compact"
                  onClick={() => setActiveView('architect')}
                >
                  Open Architect
                </button>
                <button
                  type="button"
                  className="btn btn-ghost btn-compact"
                  onClick={() => setCharterOpen(true)}
                >
                  <FileTextIcon size={14} /> Charter
                </button>
              </div>
            </div>
          </aside>
        )}

        {/* 3-PANEL PANORAMA REGION 3: Live Seat / SSE Audit Feed */}
        {ergonomics.density === 'panoramic-3' && (
          <aside className="panorama-pane" aria-label="Live Seat Authority and SSE Audit Feed">
            <div className="surface-card sticky-dock">
              <div className="row-between wrap-gap">
                <span className="eyebrow-tag">PANORAMA III · SEAT &amp; SSE FEED</span>
                <EpistemicStencil kind="SQLITE_AUTHORITY" compact />
              </div>
              <div className="row-between top-gap-xs">
                <h3 className="card-subtitle">Live Board &amp; Ledger</h3>
                <button type="button" className="btn btn-ghost btn-compact" onClick={() => loadAudit()}>
                  <RefreshIcon size={14} /> Sync
                </button>
              </div>

              <div className="subcard top-gap-xs">
                <div className="small-copy">
                  SSE Push: <strong>{sseConnected ? 'LIVE' : 'STANDBY'}</strong> · Read:{' '}
                  <strong>{boardLatencyMs !== null ? `${boardLatencyMs.toFixed(1)}ms` : '--'}</strong>
                </div>
                <div className="small-copy top-gap-xs">
                  Outbox:{' '}
                  <code>{queuedClaim ? `PENDING (${queuedClaim.opId.slice(0, 14)}...)` : '0 QUEUED'}</code>
                </div>
              </div>

              <div className="mini-board-list top-gap-xs">
                {board.slice(0, 4).map(t => (
                  <button
                    key={t.team_id}
                    type="button"
                    className="mini-board-row"
                    onClick={() => handleRequestSeatForTeam(t.team_id)}
                  >
                    <span>{t.team_id}</span>
                    <code>{t.members}/{t.max_size} seats</code>
                  </button>
                ))}
              </div>

              <div className="top-gap-sm">
                <div className="row-between small-copy">
                  <strong>Recent Attributable Audit</strong>
                  <EpistemicStencil kind="PEER_CIPHERTEXT_ONLY" compact />
                </div>
                {auditRows.length === 0 ? (
                  <p className="muted-copy small-copy top-gap-xs">
                    Click "Sync" or mutate seats to stream attributable SQLite audit entries.
                  </p>
                ) : (
                  <div className="audit-timeline top-gap-xs">
                    {auditRows.slice(-4).reverse().map(row => (
                      <div key={row.id} className="audit-entry small-copy">
                        <strong>{row.action}</strong> · <code>{row.actor_id}</code> -&gt; <code>{row.team_id}</code>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </aside>
        )}

        {/* 2-Panel Split-Studio Side-by-Side Companion Telemetry Dock */}
        {ergonomics.density === 'split-studio' && (
          <aside className="split-companion-pane" aria-label="Split Studio Live Companion Telemetry">
            <div className="surface-card sticky-dock">
              <span className="eyebrow-tag">SPLIT STUDIO · SIDE-BY-SIDE TELEMETRY</span>
              <h3 className="card-subtitle">Live Cross-Layer Monitor</h3>

              <div className="subcard top-gap-xs">
                <strong>1. Network Coordinates</strong>
                <ul className="clean-list small-copy">
                  <li>Authority Path: <code>{wanOffline ? 'WAN_DROPPED' : authorityHealth.toUpperCase()}</code></li>
                  <li>Encrypted Peer Mesh: <code>AES-256-GCM + P-256 (relay-mateo)</code></li>
                  <li>Local Durable Outbox: <code>{queuedClaim ? `PENDING (${queuedClaim.opId})` : '0 QUEUED'}</code></li>
                </ul>
              </div>

              <div className="subcard top-gap-xs">
                <strong>2. Active Mission Verdict</strong>
                <div className="small-copy top-gap-xs">
                  Status: <code>{plan?.status || 'NOT_RUN'}</code> ({plan?.classification || '--'})
                </div>
                <div className="small-copy">
                  Quantifier: <code>{plan?.frontier?.quantifierStatus || '--'}</code>
                </div>
              </div>

              <div className="subcard top-gap-xs">
                <strong>3. Live Board Snapshot (<code>{eventId}</code>)</strong>
                <div className="small-copy top-gap-xs">
                  Total Crews: <strong>{totalTeams !== null ? totalTeams.toLocaleString() : board.length}</strong> · Last Read:{' '}
                  <strong>{boardLatencyMs !== null ? `${boardLatencyMs.toFixed(1)}ms` : '--'}</strong>
                </div>
                <div className="mini-board-list top-gap-xs">
                  {board.slice(0, 5).map(t => (
                    <button
                      key={t.team_id}
                      type="button"
                      className="mini-board-row"
                      onClick={() => handleRequestSeatForTeam(t.team_id)}
                    >
                      <span>{t.team_id}</span>
                      <code>{t.members}/{t.max_size}</code>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </aside>
        )}
      </div>

      {/* Global Polite ARIA Live Status Bar & Semantic Footer */}
      <footer className="platform-footer no-print" role="contentinfo">
        <div
          role="status"
          aria-live="polite"
          aria-atomic="true"
          className="live-announcer-bar"
        >
          <span className="live-pulse-indicator" aria-hidden="true">●</span>
          <span className="mono-status-text">{statusMessage}</span>
        </div>

        <div className="footer-meta-row">
          <span>
            <strong>Post Sheet x Synchronicity</strong> · Layer-A SQLite <code>BEGIN IMMEDIATE</code> Serialized Seat Authority + Layer-B <code>AES-256-GCM</code> / <code>P-256</code> Peer Continuity
          </span>
          <span className="hotkey-legend">
            Hotkeys: <kbd>Alt+1..4</kbd> Views · <kbd>Ctrl+K</kbd> or <kbd>/</kbd> Palette · <kbd>Ctrl+Shift+A</kbd> FOV &amp; A11y Studio
          </span>
        </div>
      </footer>

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
      />
    </div>
  );
}
