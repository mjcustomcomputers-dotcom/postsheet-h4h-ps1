import React, { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { getOrCreateClaimOperation, finishClaimOperation } from './claim-operation.js';
import {
  loadErgonomics,
  saveErgonomics,
  applyErgonomicsToDocument
} from './ergonomics.js';
import {
  MISSION_SCENARIOS,
  visualTasksToApi,
  visualPeopleToApi
} from './presets-and-catalog.js';
import {
  WhyPurposeFirstModal,
  AuthAccountModal,
  AccessibilityStudioDrawer,
  CommandPaletteModal
} from './components/Overlays.jsx';
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
  HelpIcon
} from './icons.jsx';

const PRIMARY_TABS = [
  { id: 'discover', num: '1', label: 'Discover Crews & Builders', short: 'Discover', hotkey: 'Alt+1', Icon: CompassIcon },
  { id: 'architect', num: '2', label: 'Mission & Ability Architect', short: 'Mission Architect', hotkey: 'Alt+2', Icon: GitBranchIcon },
  { id: 'authority', num: '3', label: 'Live Seat Authority & Peer Mesh', short: 'Seat & Peer Mesh', hotkey: 'Alt+3', Icon: ShieldCheckIcon },
  { id: 'arena', num: '4', label: 'Concurrency & Scale Proof Arena', short: 'Scale & Race Proof', hotkey: 'Alt+4', Icon: ZapIcon }
];

