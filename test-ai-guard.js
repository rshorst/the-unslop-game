// Reproduces the live "stuck at the draft->relay handoff" bug.
// A player opens the AI machine during the draft wait (a documented mid-game feature).
// The facilitator then starts the relay. Because client onmessage does `if(!ai) render()`,
// the player's window never re-renders to the relay screen — it stays frozen.
const fs = require('fs');
const path = require('path');
const WebSocket = require('ws');
const { JSDOM } = require('jsdom');

const PORT = 3111;
const URL = 'ws://localhost:' + PORT;
const BASE = 'http://localhost:' + PORT + '/';
const html = fs.readFileSync(path.join(__dirname, 'public', 'index.html'), 'utf8');
const appjs = fs.readFileSync(path.join(__dirname, 'public', 'app.js'), 'utf8');

let failures = 0;
function assert(c, m) { console.log((c ? '  ✓ ' : '  ✗ FAIL: ') + m); if (!c) failures++; }
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

function makeTab(label) {
  const dom = new JSDOM(html, { runScripts: 'outside-only', pretendToBeVisual: true, url: BASE });
  const { window } = dom;
  window.__label = label;
  class MockWebSocket {
    constructor() {
      this.readyState = 0;
      const real = new WebSocket(URL);
      this._real = real;
      real.on('open', () => { this.readyState = 1; if (this.onopen) this.onopen(); });
      real.on('message', (d) => { if (this.onmessage) this.onmessage({ data: d.toString() }); });
      real.on('close', () => { this.readyState = 3; if (this.onclose) this.onclose(); });
    }
    send(s) { if (this._real.readyState === 1) this._real.send(s); }
    close() { this._real.close(); }
  }
  window.WebSocket = MockWebSocket;
  // proxy relative fetch() to the live server so the AI machine can open
  window.fetch = (url, opts) => globalThis.fetch(BASE + String(url).replace(/^\//, ''), opts);
  window.eval(appjs);
  return { window, txt: () => window.document.getElementById('app').textContent };
}

(async () => {
  const fac = new WebSocket(URL);
  let facState = null, code = null;
  fac.on('message', (d) => { const m = JSON.parse(d); if (m.type === 'joined') code = m.code; if (m.type === 'state') facState = m; });
  await new Promise((r) => fac.on('open', r));
  fac.send(JSON.stringify({ type: 'create', name: 'Rachel' }));
  await wait(250);

  const tab = makeTab('P1');
  await wait(100);
  tab.window.document.getElementById('jcode').value = code;
  tab.window.document.getElementById('jname').value = 'P1';
  tab.window.__join();
  await wait(300);

  fac.send(JSON.stringify({ type: 'setAct', act: 1 }));
  fac.send(JSON.stringify({ type: 'startDraft' }));
  await wait(300);
  assert(/Your draft/.test(tab.txt()), 'P1 on draft screen');

  // Player opens the AI machine during the draft wait (documented mid-game feature)
  console.log('\n[P1 opens the AI machine mid-draft]');
  tab.window.__aiMode();
  await wait(400);
  assert(/AI machine/.test(tab.txt()), 'P1 now viewing the AI machine');

  // Facilitator advances to the relay
  console.log('\n[facilitator starts the relay]');
  fac.send(JSON.stringify({ type: 'startRelay' }));
  await wait(400);

  console.log('\n[expectation] once the facilitator advances the phase, the player should NOT be stranded:');
  const txt = tab.txt();
  const onRelay = /The sheet in front of you|started as yours|started by/.test(txt);
  assert(onRelay, 'P1 window followed the facilitator to the relay screen');

  console.log('\n' + (failures ? failures + ' CHECK(S) FAILED (bug reproduced)' : 'ALL CHECKS PASSED'));
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error('TEST ERROR', e); process.exit(2); });
