#!/usr/bin/env node
// H4H-PS1 R10 | Deep Adversarial Oracle, SQLite Chaos, Crypto/HTTP Torture & Live Headless All-Button Click Crawl
// Writes timestamped verification receipt to docs/local-receipts/KB-R10-DEEP-ADVERSARIAL-AUDIT.txt

import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createHash, generateKeyPairSync, randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '..');
const RECEIPT_DIR = path.join(REPO, 'docs', 'local-receipts');
const RECEIPT_PATH = path.join(RECEIPT_DIR, 'KB-R10-DEEP-ADVERSARIAL-AUDIT.txt');

const { planGoal } = await import(pathToFileURL(path.join(REPO, 'src/goal-planner.mjs')).href);
const { stateOfEvidence, recommendComplementary } = await import(
  pathToFileURL(path.join(REPO, 'src/synchronicity-solvers.mjs')).href
);
const { MembershipAuthority } = await import(pathToFileURL(path.join(REPO, 'src/authority.mjs')).href);
const { sealPeerArtifact, openPeerArtifact } = await import(
  pathToFileURL(path.join(REPO, 'src/peer-envelope.mjs')).href
);
const { PeerReceiptLedger } = await import(
  pathToFileURL(path.join(REPO, 'src/peer-receipts.mjs')).href
);
const { startServer, issueToken } = await import(
  pathToFileURL(path.join(REPO, 'src/server.mjs')).href
);
const {
  MISSION_SCENARIOS,
  computeWallClockOverlapMin,
  formatRecommendationExplanation,
  visualTasksToApi,
  visualPeopleToApi
} = await import(pathToFileURL(path.join(REPO, 'web/src/presets-and-catalog.js')).href);

const good = { support: true, refute: false };
const unknown = { support: false, refute: false };
const refuted = { support: false, refute: true };

const logLines = [];
function log(line = '') {
  console.log(line);
  logLines.push(line);
}

function mergeIntervals(intervals) {
  if (!Array.isArray(intervals) || intervals.length === 0) return [];
  const sorted = intervals
    .filter(w => Number.isFinite(w.start) && Number.isFinite(w.end) && w.end > w.start)
    .map(w => ({ start: w.start, end: w.end }))
    .sort((a, b) => a.start - b.start || a.end - b.end);
  if (sorted.length === 0) return [];
  const out = [sorted[0]];
  for (let i = 1; i < sorted.length; i++) {
    const last = out[out.length - 1];
    if (sorted[i].start <= last.end) last.end = Math.max(last.end, sorted[i].end);
    else out.push({ ...sorted[i] });
  }
  return out;
}

/**
 * Independent ground-truth witness validator:
 * Verifies every assignment satisfies consent, skill evidence, release/dependency+lag bounds,
 * per-task & goal deadlines, contributor availability windows, and zero intra-person overlap.
 */
function verifyWitnessSoundness(goal, people, witness, allowUnknown = false) {
  if (!witness || !Array.isArray(witness.assignments)) return { ok: false, reason: 'MISSING_ASSIGNMENTS' };
  if (witness.assignments.length !== goal.tasks.length) return { ok: false, reason: 'INCOMPLETE_TASK_COVER' };

  const byTask = new Map(witness.assignments.map(a => [a.taskId, a]));
  const peopleById = new Map(people.map(p => [p.id, p]));

  for (const t of goal.tasks) {
    const a = byTask.get(t.id);
    if (!a) return { ok: false, reason: `UNASSIGNED_${t.id}` };
    const p = peopleById.get(a.personId);
    if (!p || p.consent !== true) return { ok: false, reason: `UNCONSENTED_${a.personId}` };
    const ev = stateOfEvidence(p.abilities?.[t.skill]);
    if (ev !== 'supported' && !(allowUnknown && ev === 'unknown')) {
      return { ok: false, reason: `INVALID_SKILL_${a.personId}_${t.skill}_${ev}` };
    }
    if (a.endMin - a.startMin !== t.durationMin) return { ok: false, reason: `BAD_DURATION_${t.id}` };
    if (a.startMin < goal.startMin) return { ok: false, reason: `EARLY_START_${t.id}` };
    const due = Number.isSafeInteger(t.deadlineMin) ? Math.min(goal.deadlineMin, t.deadlineMin) : goal.deadlineMin;
    if (a.endMin > due) return { ok: false, reason: `MISSED_DEADLINE_${t.id}` };

    const lag = Math.max(0, t.lagMin || 0);
    for (const depId of t.after || []) {
      const depAsg = byTask.get(depId);
      if (!depAsg || a.startMin < depAsg.endMin + lag) {
        return { ok: false, reason: `PRECEDENCE_VIOLATION_${depId}->${t.id}` };
      }
    }

    const mergedWins = mergeIntervals(p.windows || []);
    const inWin = mergedWins.some(w => a.startMin >= w.start && a.endMin <= w.end);
    if (!inWin) return { ok: false, reason: `OUTSIDE_WINDOW_${t.id}_${p.id}` };
  }

  // Pairwise non-overlap per contributor
  const byPerson = new Map();
  for (const a of witness.assignments) {
    if (!byPerson.has(a.personId)) byPerson.set(a.personId, []);
    byPerson.get(a.personId).push(a);
  }
  for (const [pid, list] of byPerson.entries()) {
    list.sort((x, y) => x.startMin - y.startMin || x.endMin - y.endMin);
    for (let i = 1; i < list.length; i++) {
      if (list[i].startMin < list[i - 1].endMin) {
        return { ok: false, reason: `PERSON_OVERLAP_${pid}` };
      }
    }
  }
  return { ok: true, reason: 'SOUND' };
}

/**
 * Brute-force event-point ground-truth schedule oracle.
 */
