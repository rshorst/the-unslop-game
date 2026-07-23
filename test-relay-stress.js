// Hunt for a NON-AI-machine trigger of the "players stuck on the draft prompt" bug.
// Real app.js in jsdom tabs, bridged to the live server. Scenarios at the draft->relay
// transition: a late joiner (joined mid-draft), HTML/emoji content, and a submit->relay
// race. Any render throw is captured; each player's DOM must leave the draft screen.
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
const renderErrors = [];
function assert(c, m) { console.log((c ? '  ✓ ' : '  ✗ FAIL: ') + m); if (!c) failures++; }
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

function makeTab(label) {
  const dom = new JSDOM(html, { runScripts: 'outside-only', pretendToBeVisual: true, url: BASE });
  const { window } = dom;
  window.__label = label;
  class MockWebSocket {
    constructor() {
      this.readyState = 0;
      const real = new WebSocket(URL); this._real = real;
      real.on('open', () => { this.readyState = 1; if (this.onopen) this.onopen(); });
      real.on('message', (d) => { if (!this.onmessage) return; try { this.onmessage({ data: d.toString() }); } catch (e) { renderErrors.push('[' + label + '] render threw: ' + (e && e.stack || e)); } });
      real.on('close', () => { this.readyState = 3; if (this.onclose) this.onclose(); });
    }
    send(s) { if (this._real.readyState === 1) this._real.send(s); }
    close() { this._real.close(); }
  }
  window.WebSocket = MockWebSocket;
  window.fetch = (u, o) => globalThis.fetch(BASE + String(u).replace(/^\//, ''), o);
  window.onerror = (m) => renderErrors.push('[' + label + '] window.onerror: ' + m);
  window.eval(appjs);
  return { window, txt: () => window.document.getElementById('app').textContent, join: (code, name) => { window.document.getElementById('jcode').value = code; window.document.getElementById('jname').value = name; window.__join(); } };
}

const onDraft = (t) => /Your draft — 2 to 5 sentences/.test(t.txt());
const onRelay = (t) => /The sheet in front of you|started as yours|started by|Waiting for a sheet/.test(t.txt());

(async () => {
  const fac = new WebSocket(URL);
  let code = null, facState = null;
  fac.on('message', (d) => { const m = JSON.parse(d); if (m.type === 'joined') code = m.code; if (m.type === 'state') facState = m; });
  await new Promise((r) => fac.on('open', r));
  fac.send(JSON.stringify({ type: 'create', name: 'Rachel' }));
  await wait(250);

  // Two players join in the lobby.
  const p1 = makeTab('P1'); await wait(80); p1.join(code, 'P1'); await wait(150);
  const p2 = makeTab('P2'); await wait(80); p2.join(code, 'P2'); await wait(150);

  fac.send(JSON.stringify({ type: 'setAct', act: 1 }));
  fac.send(JSON.stringify({ type: 'startDraft' }));
  await wait(300);

  // P3 JOINS DURING THE DRAFT — server pushes them to seatOrder but beginDraft
  // already built sheets/holder without them.
  const p3 = makeTab('P3-late'); await wait(80); p3.join(code, 'P3-late'); await wait(250);

  const tabs = [p1, p2, p3];
  console.log('[draft] states:');
  tabs.forEach((t) => console.log('  ' + t.window.__label + ': ' + (onDraft(t) ? 'draft' : onRelay(t) ? 'relay?' : 'other')));

  // HTML/emoji + a normal draft; P3 (no sheet) can't really submit.
  p1.window.document.getElementById('draft').value = '<script>alert(1)</script> — "quotes" & <b>bold</b> 🤖🔥';
  p1.window.__submitDraft();
  p2.window.document.getElementById('draft').value = 'plain draft';
  p2.window.__submitDraft();
  await wait(250);

  // Race: start the relay immediately after a submit.
  console.log('\n[handoff] start relay immediately after submits (race)');
  fac.send(JSON.stringify({ type: 'startRelay' }));
  await wait(400);

  console.log('\n[relay] every player tab must leave the draft prompt:');
  tabs.forEach((t) => {
    assert(!onDraft(t), t.window.__label + ' left the draft screen');
    assert(onRelay(t), t.window.__label + ' shows a relay screen');
  });

  // Now do a second draft->relay cycle (Act 2) with the late joiner now seated,
  // to confirm the transition is reliable on repeat.
  fac.send(JSON.stringify({ type: 'startClosing' })); await wait(150);
  fac.send(JSON.stringify({ type: 'spotlight' })); await wait(150);
  fac.send(JSON.stringify({ type: 'setAct', act: 2 })); fac.send(JSON.stringify({ type: 'startDraft' })); await wait(300);
  console.log('\n[Act 2 draft] all on draft:');
  tabs.forEach((t) => assert(onDraft(t), t.window.__label + ' on Act 2 draft'));
  tabs.forEach((t, i) => { const ta = t.window.document.getElementById('draft'); if (ta) { ta.value = 'act2 ' + t.window.__label; t.window.__submitDraft(); } });
  await wait(200);
  fac.send(JSON.stringify({ type: 'startRelay' })); await wait(400);
  console.log('\n[Act 2 relay] all left draft:');
  tabs.forEach((t) => assert(!onDraft(t) && onRelay(t), t.window.__label + ' flipped to Act 2 relay'));

  if (renderErrors.length) { console.log('\nRENDER ERRORS:'); renderErrors.forEach((e) => console.log('  ! ' + e)); failures += renderErrors.length; }
  console.log('\n' + (failures ? failures + ' CHECK(S) FAILED' : 'ALL STRESS CHECKS PASSED — no non-AI-machine freeze found'));
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error('TEST ERROR', e); process.exit(2); });
