import test from 'node:test';
import assert from 'node:assert/strict';
import { planGoal } from '../src/goal-planner.mjs';
import { evaluateWildcardFrontier, contextGlueOrExplain } from '../src/synchronicity-solvers.mjs';
import { startServer, issueToken } from '../src/server.mjs';

const good = { support: true, refute: false };
const unknown = { support: false, refute: false };
const secret = 'synchronicity-r5-test-secret-key-minimum-32b';

test('R5_01 | backward-slack EDD scheduling solves urgent-second task contention that breaks greedy order', () => {
  const goal = {
    id: 'edd-check',
    startMin: 0,
    deadlineMin: 200,
    tasks: [
      { id: 'loose-doc', skill: 'backend', durationMin: 60, deadlineMin: 200 },
      { id: 'urgent-hotfix', skill: 'backend', durationMin: 60, deadlineMin: 70 }
    ]
  };
  const people = [{ id: 'solo-dev', abilities: { backend: good }, windows: [{ start: 0, end: 200 }], consent: true }];
  const res = planGoal({ goal, people });
  assert.equal(res.status, 'FEASIBLE_WITNESS');
  const hotfix = res.witness.assignments.find(a => a.taskId === 'urgent-hotfix');
  assert.equal(hotfix.startMin, 0);
  assert.equal(hotfix.endMin, 60);
});

test('R5_02 | Wildcard Omega separates EXISTS_FORALL_ROBUST (zero questions) from FORALL_EXISTS_CONTINGENT (VOI question)', () => {
  const goal = { id: 'omega', startMin: 0, deadlineMin: 120, tasks: [{ id: 'ui', skill: 'frontend', durationMin: 60 }] };
  const robust = evaluateWildcardFrontier({
    goal,
    people: [
      { id: 'a', abilities: { frontend: unknown }, windows: [{ start: 0, end: 120 }], consent: true },
      { id: 'b', abilities: { frontend: good }, windows: [{ start: 0, end: 120 }], consent: true }
    ]
  });
  assert.equal(robust.actionStable, true);
  assert.equal(robust.quantifierStatus, 'EXISTS_FORALL_ROBUST');
  assert.equal(robust.voiQuestion, null);

  const contingent = evaluateWildcardFrontier({
    goal,
    people: [{ id: 'a', abilities: { frontend: unknown }, windows: [{ start: 0, end: 120 }], consent: true }]
  });
  assert.equal(contingent.actionStable, false);
  assert.equal(contingent.voiQuestion?.personId, 'a');
  assert.equal(contingent.voiQuestion?.skill, 'frontend');
});

test('R5_03 | Hall capacity deficit produces INFEASIBLE_WITHIN_SCOPE classification and zero-displacement repair', () => {
  const goal = {
    id: 'hall',
    startMin: 0,
    deadlineMin: 100,
    tasks: [
      { id: 'api', skill: 'backend', durationMin: 100, deadlineMin: 100 },
      { id: 'db', skill: 'database', durationMin: 100, deadlineMin: 100 }
    ]
  };
  const people = [
    { id: 'aurora', abilities: { backend: good, database: good }, windows: [{ start: 0, end: 100 }], consent: true },
    { id: 'kai', abilities: { frontend: good }, windows: [{ start: 0, end: 100 }], consent: true }
  ];
  const res = planGoal({ goal, people });
  assert.equal(res.classification, 'INFEASIBLE_WITHIN_SCOPE');
  assert.ok(res.repairs.some(r => r.kind === 'HALL_CAPACITY_CONTENTION_REPAIR' && r.displacedCommittedMembers === 0));
});

test('R5_04 | contextGlueOrExplain merges clean records and isolates overlapping person-interval obstructions', () => {
  const clean = contextGlueOrExplain(
    [{ id: 'n1', actorId: 'a', epoch: 1, digest: 'h1' }],
    [{ id: 'n2', actorId: 'b', epoch: 1, digest: 'h2' }]
  );
  assert.equal(clean.status, 'GLUED_CONSISTENT');

  const clash = contextGlueOrExplain(
    [{ id: 's1', personId: 'aurora', taskId: 'api', startMin: 0, endMin: 90, epoch: 1, digest: 'x1', actorId: 'aurora' }],
    [{ id: 's2', personId: 'aurora', taskId: 'db', startMin: 45, endMin: 120, epoch: 1, digest: 'x2', actorId: 'kai' }]
  );
  assert.equal(clash.status, 'OBSTRUCTION_WITNESS');
  assert.equal(clash.obstructions.length, 1);
});