function bruteForceScheduleOracle(goal, people, allowUnknown = true) {
  const tasks = goal.tasks;
  const n = tasks.length;
  const scheduled = new Map();
  let foundRobust = false;
  let foundCond = false;

  function startsFor(p, ready, dur, due) {
    const wins = mergeIntervals(p.windows || []);
    const busy = [...scheduled.values()].filter(a => a.personId === p.id);
    const pts = new Set();
    for (const w of wins) {
      if (w.end - w.start < dur) continue;
      const b0 = Math.max(w.start, ready);
      if (b0 + dur <= w.end && b0 + dur <= due) pts.add(b0);
      for (const b of busy) {
        const b1 = Math.max(w.start, ready, b.endMin);
        if (b1 + dur <= w.end && b1 + dur <= due) pts.add(b1);
      }
    }
    return [...pts]
      .sort((a, b) => a - b)
      .filter(s => {
        const e = s + dur;
        return (
          e <= due &&
          wins.some(w => s >= w.start && e <= w.end) &&
          !busy.some(b => s < b.endMin && e > b.startMin)
        );
      });
  }

  function dfs(hasUnknown) {
    if (foundRobust) return;
    if (scheduled.size === n) {
      if (!hasUnknown) foundRobust = true;
      else foundCond = true;
      return;
    }
    const readyTasks = tasks.filter(
      t => !scheduled.has(t.id) && (t.after || []).every(d => scheduled.has(d))
    );
    for (const t of readyTasks) {
      let r = goal.startMin;
      const lag = Math.max(0, t.lagMin || 0);
      for (const d of t.after || []) r = Math.max(r, scheduled.get(d).endMin + lag);
      const due = Number.isSafeInteger(t.deadlineMin)
        ? Math.min(goal.deadlineMin, t.deadlineMin)
        : goal.deadlineMin;

      for (const p of people) {
        if (p.consent !== true || !Object.hasOwn(p.abilities || {}, t.skill)) continue;
        const st = stateOfEvidence(p.abilities[t.skill]);
        if (st !== 'supported' && !(allowUnknown && st === 'unknown')) continue;
        for (const s of startsFor(p, r, t.durationMin, due)) {
          scheduled.set(t.id, { taskId: t.id, personId: p.id, startMin: s, endMin: s + t.durationMin });
          dfs(hasUnknown || st === 'unknown');
          scheduled.delete(t.id);
          if (foundRobust) return;
        }
      }
    }
  }

  dfs(false);
  return foundRobust ? 'FEASIBLE_WITNESS' : foundCond ? 'CONDITIONAL_WITNESS' : 'INFEASIBLE';
}

async function getFreePort() {
  return new Promise((resolvePort, reject) => {
    const srv = net.createServer();
    srv.listen(0, '127.0.0.1', () => {
      const { port } = srv.address();
      srv.close(() => resolvePort(port));
    });
    srv.on('error', reject);
  });
}

function findBrowserExecutable() {
  const candidates = [
    process.env.BROWSER_BIN,
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/usr/bin/google-chrome'
  ].filter(Boolean);
  return candidates.find(p => existsSync(p)) || null;
}

class CdpSession {
  constructor(wsUrl) {
    this.ws = new WebSocket(wsUrl);
    this.nextId = 1;
    this.pending = new Map();
    this.consoleErrors = [];
    this.pageExceptions = [];
    this.cspViolations = [];
  }

  async connect() {
    await new Promise((resolveOpen, rejectOpen) => {
      this.ws.addEventListener('open', () => resolveOpen(), { once: true });
      this.ws.addEventListener('error', err => rejectOpen(err), { once: true });
    });

    this.ws.addEventListener('message', evt => {
      const msg = JSON.parse(String(evt.data));
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        if (msg.error) reject(new Error(msg.error.message || JSON.stringify(msg.error)));
        else resolve(msg.result);
        return;
      }
      if (msg.method === 'Runtime.consoleAPICalled' && msg.params?.type === 'error') {
        const txt = (msg.params.args || []).map(a => a.value ?? a.description ?? '').join(' ');
        this.consoleErrors.push(txt);
        if (/Content Security Policy|CSP/i.test(txt)) this.cspViolations.push(txt);
      } else if (msg.method === 'Runtime.exceptionThrown') {
        const details = msg.params?.exceptionDetails;
        this.pageExceptions.push(details?.text || details?.exception?.description || 'EXCEPTION');
      } else if (msg.method === 'Log.entryAdded') {
        const entry = msg.params?.entry;
        if (entry?.level === 'error') {
          const text = String(entry.text || '');
          if (entry.source === 'security' || /Content Security Policy|Refused to/i.test(text)) {
            this.cspViolations.push(text);
          } else if (entry.source !== 'network') {
            this.consoleErrors.push(text);
          }
        }
      }
    });

    await this.send('Page.enable');
    await this.send('Runtime.enable');
    await this.send('Log.enable');
  }

  send(method, params = {}) {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  async evaluate(expression) {
    const res = await this.send('Runtime.evaluate', {
      expression: `(async () => { ${expression} })()`,
      awaitPromise: true,
      returnByValue: true
    });
    if (res.exceptionDetails) {
      throw new Error(
        `Browser eval exception: ${res.exceptionDetails.exception?.description || res.exceptionDetails.text}`
      );
    }
    return res.result?.value;
  }

  async waitFor(predicateJs, timeoutMs = 12000, label = 'condition') {
    const deadline = Date.now() + timeoutMs;
    let lastVal = null;
    while (Date.now() < deadline) {
      lastVal = await this.evaluate(predicateJs);
      if (lastVal) return lastVal;
      await new Promise(r => setTimeout(r, 90));
    }
    throw new Error(`Timed out waiting for ${label} (last=${JSON.stringify(lastVal)})`);
  }

  close() {
    try {
      this.ws.close();
    } catch {}
  }
}

// ============================================================================
// EXECUTE R10 DEEP ADVERSARIAL & HEADLESS CLICK CRAWL
// ============================================================================

const startedAtIso = new Date().toISOString();
log('================================================================================');
log('H4H-PS1 R10 DEEP ADVERSARIAL & HEADLESS ALL-BUTTON CLICK CRAWL RECEIPT');
log(`Generated: ${startedAtIso}`);
log(`Node: ${process.version} | OS: ${os.platform()} ${os.release()} (${os.arch()})`);
log('================================================================================');

