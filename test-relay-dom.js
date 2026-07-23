// End-to-end DOM test. Three "browser tabs" (jsdom) each run the REAL public/app.js,
// bridged to the running server over real WebSockets. We drive a draft round then the
// facilitator starts the relay, and assert each tab's DOM actually flips to the relay
// screen. A thrown error inside the client render path is captured, not swallowed.
const fs = require('fs');
const path = require('path');
const WebSocket = require('ws');
const { JSDOM } = require('jsdom');

const PORT = 3111;
const URL = 'ws://localhost:' + PORT;
const html = fs.readFileSync(path.join(__dirname, 'public', 'index.html'), 'utf8');
const appjs = fs.readFileSync(path.join(__dirname, 'public', 'app.js'), 'utf8');

let failures = 0;
const renderErrors = [];
function assert(cond, msg) { console.log((cond ? '  ✓ ' : '  ✗ FAIL: ') + msg); if (!cond) failures++; }
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// A browser tab: jsdom running the real app.js. Its WebSocket is bridged to a real
// `ws` connection so the tab genuinely plays against the live server.
function makeTab(label) {
  const dom = new JSDOM(html, { runScripts: 'outside-only', pretendToBeVisual: true, url: 'http://localhost:' + PORT });
  const { window } = dom;
  window.__label = label;
  const bridged = [];
  class MockWebSocket {
    constructor() {
      this.readyState = 0;
      const real = new WebSocket(URL);
      this._real = real;
      bridged.push(this);
      real.on('open', () => { this.readyState = 1; if (this.onopen) this.onopen(); });
      real.on('message', (d) => {
        if (!this.onmessage) return;
        try { this.onmessage({ data: d.toString() }); }
        catch (e) { renderErrors.push('[' + label + '] render threw: ' + (e && e.stack || e)); }
      });
      real.on('close', () => { this.readyState = 3; if (this.onclose) this.onclose(); });
    }
    send(s) { if (this._real.readyState === 1) this._real.send(s); }
    close() { this._real.close(); }
  }
  window.WebSocket = MockWebSocket;
  window.onerror = (m) => { renderErrors.push('[' + label + '] window.onerror: ' + m); };
  // run the real client (outside-only mode: eval in the window context)
  try { window.eval(appjs); }
  catch (e) { renderErrors.push('[' + label + '] boot threw: ' + (e && e.stack || e)); }
  return { dom, window, tabText: () => window.document.getElementById('app').textContent };
}

(async () => {
  // Facilitator drives control over a plain ws client.
  const fac = new WebSocket(URL);
  let facState = null, facPid = null, code = null;
  fac.on('message', (d) => { const m = JSON.parse(d); if (m.type === 'joined') { facPid = m.playerId; code = m.code; } if (m.type === 'state') facState = m; });
  await new Promise((r) => fac.on('open', r));
  fac.send(JSON.stringify({ type: 'create', name: 'Rachel' }));
  await wait(250);
  console.log('room', code);

  // Three player tabs join via the real UI path (__join reads the DOM form).
  const tabs = [];
  for (let i = 0; i < 3; i++) {
    const t = makeTab('P' + (i + 1));
    await wait(80); // let app boot -> landing()
    t.window.document.getElementById('jcode').value = code;
    t.window.document.getElementById('jname').value = 'P' + (i + 1);
    t.window.__join();
    tabs.push(t);
    await wait(120);
  }
  await wait(300);
  console.log('players in room:', facState.room.players.length);

  // Draft round.
  fac.send(JSON.stringify({ type: 'setAct', act: 1 }));
  fac.send(JSON.stringify({ type: 'startDraft' }));
  await wait(300);

  console.log('\n[draft] each tab DOM shows the draft screen:');
  tabs.forEach((t) => assert(/Your draft/.test(t.tabText()), t.window.__label + ' DOM on draft screen'));

  // Each player types a draft and submits through the real button handler.
  tabs.forEach((t) => {
    const ta = t.window.document.getElementById('draft');
    ta.value = 'Draft by ' + t.window.__label + '. AI in schools.';
    t.window.__submitDraft();
  });
  await wait(300);

  // ---- the transition under test ----
  console.log('\n[relay handoff] facilitator starts the relay...');
  fac.send(JSON.stringify({ type: 'startRelay' }));
  await wait(400);

  console.log('\n[relay] each PLAYER tab DOM must flip to the relay screen:');
  tabs.forEach((t) => {
    const txt = t.tabText();
    assert(/The sheet in front of you|started as yours|started by/.test(txt), t.window.__label + ' DOM shows the relay sheet');
    assert(!/Your draft — 2 to 5 sentences/.test(txt), t.window.__label + ' DOM no longer showing the draft prompt');
  });

  if (renderErrors.length) {
    console.log('\nRENDER ERRORS CAPTURED:');
    renderErrors.forEach((e) => console.log('  ! ' + e));
    failures += renderErrors.length;
  }

  console.log('\n' + (failures ? failures + ' CHECK(S) FAILED' : 'ALL DOM CHECKS PASSED'));
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error('TEST ERROR', e); process.exit(2); });
