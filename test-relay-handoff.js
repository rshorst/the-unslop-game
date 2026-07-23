// Reproduction test: draft -> relay handoff must update EVERY player's client.
// One facilitator + 3 players over real WebSockets. Each submits a draft, the
// facilitator starts the relay, and we assert every player's most recent `state`
// message flips to the relay screen with a sheet in front of them.
const WebSocket = require('ws');
const URL = 'ws://localhost:3111';

function client(label) {
  const ws = new WebSocket(URL);
  ws.label = label;
  ws.pid = null;
  ws.isFac = false;
  ws.state = null;
  ws.stateCount = 0;
  ws.on('message', (d) => {
    const m = JSON.parse(d);
    if (m.type === 'joined') { ws.pid = m.playerId; ws.isFac = m.isFacilitator; }
    if (m.type === 'state') { ws.state = m; ws.stateCount++; }
    if (m.type === 'error') console.log('ERR[' + ws.label + ']', m.message);
  });
  return ws;
}
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const open = (ws) => new Promise((r) => ws.on('open', r));

let failures = 0;
function assert(cond, msg) {
  console.log((cond ? '  ✓ ' : '  ✗ FAIL: ') + msg);
  if (!cond) failures++;
}

(async () => {
  const fac = client('FAC');
  await open(fac);
  fac.send(JSON.stringify({ type: 'create', name: 'Rachel' }));
  await wait(200);
  const code = fac.state.room.code;
  console.log('room', code);

  const players = [];
  for (let i = 0; i < 3; i++) {
    const c = client('P' + (i + 1));
    await open(c);
    c.send(JSON.stringify({ type: 'join', code, name: 'P' + (i + 1) }));
    players.push(c);
  }
  await wait(300);
  const all = [fac, ...players];
  console.log('players in room:', fac.state.room.players.length);

  // ---- draft round ----
  fac.send(JSON.stringify({ type: 'setAct', act: 1 }));
  fac.send(JSON.stringify({ type: 'startDraft' }));
  await wait(200);

  console.log('\n[draft] every client should be on the draft screen:');
  all.forEach((c) => assert(c.state && c.state.room.phase === 'draft', c.label + ' phase=draft (got ' + (c.state && c.state.room.phase) + ')'));

  all.forEach((c, i) => c.send(JSON.stringify({ type: 'submitDraft', content: 'Draft by ' + c.label + '. AI in schools.' })));
  await wait(200);

  // Snapshot each player's state count right before the relay starts, so we can
  // verify they actually RECEIVE a fresh state message at the handoff.
  const before = all.map((c) => ({ label: c.label, count: c.stateCount, phase: c.state.room.phase }));

  // ---- the transition under test ----
  fac.send(JSON.stringify({ type: 'startRelay' }));
  await wait(300);

  console.log('\n[relay handoff] every client must receive a new state AND flip to relay:');
  all.forEach((c, i) => {
    const b = before[i];
    assert(c.stateCount > b.count, c.label + ' received a new state message at handoff (' + b.count + ' -> ' + c.stateCount + ')');
    assert(c.state.room.phase === 'relay', c.label + ' phase=relay (got ' + c.state.room.phase + ')');
  });

  console.log('\n[relay sheet] every PLAYER must have a sheet in front of them (the relay screen):');
  players.forEach((c) => {
    const s = c.state.mySheet;
    assert(!!s, c.label + ' has mySheet after relay start');
    if (s) assert(typeof s.content === 'string', c.label + ' sheet has content field');
  });
  // facilitator is also seated, should also hold a sheet
  assert(!!fac.state.mySheet, 'FAC has mySheet after relay start');

  console.log('\n' + (failures ? failures + ' CHECK(S) FAILED' : 'ALL CHECKS PASSED'));
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error('TEST ERROR', e); process.exit(2); });