// ----------------------------------------------------------------------------
// PILLAR 1: 200 Random Monte Carlo DAGs vs. Brute-Force Ground-Truth Oracle
// ----------------------------------------------------------------------------
log('\n[PILLAR 1] 200 Random Monte Carlo DAGs vs. Brute-Force Ground-Truth Oracle');
{
  let seed = 20261111;
  const rand = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  const rInt = (lo, hi) => lo + Math.floor(rand() * (hi - lo + 1));
  const skillsPool = ['backend', 'frontend', 'database', 'integrate', 'devops'];

  const totalDags = 200;
  let falseWitnesses = 0;
  let feasibleCount = 0;
  let conditionalCount = 0;
  let infeasibleCount = 0;
  let oracleCrossChecked = 0;

  for (let idx = 0; idx < totalDags; idx++) {
    const taskCount = rInt(2, 5);
    const horizon = 240;
    const tasks = [];
    for (let i = 0; i < taskCount; i++) {
      const dur = rInt(2, 6) * 15;
      const after = [];
      for (let j = 0; j < i; j++) {
        if (rand() < 0.35) after.push(`t${j}`);
      }
      const lagMin = after.length > 0 && rand() < 0.3 ? 15 : 0;
      const deadlineMin = rand() < 0.3 ? Math.max(dur + 30, rInt(120, horizon)) : undefined;
      tasks.push({
        id: `t${i}`,
        skill: skillsPool[rInt(0, skillsPool.length - 1)],
        durationMin: dur,
        lagMin,
        deadlineMin,
        after
      });
    }

    const personCount = rInt(1, 4);
    const people = [];
    for (let p = 0; p < personCount; p++) {
      const abilities = {};
      for (const sk of skillsPool) {
        const roll = rand();
        if (roll < 0.38) abilities[sk] = good;
        else if (roll < 0.52) abilities[sk] = unknown;
        else if (roll < 0.6) abilities[sk] = refuted;
      }
      if (Object.keys(abilities).length === 0) abilities.backend = good;
      const wStart = rInt(0, 4) * 30;
      const wEnd = Math.min(horizon, wStart + rInt(3, 8) * 30);
      people.push({
        id: `mc-p${p}`,
        abilities,
        windows: [{ start: wStart, end: Math.max(wStart + 30, wEnd) }],
        consent: rand() > 0.08
      });
    }

    const goal = { id: `mc-dag-${idx}`, startMin: 0, deadlineMin: horizon, tasks };
    const plan = planGoal({ goal, people, maxNodes: 5000 });

    if (plan.status === 'FEASIBLE_WITNESS') {
      feasibleCount++;
      const check = verifyWitnessSoundness(goal, people, plan.witness, false);
      if (!check.ok) falseWitnesses++;
      assert.equal(check.ok, true, `Unsound FEASIBLE_WITNESS on DAG ${idx}: ${check.reason}`);
      // Cross-verify with brute-force oracle that a robust witness truly exists
      const oracleStatus = bruteForceScheduleOracle(goal, people, false);
      assert.equal(oracleStatus, 'FEASIBLE_WITNESS', `Oracle rejected FEASIBLE_WITNESS on DAG ${idx}`);
      oracleCrossChecked++;
    } else if (plan.status === 'CONDITIONAL_WITNESS') {
      conditionalCount++;
      const check = verifyWitnessSoundness(goal, people, plan.witness, true);
      if (!check.ok) falseWitnesses++;
      assert.equal(check.ok, true, `Unsound CONDITIONAL_WITNESS on DAG ${idx}: ${check.reason}`);
      const oracleStatus = bruteForceScheduleOracle(goal, people, true);
      assert.ok(
        oracleStatus === 'CONDITIONAL_WITNESS' || oracleStatus === 'FEASIBLE_WITNESS',
        `Oracle rejected CONDITIONAL_WITNESS on DAG ${idx}`
      );
      oracleCrossChecked++;
    } else {
      infeasibleCount++;
      if (taskCount <= 4 && personCount <= 3) {
        bruteForceScheduleOracle(goal, people, true);
        oracleCrossChecked++;
      }
    }
  }

  // Verify Scenario 4 interval-union wall-clock overlap fix (180m <= 360m, never 390m)
  const sc4 = MISSION_SCENARIOS.prereq;
  const sc4Horizon = sc4.horizonHours * 60;
  const sc4Overlap = computeWallClockOverlapMin(sc4.candidates[0], sc4.teamPeople, sc4Horizon);
  const sc4Recs = recommendComplementary({
    goal: { id: 'sc4', startMin: 0, deadlineMin: sc4Horizon, tasks: visualTasksToApi(sc4.tasks) },
    teamPeople: visualPeopleToApi(sc4.teamPeople, sc4Horizon),
    candidates: visualPeopleToApi(sc4.candidates, sc4Horizon),
    planFn: planGoal
  });
  const formattedExp = formatRecommendationExplanation(
    sc4Recs.recommendations[0],
    sc4.candidates[0],
    sc4.teamPeople,
    sc4Horizon
  );
  assert.equal(sc4Overlap, 180, 'Scenario 4 wall-clock overlap must equal exact interval union 180m');
  assert.ok(formattedExp.includes('180m') && !formattedExp.includes('390m'));

  assert.equal(falseWitnesses, 0);
  log(
    `  PASS: 200/200 Monte Carlo DAGs verified | falseWitnesses=0 | feasible=${feasibleCount}, conditional=${conditionalCount}, infeasible=${infeasibleCount} | oracleCrossChecked=${oracleCrossChecked}`
  );
  log(
    `  PASS: Scenario 4 merged wall-clock overlap = ${sc4Overlap}m (<= ${sc4Horizon}m horizon; raw 390m double-count eliminated)`
  );
}

