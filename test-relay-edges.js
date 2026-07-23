// Edge cases around the draft->relay handoff that a live session hits:
//  (A) a player who never submitted a draft
//  (B) a player whose socket dropped during draft and reconnects after relay started
const WebSocket = require('ws');
const URL = 'ws://localhost:3111';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
let failures = 0;
function assert(c, m) { console.log((c ? '  ✓ ' : '  ✗ FAIL: ') + m); if (!c) failures++; }

function mkClient(label) {
  const o = { label, ws: null, pid: null, state: null, isFac: false, count: 0 };
  function attach(ws) {
    ws.on('message', (d) => { const m = JSON.parse(d); if (m.type === 'joined') { o.pid = m.playerId; o.isFac = m.isFacilitator; } if (m.type === 'state') { o.state = m; o.count++; } });
  }
  o.connect = () => new Promise((res) => { o.ws = new WebSocket(URL); attach(o.ws); o.ws.on('open', res); });
  o.send = (obj) => o.ws.send(JSON.stringify(obj));
  return o;
}

(async () => {
  const fac = mkClient('FAC'); await fac.connect();
  fac.send({ type: 'create', name: 'Rachel' });
  await wait(200);
  const code = fac.state.room.code;

  const p1 = mkClient('P1-normal'); const p2 = mkClient('P2-nosubmit'); const p3 = mkClient('P3-drops');
  for (const c of [p1, p2, p3]) { await c.connect(); c.send({ type: 'join', code, name: c.label }); await wait(120); }
  await wait(200);

  fac.send({ type: 'setAct', act: 1 });
  fac.send({ type: 'startDraft' });
  await wait(250);

  // p1 submits, p2 does NOT submit, p3 submits then drops its socket.
  p1.send({ type: 'submitDraft', content: 'p1 draft' });
  p3.send({ type: 'submitDraft', content: 'p3 draft' });
  await wait(200);

  console.log('\n(B) p3 drops its socket during draft, before relay starts');
  p3.ws.close();
  await wait(200);

  console.log('\n[handoff] facilitator starts relay (p2 never submitted, p3 offline)');
  fac.send({ type: 'startRelay' });
  await wait(300);

  assert(p1.state.room.phase === 'relay' && !!p1.state.mySheet, 'P1 (submitted) got relay + sheet');
  assert(p2.state.room.phase === 'relay' && !!p2.state.mySheet, 'P2 (never submitted) got relay + sheet');

  console.log('\n[reconnect] p3 reconnects and rejoins with saved pid');
  const savedPid = p3.pid;
  await p3.connect();
  p3.count = 0;
  p3.send({ type: 'rejoin', code, playerId: savedPid });
  await wait(300);
  assert(p3.count > 0, 'P3 received a state after rejoin');
  assert(p3.state && p3.state.room.phase === 'relay', 'P3 rejoined into relay phase (not stuck on draft)');
  assert(p3.state && !!p3.state.mySheet, 'P3 has a sheet after rejoin');

  console.log('\n' + (failures ? failures + ' CHECK(S) FAILED' : 'ALL EDGE CHECKS PASSED'));
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error('TEST ERROR', e); process.exit(2); });