test('R5_05..12 | Full HTTP lifecycle: scrypt auth, recommendations, roster, leader transfer, audit, peer notes, WAN-drop relay & 50-way race', async () => {
  const app = startServer({ secret });
  const addr = await app.listen();
  const base = `http://127.0.0.1:${addr.port}`;

  const call = async (method, path, body, tok) => {
    const headers = { 'content-type': 'application/json' };
    if (tok) headers.authorization = 'Bearer ' + tok;
    const r = await fetch(base + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
    return { status: r.status, body: await r.json() };
  };

  try {
    // Account registration, login, wrong password, and logout revocation
    const reg = await call('POST', '/api/auth/register', { username: 'melvin', password: 'StrongPassword123!', timezone: 'UTC-6' });
    assert.equal(reg.status, 201);
    assert.ok(reg.body.token);

    const badLogin = await call('POST', '/api/auth/login', { username: 'melvin', password: 'wrong' });
    assert.equal(badLogin.status, 401);

    const login = await call('POST', '/api/auth/login', { username: 'melvin', password: 'StrongPassword123!' });
    assert.equal(login.status, 200);

    // Event creation + team + roster detail + complementary async UTC baton-pass recommendation
    const ev = await call('POST', '/api/events', { eventId: 'h4h-live', maxSize: 4 }, login.body.token);
    assert.equal(ev.status, 201);

    const rec = await call('POST', '/api/recommendations', {
      goal: {
        id: 'ship',
        startMin: 0,
        deadlineMin: 360,
        tasks: [
          { id: 'api', skill: 'backend', durationMin: 120 },
          { id: 'deploy', skill: 'devops', durationMin: 60, after: ['api'] }
        ]
      },
      teamPeople: [{ id: 'melvin', timezone: 'UTC-6', abilities: { backend: good }, windows: [{ start: 0, end: 150 }], consent: true }],
      candidates: [
        { id: 'ananya', timezone: 'UTC+5:30', abilities: { devops: good }, windows: [{ start: 180, end: 360 }], consent: true },
        { id: 'idle-peer', timezone: 'UTC-6', abilities: { frontend: good }, windows: [{ start: 0, end: 150 }], consent: true }
      ]
    }, login.body.token);
    assert.equal(rec.status, 200);
    assert.equal(rec.body.recommendations[0].candidateId, 'ananya');
    assert.equal(rec.body.recommendations[0].restoresFeasibility, true);
    assert.equal(rec.body.recommendations[0].asyncBatonPass, true);

    // Team creation, WAN-dropped claimant relayed via peer, and idempotent direct retry
    assert.equal((await call('POST', '/api/teams', { eventId: 'h4h-live', teamId: 'crew-1' }, login.body.token)).status, 201);
    const inv = await call('POST', '/api/invitations', { eventId: 'h4h-live', teamId: 'crew-1', expiresAt: Date.now() + 60000 }, login.body.token);
    assert.equal(inv.status, 201);

    const priyaTok = issueToken('priya', secret);
    const relayTok = issueToken('relay-node', secret);
    const relayed = await call('POST', '/api/peer/relay-claim', {
      claimantToken: priyaTok,
      eventId: 'h4h-live',
      teamId: 'crew-1',
      code: inv.body.code,
      opId: 'priya-wan-drop-op1'
    }, relayTok);
    assert.equal(relayed.status, 200);
    assert.equal(relayed.body.actorId, 'priya');
    assert.equal(relayed.body.relayedBy, 'relay-node');
    assert.equal(relayed.body.replayed, false);

    // Direct retry from Priya after WAN returns recovers exact commit without double-admission
    const directRetry = await call('POST', '/api/invitations/claim', {
      eventId: 'h4h-live',
      teamId: 'crew-1',
      code: inv.body.code,
      opId: 'priya-wan-drop-op1'
    }, priyaTok);
    assert.equal(directRetry.status, 200);
    assert.equal(directRetry.body.replayed, true);

    // Team roster & explicit leader transfer
    const rosterBefore = await call('GET', '/api/events/h4h-live/teams/crew-1');
    assert.equal(rosterBefore.status, 200);
    assert.equal(rosterBefore.body.members.length, 2);

    const xferDenied = await call('POST', '/api/teams/transfer', { eventId: 'h4h-live', teamId: 'crew-1', newLeaderId: 'priya' }, priyaTok);
    assert.equal(xferDenied.status, 403);

    const xferOk = await call('POST', '/api/teams/transfer', { eventId: 'h4h-live', teamId: 'crew-1', newLeaderId: 'priya' }, login.body.token);
    assert.equal(xferOk.status, 200);
    assert.equal(xferOk.body.leader, 'priya');

    // Encrypted Layer-B peer note + audit history
    const note = await call('POST', '/api/peer/notes', { eventId: 'h4h-live', opId: 'n-1', text: 'Encrypted handoff ready' }, priyaTok);
    assert.equal(note.status, 201);
    assert.equal(note.body.transportStatus, 'PEER_ARTIFACT_ONLY');

    const audit = await call('GET', '/api/events/h4h-live/audit', null, priyaTok);
    assert.equal(audit.status, 200);
    assert.ok(audit.body.audit.some(a => a.action === 'PEER_RELAYED_ADMISSION'));
    assert.ok(audit.body.audit.some(a => a.action === 'LEADER_TRANSFERRED'));

    // Demo 50-way race endpoint check
    const race = await call('POST', '/api/demo/race-50', {}, priyaTok);
    assert.equal(race.status, 200);
    assert.equal(race.body.committed, 1);
    assert.equal(race.body.rejected, 49);

    // Token logout revocation
    assert.equal((await call('POST', '/api/auth/logout', {}, login.body.token)).status, 200);
    assert.equal((await call('GET', '/api/events/h4h-live/audit', null, login.body.token)).status, 401);
  } finally {
    await app.close();
  }
});