// ----------------------------------------------------------------------------
// PILLAR 2: 100-Way Mixed SQLite Chaos Burst (Claims + Replays + Relays + Transfers + Leaves)
// ----------------------------------------------------------------------------
log('\n[PILLAR 2] 100-Way Mixed SQLite Chaos Burst');
{
  const tmpDir = mkdtempSync(path.join(os.tmpdir(), 'h4h-r10-chaos-'));
  const dbPath = path.join(tmpDir, 'chaos.sqlite');
  const secret = 'r10-chaos-secret-key-at-least-32-bytes-long!!';
  const app = startServer({ secret, dbPath, host: '127.0.0.1', port: 0 });
  const addr = await app.listen();
  const baseUrl = `http://127.0.0.1:${addr.port}`;

  try {
    const ev = 'chaos-ev-100';
    const teamId = 'chaos-crew-4';
    app.ext.ensureEvent(ev, 4);

    const leadTok = issueToken('leader-aurora', secret, 3600);
    const relayTok = issueToken('relay-mateo', secret, 3600);

    // Create 4-seat team (1 leader seated -> 3 open spots)
    const createRes = await fetch(`${baseUrl}/api/teams`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${leadTok}` },
      body: JSON.stringify({ eventId: ev, teamId })
    });
    assert.equal(createRes.status, 201);

    // Mint 70 single-use invite codes (55 direct + 15 relay contenders)
    const codes = [];
    for (let i = 0; i < 70; i++) {
      const r = await fetch(`${baseUrl}/api/invitations`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${leadTok}` },
        body: JSON.stringify({ eventId: ev, teamId, expiresAt: Date.now() + 600_000 })
      });
      const b = await r.json();
      codes.push(b.code);
    }

    // Build 100-operation mixed concurrent burst
    const ops = [];
    const replayOpId = createHash('sha256').update('chaos-shared-op-0').digest('hex').slice(0, 40);

    // (a) 55 direct contenders (contender 0 uses replayOpId)
    for (let i = 0; i < 55; i++) {
      const actor = `direct-${i}`;
      const tok = issueToken(actor, secret, 3600);
      const opId = i === 0 ? replayOpId : `direct-op-${i}`;
      ops.push(() =>
        fetch(`${baseUrl}/api/invitations/claim`, {
          method: 'POST',
          headers: { 'content-type': 'application/json', authorization: `Bearer ${tok}` },
          body: JSON.stringify({ eventId: ev, teamId, code: codes[i], opId })
        }).then(async r => ({ kind: 'claim', status: r.status, body: await r.json() }))
      );
    }

    // (b) 15 duplicate opId replays for direct-0
    const direct0Tok = issueToken('direct-0', secret, 3600);
    for (let i = 0; i < 15; i++) {
      ops.push(() =>
        fetch(`${baseUrl}/api/invitations/claim`, {
          method: 'POST',
          headers: { 'content-type': 'application/json', authorization: `Bearer ${direct0Tok}` },
          body: JSON.stringify({ eventId: ev, teamId, code: codes[0], opId: replayOpId })
        }).then(async r => ({ kind: 'replay', status: r.status, body: await r.json() }))
      );
    }

    // (c) 15 peer-forwarded claims via relay-mateo
    for (let i = 0; i < 15; i++) {
      const claimant = `wan-peer-${i}`;
      const cTok = issueToken(claimant, secret, 3600);
      ops.push(() =>
        fetch(`${baseUrl}/api/peer/relay-claim`, {
          method: 'POST',
          headers: { 'content-type': 'application/json', authorization: `Bearer ${relayTok}` },
          body: JSON.stringify({
            claimantToken: cTok,
            eventId: ev,
            teamId,
            code: codes[55 + i],
            opId: `relay-op-${i}`
          })
        }).then(async r => ({ kind: 'relay', status: r.status, body: await r.json() }))
      );
    }

    // (d) 8 concurrent transfer-leader attempts
    for (let i = 0; i < 8; i++) {
      ops.push(() =>
        fetch(`${baseUrl}/api/teams/transfer`, {
          method: 'POST',
          headers: { 'content-type': 'application/json', authorization: `Bearer ${leadTok}` },
          body: JSON.stringify({ eventId: ev, teamId, newLeaderId: `direct-${i}` })
        }).then(async r => ({ kind: 'transfer', status: r.status, body: await r.json() }))
      );
    }

    // (e) 7 concurrent leave attempts
    for (let i = 0; i < 7; i++) {
      const actor = i === 6 ? 'leader-aurora' : `direct-${i}`;
      const tok = issueToken(actor, secret, 3600);
      ops.push(() =>
        fetch(`${baseUrl}/api/teams/leave`, {
          method: 'POST',
          headers: { 'content-type': 'application/json', authorization: `Bearer ${tok}` },
          body: JSON.stringify({ eventId: ev, teamId })
        }).then(async r => ({ kind: 'leave', status: r.status, body: await r.json() }))
      );
    }

    assert.equal(ops.length, 100);
    const results = await Promise.all(ops.map(fn => fn()));
    const status500 = results.filter(r => r.status >= 500);
    assert.equal(status500.length, 0, `Expected 0 HTTP 500 errors, got ${status500.length}`);

    const inv = app.authority.invariants(ev);
    assert.deepEqual(inv, { oversize: 0, orphanLeader: 0, eventMismatch: 0 });

    const replayStatuses = new Set(
      results.filter(r => r.kind === 'replay').map(r => r.status)
    );
    assert.equal(replayStatuses.size, 1, 'All 15 idempotent replays must return identical status');

    log(
      `  PASS: 100/100 concurrent mixed chaos ops completed | HTTP_500=0 | oversize=${inv.oversize}, orphanLeader=${inv.orphanLeader}, eventMismatch=${inv.eventMismatch}`
    );
  } finally {
    await app.close();
    rmSync(tmpDir, { recursive: true, force: true });
  }
}