async function readApiJson(response) {
  const body = await response.json();
  if (!response.ok) throw Error(body.error || `HTTP_${response.status}`);
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

  // Auth & Event State
  const [eventId, setEventId] = useState('seed-event');
  const [actorId, setActorId] = useState('');
  const [token, setToken] = useState('');
  const [relayToken, setRelayToken] = useState('');

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

  // Mission & Ability Architect State (View 2)
  const [activeScenarioKey, setActiveScenarioKey] = useState('baton');
  const [omegaMode, setOmegaMode] = useState('contingent');
  const [goalDescription, setGoalDescription] = useState(MISSION_SCENARIOS.baton.goalDescription);
  const [horizonHours, setHorizonHours] = useState(MISSION_SCENARIOS.baton.horizonHours);
  const [tasks, setTasks] = useState(MISSION_SCENARIOS.baton.tasks);
  const [teamPeople, setTeamPeople] = useState(MISSION_SCENARIOS.baton.teamPeople);
  const [candidates, setCandidates] = useState(MISSION_SCENARIOS.baton.candidates);
  const [plan, setPlan] = useState(null);
  const [recs, setRecs] = useState(null);
  const [solving, setSolving] = useState(false);
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

  // Authenticated API helpers
  const ensureToken = useCallback(async () => {
    if (token.trim()) return token.trim();
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
    setActorId(demo.actorId);
    setToken(demo.token);
    setRelayToken(relay.token);
    return demo.token;
  }, [token, eventId]);

  const sendPost = useCallback(
    async (path, body, overrideToken) => {
      const useTok = overrideToken || (await ensureToken());
      return readApiJson(
        await fetch(path, {
          method: 'POST',
          headers: { 'content-type': 'application/json', authorization: 'Bearer ' + useTok },
          body: JSON.stringify(body)
        })
      );
    },
    [ensureToken]
  );

  const sendGetAuth = useCallback(
    async path => {
      const useTok = await ensureToken();
      return readApiJson(
        await fetch(path, {
          headers: { authorization: 'Bearer ' + useTok },
          cache: 'no-store'
        })
      );
    },
    [ensureToken]
  );

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
        setActorId(main.actorId);
        setToken(main.token);
        setRelayToken(relay.token);

        // Pre-compute Scenario A plan & recommendations so View 2 is immediately rich
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
        setActorId(main.actorId);
        setToken(main.token);
        setRelayToken(relay.token);
        setStatusMessage(`AUTH | Active persona switched to '${main.actorId}' (peer relay 'relay-mateo' armed).`);
        refreshBoard();
      } catch (e) {
        setStatusMessage(`AUTH | ${e.message}`);
      }
    },
    [eventId, refreshBoard]
  );

  async function handleAccountAuth(mode, payload) {
    const res = await readApiJson(
      await fetch(`/api/auth/${mode}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload)
      })
    );
    setActorId(res.actorId);
    setToken(res.token);
    setStatusMessage(`AUTH | ${mode === 'register' ? 'Registered salted scrypt account' : 'Signed in'} as '${res.actorId}'.`);
  }

  async function handleLogout() {
    try {
      if (token.trim()) {
        await readApiJson(
          await fetch('/api/auth/logout', {
            method: 'POST',
            headers: { 'content-type': 'application/json', authorization: 'Bearer ' + token.trim() },
            body: JSON.stringify({})
          })
        );
      }
      setActorId('');
      setToken('');
      setStatusMessage('AUTH | Session token revoked in SQLite ps1_revoked_tokens.');
    } catch (e) {
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
      await sendPost('/api/events', { eventId: nextEv, maxSize: 5 });
      setEventId(nextEv);
      setPageIndex(0);
      setSelectedTeam(null);
      setStatusMessage(`EVENT | Active event scope set to '${nextEv}'.`);
    } catch (e) {
      setEventId(nextEv);
      setPageIndex(0);
      setStatusMessage(`EVENT | Switched scope to '${nextEv}' (${e.message}).`);
    }
  }

  function handleChangeEventScope(nextEv) {
    handleEnsureEvent(nextEv);
  }

  // Spawn 3 real open-seat SQLite crews at top of Page 1 without consuming judge personas
  async function spawnShowcaseCrews() {
    setSpawningDemo(true);
    try {
      await sendPost('/api/events', { eventId, maxSize: 5 });
      const tag = String(Date.now()).slice(-4);
      const specs = [
        { tid: `00-open-baton-${tag}`, lead: `lead-baton-${tag}`, extraCount: 1 },
        { tid: `01-open-hall-${tag}`, lead: `lead-hall-${tag}`, extraCount: 2 },
        { tid: `02-final-seat-${tag}`, lead: `lead-scarce-${tag}`, extraCount: Math.max(0, (eventMaxSize || 5) - 2) }
      ];

      for (const sp of specs) {
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
      }
      setPageIndex(0);
      await refreshBoard();
      setStatusMessage(
        `BOARD | Spawned 3 live SQLite open crews (including 1 Final Seat Left: 02-final-seat-${tag}) on Page 1 of '${eventId}'.`
      );
    } catch (e) {
      setStatusMessage(`SPAWN | ${e.message}`);
    } finally {
      setSpawningDemo(false);
    }
  }

  // Mission Architect Solver Execution
  const runSolveAndRecommend = useCallback(
    async (overrides = {}) => {
      const useGoal = overrides.goalDescription ?? goalDescription;
      const useHours = overrides.horizonHours ?? horizonHours;
      const useTasks = overrides.tasks ?? tasks;
      const useTeam = overrides.teamPeople ?? teamPeople;
      const useCands = overrides.candidates ?? candidates;
      const useCrewTag = overrides.crewId ?? evaluatingCrewId;

      const horizonMin = Math.max(60, Math.round(Number(useHours || 4) * 60));
      const goalPayload = {
        id: 'mission-goal',
        description: useGoal,
        startMin: 0,
        deadlineMin: horizonMin,
        tasks: visualTasksToApi(useTasks)
      };

      setSolving(true);
      try {
        const [planRes, recRes] = await Promise.all([
          sendPost('/api/plan', {
            goal: goalPayload,
            people: visualPeopleToApi(useTeam, horizonMin),
            maxNodes: 5000
          }),
          sendPost('/api/recommendations', {
            goal: goalPayload,
            teamPeople: visualPeopleToApi(useTeam, horizonMin),
            candidates: visualPeopleToApi(useCands, horizonMin)
          })
        ]);
        setPlan(planRes);
        setRecs(recRes);
        if (useCrewTag) {
          setVerifiedCrewMap(prev => ({ ...prev, [useCrewTag]: planRes.status }));
        }
        setStatusMessage(
          `SOLVER | ${planRes.status} (${planRes.classification}) · Quantifier: ${
            planRes.frontier?.quantifierStatus || 'BOUNDED'
          } · Ranked ${recRes.recommendations?.length || 0} complementary builders.`
        );
      } catch (e) {
        setPlan(null);
        setRecs(null);
        setStatusMessage(`SOLVER | ${e.message}`);
      } finally {
        setSolving(false);
      }
    },
    [goalDescription, horizonHours, tasks, teamPeople, candidates, evaluatingCrewId, sendPost]
  );

  const selectScenario = useCallback(
    key => {
      const sc = MISSION_SCENARIOS[key];
      if (!sc) return;
      setActiveScenarioKey(key);
      setOmegaMode('contingent');
      setEvaluatingCrewId(null);
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
        crewId: null
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

  // Cross-View Actions from View 1 (Discover)
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
    setActiveView('architect');
    runSolveAndRecommend({
      goalDescription: customGoal,
      horizonHours: sc.horizonHours,
      tasks: sc.tasks,
      teamPeople: sc.teamPeople,
      candidates: sc.candidates,
      crewId: crewProfile.teamId
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
  async function loadAudit() {
    try {
      const aud = await sendGetAuth(`/api/events/${encodeURIComponent(eventId)}/audit`);
      setAuditRows(aud.audit || []);
      setStatusMessage(`AUDIT | Loaded ${aud.audit?.length || 0} attributable SQLite audit entries.`);
    } catch (e) {
      setStatusMessage(`AUDIT | ${e.message}`);
    }
  }

  async function handleCreateTeam() {
    try {
      const res = await sendPost('/api/teams', { eventId, teamId });
      setStatusMessage(`AUTHORITY | Created team '${res.teamId}' with leader '${actorId}'.`);
      await refreshBoard();
      await inspectTeam(teamId);
      await loadAudit();
    } catch (e) {
      setStatusMessage(`CREATE TEAM | ${e.message}`);
    }
  }

  async function handleCreateInvite() {
    try {
      const expiresAt = Date.now() + 600000;
      const res = await sendPost('/api/invitations', { eventId, teamId, expiresAt });
      setIssuedInvite(res);
      setInviteCode(res.code);
      setStatusMessage(`INVITE | Minted single-use SHA-256 hashed invitation for '${teamId}' (10m TTL).`);
      await loadAudit();
    } catch (e) {
      setStatusMessage(`INVITE | ${e.message}`);
    }
  }

  async function handleJoinSeat() {
    if (joiningLock.current) return;
    joiningLock.current = true;
    setJoining(true);
    try {
      await ensureToken();
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
          actorId: actorId || 'builder-priya'
        });
        setRelayedReceipt(null);
        setReplayReceipt(null);
        setStatusMessage(
          `LOCAL OUTBOX | Direct WAN is offline. Retained SHA-256 opId '${operation.opId}' in Pending Relay Outbox (seat NOT yet confirmed).`
        );
        return;
      }

      const result = await sendPost('/api/invitations/claim', {
        eventId,
        teamId,
        code: inviteCode,
        opId: operation.opId
      });
      if (result.status === 'COMMITTED') {
        finishClaimOperation(sessionStorage, operation.key);
      }
      if (result.replayed) {
        setReplayReceipt(result);
      }
      setQueuedClaim(null);
      setStatusMessage(
        `AUTHORITY | ${result.status} for '${result.actorId}' on '${result.teamId}'${
          result.replayed ? ' (replayed: true — idempotent recovery, 0 duplicate rows!)' : ' (fresh seat committed)'
        }.`
      );
      await refreshBoard();
      await inspectTeam(teamId);
      await loadAudit();
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
      const claimantTok = await ensureToken();
      let useRelayTok = relayToken;
      if (!useRelayTok) {
        const relay = await readApiJson(
          await fetch('/api/auth/demo', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ actorId: 'relay-mateo', eventId: queuedClaim.eventId, maxSize: 5 })
          })
        );
        useRelayTok = relay.token;
        setRelayToken(useRelayTok);
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
      const result = await sendPost('/api/invitations/claim', {
        eventId: targetClaim.eventId,
        teamId: targetClaim.teamId,
        code: targetClaim.code,
        opId: targetClaim.opId
      });
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
      await loadAudit();
    } catch (e) {
      setStatusMessage(`RETRY | ${e.message}`);
    }
  }

  async function handleAutoSetupRelayDemo() {
    try {
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
        `THEATER ARMED | Created '${demoTeam}', issued single-use invite, switched to '${priyaSession.actorId}', and simulated WAN drop. Click Step 1B → Step 2 → Step 3!`
      );
    } catch (e) {
      setStatusMessage(`THEATER PREP | ${e.message}`);
    }
  }

  async function handleTransferLeader(newLeaderId) {
    try {
      const res = await sendPost('/api/teams/transfer', { eventId, teamId, newLeaderId });
      setStatusMessage(`LEADER TRANSFER | ${res.status}: '${res.leader}' now leads '${teamId}'.`);
      await refreshBoard();
      await inspectTeam(teamId);
      await loadAudit();
    } catch (e) {
      setStatusMessage(`TRANSFER | ${e.message}`);
    }
  }

  async function handleLeaveTeam() {
    try {
      const res = await sendPost('/api/teams/leave', { eventId, teamId });
      setStatusMessage(
        `DEPARTURE | ${res.status}${
          res.leader ? ` (deterministic succession -> '${res.leader}')` : ' (final member left -> team auto-deleted)'
        }.`
      );
      if (res.status === 'TEAM_DELETED') setSelectedTeam(null);
      else await inspectTeam(teamId);
      await refreshBoard();
      await loadAudit();
    } catch (e) {
      setStatusMessage(`LEAVE | ${e.message}`);
    }
  }

  async function handleLoadPeerNotes() {
    try {
      const list = await sendGetAuth(`/api/peer/notes?eventId=${encodeURIComponent(eventId)}`);
      setPeerNotes(list.notes || []);
    } catch (e) {
      setStatusMessage(`LAYER B | ${e.message}`);
    }
  }

  async function handleSendPeerNote() {
    try {
      const opId = 'note-' + crypto.randomUUID().slice(0, 12);
      const res = await sendPost('/api/peer/notes', { eventId, opId, text: peerNoteText, epoch: 1 });
      await handleLoadPeerNotes();
      setStatusMessage(
        `LAYER B | Sealed AES-256-GCM + P-256 note (${res.transportStatus}) SHA-256=${res.digest.slice(0, 16)}…`
      );
    } catch (e) {
      setStatusMessage(`LAYER B | ${e.message}`);
    }
  }

  async function handleRunGluePreset(preset) {
    try {
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
      const res = await sendPost('/api/peer/glue', { localRecords, peerRecords });
      setGlueResult(res);
      setStatusMessage(`SHEAF GLUE | ${res.status} (${res.obstructions?.length || 0} obstructions).`);
    } catch (e) {
      setStatusMessage(`SHEAF GLUE | ${e.message}`);
    }
  }

  // View 4: 50-Way Race & Latency Probe
  async function handleRun50WayRace() {
    setRunningRace(true);
    try {
      const res = await sendPost('/api/demo/race-50', {});
      setRaceReceipt(res);
      setStatusMessage(
        `RACE ORACLE | 50 simultaneous claimants -> ${res.committed} winner (${res.winner}), ${res.rejected} HTTP 409 TEAM_FULL in ${res.elapsedMs}ms (oversize=${res.invariants.oversize}).`
      );
    } catch (e) {
      setStatusMessage(`RACE ORACLE | ${e.message}`);
    } finally {
      setRunningRace(false);
    }
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

  // Global Keyboard Shortcuts (Alt+1..4, Ctrl+Shift+A, Ctrl+K, /)
  useEffect(() => {
    function onKeyDown(e) {
      if (e.altKey && !e.ctrlKey && !e.metaKey) {
        if (e.key === '1') { e.preventDefault(); setActiveView('discover'); return; }
        if (e.key === '2') { e.preventDefault(); setActiveView('architect'); return; }
        if (e.key === '3') { e.preventDefault(); setActiveView('authority'); return; }
        if (e.key === '4') { e.preventDefault(); setActiveView('arena'); return; }
      }
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
      const tag = (e.target?.tagName || '').toUpperCase();
      const inEditable = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || e.target?.isContentEditable;
      if (!inEditable && !e.ctrlKey && !e.metaKey && !e.altKey && e.key === '/') {
        if (!whyOpen && !authModalOpen && !studioOpen && !paletteOpen) {
          e.preventDefault();
          setPaletteOpen(true);
        }
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [whyOpen, authModalOpen, studioOpen, paletteOpen]);

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
      { id: 'v2', group: 'Navigation', label: '2. Mission & Ability Architect', shortcut: 'Alt+2', keywords: 'dag planner critical path', run: () => setActiveView('architect') },
      { id: 'v3', group: 'Navigation', label: '3. Live Seat Authority & Peer Mesh', shortcut: 'Alt+3', keywords: 'invite claim wan drop relay', run: () => setActiveView('authority') },
      { id: 'v4', group: 'Navigation', label: '4. Concurrency & Scale Proof Arena', shortcut: 'Alt+4', keywords: 'race 50 benchmark p95', run: () => setActiveView('arena') },
      { id: 'sc-a', group: 'Scenarios', label: 'Load Scenario A: Async UTC Baton-Pass (Hot Springs ↔ Bengaluru)', keywords: 'baton timezone india arkansas', run: () => { setActiveView('architect'); selectScenario('baton'); } },
      { id: 'sc-b', group: 'Scenarios', label: 'Load Scenario B: Hall Capacity Contention Counterexample', keywords: 'hall overload mateo simultaneous', run: () => { setActiveView('architect'); selectScenario('hall'); } },
      { id: 'sc-c', group: 'Scenarios', label: 'Load Scenario C: Wildcard Omega & P9R Zero-Question Gate', keywords: 'omega voi shannon unknown skill', run: () => { setActiveView('architect'); selectScenario('omega'); } },
      { id: 'sc-d', group: 'Scenarios', label: 'Load Scenario D: Preventive Prerequisite Support', keywords: 'devops cloud sandbox prerequisite', run: () => { setActiveView('architect'); selectScenario('prereq'); } },
      { id: 'act-race', group: 'Live Proofs', label: 'Fire 50 Simultaneous Final-Seat Claimants (/api/demo/race-50)', keywords: 'contention burst sqlite winner', run: () => { setActiveView('arena'); handleRun50WayRace(); } },
      { id: 'act-relay', group: 'Live Proofs', label: 'Auto-Prep WAN-Drop → Peer Relay → Reconnect Theater', keywords: 'offline outbox relay-mateo idempotent', run: () => { setActiveView('authority'); handleAutoSetupRelayDemo(); } },
      { id: 'p-aurora', group: 'Judge Personas', label: 'Switch Persona: leader-aurora', keywords: 'auth demo leader', run: () => switchPersona('leader-aurora') },
      { id: 'p-kai', group: 'Judge Personas', label: 'Switch Persona: builder-kai', keywords: 'auth demo frontend', run: () => switchPersona('builder-kai') },
      { id: 'p-priya', group: 'Judge Personas', label: 'Switch Persona: builder-priya', keywords: 'auth demo relay', run: () => switchPersona('builder-priya') },
      { id: 'th-glass', group: 'Accessibility & Themes', label: 'Theme: Hack4Hack Midnight Glass', keywords: 'dark obsidian', run: () => setErgonomics(s => ({ ...s, theme: 'midnight-glass' })) },
      { id: 'th-slate', group: 'Accessibility & Themes', label: 'Theme: Calm Matte Slate (Zero Translucency)', keywords: 'opaque matte', run: () => setErgonomics(s => ({ ...s, theme: 'matte-slate' })) },
      { id: 'th-paper', group: 'Accessibility & Themes', label: 'Theme: Warm Paper Light (Daylight)', keywords: 'light paper', run: () => setErgonomics(s => ({ ...s, theme: 'warm-paper' })) },
      { id: 'th-aaa', group: 'Accessibility & Themes', label: 'Theme: WCAG AAA High-Contrast (7:1+)', keywords: 'contrast yellow black accessible', run: () => setErgonomics(s => ({ ...s, theme: 'aaa-contrast' })) },
      { id: 'open-studio', group: 'Accessibility & Themes', label: 'Open Accessibility & FOV Studio Drawer', shortcut: 'Ctrl+Shift+A', keywords: 'scale font motion split', run: () => setStudioOpen(true) },
      { id: 'open-why', group: 'Thesis', label: 'Open “Why Purpose First?” Thesis Brief', keywords: 'inversion architecture', run: () => setWhyOpen(true) }
    ],
    [selectScenario, switchPersona]
  );

  return (
    <div className="app-shell">
      <a href="#main-workspace" className="skip-link">
        Skip to main content
      </a>

      {/* Clean Single-Row Top Command Header */}
      <header className="top-command-header" role="banner">
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

        {/* 3. Judge Quick Personas, 3-Coordinate Network Pill & Studio Triggers */}
        <div className="header-right-cluster">
          {/* 1-Click Judge Persona Switcher */}
          <div className="persona-switcher" role="group" aria-label="Judge quick personas and account sign-in">
            {['leader-aurora', 'builder-kai', 'builder-priya'].map(p => {
              const shortName = p.split('-')[1];
              const isCurrent = actorId === p;
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
              className="persona-chip account-trigger"
              onClick={() => setAuthModalOpen(true)}
              aria-label={`Account session (${actorId || 'Sign in'})`}
              title="scrypt Account Register / Sign-In / Logout"
            >
              <UserIcon size={14} />
              <span>{actorId && !['leader-aurora', 'builder-kai', 'builder-priya'].includes(actorId) ? actorId : 'Account'}</span>
            </button>
          </div>

          {/* 3-Coordinate Network Indicator Pill (Icons + Text + Semantic Tone — Never Color Alone) */}
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

          {/* Command Palette & Accessibility Studio Triggers */}
          <div className="studio-triggers">
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

      {/* Main Workspace (Supports Single Calm-Focus Surface OR 2-Panel Split Studio) */}
      <div className={`workspace-layout ${ergonomics.density === 'split-studio' ? 'is-split-studio' : ''}`}>
        <main
          id="main-workspace"
          tabIndex={-1}
          role="tabpanel"
          aria-labelledby={`tab-${activeView}`}
          className="main-surface"
        >
          {activeView === 'discover' && (
            <DiscoverView
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
              spawningDemo={spawningDemo}
            />
          )}

          {activeView === 'architect' && (
            <MissionArchitectView
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
              recs={recs}
              solving={solving}
              onRunSolveAndRecommend={runSolveAndRecommend}
              onAddCandidateToTeam={handleAddCandidateToTeam}
              onVerifyPersonSkill={handleVerifyPersonSkill}
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

        {/* Optional Split-Studio Side-by-Side Companion Telemetry Dock */}
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
                  Status: <code>{plan?.status || 'NOT_RUN'}</code> ({plan?.classification || '—'})
                </div>
                <div className="small-copy">
                  Quantifier: <code>{plan?.frontier?.quantifierStatus || '—'}</code>
                </div>
              </div>

              <div className="subcard top-gap-xs">
                <strong>3. Live Board Snapshot (<code>{eventId}</code>)</strong>
                <div className="small-copy top-gap-xs">
                  Total Crews: <strong>{totalTeams !== null ? totalTeams.toLocaleString() : board.length}</strong> · Last Read:{' '}
                  <strong>{boardLatencyMs !== null ? `${boardLatencyMs.toFixed(1)}ms` : '—'}</strong>
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
      <footer className="platform-footer" role="contentinfo">
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
            <strong>Post Sheet × Synchronicity</strong> · Layer-A SQLite <code>BEGIN IMMEDIATE</code> Serialized Seat Authority + Layer-B <code>AES-256-GCM</code> / <code>P-256</code> Peer Continuity
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
        onClose={() => setAuthModalOpen(false)}
        actorId={actorId}
        token={token}
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
    </div>
  );
}