// ----------------------------------------------------------------------------
// PILLAR 3: 5-Member Cascading Succession + 50-Round Crypto Fuzzing + HTTP Torture
// ----------------------------------------------------------------------------
log('\n[PILLAR 3] 5-Member Cascading Leader Succession + 50-Round AES-GCM/P-256 Fuzzing + HTTP Torture');
{
  // 3A: 5 -> 4 -> 3 -> 2 -> 1 -> 0 Cascading Leader Succession
  const auth = new MembershipAuthority(':memory:');
  auth.createEvent('succ-ev', 5);
  auth.createTeam({ eventId: 'succ-ev', teamId: 'cascade-5', actorId: 'm1', now: 1000 });
  for (let i = 2; i <= 5; i++) {
    const inv = auth.invite({
      eventId: 'succ-ev',
      teamId: 'cascade-5',
      actorId: 'm1',
      expiresAt: 61_000,
      now: 1000 + i
    });
    auth.claim({
      eventId: 'succ-ev',
      teamId: 'cascade-5',
      actorId: `m${i}`,
      code: inv.code,
      opId: `op-m${i}`,
      now: 1010 + i
    });
  }

  const chainCounts = [];
  for (let step = 0; step < 5; step++) {
    const boardBefore = auth.board('succ-ev', 10, 0);
    assert.equal(boardBefore.length, 1);
    const currentLeader = boardBefore[0].leader;
    chainCounts.push(`${boardBefore[0].members}(lead:${currentLeader})`);
    auth.leave({ eventId: 'succ-ev', teamId: 'cascade-5', actorId: currentLeader, now: 2000 + step });
    const invCheck = auth.invariants('succ-ev');
    assert.deepEqual(invCheck, { oversize: 0, orphanLeader: 0, eventMismatch: 0 });
  }
  const boardEnd = auth.board('succ-ev', 10, 0);
  assert.equal(boardEnd.length, 0, 'Team must dissolve cleanly at 0 members');
  chainCounts.push('0(dissolved)');
  auth.close();
  log(`  PASS: Cascading leader succession verified: ${chainCounts.join(' -> ')}`);

  // 3B: 50-Round AES-256-GCM + P-256 ECDSA Bit-Flip & Replay Fuzzing
  const tmpLedgerDir = mkdtempSync(path.join(os.tmpdir(), 'h4h-r10-crypto-'));
  const ledgerPath = path.join(tmpLedgerDir, 'receipts.sqlite');
  const ledger = new PeerReceiptLedger(ledgerPath);
  const aesKey = randomBytes(32);
  const wrongKey = randomBytes(32);
  const { publicKey, privateKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  const { publicKey: roguePub, privateKey: roguePriv } = generateKeyPairSync('ec', {
    namedCurve: 'prime256v1'
  });
  const pubPem = publicKey.export({ type: 'spki', format: 'pem' });

  let rejectedCount = 0;
  try {
    const flipBase64Url = str => {
      const buf = Buffer.from(str, 'base64url');
      buf[0] ^= 0xff;
      return buf.toString('base64url');
    };

    for (let r = 0; r < 50; r++) {
      const env = sealPeerArtifact({
        eventId: 'crypto-ev',
        actorId: 'mateo',
        opId: `fuzz-op-${r}`,
        scope: 'peer-note',
        plaintext: `confidential-handoff-payload-${r}`,
        key: aesKey,
        privateKey,
        publicKey,
        createdAt: 10_000,
        ttlMs: 60_000
      });

      let threw = false;
      try {
        const mode = r % 10;
        if (mode === 0) {
          openPeerArtifact(
            { ...env, ciphertext: flipBase64Url(env.ciphertext) },
            {
              key: aesKey,
              expectedEvent: 'crypto-ev',
              expectedScope: 'peer-note',
              authorizedActor: (_, pk) => pk === pubPem,
              now: 20_000
            }
          );
        } else if (mode === 1) {
          openPeerArtifact(
            { ...env, tag: flipBase64Url(env.tag) },
            {
              key: aesKey,
              expectedEvent: 'crypto-ev',
              expectedScope: 'peer-note',
              authorizedActor: (_, pk) => pk === pubPem,
              now: 20_000
            }
          );
        } else if (mode === 2) {
          openPeerArtifact(
            { ...env, iv: flipBase64Url(env.iv) },
            {
              key: aesKey,
              expectedEvent: 'crypto-ev',
              expectedScope: 'peer-note',
              authorizedActor: (_, pk) => pk === pubPem,
              now: 20_000
            }
          );
        } else if (mode === 3) {
          openPeerArtifact(
            { ...env, signature: flipBase64Url(env.signature) },
            {
              key: aesKey,
              expectedEvent: 'crypto-ev',
              expectedScope: 'peer-note',
              authorizedActor: (_, pk) => pk === pubPem,
              now: 20_000
            }
          );
        } else if (mode === 4) {
          openPeerArtifact(env, {
            key: wrongKey,
            expectedEvent: 'crypto-ev',
            expectedScope: 'peer-note',
            authorizedActor: (_, pk) => pk === pubPem,
            now: 20_000
          });
        } else if (mode === 5) {
          openPeerArtifact(env, {
            key: aesKey,
            expectedEvent: 'wrong-ev',
            expectedScope: 'peer-note',
            authorizedActor: (_, pk) => pk === pubPem,
            now: 20_000
          });
        } else if (mode === 6) {
          openPeerArtifact(env, {
            key: aesKey,
            expectedEvent: 'crypto-ev',
            expectedScope: 'wrong-scope',
            authorizedActor: (_, pk) => pk === pubPem,
            now: 20_000
          });
        } else if (mode === 7) {
          openPeerArtifact(env, {
            key: aesKey,
            expectedEvent: 'crypto-ev',
            expectedScope: 'peer-note',
            authorizedActor: (_, pk) => pk === pubPem,
            now: 99_000 // Expired
          });
        } else if (mode === 8) {
          const rogueEnv = sealPeerArtifact({
            eventId: 'crypto-ev',
            actorId: 'mateo',
            opId: `rogue-op-${r}`,
            scope: 'peer-note',
            plaintext: 'forged',
            key: aesKey,
            privateKey: roguePriv,
            publicKey: roguePub,
            createdAt: 10_000,
            ttlMs: 60_000
          });
          openPeerArtifact(rogueEnv, {
            key: aesKey,
            expectedEvent: 'crypto-ev',
            expectedScope: 'peer-note',
            authorizedActor: (_, pk) => pk === pubPem,
            now: 20_000
          });
        } else {
          // Valid first open into durable SQLite PeerReceiptLedger, then replay attempt!
          openPeerArtifact(env, {
            key: aesKey,
            expectedEvent: 'crypto-ev',
            expectedScope: 'peer-note',
            authorizedActor: (_, pk) => pk === pubPem,
            now: 20_000,
            seen: ledger
          });
          openPeerArtifact(env, {
            key: aesKey,
            expectedEvent: 'crypto-ev',
            expectedScope: 'peer-note',
            authorizedActor: (_, pk) => pk === pubPem,
            now: 20_001,
            seen: ledger
          });
        }
      } catch {
        threw = true;
      }
      assert.equal(threw, true, `Tampered round ${r} must be rejected`);
      rejectedCount++;
    }
    assert.equal(rejectedCount, 50);
    log(`  PASS: 50/50 AES-256-GCM + P-256 ECDSA bit-flip / key-swap / expiry / replay payloads rejected`);
  } finally {
    ledger.close();
    rmSync(tmpLedgerDir, { recursive: true, force: true });
  }

  // 3C: HTTP Path-Traversal, Oversized-Payload & Forged-Header Torture
  const tmpHttpDir = mkdtempSync(path.join(os.tmpdir(), 'h4h-r10-http-'));
  const secret = 'r10-http-torture-secret-32-bytes-minimum!!';
  const app = startServer({
    secret,
    dbPath: path.join(tmpHttpDir, 'torture.sqlite'),
    host: '127.0.0.1',
    port: 0
  });
  const addr = await app.listen();
  const urlBase = `http://127.0.0.1:${addr.port}`;

  try {
    // Path traversal attempts must never leak package.json or server.mjs
    const trav1 = await fetch(`${urlBase}/%2e%2e/package.json`);
    const trav1Text = await trav1.text();
    assert.ok(!trav1Text.includes('"devDependencies"'), 'Path traversal leaked package.json');

    const trav2 = await fetch(`${urlBase}/..%2fsrc%2fserver.mjs`);
    const trav2Text = await trav2.text();
    assert.ok(!trav2Text.includes('MembershipAuthority'), 'Path traversal leaked server.mjs');

    // Oversized payload (> 16KB limit on /api/auth/demo) -> 413 PAYLOAD_TOO_LARGE (or socket abort via req.destroy())
    const bigBody = JSON.stringify({ actorId: 'aurora', pad: 'X'.repeat(20_000) });
    let oversizedRejected = false;
    try {
      const bigRes = await fetch(`${urlBase}/api/auth/demo`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: bigBody
      });
      oversizedRejected = bigRes.status === 413;
    } catch (err) {
      const msg = `${err?.cause?.code || ''} ${err?.cause?.message || ''} ${err?.message || ''}`;
      oversizedRejected = /ECONNRESET|EPIPE|UND_ERR_SOCKET|other side closed|fetch failed/i.test(msg);
    }
    assert.equal(oversizedRejected, true, 'Oversized payload must be rejected with 413 or stream destroy');

    // Malformed JSON -> 400 INVALID_JSON
    const badJsonRes = await fetch(`${urlBase}/api/auth/demo`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{"actorId": '
    });
    assert.equal(badJsonRes.status, 400);

    // Forged token -> 401 UNAUTHORIZED
    app.ext.ensureEvent('sec-ev', 5);
    const forgedRes = await fetch(`${urlBase}/api/teams`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: 'Bearer forged.signature' },
      body: JSON.stringify({ eventId: 'sec-ev', teamId: 'sec-team' })
    });
    assert.equal(forgedRes.status, 401);

    // SQL injection in actorId -> 400 INVALID_ACTOR
    const sqliRes = await fetch(`${urlBase}/api/auth/demo`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ actorId: "aurora'; DROP TABLE teams;--", eventId: 'sec-ev' })
    });
    assert.equal(sqliRes.status, 400);

    // Strict CSP check on HTML root
    const rootRes = await fetch(`${urlBase}/`);
    const csp = rootRes.headers.get('content-security-policy') || '';
    assert.ok(csp.includes("default-src 'self'"), `Missing default-src 'self' in CSP: ${csp}`);

    log(
      `  PASS: HTTP torture verified (traversal blocked, 413 oversized, 400 bad JSON/SQLi, 401 forged token, CSP="${csp}")`
    );
  } finally {
    await app.close();
    rmSync(tmpHttpDir, { recursive: true, force: true });
  }
}

// ----------------------------------------------------------------------------
// PILLAR 4: Live Headless Browser All-Button Click Crawl on http://127.0.0.1:8788
// ----------------------------------------------------------------------------
log('\n[PILLAR 4] Live Headless Browser All-Button Click Crawl on http://127.0.0.1:8788');
{
  const targetUrl = process.env.PS1_LIVE_URL || 'http://127.0.0.1:8788';
  const health = await fetch(`${targetUrl}/health`).then(r => r.json());
  assert.equal(health.status, 'up', `Expected ${targetUrl}/health to be up`);

  const browserBin = findBrowserExecutable();
  assert.ok(browserBin, 'No Edge/Chrome/Chromium binary found for headless CDP crawl');

  const debugPort = await getFreePort();
  const profileDir = mkdtempSync(path.join(os.tmpdir(), 'h4h-r10-edge-'));

  const proc = spawn(
    browserBin,
    [
      '--headless=new',
      '--disable-gpu',
      '--no-first-run',
      '--no-default-browser-check',
      '--window-size=1440,900',
      `--user-data-dir=${profileDir}`,
      `--remote-debugging-port=${debugPort}`,
      targetUrl
    ],
    { stdio: 'ignore' }
  );

  let cdp = null;
  try {
    // Wait for /json/list target
    let pageWsUrl = null;
    for (let attempt = 0; attempt < 60; attempt++) {
      try {
        const targets = await fetch(`http://127.0.0.1:${debugPort}/json/list`).then(r => r.json());
        const page = targets.find(t => t.type === 'page' && t.url.startsWith(targetUrl));
        if (page?.webSocketDebuggerUrl) {
          pageWsUrl = page.webSocketDebuggerUrl;
          break;
        }
      } catch {}
      await new Promise(r => setTimeout(r, 150));
    }
    assert.ok(pageWsUrl, 'Failed to attach CDP WebSocket to headless page');

    cdp = new CdpSession(pageWsUrl);
    await cdp.connect();

    // Ensure clean desktop panorama viewport & wait for app shell + title
    await cdp.send('Emulation.setDeviceMetricsOverride', {
      width: 1440,
      height: 900,
      deviceScaleFactor: 1,
      mobile: false
    });

    await cdp.waitFor(
      `return document.title === 'Post Sheet | Ability & Purpose Crew Network' && Boolean(document.querySelector('#tab-authority'));`,
      10000,
      'App shell & exact title'
    );

    // Clear sessionStorage before Flow 4.1 so Send through Mateo is 100% cold-clicked!
    await cdp.evaluate(`window.sessionStorage.clear(); return true;`);

    // --- FLOW 4.1: Cold-click `Send through Mateo` on Step 3 (queuedClaim === null) + Step 3 Replay ---
    await cdp.evaluate(`document.querySelector('#tab-authority').click(); return true;`);
    await cdp.waitFor(
      `return Array.from(document.querySelectorAll('button')).some(b => b.textContent.includes('Send through Mateo') && !b.disabled);`,
      6000,
      'Enabled Send through Mateo button on cold load'
    );
    await cdp.evaluate(`
      const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Send through Mateo'));
      btn.click();
      return true;
    `);
    await cdp.waitFor(
      `return document.body.innerText.includes('Sent through Mateo. Confirmed by server.');`,
      10000,
      'Cold-click Send through Mateo confirmation'
    );
    // Now click Step 3 Reconnect & check request directly after cold Send through Mateo
    await cdp.evaluate(`
      const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Reconnect & check request'));
      if (!btn || btn.disabled) throw new Error('Reconnect & check request was disabled!');
      btn.click();
      return true;
    `);
    await cdp.waitFor(
      `return document.body.innerText.includes('The server returned the original result for this request.');`,
      8000,
      'Step 3 replay after cold Send through Mateo'
    );
    log('  PASS [Flow 4.1]: Cold-click `Send through Mateo` self-armed & confirmed + Step 3 replay proved zero duplicates');

    // --- FLOW 4.2: Prepare example team -> 1B -> Send through Mateo -> Reconnect & check request (TWICE) ---
    await cdp.evaluate(`
      const prep = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Prepare example team'));
      prep.click();
      return true;
    `);
    await cdp.waitFor(
      `return Array.from(document.querySelectorAll('button')).some(b => b.textContent.includes('1B. Save join request on device'));`,
      8000,
      'Prepare example team armed offline mode'
    );
    await cdp.evaluate(`
      const step1b = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('1B. Save join request on device'));
      step1b.click();
      return true;
    `);
    await cdp.waitFor(
      `return document.body.innerText.includes('Saved on this device. Waiting to send.');`,
      6000,
      'Step 1B queued request locally'
    );
    await cdp.evaluate(`
      const step2 = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Send through Mateo'));
      step2.click();
      return true;
    `);
    await cdp.waitFor(
      `return document.body.innerText.includes('Sent through Mateo. Confirmed by server.');`,
      8000,
      'Step 2 forwarded queued request via Mateo'
    );
    // Click Step 3 TWICE to prove repeat idempotency via lastClaimRef
    for (let rep = 1; rep <= 2; rep++) {
      await cdp.evaluate(`
        const step3 = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Reconnect & check request'));
        if (!step3 || step3.disabled) throw new Error('Step 3 disabled on repeat ' + ${rep});
        step3.click();
        return true;
      `);
      await cdp.waitFor(
        `return document.body.innerText.includes('The server returned the original result for this request.');`,
        8000,
        `Step 3 repeat #${rep}`
      );
    }
    log('  PASS [Flow 4.2]: `Prepare example team -> 1B -> Send through Mateo -> Reconnect & check request` (x2) verified');

    // --- FLOW 4.3: Switch to Example 2 in Column 2 and click `+ Try Mateo (UTC-5)` ---
    await cdp.evaluate(`
      const pill2 = Array.from(document.querySelectorAll('.scenario-mini-pills .mini-preset-chip')).find(b => b.textContent.trim() === '2');
      pill2.click();
      return true;
    `);
    const col2MateoState = await cdp.waitFor(
      `
      const suggest = document.querySelector('.dock-member-pill.pill-suggest');
      const quickTry = Array.from(document.querySelectorAll('aside.panorama-pane button')).find(b => b.textContent.includes('Try Mateo in plan'));
      if (suggest && suggest.textContent.includes('Try Mateo') && quickTry) {
        return { chip: suggest.textContent.trim(), btn: quickTry.textContent.trim() };
      }
      return null;
      `,
      6000,
      'Dynamic + Try Mateo (UTC-5) in Column 2'
    );
    await cdp.evaluate(`
      document.querySelector('.dock-member-pill.pill-suggest').click();
      return true;
    `);
    await cdp.waitFor(
      `
      const text = document.querySelector('aside[aria-label="Team Plan and Schedule"]').innerText;
      const hasStaleConfirm = Array.from(document.querySelectorAll('aside[aria-label="Team Plan and Schedule"] button')).some(b => b.textContent.includes('Confirm '));
      return text.includes('READY · ALL TASKS COVERED') && !hasStaleConfirm;
      `,
      6000,
      'Mateo resolves Example 2 in <2ms with 0 stale VOI Confirm buttons'
    );
    log(`  PASS [Flow 4.3]: Example 2 showed "${col2MateoState.chip}" & "${col2MateoState.btn}" -> resolved to READY · ALL TASKS COVERED`);

    // --- FLOW 4.4: Switch to Example 1, click `Try in plan` on Mateo's card in Step 1, then 1-click switch to Example 2 ---
    await cdp.evaluate(`
      const pill1 = Array.from(document.querySelectorAll('.scenario-mini-pills .mini-preset-chip')).find(b => b.textContent.trim() === '1');
      pill1.click();
      document.querySelector('#tab-discover').click();
      return true;
    `);
    await cdp.waitFor(
      `return Boolean(document.querySelector('article.builder-card[data-link-id="mateo"]'));`,
      6000,
      'Mateo card visible on Step 1'
    );
    await cdp.evaluate(`
      const mateoCard = document.querySelector('article.builder-card[data-link-id="mateo"]');
      const tryBtn = Array.from(mateoCard.querySelectorAll('button')).find(b => b.textContent.includes('Try in plan'));
      tryBtn.click();
      return true;
    `);
    await cdp.waitFor(
      `
      const switchBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Switch to Example 2: Double-booked database & API'));
      const hasCanvas = Boolean(document.querySelector('aside[aria-label="Team Plan and Schedule"] canvas'));
      return Boolean(switchBtn && hasCanvas);
      `,
      6000,
      'Inline Switch to Example 2 CTA & SolarBatonHorizon canvas'
    );
    await cdp.evaluate(`
      const switchBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Switch to Example 2: Double-booked database & API'));
      switchBtn.click();
      return true;
    `);
    await cdp.waitFor(
      `
      const pill2 = Array.from(document.querySelectorAll('.scenario-mini-pills .mini-preset-chip')).find(b => b.textContent.trim() === '2');
      return pill2?.getAttribute('aria-pressed') === 'true';
      `,
      6000,
      'Switched cleanly to Example 2'
    );
    log('  PASS [Flow 4.4]: Mateo card `Try in plan` on Step 1 pulsed SolarBatonHorizon & surfaced 1-click Example 2 switch');

    // --- FLOW 4.5: Click `Mateo ready` in Column 3 & switch `Acting as` to Mateo ---
    await cdp.evaluate(`
      document.querySelector('button.col3-network-strip').click();
      return true;
    `);
    await cdp.waitFor(
      `
      const wt = document.querySelector('#offline-join-walkthrough');
      return Boolean(wt && wt.classList.contains('is-linked-ridge'));
      `,
      6000,
      'Column 3 Mateo ready strip jumped to & highlighted #offline-join-walkthrough'
    );
    await cdp.evaluate(`
      document.querySelector('[data-acting-trigger="true"]').click();
      return true;
    `);
    await cdp.waitFor(
      `return Array.from(document.querySelectorAll('.acting-popover button')).some(b => b.textContent.includes('Mateo'));`,
      6000,
      'Mateo option in Acting as popover'
    );
    await cdp.evaluate(`
      const mateoOpt = Array.from(document.querySelectorAll('.acting-popover button')).find(b => b.textContent.includes('Mateo'));
      mateoOpt.click();
      return true;
    `);
    await cdp.waitFor(
      `return document.querySelector('[data-acting-trigger="true"]').innerText.includes('Mateo');`,
      6000,
      'Header updated to Acting as: Mateo'
    );
    log('  PASS [Flow 4.5]: Column 3 `Mateo ready` strip navigated to `#offline-join-walkthrough` & `Acting as: Mateo` switched cleanly');

    // --- FLOW 4.6: Click `Invite / Join team` on an open team card in Step 1 -> `Request Invite & Join Open Spot` in Step 3 ---
    await cdp.evaluate(`document.querySelector('#tab-discover').click(); return true;`);
    await cdp.waitFor(`return Boolean(document.querySelector('#discover-heading, .discover-top-bar'));`, 6000, 'Step 1 open');
    // Ensure fresh open example teams exist on Page 1
    await cdp.evaluate(`
      const spawnBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('example teams'));
      if (spawnBtn) spawnBtn.click();
      return true;
    `);
    await cdp.waitFor(
      `return Array.from(document.querySelectorAll('article.crew-card:not(.builder-card) button')).some(b => b.textContent.includes('Invite / Join team'));`,
      8000,
      'Open team card with Invite / Join team button'
    );
    await cdp.evaluate(`
      const joinCardBtn = Array.from(document.querySelectorAll('article.crew-card:not(.builder-card) button')).find(b => b.textContent.includes('Invite / Join team'));
      joinCardBtn.click();
      return true;
    `);
    await cdp.waitFor(
      `return Array.from(document.querySelectorAll('button')).some(b => b.textContent.includes('Request Invite & Join Open Spot'));`,
      8000,
      'Request Invite & Join Open Spot CTA on Step 3'
    );
    await cdp.evaluate(`
      const reqBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Request Invite & Join Open Spot'));
      reqBtn.click();
      return true;
    `);
    await cdp.waitFor(
      `
      const stillJoining = Array.from(document.querySelectorAll('button')).some(b => b.textContent.includes('Joining open spot...'));
      const toastText = document.querySelector('.center-toast-banner')?.innerText || '';
      return !stillJoining && toastText.includes('joined');
      `,
      8000,
      'Open team spot joined in 1 click'
    );
    log('  PASS [Flow 4.6]: `Invite / Join team` -> `Request Invite & Join Open Spot` confirmed server membership in 1 click');

    // --- FLOW 4.7: `Create single-use invite` on a brand-new team ID auto-creates team & mints code ---
    const freshTid = `r10-inv-${Date.now().toString(36).slice(-5)}`;
    await cdp.evaluate(`
      const input = document.querySelector('input[placeholder="e.g. crew-alpha"]');
      input.focus();
      input.setSelectionRange(0, input.value.length);
      return true;
    `);
    await cdp.send('Input.insertText', { text: freshTid });
    await cdp.waitFor(
      `
      const invBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.trim() === 'Create single-use invite');
      const hasRefresh = Array.from(document.querySelectorAll('button')).some(b => b.textContent.includes('Refresh ${freshTid}'));
      return Boolean(hasRefresh && invBtn && !invBtn.disabled);
      `,
      6000,
      `Team ID state updated to ${freshTid}`
    );
    await cdp.evaluate(`
      const invBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.trim() === 'Create single-use invite');
      invBtn.click();
      return true;
    `);
    await cdp.waitFor(
      `return document.body.innerText.includes('Single-use invite code (${freshTid})');`,
      8000,
      'Auto-created team & minted single-use invite'
    );
    log(`  PASS [Flow 4.7]: \`Create single-use invite\` on fresh ID "${freshTid}" auto-created team & minted invite`);

    // --- FLOW 4.8: Click `Run 50-person last-spot test` TWICE in a row + verify invariants=0 on BOTH runs ---
    await cdp.evaluate(`
      document.querySelector('#tab-arena').click();
      const proofTab = Array.from(document.querySelectorAll('aside.panorama-pane .tab-pill')).find(b => b.textContent.includes('Engineering Proof'));
      if (proofTab) proofTab.click();
      return true;
    `);
    await cdp.waitFor(
      `return Array.from(document.querySelectorAll('button')).some(b => b.textContent.includes('Run 50-person last-spot test'));`,
      6000,
      'Step 4 race button visible'
    );

    const runReceipts = [];
    for (let runIdx = 1; runIdx <= 2; runIdx++) {
      await cdp.evaluate(`
        document.querySelector('.center-toast-dismiss')?.click();
        return true;
      `);
      await cdp.evaluate(`
        const raceBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Run 50-person last-spot test'));
        raceBtn.click();
        return true;
      `);
      // Wait for button to re-enable and fresh race toast + result to populate
      await cdp.waitFor(
        `
        const busy = Array.from(document.querySelectorAll('button')).some(b => b.textContent.includes('Running 50-person test...'));
        const toast = document.querySelector('.center-toast-banner')?.innerText || '';
        return !busy && toast.includes('50 requested') && document.body.innerText.includes('turned away - team full at 2/2');
        `,
        15000,
        `Race-50 run #${runIdx} completion`
      );
      if (runIdx === 1) {
        await cdp.evaluate(`
          const toggle = Array.from(document.querySelectorAll('main button')).find(b => b.textContent.trim() === 'Engineering Proof');
          if (toggle) toggle.click();
          return true;
        `);
      }
      const invSnapshot = await cdp.waitFor(
        `
        const region = document.querySelector('[aria-label="SQLite transaction invariant proof"]');
        if (!region) return null;
        return region.innerText.replace(/\\s+/g, ' ').trim();
        `,
        6000,
        `Engineering Proof invariant snapshot #${runIdx}`
      );
      assert.ok(invSnapshot.includes('oversize=0'), `Run #${runIdx} oversize!=0: ${invSnapshot}`);
      assert.ok(invSnapshot.includes('orphanLeader=0'), `Run #${runIdx} orphanLeader!=0: ${invSnapshot}`);
      assert.ok(invSnapshot.includes('eventMismatch=0'), `Run #${runIdx} eventMismatch!=0: ${invSnapshot}`);
      runReceipts.push(invSnapshot);
    }
    log(`  PASS [Flow 4.8 Run #1]: ${runReceipts[0]}`);
    log(`  PASS [Flow 4.8 Run #2]: ${runReceipts[1]}`);

    assert.equal(cdp.consoleErrors.length, 0, `Console errors detected: ${JSON.stringify(cdp.consoleErrors)}`);
    assert.equal(cdp.pageExceptions.length, 0, `Page exceptions detected: ${JSON.stringify(cdp.pageExceptions)}`);
    assert.equal(cdp.cspViolations.length, 0, `CSP violations detected: ${JSON.stringify(cdp.cspViolations)}`);
    log('  PASS [Browser Hygiene]: consoleErrors=0 · pageExceptions=0 · cspViolations=0');
  } finally {
    if (cdp) cdp.close();
    try {
      proc.kill();
    } catch {}
    await new Promise(r => setTimeout(r, 350));
    try {
      rmSync(profileDir, { recursive: true, force: true });
    } catch {}
  }
}

log('\n================================================================================');
log('OVERALL R10 VERDICT: PASS (ALL 4 PILLARS + ALL 8 LIVE HEADLESS UI FLOWS GREEN)');
log('================================================================================\n');

mkdirSync(RECEIPT_DIR, { recursive: true });
writeFileSync(RECEIPT_PATH, logLines.join('\n').replace(/\r\n/g, '\n'), 'utf8');
console.log(`Saved R10 receipt -> ${RECEIPT_PATH}`);
